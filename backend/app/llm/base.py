"""LLM provider abstraction.

The rest of the app depends only on this interface, so the concrete backend
(real Anthropic API vs. deterministic mock) is chosen once by the factory and
swapped without touching call sites (Dependency Inversion / Strategy).

The ``kind`` argument identifies the logical task (topic_analysis, session_plan,
session_content; legacy content and quiz are also supported). The real provider
uses it only to pick a model; the mock uses it — together with ``context`` — to
synthesise schema-valid output offline.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.llm.usage import LLMUsage


class LLMProvider(ABC):
    # Local and mock providers do not need cloud rate-limit pacing.
    requires_request_pacing = True
    # Whether ``complete`` reads ``context["image_paths"]`` (local PNG files) as vision input.
    supports_images = False
    # Whether v2 lessons may ask this provider for SVG drawings and document figures
    # (longer output; only offered where it costs no per-token money).
    rich_content = False

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

    def _record_usage(self, usage: LLMUsage) -> None:
        # Per instance: a class-level list would be shared by every provider.
        self.__dict__.setdefault("_usage_log", []).append(usage)

    def drain_usage(self) -> list[LLMUsage]:
        """Return the usage reported since the last call and forget it."""
        return self.__dict__.pop("_usage_log", [])

    def close(self) -> None:
        """Release provider resources after a short-lived operation."""
