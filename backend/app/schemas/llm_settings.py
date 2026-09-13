"""LLM settings DTOs.

``LLMCredentialResponse`` is built explicitly field-by-field (never
``from_attributes=True`` on the raw ORM object) so the encrypted key column can
never accidentally leak through — only ``masked_api_key`` (a short preview)
ever leaves the server.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.llm.credential_state import is_verified
from app.llm.providers_catalog import PROVIDER_CATALOG
from app.models.llm_credential import LLMCredential, LLMProviderName


class LLMCredentialUpsert(BaseModel):
    api_key: str | None = Field(default=None, min_length=8, max_length=512)
    base_url: str = Field(default="", max_length=512)


class LLMCredentialModelUpdate(BaseModel):
    """Saves a model draft before it is tested."""

    model: str = Field(min_length=1, max_length=128)
    # Omitted preserves the stored override; an empty string restores default.
    base_url: str | None = Field(default=None, max_length=512)
    expected_revision: int = Field(ge=1)


class LLMConnectionTest(BaseModel):
    """Tests the stored configuration revision, never an ad-hoc candidate."""

    expected_revision: int = Field(ge=1)


class LLMActivationRequest(BaseModel):
    expected_revision: int = Field(ge=1)


class LLMCredentialResponse(BaseModel):
    provider: LLMProviderName
    label: str
    masked_api_key: str
    model: str
    base_url: str
    is_active: bool
    config_revision: int
    is_verified: bool
    verified_at: datetime | None
    requires_model_selection: bool
    requires_api_key: bool
    supports_model_discovery: bool
    created_at: datetime

    @classmethod
    def from_credential(cls, credential: LLMCredential) -> "LLMCredentialResponse":
        meta = PROVIDER_CATALOG[credential.provider]
        return cls(
            provider=credential.provider,
            label=meta.label,
            masked_api_key=credential.key_preview,
            model=credential.model,
            base_url=credential.base_url,
            is_active=credential.is_active,
            config_revision=credential.config_revision,
            is_verified=is_verified(credential),
            verified_at=credential.verified_at,
            requires_model_selection=meta.requires_model_selection,
            requires_api_key=meta.requires_api_key,
            supports_model_discovery=meta.supports_model_discovery,
            created_at=credential.created_at,
        )


class ModelOptionResponse(BaseModel):
    id: str
    free: bool


class ProviderCatalogEntry(BaseModel):
    provider: LLMProviderName
    label: str
    requires_model_selection: bool
    default_model: str
    default_base_url: str | None
    common_models: list[ModelOptionResponse]
    key_placeholder: str
    requires_api_key: bool
    supports_model_discovery: bool


class OllamaModelResponse(BaseModel):
    id: str
    size_bytes: int | None
    parameter_size: str | None
    context_length: int | None


class LLMConnectionTestResponse(BaseModel):
    ok: bool
    credential: LLMCredentialResponse
