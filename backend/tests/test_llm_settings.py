"""Integration tests for the revisioned LLM credential configuration flow."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
from app.core.exceptions import LLMError


class _TestProvider:
    def __init__(self, model: str) -> None:
        self.model = model
        self.closed = False

    def test_connection(self) -> None:
        if self.model == "unavailable-model":
            raise LLMError("simulated model access failure")

    def close(self) -> None:
        self.closed = True


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def fake_provider(monkeypatch):
    from app.llm import factory

    monkeypatch.setattr(
        factory,
        "build_provider_from_credential",
        lambda credential: _TestProvider(credential.model),
    )


def _save_key(client: TestClient, provider: str = "OPENAI") -> dict:
    response = client.put(
        f"/llm-settings/{provider}", json={"api_key": "sk-test-1234567890abcdef"}
    )
    assert response.status_code == 200
    return response.json()


def _save_draft(client: TestClient, provider: str, revision: int, model: str) -> dict:
    response = client.patch(
        f"/llm-settings/{provider}/model",
        json={"model": model, "expected_revision": revision},
    )
    assert response.status_code == 200
    return response.json()


def _verify(client: TestClient, provider: str, revision: int) -> dict:
    response = client.post(
        f"/llm-settings/{provider}/test", json={"expected_revision": revision}
    )
    assert response.status_code == 200
    return response.json()["credential"]


def test_catalog_lists_all_seven_providers(client: TestClient):
    response = client.get("/llm-settings/catalog")
    assert response.status_code == 200
    assert {entry["provider"] for entry in response.json()} == {
        "ANTHROPIC",
        "OPENAI",
        "GLM",
        "OPENROUTER",
        "NVIDIA",
        "HUGGINGFACE",
        "OLLAMA",
    }


def test_saving_a_key_keeps_the_model_selector_available(client: TestClient):
    credential = _save_key(client, "NVIDIA")

    assert credential["model"] == ""
    assert credential["config_revision"] >= 1
    assert credential["is_verified"] is False
    assert credential["is_active"] is False


def test_failing_catalog_model_does_not_block_another_model_with_same_key(client: TestClient):
    credential = _save_key(client, "NVIDIA")
    failed_draft = _save_draft(client, "NVIDIA", credential["config_revision"], "unavailable-model")

    failed_test = client.post(
        "/llm-settings/NVIDIA/test",
        json={"expected_revision": failed_draft["config_revision"]},
    )
    assert failed_test.status_code == 502

    persisted = next(
        item for item in client.get("/llm-settings").json() if item["provider"] == "NVIDIA"
    )
    assert persisted["model"] == "unavailable-model"
    assert persisted["is_verified"] is False

    working_draft = _save_draft(
        client, "NVIDIA", persisted["config_revision"], "meta/llama-3.1-70b-instruct"
    )
    verified = _verify(client, "NVIDIA", working_draft["config_revision"])

    assert verified["model"] == "meta/llama-3.1-70b-instruct"
    assert verified["is_verified"] is True
    assert verified["verified_at"] is not None


def test_activation_requires_evidence_for_the_current_draft(client: TestClient):
    credential = _save_key(client, "OPENROUTER")
    draft = _save_draft(client, "OPENROUTER", credential["config_revision"], "openai/gpt-4o-mini")

    blocked = client.post(
        "/llm-settings/OPENROUTER/activate",
        json={"expected_revision": draft["config_revision"]},
    )
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "LLM_NOT_VERIFIED"

    verified = _verify(client, "OPENROUTER", draft["config_revision"])
    activated = client.post(
        "/llm-settings/OPENROUTER/activate",
        json={"expected_revision": verified["config_revision"]},
    )
    assert activated.status_code == 200
    assert activated.json()["is_active"] is True


def test_changing_a_verified_model_invalidates_evidence_and_deactivates(client: TestClient):
    credential = _save_key(client, "GLM")
    draft = _save_draft(client, "GLM", credential["config_revision"], "glm-4-flash")
    verified = _verify(client, "GLM", draft["config_revision"])
    client.post("/llm-settings/GLM/activate", json={"expected_revision": verified["config_revision"]})

    changed = _save_draft(client, "GLM", verified["config_revision"], "glm-4-air")
    assert changed["is_verified"] is False
    assert changed["is_active"] is False


def test_stale_revision_cannot_replace_or_verify_a_draft(client: TestClient):
    credential = _save_key(client, "HUGGINGFACE")
    draft = _save_draft(client, "HUGGINGFACE", credential["config_revision"], "zai-org/GLM-5.2")

    stale_patch = client.patch(
        "/llm-settings/HUGGINGFACE/model",
        json={"model": "moonshotai/Kimi-K2.6", "expected_revision": credential["config_revision"]},
    )
    assert stale_patch.status_code == 409
    assert stale_patch.json()["code"] == "LLM_CONFIGURATION_CHANGED"

    stale_test = client.post(
        "/llm-settings/HUGGINGFACE/test",
        json={"expected_revision": credential["config_revision"]},
    )
    assert stale_test.status_code == 409
    assert draft["is_verified"] is False


def test_omitting_base_url_preserves_it_and_empty_string_restores_default(client: TestClient, monkeypatch):
    import socket

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))],
    )
    credential = client.put(
        "/llm-settings/OPENAI",
        json={"api_key": "sk-test-1234567890abcdef", "base_url": "https://proxy.example/v1"},
    ).json()
    preserved = _save_draft(client, "OPENAI", credential["config_revision"], "gpt-4o-mini")
    assert preserved["base_url"] == "https://proxy.example/v1"

    reset = client.patch(
        "/llm-settings/OPENAI/model",
        json={
            "model": "gpt-4.1-mini",
            "base_url": "",
            "expected_revision": preserved["config_revision"],
        },
    )
    assert reset.status_code == 200
    assert reset.json()["base_url"] == ""


def test_replacing_api_key_resets_the_draft_and_evidence(client: TestClient):
    credential = _save_key(client, "ANTHROPIC")
    draft = _save_draft(client, "ANTHROPIC", credential["config_revision"], "claude-haiku-4-5")
    verified = _verify(client, "ANTHROPIC", draft["config_revision"])

    replaced = client.put(
        "/llm-settings/ANTHROPIC", json={"api_key": "sk-test-replaced-1234567890"}
    )
    assert replaced.status_code == 200
    assert replaced.json()["config_revision"] == verified["config_revision"] + 1
    assert replaced.json()["model"] == ""
    assert replaced.json()["is_verified"] is False


def test_model_update_and_activation_require_a_revision(client: TestClient):
    assert client.patch("/llm-settings/OPENAI/model", json={"model": "gpt-4o-mini"}).status_code == 422
    assert client.post("/llm-settings/OPENAI/activate", json={}).status_code == 422
    assert client.post("/llm-settings/OPENAI/test", json={}).status_code == 422


def test_ollama_remains_keyless_but_requires_a_verified_installed_model(client: TestClient):
    credential = client.put("/llm-settings/OLLAMA", json={}).json()
    assert credential["masked_api_key"] == ""
    draft = _save_draft(client, "OLLAMA", credential["config_revision"], "qwen3.5:9b")
    verified = _verify(client, "OLLAMA", draft["config_revision"])
    assert verified["is_verified"] is True
