"""LLM settings DTOs.

``LLMCredentialResponse`` is built explicitly field-by-field (never
``from_attributes=True`` on the raw ORM object) so the encrypted key column can
never accidentally leak through — only ``masked_api_key`` (a short preview)
ever leaves the server.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
    model_config = ConfigDict(extra="forbid")


class LLMConnectionTest(BaseModel):
    """Tests the stored configuration revision, never an ad-hoc candidate."""

    expected_revision: int = Field(ge=1)
    model_config = ConfigDict(extra="forbid")


class LLMActivationRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    model_config = ConfigDict(extra="forbid")


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


class LLMRuntimeModels(BaseModel):
    """Models required by every runtime source for plan generation."""

    topic_analysis: str = Field(min_length=1)
    session_plan: str = Field(min_length=1)
    session_content: str = Field(min_length=1)
    model_config = ConfigDict(extra="forbid")

    @field_validator("topic_analysis", "session_plan", "session_content")
    @classmethod
    def _require_nonempty_model(cls, value: str) -> str:
        model = value.strip()
        if not model:
            raise ValueError("Los modelos runtime no pueden estar vacíos.")
        return model


class LLMRuntimeResponse(BaseModel):
    """Effective LLM source, without credentials or a connectivity guarantee."""

    source: Literal["USER", "ENV", "MOCK"]
    provider: LLMProviderName | None
    models: LLMRuntimeModels
    fallback_reason: str | None

    @model_validator(mode="after")
    def _validate_provider_for_source(self) -> "LLMRuntimeResponse":
        if self.source == "MOCK" and self.provider is not None:
            raise ValueError("MOCK no admite un proveedor real.")
        if self.source == "MOCK" and any(
            model != "simulado" for model in self.models.model_dump().values()
        ):
            raise ValueError("MOCK requiere modelos simulados.")
        if self.source == "ENV" and self.provider != LLMProviderName.ANTHROPIC:
            raise ValueError("ENV requiere Anthropic.")
        if self.source == "USER" and self.provider is None:
            raise ValueError("USER requiere un proveedor real.")
        return self


class LLMProviderErrorResponse(BaseModel):
    """Safe, typed envelope for an upstream LLM failure."""

    detail: str
    code: str
    provider: LLMProviderName | None
    upstream_status: int | None
    retryable: bool
    retry_after_seconds: float | None
