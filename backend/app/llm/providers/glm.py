"""Zhipu GLM provider contract."""

from __future__ import annotations

from app.llm.providers.base import ModelOption, ProviderMeta
from app.llm.providers.openai_compatible import StandardChatDefinition
from app.models.llm_credential import LLMProviderName


class GlmDefinition(StandardChatDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.GLM,
        label="Zhipu GLM",
        default_base_url="https://api.z.ai/api/paas/v4",
        requires_model_selection=True,
        default_model="glm-4-flash",
        common_models=(
            ModelOption("glm-4-flash", free=True),
            ModelOption("glm-4-air"),
            ModelOption("glm-4.5-air"),
            ModelOption("glm-4-plus"),
            ModelOption("glm-4.5"),
        ),
        supports_custom_base_url=True,
    )


definition = GlmDefinition()
