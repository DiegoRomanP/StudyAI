# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyAI: an AI-assisted study-planning app. Users upload documents (`.pdf`/`.md`), define a goal
(exam / learning / memorization), and the backend generates a study plan with spaced-repetition
sessions (SM-2 / Ebbinghaus), Pareto-prioritized topics, and quizzes — all via a multi-step LLM
pipeline. Monorepo: FastAPI backend + Vite/React frontend.

The most important design fact about this repo: **it runs fully "in demo mode" with zero API keys
and zero heavy dependencies**, and *transparently upgrades* to real Claude + semantic RAG when you
install the optional deps and set a key. Never break this property when touching `llm/`, `rag/`, or
`processors/` — always preserve the fallback path.

## Commands

### Backend (from `backend/`)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # core — runs the full MVP (mock LLM, hashing embedder, in-memory vector store)
pip install -r requirements-dev.txt      # pytest, httpx
pip install -r requirements-rag.txt      # optional: PyMuPDF, sentence-transformers, chromadb (pulls in torch)

cp .env.example .env
uvicorn main:app --reload --port 8001    # http://localhost:8001, Swagger at /docs
```

Tests:

```bash
python -m pytest -q                                    # full suite (86 tests)
python -m pytest tests/test_sm2.py -q                   # single file
python -m pytest tests/test_sm2.py::test_third_review_multiplies_by_ef -q   # single test
```

`tests/conftest.py` redirects `DATABASE_URL`/`CHROMA_PERSIST_DIR`/`UPLOAD_DIR` to a temp dir and
forces `ANTHROPIC_API_KEY=""` (mock LLM) *before* the app/config import — tests never touch real
data or spend tokens.

There is no `alembic upgrade` step in normal dev/test flow — see "Database" below.

### Frontend (from `frontend/`)

```bash
npm install
cp .env.example .env      # VITE_API_URL, defaults to http://localhost:8001
npm run dev               # http://localhost:5173
npm run lint              # tsc --noEmit (no separate linter configured)
npm run build             # tsc --noEmit && vite build
```

## Architecture

### Layering (backend)

Strict separation, enforced by directory: `api/v1/routes` (controllers) → `services` (orchestration)
→ `repositories` (data access, wraps SQLAlchemy `Session`) → `models` (ORM entities) / `schemas`
(Pydantic DTOs, `from_attributes=True`). Routes never touch the ORM directly — they go through a
repository or service. `BaseRepository` (`app/repositories/base.py`) gives every repo
`find_by_id`/`save`/`delete`/`list_all`; concrete repos add aggregate-specific queries.

All routes mount at the **root path** (`/documents`, `/goals`, ...), not under `/api/v1`, to match
`docs/api_contract.yaml` — despite living in `app/api/v1/routes/`.

### Design patterns in use (each is load-bearing, not decorative)

- **Factory** — `DocumentProcessorFactory` (`app/processors/factory.py`, ext → processor),
  `GoalStrategyFactory` (`app/strategies/goal_strategies.py`), `get_llm_provider(db, user_id)`
  (`app/llm/factory.py` — see "LLM provider settings" below for the full fallback chain).
- **Strategy** — `GoalStrategy` (Exam/Learning/Memorization) shapes the topic-weighting prompt and
  the per-session `SessionConfig` (duration, flashcard/MC mix).
- **Pipeline** — document ingestion: Validate → Parse (Factory) → Chunk → Embed → Store
  (`app/processors/pipeline.py`).
- **Repository** — see above.
- **Observer** — `EventBus` (`app/events/session_events.py`), singleton `event_bus`. Completing a
  session publishes `session.completed`; `ProgressService.register_handlers()` (wired in
  `main.py` lifespan) subscribes and updates SM-2 schedules. Handlers run synchronously in the
  caller's transaction and one handler's exception never breaks another's.
- **Dual-implementation-with-fallback** (the recurring theme of this codebase) — every
  RAG-adjacent component has a heavy "real" backend and a pure-Python fallback, chosen at
  `__init__`/call time via `try/except ImportError`, with **identical call-site interfaces**:
  - `Embedder`: sentence-transformers (384-d) vs. deterministic hashing embedder.
  - `VectorStore` (`app/rag/vector_store.py`): ChromaDB (persistent, cosine) vs. `_InMemoryStore`
    (JSON-persisted, pure-Python cosine).
  - `Chunker`: LangChain `RecursiveCharacterTextSplitter` vs. pure-Python splitter.
  - `PDFProcessor`: PyMuPDF, imported lazily so its absence doesn't break boot.
  - `LLMProvider` (`app/llm/base.py`): real providers (`AnthropicProvider`,
    `OpenAICompatibleProvider`) vs. `MockLLMProvider` (deterministic, schema-valid fake JSON per
    `kind`) — see "LLM provider settings" below for the full selection chain. Never crashes boot
    even on a bad key (falls back to mock with a logged warning).
  When adding a new capability here, follow the same shape: one interface, two backends, silent
  degrade with a log line — never a hard dependency on the optional package.

### The plan-generation pipeline (core business logic)

`PlanService.create_plan` creates a `Plan` row with `status=PROCESSING` and returns immediately;
`generate_plan_task` (a FastAPI `BackgroundTask`, entry point in `app/services/plan_service.py`)
does the real work in `_Generator.run`:

1. `Retriever.retrieve_texts` — RAG retrieval over the goal's documents (`top_k=8`, kept modest —
   see "request volume" below).
2. LLM call #1 (`topic_analysis`) — extract topics/subtopics/difficulty/relevance as JSON.
3. `select_top_by_relevance` (Pareto, `app/algorithms/pareto.py`) — keep the high-value slice of
   topics.
4. LLM call #2 (`plan_generation`) — distribute selected topics into sessions with
   `REVIEW_INTERVALS_DAYS` (Ebbinghaus) offsets; on any failure this degrades to a deterministic
   round-robin session layout rather than failing the whole plan.
5. Per session: **one merged LLM call** (`session_content`, `app/llm/prompts/session_content.py`)
   produces study material + YouTube *keywords* + flashcards + multiple choice together.

All LLM JSON responses go through `parse_llm_json` (`app/llm/output_parsers.py`), which strips
markdown fences and repairs common malformations before `json.loads`. Any step of `_generate` that
raises sets `Plan.status = FAILED` with the error message truncated to 1000 chars — the whole
pipeline never leaves a plan stuck in `PROCESSING`.

**Request volume is deliberately minimised — don't undo this.** A plan makes `2 + N` LLM calls (N =
session count), not `2 + 2N`: step 5 used to be two separate calls (`content_gen` then `quiz_gen`,
in now-deleted prompt modules) that got merged into `session_content` specifically because that
per-session multiplier is what exhausts a rate-limited free-tier provider's request budget fastest.
The merged prompt also asks for **exactly** `config.flashcards`/`config.multiple_choice` (from the
goal's `SessionConfig`) instead of a hardcoded "5 and 5" that then got truncated client-side —
that old behavior silently under-delivered for e.g. `MemorizationStrategy` (wants 8 flashcards,
only ever got 5). Every `_Generator._llm_call` also passes an explicit `max_tokens` sized to what
that specific call actually needs (1536 for topic analysis, 1024 for session planning, 2048 for
the merged session call) rather than a blanket 4096 — smaller prompts and smaller expected output
both make each request cheaper/faster to process on a capacity-constrained model. `_llm_call` also
proactively sleeps `Settings.LLM_REQUEST_PACING_SECONDS` (default 2s) between successive calls,
skipped entirely when `self.llm` is `MockLLMProvider` (checked via `isinstance` — keep this check if
you touch `_llm_call`, or the whole test suite gets slow). This pacing is *proactive* — it
complements, not replaces, `OpenAICompatibleProvider`'s *reactive* retry-on-429 described below.

Completing a session (`POST /sessions/{id}/complete`) publishes `session.completed` with
per-flashcard quality ratings (0–5); `ProgressService` applies `calculate_next_review` (SM-2,
`app/algorithms/sm2.py`) to update `FlashcardReview` rows.

**Deleting a plan (`DELETE /plans/{id}`, `PlanService.delete_plan`) must clean up `FlashcardReview`
rows explicitly** — `FlashcardReview.question_id` points *at* a `QuizQuestion` but isn't a child of
it in the ORM's `cascade="all, delete-orphan"` chain (`Plan` → `Session` → `Quiz` → `QuizQuestion`),
and this app's SQLite connection never issues `PRAGMA foreign_keys=ON`, so the model-level
`ondelete="CASCADE"` on that FK is inert. Without the explicit bulk `delete(FlashcardReview)` in
`delete_plan` (matched by the plan's question ids via a `Session`/`Quiz`/`QuizQuestion` join), a
deleted plan would leave orphaned reviews inflating the dashboard's upcoming-review counts forever.
**Deleting a goal (`DELETE /goals/{id}`) cascades to its plans** for the same underlying reason —
`Plan.goal_id` has no reverse ORM relationship on `Goal`, so the route loops
`PlanRepository.list_for_goal` and calls `PlanService.delete_plan` per plan (reusing the fix above)
before deleting the goal itself. Don't drop this loop even if it looks redundant with the FK's
`ondelete="CASCADE"` — that clause does nothing under this app's SQLite setup.

### LLM provider settings (bring-your-own-key)

Users configure their own API key per provider from the **⚙️ Configuración** page instead of only
via `.env`. `get_llm_provider(db, user_id)` (`app/llm/factory.py`) resolves a provider in priority
order — check this chain before assuming which LLM is actually being called:

1. The user's `LLMCredential` with `is_active=True` (`app/models/llm_credential.py`) — decrypted
   and built via `build_provider_from_credential()`.
2. The operator's `.env` `ANTHROPIC_API_KEY` (legacy path, unchanged, zero-migration for existing
   deployments).
3. `MockLLMProvider`.

Provider construction is cheap (an SDK/httpx client, no network I/O), so — unlike the old
`lru_cache`d singleton — it's rebuilt on every call; that's required now that credentials can
change at runtime. `PlanService._Generator` builds it in `run()` (after loading the `Plan`, so
`plan.user_id` is known), not in `__init__`.

**One class serves 5 of the 6 providers**: OpenAI, GLM (Zhipu), OpenRouter, NVIDIA NIM and Hugging
Face (Inference Providers' router, `https://router.huggingface.co/v1`) all speak the same
OpenAI-compatible `/chat/completions` shape, so `OpenAICompatibleProvider`
(`app/llm/openai_compatible_provider.py`, built on raw `httpx`, no `openai` SDK dependency) handles
all five — only `base_url`/`model`/key differ, sourced from `PROVIDER_CATALOG`
(`app/llm/providers_catalog.py`, the single source of truth for provider metadata, also served
verbatim to the frontend via `GET /llm-settings/catalog`). Only Anthropic gets its own class
(native SDK). Unlike the `.env` path (which splits Opus-for-plan / Haiku-for-quiz via
`AnthropicProvider._model_for`), a user-configured credential always uses **one fixed model for
every call kind** — simpler UX, deliberate product decision, not an oversight. Adding Hugging Face
required zero new provider code (only a `PROVIDER_CATALOG` entry + a new `LLMProviderName` member) —
that's the payoff of this pattern; keep new OpenAI-compatible providers on this same path rather
than writing a dedicated class.

