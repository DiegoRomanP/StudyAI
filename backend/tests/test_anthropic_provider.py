"""Unit tests for AnthropicProvider's optional api_key/model override.

Only construction and the pure ``_model_for`` selection logic are exercised —
no network calls are made (the SDK client doesn't validate the key at
construction time).
"""

from types import SimpleNamespace
import traceback

import pytest

from app.core.exceptions import LLMError
from app.llm.anthropic_provider import AnthropicProvider


def test_default_construction_keeps_legacy_plan_quiz_split():
    provider = AnthropicProvider()
    assert provider._model_for("topic_analysis") != provider._model_for("quiz")
    assert provider._model_for("content") == provider._model_for("quiz")


def test_explicit_model_override_is_used_for_every_kind():
    provider = AnthropicProvider(api_key="fake-key", model="claude-haiku-4-5")
    assert provider._model_for("topic_analysis") == "claude-haiku-4-5"
    assert provider._model_for("session_plan") == "claude-haiku-4-5"
    assert provider._model_for("quiz") == "claude-haiku-4-5"


@pytest.mark.parametrize(
    "response",
    [
        SimpleNamespace(content=None),
        SimpleNamespace(content=[SimpleNamespace(type="text")]),
        SimpleNamespace(content=[SimpleNamespace(type="text", text=None)]),
        SimpleNamespace(content=[SimpleNamespace(type="text", text=["not text"])]),
    ],
)
def test_malformed_anthropic_content_is_an_invalid_response(response):
    with pytest.raises(LLMError) as exc_info:
        AnthropicProvider._extract_text(response)

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"


def test_anthropic_sdk_failure_does_not_keep_sensitive_exception_context():
    class AuthenticationError(Exception):
        status_code = 401

    class FailingMessages:
        def create(self, **_kwargs):
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
