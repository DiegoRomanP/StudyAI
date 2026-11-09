# Enseñanza y evaluación adaptadas por perfil académico — Implementation Plan

> **Para implementar:** seguir ODD y `odd/tasks/subject-adaptive-teaching.md` por unidad de comportamiento, con RED/GREEN y evidencia real. Usar solo herramientas y skills disponibles; este plan no presupone subskills `superpowers:*` ni instala herramientas. Las casillas describen trabajo pendiente, no pruebas ejecutadas.

**Goal:** Incorporar cinco perfiles versionados de razonamiento académico que alineen por tema la enseñanza, las preguntas, la evaluación formativa y la guía de tiempo, sin cambiar el comportamiento v1 ni las sesiones históricas.

**Architecture:** Mantener la intención de estudio EXAM/LEARNING/MEMORIZATION independiente del perfil. Resolver un perfil por tema y guardar en el JSON de sesión una instantánea completa de la definición source-controlled usada; los formatos nuevos se exponen por contratos v2 separados, con corrección exacta objetiva y autoevaluación formativa explícitamente separadas. La selección y el renderizado v2 son opt-in; la generación conserva su llamada combinada actual.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React, TypeScript, TanStack Query, pytest y Vitest; biblioteca estándar para respuestas numéricas, sin dependencias nuevas obligatorias.

**Spec:** `odd/tasks/subject-adaptive-teaching.md`, S1–S6; S4 amplía los perfiles y S5 exige guardar y explicar el plan. S6 autoriza commits locales, una rama nueva y comenzar la implementación allí.

**Estado de esta revisión:** El usuario autorizó comenzar en `feature/academic-reasoning-profiles`, creada desde `feature/subject-adaptive-teaching`, sin push, PR ni merge. Existe el commit histórico `38aed29`, que solo cubre la fundación T1 anterior de tres perfiles; no satisface S4. La corrección local de privacidad de T1 sigue sin commit y falta su verificación independiente: la preparación anterior falló (`cp: unrecognized option '--exclude=.git'`) antes de ejecutar pruebas. No se reintenta automáticamente; comenzar código autorizado no equivale a verificarlo ni permite cerrar o entregar una unidad sin sus pruebas requeridas. El trabajador documental dejó una edición parcial y falló por disponibilidad; el padre termina su revisión estructural. S4 todavía no está implementado.

## Global Constraints

- La generación mantiene `2 + N` llamadas LLM (no `2 + 2N`); resolver perfiles, construir estímulos y validar feedback no agrega una llamada ni una reparación.
- Conservar el modo demo, los fallbacks puros y el funcionamiento sin claves ni dependencias RAG pesadas.
- EXAM/LEARNING/MEMORIZATION sigue siendo intención de estudio; no es un perfil pedagógico ni determina Bloom por sí solo.
- No ampliar ni sobrecargar el enum `QuestionType` v1. Conservar sus requests, respuestas, cantidades, puntuación, autoevaluación y rutas. Los seis formatos solicitados y las extensiones adicionales viven en DTOs y validadores v2.
- No reescribir JSON histórico. Las nuevas sesiones guardan instantáneas completas versionadas; la lectura de formatos antiguos es compatible y no persiste una migración implícita.
- Los perfiles son definiciones versionadas y source-controlled, no un subsistema mutable de administración ni nuevas tablas de configuración. Persistir la definición efectiva por sesión en el JSON ya existente.
- Corregir automáticamente solo respuestas objetivamente comprobables. Rúbricas, ensayos y procedimientos no reciben calificación semántica LLM; su autoevaluación se etiqueta como formativa y no cambia nota objetiva ni maestría. No agregar llamadas LLM.
- Mantener parsing numérico existente, claves privadas hasta después del envío, idempotencia, revisión y entrega atómica. Una entrada rechazada no altera datos, progreso, revisiones ni eventos.
- Los tiempos son orientación visible por pregunta, nunca temporizador, vencimiento ni timeout. El perfil permite overrides por formato y su rango resuelto persiste al reanudar.
- Renderizar únicamente estímulos tipados, acotados y accesibles. No aceptar HTML/SVG arbitrario ni URLs externas; no agregar dependencias gráficas, OCR ni generación de imágenes.
- Conservar SM-2, cuotas, cancelación, reembolsos, guardas de finalización y borrado explícito de revisiones. YouTube sigue usando palabras clave y URLs de búsqueda.
- No modificar ni preparar para commit el cambio humano en `docs/SaaS-Produccion.md`. Mantener la decisión `feature-branch-chain`: slices locales; sin push, PR ni merge.
- Las pruebas usan datos/proveedor deterministas. El scratch que preparemos debe quedar dentro del proyecto o worktrees autorizados; no acceder ni borrar temporales externos históricos sin permiso específico. No incluir secretos ni depender de datos reales.

## Review Focus

1. **Alias y resolución heterogénea:** `history`/`mathematics`/`general` mantienen su significado compatible, pero `auto` decide por tema dentro del mismo PDF; verificar `test_profile_aliases_and_mixed_topic_resolution` en T1/T2.
2. **Bloom no es una asignación fija por materia:** cada objetivo declara su nivel y se valida contra el enum global; presets son recomendaciones configurables. Verificar `test_bloom_targets_follow_objectives_and_config` en T1/T2.
3. **Claves, estímulos y feedback no inventan evidencia:** ningún secreto de evaluación antes de enviar, estímulo no suministrado no se presenta como fuente y el capítulo solo se cita si su heading exacto llegó en contexto. Verificar `test_stimulus_and_feedback_are_bounded_and_grounded` en T2/T3.
4. **Formato y resultado no confunden corrección con autoevaluación:** exactitud objetiva independiente de rúbrica; procedimiento puede ponderar más que resultado en feedback formativo, pero el rating no cambia nota/maestría. Verificar `test_all_adaptive_types_and_formative_isolation` en T3/T5.
5. **Reanudación y concurrencia:** revisión/configuración completa sobreviven recarga y refuerzo; entrega inválida, duplicada o antigua respeta la atomicidad. Verificar `test_reinforcement_preserves_full_snapshot_and_revision` en T3/T6.

---

## Specification

### S1–S3 — Intención original y compatibilidad

El usuario pidió enseñanza y evaluación adecuadas al tema y autorización de implementar el plan anterior. Esa intención se conserva, al igual que sus garantías: opt-in v2; compatibilidad v1; presupuesto `2 + N`; modo demo; soluciones privadas hasta enviar; sin cambio de proveedor; sin alterar `docs/SaaS-Produccion.md`; y sin push/PR/merge. S4 amplía los perfiles y campos que el plan debe cubrir. S6 autoriza iniciar su implementación en la nueva rama; la prueba independiente pendiente no se considera aprobada por esa autorización.

### S4 — Perfiles y configuración exigidos

Se modelan cinco perfiles de razonamiento, no una tabla fija de materias:

