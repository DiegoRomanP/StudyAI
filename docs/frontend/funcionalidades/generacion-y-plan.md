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

## Créditos y metas archivadas (solo `saas`)

En `self_hosted`/demo nada de esto aparece ni llama a `/account/credits`.

- **Saldo**: `CreditChip` en la cabecera (sidebar y barra móvil). «N créditos», o «Sin créditos» con
  color de aviso más texto. Al pulsarlo abre un `Dialog` con el aviso y el historial de movimientos
  (`GET /account/credits/history`, fechas con `parseApiDate`). `/settings` no existe en saas, por eso el
  historial vive aquí.
- **Aviso gris antes de gastar** (`CreditNotice`, textos de §3.7 del plan SaaS): paso «Listo» de
  `StudySetup` y `ReviewPanel` (refuerzo). Sin saldo el botón queda deshabilitado con su motivo
  (`aria-describedby`); en `StudySetup` aparece además «Recargar créditos».
- **402 `INSUFFICIENT_CREDITS`** (generar plan, continuar, refuerzo): abre `OutOfCreditsDialog`, que enlaza a
  `/precios` (ruta futura, la página aún no existe) y se puede cerrar con «Ahora no».
- **403 `PLAN_LIMIT_REACHED`** (subir documento, crear meta, desarchivar): se muestra el mensaje del servidor.
- **Metas**: botón archivar/desarchivar en `GoalsPage`; las archivadas van en una sección «Archivadas · N»
  aparte, atenuadas, con borde discontinuo e insignia, plegadas con `useShowMore` (2 visibles).
