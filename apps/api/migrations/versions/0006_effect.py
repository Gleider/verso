"""Efeito da imagem de fundo, por faixa.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "track",
        sa.Column(
            "background_effect",
            sa.String(30),
            nullable=False,
            server_default="breathe",
        ),
    )


def downgrade() -> None:
    op.drop_column("track", "background_effect")
