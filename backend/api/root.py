from __future__ import annotations

from fastapi import APIRouter

from database import Base
from deps import DbSession
from schemas import WorkspaceRead
from seed import seed_dev_data


router = APIRouter()


@router.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "GeoRank API is running",
        "database_tables": sorted(Base.metadata.tables.keys()),
    }


@router.post("/dev/seed", response_model=WorkspaceRead)
def seed_database(db: DbSession):
    workspace = seed_dev_data(db)
    return workspace
