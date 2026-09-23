"""OpenAI provider contract and its model-specific request profiles."""

from __future__ import annotations

from app.llm.providers.base import ModelOption, ProviderMeta
from app.llm.providers.openai_compatible import StandardChatDefinition
from app.llm.request_profiles import RequestProfile, STANDARD_CHAT_PROFILE
from app.models.llm_credential import LLMProviderName

_O_SERIES_MODELS = frozenset({"o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o3-pro", "o4-mini"})
OPENAI_O_SERIES_PROFILE = RequestProfile(
    identifier="openai-o-series",
    version="v2",
    token_limit_parameter="max_completion_tokens",
    test_max_tokens=256,
)


class OpenAIDefinition(StandardChatDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.OPENAI,
        label="OpenAI (ChatGPT)",
        default_base_url="https://api.openai.com/v1",
        requires_model_selection=True,
        default_model="gpt-4o-mini",
        common_models=(
            ModelOption("gpt-4o-mini"),
            ModelOption("o4-mini"),
            ModelOption("gpt-4.1-mini"),
            ModelOption("gpt-4.1"),
            ModelOption("gpt-4o"),
        ),
        supports_custom_base_url=True,
    )

    def request_profile(self, model: str) -> RequestProfile:
        return OPENAI_O_SERIES_PROFILE if model.casefold() in _O_SERIES_MODELS else STANDARD_CHAT_PROFILE


definition = OpenAIDefinition()
