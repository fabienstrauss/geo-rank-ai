from __future__ import annotations

from pydantic import BaseModel, Field

from models import ConnectorType
from plugins.base import CitationResult, ScraperInput, ScraperOutput, ScraperPluginDefinition


class DemoScraperConfig(BaseModel):
    base_url: str | None = None
    sentiment_floor: float = Field(default=64.0, ge=0, le=100)
    timeout_seconds: int = Field(default=15, ge=1, le=120)


class DemoExternalScraper:
    def run(self, payload: ScraperInput) -> ScraperOutput:
        prompt_text = payload.prompt_text.lower()
        target_hit = payload.target_brand.lower() in prompt_text or "georank" in prompt_text
        mentioned_competitors = [
            competitor for competitor in payload.expected_competitors if competitor.lower() in prompt_text
        ]
        mentions_count = 1 + len(mentioned_competitors) + (1 if target_hit else 0)

        return ScraperOutput(
            raw_output=f"Demo external scraper evaluated prompt '{payload.prompt_id}' for model '{payload.model}'.",
            target_mentioned=target_hit,
            competitors_mentioned=mentioned_competitors,
            sentiment_score=max(0.0, min(100.0, 60.0 + len(mentioned_competitors) * 6.0 + (8.0 if target_hit else 0.0))),
            mentions_count=mentions_count,
            citations=[
                CitationResult(
                    domain="docs.georank.dev",
                    url="https://docs.georank.dev/demo-plugin",
                    source_type="documentation",
                    citation_count=1,
                    metadata={"implementation": "demo_scraper"},
                )
            ],
            metadata={"plugin": "demo_scraper"},
        )


def get_plugin() -> ScraperPluginDefinition:
    return ScraperPluginDefinition(
        key="demo_scraper",
        name="Demo External Scraper",
        description="Example third-party scraper discovered through Python entry points.",
        scraper_type=ConnectorType.UI_SCRAPER,
        config_model=DemoScraperConfig,
        is_builtin=False,
        capabilities=["demo", "local-testing", "citations"],
        runner_cls=DemoExternalScraper,
    )
