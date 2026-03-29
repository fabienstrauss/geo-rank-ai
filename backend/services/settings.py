from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Connector, ProviderCredential, WorkspaceSetting
from plugins.registry import get_scraper_plugin
from schemas import (
    ConnectorCreate,
    ConnectorRead,
    ConnectorUpdate,
    ProviderCredentialRead,
    ProviderCredentialUpsert,
    WorkspaceSettingUpsert,
)
from security import encrypt_secret, mask_secret


SUPPORTED_PROVIDER_KEYS = {"openai", "anthropic", "google"}


def get_workspace_setting(db: Session, workspace_id: UUID, key: str) -> WorkspaceSetting | None:
    return db.scalar(select(WorkspaceSetting).where(WorkspaceSetting.workspace_id == workspace_id, WorkspaceSetting.key == key))


def normalize_connector_payload(
    *,
    implementation_key: str,
    connector_type,
    provider_key: str | None,
    config_json: dict | None,
):
    plugin = get_scraper_plugin(implementation_key)
    if plugin.scraper_type != connector_type:
        raise HTTPException(status_code=422, detail="implementation_key does not match connector_type")

    normalized = plugin.config_model.model_validate(config_json or {}).model_dump()
    resolved_provider = provider_key or plugin.provider_key or normalized.get("provider")

    if plugin.scraper_type.value == "llm_api" and not resolved_provider:
        raise HTTPException(status_code=422, detail="provider_key is required for llm_api connectors")

    if resolved_provider and "provider" in normalized:
        normalized["provider"] = resolved_provider

    return resolved_provider, normalized


def upsert_workspace_setting_value(
    db: Session,
    *,
    workspace_id: UUID,
    key: str,
    payload: WorkspaceSettingUpsert,
) -> WorkspaceSetting:
    if key == "default_provider":
        provider = str(payload.value_json.get("provider") or "").strip().lower()
        if provider not in SUPPORTED_PROVIDER_KEYS:
            raise HTTPException(status_code=422, detail="default_provider must be one of: openai, anthropic, google")

        disabled_credential = db.scalar(
            select(ProviderCredential).where(
                ProviderCredential.workspace_id == workspace_id,
                ProviderCredential.provider == provider,
                ProviderCredential.is_enabled.is_(False),
            )
        )
        if disabled_credential:
            raise HTTPException(status_code=400, detail="Cannot set a disabled provider credential as default")

        credentials = db.scalars(select(ProviderCredential).where(ProviderCredential.workspace_id == workspace_id)).all()
        for credential in credentials:
            credential.is_default = credential.provider == provider

    if key == "default_connector":
        connector_id = payload.value_json.get("connector_id")
        if connector_id:
            try:
                connector_uuid = UUID(str(connector_id))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="default_connector.connector_id must be a valid UUID") from exc
            connector = db.get(Connector, connector_uuid)
            if not connector or connector.workspace_id != workspace_id:
                raise HTTPException(status_code=404, detail="Default connector not found for this workspace")
            if not connector.is_enabled:
                raise HTTPException(status_code=400, detail="Cannot set a disabled connector as default")

    setting = get_workspace_setting(db, workspace_id, key)
    if not setting:
        setting = WorkspaceSetting(workspace_id=workspace_id, key=key, value_json=payload.value_json)
        db.add(setting)
    else:
        setting.value_json = payload.value_json
    db.commit()
    db.refresh(setting)
    return setting


def list_provider_credential_reads(db: Session, workspace_id: UUID) -> list[ProviderCredentialRead]:
    credentials = db.scalars(
        select(ProviderCredential)
        .where(ProviderCredential.workspace_id == workspace_id)
        .order_by(ProviderCredential.provider.asc())
    ).all()
    items: list[ProviderCredentialRead] = []
    for credential in credentials:
        last4 = (credential.metadata_json or {}).get("key_last4")
        items.append(
            ProviderCredentialRead(
                id=credential.id,
                workspace_id=credential.workspace_id,
                provider=credential.provider,
                has_api_key=bool(credential.encrypted_api_key),
                masked_api_key=mask_secret(str(last4)) if last4 else None,
                secret_reference=credential.secret_reference,
                is_default=credential.is_default,
                is_enabled=credential.is_enabled,
                metadata_json=credential.metadata_json,
                created_at=credential.created_at,
                updated_at=credential.updated_at,
            )
        )
    return items


