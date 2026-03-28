from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from sqlalchemy import select

from database import SessionLocal
from models import Worker, WorkerStatus
from services.execution import process_next_queue_jobs_for_worker


POLL_INTERVAL_SECONDS = float(os.getenv("DEV_WORKER_POLL_INTERVAL", "3"))
DEV_WORKER_NAME = os.getenv("DEV_WORKER_NAME", "dev-worker-01")
DEV_WORKER_POOL = os.getenv("DEV_WORKER_POOL", "Dev Worker Pool")


def ensure_dev_worker() -> Worker:
    with SessionLocal() as db:
        existing = db.scalar(select(Worker).where(Worker.worker_name == DEV_WORKER_NAME))
        if existing:
            return existing

        fallback = db.scalar(select(Worker).order_by(Worker.created_at.asc()))
        if fallback:
            return fallback

        worker = Worker(
            worker_name=DEV_WORKER_NAME,
            pool_name=DEV_WORKER_POOL,
            status=WorkerStatus.ONLINE,
            current_job=None,
            queue_depth=0,
            cpu_percent=0.0,
            memory_percent=0.0,
            uptime_seconds=0,
            last_heartbeat_at=datetime.now(timezone.utc),
        )
        db.add(worker)
        db.commit()
        db.refresh(worker)
        return worker


def main() -> None:
    print("Starting GeoRank dev worker loop...")

    while True:
        try:
            worker = ensure_dev_worker()
            with SessionLocal() as db:
                result = process_next_queue_jobs_for_worker(db, worker_id=worker.id, limit=5)
            if result.processed_job_ids:
                print(
                    "Processed jobs:",
                    ", ".join(str(job_id) for job_id in result.processed_job_ids),
                    f"(completed={len(result.completed_job_ids)}, failed={len(result.failed_job_ids)})",
                )
        except Exception as exc:  # pragma: no cover - dev runner resilience
            print(f"Dev worker loop error: {exc}")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
