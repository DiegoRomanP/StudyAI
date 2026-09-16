"""Unit tests for AnthropicProvider's optional api_key/model override.

Only construction and the pure ``_model_for`` selection logic are exercised —
no network calls are made (the SDK client doesn't validate the key at
construction time).
"""

from types import SimpleNamespace
import asyncio
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import time
import traceback

import anthropic
import httpx
import pytest

from app.core.exceptions import LLMError
from app.llm.anthropic_provider import AnthropicProvider

ORIGINAL_ASYNCIO_SLEEP = asyncio.sleep


def _usage() -> SimpleNamespace:
    return SimpleNamespace(input_tokens=3, output_tokens=1)


def test_server_anthropic_uses_quiz_model_for_merged_session_content(monkeypatch):
    from app.core.config import Settings

    settings = Settings(
        ANTHROPIC_API_KEY="server-key",
        LLM_MODEL_PLAN="plan-model",
        LLM_MODEL_QUIZ="quiz-model",
    )
    monkeypatch.setattr("app.llm.anthropic_provider.get_settings", lambda: settings)
    provider = AnthropicProvider()
    assert provider._model_for("topic_analysis") == "plan-model"
    assert provider._model_for("session_plan") == "plan-model"
    assert provider._model_for("session_content") == "quiz-model"
    assert provider._model_for("content") == "quiz-model"
    assert provider._model_for("quiz") == "quiz-model"


def test_server_anthropic_sends_each_generation_kind_to_its_configured_model(monkeypatch):
    from app.core.config import Settings

    settings = Settings(
        ANTHROPIC_API_KEY="server-key",
        LLM_MODEL_PLAN="plan-model",
        LLM_MODEL_QUIZ="quiz-model",
    )
    monkeypatch.setattr("app.llm.anthropic_provider.get_settings", lambda: settings)

    class Messages:
        def __init__(self) -> None:
            self.models: list[str] = []

        async def create(self, **kwargs):
            self.models.append(kwargs["model"])
            return SimpleNamespace(
                stop_reason="end_turn",
                usage=_usage(),
                content=[SimpleNamespace(type="text", text="ok")],
            )

    provider = AnthropicProvider()
    messages = Messages()
    provider._client = SimpleNamespace(messages=messages)

    for kind in ("topic_analysis", "session_plan", "session_content"):
        assert provider.complete(kind=kind, system="sys", prompt="prompt") == "ok"

    assert messages.models == ["plan-model", "plan-model", "quiz-model"]


def test_explicit_model_override_is_used_for_every_kind():
    provider = AnthropicProvider(api_key="fake-key", model="claude-haiku-4-5")
    assert provider._model_for("topic_analysis") == "claude-haiku-4-5"
    assert provider._model_for("session_plan") == "claude-haiku-4-5"
    assert provider._model_for("session_content") == "claude-haiku-4-5"
    assert provider._model_for("quiz") == "claude-haiku-4-5"


@pytest.mark.parametrize(
    "response",
    [
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=None),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[]),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[SimpleNamespace(type="text")]),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[SimpleNamespace(type="text", text=None)]),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[SimpleNamespace(type="text", text=["not text"])]),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[SimpleNamespace(type="text", text="   ")]),
        SimpleNamespace(stop_reason="end_turn", usage=_usage(), content=[SimpleNamespace(type="thinking", thinking="hidden")]),
    ],
)
def test_malformed_anthropic_content_is_an_invalid_response(response):
    with pytest.raises(LLMError) as exc_info:
        AnthropicProvider._extract_text(response)

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


@pytest.mark.parametrize("stop_reason", ["end_turn", "stop_sequence"])
def test_anthropic_terminal_text_response_is_accepted(stop_reason):
    response = SimpleNamespace(
        stop_reason=stop_reason,
        usage=_usage(),
        content=[SimpleNamespace(type="text", text="respuesta valida")],
    )

    assert AnthropicProvider._extract_text(response) == "respuesta valida"


