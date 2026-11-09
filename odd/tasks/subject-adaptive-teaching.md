# StudyAI Subject-Adaptive Teaching and Assessment
Objective: Implement `docs/superpowers/plans/2026-11-06-subject-adaptive-teaching.md` completely, preserving StudyAI's existing v1 behavior and adopting opt-in subject-aware teaching/evaluation.
Branch: `feature/subject-adaptive-teaching` | Delivery: `feature-branch-chain` selected by the user (local work-unit slices only; no push/PR/merge) | Test runners: backend `python -m pytest -q`; frontend `npm test`, `npm run lint`, `npm run build`.

## Specs

### S1 — Original learning outcome
> "Quiero que verifiques cómo hacer para que el sistema pueda introducir diferentes tipos de enseñanza y evaluaciones según la materia que se presente, es decir al momento de armarle las preguntas y también en la parte en la parte de enseñarle. Quiero que verifiques cómo puedes meter diferentes tipos de enseñanza, por ejemplo si es que el tema es de letras un tema de letras por ejemplo historia que le enseñes de un tipo con una forma de más representativa más adecuada para la historia y por ejemplo si es matemática debes verificar cómo se enseña cómo se debería enseñar mejor la matemática y también esto va relacionado con el tipo de evaluación que tienes que hacer al final haz un plan para implementarlo dentro de este sistema y dime"

### S2 — Current implementation authorization
> "puedes implementar el plan docs/superpowers/plans/2026-11-06-subject-adaptive-teaching.md completamente"

### S3 — Accepted implementation specification
Implement all six ordered tasks and acceptance criteria, contracts, constraints, and verification in `docs/superpowers/plans/2026-11-06-subject-adaptive-teaching.md`, as authorized by S2. Keep v1 opt-in compatible, preserve the `2 + N` generation-call budget and demo fallbacks, maintain private grading keys until submission, and do not change or stage the unrelated user edit in `docs/SaaS-Produccion.md`. Do not push, open a PR, or merge. TDD and checks are in the referenced plan.

### S4 — Academic reasoning profiles and profile configuration correction
> mira lo que faltó planear es lo siguiente: 1. Los Perfiles Académicos más Útiles (Las "Personalidades" del Examen)
> En lugar de pensar solo en "materias", piensa en el tipo de razonamiento que cada materia exige. Te sugiero implementar estos 5 perfiles base:
> Perfil Lógico-Deductivo (Matemáticas, Física, Programación):
> Enfoque: Resolución de problemas, exactitud, pensamiento paso a paso.
> Cómo evalúa: Importa tanto el resultado final como el procedimiento. Una respuesta correcta sin justificación puede valer menos.
> Perfil Crítico-Argumentativo (Historia, Filosofía, Ciencias Políticas):
> Enfoque: Análisis de causas y consecuencias, contexto, debate de ideas.
> Cómo evalúa: Preguntas abiertas, ensayos cortos, análisis de fuentes. Busca la capacidad de conectar eventos, no solo memorizar fechas.
> Perfil Lingüístico-Interpretativo (Letras, Literatura, Idiomas):
> Enfoque: Comprensión lectora, retórica, análisis de subtextos, gramática.
> Cómo evalúa: Identificación de figuras literarias, traducción, resúmenes analíticos, inferencias a partir de un texto largo.
> Perfil Sistémico-Empírico (Biología, Química, Medicina):
> Enfoque: Memorización estructural (anatomía, tabla periódica) sumado al método científico (hipótesis, experimentación).
> Cómo evalúa: Diagramas de etiquetado, opción múltiple compleja, resolución de casos clínicos o problemas de estequiometría.
> Perfil Aplicado-Práctico (Economía, Ingeniería aplicada, Negocios):
> Enfoque: Uso de herramientas para resolver problemas del mundo real.
> Cómo evalúa: Estudios de caso, análisis de gráficas, toma de decisiones basada en datos.
> 2. Campos Esenciales para tu Base de Datos (El "Esqueleto" del Perfil)
> Para que tu aplicación sepa cómo generar el examen (especialmente si usas Inteligencia Artificial para crear las preguntas a partir del PDF), tu base de datos o modelo debe guardar los siguientes campos (o arrays de parámetros) para cada perfil:
> A. Campos Pedagógicos (El núcleo del examen)
> Nivel de la Taxonomía de Bloom: (Crucial). Define la profundidad cognitiva.
> Recordar / Comprender (Ideal para perfiles de Biología básica o Historia factual).
> Aplicar / Analizar (Ideal para Matemáticas y Física).
> Evaluar / Crear (Ideal para Filosofía y Letras).
> Tipología de Preguntas Permitidas (Array):
> Opción_Múltiple, Verdadero_Falso, Respuesta_Corta, Ensayo, Resolución_Paso_a_Paso, Relacionar_Columnas.
> Criterio de Evaluación Principal:
> Exactitud (Hay una sola respuesta correcta).
> Procedimiento (Vale más el "cómo" llegaste allí).
> Argumentación (Se evalúa la riqueza de la defensa de la idea).
> B. Campos de Configuración de la UI/UX
> Tiempo Estimado por Pregunta:
> Matemáticas: 3-5 minutos (Requiere cálculo).
> Letras: 10-15 minutos (Requiere lectura e interpretación).
> Tipo de Retroalimentación (Feedback):
> ¿El sistema debe dar la fórmula usada? ¿Debe sugerir leer el capítulo X? ¿Debe mostrar contraargumentos?. Todas estás cuestiones deben estár incluidas en el plan, sino están pues está mal

