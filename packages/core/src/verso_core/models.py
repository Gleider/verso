"""Tabelas do Verso.

A decisão que carrega o projeto: letra é versionada, nunca sobrescrita. A versão
gerada pela máquina e a corrigida pelo usuário coexistem, e dá para voltar.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class TrackState(enum.StrEnum):
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class JobKind(enum.StrEnum):
    transcribe = "transcribe"
    align = "align"
    render = "render"


class JobState(enum.StrEnum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class LyricsSource(enum.StrEnum):
    asr = "asr"
    user_edit = "user_edit"
    imported = "imported"
    musixmatch = "musixmatch"


class Track(Base):
    __tablename__ = "track"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # Mesmo arquivo enviado duas vezes reaproveita o resultado.
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500))
    artist: Mapped[str | None] = mapped_column(String(500), nullable=True)
    album: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    original_key: Mapped[str] = mapped_column(String(500))
    vocals_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Imagem de fundo do player, enviada pelo usuário.
    background_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Efeito aplicado à imagem de fundo no player e no vídeo.
    background_effect: Mapped[str] = mapped_column(
        String(30), default="breathe", server_default="breathe"
    )
    # Intensidade do efeito, de 0 (quase imperceptível) a 1 (bem marcado).
    effect_intensity: Mapped[float] = mapped_column(
        Float, default=0.55, server_default="0.55"
    )
    # Ajuste fino da letra no player. Positivo adianta, negativo atrasa.
    lyrics_offset_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    state: Mapped[TrackState] = mapped_column(
        Enum(TrackState, name="track_state"), default=TrackState.uploaded
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    jobs: Mapped[list[ProcessingJob]] = relationship(
        back_populates="track", cascade="all, delete-orphan"
    )
    lyrics_versions: Mapped[list[LyricsVersion]] = relationship(
        back_populates="track", cascade="all, delete-orphan"
    )


class ProcessingJob(Base):
    __tablename__ = "processing_job"

    id: Mapped[uuid.UUID] = _uuid_pk()
    track_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("track.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[JobKind] = mapped_column(Enum(JobKind, name="job_kind"))
    state: Mapped[JobState] = mapped_column(
        Enum(JobState, name="job_state"), default=JobState.queued
    )
    # Rótulo legível para a barra de progresso: "separando vocal", "transcrevendo"...
    stage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Só para jobs de render: onde o arquivo ficou e com que parâmetros.
    output_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    params: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    track: Mapped[Track] = relationship(back_populates="jobs")


class LyricsVersion(Base):
    __tablename__ = "lyrics_version"
    __table_args__ = (UniqueConstraint("track_id", "version_no", name="uq_track_version"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    track_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("track.id", ondelete="CASCADE"), index=True
    )
    version_no: Mapped[int] = mapped_column(Integer)
    source: Mapped[LyricsSource] = mapped_column(Enum(LyricsSource, name="lyrics_source"))
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Única versão com is_active=True por faixa.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lyrics_version.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    track: Mapped[Track] = relationship(back_populates="lyrics_versions")
    lines: Mapped[list[LyricLine]] = relationship(
        back_populates="version",
        cascade="all, delete-orphan",
        order_by="LyricLine.idx",
    )


class LyricLine(Base):
    __tablename__ = "lyric_line"

    id: Mapped[uuid.UUID] = _uuid_pk()
    version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lyrics_version.id", ondelete="CASCADE"), index=True
    )
    idx: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    start_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # [{"w": palavra, "s": início_ms, "e": fim_ms, "p": probabilidade}]
    words: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # Editada à mão: o timing é interpolado, não medido. A fase 2 realinha só estas.
    needs_realign: Mapped[bool] = mapped_column(Boolean, default=False)
    # Marca de estrofe: esta linha abre um bloco novo.
    starts_stanza: Mapped[bool] = mapped_column(Boolean, default=False)
    # Um humano já validou esta linha. A confiança do modelo deixa de valer aqui.
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Ajuste manual deste verso, somado ao timing medido. Guardado à parte para
    # que o dado original do modelo continue intacto e o ajuste seja reversível.
    nudge_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    version: Mapped[LyricsVersion] = relationship(back_populates="lines")
