# Sesión de estudio, test, refuerzo y asistente

> **Leer antes de** tocar `SessionPage`, `QuizPhase`, `AdaptiveAssessment`, `ChoiceOptions`,
> `SessionTimeline`, `AnswerReview` o `AssistantPanel`.
> Backend: [ruta adaptativa](../../backend/estudio/ruta-adaptativa-y-refuerzo.md),
> [v2](../../backend/generacion-planes/contenido-adaptativo-v2.md), [asistente](../../backend/estudio/asistente.md).

## Test

- El cliente lee `/sessions/{id}/learning-mode` antes de elegir endpoint de lección o test (v1/v2).
- Una respuesta de opción múltiple se corrige al elegirla (opción correcta en `state-correct`, elección
  incorrecta en `state-error`) y luego se bloquea; `ChoiceOptions` compara con `trim()` como
  `quiz_service.submit`.
- Los tipos de pregunta se mezclan con `seededShuffle` (`lib/shuffle.ts`, semilla = id del quiz
  [+ revisión]) para que recargar mantenga el orden.
- Respuestas sin terminar se guardan por navegador en `lib/quizDraft.ts` (`localStorage`, try/catch, se
  borran al enviar con éxito); `QuizPhase` retoma en la primera sin responder.
- 409 `QUIZ_OUTDATED` (un refuerzo reemplazó preguntas): recargar el quiz y conservar las respuestas que
  sigan aplicando.

## Panel de sesiones

En `SessionTimeline` cada sesión abre un `components/Dialog.tsx` cuyas acciones dependen de
`lib/sessionState.ts`: no empezada → material o `?fase=test`; borrador → reanudar o limpiar + `?fase=test`;
completada → `?fase=resultado` (último resultado + `AnswerReview`, de `GET /sessions/{id}/result`) o
`?reintento=1` (reintento ya confirmado, `QuizPhase` no vuelve a preguntar). Las filas completadas muestran
`SessionSummary.last_result` (`correct`/`total` cuentan solo opción múltiple, derivados de `detail`) con
`lib/timeAgo.ts`.

## Refuerzo

«Siempre con IA» es una preferencia por navegador (`lib/reinforcePreference.ts`, `localStorage` con
try/catch), no un ajuste de usuario. "Hoy" es local en el navegador y UTC en el backend (±1 día cerca de
medianoche, aceptado).

## Asistente

`AssistantPanel` (panel lateral no modal / bottom sheet) conoce la pregunta en pantalla vía
`AssistantQuestionContext` (`ReportAssistantQuestion` en `QuizPhase`/`AdaptiveAssessment`). En modo examen
el backend nunca recibe la clave de respuesta. «Mis preguntas» vive en `/preguntas`.

## Movimiento (solo entradas)

Todo con `useEnterAnimation` (WAAPI); nunca hay salidas, ni dos fases o preguntas en el DOM a la vez.

- **Fase** (`PhaseEnter` en `SessionPage`, ambos flujos): estudio, descanso, test y resultado entran con `phase` al cambiar de fase.
- **Estudio** (`StudyPhase`): la intro se desmonta al pulsar «Empezar»; cabecera compacta y material entran con `phase`. Sin animar `min-height` ni escalar el temporizador. El foco pasa a «Terminé».
- **Pregunta** (`StepEnter`, `AdaptiveAssessment`): `stepForward`/`stepBack` según la dirección, con `trigger = índice` y sin `key` nuevo. En `QuizPhase` y `PracticePage` solo `stepForward`.
- **Revelar** respuesta de flashcard: `reveal`. Icono ✓/✗ de `ChoiceOptions` y nota de `SessionResult`: `pop` una vez (texto final desde el principio).
- **Presión**: opciones y botones de valoración `motion-safe:active:scale-press active:duration-press` (patrón de presión).
- **Carga**: `SessionSkeleton` (cabecera + bloque de lectura) sustituye a la cadena de spinners; el texto de cada etapa queda en `role=status`.
