# Ruta adaptativa (modo foco) y refuerzo con IA

> **Leer antes de** tocar `AdaptiveRouteService`, `app/algorithms/adaptive_route.py`,
> `reinforcement_service.py`, `QuizService.submit` o el evento `session.completed`.
> Lado frontend (orden de la ruta, «Siempre con IA»): [../../frontend/funcionalidades/sesion-y-test.md](../../frontend/funcionalidades/sesion-y-test.md).

An exam adjusts the plan. `session.completed` carries `quiz_result_id` and `first_completion`;
`AdaptiveRouteService` (`app/services/adaptive_route_service.py`, registered in the `lifespan`) acts only on a
*first* graded completion — retakes and `POST /sessions/{id}/complete` never move the route. The maths is
the pure `app/algorithms/adaptive_route.py` (mastery = moving average, Leitner box over
`REVIEW_INTERVALS_DAYS`); mastery/box live on `PlanTopic` so they die with the plan cascade.

- **No LLM in the route.** Submitting an exam makes 0 calls and creates at most one pending `REVIEW`
  session per topic with **only the missed items** (wrong multiple choice / objective item, or a flashcard
  rated under 4 — `REVIEW_PASS_QUALITY`, stricter than SM-2's lapse at 3), options shuffled by a seed.
  Nothing missed → no review (mastery and box still update; SM-2 still spaces each card). A v2 review left
  with only flashcards scores them as recalled (≥ 4) / rated. Plan generation stays `2 + N` calls; an AI
  reinforcement is exactly 1 call, only when the learner asks.
- `EventBus` de-duplicates handlers and runs each in a SAVEPOINT: a failing handler never loses the
  `QuizResult` or leaves a half-built review. `register_handlers()` may run many times in tests.
- Review questions are copies keyed by `source_question_id`: SM-2 uses `source_question_id or id`, so a card
  keeps one schedule. `delete_plan` already clears reviews by every question id of the plan.
- "Hoy" is UTC in the backend and local in the browser (±1 day near midnight, accepted).

## Refuerzo con IA

`POST /sessions/{id}/reinforcement`, `.../cancel`; `app/services/reinforcement_service.py`: state machine
`NONE → PROCESSING → READY|FAILED` via conditional UPDATEs, so a double POST starts one task and spends one
use. Cuota gratuita: ver [../llm/resolucion-y-cuota-gratuita.md](../llm/resolucion-y-cuota-gratuita.md)
(**only the background task refunds**). Same `session_content` kind and output budget as plan generation, so
model routing and the runtime report are unchanged. A reinforcement left PROCESSING by a restart is set to
FAILED at startup (no refund). V2: ver [../generacion-planes/contenido-adaptativo-v2.md](../generacion-planes/contenido-adaptativo-v2.md).

`QuizService.submit` answers 409 `QUIZ_OUTDATED` if an answer names a question the quiz no longer has (a
reinforcement replaced it); the UI reloads the quiz and keeps the answers that still apply.
