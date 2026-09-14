"""Upload, biblioteca e streaming de áudio."""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from verso_audio.probe import probe
from verso_core.config import get_settings
from verso_core.db import get_session
from verso_core.images import ImageError, prepare_background
from verso_core.models import (
    JobKind,
    JobState,
    LyricsSource,
    LyricsVersion,
    ProcessingJob,
    Track,
    TrackState,
)
from verso_core.schemas import (
    JobOut,
    RenderRequest,
    TrackCreated,
    TrackDetail,
    TrackOut,
    TrackUpdate,
    TranscribeRequest,
)
from verso_core.storage import LocalStorage, sha256_of
from verso_lyrics import LrcError, parse_lrc

from verso_api.queue import get_pool
from verso_api.versions import create_version

router = APIRouter(prefix="/tracks", tags=["faixas"])
settings = get_settings()

ACCEPTED_SUFFIXES = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus"}
ORIGENS_LETRA = ("asr", "lrc", "musixmatch")
# A imagem é validada pelo conteúdo, não pela extensão — ver verso_core.images.
# O teto é generoso porque foto de câmera passa fácil de 10 MB; o arquivo é
# reduzido no momento de gravar.
MAX_IMAGE_BYTES = 40 * 1024 * 1024


async def _enqueue(
    track_id: uuid.UUID, session: AsyncSession, model: str | None = None
) -> uuid.UUID:
    job = ProcessingJob(track_id=track_id, kind=JobKind.transcribe)
    session.add(job)
    await session.flush()
    pool = await get_pool()
    await pool.enqueue_job("transcribe_track", str(track_id), str(job.id), model)
    return job.id


