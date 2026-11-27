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
- Migración en cada deploy: `upgrade head` corre en cada arranque del contenedor (idempotente; si falla, el
  contenedor no arranca y `restart: unless-stopped` reintenta). En `saas` `init_db` no crea tablas.
  `alembic.ini` y `app/db/migrations/` entran en la imagen (el `.dockerignore` no los excluye).
- `.dockerignore` deja fuera `.env`, `storage/`, `tests/`, bases SQLite y entornos virtuales.

## Despliegue (`deploy/`)

- `docker-compose.yml`: `api` (`env_file: /opt/studyai/.env`, solo expuesto a la red interna) y `caddy`
  (80/443, HTTPS automático, volumen `caddy_data` para no repetir certificados).
- `Caddyfile`: `api.{$DOMAIN}` -> `api:8001`. `DOMAIN` sale del `.env` del servidor.
- `deploy.sh usuario@host`: `rsync` sin `.env`, `storage`, `node_modules` ni `frontend/` y
  `docker compose up -d --build` por ssh. El `.env` de producción vive solo en la VM.
- DNS `api` en modo "DNS only" (si no, Caddy no emite el certificado).

## Base de datos existente (Supabase) y Alembic

Antes del primer deploy con la línea base `0001_baseline`, mira la base de Supabase:

- **Vacía** (sin tablas en `public`): no hagas nada; el contenedor ejecuta `alembic upgrade head`.
- **Ya tiene el esquema** (creado por `create_all` en pruebas): adóptala sin recrear tablas. Desde
  `backend/`, con el `DATABASE_URL` de producción en el entorno:
  ```bash
  alembic stamp 0001_baseline   # escribe alembic_version sin tocar tablas
  alembic check                 # "No new upgrade operations detected." = coincide con los modelos
  ```
  Si `alembic check` muestra diferencias, la base no coincide: si es de pruebas, lo más simple es vaciar
  `public` y dejar que `upgrade head` la cree; si tiene datos reales, escribe una migración de ajuste.
  Sin `stamp`, `upgrade head` fallaría al intentar crear tablas que ya existen y el API no arrancaría.
- Ver la versión aplicada: `alembic current`. Nuevas migraciones: ver
  [base-de-datos.md](../arquitectura/base-de-datos.md#cambiar-el-esquema-desde-ahora-columna-o-tabla-nueva).

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
