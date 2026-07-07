# StudyAI — Plan de Ejecución Multi-Agente (Local)

Este documento es la guía operativa para construir StudyAI usando **múltiples agentes de Claude Code trabajando en paralelo o en secuencia controlada**, cada uno con responsabilidad acotada, en pasos pequeños y verificables. El objetivo es que ningún agente reciba una tarea tan grande que "se sature" (pierda contexto, mezcle responsabilidades, o genere código inconsistente).

> Este plan asume que ya tienes el documento `studyai_plan.md` (arquitectura, patrones, stack, estructura de carpetas) como referencia. Este nuevo documento NO repite esa arquitectura, la **ejecuta**.

---

## 1. Filosofía del plan

### 1.1 Por qué multi-agente

Un solo agente trabajando en todo el proyecto de punta a punta tiende a:
- Perder coherencia entre fases lejanas (ej. el modelo de datos definido en la semana 1 ya no coincide con lo que el agente "recuerda" en la semana 6).
- Mezclar responsabilidades (tocar frontend mientras debería estar en backend).
- Generar tareas gigantes difíciles de revisar y de revertir si algo sale mal.

Dividir el trabajo en **agentes especializados con carpetas propias** y **tareas atómicas** resuelve esto: cada agente tiene un scope chico, un objetivo claro, y un criterio de "terminado" verificable.

### 1.2 Reglas de oro

1. **Una tarea = un commit = una responsabilidad.** Nunca pedirle a un agente "implementa todo el backend". Sí pedirle "crea el modelo `Document` con sus columnas, sin lógica adicional".
2. **Ningún agente toca carpetas de otro agente.** Esto evita conflictos de merge y contaminación de contexto.
3. **Cada tarea tiene un criterio de aceptación verificable** (un comando que corre, un test que pasa, un endpoint que responde 200).
4. **El documento `docs/AGENTS_STATUS.md` es la única fuente de verdad del progreso.** Todo agente debe leerlo antes de empezar y actualizarlo al terminar.
5. **Nunca avanzar de Fase sin que la Fase anterior esté en verde** (todos sus criterios de aceptación cumplidos).

---

## 2. Los 5 Agentes y su scope

| Agente | Nombre | Carpetas que posee | Depende de |
|---|---|---|---|
| **A** | Arquitecto / Setup | raíz del proyecto, `backend/app/core/`, `backend/app/db/`, configs | Ninguno (va primero, solo) |
| **B** | Backend Core (datos) | `backend/app/models/`, `backend/app/schemas/`, `backend/app/repositories/`, endpoints CRUD simples | Agente A |
| **C** | RAG & Procesamiento | `backend/app/processors/`, `backend/app/rag/` | Agente A |
| **D** | LLM & Lógica de Negocio | `backend/app/llm/`, `backend/app/services/`, `backend/app/strategies/`, `backend/app/algorithms/`, `backend/app/events/` | Agentes B y C |
| **E** | Frontend | `frontend/` completo | Agente A (solo necesita el contrato de la API, no que esté implementada) |
| **F** | QA / Integración | `backend/tests/`, revisión cruzada, `README.md` | Todos (corre al final de cada fase) |

**Paralelización real:**
- Fase 0 (Agente A): trabaja solo, nadie más empieza hasta que termine.
- Fase 1: Agente B y Agente C pueden trabajar **en paralelo** (no comparten archivos).
- Fase 1: Agente E puede empezar **en paralelo** también, usando un archivo de contrato de API (mock) que define el Agente A.
- Fase 2: Agente D necesita que B y C hayan terminado.
- Agente F corre **al cierre de cada fase**, nunca en paralelo con quien escribe el código que va a testear.

---

## 3. Mecanismo de coordinación

### 3.1 Archivo de estado: `docs/AGENTS_STATUS.md`

Este archivo lo crea el Agente A en la Fase 0 y todos los demás lo actualizan. Formato:

