"""Tests for local Ollama model discovery without a running daemon."""

import httpx
import pytest
import respx

from app.core.exceptions import LLMError
from app.llm.ollama_client import OllamaClient


BASE_URL = "http://127.0.0.1:11434"


@respx.mock
def test_discovers_only_installed_local_models():
    respx.get(f"{BASE_URL}/api/tags").mock(
        return_value=httpx.Response(
            200,
            json={
                "models": [
                    {"name": "qwen3.5:9b", "size": 10, "details": {"parameter_size": "9.7B", "context_length": 262144}},
                    {"name": "gpt-oss:120b-cloud", "remote_host": "https://ollama.com"},
                    {"name": "kimi:cloud"},
                ]
            },
        )
    )
    models = OllamaClient(base_url=BASE_URL, timeout=1).list_local_models()
    assert [model.id for model in models] == ["qwen3.5:9b"]
    assert models[0].parameter_size == "9.7B"
    assert models[0].context_length == 262144


@respx.mock
def test_unavailable_daemon_raises_a_clear_error():
    respx.get(f"{BASE_URL}/api/tags").mock(return_value=httpx.Response(503))
    with pytest.raises(LLMError, match="No se pudo consultar Ollama"):
        OllamaClient(base_url=BASE_URL, timeout=1).list_local_models()
