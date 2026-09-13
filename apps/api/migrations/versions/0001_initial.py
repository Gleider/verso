"""Esquema inicial: faixas, jobs e letras versionadas.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# Os tipos são criados uma vez em `upgrade`; as colunas apenas os referenciam
# (`create_type=False`), senão o CREATE TABLE tenta criá-los de novo.
track_state = postgresql.ENUM(
    "uploaded", "processing", "ready", "failed", name="track_state", create_type=False
)
job_kind = postgresql.ENUM("transcribe", "align", name="job_kind", create_type=False)
job_state = postgresql.ENUM(
    "queued", "running", "done", "failed", name="job_state", create_type=False
)
lyrics_source = postgresql.ENUM(
    "asr", "user_edit", "imported", name="lyrics_source", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in (track_state, job_kind, job_state, lyrics_source):
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "track",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("artist", sa.String(500)),
        sa.Column("album", sa.String(500)),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("original_key", sa.String(500), nullable=False),
        sa.Column("vocals_key", sa.String(500)),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("state", track_state, nullable=False, server_default="uploaded"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_track_sha256", "track", ["sha256"], unique=True)

    op.create_table(
        "processing_job",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("track.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", job_kind, nullable=False),
        sa.Column("state", job_state, nullable=False, server_default="queued"),
        sa.Column("stage", sa.String(120)),
        sa.Column("progress", sa.Float, nullable=False, server_default="0"),
        sa.Column("error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_processing_job_track_id", "processing_job", ["track_id"])

    op.create_table(
        "lyrics_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("track.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_no", sa.Integer, nullable=False),
        sa.Column("source", lyrics_source, nullable=False),
        sa.Column("language", sa.String(10)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lyrics_version.id", ondelete="SET NULL"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("track_id", "version_no", name="uq_track_version"),
    )
    op.create_index("ix_lyrics_version_track_id", "lyrics_version", ["track_id"])

    op.create_table(
        "lyric_line",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("lyrics_version.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("idx", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("start_ms", sa.Integer),
        sa.Column("end_ms", sa.Integer),
        sa.Column(
            "words",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("needs_realign", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("starts_stanza", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_lyric_line_version_id", "lyric_line", ["version_id"])


def downgrade() -> None:
    op.drop_table("lyric_line")
    op.drop_table("lyrics_version")
    op.drop_table("processing_job")
    op.drop_table("track")
    bind = op.get_bind()
    for enum_type in (lyrics_source, job_state, job_kind, track_state):
        enum_type.drop(bind, checkfirst=True)
