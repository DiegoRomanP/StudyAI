# Operación: empaquetado, despliegue y CI

Estado: H3 y H4 de `plans/SaaS_SinCredenciales.md`. Los pasos de la VM están en `deploy/README.md`.

## Empaquetado (`backend/Dockerfile`)

- `python:3.14-slim` (la misma versión que usa el repo), usuario no root (uid 10001), instala
  `requirements.txt` + `requirements-saas.txt` (sin RAG pesado: en SaaS el vector store es pgvector).
  Imagen ~365 MB.
- `HEALTHCHECK` contra `/health` (con `python`, la imagen no trae `curl`).
- `CMD`: si `DEPLOYMENT_MODE=saas` ejecuta `alembic upgrade head` y luego
  `uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1 --proxy-headers`. Un solo worker: la
  generación corre en segundo plano dentro del proceso (sin cola en la beta).
- **Pendiente H2**: aún no hay versiones de Alembic, así que `upgrade head` no hace nada; H2 aporta la
  línea base y hace que `init_db` deje de llamar a `create_all` en `saas`.
- `.dockerignore` deja fuera `.env`, `storage/`, `tests/`, bases SQLite y entornos virtuales.

## Despliegue (`deploy/`)

- `docker-compose.yml`: `api` (`env_file: /opt/studyai/.env`, solo expuesto a la red interna) y `caddy`
  (80/443, HTTPS automático, volumen `caddy_data` para no repetir certificados).
- `Caddyfile`: `api.{$DOMAIN}` -> `api:8001`. `DOMAIN` sale del `.env` del servidor.
- `deploy.sh usuario@host`: `rsync` sin `.env`, `storage`, `node_modules` ni `frontend/` y
  `docker compose up -d --build` por ssh. El `.env` de producción vive solo en la VM.
- DNS `api` en modo "DNS only" (si no, Caddy no emite el certificado).

## Frontend (Cloudflare Pages)

`frontend/public/_redirects` (SPA fallback) y `_headers` (HSTS, nosniff, Referrer-Policy y CSP) se copian
a `dist/` con `npm run build`. La CSP permite `https://api.studyinflow.app`, `*.supabase.co` (también
`wss`), y las fuentes de Google que carga `index.html`; `style-src 'unsafe-inline'` por los estilos en
línea de React. Si cambia el dominio de la API o se añade un origen nuevo, edita ese archivo.

## CI (`.github/workflows/ci.yml`)

Se ejecuta en cada PR y en `main`: `backend-sqlite` (`pytest -q`), `backend-postgres`
(`pgvector/pgvector:pg17` + `TEST_DATABASE_URL`), `frontend` (`npm ci`, lint, test, build) y `audit`
(`pip-audit` y `npm audit --audit-level=high`, no bloquea).

## Pendiente

Pruebas de humo en producción (checklist de la fase X) y runbook de reversión: se anotan aquí al ejecutarlas.
