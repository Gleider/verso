"""Leitura, edição e versionamento das letras.

Regra do módulo: salvar nunca sobrescreve. Toda alteração cria uma versão nova,
derivada da anterior, e a antiga continua acessível.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from verso_asr.base import Word
from verso_core.config import get_settings
from verso_core.db import get_session
from verso_core.models import LyricLine, LyricsSource, LyricsVersion, Track
from verso_core.schemas import (
    LyricsImport,
    LyricsUpdate,
    LyricsVersionOut,
    LyricsVersionSummary,
    NudgeUpdate,
)
from verso_lyrics.export import to_lrc, to_plain_text
from verso_lyrics.grouping import Line
from verso_lyrics.timing import reconcile_timings

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


async def _create_version(
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
    )

    version = await _create_version(
        session, track_id, reconciled, LyricsSource.user_edit, current, current.language
    )
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

    version = await _create_version(
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
