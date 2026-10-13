"""Contract tests for the native Google Gemini GenerateContent adapter."""

from __future__ import annotations

import importlib
import json

import httpx
import pytest
import respx

from app.core.config import LLMCallPolicy
from app.core.exceptions import LLMError
from app.llm.provider_registry import get_provider_definition
from app.models.llm_credential import LLMCredential, LLMProviderName

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL = "gemini-3.8-flash"
API_KEY = "AIza-test-key-not-a-real-credential"
GENERATE_URL = f"{BASE_URL}/models/{MODEL}:generateContent"


def _policy(*, attempts: int = 1, rate_limit_retries: int = 0) -> LLMCallPolicy:
    return LLMCallPolicy(
        connect_timeout_seconds=1.0,
        read_timeout_seconds=1.0,
        total_budget_seconds=2.0,
        max_attempts=attempts,
        max_rate_limit_retries=rate_limit_retries,
    )


def _definition():
    provider = getattr(LLMProviderName, "GEMINI", None)
    assert provider is not None, "Gemini must be a persisted provider before it can be built"
    return get_provider_definition(provider)


def _provider(
    *, api_key: str = API_KEY, model: str = MODEL, policy: LLMCallPolicy | None = None
):
    definition = _definition()
    provider_class = importlib.import_module("app.llm.gemini_provider").GeminiProvider
    selected_policy = policy or _policy()
    return provider_class(
        api_key=api_key,
        model=model,
        request_profile=definition.request_profile(model),
        generation_policy=selected_policy,
        test_policy=selected_policy,
    )


def _candidate(text: str, *, finish_reason: str = "STOP") -> dict:
    return {
        "candidates": [
            {
                "content": {"parts": [{"text": text}]},
                "finishReason": finish_reason,
            }
        ]
    }


@respx.mock
def test_gemini_posts_native_request_and_returns_only_final_text():
    route = respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "private thought summary", "thought": True},
                                {"text": "{\"ready\": true}", "thoughtSignature": "opaque"},
                            ]
                        },
                        "finishReason": "STOP",
                    }
                ]
            },
        )
    )
    provider = _provider()
    try:
        answer = provider.complete(
            kind="topic_analysis",
            system="Use JSON.",
            prompt="Analyze this topic.",
            max_tokens=123,
        )
    finally:
        provider.close()

    assert answer == '{"ready": true}'
    assert route.call_count == 1
    request = route.calls[0].request
    assert request.headers["x-goog-api-key"] == API_KEY
    assert "authorization" not in request.headers
    assert request.url.query == b""
    assert json.loads(request.content) == {
        "systemInstruction": {"parts": [{"text": "Use JSON."}]},
        "contents": [{"role": "user", "parts": [{"text": "Analyze this topic."}]}],
        "generationConfig": {
            "maxOutputTokens": 123,
            "responseMimeType": "application/json",
        },
    }


@respx.mock
def test_gemini_connection_test_uses_its_profile_smoke_budget():
    route = respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(200, json=_candidate("ok"))
    )
    provider = _provider()
    try:
        provider.test_connection()
    finally:
        provider.close()

    payload = json.loads(route.calls[0].request.content)
    assert payload["generationConfig"] == {"maxOutputTokens": 32}
    assert "responseMimeType" not in payload["generationConfig"]


@respx.mock
def test_gemini_keeps_valid_tuned_model_under_versioned_endpoint():
    model = "tunedModels/biology-v2"
    route = respx.post(
        f"{BASE_URL}/models/{model}:generateContent"
    ).mock(return_value=httpx.Response(200, json=_candidate("ok")))
    provider = _provider(model=model)
    try:
        answer = provider.complete(kind="test", system="system", prompt="ping")
    finally:
        provider.close()

    assert answer == "ok"
    assert route.call_count == 1
    assert route.calls[0].request.url.path == (
        "/v1beta/models/tunedModels/biology-v2:generateContent"
    )


@pytest.mark.parametrize(
    ("details", "message", "expected_code"),
    [
        (
            [
                {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    "reason": "API_KEY_INVALID",
                    "domain": "googleapis.com",
                }
            ],
            f"invalid key detail: {API_KEY}",
            "LLM_AUTHENTICATION_FAILED",
        ),
        (
            [
                {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    "reason": "INVALID_ARGUMENT",
                }
            ],
            "invalid request",
            "LLM_PROVIDER_ERROR",
        ),
        ([], f"API key not valid: {API_KEY}", "LLM_PROVIDER_ERROR"),
    ],
)
@respx.mock
def test_gemini_maps_only_structured_invalid_key_reason(details, message, expected_code):
    respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "status": "INVALID_ARGUMENT",
                    "message": message,
                    "details": details,
                }
            },
        )
    )
    provider = _provider()
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="test", system="system", prompt="ping", max_tokens=32)
    finally:
        provider.close()

    assert exc_info.value.code == expected_code
    assert exc_info.value.provider == "GEMINI"
    assert exc_info.value.upstream_status == 400
    assert API_KEY not in str(exc_info.value)
    assert exc_info.value.__context__ is None


@pytest.mark.parametrize(
    ("finish_reason", "expected_code"),
    [
        ("MAX_TOKENS", "LLM_OUTPUT_LIMIT"),
        ("SAFETY", "LLM_REFUSED"),
        ("RECITATION", "LLM_REFUSED"),
        ("OTHER", "LLM_INVALID_RESPONSE"),
    ],
)
@respx.mock
def test_gemini_classifies_finish_reasons_without_exposing_partial_text(
    finish_reason, expected_code
):
    partial_text = "partial-private-output"
    respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(
            200,
            json=_candidate(partial_text, finish_reason=finish_reason),
        )
    )
    provider = _provider()
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="session_content", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == expected_code
    assert partial_text not in str(exc_info.value)


@respx.mock
def test_gemini_prompt_block_without_candidates_is_a_safe_refusal():
    respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(
            200,
            json={"candidates": [], "promptFeedback": {"blockReason": "SAFETY"}},
        )
    )
    provider = _provider()
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="session_plan", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_REFUSED"
    assert exc_info.value.provider == "GEMINI"


@respx.mock
def test_gemini_retries_rate_limit_within_the_explicit_policy():
    route = respx.post(GENERATE_URL).mock(
        side_effect=[
            httpx.Response(
                429,
                headers={"retry-after": "0"},
                json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}},
            ),
            httpx.Response(200, json=_candidate("recovered")),
        ]
    )
    provider = _provider(policy=_policy(attempts=2, rate_limit_retries=1))
    try:
        answer = provider.complete(kind="session_plan", system="system", prompt="prompt")
    finally:
        provider.close()

    assert answer == "recovered"
    assert route.call_count == 2


@respx.mock
def test_gemini_rejects_malformed_success_body_as_invalid_response():
    respx.post(GENERATE_URL).mock(
        return_value=httpx.Response(200, content=b"not-json")
    )
    provider = _provider()
    try:
        with pytest.raises(LLMError) as exc_info:
            provider.complete(kind="session_content", system="system", prompt="prompt")
    finally:
        provider.close()

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"
    assert exc_info.value.provider == "GEMINI"