**Hugging Face's catalog is a token, not the whole story**: `HF_TOKEN` (HF's own naming) is what the
user pastes as this provider's "API key" — same BYO-key flow as every other provider, no special
casing needed. Its `common_models` (`zai-org/GLM-5.2`, `deepseek-ai/DeepSeek-V4-Pro`,
`deepseek-ai/DeepSeek-V4-Flash`, `moonshotai/Kimi-K2.6`, `Qwen/Qwen3-235B-A22B-Instruct-2507`) are a
tiny, deliberately-ordered slice of an enormous Hub — HF hosts far more models than any inference
provider actually serves, so these are picks confirmed (as of mid-2026 research) to be live on
Inference Providers, not an exhaustive or permanent list; the free-text "Personalizado…" option is
how a user reaches anything else. A model id may optionally carry a `:<provider>` suffix (e.g.
`openai/gpt-oss-120b:cerebras`) to pin one specific backend instead of HF's automatic routing —
that's just part of the model string, `OpenAICompatibleProvider` doesn't need to know about it.

**Credential setup is revisioned and enforced backend-side**: `PUT /llm-settings/{p}` stores or
replaces only the key. `PATCH /llm-settings/{p}/model` persists a model/URL draft with its
`expected_revision`, invalidating prior evidence. `POST .../test` tests exactly that saved revision;
it never substitutes a catalog default model. `POST .../activate` accepts only evidence matching
the same revision and effective URL fingerprint. `LLMCredential.model` is a draft, not a verification
marker; use the derived `is_verified` response field. Replacing a key resets the model and evidence,
while changing a model or URL creates a new revision and deactivates it. `PROVIDER_CATALOG.common_models` is `ModelOption(id, free)` tuples
ordered free-tier first, then cheapest-to-priciest — preserve that order (`common_models[0].free`)
if you add or reorder entries. `ProviderMeta.key_placeholder` (default `"sk-..."`, overridden per
provider e.g. `"nvapi-..."` for NVIDIA, `"hf_..."` for Hugging Face) is UI-only — it's the input's
placeholder text in `SettingsPage.tsx`, not validated against.