```markdown
# Estado de Agentes — StudyAI

## Fase 0 — Setup (Agente A)
- [x] Estructura de carpetas creada
- [x] FastAPI app factory funcionando (`uvicorn main:app` responde en /health)
- [x] Alembic configurado
- [x] .env.example creado
Estado: COMPLETA ✅

## Fase 1 — Backend Core + RAG (Agentes B, C en paralelo)
### Agente B
- [ ] Modelo User
- [ ] Modelo Document
...
Estado: EN PROGRESO 🟡

### Agente C
- [ ] PDFProcessor
- [ ] MarkdownProcessor
...
Estado: PENDIENTE ⬜
```

**Regla**: ningún agente marca una tarea como `[x]` sin haber corrido su criterio de aceptación.

### 3.2 Contrato de API (evita que Frontend espere al Backend)

El Agente A, en la Fase 0, crea `docs/api_contract.yaml` (OpenAPI mínimo) con los endpoints esperados, sus request/response shapes — **sin implementación real**. El Agente E (Frontend) construye contra ese contrato usando mocks (`msw` o JSON estático), y el Agente B/D implementan después contra el mismo contrato. Cuando ambos lados están listos, se conectan y se valida con el Agente F.

### 3.3 Aislamiento de carpetas (evita conflictos de git)

Cada agente trabaja en su propia rama:
```
agent/setup
agent/backend-core
agent/rag
agent/llm-services
agent/frontend
```
Se mergean a `main` solo cuando el Agente F valida la fase correspondiente.

---

## 4. Plan paso a paso por fases

Cada tarea está escrita como **el prompt exacto que le darías al agente** en su sesión de Claude Code, junto con su criterio de aceptación. Las tareas están deliberadamente pequeñas (15-45 min de trabajo de agente cada una).

---

### FASE 0 — Setup del Proyecto (Agente A, en solitario)

**Objetivo**: que el esqueleto del proyecto exista y corra, sin lógica de negocio.

#### Tarea 0.1 — Estructura de carpetas
> **Prompt para el agente**: "Crea la estructura de carpetas completa para el proyecto StudyAI según el árbol de directorios del documento `studyai_plan.md` sección 7. Crea únicamente carpetas y archivos `__init__.py` vacíos donde corresponda en Python. No implementes ninguna lógica todavía."

**Criterio de aceptación**: `tree backend/ frontend/` coincide con el árbol del plan original.

#### Tarea 0.2 — FastAPI app factory + health check
> **Prompt**: "En `backend/main.py`, crea la app de FastAPI usando el patrón de application factory. Agrega un endpoint `GET /health` que devuelva `{\"status\": \"ok\"}`. Configura CORS para permitir `http://localhost:5173`. No agregues rutas de negocio todavía."

**Criterio de aceptación**: `uvicorn main:app --reload` levanta sin error y `curl localhost:8000/health` devuelve `{"status": "ok"}`.

#### Tarea 0.3 — Configuración con pydantic-settings
> **Prompt**: "Crea `backend/app/core/config.py` con una clase `Settings(BaseSettings)` que lea las variables de entorno descritas en la sección 9 del plan original (`ANTHROPIC_API_KEY`, `LLM_MODEL_PLAN`, `LLM_MODEL_QUIZ`, `DATABASE_URL`, `CHROMA_PERSIST_DIR`, `EMBEDDING_MODEL`, `APP_ENV`, `SECRET_KEY`, `CORS_ORIGINS`). Crea `.env.example` con esas variables vacías o con valores de ejemplo."

**Criterio de aceptación**: `python -c "from app.core.config import Settings; print(Settings())"` no lanza error con un `.env` de prueba.

#### Tarea 0.4 — SQLAlchemy engine + Alembic
> **Prompt**: "Configura SQLAlchemy en `backend/app/db/session.py` con `engine` y `SessionLocal` apuntando a SQLite (`DATABASE_URL` desde Settings). Crea `backend/app/db/base.py` con la `Base` declarativa. Inicializa Alembic en `backend/alembic.ini` y `backend/app/db/migrations/`, configurado para detectar los modelos desde `app.db.base.Base`."

**Criterio de aceptación**: `alembic revision --autogenerate -m "init"` corre sin error (aunque no haya modelos todavía, no debe fallar).

