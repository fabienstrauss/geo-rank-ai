from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models import (
    ConnectorHealth,
    ConnectorType,
    IncidentSeverity,
    PromptStatus,
    QueueJobStatus,
    RunStatus,
    RunType,
    WorkerStatus,
)


class WorkspaceCreate(BaseModel):
    name: str
    plan: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    plan: str | None = None


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class PromptCreate(BaseModel):
    category_id: UUID
    prompt_text: str
    target_brand: str
    expected_competitors: list[str] = Field(default_factory=list)
    selected_models: list[str] = Field(default_factory=list)
    status: PromptStatus = PromptStatus.DRAFT


class PromptUpdate(BaseModel):
    category_id: UUID | None = None
    prompt_text: str | None = None
    target_brand: str | None = None
    expected_competitors: list[str] | None = None
    selected_models: list[str] | None = None
    status: PromptStatus | None = None


class WorkspaceSettingUpsert(BaseModel):
    value_json: dict


class ProviderCredentialUpsert(BaseModel):
    api_key: str | None = None
    secret_reference: str | None = None
    is_default: bool | None = None
    is_enabled: bool | None = None
    metadata_json: dict | None = None


class ConnectorCreate(BaseModel):
    name: str
    connector_type: ConnectorType
    provider_key: str | None = None
    is_enabled: bool = True
    config_json: dict | None = None


class ConnectorUpdate(BaseModel):
    name: str | None = None
    connector_type: ConnectorType | None = None
    provider_key: str | None = None
    is_enabled: bool | None = None
    config_json: dict | None = None


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    plan: str | None
    created_at: datetime
    updated_at: datetime


class PromptCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    name: str
    sort_order: int
    is_active: bool
    prompt_count: int | None = None
    created_at: datetime
    updated_at: datetime


class PromptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    category_id: UUID
    prompt_text: str
    target_brand: str
    expected_competitors: list[str]
    selected_models: list[str]
    status: PromptStatus
    created_at: datetime
    updated_at: datetime
    category_name: str | None = None
    visibility: float | None = None
    sentiment: float | None = None
    mentions: int | None = None
    last_run_at: datetime | None = None


class PromptListSummaryRead(BaseModel):
    total: int
    visible_categories: int
    avg_visibility: float | None


class PromptListRead(BaseModel):
    items: list[PromptRead]
    total: int
    limit: int
    offset: int
    summary: PromptListSummaryRead


class RunSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    run_type: RunType
    status: RunStatus
    scope_description: str | None
    selected_models: list[str]
    summary: str | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: int | None
    prompt_count: int
    mentions_count: int
    visibility_delta: float | None
    created_at: datetime
    updated_at: datetime


class RunListSummaryRead(BaseModel):
    total: int
    running: int
    failed: int
    avg_visibility_delta: float | None
    last_completed_at: datetime | None


class RunListRead(BaseModel):
    items: list[RunSummaryRead]
    total: int
    limit: int
    offset: int
    summary: RunListSummaryRead


class RunStepEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    step_name: str
    status: QueueJobStatus
    message: str | None
    occurred_at: datetime


class RunLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    level: str
    message: str
    created_at: datetime


class ScrapeResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    prompt_id: UUID
    run_id: UUID
    llm_provider: str
    llm_model: str
    target_mentioned: bool
    competitors_mentioned: list[str]
    sentiment_score: float | None
    mentions_count: int
    citations: list[dict] | None
    sources: list[dict] | None
    executed_at: datetime


class RunDetailRead(RunSummaryRead):
    step_events: list[RunStepEventRead]
    logs: list[RunLogRead]
    scrape_results: list[ScrapeResultRead]


class WorkspaceSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    key: str
    value_json: dict
    created_at: datetime
    updated_at: datetime


class ProviderCredentialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    provider: str
    has_api_key: bool
    masked_api_key: str | None
    secret_reference: str | None
    is_default: bool
    is_enabled: bool
    metadata_json: dict | None
    created_at: datetime
    updated_at: datetime


class ConnectorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    name: str
    connector_type: ConnectorType
    health_status: ConnectorHealth
    provider_key: str | None
    is_enabled: bool
    config_json: dict | None
    success_rate: float | None
    average_latency_ms: int | None
    last_error: str | None
    last_checked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class WorkerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    connector_id: UUID | None
    worker_name: str
    pool_name: str
    status: WorkerStatus
    current_job: str | None
    queue_depth: int
    cpu_percent: float
    memory_percent: float
    uptime_seconds: int
    last_heartbeat_at: datetime | None
    created_at: datetime
    updated_at: datetime


class QueueJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    run_id: UUID | None
    prompt_id: UUID | None
    connector_id: UUID | None
    worker_id: UUID | None
    status: QueueJobStatus
    priority: int
    payload_json: dict | None
    error_message: str | None
    queued_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class DashboardStatRead(BaseModel):
    label: str
    value: float | int | str
    delta: str | None = None
    subtitle: str | None = None


class VisibilitySeriesRead(BaseModel):
    label: str
    values: list[float]


class VisibilityChartRead(BaseModel):
    labels: list[str]
    series: list[VisibilitySeriesRead]


class SentimentPointRead(BaseModel):
    label: str
    x: float
    y: float


class SourceSliceRead(BaseModel):
    label: str
    value: int


class CompetitorRowRead(BaseModel):
    brand: str
    avg_rank: float
    share: int


class TopSourceRead(BaseModel):
    url: str
    source_type: str
    citations: int


class DashboardRead(BaseModel):
    stats: list[DashboardStatRead]
    visibility_chart: VisibilityChartRead
    sentiment_points: list[SentimentPointRead]
    source_slices: list[SourceSliceRead]
    competitors: list[CompetitorRowRead]
    top_sources: list[TopSourceRead]


class ConnectorIncidentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    connector_id: UUID | None
    severity: IncidentSeverity
    title: str
    detail: str
    occurred_at: datetime
    resolved_at: datetime | None
