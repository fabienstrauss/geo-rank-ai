from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class PromptStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"


class RunStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class RunType(str, enum.Enum):
    FULL_EVAL = "full_eval"
    PROMPT_ONLY = "prompt_only"
    REINGEST = "reingest"
    BACKFILL = "backfill"


class QueueJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"
    CANCELED = "canceled"


class WorkerStatus(str, enum.Enum):
    ONLINE = "online"
    BUSY = "busy"
    DEGRADED = "degraded"
    OFFLINE = "offline"


class ConnectorType(str, enum.Enum):
    LLM_API = "llm_api"
    UI_SCRAPER = "ui_scraper"


class ConnectorHealth(str, enum.Enum):
    HEALTHY = "healthy"
    WARNING = "warning"
    DEGRADED = "degraded"
    OFFLINE = "offline"


class IncidentSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    prompt_categories: Mapped[list["PromptCategory"]] = relationship(
        "PromptCategory", back_populates="workspace", cascade="all, delete-orphan"
    )
    prompts: Mapped[list["Prompt"]] = relationship("Prompt", back_populates="workspace", cascade="all, delete-orphan")
    runs: Mapped[list["Run"]] = relationship("Run", back_populates="workspace", cascade="all, delete-orphan")
    connectors: Mapped[list["Connector"]] = relationship(
        "Connector", back_populates="workspace", cascade="all, delete-orphan"
    )
    provider_credentials: Mapped[list["ProviderCredential"]] = relationship(
        "ProviderCredential", back_populates="workspace", cascade="all, delete-orphan"
    )
    settings: Mapped[list["WorkspaceSetting"]] = relationship(
        "WorkspaceSetting", back_populates="workspace", cascade="all, delete-orphan"
    )
    metric_snapshots: Mapped[list["PromptMetricSnapshot"]] = relationship(
        "PromptMetricSnapshot", back_populates="workspace", cascade="all, delete-orphan"
    )
    queue_jobs: Mapped[list["QueueJob"]] = relationship(
        "QueueJob", back_populates="workspace", cascade="all, delete-orphan"
    )


class PromptCategory(Base):
    __tablename__ = "prompt_categories"
    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_prompt_categories_workspace_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="prompt_categories")
    prompts: Mapped[list["Prompt"]] = relationship(
        "Prompt", back_populates="category", cascade="all, delete-orphan"
    )
    metric_snapshots: Mapped[list["PromptMetricSnapshot"]] = relationship(
        "PromptMetricSnapshot", back_populates="category"
    )


class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompt_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    prompt_text: Mapped[str] = mapped_column(Text, nullable=False)
    target_brand: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    expected_competitors: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    selected_models: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[PromptStatus] = mapped_column(
        Enum(PromptStatus, name="prompt_status"), nullable=False, default=PromptStatus.DRAFT, server_default=PromptStatus.DRAFT.value
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="prompts")
    category: Mapped["PromptCategory"] = relationship("PromptCategory", back_populates="prompts")
    run_prompts: Mapped[list["RunPrompt"]] = relationship(
        "RunPrompt", back_populates="prompt", cascade="all, delete-orphan"
    )
    scrape_results: Mapped[list["ScrapeResult"]] = relationship(
        "ScrapeResult", back_populates="prompt", cascade="all, delete-orphan"
    )
    metric_snapshots: Mapped[list["PromptMetricSnapshot"]] = relationship(
        "PromptMetricSnapshot", back_populates="prompt", cascade="all, delete-orphan"
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_type: Mapped[RunType] = mapped_column(
        Enum(RunType, name="run_type"), nullable=False, default=RunType.FULL_EVAL, server_default=RunType.FULL_EVAL.value
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status"), nullable=False, default=RunStatus.QUEUED, server_default=RunStatus.QUEUED.value
    )
    scope_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope_filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    selected_models: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    mentions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    visibility_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="runs")
    run_prompts: Mapped[list["RunPrompt"]] = relationship(
        "RunPrompt", back_populates="run", cascade="all, delete-orphan"
    )
    scrape_results: Mapped[list["ScrapeResult"]] = relationship(
        "ScrapeResult", back_populates="run", cascade="all, delete-orphan"
    )
    step_events: Mapped[list["RunStepEvent"]] = relationship(
        "RunStepEvent", back_populates="run", cascade="all, delete-orphan"
    )
    logs: Mapped[list["RunLog"]] = relationship("RunLog", back_populates="run", cascade="all, delete-orphan")
    queue_jobs: Mapped[list["QueueJob"]] = relationship("QueueJob", back_populates="run")