| ID de perfil | Nombre y ejemplos disciplinares exactos | Énfasis de la propuesta | Configuración inicial source-controlled (editable por versión) |
|---|---|---|---|
| `logical_deductive` | Perfil Lógico-Deductivo (Matemáticas, Física, Programación) | Resolución de problemas, exactitud y razonamiento paso a paso; evalúa resultado y procedimiento. | `bloom_levels`: `remember`, `understand`, `apply`, `analyze`; `allowed_question_types`: `multiple_choice`, `true_false`, `short_answer`, `step_by_step`, `matching`; criterio `procedure`; rango base matemático **3–5 min**; feedback `formula`; pesos formativos propuestos `result: 0.4`, `procedure: 0.6`. |
| `critical_argumentative` | Perfil Crítico-Argumentativo (Historia, Filosofía, Ciencias Políticas) | Causas/consecuencias, contexto, debate, fuentes y conexión de eventos, no solo fechas. | `bloom_levels`: `remember`, `understand`, `analyze`, `evaluate`, `create`; `allowed_question_types`: `multiple_choice`, `true_false`, `short_answer`, `essay`, `matching`; criterio `argumentation`; rango propuesto/configurable **8–12 min**; feedback `chapter_reference`, `counterargument`. |
| `linguistic_interpretive` | Perfil Lingüístico-Interpretativo (Letras, Literatura, Idiomas) | Comprensión lectora, retórica, subtexto, gramática, traducción e inferencia textual. | `bloom_levels`: `understand`, `apply`, `analyze`, `evaluate`, `create`; `allowed_question_types`: `multiple_choice`, `true_false`, `short_answer`, `essay`, `matching`; criterio `argumentation`; rango Letras **10–15 min**; feedback `chapter_reference`, `counterargument`. |
| `systemic_empirical` | Perfil Sistémico-Empírico (Biología, Química, Medicina) | Memorización estructural junto al método científico, hipótesis y experimentación; puede plantear diagramas, opción múltiple compleja y casos. | `bloom_levels`: `remember`, `understand`, `apply`, `analyze`, `evaluate`; `allowed_question_types`: `multiple_choice`, `true_false`, `short_answer`, `step_by_step`, `matching`; criterio `accuracy`; rango propuesto/configurable **3–8 min**; feedback `formula`, `chapter_reference`. |
| `applied_practical` | Perfil Aplicado-Práctico (Economía, Ingeniería aplicada, Negocios) | Herramientas para problemas del mundo real, casos, gráficas y decisiones basadas en datos. | `bloom_levels`: `understand`, `apply`, `analyze`, `evaluate`, `create`; `allowed_question_types`: los seis formatos v2; criterio `procedure`; rango propuesto/configurable **5–10 min**; feedback `formula`, `chapter_reference`. |

Los ejemplos disciplinares orientan clasificación; no atan una materia a un único perfil. `auto` resuelve por tema y puede elegir perfiles distintos para temas del mismo PDF. Los rangos no etiquetados como exactos y los pesos son presets propuestos/configurables, no datos provistos por el usuario ni hechos científicos. Cada cambio material a una definición incrementa su `profile_version`; la instantánea de una sesión conserva la versión y valores que realmente usó.

Los campos validados/persistidos de cada definición y snapshot v2 son:

- `bloom_levels`: lista configurable de niveles disponibles para el perfil, basada en el enum global `remember`, `understand`, `apply`, `analyze`, `evaluate`, `create`. Cada objetivo incluye `bloom_target` de ese enum y lo selecciona entre los niveles configurados según objetivo y contexto; no se fija un nivel universal por materia.
- `allowed_question_types`: lista de `multiple_choice`, `true_false`, `short_answer`, `essay`, `step_by_step`, `matching`. Todo formato listado debe tener contrato, validación, envío, semántica de evaluación y UI; no basta declararlo permitido.
- `primary_evaluation_criterion`: `accuracy`, `procedure` o `argumentation`. Es guía pedagógica, no cambia por sí sola el cálculo de nota objetiva.
- `estimated_minutes_per_question`: `{min: int, max: int}`, ambos positivos y `min <= max`; `question_time_overrides` opcional usa la misma validación por formato y sustituye —no suma— el rango base. Un override ausente hereda el rango del perfil. Nuevas respuestas incluyen el rango resuelto. Matemáticas: 3–5; Letras: 10–15. Los demás valores son presets propuestos, configurables y no científicos.
- `feedback_modes`: modos permitidos `formula`, `chapter_reference`, `counterargument`. Solo se presenta un modo permitido por el perfil y respaldado por contexto disponible. Fórmulas, claves, soluciones, ejemplares de evaluación y contraargumentos de respuesta quedan privados hasta enviar; los ejemplos pedagógicos de la lección son contenido distinto.

`chapter_reference` requiere un heading/capítulo exacto que el servidor recibió en contexto. Si no existe, feedback referencia el fragmento real con la limitación de procedencia existente; no se fabrica “capítulo X”, página, autor ni URL. No hay garantía actual de procedencia histórica autenticada.

### Contratos de formato y evaluación v2

- `multiple_choice`: modo `single` con cuatro opciones únicas y una clave; o `multiple` acotado a 4–8 opciones, 2 o más claves y menos claves que opciones. La corrección es exacta, sin crédito parcial: la selección debe coincidir con el conjunto clave. La clave nunca se publica antes del envío.
- `true_false`: respuesta booleana, comparación exacta.
- `short_answer`: declarar `grading_mode`. `exact` compara texto normalizado de forma determinista contra respuestas aceptadas: Unicode NFKC, colapso de espacios y `casefold`; conservar acentos, signos y palabras, sin equivalencias semánticas. Texto no vacío de hasta 2000 caracteres y entre 1 y 16 claves únicas tras normalizar. `formative` pide texto y rúbrica de autoevaluación, sin añadir puntos objetivos.
- `essay`: texto y rúbrica/descriptores para autoevaluación después de entregar; no hay calificador semántico.
- `step_by_step`: pasos escritos y respuesta final. El resultado final puede tener corrección objetiva exacta cuando el objetivo la admite; la calidad del procedimiento es rúbrica formativa separada. El perfil permite configurar pesos positivos `result`/`procedure` que sumen 1 y puede dar mayor peso a `procedure` (preset propuesto 0.4/0.6). Si faltan los pasos/justificación, el feedback no puede marcar el nivel máximo de procedimiento; si hay texto, el sistema no afirma haber validado semánticamente su calidad. Ni la rúbrica ni su peso alteran nota objetiva o maestría.
- `matching`: listas tipadas de elementos a relacionar con IDs estables; entre 2 y 8 pares únicos, todos requeridos y corrección exacta de la correspondencia completa.
- Retener las extensiones existentes v2 `numeric`, `sequence`, `rubric` y `flashcard`; no cambiar sus contratos, parsing racional, límites de texto ni SM-2. El v1 `QuestionType` permanece intacto.
- En v2, MC, verdadero/falso, matching, respuestas cortas configuradas como `exact`, numeric, sequence y resultado final exacto de `step_by_step` pueden aportar nota objetiva. Essay, rúbricas, procedimiento y autoevaluaciones nunca se suman a `correct/total`, score de examen o maestría. Las tarjetas siguen en SM-2, no en score/mastery v2.

