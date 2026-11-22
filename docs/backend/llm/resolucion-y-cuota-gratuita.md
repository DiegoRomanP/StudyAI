# Qué LLM se llama: cadena de resolución e IA gratuita

> **Leer antes de** asumir qué proveedor atiende una llamada, tocar `app/llm/factory.py`,
> `app/llm/default_free_provider.py`, `app/services/free_ai_quota.py`, o añadir una funcionalidad que
> llame al LLM (debe gastar y devolver la cuota gratuita igual que las existentes).

## Cadena de resolución (bring-your-own-key)

Users configure their own API key per provider from **⚙️ Configuración** instead of only via `.env`.
`get_llm_provider(db, user_id)` (`app/llm/factory.py`) resolves a provider in priority order:

1. The user's `LLMCredential` with `is_active=True` (`app/models/llm_credential.py`) — decrypted and built
   via `build_provider_from_credential()`.
2. The operator's `.env` `ANTHROPIC_API_KEY` (legacy path, zero-migration for existing deployments).
3. The included free-tier AI (`app/llm/default_free_provider.py`): DeepSeek via `DEEPSEEK_API_KEY`
   (`DEFAULT_DEEPSEEK_MODEL`, default `deepseek-flash`, thinking disabled through its request profile).
   NVIDIA NIM and Gemini are no longer free tiers (they remain as bring-your-own-key providers). The chain
   shape is kept with a single tier: one whose server key stops working (out of quota — DeepSeek's 402
   "saldo" —, rejected key, model gone) is skipped for a cooldown (in-process, `reset_cooldowns()` for
   tests) and then it raises `LLM_QUOTA_EXHAUSTED` ("conecta tu propia IA"), **never silently falls to the
   mock**. A temporary failure (timeout, 429, connection, 5xx) never benches the tier: it concerns one
   call, so its real error is reported to that learner and everyone else keeps the free AI.
4. `MockLLMProvider`.

In `saas` mode the chain is different — ver [../arquitectura/configuracion-y-despliegue.md](../arquitectura/configuracion-y-despliegue.md).

`resolve_llm_provider()` es la única resolución compartida por la generación y `GET /llm-settings/runtime`.
El endpoint devuelve solo `source` (`USER`, `ENV`, `MOCK` o `UNAVAILABLE`), `bundled` (IA gratuita
incluida del servidor), proveedor, modelos por tipo de llamada, `free_ai` (`limit`/`used`/`remaining`,
null cuando el servidor no tiene claves gratuitas o hay clave Anthropic en `.env`) y un motivo de fallback
saneado; no prueba conectividad ni expone/descifra claves hacia el navegador.

Provider construction is cheap (an SDK/httpx client, no network I/O), so it's rebuilt on every call;
that's required because credentials can change at runtime. `PlanService._Generator` builds it in `run()`
(after loading the `Plan`, so `plan.user_id` is known), not in `__init__`.

## Cuota diaria de la IA gratuita (patrón compartido: gastar → devolver una vez)

Contada por usuario y día UTC en `free_ai_usage` (`app/services/free_ai_quota.py`). Solo cuenta cuando
el proveedor resuelto es **bundled**; la clave propia, Ollama, los agentes CLI y el mock nunca cuentan.

| Uso | Límite | Se gasta en | Se devuelve | Error si no quedan |
|---|---|---|---|---|
| Generar un plan | `FREE_AI_DAILY_LIMIT` (3) | `PlanService.create_plan` (sin fila de plan si falla) | `_Generator` si la generación falla | 429 `FREE_AI_DAILY_LIMIT` |
| Reanudar un plan | mismo contador | `resume_plan` (429 deja el plan FAILED con su mensaje) | igual que generar | 429 `FREE_AI_DAILY_LIMIT` |
| Refuerzo con IA | mismo contador | `POST /sessions/{id}/reinforcement` | **solo la tarea en segundo plano** (fallo, cancelación o plan borrado); cancelar por sí solo no | 429 `FREE_AI_DAILY_LIMIT` |
| Asistente | `FREE_AI_ASSISTANT_DAILY_LIMIT` (20), columna `assistant_uses` | cada mensaje | si la llamada falla | 429 `FREE_AI_ASSISTANT_LIMIT` |

- Las repeticiones idempotentes no gastan otro uso.
- La devolución usa el día UTC guardado (`Plan.free_ai_use_date`) y lo limpia: se devuelve **exactamente
  una vez**, el día en que se gastó, aunque cruce medianoche o haya un reinicio.
- La recuperación al arrancar devuelve el uso de un plan interrumpido, **no** el de un refuerzo.
- **Una funcionalidad nueva que llame al LLM debe seguir esta tabla** (gastar solo si bundled, devolver
  una sola vez en fallo, código 429 propio) y añadir aquí su fila.
