# Backend: comandos de desarrollo y tests

Desde `backend/`:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # core — runs the full MVP (mock LLM, hashing embedder, in-memory vector store)
pip install -r requirements-dev.txt      # pytest, httpx, respx
pip install -r requirements-rag.txt      # optional: PyMuPDF, sentence-transformers, chromadb (pulls in torch)
pip install -r requirements-saas.txt     # optional: psycopg 3 for Postgres

cp .env.example .env
uvicorn main:app --reload --port 8001    # http://localhost:8001, Swagger at /docs
```

Tests:

```bash
python -m pytest -q                                    # full backend suite
python -m pytest tests/test_sm2.py -q                   # single file
python -m pytest tests/test_sm2.py::test_third_review_multiplies_by_ef -q   # single test
```

- `tests/conftest.py` redirects `DATABASE_URL`/`CHROMA_PERSIST_DIR`/`UPLOAD_DIR` to a temp dir and forces
  `ANTHROPIC_API_KEY=""` and the free-tier keys empty (mock LLM) *before* the app/config import — tests
  never touch real data or spend tokens.
- `tests/conftest.py` patches `harness.provider.run_cli` to fail: tests pass a fake runner, never a real CLI.
- `TestClient` executes FastAPI background tasks before the test continues; integration tests rely on it.
- Postgres: ver [arquitectura/base-de-datos.md](arquitectura/base-de-datos.md#postgres-saas--supabase).
- Coste por plan/refuerzo: `python scripts/usage_report.py`.

En local (SQLite) no hay `alembic upgrade`: el arranque crea el esquema. Alembic solo pone el esquema en
`saas`; cómo crear una migración: ver base-de-datos.md. No hay linter/formatter/typecheck de
backend configurado.