### S5 — Save the revised plan and explain the resulting plan
> pero por eso quiero qeu cambies el plan, si lo haz cambiado me avisas

> y me dices cuáles el nuevo plan

### S6 — Local commits, new branch and implementation authorization
> haz lo commits, crear una nueva rama y empieza a trabajar ahí

## Tasks
- T0 — S4,S5,S6 — Save the expanded five-profile plan, create the new feature branch and commit its specification — documentation worker unavailable; parent recovery/structural readback PASS — done — branch `feature/academic-reasoning-profiles`; commit `d5577f3` (289 authored lines).
- T1 — S2,S3,S4,S6 — Add versioned pedagogy contracts, profile registry, additive model fields and persistence — bounded implementation map `mw9t77se-3-5q59`, then first coherent code/test slice — in progress — commit `38aed29` is only the old foundation; new S4 configuration is not implemented yet. Existing privacy correction remains uncommitted, preserved during planning. Missing independent proof is tracked separately as V1 and still blocks closure/delivery, not explicitly authorized in-scope implementation.
- V1 — S3,S4 — Obtain required independent proof for the current T1/sequence privacy candidate — blocked — waits for explicit human authorization of one new bounded verification attempt after preparation prerequisites are repaired. Previous attempt failed setup with zero tests; no retry/fallback/reset of that attempt.
- T2 — S2,S3,S4 — Generate per-topic reasoning-aligned teaching and assessments from profile configuration in the existing call budget — inline after T1 — pending — commit: pending.
- T3 — S2,S3,S4 — Add v2 assessment DTOs, exact objective grading, explicit formative rubrics, atomic submissions and version-aware progress — inline after T2 — pending — commit: pending.
- T4 — S2,S3,S4 — Add opt-in reasoning-profile selection at both plan entry points and render v2 teaching — inline after backend contract — pending — commit: pending.
- T5 — S2,S3,S4 — Add accessible v2 assessment formats, estimated timing and profile-specific feedback with private pre-submit keys — inline after T3/T4 — pending — commit: pending.
- T6 — S2,S3,S4 — Preserve profile configuration through reinforcement/resume; full checks, differential, browser/pedagogical acceptance and docs — inline after implementation — pending — commit: pending.

