from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from deps import DbSession, get_workspace_or_404
from schemas import RunDetailRead, RunListRead
from services.read_models import build_run_list_response, get_run_or_404


router = APIRouter(tags=["runs"])


@router.get("/workspaces/{workspace_id}/runs", response_model=RunListRead)
def list_runs(
    workspace_id: UUID,
    db: DbSession,
    statuses: Annotated[list[str] | None, Query()] = None,
    run_types: Annotated[list[str] | None, Query()] = None,
    search: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
):
    get_workspace_or_404(db, workspace_id)
    return build_run_list_response(
        db,
        workspace_id=workspace_id,
        statuses=statuses,
        run_types=run_types,
        search=search,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/runs/{run_id}", response_model=RunDetailRead)
def get_run(run_id: UUID, db: DbSession):
    return get_run_or_404(db, run_id)
