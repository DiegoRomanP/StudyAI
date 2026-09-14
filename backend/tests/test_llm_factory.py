"""Unit tests for verified-credential provider selection and fallback tiers."""

from __future__ import annotations

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from app.db.session import SessionLocal
from app.core.config import LLMCallPolicy, Settings
from app.core.exceptions import LLMError
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.factory import build_provider_from_credential, get_llm_provider
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.request_profiles import (
    OLLAMA_CHAT_PROFILE,
    OPENAI_O_SERIES_PROFILE,
    STANDARD_CHAT_PROFILE,
)
from app.models.llm_credential import LLMCredential, LLMProviderName

DEMO_USER_ID = 1


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def successful_connection_test(monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)
    monkeypatch.setattr(AnthropicProvider, "test_connection", lambda self: None)


def _provider_for_demo_user():
    db = SessionLocal()
    try:
        return get_llm_provider(db, DEMO_USER_ID)
    finally:
        db.close()


def _credential_for_demo_user(provider: LLMProviderName) -> LLMCredential:
    db = SessionLocal()
    try:
        credential = db.query(LLMCredential).filter(LLMCredential.provider == provider).one()
        db.expunge(credential)
        return credential
    finally:
        db.close()


def _configure_and_activate(client: TestClient, provider: str, model: str, payload: dict | None = None):
    saved = client.put(f"/llm-settings/{provider}", json=payload or {"api_key": "sk-test-1234567890"})
    assert saved.status_code == 200
    draft = client.patch(
        f"/llm-settings/{provider}/model",
        json={"model": model, "expected_revision": saved.json()["config_revision"]},
    )
    assert draft.status_code == 200
    verified = client.post(
        f"/llm-settings/{provider}/test",
        json={"expected_revision": draft.json()["config_revision"]},
    )
    assert verified.status_code == 200
    activated = client.post(
        f"/llm-settings/{provider}/activate",
        json={"expected_revision": verified.json()["credential"]["config_revision"]},
    )
    assert activated.status_code == 200


def test_no_active_credential_and_no_env_key_falls_back_to_mock(client: TestClient):
    client.post("/llm-settings/deactivate-all")
    assert isinstance(_provider_for_demo_user(), MockLLMProvider)


def test_active_openai_credential_builds_openai_compatible_provider(client: TestClient):
    _configure_and_activate(client, "OPENAI", "gpt-4o-mini")

    provider = _provider_for_demo_user()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider._model == "gpt-4o-mini"
    assert provider._request_profile == STANDARD_CHAT_PROFILE


def test_active_openai_o_series_credential_uses_its_request_profile(client: TestClient):
    _configure_and_activate(client, "OPENAI", "o4-mini")

    provider = _provider_for_demo_user()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider._request_profile == OPENAI_O_SERIES_PROFILE


@pytest.mark.parametrize(
    ("provider_name", "model", "url", "token_limit_parameter"),
    [
        ("OPENAI", "o4-mini", "https://api.openai.com/v1/chat/completions", "max_completion_tokens"),
        ("NVIDIA", "meta/llama-3.1-70b-instruct", "https://integrate.api.nvidia.com/v1/chat/completions", "max_tokens"),
        ("OLLAMA", "qwen3.5:9b", "http://127.0.0.1:11434/v1/chat/completions", "max_tokens"),
    ],
)
@respx.mock
def test_factory_profile_controls_the_final_transport_payload(
    client: TestClient, provider_name: str, model: str, url: str, token_limit_parameter: str
):
    _configure_and_activate(client, provider_name, model, {} if provider_name == "OLLAMA" else None)
    credential = _credential_for_demo_user(LLMProviderName(provider_name))
    provider = build_provider_from_credential(credential)
    route = respx.post(url).mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [{"finish_reason": "stop", "message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
            },
        )
    )

    try:
        provider.complete(kind="quiz", system="sys", prompt="prompt", max_tokens=128)
    finally:
        provider.close()

    payload = json.loads(route.calls.last.request.content)
    assert payload[token_limit_parameter] == 128
    other_token_limit = (
        "max_tokens" if token_limit_parameter == "max_completion_tokens" else "max_completion_tokens"
    )
    assert other_token_limit not in payload
    assert "reasoning_effort" not in payload
    assert set(payload) == {"model", "messages", token_limit_parameter}


