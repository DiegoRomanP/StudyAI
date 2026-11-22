"""OpenCode (``opencode run``) adapter: OpenCode Go/Zen, its free models, or any provider set up in OpenCode."""

from __future__ import annotations

import json
from collections.abc import Callable

from app.llm.error_mapping import invalid_response_error
from app.llm.harness.provider import HarnessAdapter, HarnessDefinition, json_lines
from app.llm.harness.runner import CliResult
from app.llm.ollama_client import OllamaModel
from app.llm.usage import LLMUsage, as_count
from app.models.llm_credential import LLMProviderName

# Project config in the throwaway working directory: the default agent keeps its
# prompt (OpenCode's free models refuse custom agents) but cannot run commands,
# touch files, browse or reach MCP servers, so a prompt injected through an
# uploaded document has nothing to act on. A blanket "*" rule is avoided on purpose:
# OpenCode rejected those requests on its free models while testing.
_DENIED_TOOLS = (
    "bash", "edit", "read", "glob", "grep", "list", "task", "webfetch", "websearch",
    "external_directory", "execute", "skill", "todowrite", "question",
)
_PROJECT_CONFIG = json.dumps({"permission": {tool: "deny" for tool in _DENIED_TOOLS}})


class OpenCodeAdapter(HarnessAdapter):
    provider = LLMProviderName.OPENCODE
    label = "OpenCode"
    binary_setting = "OPENCODE_BIN"

    def files(self, system: str) -> dict[str, str]:
        return {"opencode.json": _PROJECT_CONFIG}

    def argv(self, binary: str, model: str, system: str, images: list[str]) -> list[str]:
        # Never --auto: denied permissions must stay denied.
        attachments = [arg for name in images for arg in ("-f", name)]
        return [binary, "run", "--format", "json", "-m", model, "--archived", *attachments]

    def stdin(self, system: str, prompt: str, images: list[str]) -> str:
        # `opencode run` has no system-prompt flag.
        return f"{system}\n\n---\n\n{prompt}"

    def parse(self, result: CliResult, model: str) -> tuple[str, LLMUsage | None]:
        texts: list[str] = []
        input_tokens = output_tokens = cached = 0
        seen_usage = False
        for event in json_lines(result.stdout):
            kind = event.get("type")
            part = event.get("part") if isinstance(event.get("part"), dict) else {}
            if kind == "error":
                error = event.get("error") if isinstance(event.get("error"), dict) else {}
                status = error.get("status")
                message = f"{error.get('type', '')} {error.get('message', '')}"
                raise self.error(message, status if isinstance(status, int) else None)
            if kind == "step_start":
                texts = []  # keep only the final step's answer
            elif kind == "text" and isinstance(part.get("text"), str):
                texts.append(part["text"])
            elif kind == "step_finish" and isinstance(part.get("tokens"), dict):
                tokens = part["tokens"]
                cache = tokens.get("cache") if isinstance(tokens.get("cache"), dict) else {}
                input_tokens += as_count(tokens.get("input")) + as_count(cache.get("write")) + as_count(cache.get("read"))
                output_tokens += as_count(tokens.get("output")) + as_count(tokens.get("reasoning"))
                cached += as_count(cache.get("read"))
                seen_usage = True
        if result.returncode != 0 and not texts:
            raise self.error(result.stderr or result.stdout)
        if not texts and not result.stdout.strip():
            raise invalid_response_error(self.provider.value)
        usage = (
            LLMUsage(self.provider.value, model, input_tokens, output_tokens, cached) if seen_usage else None
        )
        return "".join(texts), usage

    def list_models(self, run: Callable[[list[str]], CliResult], binary: str) -> list[OllamaModel]:
        result = run([binary, "models"])
        if result.returncode != 0:
            raise self.error(result.stderr or result.stdout)
        ids = sorted({line.strip() for line in result.stdout.splitlines() if "/" in line and " " not in line.strip()})
        models = [
            OllamaModel(id=i, size_bytes=None, parameter_size=None, context_length=None, free=_is_free(i))
            for i in ids
        ]
        return sorted(models, key=lambda m: (not m.free, m.id))


def _is_free(model_id: str) -> bool:
    return model_id.startswith("opencode/") and model_id.endswith("-free")



definition = HarnessDefinition(OpenCodeAdapter())