#### Tarea 0.5 — Contrato de API (OpenAPI mínimo)
> **Prompt**: "Crea `docs/api_contract.yaml` en formato OpenAPI 3.0 describiendo (sin implementar) los siguientes endpoints: `POST /documents/upload`, `GET /documents`, `POST /goals`, `GET /goals/{id}`, `POST /plans/generate`, `GET /plans/{id}/status`, `GET /plans/{id}`, `GET /sessions/{id}`, `POST /sessions/{id}/complete`, `GET /quizzes/{session_id}`, `POST /quizzes/{id}/submit`. Define los schemas de request/response basándote en el modelo de datos de la sección 4.3 del plan original."

**Criterio de aceptación**: el YAML es válido (se puede cargar en Swagger Editor sin errores).

#### Tarea 0.6 — Estado inicial de coordinación
> **Prompt**: "Crea `docs/AGENTS_STATUS.md` con la estructura de fases y agentes descrita en este plan, marcando la Fase 0 como completa con checklist de las tareas 0.1 a 0.5."

**Criterio de aceptación**: el archivo existe y refleja el estado real.

> ⛔ **Punto de control**: no continuar a la Fase 1 hasta que las tareas 0.1–0.6 estén en verde. El Agente F valida esto corriendo `uvicorn main:app` y revisando que el árbol de carpetas esté completo.

---

### FASE 1A — Backend Core / Datos (Agente B)

**Objetivo**: modelos, schemas, repositorios y endpoints CRUD simples (sin IA todavía).

#### Tarea 1.1 — Modelo `User`
> **Prompt**: "Crea el modelo SQLAlchemy `User` en `backend/app/models/user.py` con columnas: `id`, `email`, `hashed_password`, `created_at`. Solo el modelo, sin endpoints ni lógica de autenticación todavía."

**Criterio**: `alembic revision --autogenerate -m "add user"` genera la migración correctamente.

#### Tarea 1.2 — Modelo `Document`
> **Prompt**: "Crea el modelo `Document` en `backend/app/models/document.py` con columnas: `id`, `user_id` (FK a users), `filename`, `file_type`, `file_size`, `status`, `created_at`. Status debe ser un Enum de Python (`PENDING`, `INDEXED`, `FAILED`)."

**Criterio**: migración autogenerada sin errores.

#### Tarea 1.3 — Modelos `Goal`, `Plan`, `PlanTopic`
> **Prompt**: "Crea los modelos `Goal`, `Plan` y `PlanTopic` según las tablas `goals`, `plans`, `plan_topics` de la sección 4.3 del plan original, con sus relaciones (`relationship()`) correspondientes."

**Criterio**: migración autogenerada sin errores; revisar que las FKs estén correctamente definidas.

#### Tarea 1.4 — Modelos `Session`, `SessionMaterial`
> **Prompt**: "Crea los modelos `Session` y `SessionMaterial` según la tabla `sessions` y `session_materials`."

**Criterio**: igual que anterior.

#### Tarea 1.5 — Modelos `Quiz`, `QuizQuestion`, `QuizResult`, `FlashcardReview`
> **Prompt**: "Crea los 4 modelos restantes del esquema de la sección 4.3: `Quiz`, `QuizQuestion`, `QuizResult`, `FlashcardReview` (este último para el algoritmo SM-2: `easiness_factor`, `interval_days`, `next_review_date`, `repetition_count`)."

**Criterio**: `alembic upgrade head` aplica todas las migraciones sin error sobre una DB SQLite limpia.

#### Tarea 1.6 — Schemas Pydantic (Document, Goal)
> **Prompt**: "Crea los schemas Pydantic en `backend/app/schemas/document.py` y `goal.py`: `DocumentCreate`, `DocumentResponse`, `GoalCreate`, `GoalResponse`, `GoalUpdate`. Deben reflejar los modelos ORM correspondientes (usa `model_config = ConfigDict(from_attributes=True)`)."

**Criterio**: `python -c "from app.schemas.document import DocumentResponse"` no lanza error.

#### Tarea 1.7 — Repository Pattern base + DocumentRepository
> **Prompt**: "Implementa `backend/app/repositories/base.py` con la clase abstracta `BaseRepository` (métodos `find_by_id`, `save`, `delete`, `list_all`) tal como se describe en la sección 6 del plan original. Luego implementa `DocumentRepository` heredando de ella."