def test_custom_openai_deployment_uses_standard_profile(client: TestClient, monkeypatch):
    import socket

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))],
    )
    _configure_and_activate(
        client,
        "OPENAI",
        "o4-custom-deployment",
        {
            "api_key": "sk-test-1234567890",
            "base_url": "https://my-openai-gateway.example.com/v1",
        },
    )

    provider = _provider_for_demo_user()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider._request_profile == STANDARD_CHAT_PROFILE


def test_unverified_active_credential_is_not_usable(client: TestClient):
    client.post("/llm-settings/deactivate-all")
    saved = client.put("/llm-settings/NVIDIA", json={"api_key": "nvapi-1234567890abcdef"})
    draft = client.patch(
        "/llm-settings/NVIDIA/model",
        json={"model": "meta/llama-3.1-70b-instruct", "expected_revision": saved.json()["config_revision"]},
    )
    assert draft.status_code == 200

    # Simulate a stale row left active by an interrupted old deployment.
    db = SessionLocal()
    try:
        credential = db.query(LLMCredential).filter(
            LLMCredential.provider == LLMProviderName.NVIDIA
        ).one()
        credential.is_active = True
        db.commit()
    finally:
        db.close()

    assert isinstance(_provider_for_demo_user(), MockLLMProvider)


def test_active_openrouter_credential_uses_custom_base_url_override(client: TestClient, monkeypatch):
    import socket

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))],
    )
    _configure_and_activate(
        client,
        "OPENROUTER",
        "openai/gpt-4o-mini",
        {
            "api_key": "sk-or-v1-1234567890",
            "base_url": "https://my-openrouter-proxy.example.com/v1",
        },
    )

    provider = _provider_for_demo_user()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert str(provider._client.base_url).rstrip("/") == "https://my-openrouter-proxy.example.com/v1"


def test_active_anthropic_credential_uses_single_fixed_model(client: TestClient):
    _configure_and_activate(client, "ANTHROPIC", "claude-haiku-4-5")

    provider = _provider_for_demo_user()
    assert isinstance(provider, AnthropicProvider)
    assert provider._fixed_model == "claude-haiku-4-5"


def test_active_ollama_uses_local_settings_without_authentication(client: TestClient):
    _configure_and_activate(client, "OLLAMA", "qwen3.5:9b", {})

    provider = _provider_for_demo_user()
    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider._model == "qwen3.5:9b"
    assert "authorization" not in provider._client.headers
    assert provider.requires_request_pacing is False
    assert provider._request_profile == OLLAMA_CHAT_PROFILE
    assert provider._generation_policy.max_attempts == 1
    assert provider._generation_policy.max_rate_limit_retries == 0
    assert provider._test_policy == provider._generation_policy


@respx.mock
def test_factory_ollama_policy_never_retries_a_429(client: TestClient):
    _configure_and_activate(client, "OLLAMA", "qwen3.5:9b", {})
    provider = _provider_for_demo_user()
    route = respx.post("http://127.0.0.1:11434/v1/chat/completions").mock(
        return_value=httpx.Response(429)
    )

    with pytest.raises(LLMError) as exc_info:
        provider.complete(kind="quiz", system="sys", prompt="prompt")

    assert exc_info.value.code == "LLM_RATE_LIMITED"
    assert route.call_count == 1


@pytest.mark.parametrize(
    "field",
    ["LLM_TIMEOUT_SECONDS", "LLM_TOTAL_BUDGET_SECONDS", "LLM_REQUEST_PACING_SECONDS"],
)
def test_settings_reject_non_finite_time_limits(field: str):
    with pytest.raises(ValidationError):
        Settings(**{field: float("inf")})


def test_call_policy_rejects_non_finite_or_invalid_values():
    with pytest.raises(ValueError):
        LLMCallPolicy(float("inf"), 1.0, 1.0, 1, 0)
    with pytest.raises(ValueError):
        LLMCallPolicy(1.0, 1.0, 1.0, 0, 0)
