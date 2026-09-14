"""O pipeline: do arquivo enviado até a letra pronta para revisão.

Seis estágios, e o segundo é o que separa um resultado utilizável de um
frustrante — ver `verso_audio.separate`.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select, update
from verso_asr.faster_whisper_transcriber import FasterWhisperTranscriber
from verso_audio.convert import to_asr_wav
from verso_audio.separate import device_with_fallback, separate_vocals
from verso_core.config import get_settings
from verso_core.db import session_scope
from verso_core.models import (
    JobState,
    LyricLine,
    LyricsSource,
    LyricsVersion,
    ProcessingJob,
    Track,
    TrackState,
)
from verso_lyrics.grouping import group_into_lines

settings = get_settings()

# Carregar o large-v3 leva dezenas de segundos; o worker o mantém vivo entre jobs.
_transcriber: FasterWhisperTranscriber | None = None


def get_transcriber(model: str | None = None) -> FasterWhisperTranscriber:
    global _transcriber
    name = model or settings.verso_whisper_model
    if _transcriber is None or _transcriber.model_name != name:
        _transcriber = FasterWhisperTranscriber(
            name,
            device=settings.verso_whisper_device,
            compute_type=settings.verso_whisper_compute,
            low_confidence=settings.verso_low_confidence,
        )
    return _transcriber


async def _report(job_id: uuid.UUID, stage: str, progress: float) -> None:
    """Empurra o estágio atual para o banco; o SSE da API lê daqui."""
    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id)
            .values(stage=stage, progress=round(progress, 3), state=JobState.running)
        )


async def _fail(job_id: uuid.UUID, track_id: uuid.UUID, message: str) -> None:
    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id)
            .values(
                state=JobState.failed,
                error=message,
                finished_at=datetime.now(UTC),
            )
        )
        await session.execute(
            update(Track).where(Track.id == track_id).values(state=TrackState.failed)
        )


async def transcribe_track(ctx: dict, track_id: str, job_id: str, model: str | None = None) -> str:
    """Job do ARQ. Roda os seis estágios e grava a versão 1 da letra."""
    track_uuid, job_uuid = uuid.UUID(track_id), uuid.UUID(job_id)

    async with session_scope() as session:
        track = await session.get(Track, track_uuid)
        if track is None:
            return "faixa inexistente"
        original_key = track.original_key
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_uuid)
            .values(state=JobState.running, started_at=datetime.now(UTC), progress=0.0)
        )
        await session.execute(
            update(Track).where(Track.id == track_uuid).values(state=TrackState.processing)
        )

    source = settings.verso_storage_dir / original_key
    workdir = settings.verso_storage_dir / "work" / track_id
    workdir.mkdir(parents=True, exist_ok=True)

    try:
        # 01 · normalização
        await _report(job_uuid, "preparando o áudio", 0.05)
        wav = to_asr_wav(source, workdir / "input.wav")

        # 02 · separação de fontes: o estágio que faz o resto valer
        device = device_with_fallback(settings.verso_demucs_device)
        await _report(job_uuid, f"separando o vocal ({device})", 0.15)
        vocals = separate_vocals(
            wav,
            workdir,
            model=settings.verso_demucs_model,
            device=device,
            keep_other_stems=False,
        )

        vocals_key = f"vocals/{track_id}.wav"
        final_vocals = settings.verso_storage_dir / vocals_key
        final_vocals.parent.mkdir(parents=True, exist_ok=True)
        Path(vocals).replace(final_vocals)

        # 03 e 04 · VAD e transcrição acontecem dentro do faster-whisper
        await _report(job_uuid, "transcrevendo", 0.45)
        transcriber = get_transcriber(model)

        # `ctx["progress"]` era escrito aqui e nunca lido por ninguém — a
        # barra da transcrição ficava parada em 45% pelo estágio mais longo.
        # A transcrição roda numa thread (`to_thread`) para não bloquear o
        # laço de eventos do worker; o callback, chamado NESSA thread, não
        # pode `await` `_report` diretamente — `run_coroutine_threadsafe`
        # agenda a gravação de volta no laço principal.
        loop = asyncio.get_running_loop()

        def on_progress(fraction: float, stage: str) -> None:
            asyncio.run_coroutine_threadsafe(
                _report(job_uuid, stage, 0.45 + fraction * 0.45), loop
            )

        result = await asyncio.to_thread(
            transcriber.transcribe, final_vocals, on_progress=on_progress
        )

        # 05 · estruturação em versos e estrofes
        await _report(job_uuid, "montando os versos", 0.92)
        lines = group_into_lines(result.words)

        # 06 · persistência da versão 1
        async with session_scope() as session:
            await session.execute(
                update(LyricsVersion)
                .where(LyricsVersion.track_id == track_uuid)
                .values(is_active=False)
            )
            last = await session.scalar(
                select(LyricsVersion.version_no)
                .where(LyricsVersion.track_id == track_uuid)
                .order_by(LyricsVersion.version_no.desc())
                .limit(1)
            )
            version = LyricsVersion(
                track_id=track_uuid,
                version_no=(last or 0) + 1,
                source=LyricsSource.asr,
                language=result.language,
                is_active=True,
            )
            session.add(version)
            await session.flush()

            for line in lines:
                session.add(
                    LyricLine(
                        version_id=version.id,
                        idx=line.idx,
                        text=line.text,
                        start_ms=line.start_ms,
                        end_ms=line.end_ms,
                        words=[
                            {"w": w.text, "s": w.start_ms, "e": w.end_ms, "p": w.probability}
                            for w in line.words
                        ],
                        needs_realign=False,
                        starts_stanza=line.starts_stanza,
                    )
                )

            await session.execute(
                update(ProcessingJob)
                .where(ProcessingJob.id == job_uuid)
                .values(
                    state=JobState.done,
                    stage="concluído",
                    progress=1.0,
                    finished_at=datetime.now(UTC),
                )
            )
            await session.execute(
                update(Track)
                .where(Track.id == track_uuid)
                .values(state=TrackState.ready, vocals_key=vocals_key)
            )

        return f"{len(lines)} versos"

    except Exception as exc:  # noqa: BLE001 - a mensagem precisa chegar à interface
        await _fail(job_uuid, track_uuid, _human_error(exc))
        raise
    finally:
        for leftover in workdir.glob("*"):
            if leftover.is_file():
                leftover.unlink(missing_ok=True)


def _human_error(exc: Exception) -> str:
    """'ffmpeg falhou' não serve para ninguém."""
    from verso_asr.faster_whisper_transcriber import TranscriberUnavailable
    from verso_audio.convert import ConversionError
    from verso_audio.separate import SeparationError, SeparationUnavailable

    # Dependência faltando não é problema da faixa: a instrução tem que ser exata.
    if isinstance(exc, SeparationUnavailable | TranscriberUnavailable):
        return str(exc)
    if isinstance(exc, ConversionError):
        return str(exc)
    if isinstance(exc, SeparationError):
        return (
            "Não foi possível separar o vocal desta faixa. Tente outro arquivo ou "
            "rode a separação em CPU (VERSO_DEMUCS_DEVICE=cpu)."
        )
    if isinstance(exc, MemoryError):
        return "Memória insuficiente para o modelo atual. Tente o modelo distil-large-v3."
    return f"O processamento falhou: {type(exc).__name__}: {str(exc)[:200]}"
