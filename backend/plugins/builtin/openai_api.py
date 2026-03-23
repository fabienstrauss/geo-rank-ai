from __future__ import annotations

from schemas import LlmApiConnectorConfig
from models import ConnectorType
from plugins.base import ScraperInput, ScraperOutput, ScraperPluginDefinition


class OpenAiApiScraper:
    def run(self, payload: ScraperInput) -> ScraperOutput:
        raise NotImplementedError("OpenAI API scraper execution is not wired yet")


plugin = ScraperPluginDefinition(
    key="openai_api",
    name="OpenAI API",
    description="Runs prompts through the OpenAI API using a stored provider credential.",
    scraper_type=ConnectorType.LLM_API,
    provider_key="openai",
    config_model=LlmApiConnectorConfig,
    capabilities=["llm_api", "citations", "sentiment"],
    runner_cls=OpenAiApiScraper,
)
