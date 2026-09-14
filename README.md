# StudyAI

Backend de planificación de estudio asistida por IA + frontend web. Subes tus
documentos (`.pdf` / `.md`), defines una **meta** (examen, aprendizaje o
memorización) y StudyAI genera un **plan de estudio** con sesiones, material y
quizzes, aplicando repetición espaciada (**SM-2 / Ebbinghaus**) y priorización
de temas débiles (**Pareto**) para el repaso.

Funciona **de fábrica sin claves ni dependencias pesadas**: usa un proveedor LLM
*mock* determinista, un *embedder* por hashing y un *vector store* en memoria.
Al instalar las dependencias opcionales y una API key de Anthropic, se
auto-mejora a Claude + RAG semántico real sin tocar código.

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
│       ├── llm/             # Proveedores (Anthropic / OpenAI-compatible / Mock), prompts, parsers
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
  Anthropic SDK. Opcional: PyMuPDF, sentence-transformers, ChromaDB,
  LangChain text-splitters.
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TanStack Query, React
  Router, Axios, Recharts, react-markdown.

---

## Requisitos

- **Python** ≥ 3.11 (probado en 3.14)
- **Node.js** ≥ 18 (probado en 26) y npm

---

## Puesta en marcha

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt        # núcleo, suficiente para el MVP
pip install -r requirements-dev.txt    # tests (pytest, httpx)
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

---

## Configuración (`backend/.env`)

| Variable | Por defecto | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(vacío)* | Vacío ⇒ **modo demo** con LLM mock (sin gastar tokens). Con clave ⇒ usa Claude. |
| `LLM_MODEL_PLAN` | `claude-opus-4-8` | Modelo para generar el plan de estudio. |
| `LLM_MODEL_QUIZ` | `claude-haiku-4-5` | Modelo para generar quizzes. |
| `LLM_MAX_RETRIES` | `3` | Reintentos para errores transitorios (5xx/timeout). Los 429 tienen su propio presupuesto de 6 reintentos, aparte. |
| `LLM_TIMEOUT_SECONDS` | `180` | Timeout por llamada — deliberadamente generoso para modelos grandes lentos (p. ej. NVIDIA NIM 70B/405B) en una tarea de fondo. |
| `LLM_REQUEST_PACING_SECONDS` | `2.0` | Pausa proactiva entre llamadas sucesivas al LLM dentro de una misma generación de plan, para no agotar límites de tasa por minuto de proveedores gratuitos. Se ignora con el LLM mock. Súbela si tu proveedor tiene un límite muy ajustado. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Endpoint de Ollama visto por el proceso backend. No se configura desde la interfaz. |
| `OLLAMA_TIMEOUT_SECONDS` | `600` | Timeout para inferencia local, que puede incluir la carga inicial del modelo. |
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
"— gratis") y los de pago después; "Personalizado…" acepta cualquier ID. En
"Configuración avanzada" hay un override opcional de URL base (útil, por
ejemplo, para un endpoint regional de GLM).

Para OpenAI, los modelos o-series conocidos (`o1`, `o3` y `o4`, incluido
`o4-mini`) reciben `max_completion_tokens`, que abarca razonamiento y salida
visible. Los demás proveedores OpenAI-compatible, incluido NVIDIA y Ollama,
mantienen `max_tokens`; un ID personalizado usa ese perfil conservador hasta
que se confirme su contrato. El perfil también define las capacidades de
formato de respuesta: Ollama usa JSON estructurado solo para las operaciones
que lo requieren y no recibe `reasoning_effort` no confirmado.

Cambiar la clave, el modelo o la URL de un proveedor vuelve a exigir la
verificación; una configuración anterior no se hereda a ciegas.

Solo una clave puede estar **activa** a la vez — esa es la que usa el
generador de planes para todas las llamadas (no hay ya distinción de modelo
"barato" vs "caro" por tarea cuando usas tu propia clave; se usa el modelo que
elijas para todo). Sin ninguna clave activa, se conserva el orden de
prioridad existente: `.env` → mock.

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
(`LLM_RATE_LIMITED`), la llamada puede reintentarse respetando `Retry-After`.
Una cuota o saldo agotado (`LLM_QUOTA_EXHAUSTED`) no se reintenta.

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
| `POST` | `/llm-settings/deactivate-all` | Vuelve a modo demo |

---

## Tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

Cubren SM-2, Pareto, chunker, parsers de salida del LLM, `ProcessorFactory`,
`GoalStrategy`, borrado de documentos/metas/planes (incluida la cascada
meta → planes → sesiones/quizzes/repasos de flashcards), cifrado/enmascarado
de claves, el proveedor OpenAI-compatible (mockeado con `respx`, sin red
real) incluyendo su manejo de rate-limit (HTTP 429 con `Retry-After`, con
presupuesto de reintentos propio y separado de los errores 5xx), la selección
de proveedor de `get_llm_provider` (incluido Hugging Face y que hereda
`LLM_TIMEOUT_SECONDS`/`LLM_MAX_RETRIES` de la config) y los endpoints de
`/llm-settings`, el pipeline de generación de planes (recuento exacto de
llamadas al LLM, conteos de flashcards/opción múltiple según la estrategia de
meta), además de un test de integración end-to-end (upload → plan → sesión →
quiz → dashboard) con el LLM mockeado.

Frontend — pruebas, typecheck y build de producción:

```bash
cd frontend
npm run test
npm run lint     # tsc --noEmit
npm run build
```

---

## Notas de seguridad

- La subida valida extensión (`.pdf` / `.md`) y tamaño máximo (`MAX_UPLOAD_MB`).
- Acceso a datos siempre vía SQLAlchemy ORM parametrizado (sin SQL crudo).
- La API key de operador se lee del entorno; `.env` está en `.gitignore`.
- Las claves que el usuario guarda desde **Configuración** se cifran en
  reposo (Fernet) y nunca se devuelven completas por la API — ver sección
  "Configurar tu propia clave de API" más arriba.
- El override de `base_url` (URL base personalizada) se valida para evitar
  SSRF: se resuelve el host y se rechazan direcciones privadas, loopback o de
  enlace local (incluida la IP de metadatos de nube `169.254.169.254`).
- Los enlaces de YouTube se construyen como **búsqueda** desde palabras clave;
  nunca se renderiza una URL generada por el LLM.

### Pendiente (post-MVP)

Autenticación real (hoy usuario demo único), rate limiting y ocultar las
respuestas del quiz hasta el envío. Ver [`docs/AGENTS_STATUS.md`](docs/AGENTS_STATUS.md).
