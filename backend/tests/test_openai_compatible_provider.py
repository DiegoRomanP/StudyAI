"""Tests for the generic OpenAI-compatible adapter.

The outbound HTTP call is mocked with respx: no real network access, no API
cost, fully deterministic.
"""

import httpx
import asyncio
import json
import pytest
import respx
import time
import traceback

from app.core.exceptions import LLMError
from app.core.config import LLMCallPolicy
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.providers.ollama import OLLAMA_CHAT_PROFILE
from app.llm.providers.openai import definition as openai_definition
from app.llm.providers.deepseek import definition as deepseek_definition
from app.llm.request_profiles import STANDARD_CHAT_PROFILE

BASE_URL = "https://api.example.com/v1"
ORIGINAL_ASYNCIO_SLEEP = asyncio.sleep


def _successful_response(content: str) -> dict:
    return {
        "choices": [{"finish_reason": "stop", "message": {"content": content}}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
    }


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    # Retry backoff would otherwise add real seconds of delay to these tests.
    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", no_sleep)


def _provider(max_retries: int = 3) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        max_retries=max_retries,
    )


def _policy(*, total_budget: float = 45.0, max_attempts: int = 2, max_rate_limit_retries: int = 1) -> LLMCallPolicy:
    return LLMCallPolicy(
        connect_timeout_seconds=5.0,
        read_timeout_seconds=30.0,
        total_budget_seconds=total_budget,
        max_attempts=max_attempts,
        max_rate_limit_retries=max_rate_limit_retries,
    )


@respx.mock
def test_complete_returns_message_content():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_successful_response("hola"))
    )
    assert _provider().complete(kind="quiz", system="sys", prompt="prompt") == "hola"


@respx.mock
def test_sends_bearer_auth_header_and_requested_model():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_successful_response("ok"))
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer test-key"
    assert json.loads(request.content)["model"] == "test-model"


@respx.mock
def test_openai_o_series_uses_max_completion_tokens_only():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_successful_response("ok"))
    )
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="o4-mini",
        request_profile=openai_definition.request_profile("o4-mini"),
    )

    provider.complete(kind="quiz", system="sys", prompt="prompt", max_tokens=128)
    provider.test_connection()

    payload = json.loads(route.calls[0].request.content)
    assert payload["max_completion_tokens"] == 128
    assert "max_tokens" not in payload
    test_payload = json.loads(route.calls[1].request.content)
    assert test_payload["max_completion_tokens"] == 256
    assert "max_tokens" not in test_payload


@respx.mock
def test_deepseek_disables_thinking_on_every_request():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=_successful_response("ok"))
    )
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="deepseek-flash",
        provider="DEEPSEEK",
        request_profile=deepseek_definition.request_profile("deepseek-flash"),
    )

    provider.complete(kind="quiz", system="sys", prompt="prompt", max_tokens=128)
    provider.test_connection()

    payload = json.loads(route.calls[0].request.content)
    assert payload["max_tokens"] == 128
    assert payload["thinking"] == {"type": "disabled"}
    assert "max_completion_tokens" not in payload
    test_payload = json.loads(route.calls[1].request.content)
    assert test_payload["max_tokens"] == 32
    assert test_payload["thinking"] == {"type": "disabled"}


def test_standard_profile_sends_no_vendor_extras():
    assert STANDARD_CHAT_PROFILE.payload_parameters("quiz", 64) == {"max_tokens": 64}


@pytest.mark.parametrize("model", ["my-gateway-model", "o4-custom-deployment"])
def test_unknown_openai_model_uses_the_conservative_standard_profile(model):
    profile = openai_definition.request_profile(model)

    assert profile.token_limit_parameter == "max_tokens"


@respx.mock
def test_omits_authentication_and_requests_json_for_local_provider():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": "{}"}}]
            },
        )
    )
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key=None,
        model="local-model",
        request_profile=OLLAMA_CHAT_PROFILE,
        requires_request_pacing=False,
    )
    provider.complete(kind="topic_analysis", system="sys", prompt="prompt")

    request = route.calls.last.request
    assert "Authorization" not in request.headers
    payload = json.loads(request.content)
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["max_tokens"] == 4096
    assert "max_completion_tokens" not in payload
    assert set(payload) == {"model", "messages", "response_format", "max_tokens"}


@respx.mock
def test_zero_rate_limit_retries_fails_on_first_429():
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key=None,
        model="local-model",
        request_profile=STANDARD_CHAT_PROFILE,
        max_rate_limit_retries=0,
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(return_value=httpx.Response(429))
    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")
    assert exc_info.value.code == "LLM_RATE_LIMITED"
    assert route.call_count == 1


@respx.mock
def test_retries_on_429_then_succeeds():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, json={"error": "rate limited"}),
            httpx.Response(200, json=_successful_response("ok now")),
        ]
    )
    assert _provider().complete(kind="quiz", system="sys", prompt="prompt") == "ok now"
    assert route.call_count == 2


