"""Provider-owned contracts used by the LLM settings and runtime flows."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.core.exceptions import ValidationError
from app.core.url_safety import assert_safe_outbound_url
from app.llm.base import LLMProvider
from app.llm.request_profiles import RequestProfile
from app.models.llm_credential import LLMCredential, LLMProviderName


@dataclass(frozen=True)
class ModelOption:
    id: str
    free: bool = False


@dataclass(frozen=True)
class ProviderMeta:
    """UI-safe provider capabilities exposed by the settings catalog."""

    provider: LLMProviderName
    label: str
    default_base_url: str | None
    requires_model_selection: bool
    default_model: str
    common_models: tuple[ModelOption, ...] = field(default_factory=tuple)
    requires_api_key: bool = True
    supports_model_discovery: bool = False
    supports_custom_base_url: bool = False
    allows_custom_model: bool = True
    key_placeholder: str = "sk-..."


class ProviderDefinition(ABC):
    """The complete configuration contract for one external LLM provider."""

    meta: ProviderMeta
    contract_version = "v1"

    def validate_api_key(self, api_key: str) -> None:
        if self.meta.requires_api_key and len(api_key) < 8:
            raise ValidationError("La clave de API no es válida (demasiado corta).")

    def validate_model(self, model: str) -> None:
        if not model:
            raise ValidationError("Debes indicar un modelo.")

    def validate_base_url(self, base_url: str) -> None:
        if not base_url:
            return
        if not self.meta.supports_custom_base_url:
            raise ValidationError(f"{self.meta.label} no admite una URL base personalizada.")
        assert_safe_outbound_url(base_url)

    def effective_base_url(self, credential: LLMCredential) -> str:
        return credential.base_url or self.meta.default_base_url or ""

    @abstractmethod
    def request_profile(self, model: str) -> RequestProfile:
        """Return the exact request profile supported for ``model``."""

    @abstractmethod
    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> LLMProvider:
        """Build a runtime provider from an already decrypted credential."""

    def verification_contract(self, model: str) -> tuple[str, ...]:
        profile = self.request_profile(model)
        return (self.contract_version, profile.identifier, profile.version)
