"""Schemas da API. São eles que viram o OpenAPI e, daí, os tipos do frontend."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from verso_core.models import JobKind, JobState, LyricsSource, TrackState


class WordTiming(BaseModel):
    """Uma palavra cantada, com onde começa, onde termina e quanta certeza o modelo teve."""

    w: str
    s: int = Field(description="início em milissegundos")
    e: int = Field(description="fim em milissegundos")
    p: float = Field(default=1.0, description="probabilidade de 0 a 1")


class LyricLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    idx: int
    text: str
    start_ms: int | None
    end_ms: int | None
    words: list[WordTiming]
    needs_realign: bool
    starts_stanza: bool
    reviewed: bool
    nudge_ms: int = 0


class LyricLineIn(BaseModel):
    """Um verso como o editor o devolve. Sem timings: o servidor os reaproveita."""

    idx: int
    text: str
    starts_stanza: bool = False
    # O editor pode confirmar uma linha sem alterar o texto ("ouvi, está certo").
    reviewed: bool = False


class LyricsVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    track_id: uuid.UUID
    version_no: int
    source: LyricsSource
    language: str | None
    is_active: bool
    parent_id: uuid.UUID | None
    created_at: datetime
    lines: list[LyricLineOut] = []


class LyricsVersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_no: int
    source: LyricsSource
    is_active: bool
    created_at: datetime
    line_count: int = 0


class LyricsUpdate(BaseModel):
    """Salvar correções cria uma versão nova — nunca sobrescreve a anterior."""

    lines: list[LyricLineIn]


class LineNudge(BaseModel):
    """Ajuste manual do tempo de um verso."""

    line_id: uuid.UUID
    nudge_ms: int = Field(ge=-30_000, le=30_000)


class NudgeUpdate(BaseModel):
    nudges: list[LineNudge]


class LyricsImport(BaseModel):
    """Cola uma letra pronta de fora. Uma linha de texto por verso."""

    text: str
    language: str | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    track_id: uuid.UUID
    kind: JobKind
    state: JobState
    stage: str | None
    progress: float
    error: str | None
    output_key: str | None = None
    params: dict = {}
    created_at: datetime
    finished_at: datetime | None


class TrackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    artist: str | None
    album: str | None
    duration_ms: int | None
    state: TrackState
    background_effect: str = "breathe"
    effect_intensity: float = 0.55
    lyrics_offset_ms: int = 0
    created_at: datetime


class TrackDetail(TrackOut):
    sha256: str
    size_bytes: int
    mime_type: str
    has_vocals_stem: bool = False
    has_background: bool = False
    active_lyrics: LyricsVersionOut | None = None
    latest_job: JobOut | None = None


class TrackCreated(BaseModel):
    track_id: uuid.UUID
    job_id: uuid.UUID | None
    duplicate: bool = Field(
        default=False, description="true quando o arquivo já existia e foi reaproveitado"
    )


class TrackUpdate(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    lyrics_offset_ms: int | None = Field(
        default=None,
        ge=-30_000,
        le=30_000,
        description="positivo adianta a letra, negativo atrasa",
    )
    background_effect: str | None = Field(
        default=None, pattern="^(breathe|vhs|pulse|none)$"
    )
    effect_intensity: float | None = Field(default=None, ge=0.0, le=1.0)


class RenderRequest(BaseModel):
    resolution: str = Field(default="1080p", pattern="^(720p|1080p)$")


class TranscribeRequest(BaseModel):
    model: str | None = Field(default=None, description="sobrescreve o modelo padrão")
