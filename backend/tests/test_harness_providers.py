"""Agent CLI adapters (Claude Code, OpenCode, Pi, Codex) behind the LLMProvider port.

Outputs are trimmed copies of real CLI runs; no test ever launches a CLI.
"""

import json
import subprocess
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.exceptions import LLMError, ValidationError
from app.llm.harness.provider import CliHarnessProvider
from app.llm.harness.runner import CliResult, run_cli
from app.llm.provider_registry import get_provider_definition
from app.models.llm_credential import LLMCredential, LLMProviderName as P


class FakeRunner:
    def __init__(self, result=None, *, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def __call__(self, argv, *, stdin, timeout, env, cwd):
        self.calls.append({
            "argv": argv, "stdin": stdin, "timeout": timeout, "env": env,
            "files": {p.name: p.read_text() for p in Path(cwd).iterdir()},
        })
        if self.error:
            raise self.error
        return self.result


def provider_for(name, model, runner):
    definition = get_provider_definition(name)
    return CliHarnessProvider(
        definition.adapter, model=model, binary=definition.binary,
        timeout=600, test_timeout=60, runner=runner,
    )


CLAUDE_OK = json.dumps({
    "type": "result", "subtype": "success", "is_error": False, "result": '{"ok": true}',
    "usage": {"input_tokens": 2, "cache_creation_input_tokens": 634, "cache_read_input_tokens": 10, "output_tokens": 4},
    "modelUsage": {"claude-haiku-5-5": {"inputTokens": 2}},
})
OPENCODE_OK = "\n".join(json.dumps(e) for e in (
    {"type": "step_start", "part": {"type": "step-start"}},
    {"type": "text", "part": {"type": "text", "text": "thinking about tools"}},
    {"type": "step_finish", "part": {"tokens": {"input": 10, "output": 2, "reasoning": 1, "cache": {"read": 5}}}},
    {"type": "step_start", "part": {"type": "step-start"}},
    {"type": "text", "part": {"type": "text", "text": "ok"}},
    {"type": "step_finish", "part": {"tokens": {"input": 7, "output": 3, "reasoning": 0, "cache": {"read": 512}}}},
))
PI_OK = "\n".join(json.dumps(e) for e in (
    {"type": "session", "version": 3},
    {"type": "message_end", "message": {"role": "user", "content": [{"type": "text", "text": "ping"}]}},
    {"type": "message_end", "message": {
        "role": "assistant", "content": [{"type": "text", "text": "ok"}], "model": "claude-opus-5-5",
        "usage": {"input": 117, "output": 4, "cacheRead": 3, "cacheWrite": 0}, "stopReason": "stop",
    }},
))
CODEX_OK = "\n".join(json.dumps(e) for e in (
    {"type": "thread.started"},
    {"type": "item.completed", "item": {"type": "error", "message": "Model metadata not found."}},
    {"type": "item.completed", "item": {"type": "agent_message", "text": "ok"}},
    {"type": "turn.completed", "usage": {"input_tokens": 16579, "cached_input_tokens": 9600, "output_tokens": 5}},
))


@pytest.mark.parametrize(
    ("name", "model", "stdout", "tokens"),
    [
        (P.CLAUDE_CODE, "haiku", CLAUDE_OK, (646, 4, 10)),
        (P.OPENCODE, "opencode/hy4-flash-free", OPENCODE_OK, (534, 6, 517)),
        (P.PI, "anthropic/claude-opus-5-5", PI_OK, (120, 4, 3)),
        (P.CODEX, "gpt-5.6-luna", CODEX_OK, (16579, 5, 9600)),
    ],
)
def test_each_adapter_reads_the_reply_and_usage(name, model, stdout, tokens):
    provider = provider_for(name, model, FakeRunner(CliResult(0, stdout, "")))

    text = provider.complete(kind="topic_analysis", system="sys", prompt="ping")

    assert text in ('{"ok": true}', "ok")
    (usage,) = provider.drain_usage()
    assert (usage.input_tokens, usage.output_tokens, usage.cached_input_tokens) == tokens


def test_claude_code_runs_without_tools_session_or_api_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-not-be-billed")
    runner = FakeRunner(CliResult(0, CLAUDE_OK, ""))

    provider_for(P.CLAUDE_CODE, "sonnet", runner).complete(kind="session_content", system="SYS", prompt="USER")

    call = runner.calls[0]
    argv = call["argv"]
    assert argv[:2] == ["claude", "-p"]
    assert argv[argv.index("--tools") + 1] == ""
    assert argv[argv.index("--model") + 1] == "sonnet"
    assert argv[argv.index("--system-prompt") + 1] == "SYS"
    assert {"--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands"} <= set(argv)
    assert "--bare" not in argv  # would skip the keychain and break the subscription login
    assert "USER" not in argv and call["stdin"] == "USER"
    assert "ANTHROPIC_API_KEY" not in call["env"]


def test_opencode_denies_every_tool_through_its_project_config():
    runner = FakeRunner(CliResult(0, OPENCODE_OK, ""))

    provider_for(P.OPENCODE, "opencode/big-pickle", runner).complete(kind="test", system="SYS", prompt="USER")

    call = runner.calls[0]
    permissions = json.loads(call["files"]["opencode.json"])["permission"]
    assert {"bash", "edit", "read", "webfetch", "execute"} <= {k for k, v in permissions.items() if v == "deny"}
    assert "--auto" not in call["argv"]
    assert call["stdin"].startswith("SYS") and call["stdin"].endswith("USER")
    assert call["timeout"] == 60  # kind="test" uses the short budget


def test_pi_and_codex_disable_tools_and_user_config(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-should-not-be-billed")
    pi = FakeRunner(CliResult(0, PI_OK, ""))
    codex = FakeRunner(CliResult(0, CODEX_OK, ""))

    provider_for(P.PI, "anthropic/claude-opus-5-5", pi).complete(kind="x", system="S", prompt="U")
    provider_for(P.CODEX, "gpt-5.6-luna", codex).complete(kind="x", system="S", prompt="U")

    assert {"--no-tools", "--no-session", "--no-extensions", "--no-mcp", "--no-context-files"} <= set(pi.calls[0]["argv"])
    codex_argv = codex.calls[0]["argv"]
    assert {"--ignore-user-config", "--ephemeral"} <= set(codex_argv)
    assert codex_argv[codex_argv.index("--sandbox") + 1] == "read-only"
    assert "OPENAI_API_KEY" not in codex.calls[0]["env"]


@pytest.mark.parametrize(
    ("name", "result", "code"),
    [
        (P.CLAUDE_CODE, CliResult(1, json.dumps({
            "is_error": True, "api_error_status": 404,
            "result": "There's an issue with the selected model (x). It may not exist.",
        }), ""), "LLM_MODEL_UNAVAILABLE"),
        (P.CLAUDE_CODE, CliResult(1, json.dumps({
            "is_error": True, "result": "Not logged in · Please run /login",
        }), ""), "LLM_AUTHENTICATION_FAILED"),
        (P.OPENCODE, CliResult(1, json.dumps({"type": "error", "error": {
            "type": "provider.free-limit", "message": "Free usage limit reached.", "status": 429,
        }}), ""), "LLM_QUOTA_EXHAUSTED"),
        (P.OPENCODE, CliResult(1, json.dumps({"type": "error", "error": {
            "type": "provider.no-route", "message": "Model unavailable: opencode/x",
        }}), ""), "LLM_MODEL_UNAVAILABLE"),
        (P.PI, CliResult(1, 'Error: Model "x/y" not found. Use --list-models.', ""), "LLM_MODEL_UNAVAILABLE"),
        (P.CODEX, CliResult(1, json.dumps({"type": "turn.failed", "error": {
            "message": "The 'x' model is not supported when using Codex with a ChatGPT account.",
        }}), ""), "LLM_MODEL_UNAVAILABLE"),
        (P.CODEX, CliResult(1, "", "garbled"), "LLM_PROVIDER_ERROR"),
    ],
)
def test_cli_failures_map_to_public_error_codes(name, result, code):
    with pytest.raises(LLMError) as exc:
        provider_for(name, "m", FakeRunner(result)).complete(kind="x", system="s", prompt="p")
    assert exc.value.code == code
    assert "There's an issue" not in str(exc.value)  # raw CLI text never reaches the user


def test_missing_binary_and_timeout_are_classified():
    with pytest.raises(LLMError) as missing:
        provider_for(P.PI, "m", FakeRunner(error=FileNotFoundError("pi"))).complete(kind="x", system="s", prompt="p")
    with pytest.raises(LLMError) as slow:
        provider_for(P.PI, "m", FakeRunner(error=subprocess.TimeoutExpired("pi", 1))).complete(
            kind="x", system="s", prompt="p"
        )
    assert missing.value.code == "LLM_PROVIDER_UNAVAILABLE"
    assert slow.value.code == "LLM_TIMEOUT"


def test_a_binary_that_cannot_run_is_a_provider_error_not_a_crash():
    with pytest.raises(LLMError) as exc:
        provider_for(P.CODEX, "m", FakeRunner(error=PermissionError(13, "Permission denied"))).complete(
            kind="x", system="s", prompt="p"
        )
    assert exc.value.code == "LLM_PROVIDER_UNAVAILABLE"


def test_empty_reply_is_invalid():
    with pytest.raises(LLMError) as exc:
        provider_for(P.CODEX, "m", FakeRunner(CliResult(0, CODEX_OK.replace('"ok"', '"  "'), ""))).complete(
            kind="x", system="s", prompt="p"
        )
    assert exc.value.code == "LLM_INVALID_RESPONSE"


def test_harnesses_refuse_to_run_in_saas(monkeypatch):
    monkeypatch.setattr(get_settings(), "DEPLOYMENT_MODE", "saas")
    definition = get_provider_definition(P.CLAUDE_CODE)
    runner = FakeRunner(CliResult(0, CLAUDE_OK, ""))

    with pytest.raises(LLMError):
        definition.build_provider(LLMCredential(provider=P.CLAUDE_CODE, base_url=""), api_key="", model="sonnet")
    with pytest.raises(LLMError):
        provider_for(P.CLAUDE_CODE, "sonnet", runner).complete(kind="x", system="s", prompt="p")
    with pytest.raises(LLMError):
        definition.list_models(runner)
    assert runner.calls == []


@pytest.mark.parametrize("model", ["sonnet", "opencode/big-pickle", "groq/meta-llama/llama-4", "anthropic/claude:high"])
def test_model_ids_accepted(model):
    get_provider_definition(P.OPENCODE).validate_model(model)


@pytest.mark.parametrize("model", ["", "--help", "-m", "a b", "x;rm -rf /", "a" * 200])
def test_model_ids_that_could_be_read_as_flags_are_rejected(model):
    with pytest.raises(ValidationError):
        get_provider_definition(P.PI).validate_model(model)


def test_harnesses_reject_any_base_url():
    with pytest.raises(ValidationError):
        get_provider_definition(P.CODEX).validate_base_url("http://evil.example")


def test_opencode_discovery_lists_free_models_first():
    definition = get_provider_definition(P.OPENCODE)
    definition._cache = None
    runner = FakeRunner(CliResult(0, "openai/gpt-x\nopencode/big-pickle\nopencode/beam-free\nINFO starting server\n", ""))

    models = definition.list_models(runner)

    assert [(m.id, m.free) for m in models] == [
        ("opencode/beam-free", True), ("openai/gpt-x", False), ("opencode/big-pickle", False),
    ]
    assert runner.calls[0]["argv"] == ["opencode", "models"]
    assert definition.list_models(FakeRunner(error=AssertionError("cached"))) == models
    definition._cache = None


def test_pi_discovery_parses_its_model_table():
    definition = get_provider_definition(P.PI)
    definition._cache = None
    table = (
        "provider      model               context  max-out  thinking  images\n"
        "anthropic     claude-haiku-5-5    1M       128K     yes       yes\n"
        "openai        gpt-x               200K     64K      yes       no\n"
    )
    models = definition.list_models(FakeRunner(CliResult(0, table, "")))
    definition._cache = None

    assert [(m.id, m.context_length) for m in models] == [
        ("anthropic/claude-haiku-5-5", 1_000_000), ("openai/gpt-x", 200_000),
    ]


def test_codex_discovery_keeps_only_listed_models():
    definition = get_provider_definition(P.CODEX)
    definition._cache = None
    catalog = {"models": [
        {"slug": "gpt-reserve", "visibility": "hide"},
        {"slug": "gpt-5.6-luna", "visibility": "list"},
    ]}
    models = definition.list_models(FakeRunner(CliResult(0, json.dumps(catalog), "")))
    definition._cache = None

    assert [m.id for m in models] == ["gpt-5.6-luna"]


def test_runner_kills_a_cli_that_outlives_its_timeout(tmp_path):
    with pytest.raises(subprocess.TimeoutExpired):
        run_cli(["sleep", "5"], stdin="", timeout=0.2, env={"PATH": "/usr/bin:/bin"}, cwd=str(tmp_path))


def test_runner_timeout_does_not_wait_for_a_detached_helper_holding_the_pipes(tmp_path):
    import shutil
    import time

    if shutil.which("setsid") is None:
        pytest.skip("setsid not available")
    started = time.monotonic()
    with pytest.raises(subprocess.TimeoutExpired):
        # setsid escapes our process group, like OpenCode's background service, and inherits stdout.
        run_cli(
            ["sh", "-c", "setsid sleep 20 & sleep 20"], stdin="", timeout=0.2,
            env={"PATH": "/usr/bin:/bin"}, cwd=str(tmp_path),
        )
    assert time.monotonic() - started < 10


def test_runner_passes_the_prompt_on_stdin(tmp_path):
    result = run_cli(["cat"], stdin="hola", timeout=5, env={"PATH": "/usr/bin:/bin"}, cwd=str(tmp_path))
    assert (result.returncode, result.stdout) == (0, "hola")