### Estímulos tipados y accesibles

Preguntas y objetivos pueden referenciar estímulos `diagram`, `graph`, `case` o `long_text` por ID. El contrato acota datos renderizables: diagramas con nodos/aristas y equivalente textual obligatorio; gráficas con ejes/unidades/series/puntos y equivalente tabular/textual; casos y textos largos con título y cuerpo de texto/Markdown seguro. Los tipos declaran límites de longitud, cantidad de elementos, IDs únicos y enlaces a objetivos; no transportan HTML, SVG libre, imagen generada ni URLs arbitrarias. No se inventa ni se afirma que existe una imagen fuente o un heading ausente. Un esquema tipado solo puede derivarse de relaciones/datos presentes y se etiqueta como generado; sin base contextual se omite. Un caso ficticio, cuando la tarea lo permita, se identifica explícitamente como ejemplo generado y no como evidencia. UI ofrece equivalentes de tabla/texto y navegación por teclado; no requiere librería gráfica ni OCR.

## Diagnóstico y decisiones de diseño

La versión histórica del plan ubicó las costuras en el análisis por tema y en la llamada combinada de material/quiz; describió que v1 tolera claves ausentes y que la maestría v1 mezcla MC con autoevaluación de tarjetas. El relevamiento del trabajo delegado confirmó que el backend actual solo dispone de `history`/`mathematics`/`general` y carece de la configuración pedagógica requerida. El commit `38aed29` y el cambio local de privacidad son trabajo T1 anterior, no implementación S4. Los nombres/rutas de abajo son el mapa de esta propuesta; no requieren inspección ni cambios de código durante la revisión de plan.

### Resolución, alias y snapshot

- Cinco IDs canónicos nuevos: `logical_deductive`, `critical_argumentative`, `linguistic_interpretive`, `systemic_empirical`, `applied_practical`; cada definición source-controlled inicia en `profile_version: 1`.
- Compatibilidad de requests: `subject_hint=history` resuelve por defecto a `critical_argumentative`; `subject_hint=mathematics` resuelve a `logical_deductive`; `subject_hint=general` mantiene el fallback técnico; `subject_hint=auto` o ausente selecciona por tema. Aceptar además los cinco IDs canónicos como `profile_hint`; si llegan ambos campos, rechazar la petición con 422 salvo que expresen la misma resolución. Un hint enviado que no pertenece al conjunto admitido devuelve 422; un candidato de tema ausente, desconocido o `mixed` usa `general`.
- `history`, `mathematics` y `general` siguen siendo identificadores de request legados, no perfiles académicos adicionales. `general` no aparece entre las cinco opciones académicas; es fallback técnico para tema ausente, ambiguo o mixed.
- En `auto`, clasificar cada tema a un perfil canónico de los cinco. Un tema desconocido/no sustentado usa `general`; no hay umbral de confianza inventado. Un hint explícito prevalece para los temas alcanzados por la solicitud.
- JSON histórico con IDs `history@1`, `mathematics@1` o `general@1` permanece byte-a-byte sin reescritura. El lector compatible interpreta en memoria history/mathematics mediante los alias indicados, y general como fallback; si faltan campos S4, usa el adaptador de lectura legado claramente marcado, nunca afirma que esos campos se habían guardado. Las sesiones nuevas guardan `snapshot_schema_version: 2`, ID canónico, `profile_version`, objetivos y todos los campos configurados anteriores, incluso rangos/overrides. Reinicio, reanudación y refuerzo consumen el snapshot guardado, no la definición más nueva del registro.
- La identidad idempotente v1 no cambia. En v2, `content_version`, hint explícito/auto e intención relevante forman parte de la identidad; reusar una clave con configuración distinta produce el conflicto ya definido, no devuelve un plan anterior silenciosamente.

### Persistencia y límites públicos

No agregar tablas de perfiles ni cambiar el enum v1. Guardar la configuración versionada dentro de las columnas JSON de filas existentes:

| Modelo | Campos |
|---|---|
| `Plan` | `content_version` (default 1), `subject_hint` legado y `profile_hint` nuevo, ambos nullable. |
| `SessionMaterial` | `pedagogy_snapshot` completo, `lesson_blocks` y feedback/estímulos validados; conservar Markdown y keywords como respaldo. |
| `Quiz` | `adaptive_assessment` validado con `schema_version: 2`, preguntas/estímulos y claves separadas de datos públicos; `assessment_revision` y `assessment_state` solo para v2. |
| `QuizResult` | No agregar columna: `detail["_meta"] = {"type":"_meta","schema_version":2}`. No usar marcador escalar. |

Rutas v2 explícitas; conservar las firmas/contratos v1:

| Ruta | DTO / función |
|---|---|
| `GET /sessions/{session_id}/learning-mode` | `LearningModeResponse`, `{content_version: 1 | 2}`. |
| `GET /sessions/{session_id}/learning-v2` | `LearningResponseV2`, snapshot público, objetivos y bloques. |
| `GET /quizzes/{session_id}/assessment-v2` | `AssessmentResponseV2`, preguntas públicas y revisión. |
| `POST /quizzes/{quiz_id}/assessment-v2/submit` | `AssessmentResultV2`, nota objetiva y feedback formativo separado. |
| `GET /quizzes/{session_id}/assessment-v2/result` | Resultado persistido idéntico al POST. |

Los DTOs se construyen por allow-list; nunca exponen directamente JSON persistido. Conservar rutas y respuestas v1. Modo y version mismatch mantienen los errores ya descritos en el plan anterior: 409 `CONTENT_VERSION_MISMATCH`, detalle `Esta sesión usa otra versión de contenido.`; contenido aún no publicado: 409 `CONTENT_NOT_READY`, detalle `El contenido de la sesión todavía no está disponible.`. Reusar comprobación existente de pertenencia; rutas sin acceso ORM directo. IDs nuevos v2 son strings `legacy:{id}` o `adaptive:{uuid}`; los IDs enteros de tarjetas SM-2 no cambian.

### Resultados, privacidad y efectos