@respx.mock
def test_quota_exhausted_429_is_not_retried():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": {"code": "insufficient_quota"}})
    )

    with pytest.raises(LLMError) as exc_info:
        _provider().complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_QUOTA_EXHAUSTED"
    assert route.call_count == 1


@respx.mock
def test_429_waits_the_exact_retry_after_header_value(monkeypatch):
    sleeps: list[float] = []
    async def record_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", record_sleep)
    respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "3"}, json={"error": "rate limited"}),
            httpx.Response(200, json=_successful_response("ok now")),
        ]
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")
    assert sleeps == [3.0]


@respx.mock
def test_long_retry_after_does_not_retry_before_the_operation_budget(monkeypatch):
    sleeps: list[float] = []
    async def record_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", record_sleep)
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=45.0),
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(429, headers={"retry-after": "120"})
    )

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_RATE_LIMITED"
    assert exc_info.value.retry_after_seconds == 120.0
    assert route.call_count == 1
    assert sleeps == []


def test_test_policy_bounds_connect_read_and_total_timeouts(monkeypatch):
    received_timeouts: list[httpx.Timeout] = []

    class Client:
        async def post(self, _url, **kwargs):
            received_timeouts.append(kwargs["timeout"])
            return httpx.Response(
                200,
                json=_successful_response("ok"),
                request=httpx.Request("POST", f"{BASE_URL}/chat/completions"),
            )

    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        test_policy=_policy(),
    )
    provider._client = Client()

    provider.test_connection()

    assert received_timeouts[0].connect == 5.0
    assert received_timeouts[0].read == 30.0


@respx.mock
def test_retry_backoff_does_not_exceed_the_total_budget(monkeypatch):
    sleeps: list[float] = []
    async def record_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", record_sleep)
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=2.0),
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(return_value=httpx.Response(500))

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_PROVIDER_UNAVAILABLE"
    assert route.call_count == 1
    assert sleeps == []


@respx.mock
def test_connection_test_shares_one_retry_budget_across_429_and_5xx():
    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        test_policy=_policy(),
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(500),
            httpx.Response(200, json=_successful_response("must not be reached")),
        ]
    )

    with pytest.raises(LLMError) as exc_info:
        provider.test_connection()

    assert exc_info.value.code == "LLM_PROVIDER_UNAVAILABLE"
    assert route.call_count == 2


def test_response_parsing_cannot_exceed_the_total_budget(monkeypatch):
    class Response:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            time.sleep(0.05)
            return _successful_response("ok")

    class Client:
        async def post(self, _url, **_kwargs):
            return Response()

    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=0.01),
    )
    provider._client = Client()

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_TIMEOUT"


@pytest.mark.parametrize("outcome", ["status", "connection"])
def test_late_failures_return_timeout_without_exceeding_the_budget(outcome):
    class Client:
        async def post(self, _url, **_kwargs):
            await ORIGINAL_ASYNCIO_SLEEP(0.05)
            if outcome == "status":
                return httpx.Response(
                    503,
                    request=httpx.Request("POST", f"{BASE_URL}/chat/completions"),
                )
            raise httpx.ConnectError("late failure")

    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=0.01),
    )
    provider._client = Client()
    started = time.monotonic()

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_TIMEOUT"
    assert time.monotonic() - started < 0.04


def test_accumulated_transport_phases_cannot_outlast_the_total_budget():
    class Client:
        async def post(self, _url, **_kwargs):
            for _ in range(3):
                await ORIGINAL_ASYNCIO_SLEEP(0.005)
            return httpx.Response(
                200,
                json=_successful_response("late"),
                request=httpx.Request("POST", f"{BASE_URL}/chat/completions"),
            )

    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=0.01),
    )
    provider._client = Client()
    started = time.monotonic()

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_TIMEOUT"
    assert time.monotonic() - started < 0.04


def test_late_error_body_parsing_returns_timeout_within_budget():
    class Response:
        status_code = 429
        headers = {}

        def raise_for_status(self):
            raise httpx.HTTPStatusError(
                "late rate limit",
                request=httpx.Request("POST", f"{BASE_URL}/chat/completions"),
                response=self,
            )

        def json(self):
            time.sleep(0.05)
            return {"error": {"code": "rate_limit_error"}}

    class Client:
        async def post(self, _url, **_kwargs):
            return Response()

    provider = OpenAICompatibleProvider(
        base_url=BASE_URL,
        api_key="test-key",
        model="test-model",
        request_profile=STANDARD_CHAT_PROFILE,
        generation_policy=_policy(total_budget=0.01),
    )
    provider._client = Client()
    started = time.monotonic()

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_TIMEOUT"
    assert time.monotonic() - started < 0.04


