from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.prompts import router as prompts_router
from api.root import router as root_router
from api.runs import router as runs_router
from api.workspaces import router as workspace_router
from config import get_settings
from deps import DbSession, get_workspace_or_404
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
    SourceCitation,
    WorkspaceSetting,
    Worker,
)
from security import encrypt_secret, mask_secret
from schemas import (
    ConnectorCreate,
    ConnectorIncidentRead,
    ConnectorRead,
    ConnectorUpdate,
    DashboardRead,
    LlmApiConnectorConfig,
    UiScraperConnectorConfig,
    ProviderCredentialRead,
    ProviderCredentialUpsert,
    QueueJobRead,
    WorkspaceSettingRead,
    WorkspaceSettingUpsert,
    WorkerRead,
)

app = FastAPI(title="GeoRank AI Backend")
settings = get_settings()
SUPPORTED_PROVIDER_KEYS = {"openai", "anthropic", "google"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(root_router)
app.include_router(workspace_router)

def normalize_connector_payload(
    *,
    connector_type,
    provider_key: str | None,
    config_json: dict | None,
):
    if connector_type.value == "llm_api":
        normalized = LlmApiConnectorConfig.model_validate(config_json or {}).model_dump()
        resolved_provider = provider_key or normalized.get("provider")
        if not resolved_provider:
            raise HTTPException(status_code=422, detail="provider_key is required for llm_api connectors")
        normalized["provider"] = resolved_provider
        return resolved_provider, normalized

    normalized = UiScraperConnectorConfig.model_validate(config_json or {}).model_dump()
    return provider_key, normalized


def get_workspace_setting(db: Session, workspace_id: UUID, key: str) -> WorkspaceSetting | None:
    return db.scalar(select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id, WorkspaceSetting.key == key))


app.include_router(prompts_router)
app.include_router(runs_router)


@app.get("/workspaces/{workspace_id}/settings", response_model=list[WorkspaceSettingRead])
def list_workspace_settings(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id).order_by(WorkspaceSetting.key.asc())
    ).all()


@app.put("/workspaces/{workspace_id}/settings/{key}", response_model=WorkspaceSettingRead)
def upsert_workspace_setting(workspace_id: UUID, key: str, payload: WorkspaceSettingUpsert, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    if key == "default_provider":
        provider = str(payload.value_json.get("provider") or "").strip().lower()
        if provider not in SUPPORTED_PROVIDER_KEYS:
            raise HTTPException(status_code=422, detail="default_provider must be one of: openai, anthropic, google")

        disabled_credential = db.scalar(
            select(ProviderCredential).where(
                ProviderCredential.workspace_id == workspace_id,
                ProviderCredential.provider == provider,
                ProviderCredential.is_enabled.is_(False),
            )
        )
        if disabled_credential:
            raise HTTPException(status_code=400, detail="Cannot set a disabled provider credential as default")

        credentials = db.scalars(select(ProviderCredential).where(ProviderCredential.workspace_id == workspace_id)).all()
        for credential in credentials:
            credential.is_default = credential.provider == provider

    if key == "default_connector":
        connector_id = payload.value_json.get("connector_id")
        if connector_id:
            try:
                connector_uuid = UUID(str(connector_id))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="default_connector.connector_id must be a valid UUID") from exc
            connector = db.get(Connector, connector_uuid)
            if not connector or connector.workspace_id != workspace_id:
                raise HTTPException(status_code=404, detail="Default connector not found for this workspace")
            if not connector.is_enabled:
                raise HTTPException(status_code=400, detail="Cannot set a disabled connector as default")

    setting = get_workspace_setting(db, workspace_id, key)
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
    provider = provider.strip().lower()
    if provider not in SUPPORTED_PROVIDER_KEYS:
        raise HTTPException(status_code=422, detail="Unsupported provider")

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
        elif payload.clear_secret:
            credential.encrypted_api_key = None
            merged_metadata.pop("key_last4", None)

    if payload.clear_secret:
        credential.encrypted_api_key = None
        credential.secret_reference = None
        merged_metadata.pop("key_last4", None)
        if payload.is_default is None:
            credential.is_default = False
        if payload.is_enabled is None:
            credential.is_enabled = False

    if payload.secret_reference is not None:
        credential.secret_reference = payload.secret_reference or None
    if payload.is_default is not None:
        credential.is_default = payload.is_default
    if payload.is_enabled is not None:
        credential.is_enabled = payload.is_enabled

    if credential.is_default and not credential.is_enabled:
        raise HTTPException(status_code=400, detail="A default provider credential must stay enabled")

    if credential.is_default and not (credential.encrypted_api_key or credential.secret_reference):
        raise HTTPException(status_code=400, detail="A default provider credential must have a configured secret")

    credential.metadata_json = merged_metadata or None

    if credential.is_default:
        setting = get_workspace_setting(db, workspace_id, "default_provider")
        if not setting:
            setting = WorkspaceSetting(workspace_id=workspace_id, key="default_provider", value_json={"provider": provider})
            db.add(setting)
        else:
            setting.value_json = {"provider": provider}
    elif payload.clear_secret:
        setting = get_workspace_setting(db, workspace_id, "default_provider")
        if setting and (setting.value_json or {}).get("provider") == provider:
            setting.value_json = {"provider": "openai"}

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
    provider_key, config_json = normalize_connector_payload(
        connector_type=payload.connector_type,
        provider_key=payload.provider_key,
        config_json=payload.config_json,
    )
    connector = Connector(
        workspace_id=workspace_id,
        name=payload.name,
        connector_type=payload.connector_type,
        provider_key=provider_key,
        is_enabled=payload.is_enabled,
        config_json=config_json,
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
    next_connector_type = updates.get("connector_type", connector.connector_type)
    next_provider_key = updates.get("provider_key", connector.provider_key)
    next_config_json = updates.get("config_json", connector.config_json)
    provider_key, config_json = normalize_connector_payload(
        connector_type=next_connector_type,
        provider_key=next_provider_key,
        config_json=next_config_json,
    )

    default_connector_setting = get_workspace_setting(db, connector.workspace_id, "default_connector")
    default_connector_id = (default_connector_setting.value_json or {}).get("connector_id") if default_connector_setting else None
    if default_connector_id == str(connector.id) and payload.is_enabled is False:
        raise HTTPException(status_code=400, detail="Clear the default connector before disabling it")

    for field, value in updates.items():
        setattr(connector, field, value)
    connector.provider_key = provider_key
    connector.config_json = config_json

    db.commit()
    db.refresh(connector)
    return connector


@app.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(connector_id: UUID, db: DbSession):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    default_connector_setting = get_workspace_setting(db, connector.workspace_id, "default_connector")
    default_connector_id = (default_connector_setting.value_json or {}).get("connector_id") if default_connector_setting else None
    if default_connector_id == str(connector.id):
        raise HTTPException(status_code=400, detail="Clear the default connector before deleting it")
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
    prompts = db.scalars(select(Prompt).options(selectinload(Prompt.category)).where(Prompt.workspace_id == workspace_id)).all()
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

    category_names = {prompt.category_id: prompt.category.name for prompt in prompts if prompt.category}

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
