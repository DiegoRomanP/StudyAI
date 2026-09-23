"""Integration tests for the revisioned LLM credential configuration flow."""

from __future__ import annotations

from collections.abc import Callable

import pytest
import httpx
import respx
from fastapi.testclient import TestClient

import main
from app.core.exceptions import LLMError
from app.db.session import SessionLocal
from app.llm.factory import build_provider_from_credential as real_build_provider_from_credential
from app.models.llm_credential import LLMCredential, LLMProviderName
from app.services.llm_settings_service import LLMSettingsService


class _TestProvider:
    on_test: Callable[[], None] | None = None

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url
        self.closed = False

    def test_connection(self) -> None:
        callback = type(self).on_test
        if callback is not None:
            callback()
        if self.model == "unavailable-model":
            raise LLMError("simulated model access failure")
        if self.base_url == "https://blocked-proxy.example/v1":
            raise LLMError("simulated endpoint access failure")

    def close(self) -> None:
        self.closed = True


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def fake_provider(monkeypatch):
    from app.llm import factory

    _TestProvider.on_test = None
    monkeypatch.setattr(
        factory,
        "build_provider_from_credential",
        lambda credential: _TestProvider(credential.model, credential.base_url),
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
    capabilities = {entry["provider"]: entry["supports_custom_base_url"] for entry in response.json()}
    assert capabilities == {
        "ANTHROPIC": False,
        "OPENAI": True,
        "GLM": True,
        "OPENROUTER": True,
        "NVIDIA": False,
        "HUGGINGFACE": True,
        "OLLAMA": False,
    }
    custom_models = {entry["provider"]: entry["allows_custom_model"] for entry in response.json()}
    assert custom_models["NVIDIA"] is False


def test_saving_a_key_keeps_the_model_selector_available(client: TestClient):
    credential = _save_key(client, "NVIDIA")

    assert credential["model"] == ""
    assert credential["config_revision"] >= 1
    assert credential["is_verified"] is False
    assert credential["is_active"] is False


def test_nvidia_rejects_an_unsupported_model_without_replacing_the_key(client: TestClient):
    credential = _save_key(client, "NVIDIA")
    rejected = client.patch(
        "/llm-settings/NVIDIA/model",
        json={"model": "nvidia/gliner-pii", "expected_revision": credential["config_revision"]},
    )
    assert rejected.status_code == 400
    assert "no es compatible" in rejected.json()["detail"]

    persisted = next(
        item for item in client.get("/llm-settings").json() if item["provider"] == "NVIDIA"
    )
    assert persisted["model"] == ""
    assert persisted["is_verified"] is False

    working_draft = _save_draft(
        client, "NVIDIA", persisted["config_revision"], "meta/llama-3.1-70b-instruct"
    )
    verified = _verify(client, "NVIDIA", working_draft["config_revision"])

    assert verified["model"] == "meta/llama-3.1-70b-instruct"
    assert verified["is_verified"] is True


def test_nvidia_rejects_a_custom_base_url(client: TestClient):
    response = client.put(
        "/llm-settings/NVIDIA",
        json={
            "api_key": "nvapi-1234567890abcdef",
            "base_url": "https://integrate.api.nvidia.com/v1",
        },
    )

    assert response.status_code == 400
    assert "no admite una URL base personalizada" in response.json()["detail"]


def test_authentication_failure_revokes_only_the_tested_credential(client: TestClient):
    credential = _save_key(client, "HUGGINGFACE")
    draft = _save_draft(client, "HUGGINGFACE", credential["config_revision"], "test-model")
    verified = _verify(client, "HUGGINGFACE", draft["config_revision"])
    activated = client.post(
        "/llm-settings/HUGGINGFACE/activate",
        json={"expected_revision": verified["config_revision"]},
    )
    assert activated.status_code == 200

    _TestProvider.on_test = lambda: (_ for _ in ()).throw(
        LLMError(
            "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave.",
            code="LLM_AUTHENTICATION_FAILED",
            provider="HUGGINGFACE",
            upstream_status=401,
        )
    )
    response = client.post(
        "/llm-settings/HUGGINGFACE/test",
        json={"expected_revision": verified["config_revision"]},
    )

    assert response.status_code == 502
    assert response.json() == {
        "detail": "El proveedor de IA rechazó la autenticación. Revisa o reemplaza la clave.",
        "code": "LLM_AUTHENTICATION_FAILED",
        "provider": "HUGGINGFACE",
        "upstream_status": 401,
        "retryable": False,
        "retry_after_seconds": None,
    }
    stored = client.get("/llm-settings").json()
    credential = next(item for item in stored if item["provider"] == "HUGGINGFACE")
    assert credential["is_verified"] is False
    assert credential["is_active"] is False
    assert verified["verified_at"] is not None


@pytest.mark.parametrize(
    ("provider", "code"),
    [
        ("GLM", "LLM_ACCESS_DENIED"),
        ("NVIDIA", "LLM_QUOTA_EXHAUSTED"),
        ("OPENROUTER", "LLM_TIMEOUT"),
        ("HUGGINGFACE", "LLM_RATE_LIMITED"),
        ("ANTHROPIC", "LLM_PROVIDER_UNAVAILABLE"),
        ("OPENAI", "LLM_UNSUPPORTED_REQUEST"),
        ("OPENAI", "LLM_OUTPUT_LIMIT"),
        ("OPENAI", "LLM_REFUSED"),
        ("OPENAI", "LLM_INVALID_RESPONSE"),
    ],
)
def test_non_authentication_failures_do_not_revoke_verification(client: TestClient, provider: str, code: str):
    credential = _save_key(client, provider)
    model = "meta/llama-3.3-70b-instruct" if provider == "NVIDIA" else "test-model"
    draft = _save_draft(client, provider, credential["config_revision"], model)
    verified = _verify(client, provider, draft["config_revision"])
    assert client.post(
        f"/llm-settings/{provider}/activate", json={"expected_revision": verified["config_revision"]}
    ).status_code == 200

    _TestProvider.on_test = lambda: (_ for _ in ()).throw(
        LLMError("Fallo seguro.", code=code, provider=provider)
    )
    response = client.post(
        f"/llm-settings/{provider}/test", json={"expected_revision": verified["config_revision"]}
    )

    assert response.status_code == 502
    stored = next(item for item in client.get("/llm-settings").json() if item["provider"] == provider)
    assert stored["is_verified"] is True
    assert stored["is_active"] is True


@respx.mock
def test_openapi_declares_safe_llm_error_and_adapter_error_reaches_api(client: TestClient, monkeypatch):
    from app.llm.openai_compatible_provider import OpenAICompatibleProvider
    from app.llm.request_profiles import STANDARD_CHAT_PROFILE

    credential = _save_key(client, "OPENAI")
    draft = _save_draft(client, "OPENAI", credential["config_revision"], "gpt-4o-mini")
    monkeypatch.setattr(
        "app.llm.factory.build_provider_from_credential",
        lambda _credential: OpenAICompatibleProvider(
            base_url="https://api.example.test/v1",
            api_key="secret-test-key",
            model="gpt-4o-mini",
            request_profile=STANDARD_CHAT_PROFILE,
            max_retries=1,
        ),
    )
    respx.post("https://api.example.test/v1/chat/completions").mock(
        return_value=httpx.Response(401, json={"error": {"message": "secret-test-key"}})
    )

    response = client.post("/llm-settings/OPENAI/test", json={"expected_revision": draft["config_revision"]})
    schema = client.get("/openapi.json").json()
    error_schema = schema["paths"]["/llm-settings/{provider}/test"]["post"]["responses"]["502"]
    ollama_error_schema = schema["paths"]["/llm-settings/{provider}/models"]["get"]["responses"]["502"]

    assert response.status_code == 502
    assert "secret-test-key" not in response.text
    assert error_schema["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/LLMProviderErrorResponse"
    }
    assert ollama_error_schema["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/LLMProviderErrorResponse"
    }


@respx.mock
def test_truncated_adapter_response_keeps_prior_verification_active(client: TestClient, monkeypatch):
    from app.llm.openai_compatible_provider import OpenAICompatibleProvider
    from app.llm.request_profiles import STANDARD_CHAT_PROFILE

    credential = _save_key(client, "OPENAI")
    draft = _save_draft(client, "OPENAI", credential["config_revision"], "gpt-4o-mini")
    verified = _verify(client, "OPENAI", draft["config_revision"])
    assert client.post(
        "/llm-settings/OPENAI/activate",
        json={"expected_revision": verified["config_revision"]},
    ).status_code == 200

    monkeypatch.setattr(
        "app.llm.factory.build_provider_from_credential",
        lambda _credential: OpenAICompatibleProvider(
            base_url="https://api.example.test/v1",
            api_key="secret-test-key",
            model="gpt-4o-mini",
            request_profile=STANDARD_CHAT_PROFILE,
            max_retries=1,
        ),
    )
    respx.post("https://api.example.test/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "length",
                        "message": {"content": "partial"},
                    }
                ]
            },
        )
    )

    response = client.post(
        "/llm-settings/OPENAI/test",
        json={"expected_revision": verified["config_revision"]},
    )

    assert response.status_code == 502
    assert response.json()["code"] == "LLM_OUTPUT_LIMIT"
    stored = next(item for item in client.get("/llm-settings").json() if item["provider"] == "OPENAI")
    assert stored["is_verified"] is True
    assert stored["is_active"] is True


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


