# A05 — Tokens y componentes base

> Estado: A05 está aprobada técnicamente en el commit `c703f8f`; el diseño/paridad con Penpot sigue pendiente. No es una aprobación de A01 ni una certificación WCAG. Basado en el handoff A01 y `docs/fronted-design.md`.

## Alcance y fuente

Penpot no contiene una biblioteca de tokens: el inventario A01 encontró cero token sets, cero colores/tipografías de biblioteca y cero referencias de tokens enlazadas en las 54 boards. La llamada actual al plugin Penpot no pudo autenticarse (`No userToken found in session context. Multi-user mode requires authentication.`), así que no se presenta una inspección/exportación visual nueva. Para orientar A05 se seleccionan explícitamente como referencias del inventario A01:

| Uso de referencia | Board | ID Penpot registrado en A01 |
|---|---|---|
| Formulario y acciones desktop | `Desktop · Documentos` | `7542db39-4a56-801a-8008-b67f1f24b24d` |
| Formulario y acciones móvil | `Móvil · Documentos` | `7542db39-4a56-801a-8008-b68081ecc442` |
| Acción de entrada desktop | `Desktop · Inicio · primera visita` | `e1f5b81e-f432-80c4-8008-b6a1ad3a9f6c` |
| Acción de entrada móvil | `Móvil · Inicio · primera visita` | `e1f5b81e-f432-80c4-8008-b6a296d96e21` |
| Actividad/carga desktop | `Desktop · Plan · PROCESSING` | `e1f5b81e-f432-80c4-8008-b6a1b4ac0742` |
| Actividad/carga móvil | `Móvil · Plan · PROCESSING` | `e1f5b81e-f432-80c4-8008-b6a29d79c584` |

