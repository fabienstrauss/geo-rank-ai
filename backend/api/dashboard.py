from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter

from deps import DbSession
from schemas import DashboardRead
from services.dashboard import build_dashboard_response


router = APIRouter(tags=["dashboard"])


@router.get("/workspaces/{workspace_id}/dashboard", response_model=DashboardRead)
def get_dashboard(workspace_id: UUID, db: DbSession):
    return build_dashboard_response(db, workspace_id)