## Log
- L1 — User request: "puedes implementar el plan docs/superpowers/plans/2026-11-06-subject-adaptive-teaching.md completamente"
- L2 — The user's original learning objective is recorded verbatim under S1. The detailed accepted specification is the local plan named verbatim in S2/S3; do not reinterpret it as approval for unrelated features.
- L3 — Starting state on `main` was `59a73b4`; only pre-existing working-tree change was the user's `M docs/SaaS-Produccion.md`. Created `feature/subject-adaptive-teaching` without changing that file. Preserve its content and do not stage it.
- L4 — Native sequential implementation chosen because T1→T6 share contracts and edit surfaces. This is an execution method, not a product or delivery decision. ODD delivery default is `ask-on-risk`; forecast exceeds ~400 authored changed lines, so ask the prescribed delivery-shape question before the first qualifying commit. That choice does not authorize any PR or publication. Native RDD lifecycle is conditional on the user-owned switch and facade's validated status.
- L5 — Starting actual implementation now; first bounded work is T1. Record observed RED/GREEN and applicable risk/independent-verification evidence before task closure.
- L6 — T1 is now in progress; T2–T6 remain pending. The forecast exceeds 400 authored changed lines, so delivery remains `ask-on-risk` and requires the prescribed delivery-shape choice before the first qualifying commit. This does not delay scoped implementation and grants no PR/publication authority.
- L7 — T1 worker wrote tests before implementation but could not observe RED because system Python lacked `pytest` and SQLAlchemy. I created ignored `backend/.venv/` and installed only the repository core/dev requirements (no tracked dependency changes). First executable T1 run exposed three test-only bad imports of `snapshot_profile` from `contracts` rather than `registry`; corrected those imports. GREEN: `.venv/bin/python -m pytest tests/test_adaptive_contracts.py -q` = 7 passed, then `tests/test_plan_generation_pipeline.py -q` = 12 passed; both emitted Starlette's `anyio.abc.BlockingPortal` deprecation warning. TDD RED remains unobserved (initial attempt failed before collection); do not invent it. `git diff --check` passed. Native `gentle_review assess` returned `nativeRisk=unassessable` (`package-local-binary-missing`), escalated item 1, and required an independent verifier; `gentle-ai-verify` task `mw58v8nu-4-wayg` completed with findings below. No task/commit closure yet.
- L8 — Independent verifier found (a) v2 omission stayed `None` rather than resolving to `auto`, (b) Pydantic model instances mutated with `model_copy(update=...)` bypassed repository boundary validation, and (c) insufficient public-v1/backfill and multi-kind private-key coverage. Added tests for (a),(b) and observed RED: 2 failed / 7 deselected, specifically `None != 'auto'` and `DID NOT RAISE ValidationError`. Minimal fixes: v2 requests now normalize omitted hint to `auto`, and shared `ContractModel` revalidates instances. Targeted RED tests then GREEN: 2 passed; privacy DTO cases for MC answer, sequence order and rubric exemplar added; full T1 contract file now 12 passed. Combined T1 + generation pipeline was 21 passed before these additions. The verifier did not run tests; its shell scratch-copy attempt failed with a parse error and created no scratch directory. Parent's test results above are the current evidence.
- L9 — Added a public compatibility regression that generates a v1 plan using only `{goal_id, document_ids}`, captures public `GET /plans/{id}`, `GET /sessions/{id}`, and `GET /quizzes/{session_id}` JSON, removes only the adaptive columns from the test SQLite DB, reruns `_ensure_adaptive_content_columns()`, then compares all public responses. First run failed with SQLite `duplicate column name: content_version` while migration re-added columns. Added a `PRAGMA table_info` assertion that verifies all removed columns are absent before migration; focused rerun passed 1/1. Combined run: `.venv/bin/python -m pytest tests/test_adaptive_contracts.py tests/test_plan_generation_pipeline.py -q` = 25 passed, 1 Starlette `anyio.abc.BlockingPortal` deprecation warning; `git diff --check` passed. Independent verifier `mw59kjrl-7-vkok` confirmed the prior findings resolved and no blockers; its note: SQLite `ALTER TABLE DROP COLUMN` requires 3.35+, and it did not rerun tests.
- L10 — Hardened the public-v1/backfill test with a per-test `tmp_path` SQLite engine and patched all request/startup/background-task session factories (`app.db.session`, `app.db.init_db`, `main.SessionLocal`, `app.services.document_service`, `app.services.plan_service`). The first isolated attempt failed before startup migration with `no such table: plans`; `main.lifespan` has a separately imported `SessionLocal`, so patched that alias to the isolated factory. Focused isolated test then passed 1/1. Latest combined T1 and generation-pipeline run: 25 passed, one Starlette deprecation warning; `git diff --check` passed. Risk: item 1 (additive backfill on persistent schemas). Final independent review `mw59x5hh-9-yng1` found no blockers and independently ran the isolated contract suite (13 passed) and combined suites (25 passed). It noted `ALTER TABLE DROP COLUMN` requires SQLite 3.35+; the production backfill remains additive. No commit yet.
- L11 — User selected `feature-branch-chain` for the forecast-over-400-line delivery shape. This organizes local work-unit slices on this feature branch only; it does not authorize push, PR, or merge.
- L12 — T1 is the first delivery slice and stages 984 authored changes across its 12 planned implementation/test/API-contract files. It remains one complete T1 foundation (profile/content contracts, versioned persistence and public-v1 migration proof) so T2 consumes a coherent validated contract; splitting would leave a partial/unusable T1 state and separate tests from the boundary they verify. T1 is isolated as its own commit because it carries Risk item 1. This slice exceeds the approximate 400-line target; the rationale is task integrity and risk isolation, not omitted tests or code-golf.
- L13 — Local commit `38aed29dd3807ec7f5b169c018935a1d5bc94868` (`feat(pedagogy): add versioned profiles and adaptive contracts`) contains 12 files, 984 insertions and 1 deletion (985 authored changed lines since origin/main). Only the baseline human edit `docs/SaaS-Produccion.md` remains modified; it was not staged. Post-commit `gentle_review assess` against full base `59a73b432771f84cb725d55d6960b175ddeb6cf1` returned `risk=high`, `nativeRisk=unassessable`, `package-local-binary-missing`, escalation item 1 applied, `independentVerifier=true`, `rddLine=unknown`, and no candidate/reviewDue. Per returned plan, launched independent `gentle-ai-verify` task `mw5f9guq-a-9iyo` against this exact commit; its review found the sequence-order privacy blocker below.
- L14 — Post-commit verifier `mw5f9guq-a-9iyo` identified that `StoredAssessmentQuestion.sequence_items` (`backend/app/pedagogy/contracts.py:62,65`) can be serialized unchanged into `SequenceQuestionResponseV2.sequence_items` (`backend/app/schemas/adaptive_learning.py:55-57`), revealing the canonical `expected_answer` order when a generated question stores the items in answer order. This violates S3 privacy acceptance even though explicit `expected_answer` is excluded.
- L15 — Added `test_pre_submit_sequence_order_is_not_solution_order` at the public `AssessmentResponseV2` DTO boundary. Observed RED: the response returned `['first','second','third']`, identical to the private answer. `StoredAssessmentQuestion` now validates that a sequence contains at least two unique matching item IDs, securely shuffles canonical input once, and keeps the presentation order stable on repeated model validation/reload. GREEN: the new regression passed (1); combined T1 contracts and generation pipeline passed (26) with one existing Starlette `BlockingPortal` deprecation warning; `git diff --check` passed. Post-fix `gentle_review assess` escalated item 2 (security/privacy) and returned high/unassessable, `package-local-binary-missing`, `independentVerifier=true`; verifier `mw5g04q7-b-acfq` is pending.
- L16 — T1 was blocked on the independent item-2 verifier `mw5g04q7-b-acfq`; the fix remained uncommitted while waiting.
- L17 — Verifier `mw5g04q7-b-acfq` returned T1/S3 UNMET: forcing display order to differ from answer order creates a complement oracle for valid two-item sequences; its test only covered three items, and it did not run tests. Reopened T1. Replace the conditional/forced shuffle with a persisted, answer-independent randomized presentation permutation, stable across reloads; add two-item permutations and malformed-sequence coverage. No commit yet. Verifier scratch `/tmp/studyai-odd-t1s3-fQIF3D` remains outside the repo; no cleanup.
- L18 — Reproduced the complement oracle test-first: with two expected permutations and a deterministic reverse shuffler, the old implementation yielded 1 failed/1 passed (`expected_order=['second','first']` remained publicly `['first','second']`). `StoredAssessmentQuestion` now uses hidden-schema persisted `sequence_presentation_initialized: SkipJsonSchema[bool]`; initial sequence validation shuffles unconditionally once, never compares to the answer, and revalidation preserves the stored presentation order. Added malformed/duplicate/undersized probes, marker schema/privacy assertions, stable DTO/reload assertions, and a real `AdaptiveContentRepository` round-trip for two-item sequences. RED→GREEN: focused 7 passed; DB round-trip 1 passed; combined `tests/test_adaptive_contracts.py tests/test_plan_generation_pipeline.py` 32 passed, one Starlette `anyio.abc.BlockingPortal` deprecation; `git diff --check` passed. `gentle_review assess` escalated item 2 and still returns high/unassessable (`package-local-binary-missing`), requiring independent verification. Third read-only verifier `mw5glv9x-c-xrrh` was pending; no fix commit. Preserve the user's existing `docs/SaaS-Produccion.md` edit.
- L19 — Verifier `mw5glv9x-c-xrrh` returned T1/S3 UNVERIFIED (counts unmet): static inspection found no complement-oracle condition but it could not run tests because scratch setup failed `cp: unrecognized option '--exclude=.git'`; verifier constraints forbid retry/fallback. It also identified that the prior repository round-trip reused one SQLAlchemy session. Strengthened the regression to commit and `repository.get()` from a fresh `Session(engine)`, asserting persisted presentation order and exactly one shuffle; focused round-trip 1 passed, combined contracts + pipeline 32 passed, one Starlette deprecation, `git diff --check` passed. Required independent item-2 proof remains unavailable and must not be retried/escalated; T1 is blocked and correction uncommitted. Its scratch `/tmp/gpm2cSp3/gaUbG3qV/tmp.RaJuxxqMJD` is outside the workspace; do not access/delete without user path authorization.
- L20 — 2026-11-09 user correction (ref m01649), verbatim:

mira lo que faltó planear es lo siguiente: 1. Los Perfiles Académicos más Útiles (Las "Personalidades" del Examen)
En lugar de pensar solo en "materias", piensa en el tipo de razonamiento que cada materia exige. Te sugiero implementar estos 5 perfiles base:
Perfil Lógico-Deductivo (Matemáticas, Física, Programación):
Enfoque: Resolución de problemas, exactitud, pensamiento paso a paso.
Cómo evalúa: Importa tanto el resultado final como el procedimiento. Una respuesta correcta sin justificación puede valer menos.
Perfil Crítico-Argumentativo (Historia, Filosofía, Ciencias Políticas):
Enfoque: Análisis de causas y consecuencias, contexto, debate de ideas.
Cómo evalúa: Preguntas abiertas, ensayos cortos, análisis de fuentes. Busca la capacidad de conectar eventos, no solo memorizar fechas.
Perfil Lingüístico-Interpretativo (Letras, Literatura, Idiomas):
Enfoque: Comprensión lectora, retórica, análisis de subtextos, gramática.
Cómo evalúa: Identificación de figuras literarias, traducción, resúmenes analíticos, inferencias a partir de un texto largo.
Perfil Sistémico-Empírico (Biología, Química, Medicina):
Enfoque: Memorización estructural (anatomía, tabla periódica) sumado al método científico (hipótesis, experimentación).
Cómo evalúa: Diagramas de etiquetado, opción múltiple compleja, resolución de casos clínicos o problemas de estequiometría.
Perfil Aplicado-Práctico (Economía, Ingeniería aplicada, Negocios):
Enfoque: Uso de herramientas para resolver problemas del mundo real.
Cómo evalúa: Estudios de caso, análisis de gráficas, toma de decisiones basada en datos.
2. Campos Esenciales para tu Base de Datos (El "Esqueleto" del Perfil)
Para que tu aplicación sepa cómo generar el examen (especialmente si usas Inteligencia Artificial para crear las preguntas a partir del PDF), tu base de datos o modelo debe guardar los siguientes campos (o arrays de parámetros) para cada perfil:
A. Campos Pedagógicos (El núcleo del examen)
Nivel de la Taxonomía de Bloom: (Crucial). Define la profundidad cognitiva.
Recordar / Comprender (Ideal para perfiles de Biología básica o Historia factual).
Aplicar / Analizar (Ideal para Matemáticas y Física).
Evaluar / Crear (Ideal para Filosofía y Letras).
Tipología de Preguntas Permitidas (Array):
Opción_Múltiple, Verdadero_Falso, Respuesta_Corta, Ensayo, Resolución_Paso_a_Paso, Relacionar_Columnas.
Criterio de Evaluación Principal:
Exactitud (Hay una sola respuesta correcta).
Procedimiento (Vale más el "cómo" llegaste allí).
Argumentación (Se evalúa la riqueza de la defensa de la idea).
B. Campos de Configuración de la UI/UX
Tiempo Estimado por Pregunta:
Matemáticas: 3-5 minutos (Requiere cálculo).
Letras: 10-15 minutos (Requiere lectura e interpretación).
Tipo de Retroalimentación (Feedback):
¿El sistema debe dar la fórmula usada? ¿Debe sugerir leer el capítulo X? ¿Debe mostrar contraargumentos?. Todas estás cuestiones deben estár incluidas en el plan, sino están pues está mal

