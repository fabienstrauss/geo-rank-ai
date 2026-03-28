from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from models import (
    CompetitorSnapshot,
    Connector,
    Prompt,
    PromptMetricSnapshot,
    PromptStatus,
    ProviderCredential,
    QueueJob,
    QueueJobStatus,
    Run,
    RunLog,
    RunPrompt,
    RunStatus,
    RunStepEvent,
    RunType,
    ScrapeResult,
    SourceCitation,
    Worker,
    WorkerStatus,
)
from plugins.base import CitationResult, ScraperInput
from plugins.registry import build_scraper_runner, get_scraper_plugin
from schemas import ManualRunCreate, RunDetailRead, WorkerProcessResultRead
from security import decrypt_secret
from services.read_models import get_run_or_404
from services.settings import get_workspace_setting


def _resolve_prompt_scope(db: Session, workspace_id: UUID, payload: ManualRunCreate) -> list[Prompt]:
    prompt_query = select(Prompt).where(Prompt.workspace_id == workspace_id)
    if payload.prompt_ids:
        prompt_query = prompt_query.where(Prompt.id.in_(payload.prompt_ids))
    else:
        prompt_query = prompt_query.where(Prompt.status == PromptStatus.ACTIVE)

    prompts = db.scalars(prompt_query.order_by(Prompt.created_at.asc())).all()
    if not prompts:
        if payload.prompt_ids:
            raise HTTPException(status_code=400, detail="The selected prompts could not be found in this workspace")
        raise HTTPException(
            status_code=400,
            detail="No active prompts are available for this run. Activate at least one prompt in the Prompts page first.",
        )
    return prompts


def _resolve_connector(db: Session, workspace_id: UUID, payload: ManualRunCreate) -> Connector:
    connector_id = payload.connector_id
    if connector_id is None:
        default_connector = get_workspace_setting(db, workspace_id, "default_connector")
        default_connector_id = (default_connector.value_json or {}).get("connector_id") if default_connector else None
        if default_connector_id:
            connector_id = UUID(str(default_connector_id))

    if connector_id is None:
        raise HTTPException(
            status_code=400,
            detail="No connector is configured for this run. Set a default connector in Settings or choose one explicitly.",
        )

    connector = db.get(Connector, connector_id)
    if not connector or connector.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Connector not found for this workspace")
    if not connector.is_enabled:
        raise HTTPException(
            status_code=400,
            detail=f"Connector '{connector.name}' is disabled. Enable it in Settings before running prompts.",
        )

    try:
        get_scraper_plugin(connector.implementation_key)
    except HTTPException as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Connector '{connector.name}' points to an unavailable scraper implementation: '{connector.implementation_key}'.",
        ) from exc
    return connector


def _collect_models(prompts: Iterable[Prompt], payload: ManualRunCreate) -> list[str]:
    if payload.models:
        return payload.models

    models: list[str] = []
    for prompt in prompts:
        for model in prompt.selected_models:
            if model not in models:
                models.append(model)
    if not models:
        raise HTTPException(
            status_code=400,
            detail="No models are configured for the selected prompts. Add at least one model in the Prompts page first.",
        )
    return models


def create_manual_run(db: Session, *, workspace_id: UUID, payload: ManualRunCreate) -> Run:
    prompts = _resolve_prompt_scope(db, workspace_id, payload)
    connector = _resolve_connector(db, workspace_id, payload)
    selected_models = _collect_models(prompts, payload)
    plugin = get_scraper_plugin(connector.implementation_key)

    run = Run(
        workspace_id=workspace_id,
        run_type=payload.run_type,
        status=RunStatus.QUEUED,
        scope_description=payload.scope_description or f"Manual run across {len(prompts)} prompts",
        scope_filters={
            "trigger": "manual",
            "prompt_ids": [str(prompt.id) for prompt in prompts],
            "connector_id": str(connector.id),
            "implementation_key": connector.implementation_key,
        },
        selected_models=selected_models,
        prompt_count=len(prompts),
    )
    db.add(run)
    db.flush()

    db.add(
        RunStepEvent(
            run_id=run.id,
            step_name="queued",
            status=QueueJobStatus.QUEUED,
            message=f"Queued manual run with {plugin.name}",
        )
    )
    db.add(
        RunLog(
            run_id=run.id,
            level="info",
            message=f"Prepared {len(prompts)} prompts for connector '{connector.name}' via implementation '{connector.implementation_key}'",
        )
    )

    for prompt in prompts:
        run_prompt = RunPrompt(
            run_id=run.id,
            prompt_id=prompt.id,
            status=QueueJobStatus.QUEUED,
        )
        db.add(run_prompt)
        db.flush()

        for model in selected_models:
            db.add(
                QueueJob(
                    workspace_id=workspace_id,
                    run_id=run.id,
                    prompt_id=prompt.id,
                    connector_id=connector.id,
                    status=QueueJobStatus.QUEUED,
                    payload_json={
                        "run_prompt_id": str(run_prompt.id),
                        "model": model,
                        "implementation_key": connector.implementation_key,
                        "prompt_text": prompt.prompt_text,
                        "target_brand": prompt.target_brand,
                    },
                )
            )

    db.commit()
    return get_run_or_404(db, run.id)