**`base_url` is an SSRF surface**: it's a free-text override a user can set, and it ends up as the
`base_url` of a real outbound `httpx.Client`. `app/core/url_safety.py::assert_safe_outbound_url`
resolves the hostname and rejects private/loopback/link-local/reserved ranges (this covers the
cloud-metadata IP `169.254.169.254` too) — called both at save time
(`LLMSettingsService.upsert_credential`) and again right before use
(`factory.build_provider_from_credential`), since DNS can resolve differently between the two.
Never reintroduce a bare `startswith("http")` check in its place.

**Key security**: `app/core/security.py` encrypts `LLMCredential.encrypted_api_key` at rest with
Fernet keyed from `SECRET_KEY` (SHA-256 → urlsafe-base64) — change `SECRET_KEY` from the placeholder
before deploying for real. Decryption failure (e.g. `SECRET_KEY` rotated) raises
`SecretDecryptionError`, which `get_llm_provider` treats as "this tier doesn't work," not a crash.
`LLMCredentialResponse` (`app/schemas/llm_settings.py`) is built field-by-field, never
`from_attributes=True` on the raw ORM row — the encrypted column must never be reachable through
that shortcut. Only `key_preview` (computed once at write time via `mask_secret()`, never
re-derived from a live decrypt) ever leaves the server. Provider code only ever logs status
codes/truncated error bodies, never request payloads or the `Authorization` header.