@pytest.mark.parametrize(
    ("stop_reason", "expected_code"),
    [
        ("max_tokens", "LLM_OUTPUT_LIMIT"),
        ("model_context_window_exceeded", "LLM_OUTPUT_LIMIT"),
        ("refusal", "LLM_REFUSED"),
    ],
)
def test_anthropic_terminal_response_outcomes_are_classified(stop_reason, expected_code):
    response = SimpleNamespace(stop_reason=stop_reason, content=[])

    with pytest.raises(LLMError) as exc_info:
        AnthropicProvider._extract_text(response)

    assert exc_info.value.code == expected_code


@pytest.mark.parametrize("stop_reason", ["tool_use", "pause_turn", "unexpected"])
def test_anthropic_non_terminal_stop_reason_is_invalid(stop_reason):
    response = SimpleNamespace(
        stop_reason=stop_reason,
        usage=_usage(),
        content=[SimpleNamespace(type="text", text="partial")],
    )

    with pytest.raises(LLMError) as exc_info:
        AnthropicProvider._extract_text(response)

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


@pytest.mark.parametrize(
    "usage",
    [None, SimpleNamespace(input_tokens=-1, output_tokens=1), SimpleNamespace(input_tokens=3, output_tokens="1")],
)
def test_anthropic_invalid_usage_is_an_invalid_response(usage):
    response = SimpleNamespace(
        stop_reason="end_turn",
        usage=usage,
        content=[SimpleNamespace(type="text", text="respuesta")],
    )

    with pytest.raises(LLMError) as exc_info:
        AnthropicProvider._extract_text(response)

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


def test_anthropic_connection_test_uses_the_standard_profile_budget(monkeypatch):
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    calls = []
    monkeypatch.setattr(provider, "complete", lambda **kwargs: calls.append(kwargs))

    provider.test_connection()

    assert calls == [
        {
            "kind": "test",
            "system": "Reply with the single word: ok",
            "prompt": "ping",
            "max_tokens": 32,
        }
    ]


def test_anthropic_test_policy_uses_bounded_connect_and_read_timeouts(monkeypatch):
    received_timeouts = []

    class Messages:
        async def create(self, **kwargs):
            received_timeouts.append(kwargs["timeout"])
            return SimpleNamespace(
                stop_reason="end_turn",
                usage=_usage(),
                content=[SimpleNamespace(type="text", text="ok")],
            )

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(messages=Messages())

    provider.test_connection()

    assert received_timeouts[0].connect == 5.0
    assert received_timeouts[0].read == 30.0


def test_anthropic_sdk_failure_does_not_keep_sensitive_exception_context():
    class AuthenticationError(Exception):
        status_code = 401

    class FailingMessages:
        async def create(self, **_kwargs):
            raise AuthenticationError("secret-sdk-response")

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(messages=FailingMessages())

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="test", system="secret-prompt", prompt="secret-prompt")

    error = exc_info.value
    assert error.code == "LLM_AUTHENTICATION_FAILED"
    assert error.__cause__ is None
    assert error.__context__ is None
    assert "secret-sdk-response" not in "".join(traceback.format_exception(error))


def test_anthropic_response_validation_failure_is_an_invalid_response():
    class FailingMessages:
        async def create(self, **_kwargs):
            raise anthropic.APIResponseValidationError(
                httpx.Response(200, request=httpx.Request("POST", "https://api.example.test")),
                body=None,
            )

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(messages=FailingMessages())

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="test", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


def test_anthropic_quota_exhausted_is_not_retried():
    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "credit_balance_too_low"}}

    class FailingMessages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            raise RateLimitError()

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    messages = FailingMessages()
    provider._client = SimpleNamespace(messages=messages)

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="test", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_QUOTA_EXHAUSTED"
    assert messages.calls == 1


def test_anthropic_long_retry_after_does_not_retry_before_test_budget():
    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "rate_limit_error"}}
        response = httpx.Response(429, headers={"retry-after": "120"})

    class FailingMessages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            raise RateLimitError()

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    messages = FailingMessages()
    provider._client = SimpleNamespace(messages=messages)

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="test", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_RATE_LIMITED"
    assert exc_info.value.retry_after_seconds == 120.0
    assert messages.calls == 1


