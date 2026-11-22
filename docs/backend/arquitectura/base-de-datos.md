# Base de datos (SQLite MVP y Postgres/Supabase)

> **Leer antes de** añadir/cambiar un modelo o columna, escribir SQL crudo, o implementar un borrado.
> Reglas obligatorias resumidas: `.claude/rules/backend-datos.md`.

## Esquema sin `alembic upgrade`

SQLAlchemy models + `init_db()` (`app/db/init_db.py`) call `Base.metadata.create_all()` at FastAPI
startup — there is no `alembic upgrade` step in the normal dev loop, even though Alembic is configured
(`alembic.ini`, `app/db/migrations/`) for when the schema stabilizes. Because `create_all` never alters
existing tables, `init_db.py` also hand-rolls additive column backfills (see
`_ensure_document_error_message_column`) for anyone with a pre-existing `studyai.db`. If you add a column
to an existing model, add a matching backfill here rather than relying on `create_all` (the plan progress
columns and `free_ai_use_date` come from `_ensure_plan_generation_columns`).

`init_db` also deletes leftover credentials of retired providers (`RETIRED_PROVIDER_NAMES`: Zhipu GLM,
Hugging Face) before any ORM read, since the enum can no longer load those rows.

## SQLite

`app/db/session.py` opens SQLite in WAL mode with a 30 s `busy_timeout`, so the 3 s polling and other
writes don't fail with "database is locked" while a generation commits; expect `studyai.db-wal`/`-shm`
next to the database (git-ignored).

**`PRAGMA foreign_keys` stays off on purpose.** Consecuencia: **todo `ondelete="CASCADE"` del modelo es
inerte en SQLite**. Cualquier fila que no sea hija en una cadena ORM `cascade="all, delete-orphan"` se
borra **explícitamente** en el servicio. Casos actuales (mantenlos al tocar borrados):

| Al borrar | Se borra explícitamente | Dónde |
|---|---|---|
| Un plan | `FlashcardReview` por los ids de pregunta del plan (join `Session`/`Quiz`/`QuizQuestion`) — si no, reseñas huérfanas inflan para siempre los repasos pendientes del dashboard | `PlanService.delete_plan` |
| Un plan | `assistant_messages` (sin FK a plan ni sesión) | `PlanService.delete_plan` |
| Un documento | filas `DocumentAsset` y la carpeta `UPLOAD_DIR/assets/{id}` | `delete_document` |
| Una meta | **nada**: es soft delete (ver [generacion-planes/creacion-y-borrado.md](../generacion-planes/creacion-y-borrado.md)) | `GoalRepository` |

`llm_usage` no tiene FK a planes a propósito: sus filas sobreviven a un plan borrado.

## Postgres (SaaS / Supabase)

Runs the same code: `pip install -r requirements-saas.txt` (psycopg 3) and
`DATABASE_URL=postgresql+psycopg://...` (the `+psycopg` driver is required). The suite runs against it with
`docker compose -f docker-compose.dev.yml up -d db` and
`TEST_DATABASE_URL=postgresql+psycopg://studyai:studyai@localhost:5433/studyai python -m pytest -q`
(`conftest.py` drops and recreates the `public` schema first). **Keep both engines green.** Differences:

- Postgres enforces `VARCHAR(n)`: truncate user/LLM text before saving (document filename, plan title).
- Its FK cascades *do* fire — por eso nunca se borra físicamente una meta.
- Raw SQL must use `TRUE`/`FALSE` for booleans (never `0`/`1`).
- Rows inserted with an explicit id don't advance the sequence — `init_db` ends with `sync_id_sequences()`.

## Un solo proceso

La recuperación al arrancar (`recover_interrupted_plans`, `recover_interrupted_reinforcements`) **asume un
único proceso backend**: con varios workers, uno que arranca fallaría las generaciones vivas de los otros.
