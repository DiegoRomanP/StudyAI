# StudyAI

## Repository

- This is a monorepo with a FastAPI backend in `backend/` and a Vite/React client in `frontend/`.
- There is no root package manager setup; run backend and frontend commands from their own directories.
- The backend entrypoint is `backend/main.py`; it exposes `app` and starts database initialization during FastAPI lifespan.
- Routes live in `backend/app/api/v1/routes/` but are mounted at root paths such as `/documents` and `/plans`, not under `/api/v1`.
- Read `CLAUDE.md` for longer notes, but prefer current code, tests, and executable configuration when prose conflicts.

## Commands

Backend commands run from `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
# Optional, after the core dependencies: pip install -r requirements-rag.txt
cp .env.example .env
uvicorn main:app --reload --port 8001
```

- Run the full backend suite with `python -m pytest -q`.
- Run one file with `python -m pytest tests/test_sm2.py -q`.
- Run one test with `python -m pytest tests/test_sm2.py::test_third_review_multiplies_by_ef -q`.
- `tests/conftest.py` overrides `DATABASE_URL`, `CHROMA_PERSIST_DIR`, `UPLOAD_DIR`, and `ANTHROPIC_API_KEY` with temporary/mock values before application imports.
- `TestClient` executes FastAPI background tasks before the test continues, which integration tests rely on.

Frontend commands run from `frontend/`:

```bash
npm ci
npm run dev
npm run lint
npm run build
```

- `npm run lint` is TypeScript checking (`tsc --noEmit`), not ESLint.
- `npm run build` typechecks before running Vite; there is no frontend test script.
- The Vite dev server uses port `5173`; the frontend API client defaults to backend port `8001`.
- There is no repository CI, pre-commit setup, backend formatter, backend linter, or backend typecheck configuration.

## Architecture

- Keep the backend boundary as routes/controllers -> services -> repositories -> SQLAlchemy models and Pydantic schemas; routes should not add ORM access directly.
- Document ingestion is a background task: validate -> parse -> chunk -> embed -> vector store, using a separate database session.
- Plan generation is a background task: retrieve -> topic analysis -> Pareto selection -> session planning -> one merged `session_content` call per session.
- Plan generation intentionally makes `2 + N` LLM calls, not `2 + 2N`; do not split the merged material/quiz call.
- Completing a session publishes `session.completed`; `ProgressService` handles it synchronously and updates SM-2 flashcard reviews.
- The frontend uses the typed Axios boundary in `frontend/src/api/` and TanStack Query polling/mutations in `frontend/src/hooks/`.

## Invariants

- Preserve demo mode: the core app must work without API keys or heavy RAG dependencies through the mock LLM and pure-Python fallbacks.
- Optional PDF, chunking, embedding, and vector-store integrations are loaded lazily; changes must retain their fallback implementations.
- LLM selection is active user credential -> `.env` Anthropic key -> deterministic mock provider.
- Normal development uses `Base.metadata.create_all()` at startup, not `alembic upgrade`; add an additive column backfill in `backend/app/db/init_db.py` when changing an existing table.
- Plan and goal deletion explicitly removes `FlashcardReview` rows; SQLite foreign-key cascades are not relied upon.
- Authentication is not implemented; requests use the fixed demo user `id=1`.
- LLM credentials use revisioned phases: save/replace key -> save model/URL draft -> test that stored revision -> activate it. A non-empty model is not verification; activation requires current server evidence and encrypted keys must never leave the server.
- Custom LLM `base_url` values must pass `app/core/url_safety.py` both when saved and before use; do not replace it with a string-prefix check.
- YouTube resources must remain search URLs built from LLM keywords; never render an LLM-provided URL directly.

## OpenCode

- Project MCP configuration is in `.opencode/opencode.json`; it uses `{env:...}` references and never stores tokens.
- Export `GITHUB_PERSONAL_ACCESS_TOKEN`, `CONTEXT7_API_KEY`, and `FIRECRAWL_API_KEY` before starting OpenCode if those MCPs are needed.
- The configured `filesystem` and `git` MCPs are restricted to this repository; do not widen their paths without an explicit need.
- After changing OpenCode configuration, validate with `opencode debug config` only when secret variables are unset, use `opencode mcp list` for connection status, then restart OpenCode; `debug config` expands env references and can print tokens.

## Sources Of Truth

- Use FastAPI `/openapi.json` and `/docs` as the runtime API contract; keep `docs/api_contract.yaml` synchronized.
- `docs/AGENTS_STATUS.md` and `studyai_multiagent_plan.md` describe historical phases and workflows; do not trust their old provider, prompt, or test-count claims over the current implementation.