@respx.mock
def test_429_without_retry_after_header_uses_fixed_fallback_wait(monkeypatch):
    sleeps: list[float] = []
    async def record_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", record_sleep)
    respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, json={"error": "rate limited"}),
            httpx.Response(200, json=_successful_response("ok now")),
        ]
    )
    _provider().complete(kind="quiz", system="sys", prompt="prompt")
    assert sleeps == [10.0]


@pytest.mark.parametrize("retry_after", ["NaN", "Infinity"])
@respx.mock
def test_non_finite_retry_after_uses_a_safe_fallback_wait(monkeypatch, retry_after):
    sleeps: list[float] = []
    async def record_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr("app.llm.openai_compatible_provider.asyncio.sleep", record_sleep)
    respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": retry_after}),
            httpx.Response(200, json=_successful_response("ok now")),
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
        request_profile=STANDARD_CHAT_PROFILE,
        max_retries=1,
        max_rate_limit_retries=2,
    )
    route = respx.post(f"{BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(429),
            httpx.Response(200, json=_successful_response("ok")),
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
        request_profile=STANDARD_CHAT_PROFILE,
        max_rate_limit_retries=1,
    )
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(429, json={"error": "still limited"})
    )
    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")
    assert exc_info.value.code == "LLM_RATE_LIMITED"


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
    with pytest.raises(LLMError) as exc_info:
        _provider().complete(kind="quiz", system="sys", prompt="prompt")
    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


@pytest.mark.parametrize(
    ("response_body", "expected_code"),
    [
        ({"choices": [{"finish_reason": "stop", "message": {"content": None}}], "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4}}, "LLM_INVALID_RESPONSE"),
        ({"choices": [{"finish_reason": "stop", "message": {"content": ["not text"]}}], "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4}}, "LLM_INVALID_RESPONSE"),
        (
            {
                "choices": [
                    {"finish_reason": "length", "message": {"content": "partial"}}
                ]
            },
            "LLM_OUTPUT_LIMIT",
        ),
        (
            {
                "choices": [
                    {"finish_reason": "content_filter", "message": {"content": None}}
                ]
            },
            "LLM_REFUSED",
        ),
        (
            {
                "choices": [
                    {"finish_reason": "refusal", "message": {"content": None}}
                ]
            },
            "LLM_REFUSED",
        ),
        (
            {"choices": [{"message": {"content": "text"}}]},
            "LLM_INVALID_RESPONSE",
        ),
        (
            {
                "choices": [
                    {"finish_reason": None, "message": {"content": "text"}}
                ]
            },
            "LLM_INVALID_RESPONSE",
        ),
        (
            {"choices": [{"finish_reason": "tool_calls", "message": {"content": "text"}}]},
            "LLM_INVALID_RESPONSE",
        ),
        (
            {"choices": [{"finish_reason": "unknown", "message": {"content": "text"}}]},
            "LLM_INVALID_RESPONSE",
        ),
        (
            {"choices": [{"finish_reason": "stop", "message": {"content": "text"}}]},
            "LLM_INVALID_RESPONSE",
        ),
        (
            {
                "choices": [
                    {"finish_reason": "stop", "message": {"content": "text"}}
                ],
                "usage": {"prompt_tokens": 3, "completion_tokens": True, "total_tokens": 4},
            },
            "LLM_INVALID_RESPONSE",
        ),
        (
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": None, "refusal": "cannot comply"},
                    }
                ]
            },
            "LLM_REFUSED",
        ),
    ],
)
@respx.mock
def test_200_response_outcomes_are_classified(response_body, expected_code):
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, json=response_body)
    )

    with pytest.raises(LLMError) as exc_info:
        _provider().complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == expected_code


@respx.mock
def test_200_with_invalid_json_is_an_invalid_response():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(200, content=b"not json")
    )

    with pytest.raises(LLMError) as exc_info:
        _provider().complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


@respx.mock
def test_usage_at_the_requested_limit_does_not_imply_truncation():
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": "complete"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7},
            },
        )
    )

    assert _provider().complete(kind="quiz", system="sys", prompt="prompt", max_tokens=4) == "complete"


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
        return_value=httpx.Response(200, json=_successful_response("ok"))
    )
    _provider().test_connection()  # must not raise


@respx.mock
def test_safe_http_error_does_not_keep_request_or_body_in_exception_chain():
    secret = "secret-key-and-prompt"
    respx.post(f"{BASE_URL}/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": {"message": secret}})
    )

    with pytest.raises(LLMError) as exc_info:
        _provider().complete(kind="quiz", system=secret, prompt=secret)

    error = exc_info.value
    rendered = "".join(traceback.format_exception(error))
    assert error.__cause__ is None
    assert error.__context__ is None
    assert secret not in rendered


@respx.mock
def test_501_is_not_retried_when_mapper_marks_it_non_retryable():
    route = respx.post(f"{BASE_URL}/chat/completions").mock(return_value=httpx.Response(501))

    with pytest.raises(LLMError) as exc_info:
        _provider(max_retries=3).complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.retryable is False
    assert route.call_count == 1