def test_anthropic_temporary_rate_limit_uses_http_date_then_recovers(monkeypatch):
    sleeps = []
    retry_after = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=30), usegmt=True)

    async def record_sleep(seconds):
        sleeps.append(seconds)

    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "rate_limit_error"}}
        response = httpx.Response(429, headers={"retry-after": retry_after})

    class Messages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise RateLimitError()
            return SimpleNamespace(
                stop_reason="end_turn",
                usage=_usage(),
                content=[SimpleNamespace(type="text", text="ok")],
            )

    monkeypatch.setattr("app.llm.anthropic_provider.asyncio.sleep", record_sleep)
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    messages = Messages()
    provider._client = SimpleNamespace(messages=messages)

    assert provider.complete(kind="test", system="sys", prompt="prompt") == "ok"
    assert messages.calls == 2
    assert 0 < sleeps[0] <= 30


def test_anthropic_rate_limit_without_retry_after_uses_fallback(monkeypatch):
    sleeps = []

    async def record_sleep(seconds):
        sleeps.append(seconds)

    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "rate_limit_error"}}

    class Messages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise RateLimitError()
            return SimpleNamespace(
                stop_reason="end_turn",
                usage=_usage(),
                content=[SimpleNamespace(type="text", text="ok")],
            )

    monkeypatch.setattr("app.llm.anthropic_provider.asyncio.sleep", record_sleep)
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(messages=Messages())

    assert provider.complete(kind="test", system="sys", prompt="prompt") == "ok"
    assert sleeps == [10.0]


def test_anthropic_connection_test_shares_one_retry_across_429_and_5xx(monkeypatch):
    async def no_sleep(_seconds):
        return None

    class RateLimitError(Exception):
        status_code = 429
        body = {"error": {"code": "rate_limit_error"}}

    class ProviderUnavailableError(Exception):
        status_code = 503

    class Messages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise RateLimitError()
            raise ProviderUnavailableError()

    monkeypatch.setattr("app.llm.anthropic_provider.asyncio.sleep", no_sleep)
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    messages = Messages()
    provider._client = SimpleNamespace(messages=messages)

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="test", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_PROVIDER_UNAVAILABLE"
    assert messages.calls == 2


def test_anthropic_transient_timeout_recovers_once(monkeypatch):
    async def no_sleep(_seconds):
        return None

    class APITimeoutError(Exception):
        pass

    class Messages:
        calls = 0

        async def create(self, **_kwargs):
            self.calls += 1
            if self.calls == 1:
                raise APITimeoutError()
            return SimpleNamespace(
                stop_reason="end_turn",
                usage=_usage(),
                content=[SimpleNamespace(type="text", text="ok")],
            )

    monkeypatch.setattr("app.llm.anthropic_provider.asyncio.sleep", no_sleep)
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    messages = Messages()
    provider._client = SimpleNamespace(messages=messages)

    assert provider.complete(kind="test", system="sys", prompt="prompt") == "ok"
    assert messages.calls == 2


def test_anthropic_late_connection_failure_returns_timeout_within_budget():
    class Messages:
        async def create(self, **_kwargs):
            await ORIGINAL_ASYNCIO_SLEEP(0.05)
            raise ConnectionError("late")

    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")
    provider._client = SimpleNamespace(messages=Messages())
    provider._generation_policy = provider._generation_policy.__class__(
        connect_timeout_seconds=0.01,
        read_timeout_seconds=0.01,
        total_budget_seconds=0.01,
        max_attempts=1,
        max_rate_limit_retries=0,
    )
    started = time.monotonic()

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_TIMEOUT"
    assert time.monotonic() - started < 0.04


def test_anthropic_exposes_separate_generation_and_test_policies():
    provider = AnthropicProvider(api_key="test-key", model="claude-haiku-4-5")

    assert provider._generation_policy.total_budget_seconds == 600.0
    assert provider._test_policy.total_budget_seconds == 45.0
