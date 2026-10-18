"""Regression tests for the effective LLM runtime state endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

import app.llm.anthropic_provider as anthropic_provider
import app.llm.factory as factory
import main
from app.core.config import Settings
from app.db.session import SessionLocal
from app.llm.factory import get_llm_provider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.schemas.llm_settings import LLMRuntimeResponse


def _configure_active_openai(client: TestClient) -> None:
    saved = client.put("/llm-settings/OPENAI", json={"api_key": "sk-test-1234567890"})
    assert saved.status_code == 200
    draft = client.patch(
        "/llm-settings/OPENAI/model",
        json={"model": "gpt-4o-mini", "expected_revision": saved.json()["config_revision"]},
    )
    assert draft.status_code == 200
    verified = client.post(
        "/llm-settings/OPENAI/test",
        json={"expected_revision": draft.json()["config_revision"]},
    )
    assert verified.status_code == 200
    activated = client.post(
        "/llm-settings/OPENAI/activate",
        json={"expected_revision": verified.json()["credential"]["config_revision"]},
    )
    assert activated.status_code == 200


def _raise_private_failure(*_args, **_kwargs):
    raise RuntimeError("private provider failure")


@pytest.mark.parametrize(
    "source,provider,models",
    [
        ("MOCK", None, {"topic_analysis": "simulado"}),
        (
            "USER",
            None,
            {
                "topic_analysis": "model",
                "session_plan": "model",
                "session_content": "model",
            },
        ),
        (
            "MOCK",
            "OPENAI",
            {
                "topic_analysis": "simulado",
                "session_plan": "simulado",
                "session_content": "simulado",
            },
        ),
        (
            "ENV",
            "OPENAI",
            {
                "topic_analysis": "model",
                "session_plan": "model",
                "session_content": "model",
            },
        ),
        (
            "MOCK",
            None,
            {
                "topic_analysis": "model",
                "session_plan": "model",
                "session_content": "model",
            },
        ),
    ],
)
def test_runtime_response_rejects_incomplete_or_inconsistent_metadata(source, provider, models):
    with pytest.raises(ValidationError):
        LLMRuntimeResponse(
            source=source,
            provider=provider,
            models=models,
            fallback_reason=None,
        )


def test_runtime_reports_mock_only_when_no_user_or_server_provider():
    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    assert response.json() == {
        "source": "MOCK",
        "provider": None,
        "models": {
            "topic_analysis": "simulado",
            "session_plan": "simulado",
            "session_content": "simulado",
        },
        "fallback_reason": None,
        "bundled": False,
    }


def test_runtime_reports_env_anthropic_after_user_credentials_are_deactivated(monkeypatch):
    settings = Settings(
        ANTHROPIC_API_KEY="server-anthropic-key",
        LLM_MODEL_PLAN="server-plan-model",
        LLM_MODEL_QUIZ="server-quiz-model",
    )
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(anthropic_provider, "get_settings", lambda: settings)

    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    assert response.json() == {
        "source": "ENV",
        "provider": "ANTHROPIC",
        "models": {
            "topic_analysis": "server-plan-model",
            "session_plan": "server-plan-model",
            "session_content": "server-quiz-model",
        },
        "fallback_reason": None,
        "bundled": False,
    }


def test_runtime_reports_user_provider_and_fixed_model(monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)

    with TestClient(main.app) as client:
        _configure_active_openai(client)
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "USER"
    assert body["provider"] == "OPENAI"
    assert set(body["models"].values()) == {"gpt-4o-mini"}
    assert body["fallback_reason"] is None

    db = SessionLocal()
    provider = get_llm_provider(db, 1)
    try:
        assert isinstance(provider, OpenAICompatibleProvider)
        assert provider._model == body["models"]["session_content"]
    finally:
        provider.close()
        db.close()


def test_runtime_sanitizes_a_user_provider_construction_fallback(monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)

    with TestClient(main.app) as client:
        _configure_active_openai(client)

        def fail_to_build(*_args, **_kwargs):
            raise RuntimeError("private upstream failure")

        monkeypatch.setattr(factory, "build_provider_from_credential", fail_to_build)
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "MOCK"
    assert body["fallback_reason"] == (
        "La configuración activa no está disponible; se aplicó el modo demo."
    )
    assert "private upstream failure" not in str(body)


def test_runtime_reports_user_to_env_fallback(monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)
    settings = Settings(ANTHROPIC_API_KEY="server-anthropic-key")
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(anthropic_provider, "get_settings", lambda: settings)

    with TestClient(main.app) as client:
        _configure_active_openai(client)
        monkeypatch.setattr(factory, "build_provider_from_credential", _raise_private_failure)
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    assert response.json()["source"] == "ENV"
    assert response.json()["fallback_reason"] == (
        "La configuración activa no está disponible; se aplicó la configuración del servidor."
    )


def test_runtime_reports_env_to_mock_fallback(monkeypatch):
    settings = Settings(ANTHROPIC_API_KEY="server-anthropic-key")
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(
        anthropic_provider,
        "AnthropicProvider",
        _raise_private_failure,
    )

    with TestClient(main.app) as client:
        client.post("/llm-settings/deactivate-all")
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    assert response.json()["source"] == "MOCK"
    assert response.json()["fallback_reason"] == (
        "La configuración del servidor no está disponible; se usará el modo demo."
    )


def test_runtime_reports_user_and_env_to_mock_fallback(monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)
    settings = Settings(ANTHROPIC_API_KEY="server-anthropic-key")
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(
        anthropic_provider,
        "AnthropicProvider",
        lambda: (_ for _ in ()).throw(RuntimeError("private server failure")),
    )

    with TestClient(main.app) as client:
        _configure_active_openai(client)
        monkeypatch.setattr(factory, "build_provider_from_credential", _raise_private_failure)
        response = client.get("/llm-settings/runtime")

    assert response.status_code == 200
    assert response.json()["source"] == "MOCK"
    assert response.json()["fallback_reason"] == (
        "La configuración activa y la del servidor no están disponibles; se aplicó el modo demo."
    )