def _resolve_provider_api_key(db: Session, workspace_id: UUID, provider_key: str | None) -> str | None:
    if not provider_key:
        return None
    credential = db.scalar(
        select(ProviderCredential).where(
            ProviderCredential.workspace_id == workspace_id,
            ProviderCredential.provider == provider_key,
        )
    )
    if not credential or not credential.is_enabled or not credential.encrypted_api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No enabled API key is configured for provider '{provider_key}'. Add it in Settings before running this connector.",
        )
    return decrypt_secret(credential.encrypted_api_key)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_sentiment(sentiment_score: float | None) -> float:
    if sentiment_score is None:
        return 50.0
    return _clamp(sentiment_score, 0.0, 100.0)


def _build_visibility_score(
    *,
    target_mentioned: bool,
    mentions_count: int,
    citation_count: int,
    competitor_count: int,
    sentiment_score: float | None,
) -> float:
    base = 12.0
    if target_mentioned:
        base += 34.0
    base += min(mentions_count, 6) * 5.5
    base += min(citation_count, 6) * 4.5
    base += (_normalize_sentiment(sentiment_score) - 50.0) * 0.18
    base -= min(competitor_count, 4) * 3.0
    return round(_clamp(base, 0.0, 100.0), 1)


def _build_brand_weights(prompt: Prompt, scrape_result: ScrapeResult) -> dict[str, float]:
    weights: dict[str, float] = {}
    target_brand = prompt.target_brand.strip()
    if target_brand:
        target_weight = 1.2 if scrape_result.target_mentioned else 0.35
        target_weight += min(scrape_result.mentions_count, 5) * 0.2
        target_weight += max(0.0, (_normalize_sentiment(scrape_result.sentiment_score) - 50.0) / 100.0)
        weights[target_brand] = target_weight

    for index, brand in enumerate(scrape_result.competitors_mentioned, start=1):
        normalized = brand.strip()
        if not normalized:
            continue
        competitor_weight = max(0.25, 0.95 - (index - 1) * 0.18)
        weights[normalized] = max(weights.get(normalized, 0.0), competitor_weight)

    return weights


def _upsert_prompt_snapshot(
    db: Session,
    *,
    prompt: Prompt,
    scrape_result: ScrapeResult,
    citation_rows: list[CitationResult],
    snapshot_at: datetime,
) -> PromptMetricSnapshot:
    visibility_score = _build_visibility_score(
        target_mentioned=scrape_result.target_mentioned,
        mentions_count=scrape_result.mentions_count,
        citation_count=sum(citation.citation_count for citation in citation_rows),
        competitor_count=len(scrape_result.competitors_mentioned),
        sentiment_score=scrape_result.sentiment_score,
    )
    snapshot = PromptMetricSnapshot(
        workspace_id=prompt.workspace_id,
        category_id=prompt.category_id,
        prompt_id=prompt.id,
        snapshot_at=snapshot_at,
        visibility_score=visibility_score,
        sentiment_score=scrape_result.sentiment_score,
        mentions_count=scrape_result.mentions_count,
        metadata_json={
            "run_id": str(scrape_result.run_id),
            "scrape_result_id": str(scrape_result.id),
            "llm_provider": scrape_result.llm_provider,
            "llm_model": scrape_result.llm_model,
        },
    )
    db.add(snapshot)
    return snapshot


