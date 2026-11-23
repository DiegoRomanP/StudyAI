# Configuración y modo de despliegue

> **Leer antes de** añadir una variable de entorno, tocar `app/core/config.py`, o cambiar algo que se
> comporte distinto entre `self_hosted` y `saas`.

## Config (Twelve-Factor)

`app/core/config.py` is the single place environment variables are read; nothing else should touch
`os.environ` directly. One deliberate exception: `harness/provider.py::_child_env` passes the process
environment through to the agent CLIs (they need `HOME`/`PATH` to find their own login) — it forwards
it, it does not read configuration from it. `Settings` has safe defaults for every field so the app
boots with no `.env` at all. Note `CORS_ORIGINS` and `REVIEW_INTERVALS_DAYS` use `NoDecode` + a
`field_validator` to accept plain comma-separated strings — pydantic-settings would otherwise try
`json.loads()` on them first and crash on boot.

`Settings` reads the **repo-root `.env`** and then `backend/.env` (the latter wins; both git-ignored).
A real environment variable beats both `.env` files (pydantic-settings), so a stale key exported in the
shell silently overrides them (it showed up as 403 "Authorization failed" with the old NVIDIA tier).

**Al añadir una clave de entorno que gaste dinero o cuota** (como `DEEPSEEK_API_KEY`), fuérzala vacía en
`tests/conftest.py` y en el runner de QA (`scripts/qa-runtime.mjs`) como variable de entorno.

## Deployment mode (`self_hosted` | `saas`)

`Settings.DEPLOYMENT_MODE` (default `self_hosted` = everything, unchanged). In `saas`,
`resolve_llm_provider` skips the learner's credential and the free tier and uses **only** the server's
Anthropic key; without it, `UnavailableLLMProvider` raises `LLM_UNAVAILABLE` and the runtime reports
`source="UNAVAILABLE"` — never the mock, so a paying user never gets fake content. `require_self_hosted`
(`app/api/deps.py`) makes every `/llm-settings/*` route except `catalog` and `runtime` answer 404.
`GET /config` tells the frontend the mode (ver [frontend/funcionalidades/conectar-ia.md](../../frontend/funcionalidades/conectar-ia.md)).
Hiding in the UI is courtesy; the backend enforces.

Los agentes CLI de terminal son **solo self-hosted** (ver [llm/agentes-cli.md](../llm/agentes-cli.md)).

## Variables de despliegue SaaS

Todas con default seguro (self-hosted/demo); `tests/conftest.py` las fuerza vacías/seguras.

| Variable | Default | Uso |
|---|---|---|
| `APP_ENV` | `development` | `development` \| `production` |
| `PUBLIC_APP_URL` / `PUBLIC_API_URL` | `http://localhost:5173` / `http://localhost:8001` | URLs públicas (enlaces, redirecciones, webhooks) |
| `AUTH_MODE` | `demo` | `demo` (usuario único) \| `supabase` (valida JWT) |
| `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_PUBLISHABLE_KEY` | vacío | Supabase Auth; solo clave publicable |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` | `aud` esperado del token |
| `STORAGE_BACKEND` | `local` | `local` (`UPLOAD_DIR`) \| `s3` (compatible S3, p. ej. R2) |
| `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | vacío (`auto`) | Credenciales del almacenamiento S3 (`app/storage`; requiere `boto3` de `requirements-saas.txt`; si faltan o `boto3` no está, cae a local con warning). Detalle: [../documentos/ingesta-y-figuras.md](../documentos/ingesta-y-figuras.md) |
| `PAYMENT_GATEWAY` | `fake` | `fake` \| `mercadopago` |
| `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | vacío | Mercado Pago |

`CLAUDE_API_KEY` se acepta como alias de `ANTHROPIC_API_KEY` (gana `ANTHROPIC_API_KEY`). Los secretos son
`str` (como el resto del archivo), no `SecretStr`. Dependencias nuevas en `requirements-saas.txt`: `pyjwt[crypto]`, `boto3`.

Hoja de ruta hacia SaaS de pago: [despliegue/saas-produccion.md](../despliegue/saas-produccion.md).

## Autenticación (`AUTH_MODE`)

- `demo` (por defecto): `get_current_user` devuelve el usuario 1; sin login, comportamiento autoalojado intacto.
- `supabase`: `get_current_user` (`app/api/deps.py`) exige `Authorization: Bearer <access token>`.
  `SupabaseTokenVerifier` (`app/core/auth.py`) valida con **JWKS asimétrico** (`SUPABASE_JWKS_URL`,
  solo `ES256`/`RS256`, nunca HS256 ni *JWT secret*), `aud=SUPABASE_JWT_AUDIENCE`,
  `iss={SUPABASE_URL}/auth/v1`, y exige `exp/iss/aud/sub`. Rechaza tokens anónimos (`is_anonymous`):
  con «Confirm email» activado, un token no anónimo implica correo verificado.
- Usuario *just-in-time*: `user_service.get_or_create_supabase_user` busca por `users.supabase_user_id`
  y lo crea en la primera petición (carrera resuelta con `IntegrityError` → rollback y relectura). Un
  correo que ya pertenece a otro `sub` da 409. El hook `on_user_created` queda vacío (F1 lo usará).
- Errores (con `code` estable): `AUTH_REQUIRED` 401, `AUTH_INVALID_TOKEN` 401, `AUTH_EMAIL_CONFLICT` 409.
- `jwt` (PyJWT) se importa de forma perezosa; `requirements-saas.txt` lo incluye, la app autoalojada
  arranca sin él. `DEPLOYMENT_MODE=saas` exige `AUTH_MODE=supabase` (validador de `Settings`).
- `GET /config` expone `auth_mode`. Columnas nuevas de `users`: `supabase_user_id` (único), `email_verified_at`
  (backfill en `_ensure_user_auth_columns`).
- Aislamiento entre usuarios: `tests/test_user_isolation.py` recorre todas las rutas con ids ajenos (404).
