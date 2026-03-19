from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import Base, engine, get_db
from models import (
    Connector,
    ConnectorIncident,
    Prompt,
    PromptCategory,
    ProviderCredential,
    QueueJob,
    Run,
    Workspace,
    WorkspaceSetting,
)
from schemas import (
    CategoryCreate,
    CategoryUpdate,
    ConnectorIncidentRead,
    ConnectorRead,
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


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


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
    category_id: UUID | None = None,
    status: str | None = None,
):
    get_workspace_or_404(db, workspace_id)
    query = select(Prompt).where(Prompt.workspace_id == workspace_id).order_by(Prompt.created_at.desc())
    if category_id:
        query = query.where(Prompt.category_id == category_id)
    if status:
        query = query.where(Prompt.status == status)
    return db.scalars(query).all()


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
):
    get_workspace_or_404(db, workspace_id)
    query = select(Run).where(Run.workspace_id == workspace_id).order_by(Run.created_at.desc())
    if statuses:
        query = query.where(Run.status.in_(statuses))
    if run_types:
        query = query.where(Run.run_type.in_(run_types))
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
    return db.scalars(
        select(ProviderCredential)
        .where(ProviderCredential.workspace_id == workspace_id)
        .order_by(ProviderCredential.provider.asc())
    ).all()


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

    credential.encrypted_api_key = payload.encrypted_api_key
    credential.secret_reference = payload.secret_reference
    credential.is_default = payload.is_default
    credential.is_enabled = payload.is_enabled
    credential.metadata_json = payload.metadata_json

    db.commit()
    db.refresh(credential)
    return credential


@app.get("/workspaces/{workspace_id}/connectors", response_model=list[ConnectorRead])
def list_connectors(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(select(Connector).where(Connector.workspace_id == workspace_id).order_by(Connector.name.asc())).all()


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
    from models import Worker

    return db.scalars(select(Worker).order_by(Worker.worker_name.asc())).all()


@app.get("/workspaces/{workspace_id}/queue-jobs", response_model=list[QueueJobRead])
def list_queue_jobs(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(QueueJob).where(QueueJob.workspace_id == workspace_id).order_by(QueueJob.queued_at.desc())
    ).all()
