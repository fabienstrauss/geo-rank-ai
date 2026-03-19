from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from config import get_settings
from database import Base, get_db
from models import (
    CompetitorSnapshot,
    Connector,
    ConnectorIncident,
    Prompt,
    PromptCategory,
    PromptMetricSnapshot,
    ProviderCredential,
    QueueJob,
    Run,
    ScrapeResult,
    SourceCitation,
    Workspace,
    WorkspaceSetting,
    Worker,
)
from seed import seed_dev_data
from security import encrypt_secret, mask_secret
from schemas import (
    CategoryCreate,
    CategoryUpdate,
    ConnectorCreate,
    ConnectorIncidentRead,
    ConnectorRead,
    ConnectorUpdate,
    DashboardRead,
    PromptCreate,
    PromptRead,
    PromptUpdate,
    PromptCategoryRead,
    ProviderCredentialRead,
    ProviderCredentialUpsert,
    QueueJobRead,
    RunDetailRead,
    RunSummaryRead,
    WorkspaceCreate,
    WorkspaceRead,
    WorkspaceSettingRead,
    WorkspaceSettingUpsert,
    WorkspaceUpdate,
    WorkerRead,
)


app = FastAPI(title="GeoRank AI Backend")
DbSession = Annotated[Session, Depends(get_db)]
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_workspace_or_404(db: Session, workspace_id: UUID) -> Workspace:
    workspace = db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


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


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "message": "GeoRank API is running",
        "database_tables": sorted(Base.metadata.tables.keys()),
    }


@app.post("/dev/seed", response_model=WorkspaceRead)
def seed_database(db: DbSession):
    workspace = seed_dev_data(db)
    return workspace


@app.get("/workspaces", response_model=list[WorkspaceRead])
def list_workspaces(db: DbSession):
    return db.scalars(select(Workspace).order_by(Workspace.created_at.asc())).all()


@app.post("/workspaces", response_model=WorkspaceRead, status_code=201)
def create_workspace(payload: WorkspaceCreate, db: DbSession):
    workspace = Workspace(name=payload.name, plan=payload.plan)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


@app.patch("/workspaces/{workspace_id}", response_model=WorkspaceRead)
def update_workspace(workspace_id: UUID, payload: WorkspaceUpdate, db: DbSession):
    workspace = get_workspace_or_404(db, workspace_id)
    if payload.name is not None:
        workspace.name = payload.name
    if payload.plan is not None:
        workspace.plan = payload.plan
    db.commit()
    db.refresh(workspace)
    return workspace


@app.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(workspace_id: UUID, db: DbSession):
    workspace = get_workspace_or_404(db, workspace_id)
    db.delete(workspace)
    db.commit()


@app.get("/workspaces/{workspace_id}/categories", response_model=list[PromptCategoryRead])
def list_categories(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(PromptCategory)
        .where(PromptCategory.workspace_id == workspace_id)
        .order_by(PromptCategory.sort_order.asc(), PromptCategory.name.asc())
    ).all()


