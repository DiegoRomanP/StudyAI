"""Provider for any OpenAI-compatible chat-completions API.

OpenAI, DeepSeek, OpenRouter and NVIDIA NIM all expose the same
``POST {base_url}/chat/completions`` shape and differ only in base URL, model
name and API key — so one class serves all four rather than four near-duplicate
provider classes. Written against ``httpx`` directly instead of adding the
``openai`` SDK as a new dependency.

Only approved request metadata is logged — never provider response bodies, the
request payload (which includes document content), or Authorization headers.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping

import httpx

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.core.logging import get_logger, safe_model_identifier
from app.llm.async_runner import get_async_runner
from app.llm.base import LLMProvider
from app.llm.error_mapping import (
    empty_response_error,
    invalid_response_error,
    map_http_error,
    map_transport_error,
    output_limit_error,
    refusal_error,
    timeout_error,
)
from app.llm.request_profiles import RequestProfile

logger = get_logger(__name__)

# 429 is deliberately excluded — it gets its own dedicated retry path below.
_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}
_MAX_RATE_LIMIT_RETRIES = 6


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        request_profile: RequestProfile,
        timeout: float = 60.0,
        max_retries: int = 3,
        max_rate_limit_retries: int = _MAX_RATE_LIMIT_RETRIES,
        generation_policy: LLMCallPolicy | None = None,
        test_policy: LLMCallPolicy | None = None,
        requires_request_pacing: bool = True,
        provider: str = "OPENAI",
        payload_builder: Callable[[str, str, str, int], dict] | None = None,
        response_parser: Callable[[object], str] | None = None,
        accepted_response_handler: Callable[
            [httpx.Response, str, LLMCallPolicy, float], Awaitable[str]
        ]
        | None = None,
        retries_post_transient_errors: bool = True,
    ) -> None:
        self._provider = provider
        self._model = model
        default_policy = LLMCallPolicy(
            connect_timeout_seconds=timeout,
            read_timeout_seconds=timeout,
            total_budget_seconds=timeout * max(1, max_retries),
            max_attempts=max(1, max_retries),
            max_rate_limit_retries=max(0, max_rate_limit_retries),
        )
        self._generation_policy = generation_policy or default_policy
        self._test_policy = test_policy or default_policy
        self.requires_request_pacing = requires_request_pacing
        self._request_profile = request_profile
        self._payload_builder = payload_builder
        self._response_parser = response_parser
        self._accepted_response_handler = accepted_response_handler
        self._retries_post_transient_errors_value = retries_post_transient_errors
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=None,
            # base_url can be a user-supplied override (SSRF surface, validated
            # in app.core.url_safety) — never follow a redirect to somewhere
            # that wasn't itself validated. This is httpx's default already;
            # kept explicit so it can't silently change under us.
            follow_redirects=False,
        )
        self._runner = get_async_runner()

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,  # esto se se debe ajustar cuando sea un proveedor externo
    ) -> str:
        payload = (
            self._payload_builder(kind, system, prompt, max_tokens)
            if self._payload_builder is not None
            else self._build_payload(kind, system, prompt, max_tokens)
        )
        return self._runner.run(self._complete_async(kind, payload))

    def _build_payload(self, kind: str, system: str, prompt: str, max_tokens: int) -> dict:
        """Build the default OpenAI-compatible payload for generic providers."""
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            **self._request_profile.payload_parameters(kind, max_tokens),
        }

    async def _complete_async(self, kind: str, payload: dict) -> str:
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
                    terminal_error: LLMError | None = None
                    accepted_response = False
                    try:
                        response = await self._client.post(
                            "/chat/completions",
                            json=payload,
                            timeout=self._request_timeout(policy, remaining),
                        )
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        if response.status_code == httpx.codes.ACCEPTED:
                            accepted_response = True
                            accepted_handler = (
                                self._accepted_response_handler or self._handle_accepted_response
                            )
                            return await accepted_handler(
                                response, kind, policy, deadline
                            )
                        response.raise_for_status()
                        data = await asyncio.to_thread(response.json)
                        response_parser = self._response_parser or self._extract_text
                        text = await asyncio.to_thread(response_parser, data)
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        return text
                    except httpx.HTTPStatusError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        status_code = exc.response.status_code
                        mapped_error = await asyncio.to_thread(
                            map_http_error, self._provider, exc.response
                        )
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        if (
                            mapped_error.code == "LLM_RATE_LIMITED"
                            and rate_limit_attempt < policy.max_rate_limit_retries
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            wait = self._rate_limit_wait_seconds(mapped_error.retry_after_seconds, rate_limit_attempt + 1)
                            if wait < self._remaining_seconds(deadline):
                                rate_limit_attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=%s model=%s operation=%s status=%d code=%s attempt=%d/%d; retrying in %.1fs", self._provider, safe_model_identifier(self._model), kind, status_code, mapped_error.code, rate_limit_attempt, policy.max_rate_limit_retries, wait)
                                await asyncio.sleep(wait)
                                continue
                        if (
                            self._retries_post_transient_errors
                            and mapped_error.retryable
                            and status_code in _RETRYABLE_STATUS_CODES
                            and attempt < policy.max_attempts - 1
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=%s model=%s operation=%s status=%d code=%s attempt=%d/%d; retrying in %ss", self._provider, safe_model_identifier(self._model), kind, status_code, mapped_error.code, attempt + 1, policy.max_attempts, backoff)
                                await asyncio.sleep(backoff)
                                continue
                        terminal_error = mapped_error
                    except httpx.HTTPError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        mapped_error = map_transport_error(self._provider, exc)
                        if (
                            self._retries_post_transient_errors
                            and mapped_error.retryable
                            and attempt < policy.max_attempts - 1
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=%s model=%s operation=%s code=%s attempt=%d/%d; retrying in %ss", self._provider, safe_model_identifier(self._model), kind, mapped_error.code, attempt + 1, policy.max_attempts, backoff)
                                await asyncio.sleep(backoff)
                                continue
                        terminal_error = mapped_error
                    except LLMError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider) from None
                        if accepted_response:
                            # The provider has already accepted this billable
                            # POST. A status-poll failure must never replay it.
                            raise
                        if (
                            exc.code == "LLM_RATE_LIMITED"
                            and rate_limit_attempt < policy.max_rate_limit_retries
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            wait = self._rate_limit_wait_seconds(exc.retry_after_seconds, rate_limit_attempt + 1)
                            if wait < self._remaining_seconds(deadline):
                                rate_limit_attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=%s model=%s operation=%s code=%s attempt=%d/%d; retrying in %.1fs", self._provider, safe_model_identifier(self._model), kind, exc.code, rate_limit_attempt, policy.max_rate_limit_retries, wait)
                                await asyncio.sleep(wait)
                                continue
                        if (
                            exc.retryable
                            and exc.code != "LLM_RATE_LIMITED"
                            and attempt < policy.max_attempts - 1
                            and (not is_connection_test or transient_retry_attempt < policy.max_attempts - 1)
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning("LLM call provider=%s model=%s operation=%s code=%s attempt=%d/%d; retrying in %ss", self._provider, safe_model_identifier(self._model), kind, exc.code, attempt + 1, policy.max_attempts, backoff)
                                await asyncio.sleep(backoff)
                                continue
                        raise
                    except ValueError:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        terminal_error = invalid_response_error(self._provider)

                    assert terminal_error is not None
                    if self._remaining_seconds(deadline) <= 0:
                        raise timeout_error(self._provider)
                    raise terminal_error
        except TimeoutError:
            raise timeout_error(self._provider) from None

    @staticmethod
    def _rate_limit_wait_seconds(retry_after_seconds: float | None, attempt: int) -> float:
        """How long to wait before retrying a 429, preferring the server's own timing.

        ``Retry-After`` is parsed by the error mapper as either seconds or an
        HTTP date. When absent, use a bounded linear fallback.
        """
        return retry_after_seconds if retry_after_seconds is not None else 10.0 * attempt

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        return max(deadline - asyncio.get_running_loop().time(), 0.0)

    @staticmethod
    def _request_timeout(policy: LLMCallPolicy, remaining: float) -> httpx.Timeout:
        return httpx.Timeout(
            min(policy.read_timeout_seconds, remaining),
            connect=min(policy.connect_timeout_seconds, remaining),
        )

    @property
    def _retries_post_transient_errors(self) -> bool:
        """Whether retrying an uncertain POST cannot duplicate provider work."""
        return self._retries_post_transient_errors_value

    async def _handle_accepted_response(
        self,
        response: httpx.Response,
        kind: str,
        policy: LLMCallPolicy,
        deadline: float,
    ) -> str:
        """Handle HTTP 202 for providers that document an async result protocol."""
        raise invalid_response_error(self._provider)

    def test_connection(self) -> None:
        """Raise ``LLMError`` if the key/model/base_url don't actually work.

        Uses the bounded budget for this provider/model profile.
        """
        self.complete(
            kind="test",
            system="Reply with the single word: ok",
            prompt="ping",
            max_tokens=self._request_profile.test_max_tokens,
        )

    def close(self) -> None:
        self._runner.run(self._client.aclose())

    def _extract_text(self, data: object) -> str:
        if not isinstance(data, Mapping):
            raise invalid_response_error(self._provider)
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices:
            raise invalid_response_error(self._provider)
        choice = choices[0]
        if not isinstance(choice, Mapping):
            raise invalid_response_error(self._provider)

        finish_reason = choice.get("finish_reason")
        if not isinstance(finish_reason, str):
            raise invalid_response_error(self._provider)
        if finish_reason == "length":
            raise output_limit_error(self._provider)
        if finish_reason in {"content_filter", "refusal"}:
            raise refusal_error(self._provider)
        if finish_reason != "stop":
            raise invalid_response_error(self._provider)

        message = choice.get("message")
        if not isinstance(message, Mapping):
            raise invalid_response_error(self._provider)
        refusal = message.get("refusal")
        if refusal is not None:
            if not isinstance(refusal, str):
                raise invalid_response_error(self._provider)
            raise refusal_error(self._provider)

        self._validate_usage(data)

        text = message.get("content")
        if not isinstance(text, str):
            raise invalid_response_error(self._provider)
        if not text.strip():
            raise empty_response_error(self._provider)
        return text

    def _validate_usage(self, data: Mapping[object, object]) -> None:
        usage = data.get("usage")
        if usage is None and not self._request_profile.requires_usage:
            return
        if not isinstance(usage, Mapping):
            raise invalid_response_error(self._provider)
        for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
            value = usage.get(field)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise invalid_response_error(self._provider)