**Criterio**: test unitario simple que guarda y recupera un `Document` de una SQLite en memoria, pasa.

#### Tarea 1.8 — GoalRepository + endpoints CRUD de Goals
> **Prompt**: "Implementa `GoalRepository` y los endpoints `POST /goals`, `GET /goals/{id}`, `PUT /goals/{id}` en `backend/app/api/v1/routes/goals.py`, usando el repositorio (no acceso directo a la DB desde la ruta)."

**Criterio**: con `httpx.AsyncClient`, un test de integración crea una meta, la lee, y la actualiza correctamente (status 200/201 en cada caso).

#### Tarea 1.9 — Endpoint de upload de documentos (sin procesamiento aún)
> **Prompt**: "Implementa `POST /documents/upload` que reciba un `UploadFile`, valide que la extensión sea `.pdf` o `.md`, guarde el archivo en `backend/storage/uploads/` y cree el registro `Document` con status `PENDING`. NO implementes el procesamiento ni el RAG todavía, eso lo hace otro agente."

**Criterio**: subir un PDF de prueba vía `curl -F "file=@test.pdf"` devuelve 201 y crea el registro en DB con status `PENDING`.

> ⛔ **Punto de control Fase 1A**: el Agente F corre los tests de integración de `documents` y `goals`. Deben pasar al 100% antes de mergear `agent/backend-core` a `main`.

---

### FASE 1B — RAG y Procesamiento (Agente C, en paralelo con B)

**Objetivo**: pipeline de ingesta de documentos funcionando de punta a punta, independiente del resto del backend.

#### Tarea 1.10 — `BaseProcessor` + `PDFProcessor`
> **Prompt**: "Crea `backend/app/processors/base.py` con la clase abstracta `BaseProcessor` (método `extract_text(file_path) -> str`). Implementa `PDFProcessor` en `pdf_processor.py` usando PyMuPDF (`fitz`), que extraiga el texto plano de un PDF."

**Criterio**: test unitario que procesa un PDF de prueba (3-5 páginas) y devuelve texto no vacío.

#### Tarea 1.11 — `MarkdownProcessor` + `DocumentProcessorFactory`
> **Prompt**: "Implementa `MarkdownProcessor` (lee el archivo .md y devuelve su contenido, removiendo metadata/frontmatter si existe). Implementa `DocumentProcessorFactory` según el patrón Factory de la sección 6.1 del plan original."

**Criterio**: test que llama `DocumentProcessorFactory.create("pdf")` y `.create("md")` devuelve las clases correctas; `.create("docx")` lanza `UnsupportedFileTypeError`.

#### Tarea 1.12 — `Chunker`
> **Prompt**: "Implementa `backend/app/rag/chunker.py` usando `RecursiveCharacterTextSplitter` de LangChain, con chunks de ~500 tokens y 50 tokens de overlap. Expón una función `chunk_text(text: str) -> list[str]`."

**Criterio**: test que verifica que un texto de 5000 caracteres se divide en múltiples chunks con el overlap esperado.

#### Tarea 1.13 — `Embedder` (sentence-transformers)
> **Prompt**: "Implementa `backend/app/rag/embedder.py` cargando el modelo `all-MiniLM-L6-v2` de sentence-transformers (carga lazy/singleton para no recargar el modelo en cada llamada). Expón `embed(texts: list[str]) -> list[list[float]]`."

**Criterio**: test que embebe 3 textos y verifica que devuelve 3 vectores de 384 dimensiones.

#### Tarea 1.14 — `VectorStore` (ChromaDB wrapper)
> **Prompt**: "Implementa `backend/app/rag/vector_store.py` como wrapper de ChromaDB en modo persistente local (`CHROMA_PERSIST_DIR`). Métodos: `add(document_id, chunks, embeddings, metadata)`, `query(embedding, top_k, filter_document_ids)`, `delete_by_document_id(document_id)`."

**Criterio**: test que agrega chunks de un documento falso y los recupera con `query()`, verificando que devuelve los más similares.

