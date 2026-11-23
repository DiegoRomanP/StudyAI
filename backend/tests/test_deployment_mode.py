"""DEPLOYMENT_MODE=saas: server key only, never the mock or a learner's own AI."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

import main
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.factory import get_llm_provider
from app.llm.mock_provider import MockLLMProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.unavailable_provider import UnavailableLLMProvider
from app.models.user import User
from tests.helpers import indexed_doc


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def saas(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "DEPLOYMENT_MODE", "saas")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "DEEPSEEK_API_KEY", "")
    return settings


def _provider():
    with SessionLocal() as db:
        return get_llm_provider(db, 1)


def test_self_hosted_default_unchanged(client):
    client.post("/llm-settings/deactivate-all")

    assert get_settings().DEPLOYMENT_MODE == "self_hosted"
    assert client.get("/llm-settings/runtime").json()["source"] == "MOCK"
    assert isinstance(_provider(), MockLLMProvider)
    assert client.get("/llm-settings").status_code == 200


def test_saas_ignores_user_credential(client, monkeypatch):
    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", lambda self: None)
    saved = client.put("/llm-settings/OPENAI", json={"api_key": "sk-test-1234567890"}).json()
    draft = client.patch(
        "/llm-settings/OPENAI/model",
        json={"model": "gpt-4o-mini", "expected_revision": saved["config_revision"]},
    ).json()
    verified = client.post("/llm-settings/OPENAI/test", json={"expected_revision": draft["config_revision"]}).json()
    client.post(
        "/llm-settings/OPENAI/activate",
        json={"expected_revision": verified["credential"]["config_revision"]},
    )
    assert client.get("/llm-settings/runtime").json()["source"] == "USER"

    with monkeypatch.context() as m:
        settings = get_settings()
        m.setattr(settings, "DEPLOYMENT_MODE", "saas")
        m.setattr(settings, "ANTHROPIC_API_KEY", "")
        runtime = client.get("/llm-settings/runtime").json()
    client.post("/llm-settings/deactivate-all")

    assert runtime["source"] == "UNAVAILABLE"


def test_saas_uses_the_server_anthropic_key(client, saas, monkeypatch):
    monkeypatch.setattr(saas, "ANTHROPIC_API_KEY", "server-key")

    runtime = client.get("/llm-settings/runtime").json()

    assert (runtime["source"], runtime["provider"], runtime["bundled"]) == ("ENV", "ANTHROPIC", False)
    assert isinstance(_provider(), AnthropicProvider)


def test_saas_without_key_never_uses_mock_or_free_tier(client, saas, monkeypatch):
    monkeypatch.setattr(saas, "DEEPSEEK_API_KEY", "free-tier-key")

    assert isinstance(_provider(), UnavailableLLMProvider)
    runtime = client.get("/llm-settings/runtime").json()
    assert runtime["source"] == "UNAVAILABLE" and runtime["free_ai"] is None


def test_saas_plan_without_key_fails_with_llm_unavailable(client, saas):
    with SessionLocal() as db:  # saas charges a credit before generating
        db.execute(update(User).where(User.id == 1).values(credit_balance=1))
        db.commit()
    goal_id = client.post("/goals", json={"goal_type": "EXAM", "title": "Saas", "description": ""}).json()["id"]
    plan_id = client.post(
        "/plans/generate", json={"goal_id": goal_id, "document_ids": [indexed_doc(client)]}
    ).json()["id"]

    plan = client.get(f"/plans/{plan_id}").json()

    assert plan["status"] == "FAILED"
    assert "no está disponible" in plan["error_message"]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/llm-settings"),
        ("put", "/llm-settings/OPENAI"),
        ("patch", "/llm-settings/OPENAI/model"),
        ("post", "/llm-settings/OPENAI/test"),
        ("post", "/llm-settings/OPENAI/activate"),
        ("post", "/llm-settings/deactivate-all"),
        ("get", "/llm-settings/OLLAMA/models"),
        ("delete", "/llm-settings/OPENAI"),
    ],
)
def test_saas_llm_settings_routes_are_404(client, saas, method, path):
    assert getattr(client, method)(path, **({} if method in {"get", "delete"} else {"json": {}})).status_code == 404


def test_guarded_paths_are_real_routes():
    """The 404 test above would pass vacuously for a path that does not exist."""
    routes = {(m, path) for path, ops in main.app.openapi()["paths"].items() for m in ops}
    for method, path in [
        ("get", "/llm-settings"),
        ("put", "/llm-settings/{provider}"),
        ("patch", "/llm-settings/{provider}/model"),
        ("post", "/llm-settings/{provider}/test"),
        ("post", "/llm-settings/{provider}/activate"),
        ("post", "/llm-settings/deactivate-all"),
        ("delete", "/llm-settings/{provider}"),
    ]:
        assert (method, path) in routes
    assert any(p.startswith("/llm-settings/") and p.endswith("/models") for _, p in routes)


def test_saas_keeps_catalog_and_runtime_open(client, saas):
    assert client.get("/llm-settings/catalog").status_code == 200
    assert client.get("/llm-settings/runtime").status_code == 200


def test_config_endpoint_reports_mode(client, saas):
    assert client.get("/config").json() == {"deployment_mode": "saas", "auth_mode": "demo"}


def test_config_endpoint_default_is_self_hosted(client):
    assert client.get("/config").json() == {"deployment_mode": "self_hosted", "auth_mode": "demo"}
