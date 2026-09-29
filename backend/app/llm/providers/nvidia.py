"""NVIDIA hosted NIM provider contract."""

from __future__ import annotations

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.llm.nvidia_models import (
    NVIDIA_MODEL_SPECS,
    NVIDIA_NIM_BASE_URL,
    get_nvidia_model_spec,
    nvidia_verification_version,
)
from app.llm.nvidia_provider import NvidiaNimProvider
from app.llm.providers.base import ModelOption, ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile
from app.models.llm_credential import LLMCredential, LLMProviderName


class NvidiaDefinition(ProviderDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.NVIDIA,
        label="NVIDIA NIM",
        default_base_url=NVIDIA_NIM_BASE_URL,
        requires_model_selection=True,
        default_model="nvidia/nemotron-3-super-120b-a12b",
        common_models=tuple(ModelOption(model_id) for model_id in NVIDIA_MODEL_SPECS),
        key_placeholder="nvapi-...",
        supports_custom_base_url=False,
        allows_custom_model=False,
    )

    def validate_model(self, model: str) -> None:
        super().validate_model(model)
        if get_nvidia_model_spec(model) is None:
            raise ValidationError(
                "El modelo no es compatible con NVIDIA NIM en StudyAI. Selecciona uno de la lista validada."
            )

    def validate_base_url(self, base_url: str) -> None:
        if base_url:
            raise ValidationError("NVIDIA NIM no admite una URL base personalizada.")

    def effective_base_url(self, credential: LLMCredential) -> str:
        return NVIDIA_NIM_BASE_URL

    def request_profile(self, model: str) -> RequestProfile:
        spec = get_nvidia_model_spec(model)
        if spec is None:
            raise ValidationError("El modelo no es compatible con NVIDIA NIM en StudyAI.")
        return spec.request_profile

    def verification_contract(self, model: str) -> tuple[str, ...]:
        spec = get_nvidia_model_spec(model)
        if spec is None:
            # Existing credentials can retain a model after it is removed from
            # the supported registry. Fingerprinting must still work so startup
            # can invalidate that stale verification instead of aborting.
            return (nvidia_verification_version(model), "unsupported")
        return (nvidia_verification_version(model), *super().verification_contract(model))

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> NvidiaNimProvider:
        self.validate_base_url(credential.base_url)
        self.validate_model(model)
        spec = get_nvidia_model_spec(model)
        assert spec is not None
        settings = get_settings()
        return NvidiaNimProvider(
            api_key=api_key,
            model_spec=spec,
            generation_policy=settings.external_generation_policy,
            test_policy=settings.external_test_policy,
        )


definition = NvidiaDefinition()
