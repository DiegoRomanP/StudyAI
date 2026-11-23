# Crear y borrar planes y metas

> **Leer antes de** tocar `PlanService.create_plan`, `delete_plan`, `DELETE /goals/{id}` o
> `GoalRepository`.

## Crear un plan valida sus documentos en el servidor

`PlanService.create_plan` requires at least one `document_id` and that each one exists, belongs to the
caller and is `INDEXED` (`_require_indexed_documents`), otherwise 400 `PLAN_DOCUMENTS_UNAVAILABLE` with the
offending `document_ids` and no plan row. A foreign ID is reported exactly like a missing one (never
disclose other users' documents). The check runs *after* the idempotency lookup so a replay of an
already-accepted request still returns its plan. Without it, retrieval silently found nothing and a plan
reached READY with generic content. Gasta un uso de IA gratuita solo si el proveedor es bundled (ver
[../llm/resolucion-y-cuota-gratuita.md](../llm/resolucion-y-cuota-gratuita.md)). En `saas` cobra 1 crédito
(`plan:{id}:charge`; sin saldo 402 `INSUFFICIENT_CREDITS` y no queda fila), reanudar cuesta 0 y el reembolso
va por `charge_ledger_id`: ver [../pagos/creditos-y-cobros.md](../pagos/creditos-y-cobros.md).

## Borrar un plan

`DELETE /plans/{id}` (`PlanService.delete_plan`) must clean up `FlashcardReview` rows explicitly —
`FlashcardReview.question_id` points *at* a `QuizQuestion` but isn't a child of it in the ORM's
`cascade="all, delete-orphan"` chain (`Plan` → `Session` → `Quiz` → `QuizQuestion`), and the SQLite FK
cascade is inert (ver [../arquitectura/base-de-datos.md](../arquitectura/base-de-datos.md#sqlite)). The
explicit bulk `delete(FlashcardReview)` matches the plan's question ids via a `Session`/`Quiz`/`QuizQuestion`
join (it also covers review-session copies). It also deletes the plan's `assistant_messages`.

## Borrar una meta es soft delete y nunca toca sus planes

It sets `Goal.deleted_at`, so the goal leaves `GET /goals`, answers 404 and takes no new plans
(`GoalRepository.find_active_owned`), while its plans, sessions, practice, results and reviews stay.
Generation, resume and reinforcement keep reading the row via `db.get(Goal, plan.goal_id)`. **Never
hard-delete a goal row**: on Postgres the FK's `ondelete="CASCADE"` *does* fire and would erase the
learner's plans. A plan is removed only through `DELETE /plans/{id}`.
