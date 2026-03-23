from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Connector, Prompt, PromptStatus, QueueJob, QueueJobStatus, Run, RunLog, RunPrompt, RunStatus, RunStepEvent, RunType
from plugins.registry import get_scraper_plugin
from schemas import ManualRunCreate
from services.read_models import get_run_or_404
from services.settings import get_workspace_setting


def _resolve_prompt_scope(db: Session, workspace_id: UUID, payload: ManualRunCreate) -> list[Prompt]:
    prompt_query = select(Prompt).where(Prompt.workspace_id == workspace_id)
    if payload.prompt_ids:
        prompt_query = prompt_query.where(Prompt.id.in_(payload.prompt_ids))
    else:
        prompt_query = prompt_query.where(Prompt.status == PromptStatus.ACTIVE)

    prompts = db.scalars(prompt_query.order_by(Prompt.created_at.asc())).all()
    if not prompts:
        raise HTTPException(status_code=400, detail="No prompts available for this run")
    return prompts


def _resolve_connector(db: Session, workspace_id: UUID, payload: ManualRunCreate) -> Connector:
    connector_id = payload.connector_id
    if connector_id is None:
        default_connector = get_workspace_setting(db, workspace_id, "default_connector")
        default_connector_id = (default_connector.value_json or {}).get("connector_id") if default_connector else None
        if default_connector_id:
            connector_id = UUID(str(default_connector_id))

    if connector_id is None:
        raise HTTPException(status_code=400, detail="No connector selected for this run")

    connector = db.get(Connector, connector_id)
    if not connector or connector.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Connector not found for this workspace")
    if not connector.is_enabled:
        raise HTTPException(status_code=400, detail="Connector must be enabled before running prompts")

    get_scraper_plugin(connector.implementation_key)
    return connector


def _collect_models(prompts: Iterable[Prompt], payload: ManualRunCreate) -> list[str]:
    if payload.models:
        return payload.models

    models: list[str] = []
    for prompt in prompts:
        for model in prompt.selected_models:
            if model not in models:
                models.append(model)
    if not models:
        raise HTTPException(status_code=400, detail="No models available for this run")
    return models


def create_manual_run(db: Session, *, workspace_id: UUID, payload: ManualRunCreate) -> Run:
    prompts = _resolve_prompt_scope(db, workspace_id, payload)
    connector = _resolve_connector(db, workspace_id, payload)
    selected_models = _collect_models(prompts, payload)
    plugin = get_scraper_plugin(connector.implementation_key)

    run = Run(
        workspace_id=workspace_id,
        run_type=payload.run_type,
        status=RunStatus.QUEUED,
        scope_description=payload.scope_description or f"Manual run across {len(prompts)} prompts",
        scope_filters={
            "trigger": "manual",
            "prompt_ids": [str(prompt.id) for prompt in prompts],
            "connector_id": str(connector.id),
            "implementation_key": connector.implementation_key,
        },
        selected_models=selected_models,
        prompt_count=len(prompts),
    )
    db.add(run)
    db.flush()

    db.add(
        RunStepEvent(
            run_id=run.id,
            step_name="queued",
            status=QueueJobStatus.QUEUED,
            message=f"Queued manual run with {plugin.name}",
        )
    )
    db.add(
        RunLog(
            run_id=run.id,
            level="info",
            message=f"Prepared {len(prompts)} prompts for connector '{connector.name}' via implementation '{connector.implementation_key}'",
        )
    )

    for prompt in prompts:
        run_prompt = RunPrompt(
            run_id=run.id,
            prompt_id=prompt.id,
            status=QueueJobStatus.QUEUED,
        )
        db.add(run_prompt)
        db.flush()

        for model in selected_models:
            db.add(
                QueueJob(
                    workspace_id=workspace_id,
                    run_id=run.id,
                    prompt_id=prompt.id,
                    connector_id=connector.id,
                    status=QueueJobStatus.QUEUED,
                    payload_json={
                        "run_prompt_id": str(run_prompt.id),
                        "model": model,
                        "implementation_key": connector.implementation_key,
                        "prompt_text": prompt.prompt_text,
                        "target_brand": prompt.target_brand,
                    },
                )
            )

    db.commit()
    return get_run_or_404(db, run.id)
