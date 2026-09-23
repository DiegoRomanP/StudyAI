"""Small, explicit request profiles for provider/model families."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

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
