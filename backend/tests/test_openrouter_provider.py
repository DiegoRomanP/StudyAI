"""OpenRouter-specific HTTP request and response contract tests."""

from __future__ import annotations

import asyncio
import json
import traceback

import httpx
import pytest
import respx

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.request_profiles import STANDARD_CHAT_PROFILE


BASE_URL = "https://openrouter.example/api/v1"


def _policy(*, max_attempts: int = 1) -> LLMCallPolicy:
    return LLMCallPolicy(
        connect_timeout_seconds=5.0,
        read_timeout_seconds=30.0,
        total_budget_seconds=45.0,
        max_attempts=max_attempts,
        max_rate_limit_retries=1,
    )


def _provider(*, max_attempts: int = 1) -> OpenRouterProvider:
    return OpenRouterProvider(
        base_url=BASE_URL,
        api_key="sk-or-test",
        model="openrouter/free",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(max_attempts=max_attempts),
        test_policy=_policy(max_attempts=max_attempts),
    )


def _success(content: str = "ok") -> dict:
    return {
        "choices": [{"finish_reason": "stop", "message": {"content": content}}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
    }


@respx.mock
def test_openrouter_sends_direct_chat_completion_request():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_success("respuesta"))
    )
    provider = _provider()

    try:
        result = provider.complete(
            kind="topic_analysis",
            system="system instruction",
            prompt="user prompt",
            max_tokens=512,
        )
    finally:
        provider.close()

    assert result == "respuesta"
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer sk-or-test"
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == {
        "model": "openrouter/free",
        "messages": [
            {"role": "system", "content": "system instruction"},
            {"role": "user", "content": "user prompt"},
        ],
        "max_tokens": 512,
    }


@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        ({"code": 401, "message": "sensitive"}, "LLM_AUTHENTICATION_FAILED"),
        ({"code": 402, "message": "sensitive"}, "LLM_QUOTA_EXHAUSTED"),
        ({"code": 408, "message": "sensitive"}, "LLM_TIMEOUT"),
        ({"code": 429, "message": "sensitive"}, "LLM_RATE_LIMITED"),
        (
            {
                "code": 502,
                "message": "sensitive",
                "metadata": {"error_type": "provider_unavailable"},
            },
            "LLM_PROVIDER_UNAVAILABLE",
        ),
    ],
)
@respx.mock
def test_openrouter_top_level_errors_are_classified_without_leaking_message(
    error, expected_code
):
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"error": error})
    )
    provider = _provider()

    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="test", system="sys", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == expected_code
    assert exc_info.value.provider == "OPENROUTER"
    assert "sensitive" not in "".join(traceback.format_exception(exc_info.value))


@respx.mock
def test_openrouter_retries_documented_mid_generation_provider_error(monkeypatch):
    sleeps: list[float] = []

    async def record_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", record_sleep)
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "finish_reason": "error",
                            "message": {"role": "assistant", "content": "partial"},
                            "error": {
                                "code": 502,
                                "message": "provider disconnected",
                                "metadata": {"error_type": "provider_unavailable"},
                            },
                        }
                    ]
                },
            ),
            httpx.Response(200, json=_success("recovered")),
        ]
    )
    provider = _provider(max_attempts=2)

    try:
        result = provider.complete(kind="session_content", system="sys", prompt="prompt")
    finally:
        provider.close()

    assert result == "recovered"
    assert route.call_count == 2
    assert sleeps == [2]


@respx.mock
def test_openrouter_finish_reason_error_requires_structured_error():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "error",
                        "message": {"role": "assistant", "content": "partial"},
                    }
                ]
            },
        )
    )
    provider = _provider()

    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="test", system="sys", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"
