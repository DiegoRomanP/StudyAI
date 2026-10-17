"""Single assembly point for independently owned LLM provider contracts."""

from __future__ import annotations

from app.llm.providers.anthropic import definition as anthropic
from app.llm.providers.base import ProviderDefinition, ProviderMeta
from app.llm.providers.glm import definition as glm
from app.llm.providers.gemini import definition as gemini
from app.llm.providers.huggingface import definition as huggingface
from app.llm.providers.nvidia import definition as nvidia
from app.llm.providers.openai import definition as openai
from app.llm.providers.ollama import definition as ollama
from app.llm.providers.openrouter import definition as openrouter
from app.models.llm_credential import LLMProviderName


def get_provider_definition(provider: LLMProviderName) -> ProviderDefinition:
    return PROVIDER_REGISTRY[provider]


PROVIDER_REGISTRY: dict[LLMProviderName, ProviderDefinition] = {
    definition.meta.provider: definition
    for definition in (
        anthropic,
        openai,
        glm,
        openrouter,
        nvidia,
        huggingface,
        ollama,
        gemini,
    )
}


def provider_catalog() -> dict[LLMProviderName, ProviderMeta]:
    """Return catalog metadata derived from the provider-owned definitions."""
    return {provider: definition.meta for provider, definition in PROVIDER_REGISTRY.items()}
