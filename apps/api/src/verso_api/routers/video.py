"""Editor de vídeo integrado: o projeto de aparência de uma faixa.

Casca fina: quem decide o formato de `settings` é o schema Pydantic
`VideoSettings`, espelhado em `apps/web/composition/settings.ts`. `PUT` grava
o objeto inteiro — o editor sempre tem o estado completo em mãos, e gravação
parcial concorrente não tem quem resolva num app de um usuário só.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from verso_core.db import get_session
from verso_core.models import Track, VideoProject
from verso_core.schemas import (
    VERSAO_DO_FORMATO,
    VideoProjectOut,
    VideoProjectUpdate,
    VideoSettings,
)

router = APIRouter(tags=["vídeo"])


@router.get("/tracks/{track_id}/video-project", response_model=VideoProjectOut)
async def get_video_project(
    track_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> VideoProject:
    """Devolve o projeto da faixa, criando-o com os padrões se não houver."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    project = await session.scalar(select(VideoProject).where(VideoProject.track_id == track_id))
    if project is None:
        project = VideoProject(
            track_id=track_id,
            settings=VideoSettings().model_dump(),
            settings_version=VERSAO_DO_FORMATO,
        )
        session.add(project)
        await session.commit()
        await session.refresh(project)

    return project


@router.put("/tracks/{track_id}/video-project", response_model=VideoProjectOut)
async def update_video_project(
    track_id: uuid.UUID,
    payload: VideoProjectUpdate,
    session: AsyncSession = Depends(get_session),
) -> VideoProject:
    """Grava `settings` inteiro. Isto nunca cria versão de letra — é aparência,
    ajuste contínuo, sobrescrito in-place, a mesma regra do offset/nudge."""
    track = await session.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Faixa não encontrada.")

    project = await session.scalar(select(VideoProject).where(VideoProject.track_id == track_id))
    if project is None:
        project = VideoProject(track_id=track_id)
        session.add(project)

    project.template_id = payload.template_id
    project.settings = payload.settings.model_dump()
    project.settings_version = VERSAO_DO_FORMATO
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/video/templates")
async def list_templates() -> list[dict]:
    """Catálogo de templates.

    Os templates de verdade moram em `apps/web/composition/templates.ts`
    (TypeScript), importados direto pelo `apps/web` — sem viagem de rede. Esta
    rota existe só para o worker validar um `template_id` que já não exista
    mais; até a etapa 5 escrever esse catálogo, ela devolve vazio.
    """
    return []
