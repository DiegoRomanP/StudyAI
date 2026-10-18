"""The server's included free-tier AI: NVIDIA first, Google when NVIDIA cannot answer."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from app.core.config import Settings
from app.core.exceptions import LLMError
from app.llm import default_free_provider as free
from app.llm import factory
from app.llm.base import LLMProvider
from app.llm.default_free_provider import FreeTier, FreeTierProvider, build_free_tiers
from app.models.llm_credential import LLMProviderName


class _Scripted(LLMProvider):
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls = 0
        self.closed = False

    def complete(self, *, kind, system, prompt, context=None, max_tokens=4096):
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome

    def close(self):
        self.closed = True


def _tier(name, provider, outcome):
    scripted = _Scripted(outcome)
    return FreeTier(name=name, provider=provider, model=f"{name}-model", build=lambda: scripted), scripted


@pytest.fixture(autouse=True)
def _clean_cooldowns():
    free.reset_cooldowns()
    yield
    free.reset_cooldowns()


def _call(provider):
    return provider.complete(kind="topic_analysis", system="s", prompt="p")


def test_uses_the_first_tier_while_it_answers():
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, "from nvidia")
    second, second_provider = _tier("gemini", LLMProviderName.GEMINI, "from gemini")

    assert _call(FreeTierProvider([first, second])) == "from nvidia"
    assert second_provider.calls == 0


@pytest.mark.parametrize(
    "code", ["LLM_QUOTA_EXHAUSTED", "LLM_RATE_LIMITED", "LLM_TIMEOUT", "LLM_AUTHENTICATION_FAILED"]
)
def test_hands_over_to_the_next_tier_and_keeps_skipping_the_failed_one(code):
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, LLMError("x", code=code))
    second, second_provider = _tier("gemini", LLMProviderName.GEMINI, "from gemini")
    chain = FreeTierProvider([first, second])

    assert _call(chain) == "from gemini"
    assert _call(chain) == "from gemini"
    assert first_provider.calls == 1  # second call skipped it during the cooldown
    assert second_provider.calls == 2


def test_a_bad_single_response_tries_the_next_tier_without_benching_the_first():
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, LLMError("x", code="LLM_INVALID_RESPONSE"))
    second, _ = _tier("gemini", LLMProviderName.GEMINI, "from gemini")
    chain = FreeTierProvider([first, second])

    assert _call(chain) == "from gemini"
    assert _call(chain) == "from gemini"
    assert first_provider.calls == 2


def test_reports_exhausted_free_use_when_every_tier_is_out():
    first, _ = _tier("nvidia", LLMProviderName.NVIDIA, LLMError("x", code="LLM_QUOTA_EXHAUSTED"))
    second, _ = _tier("gemini", LLMProviderName.GEMINI, LLMError("y", code="LLM_RATE_LIMITED"))
    chain = FreeTierProvider([first, second])

    with pytest.raises(LLMError) as first_failure:
        _call(chain)
    assert first_failure.value.code == "LLM_QUOTA_EXHAUSTED"
    assert "Conectar IA" in str(first_failure.value)
    # Both are cooling down now: it answers right away without touching either provider.
    with pytest.raises(LLMError) as second_failure:
        _call(chain)
    assert second_failure.value.code == "LLM_QUOTA_EXHAUSTED"


def test_surfaces_the_real_error_when_it_is_not_about_quota():
    first, _ = _tier("nvidia", LLMProviderName.NVIDIA, LLMError("x", code="LLM_INVALID_RESPONSE"))
    second, _ = _tier("gemini", LLMProviderName.GEMINI, LLMError("y", code="LLM_REFUSED"))

    with pytest.raises(LLMError) as failure:
        _call(FreeTierProvider([first, second]))
    assert failure.value.code == "LLM_REFUSED"


def test_close_releases_the_providers_that_were_built():
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, "ok")
    chain = FreeTierProvider([first])
    _call(chain)
    chain.close()
    assert first_provider.closed


def test_builds_tiers_in_priority_order_from_the_environment():
    settings = Settings(NVIDIA_API_KEY="nvapi-test", GEMINI_API_KEY="gem-test")
    tiers = build_free_tiers(settings)

    assert [tier.name for tier in tiers] == ["nvidia", "gemini"]
    assert tiers[0].model == "deepseek-ai/deepseek-v4.1-flash"
    assert tiers[1].model == "gemma-4-26b-a4b-it"
    # Construction is lazy-cheap: building the clients performs no network I/O.
    for tier in tiers:
        tier.build().close()


def test_ignores_missing_keys_and_unregistered_nvidia_models():
    assert build_free_tiers(Settings(NVIDIA_API_KEY="", GEMINI_API_KEY="")) == []
    only_gemini = build_free_tiers(Settings(NVIDIA_API_KEY="k", DEFAULT_NVIDIA_MODEL="not/registered", GEMINI_API_KEY="g"))
    assert [tier.name for tier in only_gemini] == ["gemini"]


def _runtime_with(monkeypatch, settings):
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        return client.get("/llm-settings/runtime").json()


def test_runtime_reports_the_included_ai_when_the_server_has_free_keys(monkeypatch):
    runtime = _runtime_with(monkeypatch, Settings(NVIDIA_API_KEY="nvapi-test", GEMINI_API_KEY="gem-test"))

    assert runtime["source"] == "ENV"
    assert runtime["provider"] == "NVIDIA"
    assert runtime["bundled"] is True
    assert runtime["models"]["session_content"] == "deepseek-ai/deepseek-v4.1-flash"
    assert "nvapi" not in str(runtime) and "gem-test" not in str(runtime)


def test_included_ai_starts_with_google_when_only_that_key_exists(monkeypatch):
    runtime = _runtime_with(monkeypatch, Settings(NVIDIA_API_KEY="", GEMINI_API_KEY="gem-test"))
    assert (runtime["provider"], runtime["bundled"]) == ("GEMINI", True)


def test_an_operator_anthropic_key_wins_over_the_included_ai(monkeypatch):
    settings = Settings(ANTHROPIC_API_KEY="anthropic-test", NVIDIA_API_KEY="nvapi-test")
    runtime = _runtime_with(monkeypatch, settings)
    assert (runtime["provider"], runtime["bundled"]) == ("ANTHROPIC", False)


def test_no_keys_still_means_demo_mode(monkeypatch):
    runtime = _runtime_with(monkeypatch, Settings(NVIDIA_API_KEY="", GEMINI_API_KEY=""))
    assert runtime["source"] == "MOCK"