#### Tarea 1.15 — `Retriever` + Pipeline completo
> **Prompt**: "Implementa `backend/app/rag/retriever.py` que orquesta: recibe una query de texto, la embebe, consulta el `VectorStore`, devuelve los top-k chunks con su metadata. Luego implementa `backend/app/processors/pipeline.py` (Pipeline Pattern, sección 6.4) que conecta: Validation → Parse (Factory) → Chunk → Embed → Store, end-to-end."

**Criterio**: test de integración que sube un PDF real de prueba, corre el pipeline completo, y verifica que se puede recuperar contenido relevante con una query relacionada al contenido del PDF.

> ⛔ **Punto de control Fase 1B**: el Agente F corre el test de integración del pipeline completo con 2-3 documentos reales (un PDF académico y un .md de notas). Deben indexarse y ser recuperables antes de mergear `agent/rag`.

---

### FASE 1C — Frontend Base (Agente E, en paralelo con B y C)

**Objetivo**: shell de la aplicación y páginas de documentos/metas funcionando contra mocks.

#### Tarea 1.16 — Setup Vite + Tailwind + shadcn/ui
> **Prompt**: "Inicializa el proyecto en `frontend/` con Vite + React + TypeScript. Configura TailwindCSS y agrega shadcn/ui con los componentes `Button`, `Card`, `Dialog`, `Input`, `Progress`. Configura el cliente Axios en `frontend/src/api/client.ts` apuntando a `http://localhost:8000`."

**Criterio**: `npm run dev` levanta sin error en `localhost:5173`.

#### Tarea 1.17 — `AppShell` + routing
> **Prompt**: "Implementa `AppShell.tsx` con un sidebar de navegación (Documentos, Metas, Plan, Sesión, Dashboard) y configura React Router con esas 5 rutas, cada una mostrando una página placeholder."

**Criterio**: navegar entre las 5 rutas desde el sidebar funciona sin recargar la página.

#### Tarea 1.18 — `DocumentsPage` con mock
> **Prompt**: "Implementa `DocumentUpload.tsx` (drag & drop de PDF/MD con barra de progreso) y `DocumentList.tsx`. Usa `msw` (Mock Service Worker) para simular las respuestas de `POST /documents/upload` y `GET /documents` siguiendo el contrato de `docs/api_contract.yaml`."

**Criterio**: subir un archivo en la UI muestra el estado de progreso y luego aparece en la lista (con datos mockeados).

#### Tarea 1.19 — `GoalsPage` con mock
> **Prompt**: "Implementa `GoalSelector.tsx` (botones de plantillas predefinidas: 'Sacar buena nota', 'Solo quiero aprender', 'Necesito memorizar') y `GoalEditor.tsx` (textarea editable). Mockea `POST /goals` y `GET /goals/{id}`."

**Criterio**: seleccionar una plantilla rellena el editor; guardar muestra confirmación visual.

> ⛔ **Punto de control Fase 1C**: el Agente F revisa visualmente (o con Playwright) que las páginas no tengan errores de consola y que los formularios validen correctamente.

---

### FASE 2 — LLM y Lógica de Negocio (Agente D)

**Requiere**: Fases 1A y 1B mergeadas a `main`.

**Objetivo**: generación de plan de estudio con IA, de punta a punta.

#### Tarea 2.1 — Cliente LLM (Anthropic SDK wrapper)
> **Prompt**: "Implementa `backend/app/llm/client.py` como singleton que envuelve el Anthropic SDK, usando `LLM_MODEL_PLAN` o `LLM_MODEL_QUIZ` según se indique. Incluye manejo de reintentos (3 intentos con backoff exponencial) y timeout configurable."

**Criterio**: test (con mock del SDK, sin gastar tokens reales) verifica que reintenta en caso de error transitorio.

#### Tarea 2.2 — Output parser seguro de JSON
> **Prompt**: "Implementa `backend/app/llm/output_parsers.py` con una función `parse_llm_json(raw_text: str) -> dict` que limpie markdown fences (```json), maneje JSON malformado con un reintento de reparación, y lance una excepción clara si falla."

**Criterio**: test con 3 casos: JSON limpio, JSON con fences de markdown, JSON corrupto (debe lanzar excepción controlada).

