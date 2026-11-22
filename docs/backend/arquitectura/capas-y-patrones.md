# Arquitectura backend: capas y patrones

> **Leer antes de** crear o mover cualquier archivo en `backend/app/`, añadir un servicio, repositorio,
> endpoint o integración opcional. Las reglas obligatorias resumidas están en
> `.claude/rules/backend-arquitectura.md`; aquí está el porqué.

## Capas (estrictas, impuestas por directorio)

`api/v1/routes` (controllers) → `services` (orquestación) → `repositories` (acceso a datos, envuelve
la `Session` de SQLAlchemy) → `models` (entidades ORM) / `schemas` (DTOs Pydantic,
`from_attributes=True`).

- Las rutas nunca tocan el ORM: pasan por un repositorio o un servicio.
- `BaseRepository` (`app/repositories/base.py`) da a cada repo `find_by_id`/`save`/`delete`/`list_all`;
  los repos concretos añaden consultas del agregado. **Antes de escribir una consulta nueva, busca si ya
  existe en el repo del agregado.**
- Todas las rutas se montan en la **raíz** (`/documents`, `/goals`, ...), no bajo `/api/v1`, para
  coincidir con `docs/api_contract.yaml` — aunque vivan en `app/api/v1/routes/`.
- La autenticación es un usuario demo fijo (`DEFAULT_USER_ID = 1`) en `app/api/deps.py`. Esa frontera
  existe para meter auth real sin tocar rutas ni servicios: no metas otro mecanismo de auth ad hoc.

## Patrones en uso (cada uno sostiene algo; no son decorativos)

| Patrón | Dónde | Para qué |
|---|---|---|
| **Factory** | `DocumentProcessorFactory` (`app/processors/factory.py`, ext → processor), `GoalStrategyFactory` (`app/strategies/goal_strategies.py`), `get_llm_provider(db, user_id)` (`app/llm/factory.py`, ver [llm/resolucion-y-cuota-gratuita.md](../llm/resolucion-y-cuota-gratuita.md)) | Elegir implementación por tipo sin `if` repartidos |
| **Strategy** | `GoalStrategy` (Exam/Learning/Memorization) | Da forma al prompt de ponderación de temas y al `SessionConfig` por sesión (duración, mezcla flashcard/MC) |
| **Pipeline** | Ingesta: Validate → Parse (Factory) → Describe → Chunk → Embed → Store (`app/processors/pipeline.py`) | Pasos encadenables y degradables |
| **Repository** | ver arriba | Aislar el acceso a datos |
| **Observer** | `EventBus` (`app/events/session_events.py`), singleton `event_bus` | Completar una sesión publica `session.completed`; `ProgressService.register_handlers()` (en el `lifespan` de `main.py`) actualiza SM-2. Los handlers corren síncronos en la transacción del llamador; la excepción de uno nunca rompe a otro. Deduplica handlers y corre cada uno en un SAVEPOINT. |
| **Registry** | `app/llm/provider_registry.py` | Único punto de ensamblaje de proveedores LLM (sin ramas por vendor fuera de `app/llm/providers/`) |
| **Dual-implementation-with-fallback** | ver abajo | El tema recurrente del código |

### Dual-implementation-with-fallback (invariante del modo demo)

La app corre **completa sin API keys ni dependencias pesadas** y se mejora sola a Claude + RAG
semántico cuando instalas los extras y pones una clave. Cada componente adyacente a RAG tiene un
backend "real" pesado y un fallback en Python puro, elegido en `__init__`/llamada vía
`try/except ImportError`, con **interfaces idénticas en el punto de llamada**:

- `Embedder`: sentence-transformers (384-d) vs. embedder determinista por hashing.
- `VectorStore` (`app/rag/vector_store.py`): ChromaDB (persistente, coseno) vs. `_InMemoryStore`
  (JSON persistido, coseno en Python puro). Con `VECTOR_BACKEND=pgvector` y un `DATABASE_URL` Postgres,
  `_PgVectorStore` (SQL crudo sobre `document_chunks`, sin paquete `pgvector`) ocupa el lugar del
  fallback; si no arranca, registra un warning y aplica la cadena anterior.
- `Chunker`: `RecursiveCharacterTextSplitter` de LangChain vs. splitter en Python puro.
- `PDFProcessor`: `extract()` usa `pymupdf4llm` (Markdown con títulos/tablas, cada imagen escrita en
  `UPLOAD_DIR/assets/{document_id}`) y cae a texto plano PyMuPDF sin imágenes; ambos importados de forma
  perezosa. Ver [documentos/ingesta-y-figuras.md](../documentos/ingesta-y-figuras.md).
- `LLMProvider` (`app/llm/base.py`): proveedores reales (`AnthropicProvider`, `OpenAICompatibleProvider`,
  `OpenRouterProvider`, `NvidiaNimProvider`, agentes CLI) vs. `MockLLMProvider` (JSON falso,
  determinista y válido por `kind`). Nunca rompe el arranque ni con una clave mala (cae al mock con un
  warning en el log).

**Al añadir una capacidad nueva aquí, sigue la misma forma**: una interfaz, dos backends, degradación
silenciosa con una línea de log — nunca una dependencia dura del paquete opcional.

## Reutilizar antes de crear

Antes de añadir lógica nueva, busca la existente (el mapa de abajo cubre lo que más se duplica por error):

| Necesitas | Reutiliza |
|---|---|
| Llamar al LLM con presupuesto de salida y reintento por `LLM_OUTPUT_LIMIT` | `complete_within_budget` + `OUTPUT_BUDGETS` (`app/llm/output_budget.py`) |
| Parsear JSON del LLM | `parse_llm_json` (`app/llm/output_parsers.py`) |
| Resolver qué proveedor usar | `resolve_llm_provider()` / `get_llm_provider()` (`app/llm/factory.py`) |
| Gastar/devolver un uso de la IA gratuita | `app/services/free_ai_quota.py` (`uses_free_ai`, ver [llm/resolucion-y-cuota-gratuita.md](../llm/resolucion-y-cuota-gratuita.md)) |
| Registrar tokens/coste | `UsageRecorder` (`app/services/usage_recorder.py`) |
| Errores de dominio con código | `StudyAIError`, `NotFoundError`, `ValidationError` (`app/core/`) |
| Validar una URL saliente | `assert_safe_outbound_url` (`app/core/url_safety.py`) |
| Cifrar/enmascarar secretos | `encrypt_secret`/`decrypt_secret`/`mask_secret` (`app/core/security.py`) |
| Leer configuración | `get_settings()` (`app/core/config.py`) |
| Recuperar trabajos en segundo plano tras reinicio | `recover_interrupted_plans` / `recover_interrupted_reinforcements` |
