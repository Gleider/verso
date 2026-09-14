"""Criação de versões de letra — camada de aplicação da API.

Salvar nunca sobrescreve: desativa a versão ativa, numera a nova a partir da
última e grava os versos. Compartilhado pelas rotas de edição, importação
(.lrc colado ou enviado) e busca no Musixmatch.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from verso_core.models import LyricLine, LyricsSource, LyricsVersion
from verso_lyrics.grouping import Line


async def create_version(
    session: AsyncSession,
    track_id: uuid.UUID,
    lines: list[Line],
    source: LyricsSource,
    parent: LyricsVersion | None,
    language: str | None,
) -> LyricsVersion:
    await session.execute(
        update(LyricsVersion).where(LyricsVersion.track_id == track_id).values(is_active=False)
    )
    last = await session.scalar(
        select(LyricsVersion.version_no)
        .where(LyricsVersion.track_id == track_id)
        .order_by(LyricsVersion.version_no.desc())
        .limit(1)
    )
    version = LyricsVersion(
        track_id=track_id,
        version_no=(last or 0) + 1,
        source=source,
        language=language,
        is_active=True,
        parent_id=parent.id if parent else None,
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
                needs_realign=line.needs_realign,
                starts_stanza=line.starts_stanza,
                reviewed=line.reviewed,
                nudge_ms=line.nudge_ms,
            )
        )
    await session.flush()
    await session.refresh(version, ["lines"])
    return version
