# StudyAI

Backend de planificación de estudio asistida por IA + frontend web. Subes tus
documentos (`.pdf` / `.md`), defines una **meta** (examen, aprendizaje o
memorización) y StudyAI genera un **plan de estudio** con sesiones, material y
quizzes, aplicando repetición espaciada (**SM-2 / Ebbinghaus**) y priorización
de temas débiles (**Pareto**) para el repaso.

Funciona **de fábrica sin claves ni dependencias pesadas**: usa un proveedor LLM
*mock* determinista, un *embedder* por hashing y un *vector store* en memoria.
Al instalar las dependencias opcionales y configurar Anthropic, otro proveedor
compatible o una instancia local de Ollama, se puede usar inferencia real y RAG
semántico sin tocar el código.

---

## Arquitectura

Monorepo con dos aplicaciones. La estructura respeta separación por capas
(Controllers → Services → Repositories → Models/DTOs) y varios patrones de
diseño: **Repository**, **Factory** (procesadores, LLM, estrategias),
**Strategy** (tipo de meta), **Pipeline** (ingesta RAG) y **Observer**
(bus de eventos de sesión).

```
studyai/
├── backend/                 # FastAPI + SQLAlchemy
│   ├── main.py              # App factory + entrypoint (uvicorn main:app)
│   └── app/
│       ├── api/v1/routes/   # Endpoints (documents, goals, plans, sessions, quizzes, dashboard, llm-settings)
│       ├── services/        # Lógica de negocio (orquestación)
│       ├── repositories/    # Acceso a datos (patrón Repository)
│       ├── models/          # Entidades SQLAlchemy
│       ├── schemas/         # DTOs Pydantic (entrada/salida de la API)
│       ├── processors/      # Parseo de documentos (PDF / Markdown) + Factory
│       ├── rag/             # Chunker, Embedder, VectorStore, Retriever, Pipeline
│       ├── llm/             # Contratos y adaptadores LLM por proveedor, prompts y parsers
│       ├── strategies/      # Estrategias por tipo de meta
│       ├── algorithms/      # SM-2 (repaso) y Pareto (priorización)
│       ├── events/          # Bus de eventos de sesión (Observer)
│       └── core/            # Config, logging, excepciones
├── frontend/                # Vite + React + TypeScript + Tailwind + TanStack Query
│   └── src/{pages,components,api,hooks,lib}
└── docs/
    ├── api_contract.yaml    # Contrato OpenAPI mínimo
    └── AGENTS_STATUS.md     # Estado de avance por fases
```

**Stack**

- **Backend:** FastAPI, SQLAlchemy 2 (SQLite por defecto), Pydantic v2, Alembic,
  Anthropic SDK, httpx. Opcional: PyMuPDF, sentence-transformers, ChromaDB,
  LangChain text-splitters.
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TanStack Query, React
  Router, Axios, Recharts, react-markdown, Vitest y Testing Library.

### Base visual del frontend

El frontend incluye tokens CSS semánticos y utilidades Tailwind, controles
nativos reutilizables y una primitiva `AsyncState` que conserva los datos
previos ante un error de actualización cuando las páginas la integran. La tabla
de valores observados/candidatos, ratios de contraste calculados y límites del
handoff Penpot están en
[`docs/frontend-integration/a05-tokens-and-components.md`](docs/frontend-integration/a05-tokens-and-components.md).
La documentación no declara paridad visual ni certificación WCAG; los aliases
`brand-*` y de paletas antiguas solo mantienen compatibilidad para las vistas
que aún no se han extraído.

### Navegación y rutas (A06)

`/` explica el propósito de StudyAI y enlaza a sus secciones. La navegación de
escritorio y el menú móvil permiten volver a Inicio o visitar Documentos, Metas,
Plan, Dashboard y Configuración; los enlaces a planes y sesiones existentes
siguen funcionando directamente. Las rutas desconocidas tienen una página 404
con regreso al inicio. El menú móvil es una divulgación no modal que no bloquea
el contenido: Escape lo cierra y devuelve el foco al botón. Los IDs de plan y
sesión se validan antes de consultar la API.