- L21 — Scope of this turn is a planning correction only. S4 supersedes the old three-profile rollout in the canonical plan; T1 remains blocked, its prior commit does not satisfy S4, and no verifier retry, application source change, staging, commit or publication is authorized by this correction.
- L22 — Explorer `mw9sdqn3-1-kvgt` confirmed five profiles and Bloom/allowed-types/criterion/timing/feedback configuration are missing; listing question types alone would not provide runtime support. It wrote no files and ran no tests. Runtime context-backstop triggered delegation of the documentation-only correction to `mw9sl3d1-2-n1a2`, allowed surface restricted to the canonical plan; parent owns this tracker/memory and structural readback. T1's last verifier failed during preparation and ran zero tests: capability is not proven unavailable, but no automatic retry is authorized. Expanded implementation and a fresh bounded verification attempt require a separate human decision; this revision supplies neither.
- L23 — User confirmation (ref m01776), verbatim: "pero por eso quiero qeu cambies el plan, si lo haz cambiado me avisas"
- L24 — User delivery request (ref m01780), verbatim: "y me dices cuáles el nuevo plan"
- L25 — User authorization (ref m01798), verbatim: "haz lo commits, crear una nueva rama y empieza a trabajar ahí"
- L26 — Documentation worker `mw9sl3d1-2-n1a2` failed `assistant reported an error (unavailable)` after leaving plan edits; no structural PASS was returned and no application tests ran. Worker is finished, not uncertain; no relaunch. Parent corrects inaccurate scratch/foreground/privacy instructions in the partial document and performs its authorized structural readback. Code/test/SaaS preservation hashes match the pre-edit baseline.
- L27 — Created `feature/academic-reasoning-profiles` from `feature/subject-adaptive-teaching` at `38aed29`, preserving all three tracked edits and the untracked tracker. New authorization permits local commits and implementation, not publishing, touching the unrelated SaaS edit, or silently resetting the earlier verifier attempt.
- L28 — Parent recovered partial documentation: restored explicit API endpoints, short-answer normalization boundaries, educational sources and risk items; corrected false pre-submit answer exposure, unsupported subskill requirements, external scratch cleanup and foreground long-test instructions. Structural check exit 0, stdout `PASS: six implementation tasks; five profiles; required model fields, formats and feedback; balanced fences; preserved constraints.` and `PASS: tracker S6/order; source/test/SaaS preservation; no application tests run.` Plan 289 lines, tracker then 136; stderr empty. `git diff --check` exit 0. All three preservation hashes unchanged; no backend/frontend/browser/pilot tests executed for docs.
- L29 — Commit `d5577f3ca31f7b8962a9dbb26197f7640841b095`, `docs(pedagogy): expand plan to five reasoning profiles`, contains only the force-added canonical plan (289 lines); `.gitignore` itself unchanged. Delivery slice boundary: historical foundation `38aed29` (985 lines) ends there; new plan slice `38aed29..d5577f3` is 289 lines. Tracking/continuity is a separate documentation unit; no PR/push/merge.
- L30 — T0 completed; S6 permits starting new T1 source work despite missing proof, while V1 retains the closure/delivery blocker. Read-only explorer `mw9t77se-3-5q59` maps only the first coherent ~400-line S4 configuration slice; it is not a verifier retry. No relaunch of failed documentation worker or previous verifier.