def test_inflight_test_cannot_verify_a_replaced_key(client: TestClient):
    credential = _save_key(client, "OPENAI")
    draft = _save_draft(client, "OPENAI", credential["config_revision"], "gpt-4o-mini")

    def replace_key_while_testing() -> None:
        db = SessionLocal()
        try:
            LLMSettingsService(db).upsert_credential(
                user_id=1,
                provider=LLMProviderName.OPENAI,
                api_key="sk-replaced-1234567890",
            )
        finally:
            db.close()

    _TestProvider.on_test = replace_key_while_testing
    stale_test = client.post(
        "/llm-settings/OPENAI/test",
        json={"expected_revision": draft["config_revision"]},
    )

    assert stale_test.status_code == 409
    assert stale_test.json()["code"] == "LLM_CONFIGURATION_CHANGED"
    persisted = next(item for item in client.get("/llm-settings").json() if item["provider"] == "OPENAI")
    assert persisted["model"] == ""
    assert persisted["is_verified"] is False


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


def test_anthropic_rejects_custom_base_urls_when_saving_or_updating(client: TestClient):
    saved = client.put(
        "/llm-settings/ANTHROPIC",
        json={"api_key": "sk-test-1234567890abcdef", "base_url": "https://proxy.example/v1"},
    )
    assert saved.status_code == 400
    assert saved.json()["detail"] == "Anthropic no admite una URL base personalizada."

    credential = _save_key(client, "ANTHROPIC")
    updated = client.patch(
        "/llm-settings/ANTHROPIC/model",
        json={
            "model": "claude-haiku-4-5",
            "base_url": "https://proxy.example/v1",
            "expected_revision": credential["config_revision"],
        },
    )
    assert updated.status_code == 400
    assert updated.json()["detail"] == "Anthropic no admite una URL base personalizada."


