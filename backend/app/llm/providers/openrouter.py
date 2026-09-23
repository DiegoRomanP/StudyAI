"""OpenRouter provider contract."""

from __future__ import annotations

from app.core.config import get_settings
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.providers.base import ModelOption, ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile, STANDARD_CHAT_PROFILE
from app.models.llm_credential import LLMCredential, LLMProviderName


class OpenRouterDefinition(ProviderDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.OPENROUTER,
        label="OpenRouter",
        default_base_url="https://openrouter.ai/api/v1",
        requires_model_selection=True,
        default_model="meta-llama/llama-3.3-70b-instruct:free",
        common_models=(
            ModelOption("meta-llama/llama-3.3-70b-instruct:free", free=True),
            ModelOption("deepseek/deepseek-chat:free", free=True),
            ModelOption("google/gemini-2.0-flash-exp:free", free=True),
            ModelOption("openai/gpt-4o-mini"),
            ModelOption("anthropic/claude-sonnet-4"),
        ),
        supports_custom_base_url=True,
    )

    def request_profile(self, model: str) -> RequestProfile:
        return STANDARD_CHAT_PROFILE

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> OpenRouterProvider:
        if credential.base_url:
            self.validate_base_url(credential.base_url)
        settings = get_settings()
        return OpenRouterProvider(
            base_url=self.effective_base_url(credential),
            api_key=api_key,
            model=model,
            request_profile=self.request_profile(model),
            generation_policy=settings.external_generation_policy,
            test_policy=settings.external_test_policy,
        )


definition = OpenRouterDefinition()
