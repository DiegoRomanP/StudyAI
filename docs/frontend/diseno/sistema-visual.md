# Sistema visual (tipografía, espacio, forma, movimiento)

> **Leer antes de** maquetar una página o componente nuevo. Colores: [colores.md](colores.md).
> Principios de producto guardados: una sola acción principal por pantalla; inmersión como al leer un
> libro; el foco se mueve por fases; el error se siente como aprender.

Todos los valores vienen de `frontend/src/styles/tokens.css` vía `tailwind.config.js`. No uses valores
arbitrarios (`text-[13px]`, `p-[7px]`, `rounded-[10px]`) cuando existe un token.

| Aspecto | Clases | Uso |
|---|---|---|
| Familias | `font-display` (títulos, h1–h6 por defecto), `font-ui` (interfaz), `font-reading` (material de estudio) | |
| Tamaños | `text-body`, `text-small`, `text-caption` | UI; títulos con la escala de Tailwind |
| Interlineado | `leading-ui`, `leading-reading` | lectura larga usa `leading-reading` + `max-w-reading` (62ch) |
| Espaciado | `study-1`…`study-6` (0.5 → 3 rem) | `p-study-3`, `gap-study-4`… |
| Radios | `rounded-control` (inputs/botones), `rounded-surface` (tarjetas), `rounded-feature` (bloques destacados) | |
| Sombras | `shadow-flow` (superficie flotante), `shadow-glow` (solo CTA principal) | |
| Movimiento | `ease-flow`; duraciones `duration-{micro,press,route,step,overlay,phase,sheet}` | ver «Movimiento» abajo |

- Áreas táctiles ≥ 44 px.
- El material generado por el LLM se pinta con `.prose-study` (`index.css`); `SafeMarkdown` baja los
  títulos un nivel para mantener un único `h1`.

## Movimiento

Tesis: el movimiento explica continuidad y confirma acciones; nada decorativo. El momento propio del
producto es «el foco se mueve por fases», así que solo el cambio de fase de la sesión recorre 12 px.

**Tokens** (`tokens.css`, expuestos como `duration-*` y `ease-*` en Tailwind): `--motion-micro` 180 ms,
`--motion-card` 320 ms, `--motion-page` 420 ms (existentes) y `--motion-press` 120 ms (`:active`),
`--motion-route` 180 ms, `--motion-step` 200 ms, `--motion-overlay` 220 ms, `--motion-phase` 260 ms,
`--motion-sheet` 320 ms. Curvas: `ease-flow` (ease-out fuerte, entradas), `ease-in-out` (movimiento en
pantalla, p. ej. barra de progreso), `ease-drawer` (hojas inferiores). Nunca `ease-in`, nunca `scale(0)`.

**Primitivo único**: `useEnterAnimation(ref, preset, trigger?, { skipFirst?, direction? })`
(`components/motion/`), sobre Web Animations API con `fill: "none"`. Es no-op si no existe
`Element.animate` (jsdom). Cancela la animación anterior al relanzar (interrumpible). `motion` (`m.*`)
queda solo en la landing.

| Preset | Keyframes | Duración | Uso |
|---|---|---|---|
| `route` | opacidad + Y 4 px | 180 ms | cambio de página (`PageTransition`, salta la primera carga) |
| `phase` | opacidad + Y 12 px | 260 ms | fases de la sesión |
| `stepForward` / `stepBack` | opacidad + X ±16 px | 200 ms | siguiente/anterior pregunta o paso |
| `reveal` | opacidad + Y 6 px | 200 ms | respuesta de flashcard, mensaje nuevo, alertas |
| `pop` | opacidad + scale 0,96 | 160 ms | iconos de estado, popovers (`transform-origin` en el CSS) |
| `overlay` / `backdrop` | opacidad + scale 0,96 / opacidad | 220 / 200 ms | diálogo |
| `sheet` | Y 100 % | 320 ms, `ease-drawer` | hoja inferior en móvil |
| `panel` | opacidad + X 16 px | 220 ms | asistente en escritorio |
| `content` | opacidad | 200 ms | esqueleto a datos, solo la primera vez |

Reglas:
- **Solo entradas**: lo viejo se desmonta al instante, nunca conviven dos versiones (tests síncronos,
  Playwright estricto, foco).
- **Reduced motion**: la regla global de `index.css` apaga transiciones CSS y **no se toca** (la exige
  `e2e/smoke/a05-focus.spec.ts`). WAAPI no le afecta, por eso el hook usa un fundido de ≤ 150 ms sin
  transform.
- **Presión**: `transition-interactive duration-micro ease-flow motion-safe:active:scale-press active:duration-press`
  (120 ms al bajar, 180 ms al soltar). Hover solo con puntero fino (`hoverOnlyWhenSupported`).
- **Esqueletos**: `Skeleton` lleva `.skeleton-delay` (aparece tras 150 ms, sin destello en respuestas rápidas).
- Nada se anima al hacer scroll ni en acciones de teclado repetidas.
