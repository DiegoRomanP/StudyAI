"""Ollama local provider contract and local-model discovery."""

from __future__ import annotations

from types import MappingProxyType

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.llm.ollama_client import OllamaClient, OllamaModel
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.providers.base import ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile
from app.models.llm_credential import LLMCredential, LLMProviderName

OLLAMA_CHAT_PROFILE = RequestProfile(
    identifier="ollama-chat",
    version="v2",
    token_limit_parameter="max_tokens",
    test_max_tokens=32,
    requires_usage=False,
    json_response_kinds=frozenset({"topic_analysis", "session_plan", "session_content"}),
    # Reasoning tokens count against max_tokens and the JSON tasks do not need them.
    extra_parameters=MappingProxyType({"reasoning_effort": "none"}),
)


class OllamaDefinition(ProviderDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.OLLAMA,
        label="Ollama local",
        default_base_url="http://127.0.0.1:11434",
        requires_model_selection=True,
        default_model="",
        requires_api_key=False,
        supports_model_discovery=True,
        supports_custom_base_url=False,
        # The UI offers only installed models from discovery (no free-text model IDs).
        allows_custom_model=False,
        key_placeholder="No requiere clave",
    )

    def validate_base_url(self, base_url: str) -> None:
        if base_url:
            raise ValidationError("La URL de Ollama se configura en OLLAMA_BASE_URL del servidor.")

    def effective_base_url(self, credential: LLMCredential) -> str:
        return f"{get_settings().OLLAMA_BASE_URL.rstrip('/')}/v1"

    def request_profile(self, model: str) -> RequestProfile:
        return OLLAMA_CHAT_PROFILE

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> OpenAICompatibleProvider:
        self.validate_base_url(credential.base_url)
        settings = get_settings()
        return OpenAICompatibleProvider(
            base_url=self.effective_base_url(credential),
            api_key=None,
            model=model,
            timeout=settings.OLLAMA_TIMEOUT_SECONDS,
            max_retries=settings.OLLAMA_MAX_RETRIES,
            max_rate_limit_retries=0,
            generation_policy=settings.ollama_policy,
            test_policy=settings.ollama_policy,
            requires_request_pacing=False,
            request_profile=self.request_profile(model),
            provider=self.meta.provider.value,
        )

    def list_models(self) -> list[OllamaModel]:
        settings = get_settings()
        client = OllamaClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=settings.OLLAMA_TIMEOUT_SECONDS
        )
        try:
            return client.list_local_models()
        finally:
            client.close()


definition = OllamaDefinition()
