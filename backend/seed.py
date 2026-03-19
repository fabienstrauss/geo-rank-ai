
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from models import (
    CompetitorSnapshot,
    Connector,
    ConnectorHealth,
    ConnectorIncident,
    ConnectorType,
    IncidentSeverity,
    Prompt,
    PromptCategory,
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
    Worker,
    WorkerStatus,
    Workspace,
    WorkspaceSetting,
)
from security import encrypt_secret


def seed_dev_data(db: Session) -> Workspace:
    for model in [
        SourceCitation,
        ScrapeResult,
        RunLog,
        RunStepEvent,
        RunPrompt,
        QueueJob,
        Worker,
        ConnectorIncident,
        Connector,
        CompetitorSnapshot,
        PromptMetricSnapshot,
        Prompt,
        PromptCategory,
        ProviderCredential,
        WorkspaceSetting,
        Run,
        Workspace,
    ]:
        db.execute(delete(model))

    now = datetime.now(timezone.utc)
    workspace = Workspace(name="Main Workspace", plan="Enterprise")
    db.add(workspace)
    db.flush()

    settings = [
        WorkspaceSetting(workspace_id=workspace.id, key="theme", value_json={"mode": "dark"}),
        WorkspaceSetting(workspace_id=workspace.id, key="default_provider", value_json={"provider": "openai"}),
        WorkspaceSetting(
            workspace_id=workspace.id,
            key="workspace_profile",
            value_json={"tracked_brand": "GeoRank AI", "setup_complete": True},
        ),
        WorkspaceSetting(
            workspace_id=workspace.id,
            key="default_models",
            value_json={"models": ["GPT-5", "Claude"]},
        ),
    ]
    db.add_all(settings)

    credentials = [
        ProviderCredential(
            workspace_id=workspace.id,
            provider="openai",
            encrypted_api_key=encrypt_secret("sk-demo-openai-1234"),
            is_default=True,
            is_enabled=True,
            metadata_json={"key_last4": "1234"},
        ),
        ProviderCredential(
            workspace_id=workspace.id,
            provider="anthropic",
            encrypted_api_key=encrypt_secret("sk-ant-demo-9876"),
            is_default=False,
            is_enabled=True,
            metadata_json={"key_last4": "9876"},
        ),
        ProviderCredential(
            workspace_id=workspace.id,
            provider="google",
            encrypted_api_key=None,
            is_default=False,
            is_enabled=False,
        ),
    ]
    db.add_all(credentials)

    categories = {
        "Sales": PromptCategory(workspace_id=workspace.id, name="Sales", sort_order=1),
        "Support": PromptCategory(workspace_id=workspace.id, name="Support", sort_order=2),
        "Product Marketing": PromptCategory(workspace_id=workspace.id, name="Product Marketing", sort_order=3),
        "Brand": PromptCategory(workspace_id=workspace.id, name="Brand", sort_order=4),
    }
    db.add_all(categories.values())
    db.flush()

    prompt_rows = [
        {
            "category": "Sales",
            "prompt_text": "Which GEO platforms are best for enterprise SEO teams evaluating AI visibility?",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["Profound", "Scrunch AI", "Peec AI"],
            "selected_models": ["GPT-5", "Claude", "Gemini"],
            "status": PromptStatus.ACTIVE,
        },
        {
            "category": "Sales",
            "prompt_text": "Compare GeoRank AI to traditional rank trackers for pipeline teams.",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["Semrush", "Ahrefs", "Profound"],
            "selected_models": ["GPT-5", "Claude"],
            "status": PromptStatus.ACTIVE,
        },
        {
            "category": "Support",
            "prompt_text": "How do I connect model API keys and run the first GEO monitoring cycle?",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["Semrush", "Ahrefs"],
            "selected_models": ["GPT-5", "Gemini"],
            "status": PromptStatus.ACTIVE,
        },
        {
            "category": "Support",
            "prompt_text": "Why is my Docker GEO dashboard not refreshing after a scraper run?",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["OpenPipe", "Langfuse"],
            "selected_models": ["Claude", "Gemini"],
            "status": PromptStatus.DRAFT,
        },
        {
            "category": "Product Marketing",
            "prompt_text": "Which AI tools cite product docs most often when recommending GEO software?",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["Profound", "Semrush"],
            "selected_models": ["GPT-5", "Claude", "Gemini"],
            "status": PromptStatus.ACTIVE,
        },
        {
            "category": "Brand",
            "prompt_text": "How do LLMs describe GeoRank AI versus larger SEO incumbents?",
            "target_brand": "GeoRank AI",
            "expected_competitors": ["Semrush", "Ahrefs", "Profound"],
            "selected_models": ["GPT-5", "Claude"],
            "status": PromptStatus.DRAFT,
        },
    ]

    prompts: list[Prompt] = []
    for row in prompt_rows:
        prompt = Prompt(
            workspace_id=workspace.id,
            category_id=categories[row["category"]].id,
            prompt_text=row["prompt_text"],
            target_brand=row["target_brand"],
            expected_competitors=row["expected_competitors"],
            selected_models=row["selected_models"],
            status=row["status"],
        )
        prompts.append(prompt)
    db.add_all(prompts)
    db.flush()

    competitor_rows = [
        ("GeoRank AI", [(2.8, 27), (2.7, 28), (2.6, 29), (2.5, 30), (2.4, 31), (2.3, 32)]),
        ("Profound", [(3.4, 24), (3.4, 25), (3.3, 25), (3.2, 26), (3.1, 27), (3.1, 28)]),
        ("Semrush", [(4.9, 16), (4.8, 16), (4.7, 15), (4.6, 15), (4.5, 15), (4.4, 15)]),
        ("Ahrefs", [(5.6, 13), (5.5, 13), (5.4, 13), (5.3, 12), (5.2, 12), (5.1, 12)]),
    ]
    competitor_snapshots: list[CompetitorSnapshot] = []
    for brand, values in competitor_rows:
        for offset, (avg_rank, share_of_voice) in enumerate(values):
            competitor_snapshots.append(
                CompetitorSnapshot(
                    workspace_id=workspace.id,
                    brand=brand,
                    snapshot_at=now - timedelta(days=(5 - offset) * 30),
                    avg_rank=avg_rank,
                    share_of_voice=share_of_voice,
                )
            )
    db.add_all(competitor_snapshots)

    connectors = {
        "LLM API scraper": Connector(
            workspace_id=workspace.id,
            name="LLM API scraper",
            connector_type=ConnectorType.LLM_API,
            health_status=ConnectorHealth.HEALTHY,
            provider_key="openai",
            is_enabled=True,
            success_rate=98.4,
            average_latency_ms=1800,
        ),
        "UI scraper": Connector(
            workspace_id=workspace.id,
            name="UI scraper",
            connector_type=ConnectorType.UI_SCRAPER,
            health_status=ConnectorHealth.WARNING,
            provider_key="anthropic",
            is_enabled=True,
            success_rate=89.1,
            average_latency_ms=4900,
            last_error="Session refresh failures on one browser node",
        ),
    }
    db.add_all(connectors.values())
    db.flush()

    db.add(
        WorkspaceSetting(
            workspace_id=workspace.id,
            key="default_connector",
            value_json={"connector_id": str(connectors["LLM API scraper"].id)},
        )
    )

    workers = [
        Worker(
            connector_id=connectors["LLM API scraper"].id,
            worker_name="worker-01",
            pool_name="Primary API Pool",
            status=WorkerStatus.BUSY,
            current_job="Sales comparison prompts",
            queue_depth=4,
            cpu_percent=72,
            memory_percent=68,
            uptime_seconds=388800,
            last_heartbeat_at=now - timedelta(seconds=12),
        ),
        Worker(
            connector_id=connectors["LLM API scraper"].id,
            worker_name="worker-02",
            pool_name="Primary API Pool",
            status=WorkerStatus.ONLINE,
            current_job="Idle",
            queue_depth=1,
            cpu_percent=29,
            memory_percent=34,
            uptime_seconds=288000,
            last_heartbeat_at=now - timedelta(seconds=8),
        ),
        Worker(
            connector_id=connectors["UI scraper"].id,
            worker_name="worker-03",
            pool_name="Browser Automation Pool",
            status=WorkerStatus.BUSY,
            current_job="Brand perception rerun",
            queue_depth=5,
            cpu_percent=81,
            memory_percent=76,
            uptime_seconds=154800,
            last_heartbeat_at=now - timedelta(seconds=11),
        ),
        Worker(
            connector_id=connectors["UI scraper"].id,
            worker_name="worker-04",
            pool_name="Browser Automation Pool",
            status=WorkerStatus.DEGRADED,
            current_job="Session recovery",
            queue_depth=3,
            cpu_percent=64,
            memory_percent=83,
            uptime_seconds=68400,
            last_heartbeat_at=now - timedelta(seconds=39),
        ),
    ]
    db.add_all(workers)
    db.flush()

    db.add_all(
        [
            ConnectorIncident(
                connector_id=connectors["UI scraper"].id,
                severity=IncidentSeverity.WARNING,
                title="UI scraper session renewals failing",
                detail="Worker-04 hit repeated login challenge loops and was moved to degraded mode.",
                occurred_at=now - timedelta(hours=1),
            ),
            ConnectorIncident(
                connector_id=connectors["LLM API scraper"].id,
                severity=IncidentSeverity.CRITICAL,
                title="Provider rate limits spiked",
                detail="LLM API scraper returned 429 bursts across one region before backoff stabilized.",
                occurred_at=now - timedelta(hours=2),
            ),
        ]
    )

    run_completed = Run(
        workspace_id=workspace.id,
        run_type=RunType.FULL_EVAL,
        status=RunStatus.COMPLETED,
        scope_description="All prompt categories",
        scope_filters={"categories": ["Sales", "Support", "Product Marketing", "Brand"]},
        selected_models=["GPT-5", "Claude", "Gemini"],
        summary="Strong documentation citation growth after the latest content push.",
        started_at=now - timedelta(hours=6),
        completed_at=now - timedelta(hours=6) + timedelta(minutes=12, seconds=42),
        duration_seconds=762,
        prompt_count=len(prompts),
        mentions_count=412,
        visibility_delta=6.2,
    )
    run_running = Run(
        workspace_id=workspace.id,
        run_type=RunType.PROMPT_ONLY,
        status=RunStatus.RUNNING,
        scope_description="Sales + Brand",
        scope_filters={"categories": ["Sales", "Brand"]},
        selected_models=["GPT-5", "Claude"],
        summary="Live run focused on commercial prompts after prompt copy updates.",
        started_at=now - timedelta(minutes=18),
        prompt_count=3,
        mentions_count=146,
    )
    run_queued = Run(
        workspace_id=workspace.id,
        run_type=RunType.REINGEST,
        status=RunStatus.QUEUED,
        scope_description="Docs + GitHub sources",
        scope_filters={"sources": ["Documentation", "GitHub"]},
        selected_models=["GPT-5"],
        summary="Waiting for scraper capacity before a source-only refresh.",
        started_at=now - timedelta(minutes=5),
    )
    run_failed = Run(
        workspace_id=workspace.id,
        run_type=RunType.BACKFILL,
        status=RunStatus.FAILED,
        scope_description="Support category historical rerun",
        scope_filters={"categories": ["Support"]},
        selected_models=["Claude", "Gemini"],
        summary="Run failed during scraper hydration because one source connector timed out.",
        started_at=now - timedelta(days=1, hours=1),
        completed_at=now - timedelta(days=1, hours=1) + timedelta(minutes=5, seconds=3),
        duration_seconds=303,
        prompt_count=1,
        mentions_count=41,
        visibility_delta=-1.3,
    )
    db.add_all([run_completed, run_running, run_queued, run_failed])
    db.flush()

    run_steps = [
        RunStepEvent(run_id=run_completed.id, step_name="Queued", status=QueueJobStatus.COMPLETED, occurred_at=run_completed.started_at),
        RunStepEvent(run_id=run_completed.id, step_name="Fetching sources", status=QueueJobStatus.COMPLETED, occurred_at=run_completed.started_at + timedelta(minutes=1)),
        RunStepEvent(run_id=run_completed.id, step_name="Running prompts", status=QueueJobStatus.COMPLETED, occurred_at=run_completed.started_at + timedelta(minutes=4)),
        RunStepEvent(run_id=run_completed.id, step_name="Scoring", status=QueueJobStatus.COMPLETED, occurred_at=run_completed.started_at + timedelta(minutes=11)),
        RunStepEvent(run_id=run_running.id, step_name="Queued", status=QueueJobStatus.COMPLETED, occurred_at=run_running.started_at),
        RunStepEvent(run_id=run_running.id, step_name="Fetching sources", status=QueueJobStatus.COMPLETED, occurred_at=run_running.started_at + timedelta(minutes=2)),
        RunStepEvent(run_id=run_running.id, step_name="Running prompts", status=QueueJobStatus.RUNNING, occurred_at=run_running.started_at + timedelta(minutes=4)),
        RunStepEvent(run_id=run_failed.id, step_name="Fetching sources", status=QueueJobStatus.FAILED, occurred_at=run_failed.started_at + timedelta(minutes=3)),
    ]
    db.add_all(run_steps)

    run_logs = [
        RunLog(run_id=run_completed.id, level="info", message="Sources refreshed from docs, blog, and reddit connectors.", created_at=run_completed.started_at),
        RunLog(run_id=run_completed.id, level="info", message="Prompt category 'Sales' finished with +8.4% visibility gain.", created_at=run_completed.started_at + timedelta(minutes=5)),
        RunLog(run_id=run_running.id, level="info", message="GPT-5 completed 9/12 prompts.", created_at=run_running.started_at + timedelta(minutes=5)),
        RunLog(run_id=run_failed.id, level="error", message="UI scraper connector timed out after 3 retries.", created_at=run_failed.started_at + timedelta(minutes=4)),
    ]
    db.add_all(run_logs)

    completed_mentions = [124, 93, 76, 31, 112, 54]
    completed_sentiments = [78.0, 70.0, 82.0, 48.0, 74.0, 63.0]
    completed_visibility = [72.0, 64.0, 59.0, 41.0, 68.0, 52.0]

    for prompt, mentions, sentiment, visibility in zip(prompts, completed_mentions, completed_sentiments, completed_visibility):
        run_prompt = RunPrompt(run_id=run_completed.id, prompt_id=prompt.id, status=QueueJobStatus.COMPLETED, mentions_count=mentions)
        db.add(run_prompt)
        db.flush()
        model = prompt.selected_models[0]
        result = ScrapeResult(
            run_id=run_completed.id,
            prompt_id=prompt.id,
            run_prompt_id=run_prompt.id,
            executed_at=run_completed.completed_at or now,
            llm_provider=model.lower().split("-")[0],
            llm_model=model,
            raw_output=f"Seeded response for prompt '{prompt.prompt_text[:40]}...'",
            target_mentioned=True,
            competitors_mentioned=prompt.expected_competitors[:2],
            sentiment_score=sentiment,
            mentions_count=mentions,
            citations=[
                {"domain": "docs.yourbrand.com", "type": "Documentation", "count": 2},
                {"domain": "blog.industry-news.com", "type": "Blog", "count": 1},
            ],
            sources=[
                {"domain": "docs.yourbrand.com", "type": "Documentation"},
                {"domain": "github.com", "type": "Code"},
            ],
        )
        db.add(result)
        db.flush()
        db.add_all(
            [
                SourceCitation(scrape_result_id=result.id, source_type="Documentation", domain="docs.yourbrand.com", url="https://docs.yourbrand.com/guide", citation_count=2),
                SourceCitation(scrape_result_id=result.id, source_type="Blog", domain="blog.industry-news.com", url="https://blog.industry-news.com/post", citation_count=1),
            ]
        )
        for offset, value in enumerate([visibility - 8, visibility - 5, visibility - 3, visibility - 1, visibility - 0.5, visibility]):
            db.add(
                PromptMetricSnapshot(
                    workspace_id=workspace.id,
                    category_id=prompt.category_id,
                    prompt_id=prompt.id,
                    snapshot_at=now - timedelta(days=150 - offset * 30),
                    visibility_score=value,
                    sentiment_score=sentiment,
                    mentions_count=max(10, mentions - (5 - offset) * 7),
                    metadata_json={"target_brand": prompt.target_brand},
                )
            )

    queue_jobs = [
        QueueJob(
            workspace_id=workspace.id,
            run_id=run_running.id,
            prompt_id=prompts[0].id,
            connector_id=connectors["LLM API scraper"].id,
            worker_id=workers[1].id,
            status=QueueJobStatus.RUNNING,
            payload_json={"prompt": "Sales comparison set"},
            queued_at=now - timedelta(minutes=17),
            started_at=now - timedelta(minutes=15),
        ),
        QueueJob(
            workspace_id=workspace.id,
            run_id=run_running.id,
            prompt_id=prompts[5].id,
            connector_id=connectors["UI scraper"].id,
            worker_id=workers[3].id,
            status=QueueJobStatus.RUNNING,
            payload_json={"prompt": "Brand perception rerun"},
            queued_at=now - timedelta(minutes=14),
            started_at=now - timedelta(minutes=12),
        ),
        QueueJob(
            workspace_id=workspace.id,
            run_id=run_queued.id,
            prompt_id=prompts[2].id,
            connector_id=connectors["LLM API scraper"].id,
            status=QueueJobStatus.QUEUED,
            payload_json={"prompt": "Support troubleshooting prompts"},
            queued_at=now - timedelta(minutes=7),
        ),
        QueueJob(
            workspace_id=workspace.id,
            run_id=run_queued.id,
            prompt_id=prompts[4].id,
            connector_id=connectors["UI scraper"].id,
            status=QueueJobStatus.QUEUED,
            payload_json={"prompt": "Product marketing citations"},
            queued_at=now - timedelta(minutes=6),
        ),
    ]
    db.add_all(queue_jobs)

    db.commit()
    db.refresh(workspace)
    return workspace
