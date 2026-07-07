# Estado del Proyecto — StudyAI

> Este MVP se construyó como **monorepo único** (backend + frontend) en lugar de
> la coreografía de 5 agentes/ramas del plan multi-agente. Ese esquema es un
> *método de trabajo*, no un requisito del producto; para un MVP demostrable, un
> solo repo coherente es más simple y evita conflictos de merge. La arquitectura
> por capas y los patrones del plan (Repository, Factory, Strategy, Pipeline,
> Observer) **sí** se respetan.

## Fase 0 — Setup ✅
- [x] Estructura de carpetas (backend por capas + frontend)
- [x] FastAPI app factory + `GET /health`
- [x] Configuración con `pydantic-settings` (`app/core/config.py`) + `.env.example`
- [x] SQLAlchemy engine/session + `Base` + Alembic configurado (`create_all` al arranque)
- [x] Contrato de API (`docs/api_contract.yaml`) — además el backend sirve OpenAPI en `/docs`
- Estado: **COMPLETA**

## Fase 1A — Backend Core / Datos ✅
- [x] Modelos: User, Document, Goal, Plan, PlanTopic, Session, SessionMaterial,
      Quiz, QuizQuestion, QuizResult, FlashcardReview
- [x] Schemas Pydantic (document, goal, plan, session, quiz, dashboard)
- [x] Repository Pattern (`base` + document/goal/plan/session/quiz/flashcard)
- [x] Endpoints CRUD de Goals (`POST/GET/PUT /goals`)
- [x] Upload de documentos (`POST /documents/upload`) con validación y estado `PENDING`
- Estado: **COMPLETA**

## Fase 1B — RAG y Procesamiento ✅
- [x] `BaseProcessor` + `PDFProcessor` (PyMuPDF, import perezoso) + `MarkdownProcessor`
- [x] `DocumentProcessorFactory` (Factory)
- [x] `Chunker` (LangChain con *fallback* puro-Python)
- [x] `Embedder` (sentence-transformers con *fallback* hashing determinista, 384-d)
- [x] `VectorStore` (ChromaDB con *fallback* cosine en memoria)
- [x] `Retriever` + `IngestionPipeline` (Validate→Parse→Chunk→Embed→Store)
- Estado: **COMPLETA** — corre sin dependencias pesadas; se auto-mejora al instalarlas.

## Fase 2 — LLM y Lógica de Negocio ✅
- [x] Proveedor LLM *pluggable*: `AnthropicProvider` (SDK, reintentos+backoff) /
      `MockLLMProvider` (offline determinista). `get_llm_provider()` decide por config.
- [x] `parse_llm_json` (limpia fences, repara comas colgantes)
- [x] Prompts: topic_analysis, plan_generation, content_gen, quiz_gen
- [x] `GoalStrategy` (Exam/Learning/Memorization) + Factory
- [x] Algoritmo SM-2 (`app/algorithms/sm2.py`) + Pareto (`app/algorithms/pareto.py`)
- [x] `PlanService` orquestador + generación asíncrona (`BackgroundTask`)
- [x] `SessionEventBus` (Observer) → `session.completed`
- [x] `SessionService`, `QuizService` (autocalifica opción múltiple), `ProgressService` (SM-2)
- Estado: **COMPLETA**

## Fase 3 — Frontend ✅
- [x] Vite + React + TypeScript + TailwindCSS + TanStack Query + React Router + Axios
- [x] Páginas: Documentos, Metas, Plan (con polling), Sesión (estudio→receso→test), Dashboard
- [x] Timer, flashcards con flip + rating 0-5, opción múltiple, links de búsqueda de YouTube
- Estado: **COMPLETA (MVP)** — conectado a la API real (sin mocks).

## Fase 4 — QA / Docs ✅
- [x] Tests unitarios: sm2, chunker, output_parsers, ProcessorFactory, GoalStrategy, pareto
- [x] Test de integración end-to-end (upload→plan→sesión→quiz→dashboard) con LLM mockeado
- [x] `README.md` con instalación y ejecución
- Estado: **22 tests en verde**

## Checklist de seguridad básica
- [x] Upload valida extensión (`.pdf`/`.md`) y tamaño máximo (`MAX_UPLOAD_MB`)
- [x] Sin SQL crudo: todo vía SQLAlchemy ORM parametrizado
- [x] API key no hardcodeada: se lee de entorno; `.env` en `.gitignore`
- [x] URLs de YouTube se construyen como búsqueda desde keywords — **nunca** se
      renderizan URLs generadas por el LLM (Mejora 1 del plan)
- [ ] Pendiente (post-MVP): autenticación real (hoy usuario demo único), rate limiting,
      withholding de respuestas del quiz hasta el submit.
