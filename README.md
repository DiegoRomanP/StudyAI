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
│       ├── api/v1/routes/   # Endpoints (documents, goals, plans, sessions, quizzes, dashboard)
│       ├── services/        # Lógica de negocio (orquestación)
│       ├── repositories/    # Acceso a datos (patrón Repository)
│       ├── models/          # Entidades SQLAlchemy
│       ├── schemas/         # DTOs Pydantic (entrada/salida de la API)
│       ├── processors/      # Parseo de documentos (PDF / Markdown) + Factory
│       ├── rag/             # Chunker, Embedder, VectorStore, Retriever, Pipeline
│       ├── llm/             # Proveedores (Anthropic / Mock), prompts, parsers
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
uvicorn main:app --reload              # http://localhost:8000
```

- Swagger UI: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/openapi.json>
- Health check: <http://localhost:8000/health>

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
| `DATABASE_URL` | `sqlite:///./studyai.db` | Cadena de conexión SQLAlchemy. |
| `CHROMA_PERSIST_DIR` | `./storage/chroma` | Directorio de persistencia del vector store. |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Modelo de embeddings (si instalas RAG). |
| `UPLOAD_DIR` | `./storage/uploads` | Carpeta de archivos subidos. |
| `MAX_UPLOAD_MB` | `25` | Tamaño máximo de subida (MB). |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos (separados por coma). |
| `REVIEW_INTERVALS_DAYS` | `1,3,7,14,30` | Offsets de repaso espaciado (Ebbinghaus). |
| `SESSION_DURATION_MINUTES` | `25` | Duración de una sesión de estudio. |

Frontend (`frontend/.env`): `VITE_API_URL` (por defecto `http://localhost:8000`).

> **Modo demo vs. producción:** el proyecto arranca y corre el flujo completo
> sin API key y sin `requirements-rag.txt`. Instalar esas dependencias y definir
> `ANTHROPIC_API_KEY` activa Claude, parseo real de PDF y RAG semántico de forma
> transparente (detección automática en tiempo de ejecución).

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
| `POST` | `/goals` | Crea una meta |
| `GET`/`PUT` | `/goals` · `/goals/{id}` | Lista / detalle / actualiza |
| `POST` | `/plans/generate` | Inicia la generación asíncrona del plan |
| `GET`  | `/plans/{id}/status` · `/plans/{id}` | Estado / plan completo |
| `GET`  | `/sessions/{id}` | Detalle de sesión (con material) |
| `POST` | `/sessions/{id}/complete` | Marca la sesión como completada |
| `GET`  | `/quizzes/{session_id}` | Quiz de una sesión |
| `POST` | `/quizzes/{quiz_id}/submit` | Envía respuestas, califica y actualiza SM-2 |
| `GET`  | `/dashboard` | Métricas de progreso |

---

## Tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

Cubren SM-2, Pareto, chunker, parsers de salida del LLM, `ProcessorFactory`,
`GoalStrategy` y un test de integración end-to-end (upload → plan → sesión →
quiz → dashboard) con el LLM mockeado. **22 tests en verde.**

Frontend — typecheck y build de producción:

```bash
cd frontend
npm run lint     # tsc --noEmit
npm run build
```

---

## Notas de seguridad

- La subida valida extensión (`.pdf` / `.md`) y tamaño máximo (`MAX_UPLOAD_MB`).
- Acceso a datos siempre vía SQLAlchemy ORM parametrizado (sin SQL crudo).
- La API key se lee del entorno; `.env` está en `.gitignore`.
- Los enlaces de YouTube se construyen como **búsqueda** desde palabras clave;
  nunca se renderiza una URL generada por el LLM.

### Pendiente (post-MVP)

Autenticación real (hoy usuario demo único), rate limiting y ocultar las
respuestas del quiz hasta el envío. Ver [`docs/AGENTS_STATUS.md`](docs/AGENTS_STATUS.md).
