# StudyAI — Mapa de diseño e integración (A01)

> **Estado:** inventario y handoff completados el 2026-09-29. Es una referencia de implementación, no evidencia de que el nuevo frontend esté implementado. No se modificó el canvas de Penpot ni se inició el trabajo de A02.

## 1. Alcance y fuentes de verdad

| Dimensión | Fuente acordada | Uso en la integración |
|---|---|---|
| Composición, jerarquía, color, tipografía y estados visuales dibujados | Archivo Penpot conectado, páginas 01–04 y tableros inventariados abajo | Reproducir visualmente los layouts y resolver las inconsistencias registradas antes de aprobar las capturas de referencia. |
| Objetivos de producto, reglas responsive, estados requeridos, accesibilidad y restricciones de stack | [`../fronted-design.md`](../fronted-design.md) | Determina el comportamiento cuando Penpot solo muestra una navegación de prototipo o un dato de ejemplo. |
| Rutas, datos, métodos HTTP, nombres de campos y transiciones de servidor | `frontend/src/App.tsx`, `frontend/src/api/endpoints.ts`, `frontend/src/api/types.ts`, `frontend/src/hooks/queries.ts`, rutas FastAPI y `/openapi.json`; contrato mantenido en [`../api_contract.yaml`](../api_contract.yaml) | No inferir llamadas HTTP desde flechas de Penpot ni inventar estados, rutas o resultados del servidor. |
| Semántica, teclado, lector de pantalla y estados de foco | Código y especificación funcional; Penpot no define estos contratos | Implementar controles nativos, nombres/roles/estados accesibles, foco visible y pruebas WCAG 2.2 AA. |

**Fuente de código analizada:** la SPA existente. A01 mapea pantallas a sus páginas/componentes actuales y a los componentes/hooks nuevos propuestos; aún no hay una implementación nueva con la que afirmar paridad visual. No se usó Storybook.

**Resolución de selección:** `penpot.selection` estaba vacía. No se extrajo una selección vacía: se resolvieron de forma explícita, por ID y nombre, las 54 boards raíz de las cuatro páginas. La extracción de estilos cubrió 18 boards representativos con `generateMarkup([board], { type: "html" })` y `generateStyle([board], { type: "css", withPrelude: false, includeChildren: true })`; las opciones se comprobaron en la documentación de Penpot. La lectura fue solo de diseño.

## 2. Inventario de Penpot

Hay **54 boards raíz**: 1 mapa, 17 pantallas desktop, 17 pantallas mobile y 17 pantallas tablet; además del overlay mobile y la hoja-guía responsive tablet. Por tanto, el conjunto tiene **51 boards de pantalla principal** y 3 boards auxiliares (mapa, overlay y guía).

Las dimensiones son el tamaño de cada board, no una garantía de viewport cubierto. Los conteos indican hijos directos del board.

### 2.1. Mapa de experiencia

| Board | ID | Tamaño | Hijos directos | Uso |
|---|---|---:|---:|---|
| `StudyAI · mapa de experiencia` | `7542db39-4a56-801a-8008-b67e6017d88b` | 1800 × 1290 | 123 | Mapa estático de rutas, estados globales y dirección visual; no contiene flows de prototipo. |

### 2.2. Escritorio — página `02 · Wireframes escritorio` (`7542db39-4a56-801a-8008-b67f1f19b1cc`)

