"""Tabela video_project — o editor de vídeo integrado.

Revision ID: 0009
Revises: 0008
"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

# `background_effect` de hoje mistura movimento e superfície; a spec do
# editor separa os dois. `vhs` é o único caso não-trivial: vira movimento
# `pulse` (ambient) + textura `vhs` (style).
_MOVIMENTO = {"breathe": "breathe", "pulse": "pulse", "vhs": "pulse", "none": "none"}
_TEXTURA = {"breathe": "none", "pulse": "none", "vhs": "vhs", "none": "none"}


def upgrade() -> None:
    op.create_table(
        "video_project",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("track.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("template_id", sa.String(60), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("settings_version", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_video_project_track_id", "video_project", ["track_id"], unique=True)

    # Migra as faixas que já têm fundo. Sem fundo, o projeto nasce com os
    # padrões quando o editor for aberto pela primeira vez — não precisa de
    # linha nenhuma aqui ainda.
    bind = op.get_bind()
    faixas = bind.execute(
        sa.text(
            "SELECT id, background_effect, effect_intensity FROM track "
            "WHERE background_key IS NOT NULL"
        )
    ).fetchall()

    for faixa_id, effect, intensity in faixas:
        effect = effect or "breathe"
        intensidade = intensity if intensity is not None else 0.55
        settings = {
            "background": {
                "kind": "upload",
                "ref": None,
                "color": "#0c1316",
                "ambient": _MOVIMENTO.get(effect, "breathe"),
                "ambientIntensity": intensidade,
                "blur": 0,
                "darken": 0.35,
            },
            "style": {"texture": _TEXTURA.get(effect, "none"), "textureIntensity": intensidade},
            "output": {"aspectRatio": "16:9", "resolution": "1080p", "fps": 30},
        }
        bind.execute(
            sa.text(
                "INSERT INTO video_project (id, track_id, settings, settings_version) "
                "VALUES (:id, :track_id, CAST(:settings AS jsonb), 1)"
            ),
            {"id": uuid.uuid4(), "track_id": faixa_id, "settings": json.dumps(settings)},
        )


def downgrade() -> None:
    op.drop_index("ix_video_project_track_id", table_name="video_project")
    op.drop_table("video_project")
