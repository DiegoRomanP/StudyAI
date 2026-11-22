# Transporte LLM: presupuestos, reintentos, timeouts y errores visibles

> **Leer antes de** tocar `OpenAICompatibleProvider.complete`, `complete_within_budget`,
> `_Generator._llm_call`, `OUTPUT_BUDGETS` o el mensaje de error que ve el usuario.

## Presupuesto de salida y ritmo de peticiones

Every `_Generator._llm_call` passes an explicit `max_tokens` sized to what that call needs, from
`OUTPUT_BUDGETS` in `app/llm/output_budget.py` (2048 topic analysis, 1024 session planning, 4096 merged
session call — shared with the AI reinforcement —, 1024 `assistant_chat`, 512 `image_description`).
`complete_within_budget` retries **once** with double the budget (capped at 8192) only on
`LLM_OUTPUT_LIMIT`; `session_plan` never retries (it degrades to the deterministic layout instead), so
success stays `2 + N` and the worst case is `3 + 2N`.

`_llm_call` proactively sleeps `Settings.LLM_REQUEST_PACING_SECONDS` (default 2s) between successive calls
(and before that retry), skipped entirely when the provider's `requires_request_pacing` is false (the
mock, Ollama, agent CLIs — **keep this check**, or the whole test suite gets slow). Pacing is *proactive*;
it complements the *reactive* retry-on-429 below.

## 429 tiene su propio presupuesto de reintentos, separado de 5xx

`OpenAICompatibleProvider.complete` (`app/llm/openai_compatible_provider.py`). Quota/saldo errors are
classified before retrying and never wait. A temporary 429 honours numeric or HTTP-date `Retry-After`; it
falls back to `10 * attempt` seconds only when absent. **Never cap or shorten a provider-directed wait**:
if it cannot fit in the remaining per-call budget, return `LLM_RATE_LIMITED` with `retry_after_seconds`
and do not retry. Credential tests share a single transient retry across 429, 5xx and connection failures.
**429 is deliberately excluded from `_RETRYABLE_STATUS_CODES`** — don't add it back, or it would burn both
generation budgets. `asyncio.timeout_at` wraps the whole outbound operation, so the deadline covers
connection, write, full response read, waits and parsing.

## Timeout

`LLM_TIMEOUT_SECONDS` (`Settings`, default 180s) is threaded into `OpenAICompatibleProvider` via
`factory.build_provider_from_credential` — don't regress to a hardcoded value in the provider's
`__init__`. A trivial `test_connection()` uses its request-profile budget: 32 tokens for conventional
chat/Ollama and 256 for confirmed OpenAI o-series models. A real generation call (`max_tokens=4096`, full
prompt) on a large hosted model can legitimately take over a minute — a too-short timeout reads to the
user as "the key works but generation still fails".

## El usuario debe ver el error real

`PlanResponse` (`app/schemas/plan.py`) carries `error_message` (once only on `PlanStatusResponse`, which
the frontend doesn't call, so the FAILED view showed a bare "La generación falló."). Keep `error_message`
on `PlanResponse` and keep rendering it in `PlanDetailPage.tsx` — it's the only way a user can
self-diagnose *why* generation failed (bad key, retired model, rate limit…) without server logs. Both
responses also carry `progress_stage`/`progress_done`/`progress_total`.

## JSON del LLM

All LLM JSON responses go through `parse_llm_json` (`app/llm/output_parsers.py`), which strips markdown
fences and repairs common malformations before `json.loads`.
