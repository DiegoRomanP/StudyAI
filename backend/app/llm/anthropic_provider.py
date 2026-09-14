"""Real LLM provider backed by the Anthropic Messages API.

Uses the official ``anthropic`` SDK. A small explicit retry loop with
exponential backoff wraps the call so transient errors (rate limits, 5xx,
connection drops) are retried; non-retryable errors surface immediately.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping

import httpx2 as httpx

from app.core.config import LLMCallPolicy, get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger, safe_model_identifier
from app.llm.async_runner import get_async_runner
from app.llm.base import LLMProvider
from app.llm.error_mapping import (
    empty_response_error,
    invalid_response_error,
    map_sdk_error,
    output_limit_error,
    refusal_error,
    timeout_error,
)
from app.llm.request_profiles import STANDARD_CHAT_PROFILE

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
        self._generation_policy = self._settings.external_generation_policy
        self._test_policy = self._settings.external_test_policy
        # max_retries=0: we implement our own backoff loop below for clarity and
        # testability.
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key or self._settings.ANTHROPIC_API_KEY,
            timeout=httpx.Timeout(
                self._generation_policy.read_timeout_seconds,
                connect=self._generation_policy.connect_timeout_seconds,
            ),
            max_retries=0,
        )
        self._runner = get_async_runner()

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
        return self._runner.run(self._complete_async(kind, system, prompt, max_tokens))

    async def _complete_async(
        self, kind: str, system: str, prompt: str, max_tokens: int
    ) -> str:
        model = self._model_for(kind)
        policy = self._test_policy if kind == "test" else self._generation_policy
        loop = asyncio.get_running_loop()
        deadline = loop.time() + policy.total_budget_seconds
        attempt = 0
        rate_limit_attempt = 0
        transient_retry_attempt = 0
        is_connection_test = kind == "test"

        try:
            async with asyncio.timeout_at(deadline):
                while True:
                    remaining = self._remaining_seconds(deadline)
                    last_error: LLMError | None = None
                    try:
                        response = await self._client.messages.create(
                            model=model,
                            max_tokens=max_tokens,
                            system=system,
                            messages=[{"role": "user", "content": prompt}],
                            timeout=self._request_timeout(policy, remaining),
                        )
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error("ANTHROPIC")
                        text = await asyncio.to_thread(self._extract_text, response)
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error("ANTHROPIC")
                        return text
                    except LLMError:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error("ANTHROPIC") from None
                        raise
                    except Exception as exc:  # noqa: BLE001 - SDK exceptions vary by installed version
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error("ANTHROPIC") from None
                        mapped_error = map_sdk_error("ANTHROPIC", exc)
                        last_error = mapped_error
                        if (
                            mapped_error.code == "LLM_RATE_LIMITED"
                            and rate_limit_attempt < policy.max_rate_limit_retries
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            wait = self._rate_limit_wait_seconds(mapped_error.retry_after_seconds, rate_limit_attempt + 1)
                            if wait < self._remaining_seconds(deadline):
                                rate_limit_attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=ANTHROPIC model=%s operation=%s code=%s attempt=%d/%d; retrying in %.1fs", safe_model_identifier(model), kind, mapped_error.code, rate_limit_attempt, policy.max_rate_limit_retries, wait)
                                await asyncio.sleep(wait)
                                continue
                        if (
                            mapped_error.retryable
                            and mapped_error.code != "LLM_RATE_LIMITED"
                            and attempt < policy.max_attempts - 1
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=ANTHROPIC model=%s operation=%s code=%s attempt=%d/%d; retrying in %ss", safe_model_identifier(model), kind, mapped_error.code, attempt + 1, policy.max_attempts, backoff)
                                await asyncio.sleep(backoff)
                                continue

                    assert last_error is not None
                    if self._remaining_seconds(deadline) <= 0:
                        raise timeout_error("ANTHROPIC")
                    raise last_error
        except TimeoutError:
            raise timeout_error("ANTHROPIC") from None

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        return max(deadline - asyncio.get_running_loop().time(), 0.0)

    @staticmethod
    def _rate_limit_wait_seconds(retry_after_seconds: float | None, attempt: int) -> float:
        return retry_after_seconds if retry_after_seconds is not None else 10.0 * attempt

    @staticmethod
    def _request_timeout(policy: LLMCallPolicy, remaining: float) -> httpx.Timeout:
        return httpx.Timeout(
            min(policy.read_timeout_seconds, remaining),
            connect=min(policy.connect_timeout_seconds, remaining),
        )

    def test_connection(self) -> None:
        """Raise ``LLMError`` if the key/model don't actually work."""
        self.complete(
            kind="test",
            system="Reply with the single word: ok",
            prompt="ping",
            max_tokens=STANDARD_CHAT_PROFILE.test_max_tokens,
        )

    def close(self) -> None:
        self._runner.run(self._client.close())

    @staticmethod
    def _extract_text(response: object) -> str:
        stop_reason = getattr(response, "stop_reason", None)
        if not isinstance(stop_reason, str):
            raise invalid_response_error("ANTHROPIC")
        if stop_reason in {"max_tokens", "model_context_window_exceeded"}:
            raise output_limit_error("ANTHROPIC")
        if stop_reason == "refusal":
            raise refusal_error("ANTHROPIC")
        if stop_reason not in {"end_turn", "stop_sequence"}:
            raise invalid_response_error("ANTHROPIC")

        AnthropicProvider._validate_usage(response)

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

    @staticmethod
    def _validate_usage(response: object) -> None:
        usage = getattr(response, "usage", None)
        if usage is None:
            raise invalid_response_error("ANTHROPIC")
        for field in ("input_tokens", "output_tokens"):
            value = usage.get(field) if isinstance(usage, Mapping) else getattr(usage, field, None)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise invalid_response_error("ANTHROPIC")
