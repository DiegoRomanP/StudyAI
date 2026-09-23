"""Anthropic provider contract."""

from __future__ import annotations

from app.core.exceptions import ValidationError
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.providers.base import ModelOption, ProviderDefinition, ProviderMeta
from app.llm.request_profiles import RequestProfile, STANDARD_CHAT_PROFILE
from app.models.llm_credential import LLMCredential, LLMProviderName


class AnthropicDefinition(ProviderDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.ANTHROPIC,
        label="Anthropic (Claude)",
        default_base_url=None,
        requires_model_selection=True,
        default_model="claude-haiku-4-5",
        common_models=(
            ModelOption("claude-haiku-4-5"),
            ModelOption("claude-sonnet-5"),
            ModelOption("claude-opus-4-8"),
        ),
    )

    def validate_base_url(self, base_url: str) -> None:
        if base_url:
            raise ValidationError("Anthropic no admite una URL base personalizada.")

    def effective_base_url(self, credential: LLMCredential) -> str:
        return ""

    def request_profile(self, model: str) -> RequestProfile:
        return STANDARD_CHAT_PROFILE

    def build_provider(
        self, credential: LLMCredential, *, api_key: str, model: str
    ) -> AnthropicProvider:
        self.validate_base_url(credential.base_url)
        return AnthropicProvider(api_key=api_key, model=model)


definition = AnthropicDefinition()
