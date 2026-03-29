from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from deps import DbSession, get_workspace_or_404
from models import Connector, ConnectorIncident, QueueJob, Worker
from schemas import ConnectorIncidentRead, QueueJobRead, WorkerProcessRequest, WorkerProcessResultRead, WorkerRead
from services.execution import process_next_queue_jobs_for_worker


router = APIRouter()


@router.get("/workspaces/{workspace_id}/connector-incidents", response_model=list[ConnectorIncidentRead])
def list_connector_incidents(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(ConnectorIncident)
        .join(Connector, ConnectorIncident.connector_id == Connector.id)
        .where(Connector.workspace_id == workspace_id)
        .order_by(ConnectorIncident.occurred_at.desc())
    ).all()


@router.get("/workers", response_model=list[WorkerRead])
def list_workers(db: DbSession):
    return db.scalars(select(Worker).order_by(Worker.worker_name.asc())).all()


@router.post("/workers/{worker_id}/process-next", response_model=WorkerProcessResultRead)
def process_next_queue_jobs(worker_id: UUID, payload: WorkerProcessRequest, db: DbSession):
    return process_next_queue_jobs_for_worker(db, worker_id=worker_id, limit=payload.limit)


@router.get("/workspaces/{workspace_id}/queue-jobs", response_model=list[QueueJobRead])
def list_queue_jobs(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(QueueJob).where(QueueJob.workspace_id == workspace_id).order_by(QueueJob.queued_at.desc())
    ).all()
