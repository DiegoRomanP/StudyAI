# Generación de planes y vista de plan

> **Leer antes de** tocar `usePlan`, `GenerationProgress`, `PlanDetailPage`, `useStudyStart` o
> `useResumePlan`. Backend: [../../backend/generacion-planes/pipeline.md](../../backend/generacion-planes/pipeline.md).

- La generación es asíncrona: `usePlan` sondea un plan PROCESSING cada 3 s (`refetchInterval`).
- `GenerationProgress` (`src/components/plan/`) muestra la etapa real y, solo durante `CONTENT`,
  «Preparando la sesión N de M» con barra (**nunca un porcentaje inventado**); `generationLabel` da a Inicio
  el mismo texto.
- Un plan FAILED se etiqueta **«Incompleto»** en todas partes y ofrece «Continuar generación»
  (`useResumePlan`, también `useStudyStart.resume`), que manda una sola petición aunque haya doble clic y se
  deshabilita con su motivo cuando la IA gratuita no tiene usos.
- `PlanDetailPage` muestra `error_message` del plan FAILED: es la única forma de que el usuario sepa por qué
  falló. No lo quites.
- Progreso del plan: cuenta solo sesiones `kind === "NEW"`. El orden de la ruta se calcula al leer con
  `routeOrder` (`src/lib/studyProgress.ts`), nunca se persiste (lo que "toca hoy" cambia cada día).

## Movimiento de `GenerationProgress` y `SessionTimeline`

- El check de cada etapa completada entra con `pop`; la etiqueta de progreso con `reveal` al cambiar de etapa
  (`skipFirst`). Las filas de `SessionTimeline` usan el patrón de presión
  (`transition-interactive duration-micro ease-flow motion-safe:active:scale-press active:duration-press`).