@app.post("/workspaces/{workspace_id}/categories", response_model=PromptCategoryRead, status_code=201)
def create_category(workspace_id: UUID, payload: CategoryCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    category = PromptCategory(
        workspace_id=workspace_id,
        name=payload.name,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@app.patch("/categories/{category_id}", response_model=PromptCategoryRead)
def update_category(category_id: UUID, payload: CategoryUpdate, db: DbSession):
    category = get_category_or_404(db, category_id)
    if payload.name is not None:
        category.name = payload.name
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    if payload.is_active is not None:
        category.is_active = payload.is_active
    db.commit()
    db.refresh(category)
    return category


@app.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: UUID, db: DbSession, move_to_category_id: UUID | None = None):
    category = get_category_or_404(db, category_id)
    prompts = db.scalars(select(Prompt).where(Prompt.category_id == category_id)).all()

    if prompts and move_to_category_id is None:
        raise HTTPException(status_code=400, detail="Category is not empty. Provide move_to_category_id.")

    if prompts and move_to_category_id is not None:
        target_category = get_category_or_404(db, move_to_category_id)
        if target_category.workspace_id != category.workspace_id:
            raise HTTPException(status_code=400, detail="Target category must belong to the same workspace")
        for prompt in prompts:
            prompt.category_id = move_to_category_id

    db.delete(category)
    db.commit()


@app.get("/workspaces/{workspace_id}/prompts", response_model=list[PromptRead])
def list_prompts(
    workspace_id: UUID,
    db: DbSession,
    category_ids: Annotated[list[UUID] | None, Query()] = None,
    status: str | None = None,
    search: str | None = None,
):
    get_workspace_or_404(db, workspace_id)
    query = select(Prompt).where(Prompt.workspace_id == workspace_id).order_by(Prompt.created_at.desc())
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
    prompts = db.scalars(query).all()
    items: list[PromptRead] = []
    for prompt in prompts:
        latest_snapshot = db.scalar(
            select(PromptMetricSnapshot)
            .where(PromptMetricSnapshot.prompt_id == prompt.id)
            .order_by(PromptMetricSnapshot.snapshot_at.desc())
            .limit(1)
        )
        latest_result = db.scalar(
            select(ScrapeResult).where(ScrapeResult.prompt_id == prompt.id).order_by(ScrapeResult.executed_at.desc()).limit(1)
        )
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
    return items


@app.post("/workspaces/{workspace_id}/prompts", response_model=PromptRead, status_code=201)
def create_prompt(workspace_id: UUID, payload: PromptCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    category = get_category_or_404(db, payload.category_id)
    if category.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="Category does not belong to this workspace")

    prompt = Prompt(
        workspace_id=workspace_id,
        category_id=payload.category_id,
        prompt_text=payload.prompt_text,
        target_brand=payload.target_brand,
        expected_competitors=payload.expected_competitors,
        selected_models=payload.selected_models,
        status=payload.status,
    )
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return prompt


@app.patch("/prompts/{prompt_id}", response_model=PromptRead)
def update_prompt(prompt_id: UUID, payload: PromptUpdate, db: DbSession):
    prompt = get_prompt_or_404(db, prompt_id)
    updates = payload.model_dump(exclude_unset=True)

    if "category_id" in updates:
        category = get_category_or_404(db, updates["category_id"])
        if category.workspace_id != prompt.workspace_id:
            raise HTTPException(status_code=400, detail="Category does not belong to the prompt workspace")

    for field, value in updates.items():
        setattr(prompt, field, value)

    db.commit()
    db.refresh(prompt)
    return prompt


@app.delete("/prompts/{prompt_id}", status_code=204)
def delete_prompt(prompt_id: UUID, db: DbSession):
    prompt = get_prompt_or_404(db, prompt_id)
    db.delete(prompt)
    db.commit()


@app.get("/workspaces/{workspace_id}/runs", response_model=list[RunSummaryRead])
def list_runs(
    workspace_id: UUID,
    db: DbSession,
    statuses: Annotated[list[str] | None, Query()] = None,
    run_types: Annotated[list[str] | None, Query()] = None,
    search: str | None = None,
):
    get_workspace_or_404(db, workspace_id)
    query = select(Run).where(Run.workspace_id == workspace_id).order_by(Run.created_at.desc())
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
    return db.scalars(query).all()


@app.get("/runs/{run_id}", response_model=RunDetailRead)
def get_run(run_id: UUID, db: DbSession):
    return get_run_or_404(db, run_id)


@app.get("/workspaces/{workspace_id}/settings", response_model=list[WorkspaceSettingRead])
def list_workspace_settings(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id).order_by(WorkspaceSetting.key.asc())
    ).all()


@app.put("/workspaces/{workspace_id}/settings/{key}", response_model=WorkspaceSettingRead)
def upsert_workspace_setting(workspace_id: UUID, key: str, payload: WorkspaceSettingUpsert, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    setting = db.scalar(
        select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id, WorkspaceSetting.key == key)
    )
    if not setting:
        setting = WorkspaceSetting(workspace_id=workspace_id, key=key, value_json=payload.value_json)
        db.add(setting)
    else:
        setting.value_json = payload.value_json
    db.commit()
    db.refresh(setting)
    return setting


