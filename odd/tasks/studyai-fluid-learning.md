# StudyAI Fluid Learning Implementation
Objective: Complete the approved fluid-learning frontend plan, preserve real API workflows, and add user-approved backend idempotency for plan generation.
Branch: `fix/frontend-ui-fixes` | Delivery: local work-unit commits; `feature_branch_chain` is planning only; no push, PR, or merge. Test runners: frontend `npm run lint`, `npm test`, `npm run build`; backend `python -m pytest -q`.

## Specs

### S1 — StudyAI identity and source artwork
The user supplied `images/icono.svg` and `images/Estudio inteligente con StudyAI.png` as visual references. Use the SVG's curved, two-tone flow and its luminous river image as inspiration for an original, responsive identity.

> "The central visual metaphor is water: flowing rivers, soft waves, subtle reflections, smooth curves, and continuous movement."
>
> "Avoid generic AI dashboards, excessive neon, overly saturated gradients, and cluttered layouts."

Acceptance: preserve the supplied files; use the flowing line intentionally in the route/brand; do not use the entire reference PNG as a page background.

### S2 — Brand and landing copy
> **Product name:** studyAI
>
> **Tagline:** Find your flow. Master what matters.
>
> **Headline:** "Estudia de forma más inteligente, no más difícil."
>
> **Description:** "Tu aprendizaje tiene un camino. StudyAI te ayuda a descubrirlo, enfocarte en lo esencial y dominar lo que realmente importa."

Acceptance: preserve these strings in the landing, provide functional primary and demo actions, and keep the real study workflow reachable at its existing routes.

### S3 — Main application experiences
> "B. Dashboard" / "C. AI Learning Path" / "D. Pareto Learning System" / "E. Intelligent Practice" / "F. AI Provider Configuration" / "G. Learning Analytics"
>
> "The user provides:"
> - Learning objective.
> - Current knowledge level.
> - Available study time.
> - Deadline or desired pace.
>
> "StudyAI generates an adaptive learning roadmap."
>
> "Show:"
> - High-impact concepts.
> - Learning prerequisites.
> - Estimated effort.
> - Expected learning value.
> - Study recommendations.
> - Priority explanations.
>
> "Include:"
> - Multiple-choice questions.
> - Open-ended questions.
> - Coding exercises.
>
> "Show:"
> - Study consistency.
> - Topic mastery.
> - Question accuracy.
> - Weakest concepts.
> - Time invested.
> - Learning improvements.
> - Recommended next actions.
>
> "The dashboard should immediately communicate what the user should do next."
>
> "Do not produce a generic dashboard with static placeholder cards."

Acceptance: integrate these experiences with the existing shell and API-backed pages. Prioritize the next useful action, explain learning priorities as a heuristic (not a guaranteed 80/20 outcome), and distinguish unsupported capabilities from real learner records. Never imply that a UI input changes generation or that a statistic is measured unless its API contract does so; record missing contracts and decisions as explicit TODOs.

### S4 — Plan-generation idempotency
The user selected the exact decision **"Agregar idempotencia backend"**. Add backend-recognized, database-enforced idempotency for a repeated logical plan-generation request. The same key and payload return the same plan, with only one plan row and one generation task; reusing a key for a different payload returns a clear conflict. Preserve callers that omit the optional key. Document that current FastAPI in-process background tasks are not a durable queue; do not claim crash recovery the implementation cannot prove.

Acceptance: tests observe same-key replay, mismatch conflict, distinct keys, legacy no-key behavior, concurrent insertion/replay, and 202 polling behavior; existing response compatibility remains. Use an additive schema update for existing databases. The runtime `/openapi.json` and `docs/api_contract.yaml` must both describe the exact 409 `detail`/`code` body.

### S5 — Provider safety and supported catalog
> "Never expose credentials in the browser after submission or include secrets in logs. Use appropriate secure server-side credential handling for the deployed architecture."

> "Support a modular provider architecture designed for:"
> - OpenAI.
> - Anthropic.
> - Google Gemini.
> - OpenRouter.
> - Ollama (local models).

