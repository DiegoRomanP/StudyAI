"""Unit tests for verified-credential provider selection and fallback tiers."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from app.db.session import SessionLocal
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.factory import get_llm_provider
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
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
