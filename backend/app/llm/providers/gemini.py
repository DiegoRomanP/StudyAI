"""Google Gemini provider contract and native GenerateContent profile."""

from __future__ import annotations

from app.core.config import get_settings
from app.llm.gemini_provider import GeminiProvider, validate_gemini_model_id
from app.llm.providers.base import ModelOption, ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile
from app.models.llm_credential import LLMCredential, LLMProviderName

GEMINI_REQUEST_PROFILE = RequestProfile(
    identifier="gemini-generate-content",
    version="v1",
    token_limit_parameter="maxOutputTokens",
    test_max_tokens=32,
    requires_usage=False,
    json_response_kinds=frozenset(
        {"topic_analysis", "session_plan", "session_content"}
    ),
)


class GeminiDefinition(ProviderDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.GEMINI,
        label="Google Gemini",
        default_base_url="https://generativelanguage.googleapis.com/v1beta",
        requires_model_selection=True,
        default_model="gemini-3.8-flash",
        common_models=(ModelOption("gemini-3.8-flash"),),
        requires_api_key=True,
        supports_model_discovery=False,
        supports_custom_base_url=False,
        allows_custom_model=True,
        key_placeholder="AIza...",
    )

    def request_profile(self, model: str) -> RequestProfile:
        return GEMINI_REQUEST_PROFILE

    def validate_model(self, model: str) -> None:
        super().validate_model(model)
        validate_gemini_model_id(model)

    def effective_base_url(self, credential: LLMCredential) -> str:
        # Gemini uses a fixed Google endpoint; never trust a stored draft URL.
        return self.meta.default_base_url or ""

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> GeminiProvider:
        settings = get_settings()
        return GeminiProvider(
            api_key=api_key,
            model=model,
            request_profile=self.request_profile(model),
            generation_policy=settings.external_generation_policy,
            test_policy=settings.external_test_policy,
        )


definition = GeminiDefinition()