| Estado/pantalla | Board Penpot | ID | Tamaño | Hijos |
|---|---|---|---:|---:|
| Documentos | `Desktop · Documentos` | `7542db39-4a56-801a-8008-b67f1f24b24d` | 1240 × 790 | 64 |
| Metas | `Desktop · Metas` | `7542db39-4a56-801a-8008-b67f20922c8c` | 1240 × 790 | 62 |
| Selección/generación completa de plan | `Desktop · Plan de estudio` | `7542db39-4a56-801a-8008-b67f22711244` | 1240 × 790 | 69 |
| Plan listo y lista de sesiones | `Desktop · Detalle del plan` | `7542db39-4a56-801a-8008-b67f2581e6ea` | 1240 × 790 | 76 |
| Sesión · estudio | `Desktop · Sesión · estudio` | `7542db39-4a56-801a-8008-b67f2a415328` | 1240 × 790 | 61 |
| Sesión · quiz | `Desktop · Sesión · quiz` | `7542db39-4a56-801a-8008-b67f2f2a57a0` | 1240 × 790 | 61 |
| Sesión · completada | `Desktop · Sesión · completada` | `7542db39-4a56-801a-8008-b67f34d036be` | 1240 × 790 | 47 |
| Dashboard | `Desktop · Dashboard` | `7542db39-4a56-801a-8008-b67f8c275f42` | 1240 × 790 | 77 |
| Configuración | `Desktop · Configuración` | `7542db39-4a56-801a-8008-b67f8e61c1ff` | 1240 × 790 | 63 |
| Sesión · receso | `Desktop · Sesión · receso` | `e1f5b81e-f432-80c4-8008-b687a3d68d18` | 1240 × 790 | 41 |
| Inicio · primera visita | `Desktop · Inicio · primera visita` | `e1f5b81e-f432-80c4-8008-b6a1ad3a9f6c` | 1240 × 790 | 61 |
| Inicio · regreso con plan existente | `Desktop · Inicio · regreso` | `e1f5b81e-f432-80c4-8008-b6a1b0aaf03c` | 1240 × 790 | 48 |
| Generación en curso | `Desktop · Plan · PROCESSING` | `e1f5b81e-f432-80c4-8008-b6a1b4ac0742` | 1240 × 790 | 46 |
| Proveedor remoto · clave | `Desktop · Inicio · clave` | `e1f5b81e-f432-80c4-8008-b6a206544da3` | 1240 × 790 | 53 |
| Proveedor remoto · modelo/borrador | `Desktop · Inicio · modelo` | `e1f5b81e-f432-80c4-8008-b6a209007e7e` | 1240 × 790 | 53 |
| Proveedor remoto · verificado pendiente de activar | `Desktop · Inicio · verificado` | `e1f5b81e-f432-80c4-8008-b6a23c586a39` | 1240 × 790 | 43 |
| Proveedor remoto · USER activo | `Desktop · Inicio · proveedor USER` | `e1f5b81e-f432-80c4-8008-b6a23efab4e6` | 1240 × 790 | 60 |

### 2.3. Móvil — página `03 · Wireframes móvil` (`7542db39-4a56-801a-8008-b6808165ae34`)

| Estado/pantalla | Board Penpot | ID | Tamaño | Hijos |
|---|---|---|---:|---:|
| Documentos | `Móvil · Documentos` | `7542db39-4a56-801a-8008-b68081ecc442` | 390 × 844 | 57 |
| Metas | `Móvil · Metas` | `7542db39-4a56-801a-8008-b680831d6384` | 390 × 844 | 47 |
| Selección/generación completa de plan | `Móvil · Plan de estudio` | `7542db39-4a56-801a-8008-b6808464026b` | 390 × 844 | 50 |
| Plan listo y sesiones | `Móvil · Detalle del plan` | `7542db39-4a56-801a-8008-b680862a0d3d` | 390 × 844 | 63 |
| Sesión · estudio | `Móvil · Sesión · estudio` | `7542db39-4a56-801a-8008-b680894a4737` | 390 × 844 | 51 |
| Sesión · quiz | `Móvil · Sesión · quiz` | `7542db39-4a56-801a-8008-b6808c6e6fb5` | 390 × 844 | 53 |
| Sesión · completada | `Móvil · Sesión completada` | `7542db39-4a56-801a-8008-b6808fc4617b` | 390 × 844 | 45 |
| Dashboard | `Móvil · Dashboard` | `7542db39-4a56-801a-8008-b6809398b1de` | 390 × 844 | 74 |
| Configuración | `Móvil · Configuración` | `7542db39-4a56-801a-8008-b6809b139e51` | 390 × 844 | 58 |
| Sesión · receso | `Móvil · Sesión · receso` | `e1f5b81e-f432-80c4-8008-b687cfe22cff` | 390 × 844 | 45 |
| Navegación · overlay | `Móvil · Menú (overlay)` | `e1f5b81e-f432-80c4-8008-b687d1833544` | 320 × 560 | 18 |
| Inicio · primera visita | `Móvil · Inicio · primera visita` | `e1f5b81e-f432-80c4-8008-b6a296d96e21` | 390 × 844 | 56 |
| Inicio · regreso con plan existente | `Móvil · Inicio · regreso` | `e1f5b81e-f432-80c4-8008-b6a299e2cc16` | 390 × 844 | 48 |
| Generación en curso | `Móvil · Plan · PROCESSING` | `e1f5b81e-f432-80c4-8008-b6a29d79c584` | 390 × 844 | 51 |
| Proveedor remoto · clave | `Móvil · Inicio · clave` | `e1f5b81e-f432-80c4-8008-b6a2f6e2b6e3` | 390 × 844 | 43 |
| Proveedor remoto · modelo/borrador | `Móvil · Inicio · modelo` | `e1f5b81e-f432-80c4-8008-b6a2f948ff2c` | 390 × 844 | 45 |
| Proveedor remoto · USER activo | `Móvil · Inicio · proveedor USER` | `e1f5b81e-f432-80c4-8008-b6a2fc7c22e3` | 390 × 844 | 44 |
| Proveedor remoto · verificado pendiente de activar | `Móvil · Inicio · verificado` | `e1f5b81e-f432-80c4-8008-b6a31bea0744` | 390 × 844 | 46 |

