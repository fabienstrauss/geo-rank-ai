"""initial schema

Revision ID: 20260319_0001
Revises: None
Create Date: 2026-03-19 15:00:00
"""

from alembic import op

from database import Base
import models  # noqa: F401


revision = "20260319_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