@router.post("", response_model=TrackCreated, status_code=status.HTTP_202_ACCEPTED)
async def upload_track(
    file: UploadFile = File(...),
    source: str = Form("asr"),
    lrc_file: UploadFile | None = File(None),
    session: AsyncSession = Depends(get_session),
) -> TrackCreated:
    """Recebe o arquivo e devolve na hora — transcrever leva minutos.

    `source` escolhe a origem da letra: `asr` (transcrição, padrão), `lrc`
    (arquivo .lrc enviado junto em `lrc_file` — a faixa já volta pronta) ou
    `musixmatch` (só salva; a busca acontece em `POST .../lyrics/musixmatch`).
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ACCEPTED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Formato {suffix or 'desconhecido'} não é aceito. "
                f"Use um destes: {', '.join(sorted(ACCEPTED_SUFFIXES))}."
            ),
        )
    if source not in ORIGENS_LETRA:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Origem da letra desconhecida: {source!r}. "
                "Use uma destas: asr, lrc, musixmatch."
            ),
        )

    digest = sha256_of(file.file)

    existing = await session.scalar(select(Track).where(Track.sha256 == digest))
    if existing is not None:
        # Mesmo arquivo já processado: reaproveita em vez de gastar minutos de novo.
        return TrackCreated(track_id=existing.id, job_id=None, duplicate=True)

    track_id = uuid.uuid4()
    key = f"originals/{track_id}{suffix}"
    storage = LocalStorage(settings.verso_storage_dir)
    saved = storage.save(key, file.file)
    size = saved.stat().st_size

    if size > settings.max_upload_bytes:
        storage.delete(key)
        raise HTTPException(
            status_code=413,
            detail=f"O arquivo passa do limite de {settings.verso_max_upload_mb} MB.",
        )

    meta = probe(saved)
    track = Track(
        id=track_id,
        sha256=digest,
        title=meta.title or Path(file.filename or "sem título").stem,
        artist=meta.artist,
        album=meta.album,
        duration_ms=meta.duration_ms,
        original_key=key,
        mime_type=file.content_type or "audio/mpeg",
        size_bytes=size,
        state=TrackState.uploaded,
    )
    session.add(track)
    await session.flush()

    if source == "asr":
        job_id = await _enqueue(track_id, session)
    elif source == "lrc":
        if lrc_file is None:
            raise HTTPException(
                status_code=415, detail="Escolha a origem .lrc sem enviar o arquivo .lrc."
            )
        if Path(lrc_file.filename or "").suffix.lower() != ".lrc":
            raise HTTPException(
                status_code=415, detail="O arquivo de letra precisa ter extensão .lrc."
            )
        try:
            lines = parse_lrc((await lrc_file.read()).decode("utf-8", errors="replace"))
        except LrcError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        await create_version(session, track_id, lines, LyricsSource.imported, None, None)
        track.state = TrackState.ready
        job_id = None
    else:  # musixmatch: a busca vem numa chamada separada, depois da confirmação
        job_id = None

    await session.commit()
    return TrackCreated(track_id=track_id, job_id=job_id, duplicate=False)


@router.get("", response_model=list[TrackOut])
async def list_tracks(session: AsyncSession = Depends(get_session)) -> list[Track]:
    result = await session.scalars(select(Track).order_by(Track.created_at.desc()))
    return list(result)


@router.get("/{track_id}", response_model=TrackDetail)
async def get_track(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> TrackDetail:
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    active = await session.scalar(
        select(LyricsVersion)
        .where(LyricsVersion.track_id == track_id, LyricsVersion.is_active.is_(True))
        .options(selectinload(LyricsVersion.lines))
    )
    latest_job = await session.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.track_id == track_id)
        .order_by(ProcessingJob.created_at.desc())
        .limit(1)
    )

    detail = TrackDetail.model_validate(track)
    detail.has_vocals_stem = track.vocals_key is not None
    detail.has_background = track.background_key is not None
    if active is not None:
        from verso_core.schemas import LyricsVersionOut

        detail.active_lyrics = LyricsVersionOut.model_validate(active)
    if latest_job is not None:
        from verso_core.schemas import JobOut

        detail.latest_job = JobOut.model_validate(latest_job)
    return detail


@router.patch("/{track_id}", response_model=TrackOut)
async def update_track(
    track_id: uuid.UUID,
    payload: TrackUpdate,
    session: AsyncSession = Depends(get_session),
) -> Track:
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(track, field, value)
    await session.commit()
    return track


@router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_track(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    storage = LocalStorage(settings.verso_storage_dir)
    storage.delete(track.original_key)
    if track.vocals_key:
        storage.delete(track.vocals_key)
    if track.background_key:
        storage.delete(track.background_key)
    for done in await session.scalars(
        select(ProcessingJob).where(
            ProcessingJob.track_id == track_id, ProcessingJob.kind == JobKind.render
        )
    ):
        if done.output_key:
            storage.delete(done.output_key)
    await session.delete(track)
    await session.commit()


@router.post("/{track_id}/transcribe", response_model=TrackCreated, status_code=202)
async def retranscribe(
    track_id: uuid.UUID,
    payload: TranscribeRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> TrackCreated:
    """Reprocessa a faixa, opcionalmente com outro modelo."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    job_id = await _enqueue(track_id, session, payload.model if payload else None)
    await session.commit()
    return TrackCreated(track_id=track_id, job_id=job_id, duplicate=False)