Acceptance: configuration reads the actual server provider catalog and preserves the existing revisioned save → model/URL draft → test → activate workflow. Add Gemini as a server-side provider through the repository's provider registry and secure credential flow, verify it using official provider documentation, and never expose secrets in client DTOs or logs.

### S6 — Visual system and requested technology
> "Primary background | `#080D1C`" / "Secondary background | `#101A30`" / "Elevated surface | `#172440`" / "Primary blue | `#5178FF`" / "Flow cyan | `#61D9F2`" / "Soft violet | `#A991FF`"
>
> "Manrope for headings and expressive titles." / "Inter for body text, labels, and form inputs."
>
> "Use: React. TypeScript. Tailwind CSS. shadcn/ui for accessible component foundations. Motion for React for transitions. Lucide React for icons. Recharts for analytics. SVG for flowing paths and decorative graphics."

Acceptance: express semantic design tokens, use the existing React 18/Tailwind 3 architecture, reuse accessible component foundations, and add motion/icon dependencies only when used. Keep flow gradients/glass localized and text readable.

### S7 — Responsive behavior and accessibility
> "Mobile — Bottom navigation. Full-width cards. Large touch targets. Compact progress visualizations. Single-column content. Focused practice sessions."
>
> "Support keyboard navigation, visible focus indicators, adequate contrast, and reduced-motion preferences."
>
> "Respect `prefers-reduced-motion`."

Acceptance: desktop sidebar and mobile bottom navigation with at most five primary items plus access to remaining sections; keyboard/focus, contrast, reflow, reduced-motion, and empty/error/loading states are verified at the project QA sizes.

### S8 — Functional interactions and honest simulation
> "If implementing a prototype, include meaningful interactive demonstrations using local mock data: Navigate between sections. Start a practice session. Answer questions. Show correctness feedback. Advance through questions. Update progress. Switch learning-path views. Select AI providers."
>
> "Clearly distinguish simulated functionality from actual AI integration."
>
> "All interactive elements must have functional states."

Acceptance: build a separate local demo boundary with persistent "Demostración simulada" disclosure; local demo interactions do not write to real API state. Existing real sessions, providers, and analytics use their current API data.

### S9 — Product decisions answered by the user
> "Mostrar el plan (recomendado)"
>
> "Agregar idempotencia backend"

Acceptance: after a plan reaches `READY`, show the plan summary and the next available session action; do not redirect automatically. Use the backend idempotency behavior specified in S4.

### S10 — Motion and performance
> "Use Motion for React for interface transitions and CSS animations for lightweight ambient effects."
>
> "Prioritize transform and opacity animations for performance."
>
> "Avoid unnecessary layout reflows, excessive blur layers, or constant JavaScript-driven animation."
>
> "The interface should feel alive, never restless."

Acceptance: animate state changes with restrained transform/opacity effects, disable nonessential motion for reduced-motion users, and leave study/practice views quiet.

## Tasks

