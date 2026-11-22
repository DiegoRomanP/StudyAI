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

Hoja de ruta hacia SaaS de pago: [despliegue/saas-produccion.md](../despliegue/saas-produccion.md).
