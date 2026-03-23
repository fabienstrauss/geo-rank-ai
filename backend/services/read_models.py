from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from models import Prompt, PromptCategory, PromptMetricSnapshot, Run, RunStatus, ScrapeResult
from schemas import PromptListSummaryRead, PromptListRead, PromptRead, RunListRead, RunListSummaryRead


def get_category_or_404(db: Session, category_id: UUID) -> PromptCategory:
    category = db.get(PromptCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


def get_prompt_or_404(db: Session, prompt_id: UUID) -> Prompt:
    prompt = db.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


def get_run_or_404(db: Session, run_id: UUID) -> Run:
    run = db.scalar(
        select(Run)
        .where(Run.id == run_id)
        .options(selectinload(Run.step_events), selectinload(Run.logs), selectinload(Run.scrape_results))
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def get_latest_prompt_snapshots(db: Session, prompt_ids: list[UUID]) -> dict[UUID, PromptMetricSnapshot]:
    if not prompt_ids:
        return {}

    latest_snapshot_subquery = (
        select(
            PromptMetricSnapshot.prompt_id.label("prompt_id"),
            func.max(PromptMetricSnapshot.snapshot_at).label("snapshot_at"),
        )
        .where(PromptMetricSnapshot.prompt_id.in_(prompt_ids))
        .group_by(PromptMetricSnapshot.prompt_id)
        .subquery()
    )
    snapshots = db.scalars(
        select(PromptMetricSnapshot).join(
            latest_snapshot_subquery,
            and_(
                PromptMetricSnapshot.prompt_id == latest_snapshot_subquery.c.prompt_id,
                PromptMetricSnapshot.snapshot_at == latest_snapshot_subquery.c.snapshot_at,
            ),
        )
    ).all()
    return {snapshot.prompt_id: snapshot for snapshot in snapshots if snapshot.prompt_id}


def get_latest_scrape_results(db: Session, prompt_ids: list[UUID]) -> dict[UUID, ScrapeResult]:
    if not prompt_ids:
        return {}

    latest_result_subquery = (
        select(
            ScrapeResult.prompt_id.label("prompt_id"),
            func.max(ScrapeResult.executed_at).label("executed_at"),
        )
        .where(ScrapeResult.prompt_id.in_(prompt_ids))
        .group_by(ScrapeResult.prompt_id)
        .subquery()
    )
    results = db.scalars(
        select(ScrapeResult).join(
            latest_result_subquery,
            and_(
                ScrapeResult.prompt_id == latest_result_subquery.c.prompt_id,
                ScrapeResult.executed_at == latest_result_subquery.c.executed_at,
            ),
        )
    ).all()
    return {result.prompt_id: result for result in results}


def get_prompt_list_summary(db: Session, base_query):
    filtered_prompts = base_query.subquery()
    latest_snapshot_subquery = (
        select(
            PromptMetricSnapshot.prompt_id.label("prompt_id"),
            func.max(PromptMetricSnapshot.snapshot_at).label("snapshot_at"),
        )
        .join(filtered_prompts, PromptMetricSnapshot.prompt_id == filtered_prompts.c.id)
        .group_by(PromptMetricSnapshot.prompt_id)
        .subquery()
    )
    return db.execute(
        select(
            func.count(func.distinct(filtered_prompts.c.id)).label("total"),
            func.count(func.distinct(filtered_prompts.c.category_id)).label("visible_categories"),
            func.avg(PromptMetricSnapshot.visibility_score).label("avg_visibility"),
        ).select_from(
            filtered_prompts.outerjoin(
                latest_snapshot_subquery,
                filtered_prompts.c.id == latest_snapshot_subquery.c.prompt_id,
            ).outerjoin(
                PromptMetricSnapshot,
                and_(
                    PromptMetricSnapshot.prompt_id == latest_snapshot_subquery.c.prompt_id,
                    PromptMetricSnapshot.snapshot_at == latest_snapshot_subquery.c.snapshot_at,
                ),
            )
        )
    ).one()


def build_prompt_base_query(
    workspace_id: UUID,
    category_ids: list[UUID] | None = None,
    status: str | None = None,
    search: str | None = None,
):
    query = select(Prompt).where(Prompt.workspace_id == workspace_id)
    if category_ids:
        query = query.where(Prompt.category_id.in_(category_ids))
    if status:
        query = query.where(Prompt.status == status)
    if search:
        normalized = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Prompt.prompt_text).like(normalized),
                func.lower(Prompt.target_brand).like(normalized),
                func.lower(func.coalesce(cast(Prompt.selected_models, String), "")).like(normalized),
            )
        )
    return query


