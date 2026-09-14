"""Origem 'musixmatch' no enum lyrics_source.

Revision ID: 0008
Revises: 0007
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE não roda dentro de transação.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE lyrics_source ADD VALUE IF NOT EXISTS 'musixmatch'")


def downgrade() -> None:
    # O Postgres não suporta remover valor de enum; valores criados por esta
    # migration permanecem até um DROP TYPE manual, se um dia fizer falta.
    pass