- Nota objetiva v2: `round(correct / total * 100, 1)` contando solo preguntas objetivas contestadas y con denominador de todos los ítems objetivos requeridos. Exigir al menos uno. Las rúbricas, la calidad de procedimiento y feedback no cambian esa nota.
- `QuizResult.correct/total` reconoce metadatos v2 y conserva exactamente la rama previa sin marcador. Para maestría v2, `exam_score` usa únicamente evidencia objetiva; ratings formativos nunca se convierten en dominio. Sin marcador, conservar la mezcla histórica MC/tarjetas y su peso 0.5.
- Validar pertenencia, revisión, conjunto completo/único y tipos/tamaños de todas las respuestas antes de escribir. Entrada inválida no cambia estado público, resultado, progreso, revisión, contador ni eventos.
- Revisión vieja: 409 `QUIZ_OUTDATED`, detalle existente `Las preguntas de este test cambiaron. Vuelve a cargarlo.`. `ValidationError` de dominio: 400 `{"detail": ...}`; Pydantic: 422. Un envío válido por revisión; fingerprint normalizado y update condicional atómico `open`→`submitted` en la transacción del resultado/finalización. Repetir payload idéntico devuelve resultado guardado 200 sin eventos; otra respuesta devuelve 409 `ASSESSMENT_ALREADY_SUBMITTED`, detalle `Esta evaluación ya fue entregada.`. No cambiar reintentos v1.
- Una entrega válida genera un evento de primera finalización; solo respuestas de flashcard siguen alimentando SM-2. Conservar guards de finalización y límites de la modalidad demo sin autenticación.

### Procedencia y límites

No se promete procedencia autenticada: hoy no se persiste metadata recuperada que permita cita trazable. Rotular texto recuperado `Fragmento del material de estudio; sin procedencia trazable` y escenarios ficticios `Ejemplo generado; no es una fuente histórica`. Rechazar referencia que no esté en contexto de servidor. Para una recomendación de capítulo, usar solo el heading exacto suministrado; sin él, referirse al fragmento real. La procedencia real desde `Retriever.retrieve(...)` queda fuera de esta entrega. Las validaciones comprueban estructura, privacidad, cantidades, tipos, objetivos y formatos; no prueban verdad factual ni corrección pedagógica. No hay OCR, generación de imágenes, calificación semántica ni claims de mejora de aprendizaje.

## Mapa de archivos y límites

Las rutas delimitan la implementación autorizada por S6. Los archivos T1 ya existentes se modifican, no se recrean. Cada tarea mantiene código, tests y documentación dentro de los archivos listados; el tracker registra progreso real y bloqueos.

| Tarea | Crear | Modificar |
|---|---|---|
| T1 | `backend/app/pedagogy/__init__.py`, `backend/app/pedagogy/contracts.py`, `backend/app/pedagogy/registry.py`, `backend/app/schemas/adaptive_learning.py`, `backend/app/repositories/adaptive_content_repository.py`, `backend/tests/test_adaptive_contracts.py` | `backend/app/models/plan.py`, `backend/app/models/session.py`, `backend/app/models/quiz.py`, `backend/app/schemas/plan.py`, `backend/app/db/init_db.py`, `docs/api_contract.yaml` |
| T2 | `backend/app/llm/prompts/adaptive_session_content.py`, `backend/app/services/adaptive_content_builder.py`, `backend/tests/test_adaptive_generation.py` | `backend/app/services/plan_service.py`, `backend/app/llm/prompts/topic_analysis.py`, `backend/app/llm/mock_provider.py`, `backend/tests/test_plan_generation_pipeline.py`, `README.md` |
| T3 | `backend/app/services/assessment_graders.py`, `backend/app/services/adaptive_learning_service.py`, `backend/app/services/adaptive_quiz_service.py`, `backend/app/api/v1/routes/adaptive_learning.py`, `backend/tests/test_adaptive_assessment.py` | `backend/app/api/v1/router.py`, `backend/app/api/v1/routes/quizzes.py`, `backend/app/api/v1/routes/sessions.py`, `backend/app/models/quiz.py`, `backend/app/algorithms/adaptive_route.py`, `backend/tests/test_session_results.py`, `docs/api_contract.yaml` |
| T4 | `frontend/src/components/plan/PedagogySelector.tsx`, `frontend/src/components/session/LessonBlocks.tsx`, `frontend/src/api/adaptiveLearning.ts`, `frontend/src/hooks/useAdaptiveLearning.ts`, `frontend/src/__tests__/AdaptiveLearning.test.tsx` | `frontend/src/api/types.ts`, `frontend/src/api/endpoints.ts`, `frontend/src/hooks/queries.ts`, `frontend/src/hooks/useStudyStart.ts`, `frontend/src/components/home/StudySetup.tsx`, `frontend/src/pages/PlanPage.tsx`, `frontend/src/pages/SessionPage.tsx`, `frontend/src/__tests__/SessionPage.test.tsx`, `README.md` |
| T5 | `frontend/src/components/session/AdaptiveAssessment.tsx`, `frontend/src/__tests__/AdaptiveAssessment.test.tsx` | `frontend/src/pages/SessionPage.tsx`, `frontend/src/api/adaptiveLearning.ts`, `frontend/src/hooks/useAdaptiveLearning.ts`, `README.md` |
| T6 | `backend/tests/test_adaptive_reinforcement.py`, `backend/tests/test_subject_adaptive_flow.py`, `docs/subject-adaptive-pilot.md` | `backend/app/services/reinforcement_service.py`, `backend/app/llm/prompts/adaptive_session_content.py`, `backend/tests/test_session_content_builder.py`, `README.md`, `CLAUDE.md`, `docs/AGENTS_STATUS.md`, `docs/api_contract.yaml` |

Dependencias secuenciales: T1 → T2 → T3 → T4 → T5 → T6. S6 autoriza commits locales por unidad en la nueva rama, no publicación. Si una unidad excede unas 400 líneas, dividir por comportamiento sin separar las pruebas y docs que la verifican; si no hay un corte coherente, informar el tamaño honesto en vez de fragmentar una especificación incompleta.

## Tareas de implementación propuestas

### T1 — Cinco perfiles versionados, contratos y almacenamiento compatible

**Files:** Fila T1 del mapa. No crear tablas ni un editor/admin de perfiles.

**Interfaces:**
- `BloomLevel = Literal["remember", "understand", "apply", "analyze", "evaluate", "create"]`; `QuestionFormat = Literal["multiple_choice", "true_false", "short_answer", "essay", "step_by_step", "matching"]`; `EvaluationCriterion = Literal["accuracy", "procedure", "argumentation"]`; `FeedbackMode = Literal["formula", "chapter_reference", "counterargument"]`.
- `PedagogyProfile` valida `profile_id`, `profile_version`, nombre/ejemplos, `bloom_levels`, `allowed_question_types`, `primary_evaluation_criterion`, `estimated_minutes_per_question`, `question_time_overrides`, `feedback_modes` y pesos formativos opcionales.
- `LearningObjective(id: str, skill: str, description: str, bloom_target: BloomLevel)`; `PedagogySnapshot(snapshot_schema_version: Literal[2], profile_id: str, profile_version: int, objectives: list[LearningObjective], bloom_levels: list[BloomLevel], allowed_question_types: list[QuestionFormat], primary_evaluation_criterion: EvaluationCriterion, estimated_minutes_per_question: MinuteRange, question_time_overrides: dict[QuestionFormat, MinuteRange], feedback_modes: list[FeedbackMode], procedure_rubric_weights: ProcedureWeights | None)`.
- `resolve_profile(hint: str | None, topic_profile: str | None) -> PedagogyProfile`: hint explícito válido precede tema; `auto`/None usa perfil por tema; `history`/`mathematics` son aliases y `general` fallback. El schema HTTP rechaza hints no soportados con 422; candidato de tema ausente/no soportado → `general`.
- `snapshot_profile(profile: PedagogyProfile, objectives: list[LearningObjective]) -> PedagogySnapshot`; `read_pedagogy_snapshot(raw: dict) -> PedagogySnapshot | LegacyPedagogySnapshot` lee schema v2 y los snapshots históricos sin reescribir su JSON.
- `AdaptiveContentRepository.save(self, session_id: int, content: AdaptiveSessionDraft) -> None`; `get(self, session_id: int) -> AdaptiveSessionDraft | None` valida la serialización antes de persistir.
- DTOs v2 separados; `AssessmentAnswerV2` discrimina cada formato por `kind`, `question_id` y el payload de respuesta; no altera schemas v1.