### 2.4. Tablet — página `04 · Wireframes tablet` (`e1f5b81e-f432-80c4-8008-b684627f16c1`)

| Estado/pantalla | Board Penpot | ID | Tamaño | Hijos |
|---|---|---|---:|---:|
| Hoja de reglas responsive (no es pantalla) | `StudyAI · tablet responsive sheet` | `e1f5b81e-f432-80c4-8008-b684628ca00d` | 2408 × 105 | 2 |
| Documentos | `Tablet · Documentos` | `e1f5b81e-f432-80c4-8008-b68489ff6ec8` | 768 × 1024 | 50 |
| Metas | `Tablet · Metas` | `e1f5b81e-f432-80c4-8008-b6848b31ec48` | 768 × 1024 | 38 |
| Selección/generación completa de plan | `Tablet · Plan de estudio` | `e1f5b81e-f432-80c4-8008-b6848c43ac64` | 768 × 1024 | 54 |
| Plan listo y sesiones | `Tablet · Detalle del plan` | `e1f5b81e-f432-80c4-8008-b684bccb7fbb` | 768 × 1024 | 69 |
| Sesión · estudio | `Tablet · Sesión · estudio` | `e1f5b81e-f432-80c4-8008-b684becae535` | 768 × 1024 | 46 |
| Sesión · quiz | `Tablet · Sesión · quiz` | `e1f5b81e-f432-80c4-8008-b684c0a5c9e3` | 768 × 1024 | 48 |
| Sesión · completada | `Tablet · Sesión completada` | `e1f5b81e-f432-80c4-8008-b684e7e5d002` | 768 × 1024 | 35 |
| Dashboard | `Tablet · Dashboard` | `e1f5b81e-f432-80c4-8008-b684e8eb3157` | 768 × 1024 | 68 |
| Configuración | `Tablet · Configuración` | `e1f5b81e-f432-80c4-8008-b684eb4b5ae6` | 768 × 1024 | 48 |
| Sesión · receso | `Tablet · Sesión · receso` | `e1f5b81e-f432-80c4-8008-b687ef50aa48` | 768 × 1024 | 34 |
| Inicio · primera visita | `Tablet · Inicio · primera visita` | `e1f5b81e-f432-80c4-8008-b6a36a7364b2` | 768 × 1024 | 56 |
| Inicio · regreso con plan existente | `Tablet · Inicio · regreso` | `e1f5b81e-f432-80c4-8008-b6a36c8bcc20` | 768 × 1024 | 40 |
| Generación en curso | `Tablet · Plan · PROCESSING` | `e1f5b81e-f432-80c4-8008-b6a370ff2397` | 768 × 1024 | 38 |
| Proveedor remoto · clave | `Tablet · Inicio · clave` | `e1f5b81e-f432-80c4-8008-b6a39e597136` | 768 × 1024 | 43 |
| Proveedor remoto · modelo/borrador | `Tablet · Inicio · modelo` | `e1f5b81e-f432-80c4-8008-b6a3a047d95c` | 768 × 1024 | 44 |
| Proveedor remoto · verificado pendiente de activar | `Tablet · Inicio · verificado` | `e1f5b81e-f432-80c4-8008-b6a3c7376b64` | 768 × 1024 | 35 |
| Proveedor remoto · USER activo | `Tablet · Inicio · proveedor USER` | `e1f5b81e-f432-80c4-8008-b6a3c88517ce` | 768 × 1024 | 41 |

