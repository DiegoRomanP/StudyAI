"""Tests for OpenAICompatibleProvider — the shared adapter behind OpenAI, GLM,
OpenRouter and NVIDIA NIM. The outbound HTTP call is mocked with respx: no
real network access, no API cost, fully deterministic.
"""

import httpx
import pytest
import respx

from app.core.exceptions import LLMError
from app.llm.openai_compatible_provider import OpenAICompatibleProvider

BASE_URL = "https://api.example.com/v1"


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    # Retry backoff would otherwise add real seconds of delay to these tests.
    monkeypatch.setattr("app.llm.openai_compatible_provider.time.sleep", lambda _: None)


def _provider(max_retries: int = 3) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url=BASE_URL, api_key="test-key", model="test-model", max_retries=max_retries
    )


@respx.mock
def test_complete_returns_message_content():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "hola"}}]})
    )
    assert _provider().complete(kind="quiz", system="sys", prompt="prompt") == "hola"


@respx.mock
def test_sends_bearer_auth_header_and_requested_model():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer test-key"
    import json as _json

    assert _json.loads(request.content)["model"] == "test-model"


@respx.mock
def test_omits_authentication_and_requests_json_for_local_provider():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
    )
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key=None,
        model="local-model",
        json_response_kinds=frozenset({"topic_analysis"}),
        requires_request_pacing=False,
        disable_reasoning=True,
    )
    provider.complete(kind="topic_analysis", system="sys", prompt="prompt")

    request = route.calls.last.request
    assert "Authorization" not in request.headers
    import json as _json

    assert _json.loads(request.content)["response_format"] == {"type": "json_object"}
    assert _json.loads(request.content)["reasoning_effort"] == "none"


@respx.mock
def test_zero_rate_limit_retries_fails_on_first_429():
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL, api_key=None, model="local-model", max_rate_limit_retries=0
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(return_value=httpx.Response(429))
    with pytest.raises(LLMError, match="429"):
        provider.complete(kind="quiz", system="sys", prompt="prompt")
    assert route.call_count == 1


@respx.mock
def test_retries_on_429_then_succeeds():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, json={"error": "rate limited"}),
            httpx.Response(200, json={"choices": [{"message": {"content": "ok now"}}]}),
        ]
    )
    assert _provider().complete(kind="quiz", system="sys", prompt="prompt") == "ok now"
    assert route.call_count == 2


@respx.mock
def test_429_waits_the_exact_retry_after_header_value(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("app.llm.openai_compatible_provider.time.sleep", sleeps.append)
    respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "3"}, json={"error": "rate limited"}),
            httpx.Response(200, json={"choices": [{"message": {"content": "ok now"}}]}),
        ]
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")
    assert sleeps == [3.0]


@respx.mock
def test_429_without_retry_after_header_uses_fixed_fallback_wait(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("app.llm.openai_compatible_provider.time.sleep", sleeps.append)
    respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, json={"error": "rate limited"}),
            httpx.Response(200, json={"choices": [{"message": {"content": "ok now"}}]}),
        ]
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")
    assert sleeps == [10.0]


@respx.mock
def test_429_has_its_own_retry_budget_separate_from_generic_max_retries():
    # max_retries=1 alone would forbid any retry at all — but 429s draw from
    # their own, larger budget precisely so a rate-limited free-tier model
    # doesn't fail a whole plan generation after a single 429.
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        max_retries=1,
        max_rate_limit_retries=2,
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(429),
            httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]}),
        ]
    )
    assert provider.complete(kind="quiz", system="sys", prompt="prompt") == "ok"
    assert route.call_count == 3


@respx.mock
def test_429_exhausts_its_dedicated_retry_budget_and_raises():
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        max_rate_limit_retries=1,
    )
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": "still limited"})
    )
    with pytest.raises(LLMError, match="429"):
        provider.complete(kind="quiz", system="sys", prompt="prompt")


@respx.mock
def test_exhausts_retries_and_raises_llm_error():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(500, json={"error": "boom"})
    )
    with pytest.raises(LLMError):
        _provider(max_retries=2).complete(kind="quiz", system="sys", prompt="prompt")


@respx.mock
def test_non_retryable_status_fails_immediately():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": "bad key"})
    )
    with pytest.raises(LLMError):
        _provider(max_retries=3).complete(kind="quiz", system="sys", prompt="prompt")
    assert route.call_count == 1


@respx.mock
def test_empty_content_raises_llm_error():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "   "}}]})
    )
    with pytest.raises(LLMError):
        _provider().complete(kind="quiz", system="sys", prompt="prompt")


@respx.mock
def test_test_connection_raises_on_failure():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(500, json={"error": "down"})
    )
    with pytest.raises(LLMError):
        _provider(max_retries=1).test_connection()


@respx.mock
def test_test_connection_succeeds_silently():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})
    )
    _provider().test_connection()  # must not raise