- [ ] **1. RED:** Escribir `test_all_five_profile_definitions_validate`, `test_profile_fields_and_ranges_reject_invalid_values`, `test_profile_aliases_and_mixed_topic_resolution`, `test_legacy_snapshots_read_without_rewrite`, `test_v1_request_defaults_and_question_type_unchanged`, `test_snapshot_contains_full_configuration`, `test_profile_snapshot_is_not_exposed_by_v1_routes` y `test_additive_backfill_preserves_legacy_data`. Cubrir nombres/IDs y ejemplos S4, enums, arrays vacíos/duplicados, rango min/max, override heredado, criterios/modos inválidos, aliases history→critical, mathematics→logical, general→fallback, `auto` sin tema y objetivo con nivel global. Comparar JSON almacenado antes/después de leer snapshot legado; afirmar que no cambia; comprobar vía API v1 que el snapshot/config interna no se filtra. Backfill: SQLite efímera iniciada dos veces y misma respuesta pública v1; scratch dentro del proyecto autorizado.
- [ ] **2. Observar RED:** `cd backend && python -m pytest tests/test_adaptive_contracts.py -q`. Confirmar fallos por contratos/config nuevos; las caracterizaciones v1 deben pasar.
- [ ] **3. Implementar:** Definiciones source-controlled para los cinco perfiles con versión inicial 1, recomendaciones anteriores y ejemplos exactos. Todos los formatos v2 reciben contratos completos. El range lógico matemático es 3–5 y el de Letras 10–15; registrar explícitamente otros tiempos como presets propuestos/configurables. Validar arrays, enums, pesos, alias, snapshots y lectura legacy. Mantener `_add_missing_columns(table: str, definitions: dict[str, str]) -> None`, backfill aditivo e idempotente, sin reescribir JSON ni agregar tablas.
- [ ] **4. GREEN:** repetir contrato y `cd backend && python -m pytest tests/test_plan_generation_pipeline.py -q`; PASS con compatibilidad v1 y lectura histórica. Registrar aquí solo resultados de la futura ejecución, no de esta revisión documental.
- [ ] **5. Docs/slice propuesto:** actualizar `docs/api_contract.yaml` para campos opt-in/compatibilidad. Mensaje propuesto: `feat(pedagogy): add versioned profiles and adaptive contracts`.

### T2 — Resolución por tema, Bloom, estímulos y feedback grounded

**Files:** Fila T2. **Consume:** contratos, resolver, perfiles, snapshot y repositorio T1; `build_session_content(data: dict, config: SessionConfig) -> SessionContent` queda reservado a v1.

**Interfaces:**
- `build_adaptive_session_prompt(topic: str, goal: str, chunks: list[str], config: SessionConfig, snapshot: PedagogySnapshot) -> str`.
- `build_adaptive_session_content(data: dict, config: SessionConfig, snapshot: PedagogySnapshot, allowed_source_ids: set[str]) -> AdaptiveSessionDraft`.
- `topic_analysis` v2 declara por tema `topic_profile` (uno de cinco IDs, `mixed` o `null`) y objetivos con `bloom_target`; no agrega llamada aparte.

- [ ] **1. RED:** Agregar `test_mixed_plan_resolves_each_topic`, `test_bloom_targets_follow_objectives_and_config`, `test_all_question_formats_respect_profile_allowlist`, `test_stimulus_and_feedback_are_bounded_and_grounded`, `test_invalid_alignment_or_source_fails_without_partial_content`, `test_pedagogy_is_part_of_v2_request_identity` y `test_v2_call_budget_and_strategy_counts`. Aserciones públicas: un PDF de temas mixtos usa perfiles distintos; Historia/Biología básica pueden seleccionar remember/understand; Matemáticas/Física apply/analyze; Filosofía/Letras evaluate/create; la salida no usa un nivel no configurado sin override; solo formatos permitidos; cada objetivo aparece en lección y evaluación; estímulo tiene ID/contexto válido y equivalente accesible; chapter_reference solo con heading exacto, sin capítulo/página/URL inventados; feedback privado no aparece antes de submit; inválido no publica sesión parcial. Medir `successful_calls == 2 + generated_sessions`, con cantidades EXAM 3/7, LEARNING 5/5 y MEMORIZATION 8/2.
- [ ] **2. Observar RED:** `cd backend && python -m pytest tests/test_adaptive_generation.py tests/test_plan_generation_pipeline.py -q`; observar fallos nuevos de S4, sin alterar ni falsear evidencia de casos preexistentes.
- [ ] **3. Implementar:** Agregar perfil/objetivos al análisis v2 existente y resolver por tema; hint explícito prevalece. `auto` puede variar por tema y usa fallback general solo si no hay candidato válido. Elegir Bloom por objetivo desde el enum y recomendación configurable, nunca por una regla universal de materia. Construir una sola solicitud combinada de contenido/quiz por sesión. Mock determinista válido para los cinco perfiles y fallback.
- [ ] **4. Implementar límites y validación:** Validar tipos, límites y objetivo de cada estímulo; association `stimulus_id`/`objective_ids`; fuentes permitidas; respuestas/feedback/soluciones privadas; formato contra `allowed_question_types`; rangos de tiempo y feedback contra configuración/evidencia de servidor. Renderer solo recibe estructuras tipadas seguras. No inventar imágenes, headings ni fuentes no presentes; escenario generado se etiqueta. Salida inválida → plan `FAILED`, sin contenido parcial ni llamada correctiva. El constructor v1 conserva tolerancia exacta.
- [ ] **5. GREEN:** repetir los comandos de T2; PASS, incluidas las pruebas de call budget y salidas mixtas. Documentar opt-in, alias, presets no científicos y procedencia limitada en `README.md`.
- [ ] **6. Docs/slice propuesto:** `feat(pedagogy): generate profile-aligned lessons and assessments`.

### T3 — Corrección objetiva, autoevaluación formativa y entrega atómica v2