Dev-Reviewer aprobó técnicamente A06 tras dos ciclos de corrección y una tercera
revisión. La evidencia registrada incluye 75 pruebas Vitest, dos ejecuciones del
runner QA con 33/33 casos cada una y `test:qa` con 78/78 checks (API 3, E2E 3 y
Bruno 72); runtime `MOCK` y E2E a 320 px con retraso controlado de 500 ms en los
GET del backend. Los cambios siguen en el diff local sobre HEAD `c703f8f`; aún no
existe un commit de A06. La ubicación persistente de Inicio en la navegación
móvil (PEN-03/A01) sigue sin decisión; esta entrega no añade una barra inferior
ni declara paridad visual con Penpot. Véase
[`docs/frontend-integration/a06-responsive-navigation.md`](docs/frontend-integration/a06-responsive-navigation.md).

---

## Requisitos

- **Python** ≥ 3.11 (probado en 3.14)
- **Node.js** ≥ 22 y npm (lockfile frontend verificado con 24.19.0)

---

## Puesta en marcha

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt        # núcleo, suficiente para el MVP
pip install -r requirements-dev.txt    # tests (pytest, httpx, respx)
# Opcional — RAG semántico real + parseo de PDF (paquetes grandes, incluye torch):
# pip install -r requirements-rag.txt

cp .env.example .env                   # ajusta valores si lo necesitas
uvicorn main:app --reload --port 8001  # http://localhost:8001
```

- Swagger UI: <http://localhost:8001/docs>
- OpenAPI JSON: <http://localhost:8001/openapi.json>
- Health check: <http://localhost:8001/health>

La base de datos SQLite y el esquema se crean automáticamente al arrancar
(`init_db` en el *lifespan* de FastAPI).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env                   # VITE_API_URL apunta al backend
npm run dev                            # http://localhost:5173
```

Para validar el cliente ejecuta `npm run lint`, `npm test` y `npm run build`.

### QA aislado

Las pruebas de API y navegador con Playwright/Bruno usan dependencias npm
fijadas, Chromium instalado por `npm --prefix frontend exec -- playwright install chromium`
y un entorno Python dedicado (`backend/.venv-qa`) con solo las dependencias core. Sigue
[`docs/frontend-integration/qa.md`](docs/frontend-integration/qa.md) para
prepararlo y ejecutar `npm --prefix frontend run test:qa`. `test:api` ejecuta
readiness Playwright y el flujo HTTP A04 completo de Bruno; `test:qa` añade el
smoke de la UI de producción, incluido foco A05 y navegación A06 a 320 px (no es
el recorrido completo de estudio A15–A17). La colección versionada
`frontend/bruno/smoke/` comparte el Markdown canónico
`frontend/qa/fixtures/studyai-a04-smoke.md` con el consumidor de solo-lectura
`frontend/e2e/api/a04-shared-fixture.spec.ts`; este no escribe en la base QA
nueva y vacía. El runner conserva reportes JSON/HTML/JUnit sin cabeceras ni
cuerpos y valida el reporte Bruno 4.2.0: salida `0` sola no cuenta como
cobertura; exige requests y aserciones ejecutadas y rechaza fallos, saltos u
omisiones. `test:qa:runner` también ejecuta casos Bruno negativos contra
respuestas HTTP locales controladas; son distintos del smoke positivo FastAPI
real que corre `test:api`. El runner Node ejecuta las pruebas en serie y acota el
polling con contadores de GET/deadlines configurados, no con un umbral frágil de
tiempo total del host; no cambia los límites reales ni el gate de Bruno.

---

