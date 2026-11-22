# Uso de tokens y coste

> **Leer antes de** añadir un proveedor (debe reportar uso) o una llamada LLM nueva (debe registrarse).

Every provider reports the tokens of each response through `LLMProvider._record_usage` / `drain_usage()`
(`app/llm/usage.py`; the delegating providers drain their inner one). Usage is recorded as soon as the
response arrives, *before* validation, because a `LLM_OUTPUT_LIMIT` call is still billed.
`complete_within_budget(..., recorder=)` hands each attempt to `UsageRecorder`
(`app/services/usage_recorder.py`), which writes `llm_usage` rows in its **own** session with an immediate
commit (the generator's rollback would erase them) and never raises. Cost comes from
`Settings.LLM_PRICES_USD_PER_MTOK` (empty = tokens only, `cost_usd` NULL). `llm_usage` has no FK to plans:
rows outlive a deleted plan, and SQLite may reuse a plan id. `python scripts/usage_report.py` prints cost
per plan and per reinforcement. NVIDIA's async (202) result path does not report usage yet. Agent CLIs
record tokens when reported; cost stays NULL.