**Files:** Fila T3. **Consume:** DTOs/snapshots T1 y contenido validado T2.

**Interfaces:**
- `parse_numeric_answer(value: str) -> Fraction` y `grade_objective_answer(question: AdaptiveQuestionV2, answer: AssessmentAnswerV2) -> ObjectiveGrade | None` en `assessment_graders.py`; `None` significa respuesta formativa, no error ni cero.
- `summarize_objective_grades(grades: list[ObjectiveGrade]) -> ObjectiveTotals`; `ObjectiveTotals(correct: int, total: int, score: float)` excluye todo rating formativo.
- `AdaptiveLearningService.get_mode(self, user_id: int, session_id: int) -> LearningModeResponse`; `get_learning(self, user_id: int, session_id: int) -> LearningResponseV2`.
- `AdaptiveQuizService.get_assessment(self, user_id: int, session_id: int) -> AssessmentResponseV2`; `submit(self, user_id: int, quiz_id: int, submission: AssessmentSubmissionV2) -> AssessmentResultV2`; `latest_result(self, user_id: int, session_id: int) -> AssessmentResultV2`.
- La allow-list pública nunca incluye clave de MC/TF/matching/short answer exact, solución numérica, orden correcto, respuestas modelo ni feedback evaluativo privado antes de submit.

- [ ] **1. RED:** Escribir `test_each_requested_format_end_to_end`, `test_bounded_multi_select_is_exact`, `test_short_answer_exact_vs_formative`, `test_step_by_step_weights_are_formative_only`, `test_v2_score_excludes_self_ratings`, `test_version_boundaries_and_private_keys`, `test_rejected_submission_has_no_effects`, `test_v1_contract_unchanged` y `test_same_revision_submit_is_idempotent`. Usar HTTP público en todos. Cubrir true/false, MC simple y múltiple, short answer exact/formative, essay, step-by-step con y sin justificación, matching completo/duplicado/incompleto, más numeric/sequence/rubric/flashcard existentes. Configurar `procedure > result` y verificar que peso/rating solo cambie feedback formativo, nunca nota objetiva, mastery o SM-2; pasos ausentes impiden el nivel máximo de procedimiento. Cambiar ratings de ensayo/procedimiento conservando la misma nota/maestría. Para cada rechazo, afirmar HTTP status y código/detalle exactos y comparar por API pública plan/dashboard/resultado/mastery/review-box/progreso/eventos antes y después.
- [ ] **2. Observar RED:** `cd backend && python -m pytest tests/test_adaptive_assessment.py tests/test_session_results.py tests/test_adaptive_route_flow.py tests/test_dashboard_metrics.py -q`; casos v2 nuevos deben fallar antes de implementación; preservar caracterizaciones que ya pasan.
- [ ] **3. Implementar correctores y contratos de envío:** igualdad exacta tipada para MC single/multiple, bool, matching y short answer exact normalizado; no parser semántico ni `eval`. Mantener numeric (`0,75`, `0.75`, `3/4` equivalentes; rechazar `1/0`, `2+2`, `1e3`, unidades, miles y >64 caracteres), sequence y límites de rúbrica previa. Respuestas de ensayo/short answer formativa/procedimiento producen rúbrica visible y autovaloración separada. Para procedimiento, aplicar pesos configurados solo al resumen formativo y no habilitar puntuación máxima si no hay pasos/justificación.
- [ ] **4. Implementar servicio/rutas y atomicidad:** Crear DTOs por allow-list, checks de sesión/usuario, versión, revisión, conjunto completo y unicidad antes de toda escritura. Aceptar solo revisión actual. Guardar resultado, reclamar `open`→`submitted` condicionalmente, marcar finalización y emitir evento en la transacción existente. Idempotencia misma huella → resultado persistido sin nuevo evento; payload distinto → conflicto. Todo rechazo deja idéntico el estado público y contadores.
- [ ] **5. Implementar scoring/progreso:** Ramas v2 de `QuizResult` y `exam_score` cuentan solo categorías objetivas exactas y escala esperada. Preservar rama sin marcador y comportamiento flashcard-only v1. Calidades flashcard no suben mastery v2; solo siguen alimentando SM-2. Publicar rúbricas/soluciones/feedback privado después de enviar. Tests de dashboard/maestría verifican ambas ramas.
- [ ] **6. GREEN:** repetir comando T3; PASS. Comparar `GET /quizzes/{session_id}/assessment-v2/result` con el POST de entrega y comprobar un único evento/finalización.
- [ ] **7. Docs/slice propuesto:** actualizar OpenAPI. `feat(assessment): add exact adaptive grading and formative feedback`.

### T4 — Selector opt-in de cinco perfiles y enseñanza de sesión

**Files:** Fila T4. **Consume:** selector de perfiles/API v2 T1–T3.

**Interfaces:**
- `AdaptivePlanOptions = { content_version: 2; profile_hint?: "auto" | "logical_deductive" | "critical_argumentative" | "linguistic_interpretive" | "systemic_empirical" | "applied_practical" }`.
- `api.generatePlan(goal_id: number, document_ids: number[], idempotencyKey?: string, pedagogy?: AdaptivePlanOptions): Promise<PlanStatusDTO>`; extender `useGeneratePlan` y `StudyStartInput` con `pedagogy?: AdaptivePlanOptions`. No emitir alias legacy desde el UI nuevo.
- `getLearningMode(sessionId: number): Promise<LearningModeResponse>`; `getLearningV2(sessionId: number): Promise<LearningResponseV2>`.
- `useAdaptiveLearning(sessionId: number): AdaptiveLearningState`; no consulta contenido v1 antes de conocer modo.
- `PedagogySelector(props: { value?: AdaptivePlanOptions; onChange: (value?: AdaptivePlanOptions) => void }): React.ReactElement`; ofrece cinco opciones académicas con nombres españoles exactos y opción inicial automática/no selección.
- `LessonBlocks(props: { lesson: LearningResponseV2 }): React.ReactElement`.

- [ ] **1. RED:** Agregar `test_adaptive_options_reach_api_from_both_entry_points`, `test_all_five_profile_options_are_selectable`, `test_v1_request_stays_unchanged`, `test_mode_controls_lesson_queries`, `test_mixed_topics_show_each_profile` y `test_subject_specific_lesson_blocks`. Fijar requests/status/JSON con exactitud. Cada opción seleccionada transmite su ID canónico; automatic deja resolver por tema; v1 conserva body sin campos adaptativos. Testear contenido pedagógico de los cinco perfiles y fallback general, con etiquetas de procedencia correctas.
- [ ] **2. Observar RED:** `cd frontend && npm test -- src/__tests__/AdaptiveLearning.test.tsx src/__tests__/SessionPage.test.tsx`; observar faltantes de selector, propagación y renderizado.
- [ ] **3. Implementar selección:** Selector en `StudySetup` y `PlanPage`; propagar a API y hooks. Deshabilitado por defecto; selector automático permite que un PDF mezcle perfiles. Mantener validación/reanudación/doble clic e idempotencia; cambiar la intención renueva la clave como requiere T2.
- [ ] **4. Implementar enseñanza:** Consultar modo primero y ramificar en `SessionPage`; `LessonBlocks` renderiza texto seguro, objetivos/Bloom, ejemplos pedagógicos diferenciados de soluciones de examen y estímulos accesibles. Mantener v1, `SafeMarkdown`, temporizador existente y fallback actual. Error de modo visible; nunca fallback silencioso a v1.
- [ ] **5. GREEN:** repetir Vitest y `cd frontend && npm run lint`; PASS. Actualizar README con selector opt-in y explicación de los cinco perfiles.
- [ ] **6. Docs/slice propuesto:** `feat(frontend): add opt-in academic profiles and aligned lessons`.