## Configuración (`backend/.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(vacío)* | Alternativa del servidor: con clave usa Claude cuando no hay una credencial de usuario activa; sin clave, la alternativa es el LLM mock. |
| `LLM_MODEL_PLAN` | `claude-opus-4-8` | Modelo para análisis de temas y distribución de sesiones. |
| `LLM_MODEL_QUIZ` | `claude-haiku-4-5` | Modelo para el contenido y cuestionario fusionados de cada sesión. |
| `LLM_MAX_RETRIES` | `3` | Intentos máximos de generación para errores transitorios (5xx/timeout). |
| `LLM_MAX_RATE_LIMIT_RETRIES` | `6` | Reintentos máximos de un 429 temporal durante una generación; no aplica a cuota/saldo agotado. |
| `LLM_TIMEOUT_SECONDS` | `180` | Timeout de conexión, lectura, escritura y pool de cada intento de generación. |
| `LLM_TOTAL_BUDGET_SECONDS` | `600` | Presupuesto total por llamada externa de generación, incluidos intentos y esperas; no es una garantía del tiempo de respuesta del proveedor. |
| `LLM_TEST_CONNECT_TIMEOUT_SECONDS` | `5` | Timeout de conexión de una prueba de credencial externa. |
| `LLM_TEST_READ_TIMEOUT_SECONDS` | `30` | Timeout de lectura de una prueba de credencial externa. |
| `LLM_TEST_TOTAL_BUDGET_SECONDS` | `45` | Presupuesto total de una prueba, incluidos intentos y esperas. |
| `LLM_TEST_MAX_RETRIES` | `1` | Reintentos transitorios después del primer intento de prueba. |
| `LLM_TEST_MAX_RATE_LIMIT_RETRIES` | `1` | Reintentos de 429 temporal durante una prueba. |
| `LLM_REQUEST_PACING_SECONDS` | `2.0` | Pausa proactiva entre llamadas sucesivas al LLM dentro de una misma generación de plan, para no agotar límites de tasa por minuto de proveedores gratuitos. Se ignora con el LLM mock. Súbela si tu proveedor tiene un límite muy ajustado. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Endpoint de Ollama visto por el proceso backend. No se configura desde la interfaz. |
| `OLLAMA_TIMEOUT_SECONDS` | `600` | Timeout para inferencia local, que puede incluir la carga inicial del modelo. |
| `OLLAMA_TOTAL_BUDGET_SECONDS` | `600` | Presupuesto total por llamada local; Ollama no reintenta 429. |
| `OLLAMA_MAX_RETRIES` | `1` | Intentos por llamada local; evita repetir cargas costosas de CPU/GPU. |
| `DATABASE_URL` | `sqlite:///./studyai.db` | Cadena de conexión SQLAlchemy. |
| `CHROMA_PERSIST_DIR` | `./storage/chroma` | Directorio de persistencia del vector store. |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Modelo de embeddings (si instalas RAG). |
| `UPLOAD_DIR` | `./storage/uploads` | Carpeta de archivos subidos. |
| `MAX_UPLOAD_MB` | `25` | Tamaño máximo de subida (MB). |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos (separados por coma). |
| `REVIEW_INTERVALS_DAYS` | `1,3,7,14,30` | Offsets de repaso espaciado (Ebbinghaus). |
| `SESSION_DURATION_MINUTES` | `25` | Duración de una sesión de estudio. |

Frontend (`frontend/.env`): `VITE_API_URL` (por defecto `http://localhost:8001`).

> **Modo demo vs. producción:** el proyecto arranca y corre el flujo completo
> sin API key y sin `requirements-rag.txt`. Instalar esas dependencias y definir
> `ANTHROPIC_API_KEY` activa Claude, parseo real de PDF y RAG semántico de forma
> transparente (detección automática en tiempo de ejecución).

### Configurar tu propia clave de API (sección "Configuración" en la UI)

En vez de (o además de) editar `backend/.env`, la pestaña **⚙️ Configuración**
del frontend permite guardar tu propia clave para **Anthropic (Claude), OpenAI
(ChatGPT), Zhipu GLM, OpenRouter, NVIDIA NIM o Hugging Face**. También permite
usar **Ollama local**, sin clave: la tarjeta descubre los modelos ya instalados
en el daemon que ve el backend y excluye las entradas `:cloud`.

Para Ollama, inicia el daemon (`ollama serve` si no se inicia como servicio),
elige un modelo instalado y verifica la conexión antes de activarlo. En este
entorno, `qwen3.5:9b` está disponible y es una opción inicial generalista. Si
FastAPI se ejecuta dentro de Docker, `OLLAMA_BASE_URL` debe resolver desde el
contenedor hacia el host o servicio que ejecuta Ollama; `localhost` no apunta al
navegador.

