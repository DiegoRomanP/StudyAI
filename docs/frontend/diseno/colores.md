# Reglas de color (obligatorias)

> **Leer antes de** escribir cualquier `className` con color, un `stroke`/`fill`/`stopColor` en SVG, CSS,
> o proponer un color nuevo. Versión corta que se carga sola al editar frontend:
> `.claude/rules/frontend-colores.md`. Si un diseño (o una skill de diseño como `design-taste-frontend`)
> pide otra cosa, **mandan estas reglas**: la paleta es una decisión del producto (medianoche + morado
> luminoso, "lámpara en cuarto oscuro").

Fuente única: `frontend/src/styles/tokens.css` (canales RGB) → `frontend/tailwind.config.js` (clases).
Solo existe **tema oscuro** (`color-scheme: dark`); no hay tema claro.

## R1. Solo tokens semánticos

- Usa **solo** las clases de la tabla de abajo. Prohibido en `.tsx`/`.ts`/`.css` fuera de `tokens.css`:
  hex (`#5178FF`), `rgb(81 120 255)`, `hsl(...)`, colores con nombre, y la paleta por defecto de Tailwind
  (`bg-blue-500`, `text-gray-400`, `bg-black`, `border-slate-*`...).
- En SVG/inline style usa la variable: `stroke="rgb(var(--color-action-primary))"`,
  `stopColor="rgb(var(--color-action-text))"`.
- Opacidad con el modificador de Tailwind (`bg-canvas/70`, `border-line/60`), nunca un color nuevo.
- **Gotcha**: `white` está remapeado a `--color-text-primary` (246 248 255). `text-white` no es blanco
  puro; usa `text-text-primary`. `bg-white` solo se permite como fondo de figuras/SVG del documento
  (`LessonBlocks.tsx`), que necesitan fondo claro para ser legibles.
- Excepción: los activos de marca `components/brand/*` (`Logo`, `LogoMark`, `FlowRiver`) pueden llevar los
  hex del degradado de marca.

## R2. Cada color tiene un rol; no se usa fuera de él

| Clase Tailwind | Token | Rol (único uso permitido) |
|---|---|---|
| `bg-canvas` | `--color-canvas` | Fondo de página. También fondo de `pre`/código grande y velo de diálogos (`bg-canvas/70`) |
| `bg-surface-paper` | `--color-surface-paper` | Tarjeta / panel principal |
| `bg-surface-elevated` | `--color-surface-elevated` | Lo que flota: popovers, diálogos, menús, bottom sheets |
| `bg-surface-subtle` | `--color-surface-subtle` | Bloque anidado dentro de una tarjeta |
| `bg-surface-muted` / `bg-surface-disabled` | `--color-surface-muted` | Controles deshabilitados, chips neutros, código inline, pista de barras de progreso |
| `bg-surface-action-subtle` / `bg-action-subtle` | `--color-surface-action-subtle` | Elemento seleccionado / activo (opción elegida, item de navegación actual) |
| `bg-glass` + `border-glass-line` | `--surface-glass` | Barras fijas (navegación, cabeceras pegajosas) |
| `text-text-primary` | `--color-text-primary` | Texto principal y títulos |
| `text-text-muted` | `--color-text-muted` | Texto secundario: ayudas, metadatos, placeholders. Nunca la única pista de un error o estado |
| `text-action` | `--color-action-text` | Enlaces y acciones secundarias/terciarias (texto) |
| `bg-action-fill` + `text-text-on-action` | `--color-action-primary` | **Botón principal** (uno por pantalla) |
| `hover:bg-action-hover` / `hover:text-action-hover` | `--color-action-hover` | Solo estado hover de acciones |
| `border-line` | `--color-line` | Separadores y bordes decorativos de tarjetas |
| `border-line-strong` | `--color-line-strong` | Borde de tarjeta enfatizada o divisor que debe verse |
| `border-control` | `--color-control-border` | Borde de inputs, selects, checkboxes (lo que el usuario debe identificar como control) |
| `state-success` (+ `-subtle`) | `--color-state-success` | Éxito **del sistema**: guardado, indexado, IA conectada. Es el cian de marca, **no verde** |
| `state-correct` (+ `-subtle`) | `--color-state-correct` | **Solo** feedback de respuesta correcta en test/práctica (verde) |
| `state-error` (+ `-subtle`) | `--color-state-error` | Errores, respuesta incorrecta, acciones destructivas |
| `state-warning` (+ `-subtle`) | `--color-state-warning` | Avisos: cuota casi agotada, plan incompleto, modo demo |
| `bg-flow` / `shadow-glow` | `--gradient-flow` | Solo el CTA principal de marca / landing |
| `bg-flow-soft` | `--gradient-flow-soft` | Fondo de una tarjeta destacada (máx. una por pantalla) |
| `.text-flow` | `--gradient-flow` | Frases cortas de display (≤ 6 palabras). Nunca cuerpo de texto |
| foco | `--color-focus` | Lo pone `index.css` globalmente (`:focus-visible`, 3 px). No lo sobrescribas ni lo quites |

Para respuestas del test: correcto = `state-correct`, incorrecto = `state-error`. Nunca `state-success`
para una respuesta (sería cian y parecería "seleccionado").

## R3. Parejas de contraste verificadas (WCAG AA)

Calculadas sobre los tokens actuales. Texto normal ≥ 4.5:1, texto grande/controles ≥ 3:1.

| Texto / elemento | Sobre | Ratio | |
|---|---|---|---|
| `text-primary` | canvas / paper / elevated | 18.2 / 16.3 / 14.5 | ✅ |
| `text-muted` | canvas / paper / elevated / muted | 8.6 / 7.7 / 6.8 / 6.3 | ✅ |
| `action` (texto) | canvas / paper / elevated / action-subtle | 7.5 / 6.8 / 6.0 / 5.3 | ✅ |
| `text-on-action` | `action-fill` | 5.05 | ✅ |
| **`text-primary`** | **`action-fill`** | **3.61** | ❌ **prohibido**: sobre `bg-action-fill` siempre `text-text-on-action` |
| `text-on-action` | `action-hover` | 11.7 | ✅ |
| `state-X` | `state-X-subtle` (cada estado) | 6.8 – 8.6 | ✅ |
| `state-X` | paper | 7.8 – 10.5 | ✅ |
| `border-control` | paper | 4.51 | ✅ controles |
| `border-line` / `line-strong` | paper | 1.7 / 2.6 | ⚠️ solo decorativo: nunca el único borde de un control |

Una pareja que no está en esta tabla se calcula antes de usarla y se añade aquí.

## R4. El color nunca va solo

Todo estado (correcto, error, aviso, éxito) lleva además **texto o icono**. Un aviso siempre es
`bg-state-X-subtle` + `text-state-X` (o borde `border-state-X`) + icono/etiqueta.

## R5. Añadir o cambiar un color

En el mismo cambio: (1) token en `tokens.css`, (2) clase en `tailwind.config.js`, (3) fila en la tabla
R2 y contraste en R3. Un color sin rol en R2 no se añade. Cambiar el valor de un token existente
cambia toda la app: requiere revisar R3.

## Deuda conocida (corregir al tocar esos archivos)

- `pages/PlanPage.tsx:379` `stroke="#5178FF"` → `rgb(var(--color-action-primary))`.
- `components/ui.tsx:414-416` hex en `stopColor` → `rgb(var(--color-action-text))`,
  `rgb(var(--color-action-primary))`, `rgb(var(--color-action-hover))`.
- `index.css` (fondo de `body`) usa `rgb(81 120 255 / 8%)` y `rgb(97 217 242 / 6%)` en vez de los tokens.
