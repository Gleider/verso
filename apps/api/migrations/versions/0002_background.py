"""Imagem de fundo do player, por faixa.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("track", sa.Column("background_key", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("track", "background_key")