def upsert_provider_credential_value(
    db: Session,
    *,
    workspace_id: UUID,
    provider: str,
    payload: ProviderCredentialUpsert,
) -> ProviderCredentialRead:
    provider = provider.strip().lower()
    if provider not in SUPPORTED_PROVIDER_KEYS:
        raise HTTPException(status_code=422, detail="Unsupported provider")

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

    merged_metadata = dict(credential.metadata_json or {})
    if payload.metadata_json is not None:
        merged_metadata.update(payload.metadata_json)

    if payload.api_key is not None:
        api_key = payload.api_key.strip()
        if api_key:
            credential.encrypted_api_key = encrypt_secret(api_key)
            merged_metadata["key_last4"] = api_key[-4:]
        elif payload.clear_secret:
            credential.encrypted_api_key = None
            merged_metadata.pop("key_last4", None)

    if payload.clear_secret:
        credential.encrypted_api_key = None
        credential.secret_reference = None
        merged_metadata.pop("key_last4", None)
        if payload.is_default is None:
            credential.is_default = False
        if payload.is_enabled is None:
            credential.is_enabled = False

    if payload.secret_reference is not None:
        credential.secret_reference = payload.secret_reference or None
    if payload.is_default is not None:
        credential.is_default = payload.is_default
    if payload.is_enabled is not None:
        credential.is_enabled = payload.is_enabled

    if credential.is_default and not credential.is_enabled:
        raise HTTPException(status_code=400, detail="A default provider credential must stay enabled")

    if credential.is_default and not (credential.encrypted_api_key or credential.secret_reference):
        raise HTTPException(status_code=400, detail="A default provider credential must have a configured secret")

    credential.metadata_json = merged_metadata or None

    if credential.is_default:
        setting = get_workspace_setting(db, workspace_id, "default_provider")
        if not setting:
            setting = WorkspaceSetting(workspace_id=workspace_id, key="default_provider", value_json={"provider": provider})
            db.add(setting)
        else:
            setting.value_json = {"provider": provider}
    elif payload.clear_secret:
        setting = get_workspace_setting(db, workspace_id, "default_provider")
        if setting and (setting.value_json or {}).get("provider") == provider:
            setting.value_json = {"provider": "openai"}

    db.commit()
    db.refresh(credential)
    last4 = (credential.metadata_json or {}).get("key_last4")
    return ProviderCredentialRead(
        id=credential.id,
        workspace_id=credential.workspace_id,
        provider=credential.provider,
        has_api_key=bool(credential.encrypted_api_key),
        masked_api_key=mask_secret(str(last4)) if last4 else None,
        secret_reference=credential.secret_reference,
        is_default=credential.is_default,
        is_enabled=credential.is_enabled,
        metadata_json=credential.metadata_json,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


def create_connector_value(db: Session, *, workspace_id: UUID, payload: ConnectorCreate) -> Connector:
    provider_key, config_json = normalize_connector_payload(
        implementation_key=payload.implementation_key,
        connector_type=payload.connector_type,
        provider_key=payload.provider_key,
        config_json=payload.config_json,
    )
    connector = Connector(
        workspace_id=workspace_id,
        name=payload.name,
        implementation_key=payload.implementation_key,
        connector_type=payload.connector_type,
        provider_key=provider_key,
        is_enabled=payload.is_enabled,
        config_json=config_json,
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return connector


def update_connector_value(db: Session, *, connector_id: UUID, payload: ConnectorUpdate) -> ConnectorRead:
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")

    updates = payload.model_dump(exclude_unset=True)
    next_implementation_key = updates.get("implementation_key", connector.implementation_key)
    next_connector_type = updates.get("connector_type", connector.connector_type)
    next_provider_key = updates.get("provider_key", connector.provider_key)
    next_config_json = updates.get("config_json", connector.config_json)
    provider_key, config_json = normalize_connector_payload(
        implementation_key=next_implementation_key,
        connector_type=next_connector_type,
        provider_key=next_provider_key,
        config_json=next_config_json,
    )

    default_connector_setting = get_workspace_setting(db, connector.workspace_id, "default_connector")
    default_connector_id = (default_connector_setting.value_json or {}).get("connector_id") if default_connector_setting else None
    if default_connector_id == str(connector.id) and payload.is_enabled is False:
        raise HTTPException(status_code=400, detail="Clear the default connector before disabling it")

    for field, value in updates.items():
        setattr(connector, field, value)
    connector.provider_key = provider_key
    connector.config_json = config_json

    db.commit()
    db.refresh(connector)
    return connector


def delete_connector_value(db: Session, *, connector_id: UUID):
    connector = db.get(Connector, connector_id)
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    default_connector_setting = get_workspace_setting(db, connector.workspace_id, "default_connector")
    default_connector_id = (default_connector_setting.value_json or {}).get("connector_id") if default_connector_setting else None
    if default_connector_id == str(connector.id):
        raise HTTPException(status_code=400, detail="Clear the default connector before deleting it")
    db.delete(connector)
    db.commit()
