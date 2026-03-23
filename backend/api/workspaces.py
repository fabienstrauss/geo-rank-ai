from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from deps import DbSession, get_workspace_or_404
from models import Workspace
from schemas import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate


router = APIRouter(tags=["workspaces"])


@router.get("/workspaces", response_model=list[WorkspaceRead])
def list_workspaces(db: DbSession):
    return db.scalars(select(Workspace).order_by(Workspace.created_at.asc())).all()


@router.post("/workspaces", response_model=WorkspaceRead, status_code=201)
def create_workspace(payload: WorkspaceCreate, db: DbSession):
    workspace = Workspace(name=payload.name, plan=payload.plan)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceRead)
def update_workspace(workspace_id: UUID, payload: WorkspaceUpdate, db: DbSession):
    workspace = get_workspace_or_404(db, workspace_id)
    if payload.name is not None:
        workspace.name = payload.name
    if payload.plan is not None:
        workspace.plan = payload.plan
    db.commit()
    db.refresh(workspace)
    return workspace


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: UUID, db: DbSession):
    workspace = get_workspace_or_404(db, workspace_id)
    db.delete(workspace)
    db.commit()
