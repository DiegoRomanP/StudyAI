# Ayuda contextual, estados vacíos y primeros pasos

> **Leer antes de** añadir ayuda, tooltips, un estado vacío o tocar `StudySetup`.
> Para auditar/generar guía de usuario, usa la skill de proyecto `onboarding-ux`.

- La ayuda contextual vive en `src/components/help/`. `PageGuide` es un «?» junto al h1 (lo pone
  `PageHeader` con su prop `help`) que abre un popover con hover, foco o toque y no guarda estado;
  `HelpTip` es la primitiva para ayudas de sección o campo (botón «?» con popover de solo texto);
  `HelpTerm` conserva el clic/toque; la lógica común (cierre con Esc/clic fuera, posición) está en
  `usePopover`. Textos en `src/lib/pageGuides.ts` y `src/lib/glossary.ts`. **Reutilízalos en páginas nuevas
  en vez de crear otro patrón.**
- Vacíos con explicación y CTA: `src/components/EmptyState.tsx`.
- Inicio ya no tiene checklist «Primeros pasos». Con plan listo muestra: «Sesión de hoy» (o «Preparar plan
  nuevo» si todo está hecho), `QuickActions` (Nuevo plan, Nueva meta → `/goals?nueva=1`, Subir material,
  Repasar N tarjetas), la franja `StudyPulse` (sesiones, por repasar, racha, «Examen en N días», 3 temas
  priorizados) y «Tus planes». El asistente `StudySetup` queda plegado en `#preparar-plan` («Preparar otro
  plan» / «Cerrar»); el hash `#preparar-plan` lo abre y `?meta=ID` preselecciona la meta. Sin plan listo se
  muestra abierto. `/plan` es solo la lista: «+ Nuevo plan» lleva al asistente y `/plan?meta=ID` redirige.
- Metas guardan `exam_date` (opcional, columna añadida en `init_db`); solo se muestra, no entra en la
  generación del plan. Cuenta atrás: `examCountdown` en `lib/studyProgress.ts`.
- `StudySetup` es un asistente de un paso a la vez (Material → Meta → IA → Listo) y
  «Estudiar» solo existe en el último paso. Paso de IA: ver [conectar-ia.md](conectar-ia.md).

## Movimiento en Inicio y `StudySetup`

- Mientras `plans` está pendiente, Inicio no decide `setupOpen`: no se pinta el asistente (sin destello) y
  se muestra un esqueleto con la forma de Inicio. «Preparar otro plan» abre el asistente con `reveal`.
  Si el asistente se mostró sin planes listos, se queda abierto al terminar el primero (así se ve «¡Tu plan está listo!»).
- El cuerpo del paso entra con `stepForward`/`stepBack` según la dirección (`useEnterAnimation`,
  `trigger = active`, `skipFirst`); el foco al encabezado no cambia. La barra del stepper usa
  `transition-colors duration-micro`; las alertas de estado («¡Tu plan está listo!»…) entran con `reveal`.
- Tarjetas enlazadas de `HomeCards` con el patrón de presión; `StudyStreakCard` reserva su hueco con `Skeleton`.
