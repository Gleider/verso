"""Intensidade do efeito da imagem de fundo.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "track",
        sa.Column("effect_intensity", sa.Float(), nullable=False, server_default="0.55"),
    )


def downgrade() -> None:
    op.drop_column("track", "effect_intensity")
