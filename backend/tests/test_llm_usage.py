"""Providers report the tokens each response used, so cost can be recorded."""

from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
import respx

from app.core.exceptions import LLMError
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.default_free_provider import FreeTier, FreeTierProvider
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.request_profiles import STANDARD_CHAT_PROFILE
from app.llm.usage import LLMUsage
from app.models.llm_credential import LLMProviderName


def test_anthropic_records_usage_even_on_max_tokens():
    provider = AnthropicProvider(api_key="k", model="m")

    class Messages:
        async def create(self, **_kwargs):
            return SimpleNamespace(
                stop_reason="max_tokens",
                usage=SimpleNamespace(input_tokens=10, output_tokens=20),
                content=[],
            )

    provider._client = SimpleNamespace(messages=Messages())

    with pytest.raises(LLMError) as exc:
        provider.complete(kind="session_content", system="s", prompt="p")

    assert exc.value.code == "LLM_OUTPUT_LIMIT"
    assert provider.drain_usage() == [LLMUsage("ANTHROPIC", "m", 10, 20, 0)]


@respx.mock
def test_openai_compatible_records_prompt_and_completion_tokens():
    respx.post("https://api.example.com/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": "ok"}}],
                "usage": {
                    "prompt_tokens": 7,
                    "completion_tokens": 3,
                    "total_tokens": 10,
                    "prompt_cache_hit_tokens": 2,
                },
            },
        )
    )
    provider = OpenAICompatibleProvider(
        base_url="https://api.example.com/v1",
        api_key="k",
        model="m",
        request_profile=STANDARD_CHAT_PROFILE,
        provider="DEEPSEEK",
    )

    provider.complete(kind="session_content", system="s", prompt="p")

    assert provider.drain_usage() == [LLMUsage("DEEPSEEK", "m", 7, 3, 2)]
    assert provider.drain_usage() == []


def test_usage_log_is_per_instance():
    first, second = MockLLMProvider(), MockLLMProvider()
    first._record_usage(LLMUsage("X", "m", 1, 1))

    assert second.drain_usage() == []
    assert len(first.drain_usage()) == 1


def test_free_tier_drains_delegate_usage():
    inner = MockLLMProvider()
    inner._record_usage(LLMUsage("DEEPSEEK", "m", 5, 6))
    tier = FreeTier(name="t", provider=LLMProviderName.DEEPSEEK, model="m", build=lambda: inner)
    provider = FreeTierProvider([tier])
    provider._built["t"] = inner

    assert provider.drain_usage() == [LLMUsage("DEEPSEEK", "m", 5, 6)]
    assert provider.drain_usage() == []


def test_mock_reports_no_usage():
    assert MockLLMProvider().drain_usage() == []
