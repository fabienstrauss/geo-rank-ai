from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from pydantic import BaseModel, Field

from models import ConnectorType


class ScraperInput(BaseModel):
    workspace_id: UUID
    connector_id: UUID
    prompt_id: UUID
    run_id: UUID
    provider_key: str | None = None
    provider_api_key: str | None = None
    model: str
    prompt_text: str
    target_brand: str
    expected_competitors: list[str]
    config: dict[str, Any]


class CitationResult(BaseModel):
    domain: str
    url: str | None = None
    source_type: str | None = None
    citation_count: int = 1
    metadata: dict[str, Any] | None = None


class ScraperOutput(BaseModel):
    raw_output: str
    target_mentioned: bool
    competitors_mentioned: list[str]
    sentiment_score: float | None = None
    mentions_count: int = 0
    citations: list[CitationResult] = Field(default_factory=list)
    metadata: dict[str, Any] | None = None


class ScraperRunner(Protocol):
    def run(self, payload: ScraperInput) -> ScraperOutput: ...


@dataclass(slots=True)
class ScraperPluginDefinition:
    key: str
    name: str
    description: str
    scraper_type: ConnectorType
    config_model: type[BaseModel]
    provider_key: str | None = None
    capabilities: list[str] = field(default_factory=list)
    runner_cls: type[ScraperRunner] | None = None

    def config_schema(self) -> dict[str, Any]:
        return self.config_model.model_json_schema()
