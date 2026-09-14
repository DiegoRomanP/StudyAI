"""Real LLM provider backed by the Anthropic Messages API.

Uses the official ``anthropic`` SDK. A small explicit retry loop with
exponential backoff wraps the call so transient errors (rate limits, 5xx,
connection drops) are retried; non-retryable errors surface immediately.
"""

from __future__ import annotations

import time

from app.core.config import get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger, safe_model_identifier
from app.llm.base import LLMProvider
from app.llm.error_mapping import empty_response_error, invalid_response_error, map_sdk_error

logger = get_logger(__name__)

# Tasks that should use the cheaper/faster "quiz" model; everything else uses
# the stronger planning model.
_QUIZ_KINDS = {"quiz", "content"}


class AnthropicProvider(LLMProvider):
    def __init__(self, *, api_key: str | None = None, model: str | None = None) -> None:
        """``api_key``/``model`` are overrides for a user-supplied credential.

        Left as ``None`` (the operator ``.env`` path), behaviour is unchanged:
        the key and the plan/quiz model split come from ``Settings``. When a
        user configures their own Anthropic key via the settings UI, ``model``
        is fixed and used for every ``kind`` (no plan/quiz split for BYO keys).
        """
        import anthropic  # imported here so the mock path needs no SDK install

        self._anthropic = anthropic
        self._settings = get_settings()
        self._fixed_model = model
        # max_retries=0: we implement our own backoff loop below for clarity and
        # testability.
        self._client = anthropic.Anthropic(
            api_key=api_key or self._settings.ANTHROPIC_API_KEY,
            timeout=self._settings.LLM_TIMEOUT_SECONDS,
            max_retries=0,
        )

    def _model_for(self, kind: str) -> str:
        if self._fixed_model:
            return self._fixed_model
        if kind in _QUIZ_KINDS:
            return self._settings.LLM_MODEL_QUIZ
        return self._settings.LLM_MODEL_PLAN

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        model = self._model_for(kind)
        attempts = max(1, self._settings.LLM_MAX_RETRIES)
        last_error = None

        for attempt in range(attempts):
            try:
                response = self._client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": prompt}],
                )
                return self._extract_text(response)
            except LLMError:
                raise
            except Exception as exc:  # noqa: BLE001 - SDK exceptions vary by installed version
                mapped_error = map_sdk_error("ANTHROPIC", exc)
                last_error = mapped_error
                if mapped_error.retryable and attempt < attempts - 1:
                    backoff = 2**attempt
                    logger.warning(
                        "LLM call provider=ANTHROPIC model=%s operation=%s code=%s attempt=%d/%d; retrying in %ss",
                        safe_model_identifier(model),
                        kind,
                        mapped_error.code,
                        attempt + 1,
                        attempts,
                        backoff,
                    )
                    time.sleep(backoff)
                    continue
                last_error = mapped_error
                break

        assert last_error is not None
        raise last_error

    def test_connection(self) -> None:
        """Raise ``LLMError`` if the key/model don't actually work. Tiny call."""
        self.complete(kind="test", system="Reply with the single word: ok", prompt="ping", max_tokens=5)

    def close(self) -> None:
        self._client.close()

    @staticmethod
    def _extract_text(response) -> str:
        content = getattr(response, "content", None)
        if not isinstance(content, (list, tuple)):
            raise invalid_response_error("ANTHROPIC")

        parts: list[str] = []
        for block in content:
            block_type = getattr(block, "type", None)
            if not isinstance(block_type, str):
                raise invalid_response_error("ANTHROPIC")
            if block_type != "text":
                continue
            text = getattr(block, "text", None)
            if not isinstance(text, str):
                raise invalid_response_error("ANTHROPIC")
            parts.append(text)
        text = "".join(parts).strip()
        if not text:
            raise empty_response_error("ANTHROPIC")
        return text