Estos IDs seleccionan el alcance previsto para la comparación futura; no se pudieron leer ni exportar en esta sesión. Las decisiones de color dibujadas se basan en la tabla de valores extraídos en [`design-map.md`](design-map.md#32-tokens-y-estilos-observados), no en la existencia de tokens Penpot.

## Decisiones de tokens: observado → especificado → código

Las variables CSS guardan canales RGB para que las utilidades Tailwind v3 admitan modificadores de opacidad. Los valores de la tabla son los colores hexadecimales normalizados de esos canales.

| Rol | Literal observado en boards A01 | Especificación/candidato | Código A05 | Estado / límite |
|---|---|---|---|---|
| Fondo `canvas` | `#f5f7f6` | `#F5F7F6` | `--color-canvas` | Coincide con el candidato; sin token enlazado en Penpot. |
| Superficie `paper` | `#ffffff` | `#FFFFFF` | `--color-surface-paper` | Coincide; sin token enlazado. |
| Texto `ink` | `#182b31` | `#182B31` | `--color-text-primary` | Coincide; sin token enlazado. |
| Texto secundario `muted` | `#4c6268` | `#4C6268` | `--color-text-muted` | Coincide; no usar como única señal de estado. |
| Acción principal | `#126c63` | `#126C63` | `--color-action-primary` | Coincide; sin token enlazado. |
| Acción hover | No observado en fills/strokes | Candidato `#0C514B` | `--color-action-hover` | Candidato de especificación, no estado confirmado en Penpot. |
| Separador `line` | `#d4e0dc` | `#D4E0DC` | `--color-line` | Reservado para separadores/superficies; no se usa como borde único de campos. |
| Éxito | `#176c4a` | `#176C4A` | `--color-state-success` | Coincide; texto siempre se conserva junto al color. |
| Aviso | `#8a5a12` | `#8A5A12` | `--color-state-warning` | Coincide; texto siempre se conserva junto al color. |
| Error | `#a52f33` | `#A52F33` | `--color-state-error` | Coincide; texto siempre se conserva junto al color. |
| Superficie de acción suave | `#eaf3f0` | Sin nombre equivalente en tabla de candidatos | `--color-surface-action-subtle` | Literal observado; nombre de rol de implementación. |
| Superficie tenue/seleccionada/deshabilitada | `#e9f0ed` | Sin nombre equivalente en tabla de candidatos | `--color-surface-muted` | Literal observado; reutilizado para fondo deshabilitado con texto oscuro. |
| Superficie general tenue | `#eff5f2` | Sin nombre equivalente en tabla de candidatos | `--color-surface-subtle` | Literal observado; nombre de rol de implementación. |
| Fondo de éxito | `#e7f4ec` | Sin nombre equivalente en tabla de candidatos | `--color-surface-success` | Literal observado; pareja semántica de `state-success`. |
| Fondo de aviso | `#f8f0de` | Sin nombre equivalente en tabla de candidatos | `--color-surface-warning` | Literal observado; pareja semántica de `state-warning`. |
| Fondo de error | `#fbeaec` | Sin nombre equivalente en tabla de candidatos | `--color-surface-error` | Literal observado; pareja semántica de `state-error`. |
| Separador fuerte | `#b5d0c8` | Sin nombre equivalente en tabla de candidatos | `--color-line-strong` | Literal observado; reservado para separaciones más visibles. |
| Borde de controles | No identificado como rol; A01 no registra un color de campo dedicado | Sin valor propuesto | `--color-control-border: #70867F` | Candidato nuevo para que los controles de formulario sean distinguibles; debe validarse visualmente con diseño. |

No se sustituyeron los siete literales adicionales de A01 por hex inventados: se les asignaron roles semánticos en código. El único color añadido no observado ni especificado es el borde de control `#70867F`, cuya razón y contraste se anotan arriba y abajo. `--color-action-hover` implementa el valor candidato existente, sin atribuirlo a una muestra de Penpot.

### Tipografía, ritmo y contornos

| Eje | Evidencia/dirección | Decisión de código | Pendiente |
|---|---|---|---|
| UI | A01 observa IBM Plex Sans; la especificación la asigna a navegación, UI y cifras. | `--font-ui` y `font-ui`/`font-sans`, con `Segoe UI` y `sans-serif` locales como fallback. | No se añadió descarga/autohospedaje de fuentes; no se comparó render tipográfico con Penpot en esta sesión. |
| Lectura | A01 observa Source Serif 4 en títulos/material seleccionado; `fronted-design.md` la deja condicionada a una prueba de lectura. | `--font-reading` y utilidad `font-reading`, optativa; la base no cambia material a serif sin esa prueba. | Prueba de lectura y decisión de carga/autohospedaje pendientes. |
| Tamaño, interlínea y medida | A01 encontró tamaños literales de 8–50 px (incluye metadatos de 8–11 px que requieren validación); la especificación parte de 1 rem y propone lectura ~1.6 con 65–75 caracteres. | `--font-size-body: 1rem`, `--font-size-small: .875rem`, `--font-size-caption: .75rem`, `--line-height-ui: 1.5`, `--line-height-reading: 1.6`, `--measure-reading: 72ch`; utilidades `text-body/small/caption`, `leading-ui/reading`, `max-w-reading`. | Escala utilitaria candidata; no se asignaron tamaños nuevos a cada nodo ni se fuerza `max-w-reading` en el material existente. |
| Espaciado | Penpot no tiene Flex/Grid ni una escala de espaciado extraíble. La especificación propone `0.5 / 0.75 / 1 / 1.5 / 2 / 3 rem`. | Variables `--space-study-1…6` y utilidades Tailwind `*-study-1…6`; todos son múltiplos de 4 CSS px con base de 16 px. | Escala tomada de la especificación, no observada ni validada por componente en Penpot. |
| Radios | A01 observa literales de 2 a 18 px (incluye 8 y 12); no hay token ni escala candidata. | `--radius-control: 8px`, `--radius-surface: 12px`, utilidades `rounded-control`/`rounded-surface`. | Elección representativa; A01 no asigna esos radios a cada nodo de componente. |
| Bordes | A01 observa colores de stroke; no fija un grosor común ni roles semánticos para cada control. | Separador `line`, `line-strong` y candidato específico `control`; componentes consumen utilidades semánticas. | No se declara paridad estructural o de grosor con el artefacto. |

`tailwind.config.js` expone roles semánticos y conserva aliases `brand-*`, `slate-*`, `green-*`, `amber-*`, `red-*` para que las páginas actuales sigan compilando y sus utilidades resuelvan a las variables CSS. Es una capa de compatibilidad para extraer vistas progresivamente, no un contrato para introducir nuevos usos de nombres de paleta. El gráfico de Dashboard usa `line`/`action-primary` desde las variables CSS, y su animación de entrada está desactivada para no mover la gráfica automáticamente. No se cambiaron rutas, consultas ni lógica de negocio en A05.

## API reutilizable de componentes

- `Button` mantiene las variantes públicas `primary`, `secondary`, `ghost` y `danger`; conserva las props nativas y `className`, y añade tamaño mínimo 44 × 44 CSS px.
- `ButtonLink` usa el `<Link>` nativo de React Router con aspecto de botón. Nunca representa un `<button>` anidado en un enlace. El inventario encontró dos casos legacy `<Link><Button>…</Button></Link>` en la fase completada de `SessionPage`; ambos se migraron a `ButtonLink` sin alterar destinos ni lógica de fases. La prueba de esa presentación comprueba nombres, `href`, navegación mediante `MemoryRouter` y ausencia de botón anidado. El resto de enlaces de `AppShell`, `PlanPage`, `PlanDetailPage` y `SessionPage` son links de texto o enlaces a contenido sin botones descendientes.
- `Input` y `Select` son controles nativos con `id` y etiqueta visible requeridos, `name` nativo opcional, `hint`/`error` y asociación `aria-describedby`/`aria-invalid`. Altura mínima: 44 px.
- `Alert` conserva texto y expone `role="alert"` para error o `role="status"` para otros tonos.
- `ActivityIndicator` exige una etiqueta accesible; `Spinner` conserva su API pública previa (`label` opcional) y expone `role="status"` cuando hay texto.
- `Skeleton` reserva dimensiones por `height` y `width` tipados, no propaga un objeto `style` arbitrario y se oculta a tecnologías de apoyo. Acepta dimensiones numéricas (px) y anchos porcentuales de 0–100%; altura no válida cae a 16 px y ancho no válido a `100%`.
- `Card`, `Badge` y `ProgressBar` conservan sus props existentes. `ProgressBar` ahora expone rol, nombre y valor actuales.
- `AsyncState<T>` recibe los estados como props de presentación: loading con layout/skeleton provisto, empty explícito, error inicial con acción manual de retry, actividad durante refetch y error de refetch que conserva el contenido renderizado de los datos (o el empty explícito si los datos ya están vacíos). `onRetry` solo se llama al activar el botón; no hay reintento/mutación automático ni lógica de negocio.

Las páginas existentes aún no consumen `AsyncState` de forma general; el primitive queda listo para extracción posterior, sin alterar los flujos legacy dentro de A05.

Para que el objetivo táctil de 44 px no recorte las tarjetas existentes a 320/390 px, se añadieron solo utilidades de contención al `main` flexible compartido y a la grilla de documentos (`min-w-0`, una columna `minmax(0,1fr)`). No se cambió la navegación, el contrato de subida ni la lógica de páginas.

## Foco, tacto y movimiento

- `:focus-visible` dibuja un contorno de 3 px en `action-primary`, separado 2 px; no se elimina el foco del navegador para otros modos. En los nueve campos legacy de `GoalsPage`/`SettingsPage` se retiró únicamente `focus:outline-none`, que generaba `outline: 2px solid transparent` con mayor especificidad que `:where(...):focus-visible`; se conserva el estilo de borde existente.
- Botones, `ButtonLink`, `Input` y `Select` tienen tamaño mínimo de 44 px. Los links de texto corrido quedan como links normales, no se expanden artificialmente.
- `prefers-reduced-motion: reduce` reduce animación/transición y desactiva scroll suave; el skeleton usa animación solo con `motion-safe`.
- Contraste calculado con la fórmula WCAG de luminancia relativa sobre las combinaciones implementadas en controles/estados:

| Combinación | Ratio calculado | Nota |
|---|---:|---|
| Ink / canvas (`#182B31` / `#F5F7F6`) | 13.66:1 | Texto normal. |
| Muted / canvas (`#4C6268` / `#F5F7F6`) | 6.00:1 | Ayuda/metadatos. |
| Acción / paper (`#126C63` / `#FFFFFF`) | 6.27:1 | Botón principal y foco fuera del control. |
| Acción / canvas (`#126C63` / `#F5F7F6`) | 5.82:1 | Foco sobre marco general. |
| Hover candidato / paper (`#0C514B` / `#FFFFFF`) | 9.15:1 | No confirmado por Penpot. |
| Texto éxito / fondo éxito (`#176C4A` / `#E7F4EC`) | 5.65:1 | Badge/alert. |
| Texto aviso / fondo aviso (`#8A5A12` / `#F8F0DE`) | 5.21:1 | Badge/alert. |
| Texto error / fondo error (`#A52F33` / `#FBEAEC`) | 5.92:1 | Badge/alert. |
| Texto disabled / superficie disabled (`#4C6268` / `#E9F0ED`) | 5.58:1 | No se baja opacidad del texto. |
| Borde control / paper (`#70867F` / `#FFFFFF`) | 3.88:1 | Candidato añadido para límites de input/select. |
| Borde control / canvas (`#70867F` / `#F5F7F6`) | 3.61:1 | Candidato añadido para límites de input/select. |

`line` (`#D4E0DC`) sobre `paper` da 1.36:1; se limita a separación decorativa y no es el único límite visual de Input/Select. Los ratios son cálculos de combinaciones nombradas, no un escaneo de cada estado real de cada página ni certificación de WCAG 2.2 AA. La inspección con navegador/lector de pantalla y el contraste de superficies compuestas siguen pendientes.

## Límites que siguen abiertos

1. La revisión independiente previa de A01 requirió cambios en la definición funcional del CTA deshabilitado y el tratamiento de contenido largo; indicó que la contención visual era parcial y que los extractos históricos de 18 boards no eran reproducibles de forma íntegra. A05 no cierra ni oculta esos hallazgos.
2. Los detalles de estado disabled, hover, tipografía/espaciado y relación de superficies que no estaban dibujados son decisiones de código/candidatos documentados, no aprobaciones de diseño.
3. Sin autenticación del plugin Penpot no se pudo validar/exportar de nuevo ninguna de las seis boards citadas ni generar informe DRIFT o comparar una captura de navegador lado a lado.
4. No se afirma conformidad WCAG, adecuación de zoom al 200 %, respuesta de páginas completas a 320 px ni revisión manual con tecnología de apoyo como resultado de este trabajo.
5. Los hallazgos `PEN-01`, `PEN-02` y `PEN-03` permanecen en A01; tampoco se adoptaron decisiones de producto de la sección 8 del plan.

## Corrección solicitada en la primera revisión A05

- `ui.test.tsx` verifica labels/disabled de controles, destino y navegación real de los dos links de `SessionDone`, y retry de un error de actualización con el contenido visible durante `isFetching`. Mantiene evidencia unitaria de estados skeleton, vacío y error inicial.
- `e2e/smoke/a05-focus.spec.ts` recorre con Tab un botón, `input`, `textarea` y `select` legacy de Goals/Settings a 320 × 844 y 390 × 844; comprueba `:focus-visible=true`, `outline-style: solid`, `outline-width: 3px` y `outline-color: rgb(18, 108, 99)`, sin overflow horizontal. En escritorio verifica también el link de navegación. Comprueba que hover por sí solo no activa `:focus-visible` ni outline y que con `prefers-reduced-motion: reduce` la transición queda por debajo de 0,001 s. Goals/Settings usan DTOs sintéticos interceptados por origen; el preflight confirma runtime `MOCK` y no se llama a ningún proveedor real.
- Evidencia/comandos: `npm test -- src/__tests__/ui.test.tsx` (9/9); `npm run test:e2e` (2/2, incluida la comprobación A05). `npm run test:qa` completó las suites aisladas con 77/77 checks: 3 Playwright API, 72 checks Bruno (21 requests, 51 aserciones y 21 tests) y 2 Playwright E2E; run report `frontend/qa-results/2026-09-30T03-45-23-164Z-c1b40588/run-report.json`, runtime `MOCK`, cleanup confirmado y salida 0. El flujo Bruno/API integra quiz en su backend aislado; la prueba de presentación `SessionDone` no envía quiz ni solicita backend.
- La corrida Playwright guardó capturas locales de Goals con el foco en el campo Título a 320 y 390 px bajo `frontend/qa-results/<runId>/e2e/test-results/`; esos reportes se ignoran en Git. No son capturas de Penpot ni evidencia de paridad.

## Evidencia de navegador A05

Se ejecutó la SPA Vite con `VITE_API_URL` local y se interceptaron `GET /documents` y `GET /dashboard` con DTOs sintéticos; no se inició el backend ni se consultó ningún proveedor LLM. El browser se emuló con `prefers-reduced-motion: reduce`. En Documentos se comprobó nombre/rol, ausencia de errores JS, ancho de documento y botón Eliminar (46 px de alto, dentro del viewport) a 320 y 390 px, y foco visible de 3 px tras Tab. En Dashboard se comprobó que el `stroke` computado del gráfico se resuelve a `rgb(18, 108, 99)` y que no hay overflow. Desktop (1240 × 790) y móvil (390 × 844) se capturaron después de la corrección de layout:

| Vista | Viewport | Captura | Resultado |
|---|---|---|---|
| Documentos desktop | 1240 × 790 | [`documents-desktop.png`](evidence/a05/documents-desktop.png) | Contenido dentro del viewport; foco del enlace de navegación visible. |
| Documentos móvil | 390 × 844 | [`documents-mobile.png`](evidence/a05/documents-mobile.png) | Contenido y acción completos; foco del botón visible; sin overflow horizontal. |
| Dashboard desktop | 1240 × 790 | [`dashboard-desktop.png`](evidence/a05/dashboard-desktop.png) | Gráfico de puntaje usa acción semántica y las superficies no desbordan. |
| Dashboard móvil | 390 × 844 | [`dashboard-mobile.png`](evidence/a05/dashboard-mobile.png) | Gráfico y tarjetas apilados dentro del viewport; sin overflow horizontal. |

Las cuatro capturas existentes se conservan como muestras de las vistas legacy Documentos y Dashboard con datos sintéticos. No muestran `AsyncState` (skeleton/vacío/error), no demuestran paridad con boards Penpot ni aceptación de diseño, y no reemplazan capturas/baselines A02/A17.
