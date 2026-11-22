# CLAUDE.md

StudyAI: app de planificación de estudio asistida por IA. El usuario sube documentos (`.pdf`/`.md`),
define una meta (examen / aprendizaje / memorización) y el backend genera un plan con repetición espaciada
(SM-2 / Ebbinghaus), temas priorizados por Pareto y tests, mediante un pipeline LLM de varios pasos.
Monorepo: backend FastAPI (`backend/`) + frontend Vite/React (`frontend/`).

**Invariante principal**: la app funciona completa en **modo demo**, sin API keys ni dependencias pesadas
(LLM mock, embedder por hashing, vector store en memoria), y se mejora sola a IA real + RAG semántico al
instalar los extras y poner una clave. Nunca rompas el camino de fallback en `llm/`, `rag/` o `processors/`.

Este archivo solo dice **dónde** está cada cosa, **cuándo** leerla y las **reglas** de trabajo. El
detalle vive en `docs/`, las reglas estrictas por ruta en `.claude/rules/` y los procedimientos en
`.claude/skills/`. El código y los tests mandan si la prosa los contradice (y entonces se corrige la prosa).

## Mapa de documentación

Índice completo con la tabla «si tocas este código → lee este documento»: **`docs/README.md`**.
Léelo antes de empezar cualquier tarea que no sea trivial.

| Documento | Cuándo leerlo | Por qué |
|---|---|---|
| `docs/README.md` | Al empezar una tarea; al terminar un cambio importante | Mapa código → doc; dice qué documento leer y cuál actualizar |
| `docs/backend/arquitectura/capas-y-patrones.md` | Antes de crear/mover código en `backend/app/` | Capas, patrones (Factory, Strategy, Pipeline, Repository, Observer, Registry, fallback dual) y qué reutilizar |
| `docs/backend/arquitectura/base-de-datos.md` | Antes de tocar modelos, columnas, SQL crudo o borrados | SQLite sin FK, borrados explícitos, backfills, diferencias con Postgres |
| `docs/backend/arquitectura/configuracion-y-despliegue.md` | Antes de añadir variables de entorno o lógica `self_hosted`/`saas` | Config única, `.env`, modo de despliegue |
| `docs/backend/llm/*.md` | Antes de tocar cualquier cosa en `backend/app/llm/` o que llame al LLM | Qué proveedor se usa, cuota gratuita, credenciales, SSRF, reintentos, agentes CLI, costes |
| `docs/backend/generacion-planes/*.md` | Antes de tocar `plan_service.py`, prompts, v2 o borrados de plan/meta | Pipeline `2 + N`, generación reanudable, contenido adaptativo |
| `docs/backend/documentos/ingesta-y-figuras.md` | Antes de tocar ingesta, RAG, figuras o SVG | Pipeline de ingesta y estímulos ricos |
| `docs/backend/estudio/*.md` | Antes de tocar ruta adaptativa, refuerzo, quiz o asistente | Reglas de la ruta sin LLM, refuerzo y asistente |
| `docs/frontend/arquitectura.md` | Antes de crear página, ruta, hook o llamada a la API | Capas, rutas y componentes/helpers a reutilizar |
| `docs/frontend/diseno/colores.md` | **Siempre** antes de usar un color | Roles de color, contrastes verificados, deuda |
| `docs/frontend/diseno/sistema-visual.md` | Antes de maquetar | Tipografía, espaciado, radios, movimiento |
| `docs/frontend/seguridad.md` | Antes de pintar salida del LLM | YouTube, Markdown, SVG, figuras |
| `docs/frontend/funcionalidades/*.md` | Antes de tocar Conectar IA, plan, sesión/test o ayuda | Comportamiento de cada pantalla |
| `docs/api_contract.yaml` | Al cambiar cualquier ruta o DTO | Contrato OpenAPI; se mantiene sincronizado con el código |
| `docs/backend/desarrollo.md`, `docs/frontend/desarrollo.md` | Para instalar, arrancar o correr tests | Comandos |
| `docs/AGENTS_STATUS.md` | Para saber el estado y pendientes | Estado por fases |

## Reglas

### 1. Planes: siempre agénticos, por fases, en `plans/`

Todo plan se escribe para ejecutarse con **varios agentes**. Usa la skill **`studyai-plan`**
(`.claude/skills/studyai-plan/SKILL.md`), que fija el formato. Mínimo obligatorio:
- Fases con dependencias y **qué fases se lanzan en paralelo** (p. ej. «Ola 1: A ∥ B ∥ C → Ola 2: D»).
  Solo son paralelas si no tocan los mismos archivos.
- El **orden** de las olas y una ola final de verificación y revisión.
- Las **skills que recibe cada agente** y los documentos de `docs/` que debe leer y actualizar.
- Se guarda **siempre en `plans/`**, nunca en `docs/` ni en `docs/superpowers/`.

### 2. Arquitectura y modularización (backend)

Respeta las capas y los patrones existentes y reutiliza lógica antes de escribirla. Reglas estrictas en
`.claude/rules/backend-arquitectura.md`, `backend-datos.md` y `backend-llm.md` (se cargan solas al
editar esas rutas); porqué en `docs/backend/arquitectura/capas-y-patrones.md`. Un patrón nuevo o un
cambio de patrón se documenta allí en el mismo cambio.

### 3. Colores y UI (frontend)

Las reglas de color son **obligatorias siempre** y mandan sobre cualquier skill o referencia de diseño:
`.claude/rules/frontend-colores.md` (resumen) y `docs/frontend/diseno/colores.md` (roles y contrastes).
Reglas de UI generales: `.claude/rules/frontend-ui.md`.

### 4. Mantener `docs/` al día

Tras un cambio importante (comportamiento, contrato, patrón, flujo, regla, decisión de producto): busca en
`docs/README.md` el documento de esa zona y actualízalo **en el mismo cambio**. Si la zona no tiene
documento, créalo en `docs/backend/<funcionalidad>/` o `docs/frontend/<funcionalidad>/` y añade su fila
al mapa de `docs/README.md` (y aquí si es una zona nueva). Ruta o DTO cambiado → `docs/api_contract.yaml`.

### 5. CLAUDE.md debe seguir siendo pequeño

No añadas aquí detalle de implementación. Si algo se repite varias veces (aquí, en docs o en las
conversaciones), **avísalo al usuario** y muévelo a su sitio:
- Procedimiento que se repite (cómo hacer X paso a paso) → skill en `.claude/skills/<nombre>/SKILL.md`.
- Regla que nunca se rompe y aplica a unas rutas → `.claude/rules/<tema>.md` con `paths:`.
- Explicación / porqué / comportamiento → documento en `docs/`.
Aquí solo queda el puntero.

### 6. Verificar antes de dar algo por hecho

- Backend: `cd backend && python -m pytest -q` (Postgres también si tocaste SQL o modelos; ver
  `docs/backend/desarrollo.md`).
- Frontend: `cd frontend && npm run lint && npm test` (`npm run build` si tocaste configuración).
- Los tests nunca gastan tokens ni tocan datos reales (`tests/conftest.py` fuerza el mock); mantenlo así.

### 7. Seguridad que no se negocia

Claves cifradas que nunca salen del servidor, `base_url` validada contra SSRF, salida del LLM nunca
renderizada como URL/HTML/SVG inline. Detalle: `docs/backend/llm/proveedores-y-credenciales.md` y
`docs/frontend/seguridad.md`.

## Skills de proyecto

- `studyai-plan` — escribir y ejecutar planes agénticos (regla 1).
- `onboarding-ux` — guía de usuario, vacíos y primeros pasos.
