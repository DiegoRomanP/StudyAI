# Pipeline de generación de planes (lógica de negocio central)

> **Leer antes de** tocar `app/services/plan_service.py`, `app/llm/prompts/`, `app/algorithms/` o
> cualquier cosa que cambie el número de llamadas LLM de un plan.

## Pasos

`PlanService.create_plan` creates a `Plan` row with `status=PROCESSING` and returns immediately;
`generate_plan_task` (a FastAPI `BackgroundTask`, entry point in `app/services/plan_service.py`) does the
real work in `_Generator.run`:

1. `Retriever.retrieve_texts` — RAG retrieval over the goal's documents (`top_k=8`, kept modest).
2. LLM call #1 (`topic_analysis`) — extract topics/subtopics/difficulty/relevance as JSON.
3. `select_top_by_relevance` (Pareto, `app/algorithms/pareto.py`) — keep the high-value slice of topics.
4. LLM call #2 (`session_plan`) — distribute selected topics into sessions with `REVIEW_INTERVALS_DAYS`
   (Ebbinghaus) offsets; on any failure this degrades to a deterministic round-robin layout rather than
   failing the whole plan.
5. Per session: **one merged LLM call** (`session_content`, `app/llm/prompts/session_content.py`) produces
   study material + YouTube *keywords* + flashcards + multiple choice together.

Completing a session (`POST /sessions/{id}/complete`) publishes `session.completed` with per-flashcard
quality ratings (0–5); `ProgressService` applies `calculate_next_review` (SM-2, `app/algorithms/sm2.py`) to
update `FlashcardReview` rows. Ruta adaptativa: [../estudio/ruta-adaptativa-y-refuerzo.md](../estudio/ruta-adaptativa-y-refuerzo.md).

## Volumen de peticiones minimizado a propósito — no lo deshagas

A plan makes **`2 + N`** LLM calls (N = session count), not `2 + 2N`: step 5 used to be two calls
(`content_gen` then `quiz_gen`) merged into `session_content` because that per-session multiplier is what
exhausts a rate-limited free-tier provider's budget fastest. The merged prompt asks for **exactly**
`config.flashcards`/`config.multiple_choice` (from the goal's `SessionConfig`) instead of a hardcoded
"5 and 5" truncated client-side (that silently under-delivered for `MemorizationStrategy`, which wants 8
flashcards). Presupuestos, reintento y ritmo: [../llm/transporte-y-errores.md](../llm/transporte-y-errores.md).

## Generación reanudable, con commit tras cada paso

`_Generator._generate` works out what is missing from the stored rows (no topics → analyse; none selected
→ select; missing sessions → plan them, matched by `topic_id`/normalized name; sessions without material →
generate them), so the same code runs a new plan and `POST /plans/{id}/resume` (`PlanService.resume_plan`:
FAILED → PROCESSING by conditional UPDATE, 409 `PLAN_NOT_RESUMABLE` otherwise, a double POST starts one
task). Each step writes `Plan.progress_stage` (`TOPICS`/`SESSIONS`/`CONTENT`) and
`progress_done`/`progress_total` (sessions with material / sessions) through an UPDATE guarded by
`status='PROCESSING'`; rowcount 0 means the plan was deleted and the task stops (`_PlanGone`) without
leaving orphan rows. On any error the generator rolls back first, then sets `FAILED` with the message
truncated to 1000 chars, keeping everything already committed. That rollback + guarded UPDATE + startup
recovery is why the pipeline never leaves a plan stuck in `PROCESSING`. A `BackgroundTask` dies with the
process (`--reload`, crash), so the `lifespan` runs `recover_interrupted_plans` (PROCESSING → FAILED,
resumable, free use refunded) and `recover_interrupted_reinforcements` (PROCESSING → FAILED, no refund) at
startup. Asume un solo proceso (ver [../arquitectura/base-de-datos.md](../arquitectura/base-de-datos.md#un-solo-proceso)).

**Patrón reutilizable**: las máquinas de estado de trabajos en segundo plano (plan, refuerzo) usan UPDATE
condicional para las transiciones (doble POST = una tarea), UPDATE guardado por estado para el progreso y
recuperación en el `lifespan`. Un trabajo nuevo en segundo plano debe seguir el mismo patrón.