## 3. Estructura, sistema visual y extracción

### 3.1. Estructura del archivo

- El mapa de experiencia es una lámina informativa estática, con siete destinos de producto, estados globales y reglas responsive; no es un flow navegable.
- Las screens usan nombres mayormente semánticos (`Page title`, `Primary action`, `Document row`, `Status…`, `Session…`, `Provider…`). Esos nombres permiten mapear su función, pero no crean automáticamente DOM accesible ni componentes React.
- En las 54 boards se recorrieron **2 845 shapes** (incluida cada raíz). Se encontraron **0 shapes con un token enlazado**, **0 nodos con layout Flex/Grid** y **0 violaciones de contención** según `penpotUtils.isContainedIn`.
- La muestra de export CSS empieza con reglas de `position: absolute` y dimensiones fijas de artboard. `generateMarkup`/`generateStyle` para 18 boards produjo 33 411–106 816 caracteres HTML y 12 523–52 432 caracteres CSS por board. No importar esos exports como la UI final: rehacer estructura con componentes semánticos y reflow responsive.
- La ausencia de violaciones de contención confirma que los elementos están dentro de sus artboards; **no** confirma que esos layouts se adapten a viewports, orientación o zoom que no están dibujados.

### 3.2. Tokens y estilos observados

`penpotUtils.tokenOverview()` devolvió `{}`. La biblioteca local tiene **0 token sets, 0 colores de biblioteca y 0 tipografías de biblioteca**. El recorrido tampoco encontró token references en shapes. Por tanto, los valores se usan como literales del artefacto y los nombres de `fronted-design.md` son candidatos semánticos, no tokens existentes en Penpot.

| Token semántico candidato de `fronted-design.md` | Valor candidato | Valor literal observado en boards | Resolución para el handoff |
|---|---|---|---|
| `color.canvas` | `#F5F7F6` | `#f5f7f6` | El código deberá introducir variable semántica; no hay token Penpot enlazado. |
| `color.surface.paper` | `#FFFFFF` | `#ffffff` | Igual. |
| `color.text.ink` | `#182B31` | `#182b31` | Igual. |
| `color.text.muted` | `#4C6268` | `#4c6268` | Igual. |
| `color.action.primary` | `#126C63` | `#126c63` | Igual. |
| `color.action.hover` | `#0C514B` | No observado en fills/strokes de las boards examinadas | Tratar como estado especificado pendiente de diseñar/validar, no inventar que ya está dibujado. |
| `color.line` | `#D4E0DC` | `#d4e0dc` | Igual. |
| `color.state.success` | `#176C4A` | `#176c4a` | Igual. |
| `color.state.warning` | `#8A5A12` | `#8a5a12` | Igual. |
| `color.state.error` | `#A52F33` | `#a52f33` | Igual. |
| Superficies/estados adicionales | No nombrados en la tabla candidata | `#eaf3f0`, `#e9f0ed`, `#f8f0de`, `#fbeaec`, `#e7f4ec`, `#eff5f2`, `#b5d0c8` | Al consolidar la escala, asignarles roles semánticos; no dejar literales dispersos. |

Frecuencias del inventario de todos los boards: 16 colores de fill, 3 colores de stroke. Son conteos de apariciones, no una taxonomía de tokens.

| Dimensión | Observación extraída |
|---|---|
| Familias | `IBM Plex Sans` para interfaz; `Source Serif 4` aparece en títulos/material seleccionado. |
| Pesos | 400, 600, 700. |
| Tamaños encontrados | 8–50 px; el archivo contiene metadatos de 8–11 px que requieren revisar legibilidad y WCAG al implementar. |
| Radios literales | 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 y 18 px. No están vinculados a tokens. |
| Espaciado | No existe layout flex/grid desde el que leer `gap`/padding de layout; espaciado está implícito en la geometría de shapes. No declarar auditada una escala de spacing/token que el archivo no contiene. |
| Iconografía | La interfaz muestra iconos geométricos/SVG simplificados. El código debe mapear estos activos sin introducir una dependencia de iconos no justificada. |

