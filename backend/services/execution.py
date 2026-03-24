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
)
from plugins.base import CitationResult, ScraperInput
from plugins.registry import build_scraper_runner, get_scraper_plugin
from schemas import ManualRunCreate, RunDetailRead
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
        raise HTTPException(status_code=400, detail="No prompts available for this run")
    return prompts


def _resolve_connector(db: Session, workspace_id: UUID, payload: ManualRunCreate) -> Connector:
    connector_id = payload.connector_id
    if connector_id is None:
        default_connector = get_workspace_setting(db, workspace_id, "default_connector")
        default_connector_id = (default_connector.value_json or {}).get("connector_id") if default_connector else None
        if default_connector_id:
            connector_id = UUID(str(default_connector_id))

    if connector_id is None:
        raise HTTPException(status_code=400, detail="No connector selected for this run")

    connector = db.get(Connector, connector_id)
    if not connector or connector.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Connector not found for this workspace")
    if not connector.is_enabled:
        raise HTTPException(status_code=400, detail="Connector must be enabled before running prompts")

    get_scraper_plugin(connector.implementation_key)
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
        raise HTTPException(status_code=400, detail="No models available for this run")
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
        raise HTTPException(status_code=400, detail=f"No enabled API credential found for provider '{provider_key}'")
    return decrypt_secret(credential.encrypted_api_key)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _build_visibility_score(*, target_mentioned: bool, mentions_count: int, citation_count: int) -> float:
    base = 18.0
    if target_mentioned:
        base += 42.0
    base += min(mentions_count, 5) * 6.0
    base += min(citation_count, 5) * 4.0
    return round(_clamp(base, 0.0, 100.0), 1)


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
    brands = [prompt.target_brand, *scrape_result.competitors_mentioned]
    unique_brands: list[str] = []
    for brand in brands:
        normalized = brand.strip()
        if normalized and normalized not in unique_brands:
            unique_brands.append(normalized)

    if not unique_brands:
        return

    total_brands = len(unique_brands)
    total_mentions = max(scrape_result.mentions_count, 1)
    for index, brand in enumerate(unique_brands, start=1):
        mention_weight = 1.0 if brand == prompt.target_brand and scrape_result.target_mentioned else 0.8
        share = round((mention_weight / total_mentions) * 100, 1)
        db.add(
            CompetitorSnapshot(
                workspace_id=prompt.workspace_id,
                brand=brand,
                snapshot_at=snapshot_at,
                avg_rank=float(index),
                share_of_voice=share if share > 0 else round(100 / total_brands, 1),
                metadata_json={
                    "run_id": str(scrape_result.run_id),
                    "prompt_id": str(prompt.id),
                    "llm_model": scrape_result.llm_model,
                },
            )
        )


def _update_run_status(db: Session, run: Run, *, status: RunStatus, message: str) -> None:
    run.status = status
    db.add(RunLog(run_id=run.id, level="info", message=message))
    db.add(RunStepEvent(run_id=run.id, step_name=status.value, status=QueueJobStatus(status.value), message=message))


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
        raise HTTPException(status_code=400, detail="Only queued or failed runs can be executed")

    queued_jobs = [job for job in run.queue_jobs if job.status == QueueJobStatus.QUEUED]
    if not queued_jobs:
        raise HTTPException(status_code=400, detail="Run has no queued jobs to execute")

    run.status = RunStatus.RUNNING
    run.started_at = datetime.now(timezone.utc)
    db.add(RunLog(run_id=run.id, level="info", message=f"Starting synchronous execution for {len(queued_jobs)} queued job(s)"))
    db.add(RunStepEvent(run_id=run.id, step_name="running", status=QueueJobStatus.RUNNING, message="Processing queued jobs"))
    db.flush()

    run_prompt_by_id = {str(item.id): item for item in run.run_prompts}

    for job in queued_jobs:
        connector = job.connector or (db.get(Connector, job.connector_id) if job.connector_id else None)
        prompt = db.get(Prompt, job.prompt_id) if job.prompt_id else None
        if connector is None or prompt is None:
            job.status = QueueJobStatus.FAILED
            job.error_message = "Missing connector or prompt for queued job"
            continue

        run_prompt = run_prompt_by_id.get(str((job.payload_json or {}).get("run_prompt_id")))
        job.status = QueueJobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
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

            _upsert_prompt_snapshot(
                db,
                prompt=prompt,
                scrape_result=scrape_result,
                citation_rows=citation_rows,
                snapshot_at=job.completed_at or datetime.now(timezone.utc),
            )
            _write_competitor_snapshots(
                db,
                prompt=prompt,
                scrape_result=scrape_result,
                snapshot_at=job.completed_at or datetime.now(timezone.utc),
            )

            job.status = QueueJobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
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

    db.flush()
    return _complete_run(db, run)