### T5 — Seis formatos, timing y feedback accesibles en UI

**Files:** Fila T5. **Consume:** `AssessmentResponseV2`, `AssessmentSubmissionV2`, `AssessmentResultV2` T3 y modo/estímulos de T4.

**Interfaces:**
- `getAssessmentV2(sessionId: number): Promise<AssessmentResponseV2>`; `submitAssessmentV2(quizId: number, input: AssessmentSubmissionV2): Promise<AssessmentResultV2>`; `getAssessmentResultV2(sessionId: number): Promise<AssessmentResultV2>`.
- `AdaptiveAssessment(props: { assessment: AssessmentResponseV2; onSubmit: (input: AssessmentSubmissionV2) => Promise<AssessmentResultV2> }): React.ReactElement`.
- Cada pregunta pública incluye rango `estimated_minutes_per_question: {min: number; max: number}` ya resuelto. Mostrar “Tiempo estimado: X–Y min”; no configurar timer/timeout.

- [ ] **1. RED:** Escribir `test_all_six_formats_and_complete_submission`, `test_no_solution_before_submit`, `test_formative_feedback_is_not_an_automatic_grade`, `test_time_guidance_base_and_override`, `test_feedback_modes_require_profile_and_evidence`, `test_stimuli_have_keyboard_and_text_equivalent` y `test_stale_assessment_requires_reload`. Cubrir precisión del payload por tipo, MC multiple select, matching, entrada textual y pasos, rangos Math 3–5 y Letras 10–15, herencia/override por formato, continuidad al recargar, y ausencia de solución/contraargumento/fórmula antes de submit. `chapter_reference` solo si viene el heading real; sin heading usar fragmento contextual existente o no mostrar recomendación inventada.
- [ ] **2. Observar RED:** `cd frontend && npm test -- src/__tests__/AdaptiveAssessment.test.tsx src/__tests__/SessionPage.test.tsx`; casos v2 y accesibilidad nuevos fallan antes del componente.
- [ ] **3. Implementar seis entradas:** Renderizar true/false, MC single/multiple, short answer, essay, step-by-step y matching; mantener numeric, sequence, rubric y flashcard v2. Validación exige respuesta completa; controles con etiquetas, foco visible, manejo por teclado y errores asociados. Diagramas/gráficas tienen tabla/equivalente textual y no requieren dependencia gráfica.
- [ ] **4. Implementar feedback:** Mostrar tiempo como guía persistida, sin temporizador. Separar nota/aciertos objetivos de autoevaluación formativa. La UI no afirma corregir semánticamente ensayo/procedimiento. Mostrar feedback solo después de submit y solo cuando profile+evidencia lo permiten. `QUIZ_OUTDATED` exige recarga explícita, sin reentrega automática; doble submit deshabilitado. Integrar v2 en `SessionPage` sin cambios a `QuizPhase` v1.
- [ ] **5. GREEN:** repetir Vitest y `cd frontend && npm run lint`; PASS. Documentar tipos, feedback, estimaciones y límites de accesibilidad en README.
- [ ] **6. Docs/slice propuesto:** `feat(frontend): render accessible adaptive assessment and guidance`.

### T6 — Refuerzo, reanudación, diferencial y aceptación

**Files:** Fila T6. **Consume:** snapshots/perfiles T1, generación T2, entrega T3 y UI T4/T5.

**Interfaces:** mantener `generate_reinforcement_task(session_id: int, user_id: int, spent_day: date | None) -> None`; agregar `build_adaptive_reinforcement_prompt(topic: str, goal: str, failed_points: list[str], excerpt: str, config: SessionConfig, snapshot: PedagogySnapshot) -> str` y utilizar el constructor validado existente.

- [ ] **1. RED:** Agregar `test_reinforcement_preserves_full_snapshot_and_revision`, `test_failed_reinforcement_keeps_previous_content`, `test_adaptive_plan_resume_and_delete` y `test_end_to_end_five_profiles_fallback_and_mixed_topics`. Recorrer APIs públicas generar → enseñar → entregar → resultado → refuerzo para cada uno de los cinco perfiles, general fallback y PDF mixto. Comparar todas las propiedades del snapshot (Bloom, formatos, criterio, rangos/overrides, feedback, versión, objetivos y estímulos) antes/después; cambiar el registro no altera lo guardado; nueva revisión invalida entrega anterior; fallo conserva contenido/snapshot; recarga muestra los mismos rangos; borrado conserva cleanup explícito existente.
- [ ] **2. Observar RED:** `cd backend && python -m pytest tests/test_adaptive_reinforcement.py tests/test_subject_adaptive_flow.py tests/test_session_content_builder.py -q`; nuevos casos v2/refuerzo fallan donde aún no hay integración.
- [ ] **3. Implementar refuerzo:** Reutilizar snapshot/config/objetivos originales y una sola llamada combinada. Conservar ID de Quiz v2; reemplazar payload, cambiar revisión y reabrir solo al publicar contenido válido bajo guardas transaccionales. Limpiar revisiones flashcard explícitamente. Cuotas/cancelación/reembolso no cambian; v1 queda igual.
- [ ] **4. GREEN funcional:** ejecutar backend `cd backend && python -m pytest -q`; frontend `cd frontend && npm run lint && npm test && npm run build`. Usar `bash_background` para suites/builds de duración larga o desconocida; esperar sus eventos sin polling. Checks finitos previstos en <=30 s usan timeout explícito <=30 s. Conservar salidas y códigos; un timeout es fallo, no autoriza reintento automático.
- [ ] **5. Diferencial v1:** al tocar helpers compartidos, un único script local compara rutas/requests v1 relevantes contra el base de la cadena y el cambio, en estado aislado; compara status, JSON, stdout/stderr y exit code sin normalizar diferencias de negocio. Scratch/copia base va en un directorio temporal dentro del proyecto autorizado, sin copiar datos/secretos ni dependencias pesadas; limpiar solo artefactos probadamente creados por esa comprobación. Pruebas versionadas nunca leen Git history. Cualquier cambio no pedido se fija como regresión y se corrige antes de cerrar.
- [ ] **6. Aceptación navegador/pedagógica:** después de backend/frontend verdes, revisar ambos entry points, teclado, lector/estructura accesible, envío, recarga, timing y feedback con API local/mock. Cubrir los cinco perfiles, fallback y PDF mixto. La revisión competente por materia registra nivel educativo, errores factuales, claves, objetivos y límites; no se presume disponible ni completada. No habilitar v2 por defecto si aparecen claves/fuentes falsas. El piloto documenta resultados reales o queda explícitamente pendiente.
- [ ] **7. Documentación/cierre:** sincronizar OpenAPI, README, CLAUDE, `docs/AGENTS_STATUS.md` y `docs/subject-adaptive-pilot.md` con lo efectivamente implementado y validado. Separar checks automáticos, browser y revisión humana; registrar cualquier no disponible como pendiente. Slice propuesto: `feat(pedagogy): preserve adaptive profile snapshots through reinforcement`.

