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

- [x] Anthropic nativo, OpenAI/GLM/Hugging Face mediante transporte común, OpenRouter directo, NVIDIA NIM dedicado, Ollama local y mock determinista.
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

## Integración incremental del frontend

Seguimiento de [`Plan-New-Frontend.md`](Plan-New-Frontend.md), independiente del estado del MVP legacy:

- A01: mapa de diseño y matriz entregados como handoff, pero Dev-Reviewer devolvió `CAMBIOS REQUERIDOS`; no está aprobada. Siguen pendientes el acuerdo del CTA deshabilitado/contenido largo, la contención visual parcial y la reproducibilidad de extractos históricos. Penpot no estuvo autenticado en esta corrección.
- A02: línea base implementada y aprobada por Dev-Reviewer, commit `cc3f115`; evidencia en [`baseline.md`](frontend-integration/baseline.md).
- A03: entorno QA aislado implementado y aprobado, commit `46bebfa`; guía en [`qa.md`](frontend-integration/qa.md).
- A04: smoke Bruno HTTP real implementado y aprobado, commit `0e01e89`; colección `frontend/bruno/smoke/` y guía en [`qa.md`](frontend-integration/qa.md).
- A05: tokens y componentes base implementados y técnicamente aprobados en commit `c703f8f`; revisión visual/paridad con Penpot sigue pendiente por A01 y falta de autenticación.
- A06: navegación responsive, Home mínima, 404, validación de IDs, títulos/foco y ajustes responsive legacy implementados y aprobados técnicamente por Dev-Reviewer tras dos ciclos de corrección y una tercera revisión. Commit `58e3a97861993122f41a712310bc9b5d5d5dc2ca`. Evidencia registrada: 75 pruebas Vitest; `test:qa:runner`, 33/33 en dos ejecuciones; `test:qa`, 78/78 checks (API 3 + E2E 3 + Bruno 72), runtime `MOCK` y E2E a 320 px con GETs del backend retrasados 500 ms.
- A07: aprobada técnicamente por Dev-Reviewer en el segundo pase del follow-up (2026-09-30); el primer pase de ese follow-up solicitó cambios (historial fechado 2026-09-30). La base está committed en `5ecad50b7c006b4cc0b99157b66ee1736cc699b1`; la corrección posterior sigue sin commit. Sus verificaciones locales posteriores a la base —no atribuibles al commit `5ecad50`— registraron 107 Vitest, lint/build/typecheck QA exit 0, runner 33/33, API 3/3 + Bruno 21/21 requests y 51/51 aserciones, E2E 3/3 y QA integrado 78/78 con runtime `MOCK` y cleanup confirmado. La caché distingue procedencia `GET`/`POST` y revisión; `PlanPage` exige GET exitoso para mostrar vacío o habilitar el CTA y revalida sincrónicamente IDs `INDEXED`. Esta validación de cliente es provisional y no elimina la carrera backend, que aún no revalida atómicamente documentos al crear el plan. Las casillas A07 corresponden a los entregables técnicos, no a la integración Home de A10 ni a atomicidad backend. Revisión visual/Penpot, A01, `PEN-03` y decisiones de producto §8 siguen sin aprobación; A08+ continúan pendientes en el plan. Véase [`a07-shared-upload-and-goal-templates.md`](frontend-integration/a07-shared-upload-and-goal-templates.md).
- `PEN-03` sigue abierto: no se confirmó si Inicio ocupa un sexto tab/barra inferior persistente. A06 usa un menú móvil no modal con Inicio y las secciones, sin afirmar aprobación visual ni paridad Penpot.
- Las dos decisiones de producto de la sección 8 de `Plan-New-Frontend.md` siguen pendientes; no se adoptan en A06 ni A07.
- Ver detalle, límites no cerrados y evidencias en [`a06-responsive-navigation.md`](frontend-integration/a06-responsive-navigation.md).
