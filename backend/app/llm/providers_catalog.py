"""Static metadata for every supported LLM provider.

Single source of truth for both the backend (building the right provider
instance) and the frontend (rendering the settings form) — the API exposes
this via ``GET /llm-settings/catalog`` so the two never drift apart.

``common_models`` are UI suggestions only, not a hard whitelist: any
``LLMCredential.model`` value is accepted and sent through verbatim, since
these providers' catalogs change faster than this file would ever be updated.
Each tuple is ordered free-tier-first, then cheapest-to-priciest, so the
settings UI's model dropdown naturally surfaces free options before paid ones.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.llm_credential import LLMProviderName


@dataclass(frozen=True)
class ModelOption:
    id: str
    free: bool = False


@dataclass(frozen=True)
class ProviderMeta:
    provider: LLMProviderName
    label: str
    # None for Anthropic: it uses the native SDK, not an OpenAI-compatible URL.
    default_base_url: str | None
    requires_model_selection: bool
    default_model: str
    common_models: tuple[ModelOption, ...] = field(default_factory=tuple)
    requires_api_key: bool = True
    supports_model_discovery: bool = False
    supports_custom_base_url: bool = False
    # UI hint only — each provider's keys have a distinctive prefix.
    key_placeholder: str = "sk-..."


PROVIDER_CATALOG: dict[LLMProviderName, ProviderMeta] = {
    LLMProviderName.ANTHROPIC: ProviderMeta(
        provider=LLMProviderName.ANTHROPIC,
        label="Anthropic (Claude)",
        default_base_url=None,
        requires_model_selection=True,
        # No free tier via the API; cheapest first as the closest proxy.
        default_model="claude-haiku-4-5",
        common_models=(
            ModelOption("claude-haiku-4-5"),
            ModelOption("claude-sonnet-5"),
            ModelOption("claude-opus-4-8"),
        ),
        supports_custom_base_url=False,
    ),
    LLMProviderName.OPENAI: ProviderMeta(
        provider=LLMProviderName.OPENAI,
        label="OpenAI (ChatGPT)",
        default_base_url="https://api.openai.com/v1",
        requires_model_selection=True,
        # No free tier via the API; cheapest first as the closest proxy.
        default_model="gpt-4o-mini",
        common_models=(
            ModelOption("gpt-4o-mini"),
            ModelOption("o4-mini"),
            ModelOption("gpt-4.1-mini"),
            ModelOption("gpt-4.1"),
            ModelOption("gpt-4o"),
        ),
        supports_custom_base_url=True,
    ),
    LLMProviderName.GLM: ProviderMeta(
        provider=LLMProviderName.GLM,
        label="Zhipu GLM",
        default_base_url="https://api.z.ai/api/paas/v4",
        requires_model_selection=True,
        default_model="glm-4-flash",  # Zhipu's free-tier model.
        common_models=(
            ModelOption("glm-4-flash", free=True),
            ModelOption("glm-4-air"),
            ModelOption("glm-4.5-air"),
            ModelOption("glm-4-plus"),
            ModelOption("glm-4.5"),
        ),
        supports_custom_base_url=True,
    ),
    LLMProviderName.OPENROUTER: ProviderMeta(
        provider=LLMProviderName.OPENROUTER,
        label="OpenRouter",
        default_base_url="https://openrouter.ai/api/v1",
        requires_model_selection=True,
        # OpenRouter marks free-tier models with a ":free" suffix.
        default_model="meta-llama/llama-3.3-70b-instruct:free",
        common_models=(
            ModelOption("meta-llama/llama-3.3-70b-instruct:free", free=True),
            ModelOption("deepseek/deepseek-chat:free", free=True),
            ModelOption("google/gemini-2.0-flash-exp:free", free=True),
            ModelOption("openai/gpt-4o-mini"),
            ModelOption("anthropic/claude-sonnet-4"),
        ),
        supports_custom_base_url=True,
    ),
    LLMProviderName.NVIDIA: ProviderMeta(
        provider=LLMProviderName.NVIDIA,
        label="NVIDIA NIM",
        default_base_url="https://integrate.api.nvidia.com/v1",
        requires_model_selection=True,
        # NVIDIA's developer/preview API key includes free rate-limited
        # credits across its catalog; smallest model first as a cost proxy.
        default_model="meta/llama-3.1-70b-instruct",
        common_models=(
            ModelOption("meta/llama-3.1-70b-instruct"),
            ModelOption("meta/llama-3.1-405b-instruct"),
            ModelOption("nvidia/llama-3.1-nemotron-70b-instruct"),
        ),
        key_placeholder="nvapi-...",
        supports_custom_base_url=True,
    ),
    LLMProviderName.HUGGINGFACE: ProviderMeta(
        provider=LLMProviderName.HUGGINGFACE,
        label="Hugging Face",
        # Inference Providers: HF's unified, OpenAI-compatible router in front
        # of 15+ hosting partners (Novita, Together, Fireworks, Cerebras,
        # DeepInfra, Zai, etc). A model id here can optionally be suffixed
        # with ":<provider>" (e.g. "openai/gpt-oss-120b:cerebras") to pin a
        # specific backend instead of HF's automatic routing.
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
    ),
    LLMProviderName.OLLAMA: ProviderMeta(
        provider=LLMProviderName.OLLAMA,
        label="Ollama local",
        default_base_url="http://127.0.0.1:11434",
        requires_model_selection=True,
        # Installed models are discovered from the local daemon, never guessed.
        default_model="",
        requires_api_key=False,
        supports_model_discovery=True,
        supports_custom_base_url=False,
        key_placeholder="No requiere clave",
    ),
}
