"""Contract tests for the dedicated, hosted NVIDIA NIM adapter."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.llm.nvidia_models import (
    NVIDIA_NIM_BASE_URL,
    NVIDIA_NVCF_STATUS_URL,
    get_nvidia_model_spec,
)
from app.llm.nvidia_provider import NvidiaNimProvider


def _policy() -> LLMCallPolicy:
    return LLMCallPolicy(
        connect_timeout_seconds=1.0,
        read_timeout_seconds=1.0,
        total_budget_seconds=10.0,
        max_attempts=2,
        max_rate_limit_retries=1,
    )


def _provider(model: str = "meta/llama-3.3-70b-instruct") -> NvidiaNimProvider:
    spec = get_nvidia_model_spec(model)
    assert spec is not None
    return NvidiaNimProvider(
        api_key="nvapi-test-key",
        model_spec=spec,
        generation_policy=_policy(),
        test_policy=_policy(),
    )


def _completion(content: str) -> dict:
    return {
        "choices": [{"finish_reason": "stop", "message": {"content": content}}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
    }


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.llm.nvidia_provider.asyncio.sleep", no_sleep)


@respx.mock
def test_uses_the_fixed_hosted_endpoint_and_profile_payload():
    provider = _provider("deepseek-ai/deepseek-v4-flash")
    route = respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_completion("ok"))
    )
    try:
        assert provider.complete(kind="quiz", system="system", prompt="prompt", max_tokens=99999) == "ok"
    finally:
        provider.close()

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer nvapi-test-key"
    payload = json.loads(request.content)
    assert payload == {
        "model": "deepseek-ai/deepseek-v4-flash",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "prompt"},
        ],
        "stream": False,
        "max_tokens": 16384,
    }


@respx.mock
def test_connection_requires_the_structured_probe_response():
    provider = _provider()
    route = respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_completion('{"status":"ok"}'))
    )
    try:
        provider.test_connection()
    finally:
        provider.close()

    payload = json.loads(route.calls.last.request.content)
    assert payload["stream"] is False
    assert payload["max_tokens"] == 32


@respx.mock
def test_connection_rejects_an_unstructured_ping_response():
    provider = _provider()
    respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_completion("ok"))
    )
    try:
        with pytest.raises(LLMError, match="respuesta inválida") as exc_info:
            provider.test_connection()
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


@respx.mock
def test_accepted_request_polls_once_without_repeating_the_post():
    provider = _provider()
    post = respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(202, headers={"NVCF-REQID": "11111111-1111-1111-1111-111111111111"})
    )
    poll = respx.get(
        NVIDIA_NVCF_STATUS_URL.format(request_id="11111111-1111-1111-1111-111111111111")
    ).mock(return_value=httpx.Response(200, json=_completion("done")))
    try:
        assert provider.complete(kind="quiz", system="system", prompt="prompt") == "done"
    finally:
        provider.close()

    assert post.call_count == 1
    assert poll.call_count == 1


@respx.mock
def test_completed_async_metadata_never_triggers_a_second_post():
    provider = _provider()
    post = respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(202, headers={"NVCF-REQID": "11111111-1111-1111-1111-111111111111"})
    )
    respx.get(
        NVIDIA_NVCF_STATUS_URL.format(request_id="11111111-1111-1111-1111-111111111111")
    ).mock(return_value=httpx.Response(200, json={"NVCF-STATUS": "COMPLETED"}))
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="quiz", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_ASYNC_RESULT_UNAVAILABLE"
    assert post.call_count == 1


@respx.mock
def test_post_transport_failures_are_not_retried_for_nvidia():
    provider = _provider()
    route = respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(503)
    )
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="quiz", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_PROVIDER_UNAVAILABLE"
    assert route.call_count == 1


@respx.mock
def test_rejects_accepted_responses_without_a_valid_request_id():
    provider = _provider()
    respx.post(f"{NVIDIA_NIM_BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(202, headers={"NVCF-REQID": "not-a-uuid"})
    )
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="quiz", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"