Los contrastes de muestra indicados en `fronted-design.md` (`ink/canvas 13,66:1`, `muted/canvas 6,00:1`, `action/blanco 6,27:1`) siguen siendo **candidatos**. A01 no certifica contraste de cada texto, estado, foco, borde ni control sobre el fondo final.

### 3.3. Boards inspeccionadas visualmente y extractos

Se exportaron e inspeccionaron PNG de Inicio desktop —primera visita y regreso—, Inicio móvil, overlay mobile, Inicio tablet, procesamiento desktop/mobile y proveedor USER desktop. La extracción de markup/style abarcó 18 boards: los dos Home desktop/mobile/tablet, PROCESSING en los tres tamaños, detalle del plan, sesión estudio/receso/quiz/completada desktop, clave/modelo/verificado/USER desktop y overlay mobile. Los extractos completos permanecieron en `storage.studyaiA01.extracted` durante esta sesión; los archivos de handoff registran valores y decisiones relevantes, no copian el CSS absoluto generado.

No se emite aún un informe de paridad visual Penpot↔código: la nueva UI no está implementada. Las capturas citadas son referencias para A17, no snapshots aprobados de producto.

## 4. Flows e interacciones del prototipo

Cada página responsive define dos flows de inicio —primera visita y regreso—:

| Página | Flow | Board de inicio |
|---|---|---|
| Escritorio | `StudyAI · Primera visita escritorio` | `Desktop · Inicio · primera visita` (`e1f5b81e-f432-80c4-8008-b6a1ad3a9f6c`) |
| Escritorio | `StudyAI · Regreso escritorio` | `Desktop · Inicio · regreso` (`e1f5b81e-f432-80c4-8008-b6a1b0aaf03c`) |
| Móvil | `StudyAI · Primera visita móvil` | `Móvil · Inicio · primera visita` (`e1f5b81e-f432-80c4-8008-b6a296d96e21`) |
| Móvil | `StudyAI · Regreso móvil` | `Móvil · Inicio · regreso` (`e1f5b81e-f432-80c4-8008-b6a299e2cc16`) |
| Tablet | `StudyAI · Primera visita tablet` | `Tablet · Inicio · primera visita` (`e1f5b81e-f432-80c4-8008-b6a36a7364b2`) |
| Tablet | `StudyAI · Regreso tablet` | `Tablet · Inicio · regreso` (`e1f5b81e-f432-80c4-8008-b6a36c8bcc20`) |

El inventario encontró **572 interacciones**, todas `click`: 507 `navigate-to`, 44 `open-overlay`, 4 `close-overlay`, 17 `previous-screen`. No hay destinos que crucen de desktop a mobile/tablet. Las conexiones del prototipo son recorridos de pantalla; no invocan HTTP, no persisten archivos/metas/credenciales y no demuestran estados del servidor.

| Camino | Desktop | Móvil | Tablet | Contrato que debe reemplazar la navegación estática |
|---|---|---|---|---|
| Inicio primera visita → configuración remota opcional o `PROCESSING` | Sí | Sí | Sí | Subida real; `INDEXED`; crear/reutilizar una meta; runtime real; solo después solicitar generación. |
| Provider clave → modelo/borrador → verificado → `USER` activo | Sí | Sí | Sí | `PUT key` → `PATCH model/URL` con `expected_revision` → `POST test` de esa revisión → `POST activate`; runtime se confirma con API. |
| `PROCESSING` → ejemplo `READY` / detalle | Sí | Sí | Sí | La transición real solo se habilita tras consultar `READY`; no abrir sesión/lista antes del payload `PlanDTO` con sesiones. Los botones de prototipo lo indican explícitamente como simulación. |
| Detalle → estudio → receso → quiz → completada | Sí | Sí | Sí | Sesión y quiz reales; éxito solo después de respuesta satisfactoria de `POST /quizzes/{quiz_id}/submit`. |
| Regreso → sesión indicada o todas las sesiones | Sí | Sí | Sí | Usar IDs y estado de `PlanDTO`; abrir una sesión existente no promete restaurar temporizador, receso ni quiz local. |
| Navegación móvil | No aplica | Overlay 320 × 560; 5 secciones persistentes | Navegación/tablet según la hoja responsive | Reproducir con controles accesibles y rutas reales, no fijando los board targets. |

