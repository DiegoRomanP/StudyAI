"""LLM provider abstraction.

The rest of the app depends only on this interface, so the concrete backend
(real Anthropic API vs. deterministic mock) is chosen once by the factory and
swapped without touching call sites (Dependency Inversion / Strategy).

The ``kind`` argument identifies the logical task (topic_analysis, session_plan,
content, quiz). The real provider uses it only to pick a model; the mock uses it
— together with ``context`` — to synthesise schema-valid output offline.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    # Local and mock providers do not need cloud rate-limit pacing.
    requires_request_pacing = True

    @abstractmethod
    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        """Return the raw text completion for ``prompt``."""
        ...

    def close(self) -> None:
        """Release provider resources after a short-lived operation."""
