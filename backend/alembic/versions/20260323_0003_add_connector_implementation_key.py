"""add connector implementation key

Revision ID: 20260323_0003
Revises: 20260319_0002
Create Date: 2026-03-23 11:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260323_0003"
down_revision = "20260319_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("connectors", sa.Column("implementation_key", sa.String(length=150), nullable=True))
    op.execute("UPDATE connectors SET implementation_key = 'openai_api' WHERE connector_type = 'llm_api' AND provider_key = 'openai'")
    op.execute("UPDATE connectors SET implementation_key = provider_key WHERE implementation_key IS NULL AND provider_key IS NOT NULL")
    op.execute("UPDATE connectors SET implementation_key = connector_type::text WHERE implementation_key IS NULL")
    op.alter_column("connectors", "implementation_key", existing_type=sa.String(length=150), nullable=False)
    op.create_index(op.f("ix_connectors_implementation_key"), "connectors", ["implementation_key"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_connectors_implementation_key"), table_name="connectors")
    op.drop_column("connectors", "implementation_key")
