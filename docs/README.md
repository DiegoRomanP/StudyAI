# Documentación de StudyAI

Organizada por **lado** (backend / frontend) y dentro por **funcionalidad**. Cada documento empieza con
«Leer antes de…». El código y los tests mandan si la prosa los contradice; en ese caso, corrige el documento.

## Mapa: si tocas este código → lee y actualiza este documento

| Código | Documento |
|---|---|
| `backend/app/api/`, `services/`, `repositories/`, `models/`, `schemas/` (estructura, capas, patrones) | [backend/arquitectura/capas-y-patrones.md](backend/arquitectura/capas-y-patrones.md) |
| `backend/app/core/config.py`, `.env*`, `DEPLOYMENT_MODE` | [backend/arquitectura/configuracion-y-despliegue.md](backend/arquitectura/configuracion-y-despliegue.md) |
| `backend/app/services/credit_service.py`, `ai_charge.py`, `routes/account.py`, `models/credit_ledger.py`, `core/disposable_domains.py`, `services/billing/`, `routes/billing.py`, `models/billing.py` | [backend/pagos/creditos-y-cobros.md](backend/pagos/creditos-y-cobros.md) |
| `backend/app/db/`, modelos nuevos/columnas, SQL crudo, borrados | [backend/arquitectura/base-de-datos.md](backend/arquitectura/base-de-datos.md) |
| `backend/app/llm/factory.py`, `default_free_provider.py`, `services/free_ai_quota.py` | [backend/llm/resolucion-y-cuota-gratuita.md](backend/llm/resolucion-y-cuota-gratuita.md) |
| `backend/app/llm/providers/`, `provider_registry.py`, `nvidia_models.py`, `llm_settings_service.py`, `core/url_safety.py`, `core/security.py` | [backend/llm/proveedores-y-credenciales.md](backend/llm/proveedores-y-credenciales.md) |
| `openai_compatible_provider.py`, `output_budget.py`, `output_parsers.py`, `_Generator._llm_call` | [backend/llm/transporte-y-errores.md](backend/llm/transporte-y-errores.md) |
| `backend/app/llm/harness/`, providers `claude_code`/`opencode`/`pi`/`codex` | [backend/llm/agentes-cli.md](backend/llm/agentes-cli.md) |
| `backend/app/llm/usage.py`, `services/usage_recorder.py`, `scripts/usage_report.py` | [backend/llm/uso-y-costes.md](backend/llm/uso-y-costes.md) |
| `services/plan_service.py`, `llm/prompts/`, `algorithms/pareto.py`, `algorithms/sm2.py` | [backend/generacion-planes/pipeline.md](backend/generacion-planes/pipeline.md) |
| `create_plan`/`delete_plan`, `DELETE /goals`, `goal_repository.py` | [backend/generacion-planes/creacion-y-borrado.md](backend/generacion-planes/creacion-y-borrado.md) |
| `app/pedagogy/`, `adaptive_content_builder.py`, `adaptive_*_service.py`, `learning-mode`/`assessment` | [backend/generacion-planes/contenido-adaptativo-v2.md](backend/generacion-planes/contenido-adaptativo-v2.md) |
| `app/processors/`, `app/rag/`, `document_service.py`, `document_asset_service.py`, `svg_sanitizer.py` | [backend/documentos/ingesta-y-figuras.md](backend/documentos/ingesta-y-figuras.md) |
| `adaptive_route_service.py`, `algorithms/adaptive_route.py`, `reinforcement_service.py`, `quiz_service.py` | [backend/estudio/ruta-adaptativa-y-refuerzo.md](backend/estudio/ruta-adaptativa-y-refuerzo.md) |
| `assistant_service.py` | [backend/estudio/asistente.md](backend/estudio/asistente.md) |
| Cualquier ruta HTTP (firma, código de error, DTO) | [api_contract.yaml](api_contract.yaml) |
| `frontend/src/App.tsx`, `api/`, `hooks/`, `lib/` (convenciones) | [frontend/arquitectura.md](frontend/arquitectura.md) |
| Clases de color, `tokens.css`, `tailwind.config.js`, SVG | [frontend/diseno/colores.md](frontend/diseno/colores.md) |
| Tipografía, espaciado, radios, movimiento, maquetación | [frontend/diseno/sistema-visual.md](frontend/diseno/sistema-visual.md) |
| Pintar salida del LLM (Markdown, SVG, enlaces, figuras) | [frontend/seguridad.md](frontend/seguridad.md) |
| `SettingsPage`, `components/llm/`, `useAppConfig`, paso «Elige tu IA» | [frontend/funcionalidades/conectar-ia.md](frontend/funcionalidades/conectar-ia.md) |
| `usePlan`, `GenerationProgress`, `PlanDetailPage`, `useStudyStart` | [frontend/funcionalidades/generacion-y-plan.md](frontend/funcionalidades/generacion-y-plan.md) |
| `SessionPage`, `QuizPhase`, `SessionTimeline`, `AssistantPanel` | [frontend/funcionalidades/sesion-y-test.md](frontend/funcionalidades/sesion-y-test.md) |
| `components/help/`, `EmptyState`, `StudySetup` | [frontend/funcionalidades/ayuda-y-onboarding.md](frontend/funcionalidades/ayuda-y-onboarding.md) |

## Comandos

- Backend: [backend/desarrollo.md](backend/desarrollo.md) · Frontend: [frontend/desarrollo.md](frontend/desarrollo.md)
- QA aislado (Playwright): [frontend/qa/qa-aislado.md](frontend/qa/qa-aislado.md)

## Estado, historia y hojas de ruta

- [AGENTS_STATUS.md](AGENTS_STATUS.md) — estado actual por fases y pendientes.
- [backend/historial.md](backend/historial.md) · [frontend/historial.md](frontend/historial.md) — lo ya
  ejecutado (contexto histórico; el código actual manda).
- [backend/despliegue/saas-produccion.md](backend/despliegue/saas-produccion.md) — hoja de ruta a SaaS de pago.
- [backend/despliegue/operacion.md](backend/despliegue/operacion.md) — Docker, deploy a la VM y CI.
- [backend/despliegue/dominio-y-autenticacion.md](backend/despliegue/dominio-y-autenticacion.md) — dominio
  `studyinflow.app`, SMTP (Resend), Google OAuth y URLs de Supabase; checklist de estado.
- [backend/generacion-planes/piloto-perfiles.md](backend/generacion-planes/piloto-perfiles.md) — piloto de
  perfiles académicos.
- `../studyai_multiagent_plan.md` — documento histórico de planificación (no es el flujo actual).
- Planes de trabajo: `../plans/` (ver skill `studyai-plan`).

## Añadir un documento

Nuevo tema → archivo en la carpeta de su lado y funcionalidad, con la línea «Leer antes de…», una fila en
la tabla de arriba y una fila en el mapa de `CLAUDE.md` si es una zona nueva.
