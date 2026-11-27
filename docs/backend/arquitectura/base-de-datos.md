# Base de datos (SQLite MVP y Postgres/Supabase)

> **Leer antes de** añadir/cambiar un modelo o columna, escribir SQL crudo, o implementar un borrado.
> Reglas obligatorias resumidas: `.claude/rules/backend-datos.md`.

## Quién pone el esquema: `create_all` (self_hosted) o Alembic (saas)

`init_db()` (`app/db/init_db.py`, en el `lifespan`) depende de `DEPLOYMENT_MODE`:

- **self_hosted / demo (SQLite)**: `_create_schema()` = `Base.metadata.create_all()` + backfills
  aditivos a mano (`_ensure_*`, `_add_missing_columns`) para un `studyai.db` antiguo, porque `create_all`
  nunca altera tablas existentes. Sin pasos de migración: invariante del modo demo.
- **saas (Postgres)**: **no** hay `create_all` ni backfills. El esquema lo pone `alembic upgrade head`,
  que la imagen ejecuta antes de `uvicorn` (ver [operacion.md](../despliegue/operacion.md)).

En ambos modos el arranque sigue haciendo lo idempotente de datos: borra credenciales de proveedores
retirados (`RETIRED_PROVIDER_NAMES`: Zhipu GLM, Hugging Face, antes de cualquier lectura ORM porque el
enum ya no carga esas filas), siembra el usuario demo y los productos, sincroniza secuencias y activa RLS.

`app/db/base.py` importa **todos** los modelos (autogenerate y `create_all` dependen de ello): un modelo
nuevo se añade allí.

### Cambiar el esquema desde ahora (columna o tabla nueva)

Hay que hacer **las dos cosas** en el mismo cambio:

1. Migración Alembic (para saas). Con el Postgres de `docker-compose.dev.yml` levantado y vacío:
   ```bash
   cd backend
   export DATABASE_URL=postgresql+psycopg://studyai:studyai@localhost:5433/studyai
   alembic upgrade head
   alembic revision --autogenerate --rev-id 0002_<tema> -m "<tema>"
   ```
   Revisa el archivo en `app/db/migrations/versions/` a mano: `Enum(..., native_enum=False)` se queda
   como `VARCHAR` (un valor nuevo no necesita migración); un enum nativo que crece necesita
   `op.execute("ALTER TYPE ... ADD VALUE IF NOT EXISTS ...")`; columna `NOT NULL` en tabla con filas ⇒
   `server_default`. Comprueba con `alembic upgrade head && alembic check`.
2. Backfill aditivo en `_create_schema()` de `init_db.py` (solo para los SQLite existentes en self_hosted).

`tests/test_alembic_baseline.py` (Postgres) falla si las migraciones no coinciden con los modelos.
La línea base `0001_baseline` recoge el esquema completo; también crea la extensión `vector` si el
servidor la tiene (la tabla `document_chunks` la crea el propio `_PgVectorStore`, fuera de `Base.metadata`).

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
| Un plan | **nada** del ledger: `credit_ledger` es contable y sobrevive (enlace blando); un reembolso pendiente usa el id capturado por la tarea | `_refund_plan_use` |
| Una meta | **nada**: es soft delete (ver [generacion-planes/creacion-y-borrado.md](../generacion-planes/creacion-y-borrado.md)) | `GoalRepository` |

`llm_usage` no tiene FK a planes a propósito: sus filas sobreviven a un plan borrado.

**Compras (saas)**: `products` (sembrada por `init_db._seed_products` solo si está vacía; precios editables en
la base), `orders` (FK a `users` y `products`; `idempotency_key` y `gateway_payment_id` UNIQUE) y
`payment_events` (`event_id` UNIQUE, auditoría y deduplicación de webhooks). Las tres son tablas nuevas
(`create_all`), sin backfill. **Nunca se borran**: son contables, como `credit_ledger`; ningún borrado de
plan, meta o documento las toca. Enums como `VARCHAR` (`native_enum=False`). Detalle:
[../pagos/creditos-y-cobros.md](../pagos/creditos-y-cobros.md).

**Libro de Reclamaciones**: `complaints` (sin FK; tabla nueva, sin backfill). Código `R-{año}-{000001}`
con `year`/`number` y UNIQUE `(year, number)`: `ComplaintService` lee `max(number)+1` del año (en hora de
Lima, UTC−5) e inserta; si otra petición concurrente se lo lleva, el UNIQUE falla, hace rollback y reintenta
(hasta 5). Funciona igual en SQLite y Postgres, sin bloqueos ni SQL crudo. **Nunca se borra** (registro
legal); ningún borrado de usuario, plan o documento la toca.

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