### 4.1. Discrepancias de flujo que deben resolverse antes de validar diseño

| ID | Hallazgo y evidencia | Clasificación | Reconciliación propuesta (canvas sin cambios) |
|---|---|---|---|
| `PEN-01` | En cada una de las 17 pantallas de fondo mobile, el shape de texto `Menu label` tiene `open-overlay` sin `destination`; el shape `Menu button` del mismo board sí apunta a `Móvil · Menú (overlay)`. Son 17 acciones incompletas. | **Major** — el hit target visual del texto puede no abrir menú. | Enlazar el texto al mismo overlay (o quitar su acción para que el padre sea el único hit target) y volver a recorrer los 17 boards. No se corrigió Penpot en A01. |
| `PEN-02` | La exportación PNG/SVG de Inicio regreso y Inicio USER muestra `MODO DEMO / Sin clave · proveedor simulado` en la barra lateral, mientras el panel principal dice `ENV · Anthropic · ejemplo` o `PROVEEDOR EFECTIVO · USER`. Las propiedades text actuales de dos layers de esa barra lateral dicen `PROVEEDOR ENV · EJEMPLO / Anthropic · servidor`, y el HTML generado incluye esa representación además del texto mock del SVG. | **Major** — render/export y layer tree discrepan sobre el proveedor efectivo. | Refrescar/reconciliar el board y exportar de nuevo; aprobar una sola fuente visible. La UI final debe mostrar `MOCK`, `ENV` o `USER` desde `/llm-settings/runtime`, nunca el estado mock junto a un proveedor efectivo distinto. |
| `PEN-03` | En `Móvil · Inicio · primera visita` y `Móvil · Inicio · regreso`, la barra inferior marca Plan activo aunque la pantalla/overlay representan Inicio. `Móvil · Plan · PROCESSING` también marca Plan; el handoff lo mapea al estado temporal de Home por la especificación de Inicio y el breadcrumb desktop, así que se debe comprobar ese activo al implementar. | **Major** — el indicador activo de los Home boards contradice Inicio; el activo del estado PROCESSING depende de dónde se represente ese estado. | Alinear `aria-current`/estilo activo con la ruta real. Confirmar antes de A06 si Inicio se abre por marca/overlay, como dibujado, o si también será un tab persistente; no añadir un sexto tab por inferencia. |
| `PEN-04` | Hay 17 botones/labels que hacen `previous-screen` durante la configuración; ese action no tiene destino, que es correcto para “volver a la pantalla anterior”. | `match` de intención del prototipo; no es un destino faltante. | Conservar cancelar/volver, pero en código cancelar no debe borrar una clave/draft ya confirmado en servidor ni saltarse el flujo revisionado. |
| `PEN-05` | El flow marca `READY` con botones “Ver ejemplo READY” / “Explorar estado READY (prototipo)”. | **Código-only requisito**; Penpot avisa que es ejemplo, no fallo del prototipo. | Sustituir ese clic por estado derivado de polling FastAPI; no dejar botón de simulación en producto. |

## 5. Mapeo board → ruta, componentes y API

Los boards de un mismo nombre lógico en las tres breakpoints son variantes visuales, no rutas distintas. `PROCESSING`, provider setup y regreso se tratan como estados/variantes del recorrido, no como nuevos contratos backend.