def build_run_base_query(
    workspace_id: UUID,
    statuses: list[str] | None = None,
    run_types: list[str] | None = None,
    search: str | None = None,
):
    query = select(Run).where(Run.workspace_id == workspace_id)
    if statuses:
        query = query.where(Run.status.in_(statuses))
    if run_types:
        query = query.where(Run.run_type.in_(run_types))
    if search:
        normalized = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                cast(Run.id, String).ilike(normalized),
                func.lower(func.coalesce(Run.scope_description, "")).like(normalized),
                func.lower(func.coalesce(cast(Run.selected_models, String), "")).like(normalized),
            )
        )
    return query


def build_prompt_list_response(
    db: Session,
    *,
    workspace_id: UUID,
    category_ids: list[UUID] | None,
    status: str | None,
    search: str | None,
    limit: int,
    offset: int,
    sort_by: str,
    sort_order: str,
) -> PromptListRead:
    base_query = build_prompt_base_query(
        workspace_id=workspace_id,
        category_ids=category_ids,
        status=status,
        search=search,
    )
    query = base_query.options(selectinload(Prompt.category))
    sort_columns = {
        "created_at": Prompt.created_at,
        "updated_at": Prompt.updated_at,
        "prompt_text": Prompt.prompt_text,
        "status": Prompt.status,
    }
    sort_column = sort_columns.get(sort_by, Prompt.created_at)
    query = query.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc())

    summary_row = get_prompt_list_summary(db, base_query)
    total = int(summary_row.total or 0)
    prompts = db.scalars(query.offset(offset).limit(limit)).all()
    latest_snapshots = get_latest_prompt_snapshots(db, [prompt.id for prompt in prompts])
    latest_results = get_latest_scrape_results(db, [prompt.id for prompt in prompts])
    items: list[PromptRead] = []
    for prompt in prompts:
        latest_snapshot = latest_snapshots.get(prompt.id)
        latest_result = latest_results.get(prompt.id)
        items.append(
            PromptRead(
                id=prompt.id,
                workspace_id=prompt.workspace_id,
                category_id=prompt.category_id,
                prompt_text=prompt.prompt_text,
                target_brand=prompt.target_brand,
                expected_competitors=prompt.expected_competitors,
                selected_models=prompt.selected_models,
                status=prompt.status,
                created_at=prompt.created_at,
                updated_at=prompt.updated_at,
                category_name=prompt.category.name if prompt.category else None,
                visibility=latest_snapshot.visibility_score if latest_snapshot else None,
                sentiment=latest_snapshot.sentiment_score if latest_snapshot else None,
                mentions=latest_snapshot.mentions_count if latest_snapshot else None,
                last_run_at=latest_result.executed_at if latest_result else None,
            )
        )
    return PromptListRead(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        summary=PromptListSummaryRead(
            total=total,
            visible_categories=int(summary_row.visible_categories or 0),
            avg_visibility=round(float(summary_row.avg_visibility), 1) if summary_row.avg_visibility is not None else None,
        ),
    )


def build_run_list_response(
    db: Session,
    *,
    workspace_id: UUID,
    statuses: list[str] | None,
    run_types: list[str] | None,
    search: str | None,
    limit: int,
    offset: int,
    sort_by: str,
    sort_order: str,
) -> RunListRead:
    query = build_run_base_query(
        workspace_id=workspace_id,
        statuses=statuses,
        run_types=run_types,
        search=search,
    )
    sort_columns = {
        "created_at": Run.created_at,
        "started_at": Run.started_at,
        "completed_at": Run.completed_at,
        "status": Run.status,
        "run_type": Run.run_type,
        "visibility_delta": Run.visibility_delta,
    }
    sort_column = sort_columns.get(sort_by, Run.created_at)
    query = query.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc(), Run.created_at.desc())

    filtered_runs = query.order_by(None).subquery()
    summary_row = db.execute(
        select(
            func.count().label("total"),
            func.count().filter(filtered_runs.c.status == RunStatus.RUNNING).label("running"),
            func.count().filter(filtered_runs.c.status == RunStatus.FAILED).label("failed"),
            func.avg(filtered_runs.c.visibility_delta).label("avg_visibility_delta"),
            func.max(filtered_runs.c.completed_at).label("last_completed_at"),
        )
    ).one()
    total = int(summary_row.total or 0)
    items = db.scalars(query.offset(offset).limit(limit)).all()
    return RunListRead(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        summary=RunListSummaryRead(
            total=total,
            running=int(summary_row.running or 0),
            failed=int(summary_row.failed or 0),
            avg_visibility_delta=round(float(summary_row.avg_visibility_delta), 1) if summary_row.avg_visibility_delta is not None else None,
            last_completed_at=summary_row.last_completed_at,
        ),
    )