## Cobertura resumida de S4

| Perfil S4 | Modelo/persistencia | Generación | Corrección | UI | Prueba principal |
|---|---|---|---|---|---|
| `logical_deductive` | T1, snapshot completo y pesos de procedimiento | T2, objetivos Bloom y formatos permitidos | T3, final exacto + rúbrica formativa de pasos | T4/T5, selector y guía 3–5 min | T1/T2/T3/T4/T5/T6 |
| `critical_argumentative` | T1, argumentation y modos grounded | T2, contexto/causas/evidencia | T3, essay/short answer formativos separados | T4/T5, enseñanza y feedback permitido | T1/T2/T3/T4/T5/T6 |
| `linguistic_interpretive` | T1, Bloom, argumentation, feedback y rango 10–15 min | T2, texto/objetivos inferenciales | T3, respuesta exacta o ensayo formativo | T4/T5, lectura y entrada accesible | T1/T2/T3/T4/T5/T6 |
| `systemic_empirical` | T1, remember/understand/apply/analyze | T2, estímulos tipados si fuente/contexto existe | T3, exactitud, matching y multi-select | T4/T5, tabla/texto equivalente | T1/T2/T3/T4/T5/T6 |
| `applied_practical` | T1, criterio/rango configurables | T2, casos/gráficas tipadas grounded | T3, resultado objetivo vs procedimiento | T4/T5, estímulo accesible y feedback | T1/T2/T3/T4/T5/T6 |
| `general` fallback y aliases históricos | T1, adaptador de lectura sin reescritura | T2, solo fallback o alias resuelto | T3, mismas garantías de privacidad/v1 | T4/T5, fallback visible | T1/T2/T4/T5/T6 |

## Riesgos y ejecución

- **Persistencia/alias:** backfill aditivo e idempotente; lectores legacy no reescriben JSON. Validar en SQLite temporal antes de cualquier base persistente.
- **Risk: item 2 — claves y pertenencia:** las soluciones NO viajan antes del submit; DTOs por allow-list, pertenencia y pruebas públicas de no filtración. Demo sigue sin autenticación, por lo que v2 no es un examen de alto impacto.
- **Risk: item 4 — concurrencia:** revisión actual, idempotencia, reclamo atómico y cancelación/refuerzo requieren comprobación independiente por unidad.
- **Risk: item 1 — persistencia:** backfill y datos guardados requieren copia aislada, idempotencia y recuperación antes de una base real.
- **Risk: item 3 — compatibilidad:** contratos compartidos y lectores legados necesitan caracterización y diferencial, además de pruebas v2.
- **Razonamiento Bloom y presets:** valores pedagógicos son recomendaciones configurables, no estándares científicos ni asignación universal por tema. UI no convierte un preset en etiqueta diagnóstica del alumno.
- **Feedback/fuentes:** fórmula/capítulo/contraargumento solo con perfil y contexto; no hay procedencia histórica persistida suficiente para citas verificadas. Sin evidencia se omite o se describe solo el fragmento real.
- **Compatibilidad compartida:** cambios en schemas, helpers, resultados y `exam_score` requieren caracterización v1 y diferencial T6. No corregir incidentalmente anomalías históricas.
- **Renderizado:** estructuras acotadas y equivalentes textuales previenen XSS y dependencia gráfica; no se generan imágenes ni se ejecuta HTML/SVG modelo.
- Slices locales según `feature-branch-chain` y S6. Ninguna evidencia ausente se fabrica: antes de cerrar una unidad de riesgo se requiere verificación independiente aplicable; si falta, informar `Needs your decision`. La revisión nativa se rige únicamente por el switch RDD y consentimiento real del usuario; el plan no los reemplaza. No push, PR ni merge.

## Evidencia histórica y verificación pendiente

- **Histórico del borrador previo:** el documento anterior afirmaba una verificación estructural PASS para el plan de seis tareas; eso ocurrió antes de incorporar S4 y no prueba este plan revisado.
- **Histórico T1:** existe el commit base `38aed29`; la corrección de privacidad permanece local y sin commit. Un verificador independiente devolvió T1/S3 UNVERIFIED porque la preparación del scratch falló con `cp: unrecognized option '--exclude=.git'`; ejecutó cero pruebas y sus restricciones prohíben reintento/fallback. En una ejecución local histórica separada, el round-trip fortalecido reportó 1 prueba y contracts + pipeline reportaron 32; una advertencia deprecada de Starlette y `git diff --check` PASS. Esa evidencia no desbloquea T1 ni valida S4.
- **Esta revisión documental:** ejecutar solo el chequeo estructural síncrono autorizado. No ejecutar tests backend/frontend, build, linter, navegador, piloto ni el verificador T1. Los comandos RED/GREEN escritos en T1–T6 son checks futuros de implementación; no están ejecutados ni se marcan como hechos aquí.
- **Implementación S4:** autorizada por S6, todavía no realizada al guardar esta revisión. No hay evidencia de aplicación, navegador o piloto nueva. Los checks estructurales del padre se registran en `odd/tasks/subject-adaptive-teaching.md`, no se confunden con pruebas funcionales.

## Fuentes educativas conservadas del plan original

- [IES — Improving Mathematical Problem Solving in Grades 4 Through 8](https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/MPS_PG_043012.pdf): ejemplos, representaciones y reflexión; alcance grados 4–8, no evidencia de eficacia de StudyAI.
- [Digital Inquiry Group — Historical Thinking Chart](https://www.inquirygroup.org/history-lessons/historical-thinking-chart) y [Beyond the Bubble](https://www.inquirygroup.org/history-assessments): contextualización y razonamiento con evidencia; no acreditan procedencia que la app no conserva.
- [IES — Organizing Instruction and Study to Improve Student Learning](https://ies.ed.gov/ncee/wwc/Docs/PracticeGuide/20072004.pdf): práctica de recuperación y alternancia de ejemplos/práctica; no todos los métodos tienen el mismo respaldo. Los presets de los cinco perfiles siguen siendo decisiones de diseño revisables, no hallazgos experimentales de esta app.
