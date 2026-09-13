"""Provider for any OpenAI-compatible chat-completions API.

OpenAI, GLM (Zhipu), OpenRouter and NVIDIA NIM all expose the same
``POST {base_url}/chat/completions`` shape and differ only in base URL, model
name and API key — so one class serves all four rather than four near-duplicate
provider classes. Written against ``httpx`` directly instead of adding the
``openai`` SDK as a new dependency.

Only status codes and truncated error bodies are ever logged — never the
request payload (which would include the user's document content) and never
the ``Authorization`` header (which holds the API key).
"""

from __future__ import annotations

import time

import httpx

from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.llm.base import LLMProvider

logger = get_logger(__name__)

# 429 is deliberately excluded — it gets its own dedicated retry path below.
_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}
# A 429 from a per-minute rate limit (OpenRouter's free-tier models cap at a
# handful of requests/minute) always clears on its own in well under a
# minute — unlike a 5xx, retrying it is nearly guaranteed to eventually
# succeed, so it gets a larger, separate retry budget instead of sharing the
# few attempts meant for genuine transient errors.
_MAX_RATE_LIMIT_RETRIES = 6
_MAX_RATE_LIMIT_WAIT_SECONDS = 65.0


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        model: str,
        timeout: float = 60.0,
        max_retries: int = 3,
        max_rate_limit_retries: int = _MAX_RATE_LIMIT_RETRIES,
        json_response_kinds: frozenset[str] = frozenset(),
        requires_request_pacing: bool = True,
        disable_reasoning: bool = False,
        test_max_tokens: int = 5,
    ) -> None:
        self._model = model
        self._max_retries = max(1, max_retries)
        self._max_rate_limit_retries = max(0, max_rate_limit_retries)
        self._json_response_kinds = json_response_kinds
        self.requires_request_pacing = requires_request_pacing
        self._disable_reasoning = disable_reasoning
        self._test_max_tokens = test_max_tokens
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout,
            # base_url can be a user-supplied override (SSRF surface, validated
            # in app.core.url_safety) — never follow a redirect to somewhere
            # that wasn't itself validated. This is httpx's default already;
            # kept explicit so it can't silently change under us.
            follow_redirects=False,
        )

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,  # esto se se debe ajustar cuando sea un proveedor externo
    ) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
        }
        if kind in self._json_response_kinds:
            payload["response_format"] = {"type": "json_object"}
        if self._disable_reasoning:
            payload["reasoning_effort"] = "none"
        attempt = 0
        rate_limit_attempt = 0

        while True:
            try:
                response = self._client.post("/chat/completions", json=payload)
                response.raise_for_status()
                return self._extract_text(response.json())
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code
                if (
                    status_code == 429
                    and rate_limit_attempt < self._max_rate_limit_retries
                ):
                    rate_limit_attempt += 1
                    wait = self._rate_limit_wait_seconds(
                        exc.response, rate_limit_attempt
                    )
                    logger.warning(
                        "LLM call (%s) rate-limited (HTTP 429) on attempt %d/%d; retrying in %.1fs",
                        kind,
                        rate_limit_attempt,
                        self._max_rate_limit_retries,
                        wait,
                    )
                    time.sleep(wait)
                    continue
                if (
                    status_code in _RETRYABLE_STATUS_CODES
                    and attempt < self._max_retries - 1
                ):
                    attempt += 1
                    backoff = 2**attempt
                    logger.warning(
                        "LLM call (%s) failed with HTTP %d on attempt %d/%d; retrying in %ss",
                        kind,
                        status_code,
                        attempt,
                        self._max_retries,
                        backoff,
                    )
                    time.sleep(backoff)
                    continue
                raise LLMError(
                    f"LLM call failed (HTTP {status_code}): {exc.response.text[:300]}"
                ) from exc
            except httpx.HTTPError as exc:
                if attempt < self._max_retries - 1:
                    attempt += 1
                    backoff = 2**attempt
                    logger.warning(
                        "LLM call (%s) failed (%s) on attempt %d/%d; retrying in %ss",
                        kind,
                        exc.__class__.__name__,
                        attempt,
                        self._max_retries,
                        backoff,
                    )
                    time.sleep(backoff)
                    continue
                raise LLMError(f"LLM call failed: {exc}") from exc

    @staticmethod
    def _rate_limit_wait_seconds(response: httpx.Response, attempt: int) -> float:
        """How long to wait before retrying a 429, preferring the server's own timing.

        ``Retry-After`` is the standard header for this; when absent, fall
        back to a fixed wait long enough for a typical per-minute RPM window
        to clear rather than the same short exponential backoff used for
        genuine transient errors.
        """
        retry_after = response.headers.get("retry-after")
        if retry_after:
            try:
                return min(max(float(retry_after), 0.5), _MAX_RATE_LIMIT_WAIT_SECONDS)
            except ValueError:
                pass
        return min(10.0 * attempt, _MAX_RATE_LIMIT_WAIT_SECONDS)

    def test_connection(self) -> None:
        """Raise ``LLMError`` if the key/model/base_url don't actually work.

        Deliberately tiny (``max_tokens=5``) so verifying a key costs almost
        nothing.
        """
        self.complete(
            kind="test",
            system="Reply with the single word: ok",
            prompt="ping",
            max_tokens=self._test_max_tokens,
        )

    def close(self) -> None:
        self._client.close()

    @staticmethod
    def _extract_text(data: dict) -> str:
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"Unexpected LLM response shape: {data!r:.300}") from exc
        if not text or not text.strip():
            raise LLMError("LLM returned no text content.")
        return text