#### Tarea 2.3 — Prompt de análisis de temas
> **Prompt**: "Implementa `backend/app/llm/prompts/topic_analysis.py` con la función `build_topic_analysis_prompt(chunks: list[str], goal: str) -> str`, siguiendo la lógica del Flujo 2 del plan original (LLM call #1: identificar temas, subtemas, dificultad 1-5, relevancia para la meta). El prompt debe pedir explícitamente output en JSON con un schema definido."

**Criterio**: revisión manual del prompt; test que verifica que el string generado contiene las variables esperadas (chunks, goal) interpoladas correctamente.

#### Tarea 2.4 — `GoalStrategy` (Strategy Pattern)
> **Prompt**: "Implementa `backend/app/strategies/base.py` (`GoalStrategy` abstracta) y las 3 implementaciones (`ExamStrategy`, `LearningStrategy`, `MemorizationStrategy`) según la sección 6.3 del plan original, cada una con su `get_weighting_prompt()` y `get_session_config()`. Implementa `GoalStrategyFactory`."

**Criterio**: test que verifica que cada estrategia devuelve un prompt distinto y una configuración de sesión coherente con su tipo de meta.

#### Tarea 2.5 — Algoritmo SM-2
> **Prompt**: "Implementa `backend/app/algorithms/sm2.py` con la función `calculate_next_review(easiness_factor: float, interval_days: int, repetition_count: int, quality: int) -> SM2Result` siguiendo exactamente la fórmula de la sección 3 (Mejora 2) del plan original. `SM2Result` debe incluir `new_ef`, `new_interval`, `next_review_date`, `new_repetition_count`."

**Criterio**: test con casos conocidos de SM-2 (quality=5 aumenta el intervalo, quality<3 lo reinicia a 1 día) — usar valores de ejemplo documentados del algoritmo original para verificar exactitud numérica.

#### Tarea 2.6 — Prompt de diseño de sesiones (Pareto + Ebbinghaus)
> **Prompt**: "Implementa `backend/app/llm/prompts/plan_generation.py`: dado el output de la Tarea 2.3 (lista de temas con relevancia/dificultad), filtra el top 20% por relevancia (Pareto), y construye el prompt para que el LLM distribuya esos temas en sesiones de 25 minutos, devolviendo cantidad de sesiones e intervalos sugeridos según Ebbinghaus (1d, 3d, 7d, 14d, 30d)."

**Criterio**: test que verifica que el filtro de Pareto efectivamente reduce la lista de temas a ~20% antes de construir el prompt.

#### Tarea 2.7 — Prompt de generación de contenido + quiz
> **Prompt**: "Implementa `backend/app/llm/prompts/content_gen.py` (genera markdown con resumen, explicación y keywords para YouTube) y `quiz_gen.py` (genera 5 flashcards + 5 multiple choice por sesión), ambos siguiendo el Flujo 2 (LLM call #3) del plan original."

**Criterio**: revisión manual de que el prompt pide explícitamente el formato de salida (markdown para contenido, JSON con schema para quiz).

#### Tarea 2.8 — `PlanService` (orquestador) + generación asíncrona
> **Prompt**: "Implementa `backend/app/services/plan_service.py`, el orquestador que: recibe `goal_id` y `document_ids`, recupera chunks vía Retriever, llama secuencialmente a los 3 LLM calls (2.3, 2.6, 2.7) usando la estrategia correspondiente (2.4), y guarda el resultado vía `PlanRepository`. Debe correr como `BackgroundTask` de FastAPI. Implementa el endpoint `POST /plans/generate` (devuelve `plan_id` con status `PROCESSING` inmediatamente) y `GET /plans/{id}/status`."

**Criterio**: test de integración (con LLM mockeado) que llama `POST /plans/generate`, recibe `PROCESSING`, espera, y verifica que el status cambia a `READY` con un plan guardado en DB.

#### Tarea 2.9 — `SessionEventBus` (Observer)
> **Prompt**: "Implementa `backend/app/events/session_events.py` según la sección 6.5 del plan original. Suscribe (por ahora) un handler dummy que solo loguee el evento `session.completed`."

**Criterio**: test que emite el evento y verifica que el handler se ejecuta.

