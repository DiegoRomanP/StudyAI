"""Unit tests for AnthropicProvider's optional api_key/model override.

Only construction and the pure ``_model_for`` selection logic are exercised —
no network calls are made (the SDK client doesn't validate the key at
construction time).
"""

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
