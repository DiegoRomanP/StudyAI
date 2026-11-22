"""Claude Code (``claude -p``) adapter: the operator's Claude subscription from the terminal."""

from __future__ import annotations

import json
from collections.abc import Callable

from app.llm.error_mapping import invalid_response_error
from app.llm.harness.provider import HarnessAdapter, HarnessDefinition
from app.llm.harness.runner import CliResult
from app.llm.ollama_client import OllamaModel
from app.llm.providers.base import ModelOption
from app.llm.usage import LLMUsage, as_count
from app.models.llm_credential import LLMProviderName

# Claude Code has no model-listing command; these aliases always resolve to the latest model.
_ALIASES = ("sonnet", "opus", "haiku", "fable")


class ClaudeCodeAdapter(HarnessAdapter):
    provider = LLMProviderName.CLAUDE_CODE
    label = "Claude Code"
    binary_setting = "CLAUDE_CODE_BIN"
    # With an API key in the environment the CLI bills the API instead of the subscription.
    env_drop = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")

    def argv(self, binary: str, model: str, system: str, images: list[str]) -> list[str]:
        # Not --bare: it skips the keychain read that the subscription login needs.
        # Read (confined to the throwaway cwd) only when there is an image to look at.
        return [
            binary, "-p",
            "--output-format", "json",
            "--model", model,
            "--system-prompt", system,
            "--tools", "Read" if images else "",
            "--no-session-persistence",
            "--strict-mcp-config",
            "--setting-sources", "",
            "--disable-slash-commands",
        ]

    def stdin(self, system: str, prompt: str, images: list[str]) -> str:
        return _with_image_names(prompt, images)

    def parse(self, result: CliResult, model: str) -> tuple[str, LLMUsage | None]:
        try:
            data = json.loads(result.stdout)
        except ValueError:
            if result.returncode != 0:
                raise self.error(result.stderr or result.stdout) from None
            raise invalid_response_error(self.provider.value) from None
        if not isinstance(data, dict):
            raise invalid_response_error(self.provider.value)
        if data.get("is_error") or result.returncode != 0:
            status = data.get("api_error_status")
            raise self.error(str(data.get("result") or result.stderr), status if isinstance(status, int) else None)
        text = data.get("result")
        if not isinstance(text, str):
            raise invalid_response_error(self.provider.value)
        return text, _usage(data, model)

    def list_models(self, run: Callable[[list[str]], CliResult], binary: str) -> list[OllamaModel]:
        return [OllamaModel(id=alias, size_bytes=None, parameter_size=None, context_length=None) for alias in _ALIASES]


def _with_image_names(prompt: str, images: list[str]) -> str:
    if not images:
        return prompt
    return prompt + "\n\nImágenes adjuntas (léelas con Read): " + ", ".join(images)


def _usage(data: dict, model: str) -> LLMUsage | None:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return None
    model_usage = data.get("modelUsage")
    resolved = next(iter(model_usage), model) if isinstance(model_usage, dict) and model_usage else model
    return LLMUsage(
        provider=LLMProviderName.CLAUDE_CODE.value,
        model=str(resolved),
        input_tokens=as_count(usage.get("input_tokens"))
        + as_count(usage.get("cache_creation_input_tokens"))
        + as_count(usage.get("cache_read_input_tokens")),
        output_tokens=as_count(usage.get("output_tokens")),
        cached_input_tokens=as_count(usage.get("cache_read_input_tokens")),
    )


definition = HarnessDefinition(
    ClaudeCodeAdapter(),
    default_model="sonnet",
    common_models=tuple(ModelOption(alias) for alias in _ALIASES),
)