Para Hugging Face, la "clave de API" es tu **`HF_TOKEN`** (Settings → Access
Tokens en huggingface.co, prefijo `hf_...`) — StudyAI habla con el router
OpenAI-compatible de Hugging Face Inference Providers
(`https://router.huggingface.co/v1`), que reenvía la llamada a alguno de sus
15+ partners de hosting (Together, Fireworks, Novita, Cerebras, DeepInfra,
Zai...). Modelos sugeridos por defecto: `zai-org/GLM-5.2`,
`deepseek-ai/DeepSeek-V4-Pro`, `deepseek-ai/DeepSeek-V4-Flash`,
`moonshotai/Kimi-K2.6` y `Qwen/Qwen3-235B-A22B-Instruct-2507` — como con
cualquier proveedor, "Personalizado…" acepta cualquier otro ID de modelo del
Hub que Inference Providers sirva.

Para NVIDIA NIM, StudyAI usa siempre `https://integrate.api.nvidia.com/v1` y
solo admite modelos generativos cuyo contrato está validado en el servidor. El
catálogo actual ofrece `nvidia/nemotron-3-super-120b-a12b`; en la evaluación
live del 2026-09-29, NVIDIA respondió `410 Gone` indicando fin de vida para los
dos modelos Llama y `deepseek-ai/deepseek-v4-flash` que antes aparecían aquí, por
lo que se retiraron de la lista admitida. Nemotron se invoca con `stream: false`,
`reasoning_effort: low` y un `reasoning_budget` acotado para reservar tokens de
salida a las respuestas JSON de StudyAI. NVIDIA no ofrece campos de URL ni de
modelo personalizado: su catálogo general también incluye clasificadores,
guardas y extractores que no sirven para generar planes.

La verificación corta y una solicitud directa de contenido de sesión pasaron,
pero una generación completa observada falló con HTTP `503` en la etapa de
contenido de sesión, después de analizar temas y crear la primera sesión. La
misma solicitud de contenido respondió `200` en una repetición directa; esto
apunta a disponibilidad/capacidad intermitente de NVIDIA, no a un contrato de
payload incompatible. StudyAI registra el estado HTTP upstream en el log seguro
de generación y no repite automáticamente el POST de NIM ante fallos transitorios.

Internamente, cada proveedor posee su contrato en `backend/app/llm/providers/`:
metadatos de la UI, validación de clave/modelo/URL, perfil de solicitud,
construcción del adaptador y versión de verificación. `provider_registry.py` los
ensambla; el transporte HTTP, presupuestos y errores seguros se comparten para
evitar duplicar lógica de reintentos. OpenAI, GLM y Hugging Face usan el transporte
de chat común; Anthropic, OpenRouter, NVIDIA y Ollama conservan sus adaptadores o
contratos específicos. Para incorporar un proveedor nuevo, agrega su definición,
regístrala y cúbrela con pruebas de contrato en lugar de añadir condicionales a la
factoría o al servicio de configuración.

El flujo de configuración se realiza en cuatro pasos:

1. **Guardar clave.** La API key se cifra y se guarda sin probar un modelo
   predeterminado. El selector queda disponible de inmediato.
2. **Guardar borrador.** Seleccionas o escribes el ID del modelo y, si aplica,
   su URL base. El cambio crea una revisión nueva y desactiva cualquier prueba
   anterior.
3. **Verificar el borrador.** StudyAI prueba exactamente el modelo y URL
   guardados. Si falla por permisos, retirada del modelo o cuota, conserva el
   borrador para que puedas elegir otro modelo sin volver a escribir la clave.
4. **Activar.** Solo una revisión cuya evidencia sigue vigente puede pasar a
   ser el proveedor activo. Una edición o una pestaña desactualizada recibe un
   conflicto y no activa una configuración diferente de la probada.

