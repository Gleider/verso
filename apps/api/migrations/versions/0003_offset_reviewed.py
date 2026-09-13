"""Offset da letra por faixa e marca de revisão humana por verso.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "track",
        sa.Column("lyrics_offset_ms", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "lyric_line",
        sa.Column("reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("lyric_line", "reviewed")
    op.drop_column("track", "lyrics_offset_ms")