def _write_competitor_snapshots(
    db: Session,
    *,
    prompt: Prompt,
    scrape_result: ScrapeResult,
    snapshot_at: datetime,
) -> None:
    brand_weights = _build_brand_weights(prompt, scrape_result)
    if not brand_weights:
        return

    sorted_brands = sorted(brand_weights.items(), key=lambda item: item[1], reverse=True)
    total_weight = sum(weight for _, weight in sorted_brands) or 1.0
    for index, (brand, weight) in enumerate(sorted_brands, start=1):
        share = round((weight / total_weight) * 100, 1)
        db.add(
            CompetitorSnapshot(
                workspace_id=prompt.workspace_id,
                brand=brand,
                snapshot_at=snapshot_at,
                avg_rank=float(index),
                share_of_voice=share,
                metadata_json={
                    "run_id": str(scrape_result.run_id),
                    "prompt_id": str(prompt.id),
                    "llm_model": scrape_result.llm_model,
                    "weight": round(weight, 3),
                },
            )
        )


def _update_run_status(db: Session, run: Run, *, status: RunStatus, message: str) -> None:
    run.status = status
    db.add(RunLog(run_id=run.id, level="info", message=message))
    db.add(RunStepEvent(run_id=run.id, step_name=status.value, status=QueueJobStatus(status.value), message=message))


def _ensure_run_running(db: Session, run: Run, *, message: str) -> None:
    if run.status == RunStatus.RUNNING:
        return
    run.status = RunStatus.RUNNING
    if run.started_at is None:
        run.started_at = datetime.now(timezone.utc)
    db.add(RunLog(run_id=run.id, level="info", message=message))
    db.add(RunStepEvent(run_id=run.id, step_name="running", status=QueueJobStatus.RUNNING, message=message))


def _complete_run(db: Session, run: Run) -> RunDetailRead:
    run.completed_at = datetime.now(timezone.utc)
    if run.started_at:
        run.duration_seconds = int((run.completed_at - run.started_at).total_seconds())
    run.mentions_count = sum(result.mentions_count for result in run.scrape_results)
    prompt_snapshot_rows = db.scalars(
        select(PromptMetricSnapshot)
        .where(PromptMetricSnapshot.prompt_id.in_(select(RunPrompt.prompt_id).where(RunPrompt.run_id == run.id)))
        .order_by(PromptMetricSnapshot.snapshot_at.desc())
    ).all()
    current_snapshots = [row for row in prompt_snapshot_rows if (row.metadata_json or {}).get("run_id") == str(run.id)]
    previous_snapshots_by_prompt: dict[UUID, PromptMetricSnapshot] = {}
    for row in prompt_snapshot_rows:
        if row.prompt_id is None or row.prompt_id in previous_snapshots_by_prompt:
            continue
        if (row.metadata_json or {}).get("run_id") == str(run.id):
            continue
        previous_snapshots_by_prompt[row.prompt_id] = row

    if current_snapshots:
        current_avg_visibility = sum((row.visibility_score or 0) for row in current_snapshots) / len(current_snapshots)
        comparable_previous = [
            previous_snapshots_by_prompt[row.prompt_id]
            for row in current_snapshots
            if row.prompt_id in previous_snapshots_by_prompt
        ]
        if comparable_previous:
            previous_avg_visibility = sum((row.visibility_score or 0) for row in comparable_previous) / len(comparable_previous)
            run.visibility_delta = round(current_avg_visibility - previous_avg_visibility, 1)
        else:
            run.visibility_delta = round(current_avg_visibility, 1)

    queued_or_running = any(job.status in {QueueJobStatus.QUEUED, QueueJobStatus.RUNNING} for job in run.queue_jobs)
    failed = any(job.status == QueueJobStatus.FAILED for job in run.queue_jobs)
    run.status = RunStatus.FAILED if failed and not queued_or_running else RunStatus.COMPLETED
    db.add(
        RunStepEvent(
            run_id=run.id,
            step_name="completed" if run.status == RunStatus.COMPLETED else "failed",
            status=QueueJobStatus.COMPLETED if run.status == RunStatus.COMPLETED else QueueJobStatus.FAILED,
            message=f"Processed {len(run.queue_jobs)} queued job(s)",
        )
    )
    db.add(RunLog(run_id=run.id, level="info", message=f"Run finished with status '{run.status.value}'"))
    db.commit()
    return get_run_or_404(db, run.id)


