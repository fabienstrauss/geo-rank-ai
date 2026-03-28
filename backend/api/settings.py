from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from deps import DbSession, get_workspace_or_404
from models import Connector, WorkspaceSetting
from schemas import (
    ConnectorCreate,
    ConnectorRead,
    ScraperPluginRead,
    ConnectorUpdate,
    ProviderCredentialRead,
    ProviderCredentialUpsert,
    WorkspaceSettingRead,
    WorkspaceSettingUpsert,
)
from plugins.registry import list_scraper_plugins
from services.settings import (
    create_connector_value,
    delete_connector_value,
    list_provider_credential_reads,
    upsert_provider_credential_value,
    upsert_workspace_setting_value,
    update_connector_value,
)


router = APIRouter(tags=["settings"])


@router.get("/scraper-plugins", response_model=list[ScraperPluginRead])
def list_available_scraper_plugins():
    return [
        ScraperPluginRead(
            key=plugin.key,
            name=plugin.name,
            description=plugin.description,
            scraper_type=plugin.scraper_type,
            is_builtin=plugin.is_builtin,
            provider_key=plugin.provider_key,
            capabilities=plugin.capabilities,
            config_schema=plugin.config_schema(),
        )
        for plugin in list_scraper_plugins()
    ]


@router.get("/workspaces/{workspace_id}/settings", response_model=list[WorkspaceSettingRead])
def list_workspace_settings(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(
        select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id).order_by(WorkspaceSetting.key.asc())
    ).all()


@router.put("/workspaces/{workspace_id}/settings/{key}", response_model=WorkspaceSettingRead)
def upsert_workspace_setting(workspace_id: UUID, key: str, payload: WorkspaceSettingUpsert, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return upsert_workspace_setting_value(db, workspace_id=workspace_id, key=key, payload=payload)


@router.get("/workspaces/{workspace_id}/provider-credentials", response_model=list[ProviderCredentialRead])
def list_provider_credentials(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return list_provider_credential_reads(db, workspace_id)


@router.put("/workspaces/{workspace_id}/provider-credentials/{provider}", response_model=ProviderCredentialRead)
def upsert_provider_credential(workspace_id: UUID, provider: str, payload: ProviderCredentialUpsert, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return upsert_provider_credential_value(db, workspace_id=workspace_id, provider=provider, payload=payload)


@router.get("/workspaces/{workspace_id}/connectors", response_model=list[ConnectorRead])
def list_connectors(workspace_id: UUID, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return db.scalars(select(Connector).where(Connector.workspace_id == workspace_id).order_by(Connector.name.asc())).all()


@router.post("/workspaces/{workspace_id}/connectors", response_model=ConnectorRead, status_code=201)
def create_connector(workspace_id: UUID, payload: ConnectorCreate, db: DbSession):
    get_workspace_or_404(db, workspace_id)
    return create_connector_value(db, workspace_id=workspace_id, payload=payload)


@router.patch("/connectors/{connector_id}", response_model=ConnectorRead)
def update_connector(connector_id: UUID, payload: ConnectorUpdate, db: DbSession):
    return update_connector_value(db, connector_id=connector_id, payload=payload)


@router.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(connector_id: UUID, db: DbSession):
    delete_connector_value(db, connector_id=connector_id)
