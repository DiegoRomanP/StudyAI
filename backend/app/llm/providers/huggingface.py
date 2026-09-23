"""Hugging Face Inference Providers contract."""

from __future__ import annotations

from app.llm.providers.base import ModelOption, ProviderMeta
from app.llm.providers.openai_compatible import StandardChatDefinition
from app.models.llm_credential import LLMProviderName


class HuggingFaceDefinition(StandardChatDefinition):
    meta = ProviderMeta(
        provider=LLMProviderName.HUGGINGFACE,
        label="Hugging Face",
        default_base_url="https://router.huggingface.co/v1",
        requires_model_selection=True,
        default_model="zai-org/GLM-5.2",
        common_models=(
            ModelOption("zai-org/GLM-5.2"),
            ModelOption("deepseek-ai/DeepSeek-V4-Pro"),
            ModelOption("deepseek-ai/DeepSeek-V4-Flash"),
            ModelOption("moonshotai/Kimi-K2.6"),
            ModelOption("Qwen/Qwen3-235B-A22B-Instruct-2507"),
        ),
        key_placeholder="hf_...",
        supports_custom_base_url=True,
    )


definition = HuggingFaceDefinition()