def execute_run_now(db: Session, *, run_id: UUID) -> RunDetailRead:
    run = db.scalar(
        select(Run)
        .where(Run.id == run_id)
        .options(
            selectinload(Run.queue_jobs).selectinload(QueueJob.connector),
            selectinload(Run.scrape_results),
            selectinload(Run.run_prompts),
        )
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in {RunStatus.QUEUED, RunStatus.FAILED}:
        raise HTTPException(
            status_code=400,
            detail=f"Run '{run.id}' is already '{run.status.value}'. Only queued or failed runs can be executed.",
        )

    queued_jobs = [job for job in run.queue_jobs if job.status == QueueJobStatus.QUEUED]
    if not queued_jobs:
        raise HTTPException(status_code=400, detail="This run has no queued jobs left to execute.")

    _ensure_run_running(db, run, message=f"Starting synchronous execution for {len(queued_jobs)} queued job(s)")
    db.flush()

    for job in queued_jobs:
        _process_queue_job(db, job)

    db.flush()
    return _complete_run(db, run)


def _process_queue_job(db: Session, job: QueueJob, *, worker: Worker | None = None) -> QueueJobStatus:
    connector = job.connector or (db.get(Connector, job.connector_id) if job.connector_id else None)
    prompt = db.get(Prompt, job.prompt_id) if job.prompt_id else None
    run = db.get(Run, job.run_id) if job.run_id else None
    run_prompt_id = str((job.payload_json or {}).get("run_prompt_id") or "")
    run_prompt = db.get(RunPrompt, UUID(run_prompt_id)) if run_prompt_id else None

    if connector is None or prompt is None or run is None:
        job.status = QueueJobStatus.FAILED
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = "Missing connector, prompt, or run for queued job"
        return job.status

    _ensure_run_running(
        db,
        run,
        message=f"{'Worker ' + worker.worker_name if worker else 'Executor'} processing queued jobs for run '{run.id}'",
    )
    job.status = QueueJobStatus.RUNNING
    job.started_at = datetime.now(timezone.utc)
    if worker:
        job.worker_id = worker.id
        worker.status = WorkerStatus.BUSY
        worker.current_job = f"Queue job {job.id}"
        worker.last_heartbeat_at = job.started_at
    if run_prompt:
        run_prompt.status = QueueJobStatus.RUNNING

    try:
        runner = build_scraper_runner(connector.implementation_key)
        result = runner.run(
            ScraperInput(
                workspace_id=run.workspace_id,
                connector_id=connector.id,
                prompt_id=prompt.id,
                run_id=run.id,
                provider_key=connector.provider_key,
                provider_api_key=_resolve_provider_api_key(db, run.workspace_id, connector.provider_key),
                model=str((job.payload_json or {}).get("model") or ""),
                prompt_text=prompt.prompt_text,
                target_brand=prompt.target_brand,
                expected_competitors=prompt.expected_competitors,
                config=connector.config_json or {},
            )
        )
        scrape_result = ScrapeResult(
            run_id=run.id,
            prompt_id=prompt.id,
            run_prompt_id=run_prompt.id if run_prompt else None,
            llm_provider=connector.provider_key or connector.implementation_key,
            llm_model=str((job.payload_json or {}).get("model") or ""),
            raw_output=result.raw_output,
            target_mentioned=result.target_mentioned,
            competitors_mentioned=result.competitors_mentioned,
            sentiment_score=result.sentiment_score,
            mentions_count=result.mentions_count,
            citations=[citation.model_dump() if isinstance(citation, CitationResult) else dict(citation) for citation in result.citations],
            sources=[citation.model_dump() if isinstance(citation, CitationResult) else dict(citation) for citation in result.citations],
        )
        db.add(scrape_result)
        db.flush()

        citation_rows: list[CitationResult] = []
        for citation in result.citations:
            citation_row = citation if isinstance(citation, CitationResult) else CitationResult.model_validate(citation)
            citation_rows.append(citation_row)
            db.add(
                SourceCitation(
                    scrape_result_id=scrape_result.id,
                    source_type=citation_row.source_type,
                    domain=citation_row.domain,
                    url=citation_row.url,
                    citation_count=citation_row.citation_count,
                    metadata_json=citation_row.metadata,
                )
            )

        completed_at = datetime.now(timezone.utc)
        _upsert_prompt_snapshot(
            db,
            prompt=prompt,
            scrape_result=scrape_result,
            citation_rows=citation_rows,
            snapshot_at=completed_at,
        )
        _write_competitor_snapshots(
            db,
            prompt=prompt,
            scrape_result=scrape_result,
            snapshot_at=completed_at,
        )

        job.status = QueueJobStatus.COMPLETED
        job.completed_at = completed_at
        job.error_message = None
        if run_prompt:
            run_prompt.status = QueueJobStatus.COMPLETED
            run_prompt.mentions_count = result.mentions_count
            run_prompt.error_message = None
        db.add(RunLog(run_id=run.id, level="info", message=f"Completed prompt '{prompt.id}' for model '{scrape_result.llm_model}'"))
    except HTTPException as exc:
        job.status = QueueJobStatus.FAILED
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = str(exc.detail)
        if run_prompt:
            run_prompt.status = QueueJobStatus.FAILED
            run_prompt.error_message = str(exc.detail)
        db.add(RunLog(run_id=run.id, level="error", message=f"Job {job.id} failed: {exc.detail}"))

    return job.status


def process_next_queue_jobs_for_worker(db: Session, *, worker_id: UUID, limit: int) -> WorkerProcessResultRead:
    worker = db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    worker.last_heartbeat_at = datetime.now(timezone.utc)
    worker.status = WorkerStatus.ONLINE
    worker.current_job = None
    db.flush()

    query = (
        select(QueueJob)
        .where(QueueJob.status == QueueJobStatus.QUEUED)
        .order_by(QueueJob.priority.desc(), QueueJob.queued_at.asc())
        .limit(limit)
        .with_for_update(skip_locked=True)
        .options(selectinload(QueueJob.connector))
    )
    if worker.connector_id:
        query = query.where(QueueJob.connector_id == worker.connector_id)

    jobs = db.scalars(query).all()
    if not jobs:
        worker.queue_depth = 0
        db.commit()
        return WorkerProcessResultRead(
            worker_id=worker.id,
            processed_job_ids=[],
            completed_job_ids=[],
            failed_job_ids=[],
            completed_run_ids=[],
            remaining_queue_depth=0,
        )

    processed_job_ids: list[UUID] = []
    completed_job_ids: list[UUID] = []
    failed_job_ids: list[UUID] = []
    completed_run_ids: list[UUID] = []
    touched_run_ids: set[UUID] = set()

    for job in jobs:
        status = _process_queue_job(db, job, worker=worker)
        processed_job_ids.append(job.id)
        touched_run_ids.add(job.run_id) if job.run_id else None
        if status == QueueJobStatus.COMPLETED:
            completed_job_ids.append(job.id)
        elif status == QueueJobStatus.FAILED:
            failed_job_ids.append(job.id)

    db.flush()

    for run_id in touched_run_ids:
        run = db.scalar(
            select(Run)
            .where(Run.id == run_id)
            .options(selectinload(Run.queue_jobs), selectinload(Run.scrape_results), selectinload(Run.run_prompts))
        )
        if run and not any(job.status in {QueueJobStatus.QUEUED, QueueJobStatus.RUNNING} for job in run.queue_jobs):
            _complete_run(db, run)
            completed_run_ids.append(run.id)

    remaining_query = select(func.count()).select_from(QueueJob).where(QueueJob.status == QueueJobStatus.QUEUED)
    if worker.connector_id:
        remaining_query = remaining_query.where(QueueJob.connector_id == worker.connector_id)
    worker.queue_depth = int(db.scalar(remaining_query) or 0)
    worker.status = WorkerStatus.ONLINE
    worker.current_job = None
    worker.last_heartbeat_at = datetime.now(timezone.utc)
    db.commit()

    return WorkerProcessResultRead(
        worker_id=worker.id,
        processed_job_ids=processed_job_ids,
        completed_job_ids=completed_job_ids,
        failed_job_ids=failed_job_ids,
        completed_run_ids=completed_run_ids,
        remaining_queue_depth=worker.queue_depth,
    )