def test_historical_anthropic_override_must_be_cleared_before_testing(client: TestClient, monkeypatch):
    from app.llm import factory

    credential = _save_key(client, "ANTHROPIC")
    draft = _save_draft(client, "ANTHROPIC", credential["config_revision"], "claude-haiku-4-5")
    db = SessionLocal()
    try:
        stored = db.query(LLMCredential).filter(LLMCredential.provider == LLMProviderName.ANTHROPIC).one()
        stored.base_url = "https://legacy-proxy.example/v1"
        db.commit()
    finally:
        db.close()

    monkeypatch.setattr(factory, "build_provider_from_credential", real_build_provider_from_credential)
    rejected = client.post(
        "/llm-settings/ANTHROPIC/test", json={"expected_revision": draft["config_revision"]}
    )
    assert rejected.status_code == 502
    assert rejected.json()["code"] == "LLM_UNSUPPORTED_CONFIGURATION"

    cleared = client.patch(
        "/llm-settings/ANTHROPIC/model",
        json={
            "model": "claude-haiku-4-5",
            "base_url": "",
            "expected_revision": draft["config_revision"],
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["base_url"] == ""

    monkeypatch.setattr(
        factory,
        "build_provider_from_credential",
        lambda saved_credential: _TestProvider(saved_credential.model, saved_credential.base_url),
    )
    verified = client.post(
        "/llm-settings/ANTHROPIC/test",
        json={"expected_revision": cleared.json()["config_revision"]},
    )
    assert verified.status_code == 200


def test_a_failed_new_url_is_tested_as_the_saved_draft_and_stays_inactive(
    client: TestClient, monkeypatch
):
    import socket

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))],
    )
    saved = client.put(
        "/llm-settings/OPENAI",
        json={"api_key": "sk-test-1234567890abcdef", "base_url": "https://working-proxy.example/v1"},
    ).json()
    working = _save_draft(client, "OPENAI", saved["config_revision"], "gpt-4o-mini")
    verified = _verify(client, "OPENAI", working["config_revision"])
    activated = client.post(
        "/llm-settings/OPENAI/activate",
        json={"expected_revision": verified["config_revision"]},
    )
    assert activated.status_code == 200

    draft = client.patch(
        "/llm-settings/OPENAI/model",
        json={
            "model": "gpt-4.1-mini",
            "base_url": "https://blocked-proxy.example/v1",
            "expected_revision": verified["config_revision"],
        },
    ).json()
    failed_test = client.post(
        "/llm-settings/OPENAI/test",
        json={"expected_revision": draft["config_revision"], "base_url": "https://working-proxy.example/v1"},
    )

    assert failed_test.status_code == 422  # The test endpoint cannot receive a separate URL.
    failed_test = client.post(
        "/llm-settings/OPENAI/test",
        json={"expected_revision": draft["config_revision"]},
    )
    assert failed_test.status_code == 502
    persisted = next(item for item in client.get("/llm-settings").json() if item["provider"] == "OPENAI")
    assert persisted["base_url"] == "https://blocked-proxy.example/v1"
    assert persisted["is_verified"] is False
    assert persisted["is_active"] is False


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


def test_revisioned_requests_reject_unknown_fields(client: TestClient):
    credential = _save_key(client, "NVIDIA")
    revision = credential["config_revision"]
    assert client.patch(
        "/llm-settings/NVIDIA/model",
        json={"model": "meta/llama-3.1-70b-instruct", "expected_revision": revision, "extra": True},
    ).status_code == 422
    assert client.post(
        "/llm-settings/NVIDIA/test",
        json={"expected_revision": revision, "model": "ignored"},
    ).status_code == 422
    assert client.post(
        "/llm-settings/NVIDIA/activate",
        json={"expected_revision": revision, "model": "ignored"},
    ).status_code == 422


def test_ollama_remains_keyless_but_requires_a_verified_installed_model(client: TestClient):
    credential = client.put("/llm-settings/OLLAMA", json={}).json()
    assert credential["masked_api_key"] == ""
    draft = _save_draft(client, "OLLAMA", credential["config_revision"], "qwen3.5:9b")
    verified = _verify(client, "OLLAMA", draft["config_revision"])
    assert verified["is_verified"] is True