| Grupo de boards | Ruta/estado propuesto | Componentes actuales o destino de implementación | Contratos API actuales |
|---|---|---|---|
| `* · Inicio · primera visita`, `* · Inicio · regreso`, `* · Inicio · proveedor USER` | `/`; estado first-use, return o runtime `USER` | Nueva `HomePage`; compartir `DocumentUpload`/`DocumentPicker`, `GoalTemplatePicker`, `LlmRuntimeSummary`, `ProviderSetup`, `useStudyStart`; enlazar a listas completas | `GET /documents`, `/goals`, `/plans`, `/llm-settings/runtime`; catálogo/configuración LLM según se despliegue el setup; `POST /documents/upload`; `POST /goals` solo para plantilla nueva; `POST /plans/generate` tras prerequisitos. |
| `* · Inicio · clave/modelo/verificado` | `/`; pasos progresivos contextuales, sin abandonar Inicio | Reutilizar la lógica hoy en `SettingsPage`/`ProviderCard`; separar UI compacta de lógica de mutación | `GET /llm-settings/catalog`, `GET /llm-settings`, `GET /llm-settings/runtime`; `PUT /llm-settings/{provider}`, `PATCH /llm-settings/{provider}/model`, `POST /llm-settings/{provider}/test`, `POST /llm-settings/{provider}/activate`; consultar runtime después de activar. `GET /llm-settings/OLLAMA/models` solo con Ollama. |
| `* · Plan · PROCESSING` | Estado temporal del CTA «Estudiar» en `/` (no un endpoint ni URL nueva); breadcrumb del board desktop indica Inicio | `HomePage` + fase `processing` de `useStudyStart`; reemplaza la simulación Ready | `POST /plans/generate` devuelve `202 PlanStatusDTO`; polling `GET /plans/{id}/status` o `GET /plans/{id}` hasta `READY`/`FAILED`; usar solo `PlanDTO.sessions` para continuar. La navegación posterior a `READY` sigue la decisión descrita en A10. |
| `* · Documentos` | `/documents` | Existente `DocumentsPage`; extraer `DocumentUpload` y conservar fila/gestión | `GET /documents`; `POST /documents/upload` (`201`, inicialmente `PENDING`); `GET /documents/{id}`/consulta de lista para estado; `DELETE /documents/{id}` (`204`). Hook `useDocuments()` refresca cada 2 s si existe `PENDING`. |
| `* · Metas` | `/goals` | Existente `GoalsPage`/`GoalRow`; extraer `GoalTemplatePicker`/plantillas | `GET /goals`, `POST /goals` (`201`), `PUT /goals/{id}`, `DELETE /goals/{id}` (`204`). Seleccionar plantilla no equivale a meta creada. |
| `* · Plan de estudio` | `/plan` (vista profunda de generación e historial) | Existente `PlanPage` | `GET /goals`, `/documents`, `/plans`; `POST /plans/generate` con `{goal_id, document_ids}`; usar `INDEXED` solamente en el inicio nuevo. |
| `* · Detalle del plan` | `/plan/:planId` | Existente `PlanDetailPage`; `SessionCard` lista todas las sesiones | `GET /plans/{id}` devuelve temas y sesiones; mantener polling mientras `PROCESSING` (hook actual cada 3 s). El detalle lista sesiones `READY`, incluidas completadas. |
| `* · Sesión · estudio/receso/quiz/completada` | `/session/:sessionId` con fase local | Existente `SessionPage`, `useTimer`, `ReactMarkdown`, `youtubeSearchUrl`; A12 propone separar fases/resultado | `GET /sessions/{id}`; `GET /quizzes/{sessionId}`; `POST /quizzes/{quizId}/submit`; al enviar correctamente el servidor marca sesión `COMPLETED` y activa progreso SM-2. Dashboard se consulta aparte. |
| `* · Dashboard` | `/dashboard` | Existente `DashboardPage`, Recharts | `GET /dashboard` → `DashboardDTO`; dar equivalente textual/tabla al gráfico y distinguir error de vacío. |
| `* · Configuración` | `/settings` | Existente `SettingsPage`/`ProviderCard`; controles avanzados permanecen aquí | Catálogo, runtime, credenciales; flujos revisionados; desactivar/eliminar y discovery de Ollama según proveedor. |
| `Móvil · Menú (overlay)` | Overlay/panel de `AppShell`, no pathname nuevo | `AppShell` con botón/panel accesible, cierre, Escape y restauración del foco | Navegación React Router a `/`, `/documents`, `/goals`, `/plan`, `/dashboard`, `/settings`; no API. |
| `StudyAI · mapa de experiencia`; `StudyAI · tablet responsive sheet` | Documentación, no rutas de producto | `docs/frontend-integration/*` | Ninguno. |