@router.get("/{track_id}/audio")
async def stream_audio(
    track_id: uuid.UUID,
    vocals: bool = False,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve o áudio para a forma de onda. Aceita Range para buscar trechos."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    key = track.vocals_key if (vocals and track.vocals_key) else track.original_key
    path = settings.verso_storage_dir / key
    if not path.exists():
        raise HTTPException(status_code=404, detail="O arquivo de áudio não está mais no disco.")
    return FileResponse(path, media_type="audio/wav" if key.endswith(".wav") else track.mime_type)


@router.put("/{track_id}/background", response_model=TrackDetail)
async def set_background(
    track_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> TrackDetail:
    """Define a imagem de fundo do player para esta faixa."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    file.file.seek(0, os.SEEK_END)
    if file.file.tell() > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"A imagem passa do limite de {MAX_IMAGE_BYTES // (1024 * 1024)} MB.",
        )
    file.file.seek(0)

    try:
        prepared = prepare_background(
            file.file, settings.verso_storage_dir / "backgrounds", str(track_id)
        )
    except ImageError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    key = f"backgrounds/{track_id}{prepared.suffix}"
    previous = track.background_key
    # Trocar de .png para .jpg deixaria o arquivo antigo órfão no disco.
    if previous and previous != key:
        LocalStorage(settings.verso_storage_dir).delete(previous)

    track.background_key = key
    await session.commit()

    detail = TrackDetail.model_validate(track)
    detail.has_vocals_stem = track.vocals_key is not None
    detail.has_background = True
    return detail


@router.delete("/{track_id}/background", status_code=status.HTTP_204_NO_CONTENT)
async def clear_background(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if track.background_key:
        LocalStorage(settings.verso_storage_dir).delete(track.background_key)
        track.background_key = None
        await session.commit()


@router.get("/{track_id}/background")
async def get_background(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> FileResponse:
    track = await session.get(Track, track_id)
    if track is None or not track.background_key:
        raise HTTPException(status_code=404, detail="Esta faixa não tem imagem de fundo.")
    path = settings.verso_storage_dir / track.background_key
    if not path.exists():
        raise HTTPException(status_code=404, detail="A imagem não está mais no disco.")
    return FileResponse(path)


@router.post("/{track_id}/render", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def render_video(
    track_id: uuid.UUID,
    payload: RenderRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> ProcessingJob:
    """Enfileira a montagem do MP4. Responde na hora: renderizar leva minutos."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    resolution = (payload.resolution if payload else None) or "1080p"

    job = ProcessingJob(
        track_id=track_id,
        kind=JobKind.render,
        params={"resolution": resolution},
    )
    session.add(job)
    await session.flush()

    pool = await get_pool()
    await pool.enqueue_job("render_track_video", str(track_id), str(job.id), resolution)
    await session.commit()
    return job


@router.get("/{track_id}/renders", response_model=list[JobOut])
async def list_renders(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> list[ProcessingJob]:
    """Vídeos desta faixa, do mais recente para o mais antigo."""
    result = await session.scalars(
        select(ProcessingJob)
        .where(ProcessingJob.track_id == track_id, ProcessingJob.kind == JobKind.render)
        .order_by(ProcessingJob.created_at.desc())
    )
    return list(result)


@router.get("/{track_id}/renders/{job_id}/file")
async def download_render(
    track_id: uuid.UUID,
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Baixa o MP4 pronto."""
    job = await session.get(ProcessingJob, job_id)
    if job is None or job.track_id != track_id or job.kind != JobKind.render:
        raise HTTPException(status_code=404, detail="Vídeo não encontrado nesta faixa.")
    if job.state != JobState.done or not job.output_key:
        raise HTTPException(status_code=409, detail="Este vídeo ainda não terminou de ser gerado.")

    path = settings.verso_storage_dir / job.output_key
    if not path.exists():
        raise HTTPException(status_code=404, detail="O arquivo do vídeo não está mais no disco.")

    track = await session.get(Track, track_id)
    safe = "".join(c for c in (track.title if track else "verso") if c.isalnum() or c in " -_")
    name = f"{safe.strip() or 'verso'} ({job.params.get('resolution', 'video')}).mp4"
    return FileResponse(path, media_type="video/mp4", filename=name)


@router.get("/{track_id}/stats")
async def track_stats(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    """Quantas palavras merecem um olhar humano primeiro."""
    active = await session.scalar(
        select(LyricsVersion)
        .where(LyricsVersion.track_id == track_id, LyricsVersion.is_active.is_(True))
        .options(selectinload(LyricsVersion.lines))
    )
    if active is None:
        return {"lines": 0, "words": 0, "low_confidence": 0}

    words = [word for line in active.lines for word in (line.words or [])]
    threshold = settings.verso_low_confidence
    return {
        "lines": len(active.lines),
        "words": len(words),
        "low_confidence": sum(1 for word in words if word.get("p", 1.0) < threshold),
    }


@router.get("/{track_id}/versions/count")
async def version_count(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    total = await session.scalar(
        select(func.count(LyricsVersion.id)).where(LyricsVersion.track_id == track_id)
    )
    return {"count": total or 0}
