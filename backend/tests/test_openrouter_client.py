"""Tests for public OpenRouter free-model discovery."""

from __future__ import annotations

import httpx
import pytest
import respx

from app.core.exceptions import LLMError
from app.llm.openrouter_client import OpenRouterClient


BASE_URL = "https://openrouter.ai/api/v1"


@respx.mock
def test_lists_only_free_text_models():
    route = respx.get(f"{BASE_URL}/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "openrouter/free",
                        "name": "Free Router",
                        "context_length": 200000,
                        "architecture": {"output_modalities": ["text"]},
                        "pricing": {"prompt": "0", "completion": "0"},
                    },
                    {
                        "id": "vendor/text:free",
                        "name": "Free Text",
                        "context_length": None,
                        "architecture": {"output_modalities": ["text"]},
                        "pricing": {"prompt": "1", "completion": "1", "request": "1"},
                    },
                    {
                        "id": "vendor/image:free",
                        "architecture": {"output_modalities": ["image"]},
                        "pricing": {"prompt": "0", "completion": "0", "request": "0"},
                    },
                    {
                        "id": "vendor/paid",
                        "architecture": {"output_modalities": ["text"]},
                        "pricing": {"prompt": "0.001", "completion": "0", "request": "0"},
                    },
                ]
            },
        )
    )
    client = OpenRouterClient(base_url=BASE_URL, timeout=1)

    try:
        models = client.list_free_models()
    finally:
        client.close()

    assert [model.id for model in models] == ["openrouter/free", "vendor/text:free"]
    assert models[0].name == "Free Router"
    assert models[0].context_length == 200000
    request = route.calls.last.request
    assert request.url.params["output_modalities"] == "text"
    assert request.url.params["sort"] == "pricing-low-to-high"
    assert "Authorization" not in request.headers


@respx.mock
def test_rejects_invalid_model_catalog():
    respx.get(f"{BASE_URL}/models").mock(
        return_value=httpx.Response(200, json={"data": {}})
    )
    client = OpenRouterClient(base_url=BASE_URL, timeout=1)

    try:
        with pytest.raises(LLMError) as exc_info:
            client.list_free_models()
    finally:
        client.close()

    assert exc_info.value.code == "LLM_INVALID_RESPONSE"
    assert exc_info.value.provider == "OPENROUTER"