class RunPrompt(Base):
    __tablename__ = "run_prompts"
    __table_args__ = (UniqueConstraint("run_id", "prompt_id", name="uq_run_prompts_run_prompt"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[QueueJobStatus] = mapped_column(
        Enum(QueueJobStatus, name="run_prompt_status"),
        nullable=False,
        default=QueueJobStatus.QUEUED,
        server_default=QueueJobStatus.QUEUED.value,
    )
    mentions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    run: Mapped["Run"] = relationship("Run", back_populates="run_prompts")
    prompt: Mapped["Prompt"] = relationship("Prompt", back_populates="run_prompts")
    scrape_results: Mapped[list["ScrapeResult"]] = relationship("ScrapeResult", back_populates="run_prompt")


class ScrapeResult(Base):
    __tablename__ = "scrape_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_prompt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("run_prompts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    llm_provider: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    llm_model: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    raw_output: Mapped[str] = mapped_column(Text, nullable=False)
    target_mentioned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    competitors_mentioned: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mentions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    citations: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    sources: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    run: Mapped["Run"] = relationship("Run", back_populates="scrape_results")
    prompt: Mapped["Prompt"] = relationship("Prompt", back_populates="scrape_results")
    run_prompt: Mapped["RunPrompt | None"] = relationship("RunPrompt", back_populates="scrape_results")
    source_citations: Mapped[list["SourceCitation"]] = relationship(
        "SourceCitation", back_populates="scrape_result", cascade="all, delete-orphan"
    )


class RunStepEvent(Base):
    __tablename__ = "run_step_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[QueueJobStatus] = mapped_column(Enum(QueueJobStatus, name="run_step_status"), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    run: Mapped["Run"] = relationship("Run", back_populates="step_events")


class RunLog(Base):
    __tablename__ = "run_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level: Mapped[str] = mapped_column(String(50), nullable=False, default="info", server_default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    run: Mapped["Run"] = relationship("Run", back_populates="logs")


class PromptMetricSnapshot(Base):
    __tablename__ = "prompt_metric_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompt_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    prompt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    visibility_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    sentiment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mentions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="metric_snapshots")
    category: Mapped["PromptCategory | None"] = relationship("PromptCategory", back_populates="metric_snapshots")
    prompt: Mapped["Prompt | None"] = relationship("Prompt", back_populates="metric_snapshots")


class SourceCitation(Base):
    __tablename__ = "source_citations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scrape_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scrape_results.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    citation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    scrape_result: Mapped["ScrapeResult"] = relationship("ScrapeResult", back_populates="source_citations")


class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_connectors_workspace_name"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    connector_type: Mapped[ConnectorType] = mapped_column(Enum(ConnectorType, name="connector_type"), nullable=False)
    health_status: Mapped[ConnectorHealth] = mapped_column(
        Enum(ConnectorHealth, name="connector_health"),
        nullable=False,
        default=ConnectorHealth.HEALTHY,
        server_default=ConnectorHealth.HEALTHY.value,
    )
    provider_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    config_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    success_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="connectors")
    workers: Mapped[list["Worker"]] = relationship("Worker", back_populates="connector")
    queue_jobs: Mapped[list["QueueJob"]] = relationship("QueueJob", back_populates="connector")
    incidents: Mapped[list["ConnectorIncident"]] = relationship(
        "ConnectorIncident", back_populates="connector", cascade="all, delete-orphan"
    )


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    worker_name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    pool_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    status: Mapped[WorkerStatus] = mapped_column(
        Enum(WorkerStatus, name="worker_status"),
        nullable=False,
        default=WorkerStatus.ONLINE,
        server_default=WorkerStatus.ONLINE.value,
    )
    current_job: Mapped[str | None] = mapped_column(String(255), nullable=True)
    queue_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    memory_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    uptime_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    connector: Mapped["Connector | None"] = relationship("Connector", back_populates="workers")
    queue_jobs: Mapped[list["QueueJob"]] = relationship("QueueJob", back_populates="worker")


class QueueJob(Base):
    __tablename__ = "queue_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    prompt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    worker_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[QueueJobStatus] = mapped_column(
        Enum(QueueJobStatus, name="queue_job_status"),
        nullable=False,
        default=QueueJobStatus.QUEUED,
        server_default=QueueJobStatus.QUEUED.value,
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    payload_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="queue_jobs")
    run: Mapped["Run | None"] = relationship("Run", back_populates="queue_jobs")
    prompt: Mapped["Prompt | None"] = relationship("Prompt")
    connector: Mapped["Connector | None"] = relationship("Connector", back_populates="queue_jobs")
    worker: Mapped["Worker | None"] = relationship("Worker", back_populates="queue_jobs")


class ConnectorIncident(Base):
    __tablename__ = "connector_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connector_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connectors.id", ondelete="SET NULL"), nullable=True, index=True
    )
    severity: Mapped[IncidentSeverity] = mapped_column(
        Enum(IncidentSeverity, name="incident_severity"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    connector: Mapped["Connector | None"] = relationship("Connector", back_populates="incidents")


class WorkspaceSetting(Base):
    __tablename__ = "workspace_settings"
    __table_args__ = (UniqueConstraint("workspace_id", "key", name="uq_workspace_settings_workspace_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(String(150), nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="settings")


class ProviderCredential(Base):
    __tablename__ = "provider_credentials"
    __table_args__ = (UniqueConstraint("workspace_id", "provider", name="uq_provider_credentials_workspace_provider"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    secret_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="provider_credentials")
