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

## Integración incremental del frontend

Seguimiento de [`Plan-New-Frontend.md`](Plan-New-Frontend.md), independiente del estado del MVP legacy:

- A01: mapa de diseño y matriz entregados como handoff, pero Dev-Reviewer devolvió `CAMBIOS REQUERIDOS`; no está aprobada. Siguen pendientes el acuerdo del CTA deshabilitado/contenido largo, la contención visual parcial y la reproducibilidad de extractos históricos. Penpot no estuvo autenticado en esta corrección.
- A02: línea base implementada y aprobada por Dev-Reviewer, commit `cc3f115`; evidencia en [`baseline.md`](frontend-integration/baseline.md).
- A03: entorno QA aislado implementado y aprobado, commit `46bebfa`; guía en [`qa.md`](frontend-integration/qa.md).
- A04: smoke Bruno HTTP real implementado y aprobado, commit `0e01e89`; colección `frontend/bruno/smoke/` y guía en [`qa.md`](frontend-integration/qa.md).
- A05: tokens y componentes base implementados y técnicamente aprobados en commit `c703f8f`; revisión visual/paridad con Penpot sigue pendiente por A01 y falta de autenticación.
- A06: navegación responsive, Home mínima, 404, validación de IDs, títulos/foco y ajustes responsive legacy implementados y aprobados técnicamente por Dev-Reviewer tras dos ciclos de corrección y una tercera revisión. Commit `58e3a97861993122f41a712310bc9b5d5d5dc2ca`. Evidencia registrada: 75 pruebas Vitest; `test:qa:runner`, 33/33 en dos ejecuciones; `test:qa`, 78/78 checks (API 3 + E2E 3 + Bruno 72), runtime `MOCK` y E2E a 320 px con GETs del backend retrasados 500 ms.
- A07: aprobada técnicamente por Dev-Reviewer en el segundo pase del follow-up (2026-09-30); el primer pase de ese follow-up solicitó cambios (historial fechado 2026-09-30). La base está committed en `5ecad50b7c006b4cc0b99157b66ee1736cc699b1`; la corrección posterior sigue sin commit. Sus verificaciones locales posteriores a la base —no atribuibles al commit `5ecad50`— registraron 107 Vitest, lint/build/typecheck QA exit 0, runner 33/33, API 3/3 + Bruno 21/21 requests y 51/51 aserciones, E2E 3/3 y QA integrado 78/78 con runtime `MOCK` y cleanup confirmado. La caché distingue procedencia `GET`/`POST` y revisión; `PlanPage` exige GET exitoso para mostrar vacío o habilitar el CTA y revalida sincrónicamente IDs `INDEXED`. Esta validación de cliente es provisional y no elimina la carrera backend, que aún no revalida atómicamente documentos al crear el plan. Las casillas A07 corresponden a los entregables técnicos, no a la integración Home de A10 ni a atomicidad backend. Revisión visual/Penpot, A01, `PEN-03` y decisiones de producto §8 siguen sin aprobación; A08+ continúan pendientes en el plan. Véase [`a07-shared-upload-and-goal-templates.md`](frontend-integration/a07-shared-upload-and-goal-templates.md).
- A08–A13 (2026-10-17, plan ODD `studyai-fluid-learning`): ProviderSetup `e207aba`; correcciones transversales T13 `74f81cb`; base visual T14 `01cae42`; landing y navegación del mockup T15 `d741f93`; Inicio/coordinador T05 `b4d2dda`; Plan y Temas T06 `e966140`; Sesión y Práctica T07 `576fc15`; Estadísticas T08 `a096ea0`; demo simulada y carga diferida T09 `57e536a`. Verificación final: Vitest, `tsc`, `test:qa:types`, build, `test:qa` (Bruno + API + E2E 4/4, incluido el recorrido completo desde Inicio) y backend 269/269. Barrido responsive a 320/375/768/1024/1440 px con reduced motion, sin desbordamiento ni errores de consola. Los widgets del mockup sin contrato de API están en [`t12-contract-gaps.md`](frontend-integration/t12-contract-gaps.md).
- Onboarding UX (2026-10-17, [`plans/OnboardingUX.md`](../plans/OnboardingUX.md), rama `feat/onboarding-guidance`): guías «¿Cómo funciona esta página?», glosario `HelpTerm`, `EmptyState`, checklist «Primeros pasos» en Inicio, motivos visibles de botones deshabilitados y renombres «Conectar IA»/«Temas clave». Fases 0–4 en commits `b3f9d81`, `5245a07`, `e43e835`, `0c8af87`, `ad0bc4a`; solo frontend, sin dependencias nuevas.
- Generación que no se detiene, Fase A (2026-10-19, [`plans/GeneracionContenido_Reanudar.md`](../plans/GeneracionContenido_Reanudar.md), rama `fix/generation-resilience`): razonamiento apagado en Ollama/NVIDIA `0a4d458`, mínimo en Gemini 3 `a5863c7`, presupuestos 2048/1024/4096 con un reintento ×2 `45fd497`, prompts acotados `12d854e` y sin comillas dobles internas + esquema JSON válido `510bd6d` (Ollama abortaba con «token repeat limit reached»). T3 (OpenRouter) saltada por su compuerta. Verificado con proveedores reales: planes «Aprender» READY con DeepSeek (clave propia, 30 s), Ollama `gemma4:e4b` en CPU (≈20 min) y la nueva IA gratuita DeepSeek (36 s). La IA gratuita incluida pasa a ser DeepSeek (`DEEPSEEK_API_KEY`, leída también del `.env` de la raíz); NVIDIA y Gemini quedan solo como proveedores con clave propia. Fase B (backend): progreso por etapa guardado en el plan `c261f93`, generación con commit por paso y reanudable `c4924a5` (+ temas con forma laxa `adb14d1`), reembolso del uso gratuito por día y una sola vez `225801f`, `POST /plans/{id}/resume` `bb83ead`, recuperación al arrancar `8618eb3` y SQLite en WAL `57906ee`; verificado con la API real (reanudar con 1 llamada, `kill -9` + reinicio + reanudar, doble `/resume` = 1 uso, 429 sin usos). Fase C (frontend): tipos y `useResumePlan` `c8f1361`, `GenerationProgress` con etapa real y «Continuar generación» en el detalle (vista «Incompleto») `f55a878`, Inicio y listas con «Incompleto» + ayuda de contexto de Ollama `6d164f7`; verificado en el navegador a 320 y 1440 px (plan 2 reanudado con Ollama: TOPICS → «Preparando la sesión 2 de 3» → READY). Fase D: README, CLAUDE.md y este estado `483da05`. Revisión independiente (`/code-review` high): corregidos el reembolso del refuerzo en el día en que se gastó, la liberación del plan/refuerzo reclamado ante un error inesperado del cupo, el reembolso al fallar el guardado de un plan sin clave de idempotencia y el enfriamiento global de la IA gratuita ante errores temporales `87784aa`; listas que contaban los repasos como progreso y el 409 al continuar `ae4b3b9`. Se justifican sin cambio: la condición de `free_ai` en `/llm-settings/runtime` (documentada; coincide con la cadena) y la doble resolución del proveedor (construcción barata, sin red).
- `PEN-03` sigue abierto: no se confirmó si Inicio ocupa un sexto tab/barra inferior persistente. A06 usa un menú móvil no modal con Inicio y las secciones, sin afirmar aprobación visual ni paridad Penpot.
- Las dos decisiones de producto de la sección 8 de `Plan-New-Frontend.md` siguen pendientes; no se adoptan en A06 ni A07.
- Ver detalle, límites no cerrados y evidencias en [`a06-responsive-navigation.md`](frontend-integration/a06-responsive-navigation.md).