- T01 — S4 — Backend plan-generation idempotency, additive schema and public API contract — delegated (`gentle-ai-worker`) — done — commit: `6d09b27`.
- T02 — S1,S6,S10 — Fluid design tokens, accessible primitives, and restrained motion foundation — inline — done — commit: `ca5af8f`.
- T03 — S3,S7 — Responsive shell, retained deep routes, and mobile bottom navigation — delegated (`Dev-Code`, A06 follow-up) — done — commit: `6b4d28a`.
- T04 — S5,S6 — Provider configuration built from the live supported catalog — delegated (`Dev-Code`, A08; after T11) — pending — commit: pending.
- T05 — S2,S3,S8,S9 — First-use flow, study-start coordinator, and actionable Home after plan readiness — delegated (`Dev-Code`, A09–A10) — pending — commit: pending.
- T06 — S3,S8 — Plan, learning-path, and Pareto views integrated with existing API data — delegated (`Dev-Code`, A11) — pending — commit: pending.
- T07 — S3,S8,S10 — Focused session/practice flow with answer feedback and durable visible result — delegated (`Dev-Code`, A12) — pending — commit: pending.
- T08 — S3,S8 — Analytics/dashboard uses only real available metrics and actionable next steps — delegated (`Dev-Code`, A13) — pending — commit: pending.
- T09 — S1,S2,S3,S6,S8,S10 — Public landing and isolated, interactive local demo — inline — pending — commit: pending.
- T10 — S1–S10 — Reconcile A14–A18 docs/QA, run applicable frontend/backend suites, responsive and accessibility review — inline plus independent `Dev-Reviewer`/`gentle-ai-verify` when required — pending — commit: pending.
- T11 — S5 — Add the Google Gemini provider adapter through the existing backend registry and secure credential lifecycle — inline — done — commit: `963821d`.
- T12 — S3,S8 — Record exact unsupported learning-input, adaptive-planning, practice-evaluation, and analytics contracts as explicit follow-up TODOs instead of implying they are live — inline — pending — commit: pending.

## Log

