"""Leitura, edição e versionamento das letras.

Regra do módulo: salvar nunca sobrescreve. Toda alteração cria uma versão nova,
derivada da anterior, e a antiga continua acessível.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from verso_asr.base import Word
from verso_core.config import get_settings
from verso_core.db import get_session
from verso_core.models import LyricsSource, LyricsVersion, Track, TrackState
from verso_core.schemas import (
    LyricsImport,
    LyricsUpdate,
    LyricsVersionOut,
    LyricsVersionSummary,
    MusixmatchFetch,
    NudgeUpdate,
)
from verso_lyrics import (
    LrcError,
    MusixmatchClient,
    MusixmatchError,
    MusixmatchNotFound,
    parse_lrc,
)
from verso_lyrics.export import to_lrc, to_plain_text
from verso_lyrics.grouping import Line
from verso_lyrics.timing import reconcile_timings

from verso_api.versions import create_version

router = APIRouter(prefix="/tracks/{track_id}/lyrics", tags=["letras"])
settings = get_settings()


async def _active_version(session: AsyncSession, track_id: uuid.UUID) -> LyricsVersion | None:
    return await session.scalar(
        select(LyricsVersion)
        .where(LyricsVersion.track_id == track_id, LyricsVersion.is_active.is_(True))
        .options(selectinload(LyricsVersion.lines))
    )


def _to_domain(version: LyricsVersion) -> list[Line]:
    """Traduz as linhas do banco para o modelo que packages/lyrics manipula."""
    return [
        Line(
            idx=row.idx,
            text=row.text,
            words=[
                Word(
                    text=word["w"],
                    start_ms=int(word["s"]),
                    end_ms=int(word["e"]),
                    probability=float(word.get("p", 1.0)),
                )
                for word in (row.words or [])
            ],
            start_ms=row.start_ms,
            end_ms=row.end_ms,
            starts_stanza=row.starts_stanza,
            needs_realign=row.needs_realign,
            reviewed=row.reviewed,
            nudge_ms=row.nudge_ms,
        )
        for row in version.lines
    ]


@router.get("", response_model=LyricsVersionOut)
async def get_lyrics(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> LyricsVersion:
    version = await _active_version(session, track_id)
    if version is None:
        raise HTTPException(
            status_code=404,
            detail="Esta faixa ainda não tem letra. Aguarde a transcrição terminar.",
        )
    return version


@router.put("", response_model=LyricsVersionOut)
async def save_lyrics(
    track_id: uuid.UUID,
    payload: LyricsUpdate,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Salva as correções como uma versão nova, preservando os timings medidos."""
    current = await _active_version(session, track_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Não há letra para editar nesta faixa.")

    ordered = sorted(payload.lines, key=lambda line: line.idx)
    reconciled = reconcile_timings(
        _to_domain(current),
        [line.text for line in ordered],
        reviewed_flags=[line.reviewed for line in ordered],
        pinned_ms=[line.start_ms for line in ordered],
        nudges_ms=[line.nudge_ms for line in ordered],
        stanza_flags=[line.starts_stanza for line in ordered],
    )

    version = await create_version(
        session, track_id, reconciled, LyricsSource.user_edit, current, current.language
    )
    await session.commit()
    return version


@router.post("/import-lrc", response_model=LyricsVersionOut)
async def import_lrc(
    track_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Substitui a letra por um arquivo .lrc enviado (envio tardio, pela página da faixa)."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")
    if Path(file.filename or "").suffix.lower() != ".lrc":
        raise HTTPException(status_code=415, detail="O arquivo precisa ter extensão .lrc.")

    try:
        lines = parse_lrc((await file.read()).decode("utf-8", errors="replace"))
    except LrcError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    current = await _active_version(session, track_id)
    version = await create_version(session, track_id, lines, LyricsSource.imported, current, None)
    track.state = TrackState.ready
    await session.commit()
    return version


@router.post("/musixmatch", response_model=LyricsVersionOut)
async def fetch_musixmatch(
    track_id: uuid.UUID,
    payload: MusixmatchFetch,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Busca a letra sincronizada no Musixmatch e vira a versão ativa.

    Falhas comuns voltam para o diálogo: 404 quando a música não está no
    catálogo (confira título/artista) e 502 quando o Musixmatch não responde.
    """
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    try:
        async with httpx.AsyncClient(timeout=20) as http:
            client = MusixmatchClient(
                settings.verso_musixmatch_app_id,
                settings.verso_musixmatch_secret,
                settings.musixmatch_session_file,
                http,
            )
            lines = await client.fetch_subtitle(payload.title, payload.artist)
    except MusixmatchNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LrcError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except MusixmatchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    current = await _active_version(session, track_id)
    language = current.language if current else None
    version = await create_version(
        session, track_id, lines, LyricsSource.musixmatch, current, language
    )
    track.state = TrackState.ready
    await session.commit()
    return version


@router.post("/import", response_model=LyricsVersionOut)
async def import_lyrics(
    track_id: uuid.UUID,
    payload: LyricsImport,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Substitui a letra gerada por uma que você já tem em mãos."""
    current = await _active_version(session, track_id)
    raw_lines = payload.text.splitlines()

    if current is not None:
        # Mesmo colando de fora, o que coincidir com o áudio mantém o timing.
        reconciled = reconcile_timings(_to_domain(current), raw_lines)
    else:
        reconciled = [
            Line(idx=i, text=text.strip(), words=[], starts_stanza=(i == 0))
            for i, text in enumerate(line for line in raw_lines if line.strip())
        ]
        for line in reconciled:
            line.needs_realign = True

    version = await create_version(
        session,
        track_id,
        reconciled,
        LyricsSource.imported,
        current,
        payload.language or (current.language if current else None),
    )
    await session.commit()
    return version


@router.patch("/nudges", response_model=LyricsVersionOut)
async def save_nudges(
    track_id: uuid.UUID,
    payload: NudgeUpdate,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Grava os ajustes de tempo feitos no player.

    Diferente de editar o texto, isto NÃO cria uma versão nova: versionamento
    aqui é sobre o que a letra diz, e o ajuste fino de sincronia é contínuo —
    uma versão por toque de tecla só encheria o histórico de ruído.
    """
    version = await _active_version(session, track_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Esta faixa ainda não tem letra.")

    by_id = {line.id: line for line in version.lines}
    desconhecidas = [n.line_id for n in payload.nudges if n.line_id not in by_id]
    if desconhecidas:
        raise HTTPException(
            status_code=400,
            detail="Alguns versos não pertencem à versão ativa da letra. Recarregue a página.",
        )

    for nudge in payload.nudges:
        by_id[nudge.line_id].nudge_ms = nudge.nudge_ms

    await session.commit()
    await session.refresh(version, ["lines"])
    return version


@router.get("/versions", response_model=list[LyricsVersionSummary])
async def list_versions(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> list[LyricsVersionSummary]:
    versions = await session.scalars(
        select(LyricsVersion)
        .where(LyricsVersion.track_id == track_id)
        .options(selectinload(LyricsVersion.lines))
        .order_by(LyricsVersion.version_no.desc())
    )
    return [
        LyricsVersionSummary(
            id=v.id,
            version_no=v.version_no,
            source=v.source,
            is_active=v.is_active,
            created_at=v.created_at,
            line_count=len(v.lines),
        )
        for v in versions
    ]


@router.post("/versions/{version_id}/activate", response_model=LyricsVersionOut)
async def activate_version(
    track_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Volta para uma versão anterior."""
    target = await session.scalar(
        select(LyricsVersion)
        .where(LyricsVersion.id == version_id, LyricsVersion.track_id == track_id)
        .options(selectinload(LyricsVersion.lines))
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Versão não encontrada nesta faixa.")

    await session.execute(
        update(LyricsVersion).where(LyricsVersion.track_id == track_id).values(is_active=False)
    )
    target.is_active = True
    await session.commit()
    await session.refresh(target, ["lines"])
    return target


@router.delete("/versions/{version_id}", response_model=LyricsVersionOut)
async def discard_version(
    track_id: uuid.UUID,
    version_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> LyricsVersion:
    """Apaga uma versão da letra e devolve a que passa a valer.

    Salvar nunca sobrescreve (é a regra do módulo), mas um salvamento que saiu
    errado fica no caminho de tudo que vem depois: ele vira a base do próximo
    diff de timing. Descartar é a saída — e é por isso que ela não é silenciosa:
    a resposta traz a versão que ficou ativa no lugar.
    """
    target = await session.get(LyricsVersion, version_id)
    if target is None or target.track_id != track_id:
        raise HTTPException(status_code=404, detail="Versão não encontrada nesta faixa.")

    total = await session.scalar(
        select(func.count(LyricsVersion.id)).where(LyricsVersion.track_id == track_id)
    )
    if (total or 0) <= 1:
        raise HTTPException(
            status_code=409,
            detail="Esta é a única versão da letra. Edite-a em vez de descartá-la.",
        )

    await session.delete(target)
    await session.flush()

    # A mais recente que sobrou assume — inclusive quando a apagada não era a ativa,
    # porque uma faixa sem versão ativa não tem letra nenhuma no editor.
    survivor = await session.scalar(
        select(LyricsVersion)
        .where(LyricsVersion.track_id == track_id)
        .options(selectinload(LyricsVersion.lines))
        .order_by(LyricsVersion.is_active.desc(), LyricsVersion.version_no.desc())
        .limit(1)
    )
    if survivor is None:  # defensivo: a contagem acima já garante que há outra
        raise HTTPException(status_code=409, detail="Não sobrou nenhuma versão da letra.")

    await session.execute(
        update(LyricsVersion).where(LyricsVersion.track_id == track_id).values(is_active=False)
    )
    survivor.is_active = True
    await session.commit()
    await session.refresh(survivor, ["lines"])
    return survivor


@router.get("/export")
async def export_lyrics(
    track_id: uuid.UUID,
    format: str = "lrc",
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Exporta em .lrc (com timestamps) ou .txt (letra crua)."""
    version = await _active_version(session, track_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Esta faixa ainda não tem letra.")

    track = await session.get(Track, track_id)
    lines = _to_domain(version)

    if format == "txt":
        return Response(
            to_plain_text(lines),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{track_id}.txt"'},
        )
    if format != "lrc":
        raise HTTPException(status_code=400, detail="Formato aceito: lrc ou txt.")

    body = to_lrc(
        lines,
        title=track.title if track else "",
        artist=(track.artist or "") if track else "",
        offset_ms=track.lyrics_offset_ms if track else 0,
    )
    return Response(
        body,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{track_id}.lrc"'},
    )
