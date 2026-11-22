"""Codex CLI (``codex exec``) adapter: the operator's ChatGPT subscription from the terminal."""

from __future__ import annotations

import json
from collections.abc import Callable

from app.llm.error_mapping import invalid_response_error
from app.llm.harness.provider import HarnessAdapter, HarnessDefinition, json_lines
from app.llm.harness.runner import CliResult
from app.llm.ollama_client import OllamaModel
from app.llm.usage import LLMUsage, as_count
from app.models.llm_credential import LLMProviderName


class CodexAdapter(HarnessAdapter):
    provider = LLMProviderName.CODEX
    label = "Codex"
    binary_setting = "CODEX_BIN"
    # With an API key in the environment Codex bills the API instead of the subscription.
    env_drop = ("OPENAI_API_KEY", "CODEX_API_KEY")

    def argv(self, binary: str, model: str, system: str, images: list[str]) -> list[str]:
        # --ignore-user-config drops the operator's MCP servers and default model;
        # read-only sandbox: no writes, no network. Login still comes from CODEX_HOME.
        return [
            binary, "exec", "--json", "--skip-git-repo-check", "--ephemeral",
            "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
            # -i is variadic: keep it before -m so it cannot swallow the stdin marker.
            *[arg for name in images for arg in ("-i", name)], "-m", model, "-",
        ]

    def stdin(self, system: str, prompt: str, images: list[str]) -> str:
        # `codex exec` has no system-prompt flag.
        return f"{system}\n\n---\n\n{prompt}"

    def parse(self, result: CliResult, model: str) -> tuple[str, LLMUsage | None]:
        text = None
        usage = None
        failure = None
        for event in json_lines(result.stdout):
            kind = event.get("type")
            item = event.get("item") if isinstance(event.get("item"), dict) else {}
            if kind == "item.completed" and item.get("type") == "agent_message" and isinstance(item.get("text"), str):
                text = item["text"]
            elif kind == "turn.completed" and isinstance(event.get("usage"), dict):
                raw = event["usage"]
                cached = as_count(raw.get("cached_input_tokens"))
                usage = LLMUsage(
                    self.provider.value, model,
                    as_count(raw.get("input_tokens")),  # already includes the cached part
                    as_count(raw.get("output_tokens")) + as_count(raw.get("reasoning_output_tokens")),
                    cached,
                )
            elif kind == "turn.failed":
                error = event.get("error") if isinstance(event.get("error"), dict) else {}
                failure = str(error.get("message") or "")
            elif kind == "error" and failure is None:
                failure = str(event.get("message") or "")
        if failure is not None and text is None:
            raise self.error(failure, _status(failure))
        if text is None:
            if result.returncode != 0:
                raise self.error(result.stderr or result.stdout)
            raise invalid_response_error(self.provider.value)
        return text, usage

    def list_models(self, run: Callable[[list[str]], CliResult], binary: str) -> list[OllamaModel]:
        result = run([binary, "debug", "models"])
        if result.returncode != 0:
            raise self.error(result.stderr or result.stdout)
        try:
            catalog = json.loads(result.stdout)
        except ValueError:
            raise invalid_response_error(self.provider.value) from None
        entries = catalog.get("models") if isinstance(catalog, dict) else None
        return [
            OllamaModel(id=entry["slug"], size_bytes=None, parameter_size=None, context_length=None)
            for entry in entries or []
            if isinstance(entry, dict) and isinstance(entry.get("slug"), str) and entry.get("visibility") == "list"
        ]


def _status(message: str) -> int | None:
    # Codex nests the upstream error as a JSON string inside the message.
    try:
        data = json.loads(message)
    except ValueError:
        return None
    status = data.get("status") if isinstance(data, dict) else None
    return status if isinstance(status, int) else None


definition = HarnessDefinition(CodexAdapter())
