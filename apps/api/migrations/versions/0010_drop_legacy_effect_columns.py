"""Remove background_effect e effect_intensity de track.

O editor de vídeo integrado (`video_project.settings`) substitui as duas —
`migration 0009` já traduziu e copiou o que existia para lá.

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("track", "background_effect")
    op.drop_column("track", "effect_intensity")


def downgrade() -> None:
    op.add_column(
        "track",
        sa.Column("background_effect", sa.String(30), nullable=False, server_default="breathe"),
    )
    op.add_column(
        "track",
        sa.Column("effect_intensity", sa.Float(), nullable=False, server_default="0.55"),
    )
