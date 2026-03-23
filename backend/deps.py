from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Workspace


DbSession = Annotated[Session, Depends(get_db)]


def get_workspace_or_404(db: Session, workspace_id: UUID) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace
