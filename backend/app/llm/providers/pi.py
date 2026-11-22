"""Pi coding agent (``pi -p``) adapter: whatever providers and logins the operator set up in Pi."""

from __future__ import annotations

import re
from collections.abc import Callable

from app.llm.error_mapping import invalid_response_error
from app.llm.harness.provider import HarnessAdapter, HarnessDefinition, json_lines
from app.llm.harness.runner import CliResult
from app.llm.ollama_client import OllamaModel
from app.llm.usage import LLMUsage, as_count
from app.models.llm_credential import LLMProviderName

_SIZE = re.compile(r"^(\d+(?:\.\d+)?)([KM]?)$")


class PiAdapter(HarnessAdapter):
    provider = LLMProviderName.PI
    label = "Pi"
    binary_setting = "PI_BIN"

    def argv(self, binary: str, model: str, system: str, images: list[str]) -> list[str]:
        return [
            binary, "-p", "--mode", "json",
            "--model", model,
            "--system-prompt", system,
            "--thinking", "off",
            "--no-session", "--no-tools", "--no-extensions", "--no-skills",
            "--no-context-files", "--no-mcp", "--no-prompt-templates", "--offline",
            *(f"@{name}" for name in images),
        ]

    def parse(self, result: CliResult, model: str) -> tuple[str, LLMUsage | None]:
        message = None
        for event in json_lines(result.stdout):
            candidate = event.get("message")
            if event.get("type") == "message_end" and isinstance(candidate, dict) and candidate.get("role") == "assistant":
                message = candidate
        if message is None:
            if result.returncode != 0:
                raise self.error(result.stderr or result.stdout)
            raise invalid_response_error(self.provider.value)
        if message.get("stopReason") == "error":
            raise self.error(str(message.get("errorMessage") or result.stderr))
        content = message.get("content") if isinstance(message.get("content"), list) else []
        text = "".join(
            block["text"] for block in content
            if isinstance(block, dict) and block.get("type") == "text" and isinstance(block.get("text"), str)
        )
        usage = message.get("usage")
        return text, (
            LLMUsage(
                self.provider.value,
                str(message.get("model") or model),
                as_count(usage.get("input")) + as_count(usage.get("cacheWrite")) + as_count(usage.get("cacheRead")),
                as_count(usage.get("output")),
                as_count(usage.get("cacheRead")),
            )
            if isinstance(usage, dict)
            else None
        )

    def list_models(self, run: Callable[[list[str]], CliResult], binary: str) -> list[OllamaModel]:
        result = run([binary, "--list-models", "--offline"])
        if result.returncode != 0:
            raise self.error(result.stderr or result.stdout)
        models: dict[str, OllamaModel] = {}
        for line in result.stdout.splitlines()[1:]:  # first row is the table header
            columns = line.split()
            if len(columns) < 3:
                continue
            model_id = f"{columns[0]}/{columns[1]}"
            models[model_id] = OllamaModel(
                id=model_id, size_bytes=None, parameter_size=None, context_length=_tokens(columns[2])
            )
        return sorted(models.values(), key=lambda m: m.id)


def _tokens(value: str) -> int | None:
    match = _SIZE.match(value)
    if not match:
        return None
    return int(float(match.group(1)) * {"": 1, "K": 1_000, "M": 1_000_000}[match.group(2)])


definition = HarnessDefinition(PiAdapter())
