"""Job de renderização do vídeo de karaokê."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from verso_core.config import get_settings
from verso_core.db import session_scope
from verso_core.models import JobState, LyricsVersion, ProcessingJob, Track
from verso_video.frames import build_lines
from verso_video.render import RenderError, RenderOptions, render_karaoke_video

settings = get_settings()


async def render_track_video(
    ctx: dict, track_id: str, job_id: str, resolution: str = "1080p"
) -> str:
    """Monta o MP4 da faixa e guarda o caminho no job."""
    track_uuid, job_uuid = uuid.UUID(track_id), uuid.UUID(job_id)

    async with session_scope() as session:
        track = await session.get(Track, track_uuid)
        if track is None:
            return "faixa inexistente"

        version = await session.scalar(
            select(LyricsVersion)
            .where(LyricsVersion.track_id == track_uuid, LyricsVersion.is_active.is_(True))
            .options(selectinload(LyricsVersion.lines))
        )
        if version is None or not version.lines:
            await _fail(job_uuid, "Esta faixa ainda não tem letra para colocar no vídeo.")
            return "sem letra"

        rows = [
            {
                "text": line.text,
                "start_ms": line.start_ms,
                "end_ms": line.end_ms,
                "nudge_ms": line.nudge_ms,
                "words": line.words or [],
            }
            for line in version.lines
        ]
        language = version.language or "pt"
        offset_ms = track.lyrics_offset_ms
        effect = track.background_effect or "breathe"
        intensity = track.effect_intensity if track.effect_intensity is not None else 0.55
        duration_ms = track.duration_ms or 0
        audio_path = settings.verso_storage_dir / track.original_key
        background = (
            settings.verso_storage_dir / track.background_key if track.background_key else None
        )

        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_uuid)
            .values(
                state=JobState.running,
                stage="montando o vídeo",
                progress=0.0,
                started_at=datetime.now(UTC),
            )
        )

    output_key = f"renders/{track_id}-{resolution}.mp4"
    output_path = settings.verso_storage_dir / output_key

    try:
        lines = build_lines(rows, language, offset_ms)
        if not lines:
            raise RenderError("Nenhum verso tem marcação de tempo para exibir no vídeo.")

        # O progresso é gravado a cada ~2% para não martelar o banco.
        last_written = -1.0

        def on_progress(fraction: float) -> None:
            nonlocal last_written
            if fraction - last_written < 0.02 and fraction < 1.0:
                return
            last_written = fraction
            ctx["render_progress"] = fraction

        render_karaoke_video(
            audio_path=audio_path,
            background_path=background,
            lines=lines,
            output_path=output_path,
            duration_ms=duration_ms,
            options=RenderOptions(
                resolution=resolution, effect=effect, effect_intensity=intensity
            ),
            on_progress=on_progress,
        )
    except Exception as exc:  # noqa: BLE001 - a mensagem precisa chegar à interface
        await _fail(job_uuid, _human_error(exc))
        raise

    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_uuid)
            .values(
                state=JobState.done,
                stage="pronto",
                progress=1.0,
                output_key=output_key,
                finished_at=datetime.now(UTC),
            )
        )

    return output_key


async def _fail(job_id: uuid.UUID, message: str) -> None:
    async with session_scope() as session:
        await session.execute(
            update(ProcessingJob)
            .where(ProcessingJob.id == job_id)
            .values(state=JobState.failed, error=message, finished_at=datetime.now(UTC))
        )


def _human_error(exc: Exception) -> str:
    if isinstance(exc, RenderError):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        return "O ffmpeg não foi encontrado. Instale-o para exportar vídeo."
    return f"A renderização falhou: {type(exc).__name__}: {str(exc)[:200]}"
