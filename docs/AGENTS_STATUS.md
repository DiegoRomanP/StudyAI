# Estado del Proyecto — StudyAI

Última actualización: 2026-09-30.

Este archivo describe el estado implementado del monorepo. El plan multi-agente
original se conserva en `studyai_multiagent_plan.md` como referencia histórica;
no es la cola de trabajo actual ni una fuente de verdad sobre los proveedores.

## Resumen

- Backend FastAPI y frontend Vite/React funcionando como monorepo.
- Modo demo operativo sin claves ni dependencias RAG pesadas.
- Generación de planes en segundo plano con `2 + N` llamadas LLM.
- Configuración BYO-key con ciclo `PUT clave → PATCH borrador → POST test → POST activate`.
- Suite backend: `239 passed` en la última verificación.
- Frontend: lint, 107 pruebas Vitest, build de producción, typecheck QA y suites QA pasan en la verificación del 2026-09-30; el build aún advierte un chunk JS >500 kB (825.02 kB minificado, 244.66 kB gzip en build local).

## Fases

### Fase 0 — Setup ✅

- [x] Estructura backend/frontend y configuración por entorno.
- [x] FastAPI, health check, CORS y OpenAPI en `/openapi.json`/`/docs`.
- [x] SQLAlchemy, SQLite por defecto, `create_all()` al inicio y backfills aditivos.
- [x] Contrato mantenido en `docs/api_contract.yaml`.

### Fase 1 — Datos, RAG y procesamiento ✅

- [x] Modelos, schemas, repositorios y endpoints CRUD.
- [x] Ingesta asíncrona `Validate → Parse → Chunk → Embed → Store`.
- [x] Fallbacks puros de Python para PDF opcional, embeddings, chunking y vector store.
- [x] Recuperación de contexto para la generación de planes.

### Fase 2 — LLM y lógica de negocio ✅

- [x] Anthropic nativo, OpenAI/DeepSeek mediante transporte común, OpenRouter directo, NVIDIA NIM dedicado, Ollama local y mock determinista.
- [x] Contratos por proveedor en `backend/app/llm/providers/` y registro único en `provider_registry.py`.
- [x] Perfiles de payload por modelo/proveedor, clasificación segura de errores, presupuestos y reintentos.
- [x] NVIDIA limitado a modelos curados, endpoint fijo, polling NVCF tras `202` y sin repetir POST.
- [x] Revisión, fingerprint y evidencia persistida para activar credenciales verificadas.
- [x] SM-2, Pareto, estrategias de meta, generación asíncrona y eventos de sesión.

### Fase 3 — Frontend ✅

- [x] Documentos, metas, planes con polling, sesiones, quizzes y dashboard.
- [x] Página de configuración con catálogo servido por backend y estado runtime efectivo.
- [x] Manejo de conflictos de revisión, modelos históricos incompatibles y restricciones de NVIDIA.
- [x] Enlaces de YouTube construidos como búsquedas a partir de keywords.

### Fase 4 — QA y documentación ✅

- [x] Pruebas backend unitarias, de integración y de contratos de proveedores.
- [x] Pruebas frontend de errores API y `SettingsPage` con Vitest/Testing Library.
- [x] Typecheck, build frontend y sincronización del contrato API.
- [x] README, instrucciones de agentes y documentación de arquitectura actualizados.

## Seguridad y límites vigentes

- [x] Claves cifradas en reposo; la API solo devuelve una vista enmascarada.
- [x] URLs personalizadas validadas contra SSRF al guardar y antes de usar.
- [x] Anthropic, NVIDIA y Ollama rechazan overrides de URL; NVIDIA también rechaza modelos no curados.
- [x] Cuerpos de error upstream, prompts, payloads y encabezados de autorización no se exponen.
- [x] La verificación no equivale a tener un modelo no vacío; requiere evidencia de la revisión actual.
- [x] No se renderizan URLs entregadas por el LLM.

## Pendiente fuera del MVP

- Autenticación real y multiusuario.
- Rate limiting propio de la aplicación.
- Ocultar respuestas del quiz hasta el envío.
- Integración de suscripciones ChatGPT Plus/Pro mediante Local Codex.
- Integración de Claude Pro/Max, pendiente de autorización y contrato oficial.
- Rediseño visual amplio y optimización adicional de PDF/tokens; la extracción y recuperación actuales siguen funcionando con fallbacks.
- Verificación live con cuentas reales de cada proveedor; la suite usa transporte simulado y no consume claves.

## Fuentes de verdad

- Código y pruebas ejecutables.
- `README.md`: instalación, uso y comportamiento visible.
- `CLAUDE.md`/`AGENTS.md`: arquitectura y reglas para agentes.
- `docs/api_contract.yaml`: contrato mantenido junto al OpenAPI de FastAPI.

## Historial de planes ejecutados

La integración incremental del frontend (A01–A18), la ruta adaptativa, la generación reanudable y el
onboarding UX están resumidos, con sus pendientes, en [`HISTORIAL-frontend.md`](HISTORIAL-frontend.md) y
[`HISTORIAL-producto-backend.md`](HISTORIAL-producto-backend.md). La hoja de ruta hacia SaaS de pago es
[`SaaS-Produccion.md`](SaaS-Produccion.md); la guía de QA aislado, [`qa-aislado.md`](qa-aislado.md).
