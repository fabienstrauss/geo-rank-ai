"""add competitor snapshots

Revision ID: 20260319_0002
Revises: 20260319_0001
Create Date: 2026-03-19 18:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260319_0002"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "competitor_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("brand", sa.String(length=255), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("avg_rank", sa.Float(), nullable=False),
        sa.Column("share_of_voice", sa.Float(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_competitor_snapshots_workspace_id"), "competitor_snapshots", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_competitor_snapshots_brand"), "competitor_snapshots", ["brand"], unique=False)
    op.create_index(op.f("ix_competitor_snapshots_snapshot_at"), "competitor_snapshots", ["snapshot_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_competitor_snapshots_snapshot_at"), table_name="competitor_snapshots")
    op.drop_index(op.f("ix_competitor_snapshots_brand"), table_name="competitor_snapshots")
    op.drop_index(op.f("ix_competitor_snapshots_workspace_id"), table_name="competitor_snapshots")
    op.drop_table("competitor_snapshots")