**429s get their own generation retry budget, separate from 5xx** (`OpenAICompatibleProvider.complete`,
`app/llm/openai_compatible_provider.py`). Quota/saldo errors are classified before retrying and never
wait. A temporary 429 honours numeric or HTTP-date `Retry-After`; it falls back to `10 * attempt`
seconds only when absent. Never cap or shorten a provider-directed wait: if it cannot fit in the
remaining per-call budget, return `LLM_RATE_LIMITED` with `retry_after_seconds` and do not retry.
Credential tests share a single transient retry across 429, 5xx and connection failures. **429 is
deliberately excluded from `_RETRYABLE_STATUS_CODES`** — don't add it back, or it would burn both
generation budgets. `asyncio.timeout_at` wraps the whole outbound operation, so the deadline covers
connection, write, full response read, waits and parsing rather than only individual HTTPX phases.
Plan generation makes `2 + N` calls, where N is the number of sessions.

**`LLM_TIMEOUT_SECONDS` (`Settings`, default 180s) is threaded into `OpenAICompatibleProvider` via
`factory.build_provider_from_credential`** — don't let this regress to a hardcoded value in the
provider's own `__init__` default. A trivial `test_connection()` call uses its request-profile
budget: 32 tokens for conventional chat/Ollama and 256 for confirmed OpenAI o-series models. A
real generation call (`max_tokens=4096`, a full system+user prompt) on a large hosted model can
legitimately take well over a minute — a too-short timeout there reads to the user as "the key
works but generation still fails," which is indistinguishable from an actual provider outage
without a longer timeout to rule it out first.

