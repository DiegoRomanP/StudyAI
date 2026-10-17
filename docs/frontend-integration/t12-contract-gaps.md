# T12 — Contratos que el frontend no puede respaldar todavía

Estado: **TODO explícito** (ODD `studyai-fluid-learning`, T12, 2026-10-17).

El mockup (`images/Estudio inteligente con StudyAI.png`) muestra widgets que la API actual no puede alimentar. Según la decisión del usuario («derivar + demo + TODO»), la app real solo muestra lo que se deriva honestamente de la API. Lo demás aparece **únicamente** en `/demo`, bajo el aviso persistente «Demostración simulada». Cada fila de abajo es un contrato que falta. No es una función activa.

| # | Widget del mockup | Qué falta en el backend | Hoy en la app real | Hoy en `/demo` |
|---|---|---|---|---|
| 1 | «Ver explicación» en Práctica | Campo `explanation` por `QuizQuestion` (generado en `session_content`, sin URLs) | No se muestra | Explicaciones de ejemplo |
| 2 | Filtro «Incorrectas» | Historial de respuestas por pregunta: `QuizResult.detail` existe por intento, pero no hay endpoint que liste las preguntas falladas del usuario | Solo «Todas» / «Difíciles» | Se calcula en local durante la visita |
| 3 | «Tiempo de estudio» (Estadísticas) | Registro real de minutos estudiados por sesión (inicio/fin o duración enviada al completar) | No se muestra; se muestran sesiones completadas | «18 h» de ejemplo |
| 4 | Dificultad por pregunta | `difficulty` por `QuizQuestion`. Hoy solo la tienen los temas (`PlanTopic.difficulty`) | «Difíciles» usa la dificultad del tema de la sesión (≥ 4) | Marca de ejemplo |
| 5 | Calendario con fechas programadas | Fecha programada persistida por sesión. Hoy existe `review_offset_days` sobre `Plan.created_at` | Fecha **sugerida** = creación + offset, etiquetada así | Semana/Mes de ejemplo |
| 6 | «¡Hola, Diego!» | Nombre de usuario (auth real; hoy hay un usuario demo fijo, `DEFAULT_USER_ID = 1`) | «¡Hola!» sin nombre | «Alex» de ejemplo |
| 7 | Tendencias «+28 %» en preguntas/tiempo | Agregados por periodo en el servidor; `upcoming_reviews` además está limitado a 200 filas | Tendencia solo de precisión y solo si ambos periodos tienen datos | Tendencias de ejemplo |
| 8 | «Temas dominados 68 %» | Definición de dominio (p. ej., sobre SM-2/EF) expuesta por la API | Anillo de **sesiones completadas** | 68 % de ejemplo |

## Defectos de contrato observados (no son widgets)

- **Fechas sin zona horaria.** SQLite + Pydantic serializan `datetime` UTC sin `Z` (p. ej. `2026-10-17T14:34:44.006386`). El frontend las interpreta como UTC (`parseApiDate`, `src/lib/studyProgress.ts`). Lo correcto sería que el backend emita ISO 8601 con offset.
- **`POST /plans/generate` no valida `document_ids`.** Se verificó el 2026-10-17 con el backend en modo demo: un plan con un ID de documento inexistente llegó a `READY`. La meta sí se valida (propiedad), pero la existencia, la propiedad y el estado `INDEXED` de cada documento no; ya figuraba como carrera abierta en A07. El cliente revalida antes de enviar (`useStudyStart`, `PlanPage`), pero la garantía debe vivir en `PlanService.create_plan`.
- **`weak_topics` incluye todos los temas calificados**, ordenados de peor a mejor (también al 100 %). La UI colorea por puntuación en lugar de tratarlos todos como débiles.

## Cómo cerrar una fila

1. Añadir el campo/endpoint en el backend, con migración/backfill (`init_db.py`), esquema, `docs/api_contract.yaml` y pruebas.
2. Mostrar el widget en la app real y retirarlo de esta tabla.
3. Mantener la versión de `/demo` solo si sigue aportando a la demostración.
