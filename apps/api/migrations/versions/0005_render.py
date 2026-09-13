"""Jobs de renderização de vídeo.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Novo valor de enum precisa ficar fora da transação da migration.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE job_kind ADD VALUE IF NOT EXISTS 'render'")

    op.add_column("processing_job", sa.Column("output_key", sa.String(500), nullable=True))
    op.add_column(
        "processing_job",
        sa.Column(
            "params",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("processing_job", "params")
    op.drop_column("processing_job", "output_key")
    # O valor do enum permanece: removê-lo exigiria recriar o tipo.
