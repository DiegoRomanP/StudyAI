"""Native Google Gemini REST provider using GenerateContent."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from urllib.parse import quote

import httpx

from app.core.config import LLMCallPolicy, get_settings
from app.core.exceptions import LLMError, ValidationError
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

_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_RETRYABLE_STATUS_CODES = {500, 502, 503, 504}
_GOOGLE_ERROR_INFO_TYPE = "type.googleapis.com/google.rpc.ErrorInfo"
_AUTHENTICATION_FAILURE_MESSAGE = (
    "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave."
)
_REFUSAL_FINISH_REASONS = frozenset(
    {"SAFETY", "RECITATION", "LANGUAGE", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}
)
_GEMINI_MODEL_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


def validate_gemini_model_id(model: str) -> None:
    """Reject model resource segments that could escape the fixed API path."""
    segments = model.split("/")
    if len(model) > 128 or any(
        segment in {"", ".", ".."} or not _GEMINI_MODEL_SEGMENT.fullmatch(segment)
        for segment in segments
    ):
        raise ValidationError("El identificador del modelo Gemini no es válido.")


def _generate_content_path(model: str) -> str:
    validate_gemini_model_id(model)
    encoded_segments = "/".join(quote(segment, safe="-._~") for segment in model.split("/"))
    return f"/models/{encoded_segments}:generateContent"


class GeminiProvider(LLMProvider):
    """Synchronous LLM interface backed by Gemini's native JSON REST API."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        request_profile: RequestProfile,
        generation_policy: LLMCallPolicy | None = None,
        test_policy: LLMCallPolicy | None = None,
    ) -> None:
        settings = get_settings()
        self._provider = "GEMINI"
        self._model = model
        self._request_profile = request_profile
        self._generation_policy = generation_policy or settings.external_generation_policy
        self._test_policy = test_policy or settings.external_test_policy
        self._endpoint_path = _generate_content_path(model)
        self._client = httpx.AsyncClient(
            base_url=_GEMINI_API_BASE_URL,
            headers={"x-goog-api-key": api_key},
            timeout=None,
            # The key is sent only to Google's fixed host; never forward it via a redirect.
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
        max_tokens: int = 4096,
    ) -> str:
        payload = self._build_payload(kind, system, prompt, max_tokens)
        return self._runner.run(self._complete_async(kind, payload))

    def _build_payload(self, kind: str, system: str, prompt: str, max_tokens: int) -> dict:
        profile_parameters = self._request_profile.payload_parameters(kind, max_tokens)
        generation_config: dict[str, object] = {
            "maxOutputTokens": profile_parameters.pop("maxOutputTokens")
        }
        if profile_parameters.pop("response_format", None) is not None:
            generation_config["responseMimeType"] = "application/json"
        generation_config.update(profile_parameters)  # fixed profile fields such as thinkingConfig

        payload: dict[str, object] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        return payload

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
                    try:
                        response = await self._client.post(
                            self._endpoint_path,
                            json=payload,
                            timeout=self._request_timeout(policy, remaining),
                        )
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        if response.status_code != httpx.codes.OK:
                            response.raise_for_status()
                            # GenerateContent is synchronous; an unexpected 202 or
                            # redirect is not a completed model response to replay.
                            raise invalid_response_error(self._provider)
                        data = await asyncio.to_thread(response.json)
                        text = await asyncio.to_thread(self._extract_text, data)
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        return text
                    except httpx.HTTPStatusError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        mapped_error = await asyncio.to_thread(
                            self._map_http_error, exc.response
                        )
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        status_code = exc.response.status_code
                        if (
                            mapped_error.code == "LLM_RATE_LIMITED"
                            and rate_limit_attempt < policy.max_rate_limit_retries
                            and (
                                not is_connection_test
                                or transient_retry_attempt < policy.max_attempts - 1
                            )
                        ):
                            wait = self._rate_limit_wait_seconds(
                                mapped_error.retry_after_seconds, rate_limit_attempt + 1
                            )
                            if wait < self._remaining_seconds(deadline):
                                rate_limit_attempt += 1
                                transient_retry_attempt += 1
                                logger.warning(
                                    "LLM call provider=%s model=%s operation=%s status=%d "
                                    "code=%s attempt=%d/%d; retrying in %.1fs",
                                    self._provider,
                                    safe_model_identifier(self._model),
                                    kind,
                                    status_code,
                                    mapped_error.code,
                                    rate_limit_attempt,
                                    policy.max_rate_limit_retries,
                                    wait,
                                )
                                await asyncio.sleep(wait)
                                continue
                        if (
                            mapped_error.retryable
                            and status_code in _RETRYABLE_STATUS_CODES
                            and attempt < policy.max_attempts - 1
                            and (
                                not is_connection_test
                                or transient_retry_attempt < policy.max_attempts - 1
                            )
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning(
                                    "LLM call provider=%s model=%s operation=%s status=%d "
                                    "code=%s attempt=%d/%d; retrying in %ss",
                                    self._provider,
                                    safe_model_identifier(self._model),
                                    kind,
                                    status_code,
                                    mapped_error.code,
                                    attempt + 1,
                                    policy.max_attempts,
                                    backoff,
                                )
                                await asyncio.sleep(backoff)
                                continue
                        terminal_error = mapped_error
                    except httpx.HTTPError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider)
                        mapped_error = map_transport_error(self._provider, exc)
                        if (
                            mapped_error.retryable
                            and attempt < policy.max_attempts - 1
                            and (
                                not is_connection_test
                                or transient_retry_attempt < policy.max_attempts - 1
                            )
                        ):
                            backoff = 2 ** (attempt + 1)
                            if backoff < self._remaining_seconds(deadline):
                                attempt += 1
                                transient_retry_attempt += 1
                                logger.warning(
                                    "LLM call provider=%s model=%s operation=%s code=%s "
                                    "attempt=%d/%d; retrying in %ss",
                                    self._provider,
                                    safe_model_identifier(self._model),
                                    kind,
                                    mapped_error.code,
                                    attempt + 1,
                                    policy.max_attempts,
                                    backoff,
                                )
                                await asyncio.sleep(backoff)
                                continue
                        terminal_error = mapped_error
                    except LLMError as exc:
                        if self._remaining_seconds(deadline) <= 0:
                            raise timeout_error(self._provider) from None
                        raise exc
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

    def _map_http_error(self, response: httpx.Response) -> LLMError:
        if response.status_code == 400 and self._has_invalid_api_key_reason(response):
            return LLMError(
                _AUTHENTICATION_FAILURE_MESSAGE,
                code="LLM_AUTHENTICATION_FAILED",
                provider=self._provider,
                upstream_status=400,
            )
        return map_http_error(self._provider, response)

    @staticmethod
    def _has_invalid_api_key_reason(response: httpx.Response) -> bool:
        try:
            data = response.json()
        except (ValueError, TypeError):
            return False
        if not isinstance(data, Mapping):
            return False
        error = data.get("error")
        if not isinstance(error, Mapping):
            return False
        details = error.get("details")
        if not isinstance(details, list):
            return False
        return any(
            isinstance(detail, Mapping)
            and detail.get("@type") == _GOOGLE_ERROR_INFO_TYPE
            and detail.get("reason") == "API_KEY_INVALID"
            for detail in details
        )

    def _extract_text(self, data: object) -> str:
        if not isinstance(data, Mapping):
            raise invalid_response_error(self._provider)
        candidates = data.get("candidates")
        if not isinstance(candidates, list):
            raise invalid_response_error(self._provider)
        if not candidates:
            prompt_feedback = data.get("promptFeedback")
            block_reason = (
                prompt_feedback.get("blockReason")
                if isinstance(prompt_feedback, Mapping)
                else None
            )
            if isinstance(block_reason, str) and block_reason not in {
                "",
                "BLOCK_REASON_UNSPECIFIED",
            }:
                raise refusal_error(self._provider)
            raise invalid_response_error(self._provider)

        candidate = candidates[0]
        if not isinstance(candidate, Mapping):
            raise invalid_response_error(self._provider)
        finish_reason = candidate.get("finishReason")
        if not isinstance(finish_reason, str):
            raise invalid_response_error(self._provider)
        if finish_reason == "MAX_TOKENS":
            raise output_limit_error(self._provider)
        if finish_reason in _REFUSAL_FINISH_REASONS:
            raise refusal_error(self._provider)
        if finish_reason != "STOP":
            raise invalid_response_error(self._provider)

        content = candidate.get("content")
        if not isinstance(content, Mapping):
            raise invalid_response_error(self._provider)
        parts = content.get("parts")
        if not isinstance(parts, list):
            raise invalid_response_error(self._provider)

        text_parts: list[str] = []
        for part in parts:
            if not isinstance(part, Mapping):
                raise invalid_response_error(self._provider)
            if part.get("thought") is True:
                continue
            text_part = part.get("text")
            if text_part is not None:
                if not isinstance(text_part, str):
                    raise invalid_response_error(self._provider)
                text_parts.append(text_part)

        response_text = "".join(text_parts)
        if not response_text.strip():
            raise empty_response_error(self._provider)
        return response_text

    def test_connection(self) -> None:
        self.complete(
            kind="test",
            system="Reply with the single word: ok",
            prompt="ping",
            max_tokens=self._request_profile.test_max_tokens,
        )

    def close(self) -> None:
        self._runner.run(self._client.aclose())

    @staticmethod
    def _rate_limit_wait_seconds(retry_after_seconds: float | None, attempt: int) -> float:
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
