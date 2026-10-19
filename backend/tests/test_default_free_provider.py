"""The server's included free-tier AI: NVIDIA first, Google when NVIDIA cannot answer."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import main
from app.core.config import REPO_DIR, Settings
from app.core.exceptions import LLMError
from app.llm import default_free_provider as free
from app.llm import factory
from app.llm.base import LLMProvider
from app.llm.default_free_provider import FreeTier, FreeTierProvider, build_free_tiers
from app.llm.providers.deepseek import DEEPSEEK_NON_THINKING_PROFILE
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


def test_an_output_limit_is_raised_without_trying_the_next_tier():
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, LLMError("sin espacio", code="LLM_OUTPUT_LIMIT"))
    second, second_provider = _tier("gemini", LLMProviderName.GEMINI, "ok")
    chain = FreeTierProvider([first, second])

    with pytest.raises(LLMError) as raised:
        _call(chain)

    assert raised.value.code == "LLM_OUTPUT_LIMIT"
    assert first_provider.calls == 1
    assert second_provider.calls == 0
    assert not free._cooling_down("nvidia")


def test_close_releases_the_providers_that_were_built():
    first, first_provider = _tier("nvidia", LLMProviderName.NVIDIA, "ok")
    chain = FreeTierProvider([first])
    _call(chain)
    chain.close()
    assert first_provider.closed


def test_builds_the_deepseek_tier_from_the_environment():
    tiers = build_free_tiers(Settings(DEEPSEEK_API_KEY="sk-test"))

    assert [(tier.name, tier.provider, tier.model) for tier in tiers] == [
        ("deepseek", LLMProviderName.DEEPSEEK, "deepseek-flash")
    ]
    # Construction is lazy-cheap: building the client performs no network I/O.
    provider = tiers[0].build()
    try:
        assert provider._request_profile == DEEPSEEK_NON_THINKING_PROFILE
    finally:
        provider.close()


@respx.mock
def test_the_free_deepseek_tier_calls_deepseek_with_thinking_off():
    route = respx.post("https://api.deepseek.com/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": "{}"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
            },
        )
    )
    provider = build_free_tiers(Settings(DEEPSEEK_API_KEY="sk-test"))[0].build()
    try:
        provider.complete(kind="session_content", system="s", prompt="p", max_tokens=4096)
    finally:
        provider.close()

    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer sk-test"
    payload = json.loads(request.content)
    assert payload["model"] == "deepseek-flash"
    assert payload["thinking"] == {"type": "disabled"}
    assert payload["max_tokens"] == 4096


def test_no_key_means_no_free_tier():
    assert build_free_tiers(Settings(DEEPSEEK_API_KEY="")) == []
    assert build_free_tiers(Settings(DEEPSEEK_API_KEY="   ")) == []


def test_the_free_ai_key_is_read_from_the_repo_root_env_file(tmp_path, monkeypatch):
    root_env, backend_env = tmp_path / "root.env", tmp_path / "backend.env"
    root_env.write_text("DEEPSEEK_API_KEY = sk-from-root\n")
    backend_env.write_text("FREE_AI_DAILY_LIMIT=5\n")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    settings = Settings(_env_file=(root_env, backend_env))

    assert Settings.model_config["env_file"][0] == REPO_DIR / ".env"
    assert settings.DEEPSEEK_API_KEY.strip() == "sk-from-root"
    assert settings.FREE_AI_DAILY_LIMIT == 5


def test_tests_never_see_the_operators_free_ai_key():
    # conftest's empty environment variable beats the repo-root .env that holds the real key.
    assert Settings().DEEPSEEK_API_KEY == ""


def _runtime_with(monkeypatch, settings):
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        return client.get("/llm-settings/runtime").json()


def test_runtime_reports_the_included_ai_when_the_server_has_free_keys(monkeypatch):
    runtime = _runtime_with(monkeypatch, Settings(DEEPSEEK_API_KEY="sk-free-test"))

    assert runtime["source"] == "ENV"
    assert runtime["provider"] == "DEEPSEEK"
    assert runtime["bundled"] is True
    assert runtime["models"]["session_content"] == "deepseek-flash"
    assert "sk-free-test" not in str(runtime)


def test_an_operator_anthropic_key_wins_over_the_included_ai(monkeypatch):
    settings = Settings(ANTHROPIC_API_KEY="anthropic-test", DEEPSEEK_API_KEY="sk-free-test")
    runtime = _runtime_with(monkeypatch, settings)
    assert (runtime["provider"], runtime["bundled"]) == ("ANTHROPIC", False)


def test_no_keys_still_means_demo_mode(monkeypatch):
    runtime = _runtime_with(monkeypatch, Settings(DEEPSEEK_API_KEY=""))
    assert runtime["source"] == "MOCK"


# --- Daily limit on the included AI ------------------------------------------------------


def _free_ai_client(monkeypatch, limit=3):
    from app.api.v1.routes import llm_settings as llm_routes
    from app.core import config as config_module
    from app.services import free_ai_quota

    settings = Settings(DEEPSEEK_API_KEY="sk-free-test", FREE_AI_DAILY_LIMIT=limit)
    for module in (factory, llm_routes, free_ai_quota):
        monkeypatch.setattr(module, "get_settings", lambda: settings)
    monkeypatch.setattr(config_module, "get_settings", lambda: settings)
    monkeypatch.setattr("app.api.v1.routes.plans.generate_plan_task", lambda plan_id: None)
    return TestClient(main.app)


def _goal(client):
    response = client.post("/goals", json={"goal_type": "LEARNING", "title": "Límite", "description": ""})
    return response.json()["id"]


def _reset_usage():
    from app.db.session import SessionLocal
    from app.models.free_ai_usage import FreeAiUsage

    with SessionLocal() as db:
        db.query(FreeAiUsage).delete()
        db.commit()


def test_runtime_reports_what_is_left_of_the_daily_allowance(monkeypatch):
    _reset_usage()
    with _free_ai_client(monkeypatch) as client:
        client.post("/llm-settings/deactivate-all")
        runtime = client.get("/llm-settings/runtime").json()
        assert runtime["free_ai"] == {"limit": 3, "used": 0, "remaining": 3}

        client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []})
        assert client.get("/llm-settings/runtime").json()["free_ai"] == {"limit": 3, "used": 1, "remaining": 2}


def test_the_plan_after_the_daily_limit_is_refused_without_creating_it(monkeypatch):
    _reset_usage()
    with _free_ai_client(monkeypatch, limit=2) as client:
        client.post("/llm-settings/deactivate-all")
        goal_id = _goal(client)
        before = len(client.get("/plans").json())
        for _ in range(2):
            assert client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []}).status_code == 202

        refused = client.post("/plans/generate", json={"goal_id": goal_id, "document_ids": []})

        assert refused.status_code == 429
        assert refused.json()["code"] == "FREE_AI_DAILY_LIMIT"
        assert "Conecta tu propia IA" in refused.json()["detail"]
        assert len(client.get("/plans").json()) == before + 2


def test_an_idempotent_replay_does_not_spend_another_use(monkeypatch):
    _reset_usage()
    with _free_ai_client(monkeypatch) as client:
        client.post("/llm-settings/deactivate-all")
        goal_id = _goal(client)
        for _ in range(2):
            client.post(
                "/plans/generate",
                json={"goal_id": goal_id, "document_ids": []},
                headers={"Idempotency-Key": "same-request"},
            )
        assert client.get("/llm-settings/runtime").json()["free_ai"]["used"] == 1


def test_a_failed_generation_gives_the_use_back(monkeypatch):
    from app.db.session import SessionLocal
    from app.services import plan_service
    from app.services.free_ai_quota import FreeAiQuota

    _reset_usage()
    with _free_ai_client(monkeypatch) as client:
        client.post("/llm-settings/deactivate-all")
        plan_id = client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []}).json()["id"]
        monkeypatch.setattr(
            plan_service,
            "get_llm_provider",
            lambda *_: _Scripted(LLMError("sin cuota", code="LLM_QUOTA_EXHAUSTED")),
        )
        plan_service.generate_plan_task(plan_id)

        with SessionLocal() as db:
            assert FreeAiQuota(db).status(1).used == 0
        assert client.get(f"/plans/{plan_id}").json()["status"] == "FAILED"


def test_the_learners_own_key_or_demo_mode_never_spend_the_allowance(monkeypatch):
    _reset_usage()
    settings = Settings(DEEPSEEK_API_KEY="")
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr("app.api.v1.routes.plans.generate_plan_task", lambda plan_id: None)
    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        for _ in range(5):
            assert client.post("/plans/generate", json={"goal_id": _goal(client), "document_ids": []}).status_code == 202
        assert client.get("/llm-settings/runtime").json()["free_ai"] is None