- L1 — User request: "puedes implementar el plan completo que se propuso"
- L2 — User answers to the plan-generation decisions: "Mostrar el plan (recomendado)"; "Agregar idempotencia backend"
- L3 — User instruction: "tienes que lanzar aentes cuando sea necesario"
- L4 — User commit authorization: "Sí, commits locales" — only scoped local work-unit commits; no push, PR, or merge.
- L5 — User delivery-shape choice: "Encadenar PRs por rama de feature" — planning only, no publication authorization.
- L6 — Exploration: branch is `fix/frontend-ui-fixes`; initial status contains only untracked `.agents/`, `.pi/`, and `images/`. Preserve these user-owned paths.
- L7 — Existing integration state: A02–A06 technically approved; A07 is documented as approved with an uncommitted correction; A08–A18 remain. Continue rather than recreate the earlier baseline/shared components. `docs/README.md` status prose may be stale relative to `docs/Plan-New-Frontend.md` and `docs/AGENTS_STATUS.md`; reconcile after code evidence, do not infer approval.
- L8 — Independent backend mapping found that plan rows commit before in-process task registration; duplicate delivery must enforce a database uniqueness boundary and must not schedule a second generator. Current background tasks are not durable; S4 explicitly bounds the guarantee and report.
- L9 — Native Gentle AI inspect is unavailable (`package-local-binary-missing`). Do not run the installer; report RDD status/assessment as unavailable if it remains unavailable.
- L10 — User instruction: "sigue con todas las actividades siempre verificando y tomando las mejores decisiones, si es que no estás seguro tan solo ponlo como falta implementar en algún punto, yo no te voy a poder reponder hasta después de varias horas, así qeu debes ir haciendo todo hasta terminar según  las condiciones que te puse"
- L11 — T01 started after the user authorized the expanded scope. Delegate only the idempotency unit; preserve existing plan response and document-indexing flows, add Gemini separately, and leave unsupported planning/practice/analytics contracts as explicit TODOs rather than false UI claims.
- L12 — The first worker used global `python`, which lacks pytest; inspection found the project's `backend/.venv/bin/python`. Parent ran `cd backend && .venv/bin/python -m pytest tests/test_plan_idempotency.py -q`: expected RED, 4 failed and 2 passed. No production changes; resume T01 with the project's documented virtualenv.
- L13 — Resumed worker implemented T01 and reported focused tests 6/6, integration flow 1/1, plan pipeline 8/8, backend suite 247/247, and `git diff --check` clean (one Starlette deprecation warning). Parent inspected the diff and `gentle_review assess` returned `risk=unassessable`, `rddLine=unknown`, `package-local-binary-missing`; the independent verifier remains required. The background task is still in-process and non-durable.
- L14 — Independent verification confirmed same-payload replay, concurrent different-payload conflict, SQLite schema upgrade, and 247 backend tests, but found runtime `/openapi.json` omitted the documented 409 response body. Bounded correction: expose the existing `detail`/`code` schema in FastAPI metadata and pin it with a public OpenAPI test; then run only the changed focused check and the verifier's recheck scope.
- L15 — The new public OpenAPI test first failed with `KeyError: 'content'`; after adding the declared response schema to `POST /plans/generate`, the focused regression passed (1 passed, one Starlette deprecation warning). The independent verifier's limited recheck also passed; no full suite was repeated during that bounded correction.
- L16 — Closed T01 in work-unit commit `6d09b27` (`feat(plans): make generation idempotent`). The slice contains 403 insertions and 9 deletions; kept its concurrent-race behavior, migration, tests, and API contract together. Writer reported 247 backend tests passing; independent verification and the focused OpenAPI recheck passed. Native assess remains unavailable (`package-local-binary-missing`, RDD unknown); no receipt or delivery authorization is claimed. T02 is next.
- L17 — Closed T02 in work-unit commit `ca5af8f` (`feat(frontend): add fluid dark design system`). Added semantic dark-flow tokens with contrast checks, Manrope/Inter fonts with fallbacks, restrained atmospheric gradients, the supplied curved SVG adapted as the app mark/favicon, a blue primary action with dark readable text, and press feedback that respects reduced motion. Verification: focused token tests 4/4; frontend suite 113/113; lint and build passed (existing ~825 KB bundle warning); desktop Playwright confirmed fonts and favicon return HTTP 200, blue CTA/dark foreground, no horizontal overflow, 0 errors and 2 React Router Future warnings; `git diff --check` clean; independent review confirmed S1/S6/S10 ready with no findings. Native Gentle review remains unavailable (`package-local-binary-missing`); no receipt, push, PR, or merge is claimed.
- L18 — Started T03 (S3/S7): responsive shell and accessible mobile navigation are next. Preserve existing routes and continue the A06 follow-up; verify desktop sidebar, no more than five primary bottom-navigation destinations, access to remaining routes, keyboard/focus behavior, and retained deep links. No T03 source changes yet.
- L19 — Dev-Code returned the T03 shell implementation and reported focused RED (6 failed, 29 passed) then GREEN (35/35), full suite (115/115), lint/build, and one-off Chromium checks at 320/375/768 px without horizontal overflow. It also reported `npm run test:e2e` as 1 passed/2 failed: existing A06 E2E expects the replaced `Menú`/six-link mobile panel, while A05 E2E expects the former focus color `rgb(18,108,99)` instead of the requested token `rgb(97,217,242)`. These E2E failures are not parent-reproduced yet; T03 remains in progress and uncommitted pending reproduction and disposition.
- L20 — Parent reproduced `cd frontend && npm run test:e2e`: exit 1 after 32.4s, 1 passed and 2 failed (`a05-focus.spec.ts:117` hard-coded old focus color; `a06-navigation.spec.ts:368` old mobile navigation flow). Do not retry without a test change. Adapt the E2E expectations to the semantic `--color-focus` token and the five-link bottom nav plus `Más` overflow, preserving its keyboard, active-route, deep-link, recovery, and no-API-side-effect checks; then run the changed verification once.
- L21 — Updated A05 focus verification to compare the rendered outline with the semantic `--color-focus` token and updated A06's E2E navigation model for five bottom-nav links plus the keyboard-operated `Más` overflow. Parent ran `npm run test:e2e` once after those changes: exit 0, 3/3 passed; QA built production and served it at HTTP 200. `npm run test:qa:types` passed. Dev-Code reports T03 focused 35/35, full unit suite 115/115, lint/build, and viewport checks at 320/375/768 without horizontal overflow. T03 remains uncommitted pending parent diff review and independent verification.
- L22 — Independent verifier confirmed the T03 shell slice but flagged that `Más destinos` is a navigation landmark nested inside the bottom navigation landmark, and that E2E coverage did not assert content clears the fixed bar or route navigation remains GET-only. Its isolated Chromium launch was unavailable; the parent E2E run at L21 passed. Add a focused landmark test and strengthen `a06-navigation.spec.ts` for fixed-bar clearance and no non-GET API requests, then rerun changed tests once and re-review.
- L23 — Moved the mobile `Más destinos` navigation landmark outside the bottom-navigation landmark. Added an AppShell regression test and strengthened A06's browser evidence to capture the fixed-bar top, require every keyboard-focused page control to clear it, and require route navigation/recovery to issue only GET requests. TDD: the new landmark regression produced RED (1 failed, 7 passed); first focused check also caught one stale test that still expected the `nav` itself fixed; after updating that structural assertion, AppShell/AppRoutes GREEN 36/36. `npm run test:qa:types` passes. The strengthened E2E suite has not yet run; T03 stays uncommitted.
- L24 — The first strengthened `npm run test:e2e` run passed 2/3 specs but exposed a real A06 keyboard-occlusion issue: on Inicio a focused link bottom was at y=498 while the fixed nav began at y=491.5. Added mobile `scroll-padding-bottom: calc(6rem + env(safe-area-inset-bottom))` to the main scroll container and reset it at `md`; rerun focused/layout E2E is pending. Current evidence also includes full frontend suite 116/116, lint, and QA types passing; no commit.
- L25 — The next A06 run still failed on the same focused Metas link (bottom y=515 versus nav top y=491.5); scroll-padding on `main` did not resolve keyboard auto-scroll. The app's document root is the likely scroll host, so move mobile scroll-padding to `html` in `index.css`, remove the ineffective main utility, and verify with the same E2E clearance assertion before proceeding. No closure or commit.
- L26 — Moved responsive scroll-padding to the root `html` viewport (`max-width: 767px`) and removed the ineffective main utility. Parent reran `npm run test:e2e`: 3/3 pass; A06 now proves every focused in-page control clears the fixed bottom navigation and navigation/recovery emit no non-GET requests. Production QA build served at HTTP 200. Full frontend unit suite 116/116, focused AppShell/AppRoutes 36/36, QA types, lint, and final `git diff --check` pass. T03 remains uncommitted pending final independent review.
- L27 — The final independent verifier found no change-caused blockers for the T03 shell slice of S3/S7; it noted that a nonzero safe-area runtime was not simulated and that `/sessions/:id` has no active navigation destination, which is pre-existing and unspecified by T03. Added a source regression in `design-tokens.test.ts` pinning mobile root `scroll-padding-bottom` to include `safe-area-inset-bottom`. Focused design-token tests pass 5/5; full unit suite 117/117; AppShell/AppRoutes focused 36/36; E2E 3/3 with production QA HTTP 200; lint, QA types, and final diff check pass. No nonzero safe-area browser emulation or native Gentle review receipt is claimed. T03 is ready for its authorized local commit.
- L28 — Closed T03 with work-unit commit `6b4d28a` (`feat(frontend): add responsive bottom navigation`). It contains the responsive shell, independent mobile overflow landmark, root mobile scroll clearance including safe-area inset, updated AppShell/AppRoutes/design-token tests, A05/A06 E2E checks, and this feature log through L27. T03 is done; no push, PR, merge, or native review receipt.
- L29 — T03's code work-unit commit `6b4d28a` and ODD evidence commit `b10879a` are complete. Start T11, the backend Google Gemini adapter, before provider-configuration T04 as required by its dependency. No provider code has changed yet; next map the existing provider registry, credential lifecycle, and tests, then check official Gemini documentation before any implementation.
- L30 — T11 exploration settled choices before source edits: use native REST `generateContent` over Google's beta OpenAI-compatible endpoint; authenticate only with `x-goog-api-key`, and use the fixed `/v1beta/models/{model}:generateContent` endpoint. Official references: [GenerateContent API](https://ai.google.dev/api/generate-content), [GenerateContent errors](https://ai.google.dev/gemini-api/docs/generate-content/api-errors), [Gemini 3 guide](https://ai.google.dev/gemini-api/docs/generate-content/gemini-3), and [thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking). Map invalid keys only from structured `error.details[].reason == API_KEY_INVALID` (including HTTP 400), never provider messages; output only non-thought text and ignore one-shot thought signatures. SQLAlchemy's PostgreSQL enum is `llmprovidername`; `create_all` creates a missing type but does not add labels to an existing type. Run a PostgreSQL-only `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'GEMINI'` after `create_all` and commit before use; SQLite remains unchanged. Model discovery is Ollama-only in the current service, so Gemini uses common models and supports custom model IDs without advertising dynamic discovery. T11 is one connected vertical slice, so route inline rather than splitting coupled writers; independent high-risk verification follows tests. No Gemini implementation or RED test yet. References: [SQLAlchemy PostgreSQL ENUM](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html), [PostgreSQL ALTER TYPE](https://www.postgresql.org/docs/17/sql-altertype.html).
- L31 — API contract review found that the current frontend error type guard allowlists provider names; with the live backend catalog including Gemini, valid typed Gemini 502 errors would be hidden behind the generic fallback. Extend only the client provider union and allowlist, and pin the safe Gemini error path while retaining the existing NVIDIA and unknown-provider checks. This bounded S5 bridge is in T11; it does not redesign provider settings UI. The shared parser path keeps T11 on the high-risk verification route.
- L32 — Independent read-only verification reproduced a model-ID path escape: the current validator accepts slash-delimited dot segments and the adapter preserves `/`, so an ordinary custom model can change the request from the fixed `/v1beta/models/{model}:generateContent` path while remaining on Google's host. This blocks S5. Before fixing, add a public settings-API regression test that rejects the model and verifies the credential draft/revision remain unchanged; then validate model path segments in both the definition and runtime path builder while preserving valid custom/tuned model IDs. The verifier also confirmed focused slices and noted no live Google-key or PostgreSQL-server test; no source fix is written yet.
- L33 — Fixed the path escape with `validate_gemini_model_id`: only safe resource-name segments are accepted, dot/empty segments and IDs longer than 128 characters are rejected both at provider-definition validation and when the runtime endpoint path is built. The public settings RED test changed from 200 to 400 and now verifies unchanged credential model/revision/verification/activation; valid `tunedModels/biology-v2` remains accepted and sends exactly under `/v1beta`. Focused backend slice: 53 passed; full backend suite: 267 passed (one existing Starlette/AnyIO deprecation warning). Frontend suite: 118 passed and TypeScript lint passed before this backend-only fix. Independent verifier recheck: S5 blocker met; its scratch API probe confirmed persisted-invalid models fail before provider construction; 43 focused tests passed in scratch. No live Google API/key or PostgreSQL server test. T11 remains in progress pending final diff review and local work-unit commit.
- L34 — Official Google Gemini model documentation confirms `gemini-3.8-flash` is a stable model code and lists structured outputs as supported; this validates the catalog default and the native JSON response profile. Source: [Gemini 3.8 Flash model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), last updated 2026-09-02.
- L35 — Closed T11 in work-unit commit `963821d` (`feat(llm): add Google Gemini provider`). The slice includes native GenerateContent REST, fixed Google host/version path, safe model resource validation, provider registry/catalog integration, encrypted credential flow and structured invalid-key handling, PostgreSQL enum backfill, frontend provider/error contract compatibility, focused tests, and API contract documentation. Verification: public path-escape RED→GREEN (400, with stored credential/revision/verification/activation unchanged); valid tuned-model path under `/v1beta`; focused backend 53/53; full backend 267/267; frontend API error 8/8; full frontend 118/118; TypeScript lint; API-contract YAML parse; staged/working diff checks; independent `gentle-ai-verify` recheck met the S5 blocker (43 focused tests in its scratch copy). Official Google docs confirm the stable default model and structured-output support. No live Google key/API or PostgreSQL-server test was available; native Gentle review remains unavailable (`package-local-binary-missing`), and no native receipt is claimed. No push, PR, or merge. T04 (provider configuration) is next.