Los modelos sugeridos se ordenan con los **gratuitos primero** (marcados
"— gratis") y los de pago después. Los proveedores que lo permiten ofrecen
"Personalizado…" para cualquier ID; NVIDIA queda limitado a su lista validada.
En "Configuración avanzada", OpenAI, GLM, OpenRouter y Hugging Face permiten
un override opcional de URL base (útil, por ejemplo, para un endpoint regional
de GLM). Anthropic, NVIDIA y Ollama no lo admiten: Anthropic usa solo su API
nativa, NVIDIA su endpoint hospedado oficial y Ollama se configura mediante
`OLLAMA_BASE_URL` en el servidor.

Para OpenAI, los modelos o-series conocidos (`o1`, `o3` y `o4`, incluido
`o4-mini`) reciben `max_completion_tokens`, que abarca razonamiento y salida
visible. Los adaptadores de NVIDIA y Ollama mantienen `max_tokens`; NVIDIA
además fija `stream: false`, limita cada modelo a su máximo validado y no repite
un POST tras una respuesta `202`. Un ID personalizado usa el perfil conservador
hasta que se confirme su contrato. El perfil también define las capacidades de
formato de respuesta: Ollama usa JSON estructurado solo para las operaciones
que lo requieren y no recibe `reasoning_effort` no confirmado.

Las pruebas de conectividad usan un presupuesto explícito de 32 tokens para
chat convencional y Ollama, y 256 para los modelos OpenAI o-series. Una
respuesta que alcanza ese límite se informa como presupuesto de salida
insuficiente; no se interpreta como una clave inválida ni se aumenta el límite
indefinidamente. Las respuestas HTTP 200 también se validan: contenido vacío o
con estructura inválida, una salida truncada y un rechazo del modelo devuelven
errores diferenciados y no se entregan al generador de planes. Solo se acepta
una finalización terminal con uso de tokens válido cuando el contrato del
proveedor lo exige; las pausas, llamadas de herramientas y estados desconocidos
no se confunden con una respuesta completa.

Cambiar la clave, el modelo o la URL de un proveedor vuelve a exigir la
verificación; una configuración anterior no se hereda a ciegas.

Solo una clave puede estar **activa** a la vez — esa es la que usa el
generador de planes para todas las llamadas (no hay ya distinción de modelo
"barato" vs "caro" por tarea cuando usas tu propia clave; se usa el modelo que
elijas para todo). Sin ninguna clave activa, se conserva el orden de
prioridad existente: `.env` → mock. La pantalla consulta `GET /llm-settings/runtime`
para mostrar la fuente que se resolvería en ese momento: configuración de usuario,
Anthropic del servidor o modo demo. Es información de selección, no una prueba de
conectividad; si no puede obtenerla, muestra un estado desconocido en vez de asumir
modo demo.

Cuando se usa Anthropic desde `.env`, `LLM_MODEL_PLAN` atiende `topic_analysis`
y `session_plan`; `LLM_MODEL_QUIZ` atiende la llamada fusionada `session_content`
de material y cuestionario. La generación conserva sus `2 + N` llamadas.

**Seguridad de las claves**: se cifran en reposo (Fernet, derivado de
`SECRET_KEY`) antes de guardarse en la base de datos y **nunca** se devuelven
completas por la API — solo un fragmento enmascarado (`sk-a••••••9f2k`) que se
calcula una sola vez, al guardar. Cambia `SECRET_KEY` a un valor real y
aleatorio antes de usar esto en producción: si `SECRET_KEY` cambia después de
guardar claves, esas claves quedan indescifrables (StudyAI lo detecta y
degrada al siguiente nivel — `.env` o mock — en vez de fallar).

**Cuidando los límites de tasa de proveedores gratuitos**: generar un plan
hace `2 + N` llamadas al LLM (N = número de sesiones) — antes eran `2 + 2N`
(una llamada separada para el material de estudio y otra para el quiz de cada
sesión; ahora es una sola). Cada llamada además pide solo el `max_tokens` que
realmente necesita (mucho menos que el límite genérico anterior) y la
recuperación de contexto (RAG) usa menos fragmentos. Entre llamadas hay una
pausa configurable (`LLM_REQUEST_PACING_SECONDS`) para no agotar el límite de
peticiones por minuto de un plan gratuito (p. ej. los modelos `:free` de
OpenRouter, limitados a ~8 req/min). Si el proveedor indica un límite temporal
(`LLM_RATE_LIMITED`), la llamada puede reintentarse respetando `Retry-After`,
numérico o fecha HTTP. Si la espera indicada no cabe en el presupuesto restante,
StudyAI devuelve el límite temporal y su espera sugerida sin adelantar otro
intento. Una cuota o saldo agotado (`LLM_QUOTA_EXHAUSTED`) no se reintenta.

