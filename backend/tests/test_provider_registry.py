"""Provider contracts must remain independently owned and fully registered."""

import pytest

from app.core.exceptions import ValidationError
from app.llm.nvidia_provider import NvidiaNimProvider
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.llm.openrouter_provider import OpenRouterProvider
from app.llm.provider_registry import PROVIDER_REGISTRY, get_provider_definition, provider_catalog
from app.models.llm_credential import LLMCredential, LLMProviderName


def test_registry_covers_every_persisted_provider_name():
    assert set(PROVIDER_REGISTRY) == set(LLMProviderName)
    assert all(definition.meta.provider == provider for provider, definition in PROVIDER_REGISTRY.items())


def test_catalog_is_derived_from_provider_owned_metadata():
    catalog = provider_catalog()

    assert catalog[LLMProviderName.NVIDIA].allows_custom_model is False
    assert catalog[LLMProviderName.OLLAMA].supports_model_discovery is True
    assert catalog[LLMProviderName.OPENAI].supports_custom_base_url is True


def test_each_provider_resolves_its_own_request_contract():
    assert (
        get_provider_definition(LLMProviderName.OPENAI)
        .request_profile("o4-mini")
        .token_limit_parameter
        == "max_completion_tokens"
    )
    assert (
        get_provider_definition(LLMProviderName.OLLAMA)
        .request_profile("qwen3.5:9b")
        .requires_usage
        is False
    )
    assert (
        get_provider_definition(LLMProviderName.NVIDIA)
        .request_profile("nvidia/nemotron-3-super-120b-a12b")
        .identifier
        == "nvidia-standard-chat"
    )


def test_nvidia_contract_rejects_models_outside_its_own_registry():
    definition = get_provider_definition(LLMProviderName.NVIDIA)

    with pytest.raises(ValidationError):
        definition.validate_model("nvidia/embedding-model")


def test_fixed_endpoint_provider_never_derives_its_runtime_url_from_a_draft():
    credential = LLMCredential(
        user_id=1,
        provider=LLMProviderName.NVIDIA,
        encrypted_api_key="unused",
        base_url="https://untrusted.example/v1",
    )

    assert (
        get_provider_definition(LLMProviderName.NVIDIA).effective_base_url(credential)
        == "https://integrate.api.nvidia.com/v1"
    )


def test_vendor_adapters_compose_instead_of_inheriting_generic_transport():
    assert not issubclass(NvidiaNimProvider, OpenAICompatibleProvider)
    assert not issubclass(OpenRouterProvider, OpenAICompatibleProvider)


def test_gemini_owns_a_native_fixed_endpoint_contract():
    provider = getattr(LLMProviderName, "GEMINI", None)
    assert provider is not None
    definition = get_provider_definition(provider)
    meta = definition.meta

    assert meta.default_base_url == "https://generativelanguage.googleapis.com/v1beta"
    assert meta.default_model == "gemini-3.8-flash"
    assert [model.id for model in meta.common_models] == ["gemini-3.8-flash"]
    assert meta.requires_api_key is True
    assert meta.supports_custom_base_url is False
    assert meta.supports_model_discovery is False
    assert meta.allows_custom_model is True

    profile = definition.request_profile(meta.default_model)
    assert profile.identifier == "gemini-generate-content"
    assert profile.token_limit_parameter == "maxOutputTokens"
    assert profile.requires_usage is False
    assert profile.json_response_kinds == frozenset(
        {"topic_analysis", "session_plan", "session_content"}
    )
    assert profile.payload_parameters("topic_analysis", 80) == {
        "maxOutputTokens": 80,
        "response_format": {"type": "json_object"},
    }
    definition.validate_model("tunedModels/biology-v2")

    credential = LLMCredential(
        user_id=1,
        provider=provider,
        encrypted_api_key="encrypted-test-key",
        model=meta.default_model,
        base_url="https://attacker.example/v1",
    )
    assert definition.effective_base_url(credential) == meta.default_base_url
    with pytest.raises(ValidationError):
        definition.validate_base_url("https://attacker.example/v1")


def test_existing_openai_profile_payload_shapes_remain_unchanged():
    definition = get_provider_definition(LLMProviderName.OPENAI)

    standard = definition.request_profile("gpt-4o-mini")
    assert standard.payload_parameters("quiz", 91) == {"max_tokens": 91}

    reasoning = definition.request_profile("o4-mini")
    assert reasoning.payload_parameters("quiz", 91) == {"max_completion_tokens": 91}