#### Tarea 2.10 — `SessionService` + `QuizService` + `ProgressService`
> **Prompt**: "Implementa `SessionService` (gestiona el ciclo de vida de una sesión: iniciar, completar), `QuizService` (entrega preguntas, recibe respuestas, califica multiple choice automáticamente), y `ProgressService` (se suscribe al evento `session.completed` y actualiza `FlashcardReview` usando el algoritmo SM-2 de la Tarea 2.5). Implementa los endpoints `GET /sessions/{id}`, `POST /sessions/{id}/complete`, `GET /quizzes/{session_id}`, `POST /quizzes/{id}/submit`."

**Criterio**: test de integración end-to-end: completar un quiz con calidad variable por flashcard y verificar que `FlashcardReview.next_review_date` se actualiza correctamente según SM-2.

> ⛔ **Punto de control Fase 2**: el Agente F corre el flujo completo (subir documento → crear meta → generar plan → completar una sesión → ver que SM-2 actualizó las revisiones) de punta a punta antes de mergear `agent/llm-services`.

---

### FASE 3 — Frontend de Sesión y Dashboard (Agente E, continúa)

**Requiere**: Fase 2 mergeada (para conectar contra la API real, no mocks).

#### Tarea 3.1 — Conectar `DocumentsPage` y `GoalsPage` a la API real
> **Prompt**: "Reemplaza los mocks de `msw` en `DocumentsPage` y `GoalsPage` por llamadas reales usando TanStack Query contra los endpoints ya implementados por el Agente B."

**Criterio**: subir un documento real y crear una meta real persiste en la base de datos del backend (verificable con `sqlite3 studyai.db`).

#### Tarea 3.2 — `PlanPage` con polling
> **Prompt**: "Implementa `PlanPage.tsx` con `usePlan.ts` (hook que hace polling a `GET /plans/{id}/status` cada 3 segundos con TanStack Query `refetchInterval`). Mientras `status === PROCESSING`, muestra `PlanStatusBanner`. Cuando `READY`, renderiza `PlanOverview` con la lista de `SessionCard`."

**Criterio**: generar un plan real muestra el banner de carga y luego el plan completo sin recargar la página.

#### Tarea 3.3 — `SessionPage`: fase de estudio
> **Prompt**: "Implementa `useTimer.ts` (Web Worker para evitar drift de tiempo) y `StudyTimer.tsx` + `StudyMaterial.tsx` (renderiza el markdown generado con `react-markdown`) + `ResourceLinks.tsx` (construye URLs de búsqueda de YouTube a partir de las keywords, usando `utils/youtube.ts`, según la Mejora 1 del plan original — **nunca renderizar URLs generadas directamente por el LLM**)."

**Criterio**: la fase de estudio corre 25 minutos reales (o un valor reducido configurable para testing), muestra el material y los links de búsqueda funcionan al hacer click.

#### Tarea 3.4 — `SessionPage`: receso activo
> **Prompt**: "Implementa `BreakTimer.tsx` con la lista estática de 5 actividades curadas (Mejora 5 del plan original), eligiendo una aleatoriamente al iniciar el receso de 5 minutos."

**Criterio**: el receso muestra una actividad al azar y transiciona automáticamente a la fase de test al terminar.

#### Tarea 3.5 — `SessionPage`: fase de test (quiz)
> **Prompt**: "Implementa `FlashCard.tsx` (flip animation, pregunta/respuesta) + `QualityRating.tsx` (botones 0-5 para SM-2) + `MultipleChoice.tsx` + `QuizTimer.tsx`. Al completar las 10 preguntas (5 flashcards + 5 MC), envía los resultados a `POST /sessions/{id}/complete`."

**Criterio**: completar un quiz real actualiza las `FlashcardReview` en el backend (verificable consultando la API después).

#### Tarea 3.6 — `DashboardPage`
> **Prompt**: "Implementa `ScoreChart.tsx` (Recharts, línea de score por sesión), `WeakTopics.tsx` (lista de temas con menor score histórico), `UpcomingReviews.tsx` (próximas revisiones según `next_review_date` de SM-2)."

