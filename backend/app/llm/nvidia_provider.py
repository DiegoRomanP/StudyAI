"""Dedicated NVIDIA hosted NIM adapter.

NVIDIA's catalog includes APIs that are not general text generators. This
provider is intentionally constructed only from a curated ``NvidiaModelSpec``
and uses immutable official endpoints rather than user-supplied URLs.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping
from uuid import UUID

import httpx

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.llm.base import LLMProvider
from app.llm.error_mapping import invalid_response_error, map_http_error, map_transport_error, timeout_error
from app.llm.nvidia_models import (
    NVIDIA_NIM_BASE_URL,
    NVIDIA_NVCF_STATUS_URL,
    NvidiaMessageMode,
    NvidiaModelSpec,
)
from app.llm.openai_compatible_provider import OpenAICompatibleProvider

_MAX_NVCF_STATUS_POLLS = 12
_NVCF_POLL_INTERVAL_SECONDS = 1.0


class NvidiaNimProvider(LLMProvider):
    """NVIDIA contract composed over the shared chat-completions transport."""

    def __init__(
        self,
        *,
        api_key: str,
        model_spec: NvidiaModelSpec,
        generation_policy: LLMCallPolicy,
        test_policy: LLMCallPolicy,
    ) -> None:
        self._model_spec = model_spec
        self._delegate = OpenAICompatibleProvider(
            base_url=NVIDIA_NIM_BASE_URL,
            api_key=api_key,
            model=model_spec.model_id,
            request_profile=model_spec.request_profile,
            generation_policy=generation_policy,
            test_policy=test_policy,
            provider="NVIDIA",
            payload_builder=self._build_payload,
            accepted_response_handler=self._handle_accepted_response,
            retries_post_transient_errors=False,
        )

    @property
    def _model(self) -> str:
        return self._delegate._model

    @property
    def _client(self) -> httpx.AsyncClient:
        return self._delegate._client

    @property
    def _request_profile(self):
        return self._delegate._request_profile

    @property
    def _generation_policy(self) -> LLMCallPolicy:
        return self._delegate._generation_policy

    @property
    def _test_policy(self) -> LLMCallPolicy:
        return self._delegate._test_policy

    def complete(
        self,
        *,
        kind: str,
        system: str,
        prompt: str,
        context: dict | None = None,
        max_tokens: int = 4096,
    ) -> str:
        return self._delegate.complete(
            kind=kind, system=system, prompt=prompt, context=context, max_tokens=max_tokens
        )

    def close(self) -> None:
        self._delegate.close()

    def _build_payload(self, kind: str, system: str, prompt: str, max_tokens: int) -> dict:
        output_limit = min(max_tokens, self._model_spec.max_output_tokens)
        messages: list[dict[str, str]]
        if self._model_spec.message_mode == NvidiaMessageMode.SYSTEM_USER:
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ]
        else:
            messages = [{"role": "user", "content": f"{system}\n\n{prompt}"}]
        return {
            "model": self._model_spec.model_id,
            "messages": messages,
            # NVIDIA documents models whose stream default is true. StudyAI only
            # accepts one terminal JSON response, never an SSE stream.
            "stream": False,
            **self._request_profile.payload_parameters(kind, output_limit),
            **dict(self._model_spec.static_parameters),
        }

    def test_connection(self) -> None:
        response = self.complete(
            kind="test",
            system="Return only valid JSON. Do not explain.",
            prompt='Return exactly {"status":"ok"}.',
            max_tokens=self._request_profile.test_max_tokens,
        )
        try:
            result = json.loads(response)
        except (TypeError, ValueError) as exc:
            raise invalid_response_error("NVIDIA") from exc
        if result != {"status": "ok"}:
            raise invalid_response_error("NVIDIA")

    async def _handle_accepted_response(
        self,
        response: httpx.Response,
        kind: str,
        policy: LLMCallPolicy,
        deadline: float,
    ) -> str:
        request_id = _validated_request_id(response.headers.get("NVCF-REQID"))
        polls = 0
        retry_attempt = 0
        while polls < _MAX_NVCF_STATUS_POLLS:
            remaining = self._remaining_seconds(deadline)
            if remaining <= _NVCF_POLL_INTERVAL_SECONDS:
                raise timeout_error("NVIDIA")
            await asyncio.sleep(_NVCF_POLL_INTERVAL_SECONDS)
            try:
                status_response = await self._client.get(
                    NVIDIA_NVCF_STATUS_URL.format(request_id=request_id),
                    timeout=self._request_timeout(policy, self._remaining_seconds(deadline)),
                )
                polls += 1
                if status_response.status_code == httpx.codes.ACCEPTED:
                    continue
                if status_response.status_code == httpx.codes.OK:
                    # The documented NVCF status endpoint normally returns only
                    # progress metadata. If NVIDIA returns a completion body,
                    # accept it; otherwise never issue a second POST to recover it.
                    data = await asyncio.to_thread(status_response.json)
                    if isinstance(data, Mapping) and "choices" in data:
                        return await asyncio.to_thread(self._extract_text, data)
                    raise LLMError(
                        "NVIDIA aceptó la solicitud de forma asíncrona, pero no entregó un resultado utilizable.",
                        code="LLM_ASYNC_RESULT_UNAVAILABLE",
                        provider="NVIDIA",
                        upstream_status=status_response.status_code,
                    )
                status_response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                mapped = await asyncio.to_thread(map_http_error, "NVIDIA", exc.response)
                if not mapped.retryable or retry_attempt >= policy.max_attempts - 1:
                    raise mapped
                wait = (
                    self._rate_limit_wait_seconds(mapped.retry_after_seconds, retry_attempt + 1)
                    if mapped.code == "LLM_RATE_LIMITED"
                    else 2 ** (retry_attempt + 1)
                )
                if wait >= self._remaining_seconds(deadline):
                    raise mapped
                retry_attempt += 1
                await asyncio.sleep(wait)
            except httpx.HTTPError as exc:
                mapped = map_transport_error("NVIDIA", exc)
                if retry_attempt >= policy.max_attempts - 1:
                    raise mapped
                wait = 2 ** (retry_attempt + 1)
                if wait >= self._remaining_seconds(deadline):
                    raise mapped
                retry_attempt += 1
                await asyncio.sleep(wait)
        raise timeout_error("NVIDIA")

    @staticmethod
    def _remaining_seconds(deadline: float) -> float:
        return OpenAICompatibleProvider._remaining_seconds(deadline)

    @staticmethod
    def _request_timeout(policy: LLMCallPolicy, remaining: float) -> httpx.Timeout:
        return OpenAICompatibleProvider._request_timeout(policy, remaining)

    def _extract_text(self, data: object) -> str:
        return self._delegate._extract_text(data)


def _validated_request_id(value: str | None) -> str:
    if not isinstance(value, str):
        raise invalid_response_error("NVIDIA")
    try:
        request_id = UUID(value)
    except (TypeError, ValueError, AttributeError) as exc:
        raise invalid_response_error("NVIDIA") from exc
    return str(request_id)