Los fallos de proveedores se exponen como respuestas `502` con un `detail`
seguro y los campos `code`, `provider`, `upstream_status`, `retryable` y
`retry_after_seconds`. Los códigos distinguen autenticación, permisos, cuota,
modelo/endpoint, límite temporal, red y disponibilidad; no incluyen cuerpos de
respuesta del proveedor, prompts ni claves. Un rechazo inequívoco de
autenticación invalida la evidencia de la configuración guardada y la desactiva.

---

## Flujo de uso

1. **Subir documentos** (`.pdf` / `.md`) → se indexan de forma asíncrona
   (`PENDING → INDEXED`).
2. **Crear una meta** eligiendo tipo: `EXAM`, `LEARNING` o `MEMORIZATION`.
3. **Generar un plan** a partir de la meta y los documentos → generación
   asíncrona (`PROCESSING → READY`), con *polling* de estado.
4. **Estudiar una sesión**: material → receso → quiz. Las flashcards se puntúan
   0–5 y las preguntas de opción múltiple se autocalifican.
5. **Completar la sesión** dispara el evento `session.completed`, que actualiza
   la programación de repaso (SM-2).
6. **Dashboard**: puntuaciones, temas débiles y próximas revisiones.

---

## API (resumen)

Contrato completo en [`docs/api_contract.yaml`](docs/api_contract.yaml) y en vivo
en `/docs`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET`  | `/health` | Health check |
| `POST` | `/documents/upload` | Sube e indexa un documento |
| `GET`  | `/documents` · `/documents/{id}` | Lista / detalle (polling de status) |
| `DELETE` | `/documents/{id}` | Elimina el documento (archivo, vectores indexados y registro) |
| `POST` | `/goals` | Crea una meta |
| `GET`/`PUT` | `/goals` · `/goals/{id}` | Lista / detalle / actualiza (parcial) |
| `DELETE` | `/goals/{id}` | Elimina la meta y, en cascada, sus planes generados |
| `POST` | `/plans/generate` | Inicia la generación asíncrona del plan |
| `GET`  | `/plans/{id}/status` · `/plans/{id}` | Estado / plan completo |
| `DELETE` | `/plans/{id}` | Elimina el plan (sesiones, quizzes y repasos incluidos) |
| `GET`  | `/sessions/{id}` | Detalle de sesión (con material) |
| `POST` | `/sessions/{id}/complete` | Marca la sesión como completada |
| `GET`  | `/quizzes/{session_id}` | Quiz de una sesión |
| `POST` | `/quizzes/{quiz_id}/submit` | Envía respuestas, califica y actualiza SM-2 |
| `GET`  | `/dashboard` | Métricas de progreso |
| `GET`  | `/llm-settings/catalog` | Metadatos de proveedores LLM soportados |
| `GET` | `/llm-settings/OLLAMA/models` | Modelos locales instalados en Ollama |
| `GET`/`PUT`/`DELETE` | `/llm-settings/{provider}` | Lista / guarda-o-reemplaza (solo la clave) / elimina |
| `PATCH` | `/llm-settings/{provider}/model` | Guarda un borrador de modelo/URL para una revisión |
| `POST` | `/llm-settings/{provider}/activate` · `/test` | Activa una revisión verificada / prueba el borrador guardado |
| `GET` | `/llm-settings/runtime` | Fuente LLM efectiva (`USER`, `ENV` o `MOCK`), sin claves ni prueba de red |
| `POST` | `/llm-settings/deactivate-all` | Usa la configuración del servidor o mock, según disponibilidad |

---

## Documentación de mantenimiento

- [`docs/Plan-New-Frontend.md`](docs/Plan-New-Frontend.md): actividades A01–A18 para integrar Penpot y verificar el frontend. En OpenCode, selecciona `Dev-Project` y pide, por ejemplo, «haz la tarea 1 de @docs/Plan-New-Frontend.md»; coordina `Dev-Code` y `Dev-Reviewer` secuencialmente. Ver [guía de agentes y skills locales](.opencode/skills/README.md). Reinicia OpenCode después de modificar agentes o skills.
- [`docs/frontend-integration/a05-tokens-and-components.md`](docs/frontend-integration/a05-tokens-and-components.md): tokens implementados, componentes base, contraste calculado y límites/gaps A01 de la entrega A05.
- [`docs/frontend-integration/a06-responsive-navigation.md`](docs/frontend-integration/a06-responsive-navigation.md): rutas, navegación móvil/teclado, guardas de IDs, evidencias y decisiones abiertas de A06.
- [`docs/AGENTS_STATUS.md`](docs/AGENTS_STATUS.md): estado actual y pendientes del MVP.
- [`AGENTS.md`](AGENTS.md): reglas operativas para agentes y fuentes de verdad.
- [`CLAUDE.md`](CLAUDE.md): notas ampliadas de arquitectura y diagnóstico.
- [`studyai_multiagent_plan.md`](studyai_multiagent_plan.md): plan histórico de ejecución multi-agente.
- [`plans/ResolveProblems.md`](plans/ResolveProblems.md): diagnóstico histórico y estado de sus propuestas.

## Tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

Cubren SM-2, Pareto, chunker, parsers de salida del LLM, `ProcessorFactory`,
`GoalStrategy`, borrado de documentos/metas/planes (incluida la cascada
meta → planes → sesiones/quizzes/repasos de flashcards), cifrado/enmascarado
de claves, el transporte OpenAI-compatible y los adaptadores directos de
OpenRouter y NVIDIA (mockeados con `respx`, sin red real), perfiles de payload,
reintentos y límites de presupuesto, el registro y aislamiento de proveedores,
el ciclo revisionado de `/llm-settings`, migraciones de evidencia, el pipeline
de generación de planes (`2 + N` llamadas) y un flujo end-to-end con el LLM
mockeado.

Frontend — pruebas, typecheck y build de producción:

```bash
cd frontend
npm test
npm run lint     # tsc --noEmit
npm run build
```

La cobertura actual incluye pruebas de errores API, `SettingsPage` (sincronización
de revisiones y restricciones de NVIDIA), navegación/shell/rutas A06 y enlaces
profundos de plan/sesión. Playwright verifica el flujo de navegación con teclado
a 320 px y el acceso directo a recursos en el build de producción.

---

## Notas de seguridad

- La subida valida extensión (`.pdf` / `.md`) y tamaño máximo (`MAX_UPLOAD_MB`).
- Acceso a datos siempre vía SQLAlchemy ORM parametrizado (sin SQL crudo).
- La API key de operador se lee del entorno; `.env` está en `.gitignore`.
- Las claves que el usuario guarda desde **Configuración** se cifran en
  reposo (Fernet) y nunca se devuelven completas por la API — ver sección
  "Configurar tu propia clave de API" más arriba.
- Los overrides compatibles de `base_url` (URL base personalizada) se validan para evitar
  SSRF: se resuelve el host y se rechazan direcciones privadas, loopback o de
  enlace local (incluida la IP de metadatos de nube `169.254.169.254`).
- NVIDIA usa únicamente el endpoint hospedado oficial y modelos con contrato
  curado; no acepta URLs/modelos personalizados ni repite el POST después de un
  `202` aceptado.
- Los enlaces de YouTube se construyen como **búsqueda** desde palabras clave;
  nunca se renderiza una URL generada por el LLM.

### Pendiente (post-MVP)

Autenticación real (hoy usuario demo único), rate limiting y ocultar las
respuestas del quiz hasta el envío. Ver [`docs/AGENTS_STATUS.md`](docs/AGENTS_STATUS.md).