**`PlanResponse` (`app/schemas/plan.py`) carries `error_message`** — `Plan.error_message` was, for a
while, only exposed via `PlanStatusResponse` (the polling endpoint nothing in the frontend actually
calls), so `PlanDetailPage`'s FAILED view rendered a bare "La generación falló." with the real cause
completely invisible to the user. Keep `error_message` on `PlanResponse` and keep rendering it
(`PlanDetailPage.tsx`) — it's the only way a user can self-diagnose *why* generation failed (bad
key, dead/retired model, rate limit, etc.) without reading server logs.

**Model changes never inherit verification evidence.** `update_model` stays a no-network draft
write so users can recover from unavailable NVIDIA or provider models, but it invalidates the prior
revision atomically. The UI then tests the saved draft and only enables activation after the server
returns matching evidence. Catalog entries remain suggestions, not an authorization guarantee.

### Config

`app/core/config.py` is the single place environment variables are read (Twelve-Factor); nothing
else should touch `os.environ` directly. `Settings` has safe defaults for every field so the app
boots with no `.env` at all. Note `CORS_ORIGINS` and `REVIEW_INTERVALS_DAYS` use `NoDecode` +
a `field_validator` to accept plain comma-separated strings — pydantic-settings would otherwise
try `json.loads()` on them first and crash on boot.

### Database

SQLAlchemy models + `init_db()` (`app/db/init_db.py`) call `Base.metadata.create_all()` at FastAPI
startup — there is no `alembic upgrade` step in the normal dev loop, even though Alembic is
configured (`alembic.ini`, `app/db/migrations/`) for when the schema stabilizes. Because
`create_all` never alters existing tables, `init_db.py` also hand-rolls additive column backfills
(see `_ensure_document_error_message_column`) for anyone with a pre-existing `studyai.db`. If you
add a column to an existing model, add a matching backfill here rather than relying on `create_all`.

Single-user MVP: `app/api/deps.py` seeds/returns a fixed demo user (`DEFAULT_USER_ID = 1`) instead
of real auth. This dependency boundary exists specifically so real auth can be dropped in later
without touching route handlers — don't thread a different auth mechanism through routes/services
ad hoc.

### Frontend

Vite + React 18 + TypeScript + Tailwind + TanStack Query + React Router + Axios. `apiClient`
(`src/api/client.ts`) is the single Axios instance (`VITE_API_URL`, default
`http://localhost:8001`). Pages under `src/pages/` map 1:1 to the routes in `App.tsx`
(`/documents`, `/goals`, `/plan`, `/plan/:planId`, `/session/:sessionId`, `/dashboard`,
`/settings`). `PlanPage` polls plan generation status via TanStack Query `refetchInterval` since
generation is async on the backend. `SettingsPage` renders one card per `PROVIDER_CATALOG` entry
(fetched from the backend, not hardcoded) so the provider list/model suggestions never drift from
`app/llm/providers_catalog.py`.

**Security-relevant, don't regress**: YouTube resource links are always built as a *search URL*
from LLM-provided keywords (`src/lib/youtube.ts`) — an LLM-generated URL is never rendered directly.

**List pagination**: `useShowMore` (`src/hooks/useShowMore.ts`) caps `DocumentsPage`/`GoalsPage`/
`PlanPage`'s "Tus ..." lists at 6 items with a "Mostrar N más" button, client-side (it slices an
already-fetched array — there's no backend page/limit param). Reuse this hook for any new list
section rather than inventing another truncation scheme.

### Reference docs

- `docs/api_contract.yaml` — OpenAPI contract; keep in sync with actual route signatures.
- `docs/AGENTS_STATUS.md` — phase-by-phase build status. Note its header: this project was built
  as one coherent monorepo rather than the 5-agent/branch choreography in
  `studyai_multiagent_plan.md`; the latter is a historical planning document, not the current
  workflow — layering and design patterns from it were kept, the multi-branch process was not.