**Criterio**: tras completar 2-3 sesiones reales, el dashboard refleja datos reales y no placeholders.

> ⛔ **Punto de control Fase 3**: el Agente F corre un flujo manual completo como usuario final: subir notas reales → crear meta → generar plan → completar una sesión entera → revisar el dashboard. Documenta cualquier bug encontrado en `docs/AGENTS_STATUS.md`.

---

### FASE 4 — QA, Pulido y Documentación (Agente F, en solitario)

#### Tarea 4.1 — Suite de tests unitarios críticos
> **Prompt**: "Revisa que existan tests unitarios para: `sm2.py`, `chunker.py`, `output_parsers.py`, `DocumentProcessorFactory`, `GoalStrategyFactory`. Completa los que falten. Corre `pytest --cov=app` y reporta cobertura."

**Criterio**: cobertura ≥ 70% en los módulos críticos (`algorithms`, `rag`, `llm/output_parsers`, `processors`).

#### Tarea 4.2 — Tests de integración end-to-end
> **Prompt**: "Escribe un test de integración único que simule el flujo completo: subir documento → crear meta → generar plan (con LLM mockeado) → completar sesión → verificar dashboard data. Debe correr en menos de 10 segundos."

**Criterio**: el test pasa de forma reproducible (correrlo 3 veces consecutivas sin fallos intermitentes).

#### Tarea 4.3 — README de instalación local
> **Prompt**: "Escribe `README.md` en la raíz con: requisitos (Python 3.11+, Node 18+), pasos de instalación backend (venv, requirements, alembic upgrade), pasos de instalación frontend (npm install), cómo correr ambos servidores, y cómo correr los tests."

**Criterio**: una persona nueva sigue el README desde cero y logra levantar el proyecto sin pasos faltantes.

#### Tarea 4.4 — Revisión de seguridad básica antes de cerrar Fase 1 local
> **Prompt**: "Revisa que: las rutas de subida de archivos validen tamaño máximo, que no haya SQL crudo sin parametrizar, que las API keys no estén hardcodeadas en ningún archivo del repo, y que `.env` esté en `.gitignore`."

**Criterio**: checklist de seguridad documentado en `docs/AGENTS_STATUS.md` con cada punto marcado.

---

## 5. Resumen visual del orden de ejecución

```
FASE 0 (Agente A, solo)
   │
   ▼
   ├── FASE 1A (Agente B) ──┐
   ├── FASE 1B (Agente C) ──┼──► [Punto de control: Agente F valida]
   └── FASE 1C (Agente E) ──┘
              │
              ▼
   FASE 2 (Agente D, requiere B + C)
              │
              ▼
   FASE 3 (Agente E, continúa, requiere Fase 2)
              │
              ▼
   FASE 4 (Agente F, solo) → Proyecto local funcional completo
```

---

## 6. Cómo usar este documento en la práctica

1. Abre una sesión de Claude Code por cada agente activo (puedes usar terminales separadas o `git worktree` para que cada uno trabaje en su propia rama sin pisarse).
2. Copia el prompt de la tarea correspondiente tal cual está escrito arriba — están diseñados para ser específicos y acotados.
3. Antes de pasar a la siguiente tarea del mismo agente, verifica el criterio de aceptación.
4. Actualiza `docs/AGENTS_STATUS.md` manualmente o pidiéndole al mismo agente que lo actualice al final de cada tarea.
5. Nunca salgas de una Fase con puntos de control en rojo — corregir en ese momento es barato; corregir tres fases después es caro.

---

## 7. Qué hacer si un agente "se satura"

Señales de que un agente está perdiendo coherencia:
- Empieza a proponer cambios en archivos fuera de su carpeta asignada.
- Repite código ya existente en lugar de reutilizar lo que otro agente creó.
- Pierde de vista el criterio de aceptación de la tarea actual.

**Solución**: cierra la sesión, abre una nueva, y dale como contexto inicial únicamente: (1) la tarea puntual de este documento, (2) el contenido actual de los 2-3 archivos relevantes (no el proyecto completo). Las sesiones largas acumulan contexto innecesario; las tareas atómicas de este plan están diseñadas justamente para permitir reinicios frecuentes sin perder progreso.
