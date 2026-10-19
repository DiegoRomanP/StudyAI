"""DeepSeek provider contract and its non-thinking request profile."""

from __future__ import annotations

from types import MappingProxyType

from app.llm.providers.base import ModelOption, ProviderMeta
from app.llm.providers.openai_compatible import StandardChatDefinition
from app.llm.request_profiles import RequestProfile
from app.models.llm_credential import LLMProviderName

# DeepSeek thinks by default; the reasoning would eat the sized max_tokens
# budget of every call and make each one far slower, so it is switched off.
DEEPSEEK_NON_THINKING_PROFILE = RequestProfile(
    identifier="deepseek-non-thinking",
    version="v1",
    token_limit_parameter="max_tokens",
    test_max_tokens=32,
    extra_parameters=MappingProxyType({"thinking": {"type": "disabled"}}),
)


class DeepSeekDefinition(StandardChatDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.DEEPSEEK,
        label="DeepSeek",
        default_base_url="https://api.deepseek.com",
        requires_model_selection=True,
        default_model="deepseek-flash",
        common_models=(
            ModelOption("deepseek-flash"),
            ModelOption("deepseek-v4-pro"),
        ),
    )

    def request_profile(self, model: str) -> RequestProfile:
        return DEEPSEEK_NON_THINKING_PROFILE


definition = DeepSeekDefinition()
