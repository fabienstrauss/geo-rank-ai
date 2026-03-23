from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException

from models import ConnectorType
from plugins.base import ScraperInput, ScraperOutput, ScraperPluginDefinition
from schemas import LlmApiConnectorConfig


def _extract_json_object(raw_text: str) -> dict:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()
    return json.loads(text)


class OpenAiApiScraper:
    def run(self, payload: ScraperInput) -> ScraperOutput:
        config = LlmApiConnectorConfig.model_validate(payload.config)
        if not payload.provider_api_key:
            raise HTTPException(status_code=400, detail="OpenAI connector is missing a provider API key")

        model = payload.model or config.model
        if not model:
            raise HTTPException(status_code=400, detail="OpenAI connector requires a model")

        instructions = (
            "You are evaluating brand visibility in an LLM answer. "
            "Return valid JSON only with keys: answer, target_mentioned, competitors_mentioned, "
            "sentiment_score, mentions_count, citations. "
            "citations must be an array of objects with keys: domain, url, source_type, citation_count. "
            "sentiment_score must be a number from 0 to 100."
        )
        user_input = (
            f"Prompt: {payload.prompt_text}\n"
            f"Target brand: {payload.target_brand}\n"
            f"Expected competitors: {', '.join(payload.expected_competitors) or 'None'}\n"
            "Evaluate this prompt as if you were answering it naturally, then summarize the evaluation in the JSON format above."
        )
        body = {
            "model": model,
            "instructions": instructions,
            "input": user_input,
            "text": {"format": {"type": "text"}},
        }
        request = Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {payload.provider_api_key}",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=config.timeout_seconds) as response:
                response_body = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(status_code=502, detail=f"OpenAI API request failed: {detail or exc.reason}") from exc
        except URLError as exc:
            raise HTTPException(status_code=502, detail=f"OpenAI API connection failed: {exc.reason}") from exc

        output_text = str(response_body.get("output_text") or "").strip()
        if not output_text:
            raise HTTPException(status_code=502, detail="OpenAI API returned an empty response")

        try:
            parsed = _extract_json_object(output_text)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=502, detail="OpenAI API returned non-JSON output for scraper evaluation") from exc

        citations = parsed.get("citations") or []
        return ScraperOutput(
            raw_output=str(parsed.get("answer") or output_text),
            target_mentioned=bool(parsed.get("target_mentioned")),
            competitors_mentioned=[str(item) for item in parsed.get("competitors_mentioned") or []],
            sentiment_score=float(parsed["sentiment_score"]) if parsed.get("sentiment_score") is not None else None,
            mentions_count=int(parsed.get("mentions_count") or 0),
            citations=citations,
            metadata={"provider_response_id": response_body.get("id")},
        )


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
