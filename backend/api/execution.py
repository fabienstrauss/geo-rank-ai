from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from deps import DbSession, get_workspace_or_404
from schemas import ManualRunCreate, RunDetailRead
from services.execution import create_manual_run


router = APIRouter(tags=["execution"])


@router.post("/workspaces/{workspace_id}/runs/manual", response_model=RunDetailRead, status_code=status.HTTP_201_CREATED)
def create_workspace_manual_run(workspace_id: UUID, payload: ManualRunCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return create_manual_run(db, workspace_id=workspace_id, payload=payload)
