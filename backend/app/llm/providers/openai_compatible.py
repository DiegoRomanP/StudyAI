"""Reusable definition base for providers with the standard chat protocol."""

from __future__ import annotations

from app.core.config import get_settings
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.providers.base import ProviderDefinition
from app.llm.request_profiles import RequestProfile, STANDARD_CHAT_PROFILE
from app.models.llm_credential import LLMCredential


class StandardChatDefinition(ProviderDefinition):
    """Provider contract backed by the shared OpenAI-style HTTP transport."""

    def request_profile(self, model: str) -> RequestProfile:
        return STANDARD_CHAT_PROFILE

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> OpenAICompatibleProvider:
        settings = get_settings()
        return OpenAICompatibleProvider(
            base_url=self.effective_base_url(credential),
            api_key=api_key,
            model=model,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
            max_rate_limit_retries=settings.LLM_MAX_RATE_LIMIT_RETRIES,
            generation_policy=settings.external_generation_policy,
            test_policy=settings.external_test_policy,
            request_profile=self.request_profile(model),
            provider=self.meta.provider.value,
        )
