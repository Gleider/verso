"""Estado dos jobs e o fluxo de progresso ao vivo.

O SSE é o que faz a espera de três minutos parecer aceitável: o usuário vê
"separando o vocal · 40%" em vez de um spinner mudo.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse
from verso_core.db import get_session, session_scope
from verso_core.models import JobState, ProcessingJob
from verso_core.schemas import JobOut

router = APIRouter(tags=["jobs"])

POLL_INTERVAL_SECONDS = 1.0
# Mesmo em CPU, uma faixa longa não deve passar disso.
MAX_STREAM_SECONDS = 3600


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> ProcessingJob:
    job = await session.get(ProcessingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    return job


@router.get("/tracks/{track_id}/events")
async def track_events(track_id: uuid.UUID) -> EventSourceResponse:
    """Empurra estágio e progresso enquanto a faixa é processada."""

    async def stream() -> AsyncIterator[dict]:
        elapsed = 0.0
        last_signature: tuple | None = None

        while elapsed < MAX_STREAM_SECONDS:
            async with session_scope() as session:
                job = await session.scalar(
                    select(ProcessingJob)
                    .where(ProcessingJob.track_id == track_id)
                    .order_by(ProcessingJob.created_at.desc())
                    .limit(1)
                )

                if job is None:
                    yield {"event": "error", "data": '{"detail":"Nenhum job para esta faixa."}'}
                    return

                signature = (job.state, job.stage, round(job.progress, 3))
                if signature != last_signature:
                    last_signature = signature
                    yield {
                        "event": "progress",
                        "data": JobOut.model_validate(job).model_dump_json(),
                    }

                if job.state in (JobState.done, JobState.failed):
                    yield {"event": "done", "data": JobOut.model_validate(job).model_dump_json()}
                    return

            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            elapsed += POLL_INTERVAL_SECONDS

        yield {"event": "timeout", "data": '{"detail":"O acompanhamento expirou."}'}

    return EventSourceResponse(stream())