**Evidencia del código actual:** `/` redirige hoy a `/documents`; rutas y componentes en `frontend/src/App.tsx`; `AppShell` muestra cinco rutas (`/documents`, `/goals`, `/plan`, `/dashboard`, `/settings`) pero su nav está oculto bajo `md` y no tiene overlay ni Inicio; `frontend/src/api/endpoints.ts` es el cliente tipado; las URLs API van desde la raíz, no bajo `/api/v1`.

## 6. Discrepancias con la implementación actual a cargar en A05–A17

| Área | Estado actual contrastado | Handoff |
|---|---|---|
| Ruta inicial/navegación | `App.tsx` envía `/` a `/documents`; `AppShell.tsx` usa cinco enlaces, emojis y no ofrece navegación mobile. | A06 debe conservar rutas profundas y hacer alcanzable Inicio/las cinco secciones en todos los tamaños. Conciliar el activo mobile `Plan` reportado en `PEN-03`. |
| Color | Penpot usa literales teal (`#126c63`), mientras `tailwind.config.js` aún asigna `brand.500 #6366f1`, `.600 #4f46e5`, `.700 #4338ca`; `index.css` usa `bg-slate-50 text-slate-800`. | A05 introduce tokens CSS semánticos y sustituye gradualmente la paleta antigua; revisar foco/hover/estados, no solo colores principales. |
| Superficies | `components/ui.tsx` aplica tarjeta blanca con `shadow-sm` de forma uniforme. Penpot prioriza canvas claro, borde fino y sombra reservada. | A05 actualiza controles/superficies; no convertir todo en tarjetas con sombra. |
| Estados/async | API tiene `PENDING/INDEXED/FAILED` y `PROCESSING/READY/FAILED`; list docs poll 2 s y plan 3 s. Penpot muestra estados de ejemplo con saltos prototipo. | A09/A10/A11 derivan estado de responses reales; nada de progreso porcentual ficticio o sesión antes de `READY`. |
| Quiz | `SessionPage` consume resultado y cambia a `done`; en el código actual el resultado local vive dentro de `TestPhase`, que se desmonta tras `onDone`. | A12 debe elevar/preservar `QuizResultDTO` visible tras éxito, mantener respuestas tras error y no afirmar finalización en fallo. |
| Material / enlaces | Código usa `react-markdown` y `youtubeSearchUrl`. | Conservar Markdown sin HTML inseguro y enlaces de búsqueda construidos solo desde keywords. |
| Configuración | `SettingsPage` ya implementa clave, borrador, verificación por revisión, activación, conflicto 409 y runtime. | Reutilizar lógica, no recrear ni simplificar la verificación. No reflejar clave completa ni persistirla en navegador. |
| Datos de ejemplo | Boards de regreso, USER y quiz marcan explícitamente `EJEMPLO`/`datos de ejemplo`; fixtures no son registros reales. | API, Bruno y E2E usan IDs/respuestas servidor reales; nunca copiar el contenido mock fijo como éxito productivo. |

## 7. Decisiones y puntos que requieren revisión humana

1. **Sesión al terminar generación:** A01 mantiene explícita la recomendación del plan: presentar opción para la primera sesión pendiente y acceso a todas, sin redirigir antes de confirmar `READY`. El board de retorno enlaza a la sesión de ejemplo 2; no asumir que toda persona tiene ese orden/estado.
2. **Navegación Home móvil:** los mockups dejan cinco destinos en barra fija y ponen Inicio en el overlay/marca; `Plan-New-Frontend.md` A06 indica añadir Inicio a navegación. La barra además deja Plan activo en Home. Recomendación: corregir estado activo y validar si Inicio debe ser tab antes de añadir un sexto destino.
3. **Idempotencia real:** el diseño muestra una sola acción; el contrato API actual no da key de idempotencia. Bloqueo frontend/recuperación reduce doble clic/reintentos, pero no da garantía de servidor ante timeout/concurrencia. Mantener la decisión de alcance del plan.
4. **Export de provider return:** resolver `PEN-02` con la persona diseñadora/archivo antes de aprobar capturas de A17.
