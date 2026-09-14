"""Small, explicit request profiles for provider/model families."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.models.llm_credential import LLMProviderName


@dataclass(frozen=True)
class RequestProfile:
    """External request capabilities for one provider/model family.

    Callers retain the provider-neutral ``max_tokens`` argument. The adapter
    translates it to ``token_limit_parameter`` only when it builds the HTTP
    payload, keeping provider-specific protocol details at the boundary.
    """

    identifier: str
    version: str
    token_limit_parameter: Literal["max_tokens", "max_completion_tokens"]
    test_max_tokens: int
    requires_usage: bool = True
    json_response_kinds: frozenset[str] = field(default_factory=frozenset)

    def payload_parameters(self, kind: str, max_tokens: int) -> dict[str, object]:
        """Build every profile-controlled part of an outbound request."""
        parameters: dict[str, object] = {self.token_limit_parameter: max_tokens}
        if kind in self.json_response_kinds:
            parameters["response_format"] = {"type": "json_object"}
        return parameters


STANDARD_CHAT_PROFILE = RequestProfile(
    identifier="standard-chat",
    version="v2",
    token_limit_parameter="max_tokens",
    test_max_tokens=32,
)
OLLAMA_CHAT_PROFILE = RequestProfile(
    identifier="ollama-chat",
    version="v2",
    token_limit_parameter="max_tokens",
    test_max_tokens=32,
    requires_usage=False,
    json_response_kinds=frozenset({"topic_analysis", "session_plan", "session_content"}),
)
OPENAI_O_SERIES_PROFILE = RequestProfile(
    identifier="openai-o-series",
    version="v2",
    token_limit_parameter="max_completion_tokens",
    test_max_tokens=256,
)

# Keep this deliberately explicit. The settings UI permits arbitrary IDs, so a
# prefix such as ``o4-`` can be a gateway deployment rather than an OpenAI model.
_OPENAI_O_SERIES_MODELS = frozenset(
    {
        "o1",
        "o1-mini",
        "o1-preview",
        "o3",
        "o3-mini",
        "o3-pro",
        "o4-mini",
    }
)


def resolve_request_profile(
    provider: LLMProviderName | str, model: str
) -> RequestProfile:
    """Return a confirmed profile; unknown model IDs use the provider base."""
    provider_name = provider.value if isinstance(provider, LLMProviderName) else provider
    if provider_name.upper() == LLMProviderName.OLLAMA.value:
        return OLLAMA_CHAT_PROFILE
    if (
        provider_name.upper() == LLMProviderName.OPENAI.value
        and model.casefold() in _OPENAI_O_SERIES_MODELS
    ):
        return OPENAI_O_SERIES_PROFILE
    return STANDARD_CHAT_PROFILE
