"""LLM provider credential endpoints (bring-your-own-key settings)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.llm.providers_catalog import PROVIDER_CATALOG
from app.models.llm_credential import LLMProviderName
from app.models.user import User
from app.schemas.llm_settings import (
    LLMCredentialModelUpdate,
    LLMCredentialResponse,
    LLMCredentialUpsert,
    LLMActivationRequest,
    LLMConnectionTest,
    LLMConnectionTestResponse,
    ModelOptionResponse,
    OllamaModelResponse,
    ProviderCatalogEntry,
)
from app.services.llm_settings_service import LLMSettingsService

router = APIRouter(prefix="/llm-settings", tags=["llm-settings"])


@router.get("/catalog", response_model=list[ProviderCatalogEntry])
def get_provider_catalog() -> list[ProviderCatalogEntry]:
    return [
        ProviderCatalogEntry(
            provider=meta.provider,
            label=meta.label,
            requires_model_selection=meta.requires_model_selection,
            default_model=meta.default_model,
            default_base_url=meta.default_base_url,
            common_models=[
                ModelOptionResponse(id=m.id, free=m.free) for m in meta.common_models
            ],
            key_placeholder=meta.key_placeholder,
            requires_api_key=meta.requires_api_key,
            supports_model_discovery=meta.supports_model_discovery,
        )
        for meta in PROVIDER_CATALOG.values()
    ]


@router.get("", response_model=list[LLMCredentialResponse])
def list_credentials(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[LLMCredentialResponse]:
    service = LLMSettingsService(db)
    return [
        LLMCredentialResponse.from_credential(c) for c in service.list_credentials(user.id)
    ]


@router.put("/{provider}", response_model=LLMCredentialResponse)
def upsert_credential(
    provider: LLMProviderName,
    payload: LLMCredentialUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LLMCredentialResponse:
    service = LLMSettingsService(db)
    credential = service.upsert_credential(
        user.id, provider, payload.api_key, payload.base_url
    )
    return LLMCredentialResponse.from_credential(credential)


@router.patch("/{provider}/model", response_model=LLMCredentialResponse)
def update_credential_model(
    provider: LLMProviderName,
    payload: LLMCredentialModelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LLMCredentialResponse:
    service = LLMSettingsService(db)
    credential = service.update_model(
        user.id, provider, payload.model, payload.base_url, payload.expected_revision
    )
    return LLMCredentialResponse.from_credential(credential)


@router.post("/{provider}/activate", response_model=LLMCredentialResponse)
def activate_credential(
    provider: LLMProviderName,
    payload: LLMActivationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LLMCredentialResponse:
    service = LLMSettingsService(db)
    credential = service.activate(user.id, provider, payload.expected_revision)
    return LLMCredentialResponse.from_credential(credential)


@router.post("/deactivate-all", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_all_credentials(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    service = LLMSettingsService(db)
    service.deactivate_all(user.id)


@router.get("/{provider}/models", response_model=list[OllamaModelResponse])
def list_ollama_models(
    provider: LLMProviderName,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[OllamaModelResponse]:
    models = LLMSettingsService(db).list_ollama_models(provider)
    return [OllamaModelResponse(**model.__dict__) for model in models]


@router.post("/{provider}/test", response_model=LLMConnectionTestResponse)
def test_credential(
    provider: LLMProviderName,
    payload: LLMConnectionTest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LLMConnectionTestResponse:
    service = LLMSettingsService(db)
    credential = service.test_credential(user.id, provider, payload.expected_revision)
    return LLMConnectionTestResponse(
        ok=True, credential=LLMCredentialResponse.from_credential(credential)
    )


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credential(
    provider: LLMProviderName,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    service = LLMSettingsService(db)
    service.delete_credential(user.id, provider)
