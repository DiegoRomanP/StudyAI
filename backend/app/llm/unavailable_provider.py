"""Provider used in SaaS mode when the server has no working AI key.

It always fails, so a paying user gets a clear error (and a refunded credit) instead of
the mock's fake content.
"""

from __future__ import annotations

from app.core.exceptions import LLMError
from app.llm.base import LLMProvider


class UnavailableLLMProvider(LLMProvider):
    requires_request_pacing = False

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        raise LLMError(
            "El servicio de IA no está disponible en este momento. Te devolvimos el crédito.",
            code="LLM_UNAVAILABLE",
            retryable=False,
        )
