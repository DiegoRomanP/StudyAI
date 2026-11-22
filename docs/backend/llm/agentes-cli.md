# Agentes CLI de terminal (Claude Code, OpenCode, Pi, Codex)

> **Leer antes de** tocar `app/llm/harness/` o `app/llm/providers/{claude_code,opencode,pi,codex}.py`.
> Los flags de aislamiento son la defensa contra instrucciones inyectadas en PDFs: no los relajes.

In `self_hosted`, four extra providers (`CLAUDE_CODE`, `OPENCODE`, `PI`, `CODEX`) run the operator's own
agent CLI as a child process, so generation uses their **subscription** (Claude Pro/Max, ChatGPT, OpenCode
Go) or the tool's free models instead of a paid API key. One port, one adapter per tool:
`app/llm/harness/provider.py` (`HarnessAdapter`, `CliHarnessProvider`, `HarnessDefinition`) owns spawning,
isolation, timeouts and error mapping; `app/llm/providers/{claude_code,opencode,pi,codex}.py` only build the
argv, the files of the throwaway working directory, and parse that CLI's JSON output. They go through the
normal credential flow without a key (save → model → test → activate), like Ollama.

- **Isolation, don't loosen it**: argv list (never a shell), prompt on stdin, a fresh temp cwd per call,
  process group killed on `HARNESS_TIMEOUT_SECONDS`. No tools: Claude `--tools ""` (only `Read`, confined to
  the cwd, when an image is attached), Pi `--no-tools …`, Codex `--ignore-user-config --sandbox read-only`
  (drops the operator's MCP servers), OpenCode a project `opencode.json` in the cwd denying each tool by name
  (bash, edit, read, execute — which exposes MCP —, …). OpenCode rejected a blanket `"*": "deny"` and custom
  agents on its free models while testing, hence the named list and the default agent. **Never pass `--auto`.**
- **Claude without `--bare`**: it skips the keychain read the subscription login needs. `env_drop` removes
  `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` from the child env so the CLI bills the subscription, not the API.
- `max_tokens` is ignored (CLIs take no output limit); `requires_request_pacing` is False; usage is recorded
  when the CLI reports tokens, cost stays NULL. Model IDs must match `_MODEL_ID` (no leading `-`).
- Model discovery (`GET /llm-settings/{p}/models`, cached 60 s): Claude aliases, `opencode models` (free
  `opencode/*-free` first), `pi --list-models`, `codex debug models` (visibility `list`). Pi lists its whole
  catalog, not only logged-in providers: the credential test is what proves a model works.
- They have `supports_images` and `rich_content` (figuras y estímulos SVG, ver
  [../documentos/ingesta-y-figuras.md](../documentos/ingesta-y-figuras.md)).
- **Self-hosted only**: personal subscriptions must not serve other users. In `saas` the catalog omits them
  and `build_provider`/`complete`/`list_models` raise `LLM_UNSUPPORTED_CONFIGURATION`.
- Tests never run a real CLI (`conftest.py` patches `run_cli`; pass a fake runner).