@app.get("/workspaces/{workspace_id}/provider-credentials", response_model=list[ProviderCredentialRead])
def list_provider_credentials(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    credentials = db.scalars(
        select(ProviderCredential)
        .where(ProviderCredential.workspace_id == workspace_id)
        .order_by(ProviderCredential.provider.asc())
    ).all()
    items: list[ProviderCredentialRead] = []
    for credential in credentials:
        last4 = (credential.metadata_json or {}).get("key_last4")
        items.append(
            ProviderCredentialRead(
                id=credential.id,
                workspace_id=credential.workspace_id,
                provider=credential.provider,
                has_api_key=bool(credential.encrypted_api_key),
                masked_api_key=mask_secret(str(last4)) if last4 else None,
                secret_reference=credential.secret_reference,
                is_default=credential.is_default,
                is_enabled=credential.is_enabled,
                metadata_json=credential.metadata_json,
                created_at=credential.created_at,
                updated_at=credential.updated_at,
            )
        )
    return items


@app.put("/workspaces/{workspace_id}/provider-credentials/{provider}", response_model=ProviderCredentialRead)
def upsert_provider_credential(workspace_id: UUID, provider: str, payload: ProviderCredentialUpsert, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    credential = db.scalar(
        select(ProviderCredential).where(
            ProviderCredential.workspace_id == workspace_id, ProviderCredential.provider == provider
        )
    )

    if payload.is_default:
        existing_defaults = db.scalars(
            select(ProviderCredential).where(
                ProviderCredential.workspace_id == workspace_id, ProviderCredential.is_default.is_(True)
            )
        ).all()
        for item in existing_defaults:
            item.is_default = False

    if not credential:
        credential = ProviderCredential(workspace_id=workspace_id, provider=provider)
        db.add(credential)

    merged_metadata = dict(credential.metadata_json or {})
    if payload.metadata_json is not None:
        merged_metadata.update(payload.metadata_json)

    if payload.api_key is not None:
        api_key = payload.api_key.strip()
        if api_key:
            credential.encrypted_api_key = encrypt_secret(api_key)
            merged_metadata["key_last4"] = api_key[-4:]
        else:
            credential.encrypted_api_key = None
            merged_metadata.pop("key_last4", None)

    if payload.secret_reference is not None:
        credential.secret_reference = payload.secret_reference or None
    if payload.is_default is not None:
        credential.is_default = payload.is_default
    if payload.is_enabled is not None:
        credential.is_enabled = payload.is_enabled
    credential.metadata_json = merged_metadata or None

    db.commit()
    db.refresh(credential)
    last4 = (credential.metadata_json or {}).get("key_last4")
    return ProviderCredentialRead(
        id=credential.id,
        workspace_id=credential.workspace_id,
        provider=credential.provider,
        has_api_key=bool(credential.encrypted_api_key),
        masked_api_key=mask_secret(str(last4)) if last4 else None,
        secret_reference=credential.secret_reference,
        is_default=credential.is_default,
        is_enabled=credential.is_enabled,
        metadata_json=credential.metadata_json,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


@app.get("/workspaces/{workspace_id}/connectors", response_model=list[ConnectorRead])
def list_connectors(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(select(Connector).where(Connector.workspace_id == workspace_id).order_by(Connector.name.asc())).all()


@app.post("/workspaces/{workspace_id}/connectors", response_model=ConnectorRead, status_code=201)
def create_connector(workspace_id: UUID, payload: ConnectorCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    connector = Connector(
        workspace_id=workspace_id,
        name=payload.name,
        connector_type=payload.connector_type,
        provider_key=payload.provider_key,
        is_enabled=payload.is_enabled,
        config_json=payload.config_json,
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return connector


@app.patch("/connectors/{connector_id}", response_model=ConnectorRead)
def update_connector(connector_id: UUID, payload: ConnectorUpdate, db: DbSession):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(connector, field, value)

    db.commit()
    db.refresh(connector)
    return connector


@app.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(connector_id: UUID, db: DbSession):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    db.delete(connector)
    db.commit()


@app.get("/workspaces/{workspace_id}/connector-incidents", response_model=list[ConnectorIncidentRead])
def list_connector_incidents(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(ConnectorIncident)
        .join(Connector, ConnectorIncident.connector_id == Connector.id)
        .where(Connector.workspace_id == workspace_id)
        .order_by(ConnectorIncident.occurred_at.desc())
    ).all()


@app.get("/workers", response_model=list[WorkerRead])
def list_workers(db: DbSession):
    return db.scalars(select(Worker).order_by(Worker.worker_name.asc())).all()


@app.get("/workspaces/{workspace_id}/queue-jobs", response_model=list[QueueJobRead])
def list_queue_jobs(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(QueueJob).where(QueueJob.workspace_id == workspace_id).order_by(QueueJob.queued_at.desc())
    ).all()


@app.get("/workspaces/{workspace_id}/dashboard", response_model=DashboardRead)
def get_dashboard(workspace_id: UUID, db: DbSession):
    workspace = get_workspace_or_404(db, workspace_id)
    setting_rows = db.scalars(select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id)).all()
    settings_map = {item.key: item.value_json for item in setting_rows}
    prompts = db.scalars(select(Prompt).where(Prompt.workspace_id == workspace_id)).all()
    snapshots = db.scalars(
        select(PromptMetricSnapshot)
        .where(PromptMetricSnapshot.workspace_id == workspace_id)
        .order_by(PromptMetricSnapshot.snapshot_at.asc())
    ).all()
    runs = db.scalars(select(Run).where(Run.workspace_id == workspace_id)).all()
    citations = db.scalars(
        select(SourceCitation)
        .join(ScrapeResult, SourceCitation.scrape_result_id == ScrapeResult.id)
        .join(Prompt, ScrapeResult.prompt_id == Prompt.id)
        .where(Prompt.workspace_id == workspace_id)
    ).all()
    competitor_snapshots = db.scalars(
        select(CompetitorSnapshot)
        .where(CompetitorSnapshot.workspace_id == workspace_id)
        .order_by(CompetitorSnapshot.snapshot_at.asc(), CompetitorSnapshot.brand.asc())
    ).all()

    category_names = {
        category.id: category.name
        for category in db.scalars(select(PromptCategory).where(PromptCategory.workspace_id == workspace_id)).all()
    }
    prompt_map = {prompt.id: prompt for prompt in prompts}

    prompt_snapshots: dict[UUID, list[PromptMetricSnapshot]] = {}
    for snapshot in snapshots:
        if snapshot.prompt_id:
            prompt_snapshots.setdefault(snapshot.prompt_id, []).append(snapshot)

    label_map: dict[str, str] = {}
    for snapshot in snapshots:
        label_map[snapshot.snapshot_at.strftime("%Y-%m")] = snapshot.snapshot_at.strftime("%b")
    labels = list(label_map.values())[-6:] or ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    category_series: dict[str, list[list[float]]] = {}
    for prompt in prompts:
        rows = prompt_snapshots.get(prompt.id, [])
        if not rows:
            continue

        category_label = category_names.get(prompt.category_id, prompt.target_brand)
        category_series.setdefault(category_label, []).append([round(item.visibility_score or 0, 1) for item in rows[-6:]])

    series = []
    for label, value_sets in list(category_series.items())[:4]:
        max_len = max(len(values) for values in value_sets)
        averaged_values = []
        for index in range(max_len):
            index_values = [values[index] for values in value_sets if index < len(values)]
            averaged_values.append(round(sum(index_values) / len(index_values), 1))

        series.append({"label": label, "values": averaged_values})

    if not series:
        series = [{"label": "GeoRank AI", "values": [0, 0, 0, 0, 0, 0]}]

    latest_by_prompt = {prompt_id: items[-1] for prompt_id, items in prompt_snapshots.items() if items}
    category_points: dict[str, list[tuple[float, float]]] = {}
    for prompt in prompts:
        latest_snapshot = latest_by_prompt.get(prompt.id)
        if not latest_snapshot:
            continue

        category_label = category_names.get(prompt.category_id, prompt.target_brand)
        category_points.setdefault(category_label, []).append(
            (
                round(latest_snapshot.visibility_score or 0, 1),
                round(latest_snapshot.sentiment_score or 0, 1),
            )
        )

    sentiment_points = []
    for label, points in list(category_points.items())[:4]:
        avg_visibility = round(sum(point[0] for point in points) / len(points), 1)
        avg_sentiment = round(sum(point[1] for point in points) / len(points), 1)
        sentiment_points.append({"label": label, "x": avg_visibility, "y": avg_sentiment})

    citation_totals: dict[str, int] = {}
    top_sources: dict[str, dict[str, int | str]] = {}
    for citation in citations:
        label = citation.source_type or "Unknown"
        citation_totals[label] = citation_totals.get(label, 0) + citation.citation_count
        url = citation.url or citation.domain
        if url not in top_sources:
            top_sources[url] = {"url": url, "source_type": label, "citations": 0}
        top_sources[url]["citations"] = int(top_sources[url]["citations"]) + citation.citation_count

    source_slices = [
        {"label": key, "value": value} for key, value in sorted(citation_totals.items(), key=lambda item: item[1], reverse=True)
    ]
    top_source_rows = sorted(top_sources.values(), key=lambda item: int(item["citations"]), reverse=True)[:4]

    latest_run = max((run for run in runs if run.completed_at), key=lambda run: run.completed_at, default=None)
    sorted_prompt_snapshot_groups = [items for items in prompt_snapshots.values() if items]
    latest_prompt_snapshots = [items[-1] for items in sorted_prompt_snapshot_groups]
    previous_prompt_snapshots = [items[-2] for items in sorted_prompt_snapshot_groups if len(items) > 1]

    avg_visibility = round(
        sum((snapshot.visibility_score or 0) for snapshot in latest_prompt_snapshots) / max(len(latest_prompt_snapshots), 1), 1
    )
    previous_avg_visibility = round(
        sum((snapshot.visibility_score or 0) for snapshot in previous_prompt_snapshots) / max(len(previous_prompt_snapshots), 1), 1
    )
    avg_sentiment = round(
        sum((snapshot.sentiment_score or 0) for snapshot in latest_prompt_snapshots) / max(len(latest_prompt_snapshots), 1), 1
    )
    previous_avg_sentiment = round(
        sum((snapshot.sentiment_score or 0) for snapshot in previous_prompt_snapshots) / max(len(previous_prompt_snapshots), 1), 1
    )

    competitor_groups: dict[str, list[CompetitorSnapshot]] = {}
    for snapshot in competitor_snapshots:
        competitor_groups.setdefault(snapshot.brand, []).append(snapshot)

    competitors = []
    for brand, rows in competitor_groups.items():
        latest = rows[-1]
        competitors.append(
            {
                "brand": brand,
                "avg_rank": round(latest.avg_rank, 1),
                "share": int(round(latest.share_of_voice)),
            }
        )
    competitors.sort(key=lambda item: item["avg_rank"])

    target_brand = (settings_map.get("workspace_profile") or {}).get("tracked_brand") or (
        prompts[0].target_brand if prompts else workspace.name
    )
    your_brand_history = competitor_groups.get(target_brand, [])
    current_rank = round(your_brand_history[-1].avg_rank, 1) if your_brand_history else None
    previous_rank = round(your_brand_history[-2].avg_rank, 1) if len(your_brand_history) > 1 else None
    rank_delta = None
    if current_rank is not None and previous_rank is not None:
        improvement = round(previous_rank - current_rank, 1)
        rank_delta = f"{'+' if improvement >= 0 else ''}{improvement} from previous snapshot"

    visibility_delta = round(avg_visibility - previous_avg_visibility, 1) if previous_prompt_snapshots else None
    sentiment_delta = round(avg_sentiment - previous_avg_sentiment, 1) if previous_prompt_snapshots else None

    return DashboardRead(
        stats=[
            {"label": "Average Rank", "value": current_rank if current_rank is not None else "N/A", "delta": rank_delta},
            {"label": "Keywords Tracked", "value": len(prompts), "subtitle": f"Across {len(category_names)} prompt groups"},
            {
                "label": "Visibility Score",
                "value": f"{avg_visibility:.0f}%",
                "delta": (
                    f"{'+' if visibility_delta >= 0 else ''}{visibility_delta:.1f} pts from previous snapshot"
                    if visibility_delta is not None
                    else None
                ),
            },
            {
                "label": "Positive Sentiment",
                "value": f"{avg_sentiment:.0f}%",
                "delta": (
                    f"{'+' if sentiment_delta >= 0 else ''}{sentiment_delta:.1f} pts from previous snapshot"
                    if sentiment_delta is not None
                    else None
                ),
                "subtitle": None if sentiment_delta is not None else "No prior comparison window",
            },
        ],
        visibility_chart={"labels": labels[-6:], "series": series},
        sentiment_points=sentiment_points,
        source_slices=source_slices,
        competitors=competitors,
        top_sources=top_source_rows,
    )
