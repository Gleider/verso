"""Entrada do worker ARQ."""

from __future__ import annotations

from arq.connections import RedisSettings
from verso_core.config import get_settings

from verso_worker.pipeline import transcribe_track
from verso_worker.video import render_track_video

settings = get_settings()


class WorkerSettings:
    functions = [transcribe_track, render_track_video]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    # Uma faixa por vez: Demucs e Whisper já ocupam a máquina inteira.
    max_jobs = 1
    # Uma faixa longa em CPU pode passar de 15 minutos.
    job_timeout = 3600
    max_tries = 2
    keep_result = 3600
