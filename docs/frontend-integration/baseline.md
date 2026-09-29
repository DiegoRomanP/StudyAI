# A02 — Línea base técnica y funcional

**Captura:** 2026-09-29 · **Commit de referencia:** `efea4b867770feb2bf3b9ad39e2339208508ccfa` (`fix/frontend-ui-fixes`)  
**Alcance:** estado del código anterior al rediseño; no es una revisión de paridad Penpot ni una aprobación de A01.

## Corrección A02 tras revisión independiente

- Esta vuelta comenzó en `fix/frontend-ui-fixes`, HEAD `efea4b867770feb2bf3b9ad39e2339208508ccfa`, sin staged/unstaged y con los untracked ya existentes `baseline.md`, `evidence/a02/` y `frontend/src/__tests__/queries.test.tsx`. Se conservaron; no se tocó producción ni se adelantaron A03/A04/A01/A06/A11/A12.
- La evidencia raíz `evidence/a02/flow-report.json` y sus seis PNG pertenecen a la captura anterior: no guardaban `run_id`, hora UTC exacta ni eventos HTTP con IDs/body correlacionables. Se preservaron como evidencia histórica y no se les atribuyeron los IDs de la repetición.
- La repetición auditada es `a02-correction-20260929-02`; véase `evidence/a02/runs/a02-correction-20260929-02/flow-report.json`. La primera repetición de corrección (`...-01`) se conserva aparte y falló antes de crear la meta por un selector accesible exacto que no incluía el emoji del enlace. Su base temporal se eliminó; no se cuenta como recorrido completo.
- Se mantienen sin aprobar las dos decisiones de §8 de `Plan-New-Frontend.md`. Este trabajo caracteriza el flujo legado con datos sintéticos; no implementa ni decide el CTA de entrada/idempotencia.
- Los resultados previamente revisados de suites (34 frontend y 241 backend), build y prueba de forwarding se conservan en el baseline de abajo; no se volvieron a ejecutar en esta corrección documental/de evidencia. El artefacto de prueba preexistente no se modificó.

## Estado inicial y límites

- Al iniciar la actividad, `git status` estaba limpio: sin cambios staged, unstaged ni untracked. El punto de partida coincide con el commit indicado arriba. Los archivos de A01 `design-map.md` y `acceptance-matrix.md` ya existían.
- La revisión independiente de A01 dejó pendientes la decisión funcional de CTA deshabilitado/contenido largo, la contención visual y parte de la reproducibilidad histórica. A02 no compara el código con Penpot, no declara A01 aprobado y no incorpora decisiones de la sección de decisiones del plan.
- No se modificaron páginas, hooks ni API de producción; tampoco se corrigieron los problemas observados del quiz o caché (trabajo de actividades posteriores). No se añadieron dependencias, configuración ni infraestructura A03.
- `frontend/node_modules` no existía al comenzar. Se restauró desde el lockfile con `npm ci`; `node_modules/` y `frontend/dist/` están ignorados por Git. El entorno `backend/.venv` ya existía.
- `backend/.env` existe localmente; su contenido no se leyó ni se incluye en evidencias. La captura HTTP se lanzó desde la raíz del repositorio, donde no había `.env`, con base SQLite, uploads, vector store, CORS y `ANTHROPIC_API_KEY` definidos explícitamente para la ejecución aislada. El endpoint de runtime confirmó `MOCK`.

## Versiones y configuración observadas

| Área | Versión/configuración |
|---|---|
| SO | Linux |
| Node.js / npm | `v24.19.0` / `12.0.2` |
| Python del backend | `3.14.7` en `backend/.venv` |
| FastAPI / Uvicorn | `0.141.1` / `0.52.4` |
| SQLAlchemy / Pydantic / pydantic-settings | `2.0.52` / `2.13.5` / `2.15.0` |
| pytest / httpx | `9.1.1` / `0.28.1` |
| React / React DOM | `18.3.1` / `18.3.1` |
| Vite / TypeScript / Tailwind CSS | `5.4.21` / `5.9.3` / `3.4.19` |
| TanStack Query / Axios / React Router | `5.101.2` / `1.18.1` / `6.30.4` |
| Vitest / Testing Library React | `2.1.9` / `16.3.3` |
| Recharts / React Markdown | `2.15.4` / `9.1.0` |
| Navegador de la captura | Chromium `151.0.7922.34`, Playwright `1.62.1` preinstalado fuera del repositorio; no se agregó al `package.json` |

Configuración fuente relevante: el cliente Axios usa `VITE_API_URL` o, si no está definido al compilar, `http://localhost:8001`; Vite usa normalmente el puerto `5173`. Las rutas del backend se montan en raíz (`/documents`, `/goals`, `/plans`, etc.). En la captura se sustituyeron esos puertos por `8011` y `5174`, con `CORS_ORIGINS=http://127.0.0.1:5174`; ambos estaban libres antes y volvieron a estar libres al terminar. Se usó SQLite temporal nueva, directorios temporales nuevos de uploads/vector store y `ANTHROPIC_API_KEY=""`; `/llm-settings/runtime` respondió `source="MOCK"`. No se llamaron proveedores externos.

## Suites: antes y después de añadir la prueba de contrato

Los resultados **pre** se obtuvieron antes de crear `src/__tests__/queries.test.tsx`; los resultados **post** se obtuvieron con esa prueba presente. `npm run lint` es el typecheck `tsc --noEmit`, no ESLint (ver `AGENTS.md`). Los comandos se ejecutaron desde el módulo correspondiente.

| Momento | Comando | Resultado/código |
|---|---|---|
| Pre | `npm run lint` (`frontend/`) | Exit 0; sin diagnósticos TypeScript |
| Pre | `npm test` (`frontend/`) | Exit 0; 2 archivos, 33 pruebas pasaron |
| Pre | `npm run build` (`frontend/`) | Exit 0; build Vite correcto, advertencia de chunk JS minificado mayor que 500 kB |
| Pre | `.venv/bin/python -m pytest -q` (`backend/`) | Exit 0; 241 pasaron, 1 advertencia deprecada de Starlette/AnyIO |
| Post | `npm run lint` (`frontend/`) | Exit 0; sin diagnósticos TypeScript |
| Post | `npm test` (`frontend/`) | Exit 0; 3 archivos, 34 pruebas pasaron |
| Post | `npm run build` (`frontend/`) | Exit 0; build correcto; persiste la advertencia de chunk JS mayor que 500 kB |
| Post | `PATH="$PWD/.venv/bin:$PATH" python -m pytest -q` (`backend/`) | Exit 0; 241 pasaron, 1 advertencia deprecada de Starlette/AnyIO |
| Post — enfocada | `npm test -- src/__tests__/queries.test.tsx` (`frontend/`) | Exit 0; 1 archivo, 1 prueba pasó |

Advertencia backend en ambas ejecuciones: `starlette/testclient.py` usa el alias deprecado `anyio.abc.BlockingPortal`; no hubo fallos. `npm ci` desde el lockfile produjo avisos de paquetes deprecados, informó 11 vulnerabilidades (6 moderadas, 4 altas, 1 crítica) y que el install script de `esbuild@0.21.5` quedó bloqueado por la política `allowScripts` de npm 12. El build también informó que algún chunk supera el límite de 500 kB. Son hallazgos del baseline; no se ejecutó `npm audit fix` ni se cambió ninguna dependencia.

### Contrato caracterizado

`frontend/src/__tests__/queries.test.tsx` renderiza `useGeneratePlan` con un `QueryClient` aislado y verifica una sola llamada en orden exacto `api.generatePlan(73, [91, 4, 208])`. La lista de IDs es congelada y se compara con su copia inicial: el caso detecta cambio de orden, sustitución/alteración de IDs y mutación in-place. La prueba pasó contra la implementación ya existente (`queries.ts` adapta `goalId`/`documentIds` directamente a `api.generatePlan(goalId, documentIds)`); por tratarse de caracterización, no se introdujo un fallo artificial ni se modificó producción.

## Captura funcional histórica (HTTP + navegador, sin identidad de corrida)

Se usó el helper ya disponible `.opencode/skills/webapp-testing/scripts/with_server.py` (se consultó primero `--help`) para arrancar Uvicorn y Vite y cerrarlos al final. La automatización esperó elementos/estados de la aplicación y observó la respuesta HTTP real; no usó `networkidle` como señal general ni confundió el `202` con un plan listo. No se usó `TestClient` para este recorrido. Las capturas son PNG locales, de página completa, con viewport CSS de escritorio `1440 × 1000` y móvil `390 × 844`.

Se subió el fixture sintético versionado [`a02-carbon-cycle-synthetic.md`](evidence/a02/a02-carbon-cycle-synthetic.md). Recorrido observado:

1. `/` redirigió a `/documents`; la navegación lateral de escritorio mostró Documentos, Metas, Plan, Dashboard y Configuración.
2. `POST /documents/upload` respondió `201` con estado `PENDING`; la UI llegó a `Indexado`.
3. En `/goals` se guardó una meta `LEARNING` sintética (`201`).
4. En `/plan` se seleccionaron esa meta y el documento indexado. `POST /plans/generate` respondió `202/PROCESSING`; el detalle llegó a `READY` con 3 sesiones reales.
5. Se abrió `/session/1`, se saltó el temporizador y el receso, se contestó un quiz de 10 preguntas y `POST /quizzes/1/submit` respondió `200` con `score=100`, `correct=5`, `total=5` (puntuación de opción múltiple).
6. El Dashboard recibió `200` y mostró 1 sesión completada y promedio de 100 %. Desde `/plan/1` la sesión figuró `Completada` y el enlace volvió a abrir `/session/1`.
7. En móvil de 390 px, la navegación está en el DOM pero no es visible; el ancho de documento fue 390 px, igual al viewport (sin overflow horizontal en esta captura). No se interpretó el acceso a una sesión completada como reanudación de temporizador/quiz: al abrirla vuelve a la fase Estudio, en línea con la limitación documentada en `fronted-design.md`.

La captura confirmó `/health` `200` y runtime `MOCK`. El reporte histórico [`flow-report.json`](evidence/a02/flow-report.json) conserva sus códigos/estados y hashes, pero **no** su `run_id`, hora exacta ni una secuencia request/response con cuerpos sanitizados e IDs correlacionables. Sus arrays vacíos de errores son declaraciones del informe anterior, no una transcripción de eventos auditable. Los PNG raíz se preservan como esa captura histórica, sin asociarles el run ID posterior:

| Evidencia | Qué permite comprobar |
|---|---|
| [`documents-desktop.png`](evidence/a02/documents-desktop.png) | Documento sintético indexado y navegación visible en escritorio |
| [`session-completed-desktop.png`](evidence/a02/session-completed-desktop.png) | Pantalla que la app enseña justo después de enviar el quiz |
| [`dashboard-desktop.png`](evidence/a02/dashboard-desktop.png) | Resultado actualizado del progreso en escritorio |
| [`dashboard-mobile.png`](evidence/a02/dashboard-mobile.png) | Dashboard completo a 390 px; navegación móvil oculta |
| [`completed-session-reopened-desktop.png`](evidence/a02/completed-session-reopened-desktop.png) | Sesión completada reabierta en fase Estudio; antes de navegar a esta captura se verificó el badge `Completada` y el enlace en `/plan/1` |
| [`completed-session-reopened-mobile.png`](evidence/a02/completed-session-reopened-mobile.png) | Sesión abierta de nuevo en móvil, fase Estudio |

## Repetición auditada de la corrección A02

La evidencia nueva está bajo [`runs/a02-correction-20260929-02/`](evidence/a02/runs/a02-correction-20260929-02/), `run_id=a02-correction-20260929-02`, inicio UTC `2026-09-29T19:13:26.655Z`, fin UTC `2026-09-29T19:13:29.367Z`, con salida de navegador/red y capturas de viewport (no full-page). Se arrancaron Uvicorn y Vite con el helper `with_server.py`; la base SQLite, uploads y vector store fueron directorios nuevos bajo `/tmp` y se eliminaron tras terminar. `ANTHROPIC_API_KEY` se pasó vacío, `/health` devolvió `200`, `/llm-settings/runtime` informó `MOCK`; no se usó proveedor externo ni datos de desarrollo.

Entradas exactas de esta repetición:

| Entrada | Valor |
|---|---|
| Fixture subido | `a02-carbon-cycle-synthetic.md` (335 bytes; SHA-256 `b2a7e334a06d936e274e539c233672e9bd7e716346630f3b5410d65f5077fc4d`) |
| Tipo de meta | `LEARNING` |
| Título | `A02 · Carbono sintético` |
| Descripción | `Aprender ciclo del carbono, fotosíntesis, respiración y reservorios del material sintético.` |
| Respuestas de flashcards | Preguntas 1–5: calidad SM-2 `5` en cada una |
| Respuestas de opción múltiple | Preguntas 6–10: opción índice `0` (índice base cero de `options` en el GET de quiz; coincide con la respuesta devuelta para ese run) |
| Cálculo observado | `5/5` MC correctas; `100 %` según `correct / total * 100`, redondeado a una decimal. Las cinco calidades de flashcard se enviaron y no forman parte del score. |

El último score es **resultado observado de este MOCK/fixture/run**, no una garantía: si cambia el contenido del quiz, cambia qué opción indexada corresponde a la respuesta y puede cambiar la puntuación. El JSON persiste IDs, tipos, calidades, índices y booleanos de coincidencia, no prompts, texto de respuestas ni cuerpos completos del quiz.

Correlación HTTP secuencial (secuencia exacta en `network_events` del JSON):

1. `POST /documents/upload` → `201`, `PENDING`, `document_id=1`; el listado y `GET /documents/1` confirmaron `INDEXED`.
2. `POST /goals` → `201`, `goal_id=1`, `goal_type=LEARNING`, título sintético arriba.
3. `POST /plans/generate` registró el body sanitizado exacto `{ "goal_id": 1, "document_ids": [1] }` → `202/PROCESSING`, `plan_id=1`. El `GET /plans/1` posterior devolvió `READY` y sesiones `[1, 2, 3]`.
4. Se abrió por enlace `/session/1`; `GET /sessions/1` devolvió `plan_id=1`, `PENDING`. `GET /quizzes/1` se pidió con **sessionId `1`** y respondió **quiz.id `1`, quiz.session_id `1`**. Son conceptos/campos distintos aunque en esta base nueva coincidieron numéricamente; el POST usa el ID de quiz, `/quizzes/1/submit`, no se presupone igualdad en el contrato.
5. `POST /quizzes/1/submit` → `200`, `correct=5`, `total=5`, `score=100`. El reporte conserva para cada question ID su tipo y respuesta resumida; el UI mostró “¡Sesión completada!”.
6. `GET /dashboard` → `200`, `sessions_completed=1`, `average_score=100` en este run.
7. En el detalle `/plan/1` quedaron visibles el badge `Completada` y el enlace `/session/1`. El `GET /sessions/1` posterior confirmó `status=COMPLETED` y `plan_id=1`; se hizo clic en el enlace, el navegador abrió `/session/1` y volvió a mostrar `Estudio`. **No** se afirma restauración de temporizador, receso ni quiz.

El archivo captura eventos reales con hooks de Playwright `page.on(request)`, `page.on(response)`, `page.on(requestfailed)`, `page.on(console)` y `page.on(pageerror)`. Cada evento de API lleva secuencia, `request_sequence` correlacionable, tiempo transcurrido, paso, método, path sin query/body arbitrario y estado HTTP; body/response se reduce a proyecciones permitidas. El origen de API/app, viewport, versión Chromium, `run_id`, inicio/fin, resultado y resumen quedan en el mismo reporte. En el run `...-02` se registraron 25 solicitudes y 25 respuestas, todas correlacionadas, cero fallos de red/HTTP, cero `pageerror` y cero `console.error`; el log conserva 20 eventos de consola: 8 debug, 4 info y 8 warnings de React Router sobre flags futuros. Los valores se pueden auditar en el JSON, no dependen de arrays vacíos declarados manualmente.

| Captura de `...-02` | Viewport CSS y propósito |
|---|---|
| [`documents-desktop.png`](evidence/a02/runs/a02-correction-20260929-02/documents-desktop.png) | 1440×1000; fixture indexado |
| [`session-completed-desktop.png`](evidence/a02/runs/a02-correction-20260929-02/session-completed-desktop.png) | 1440×1000; UI tras submit |
| [`dashboard-desktop.png`](evidence/a02/runs/a02-correction-20260929-02/dashboard-desktop.png) | 1440×1000; progreso posterior |
| [`dashboard-mobile.png`](evidence/a02/runs/a02-correction-20260929-02/dashboard-mobile.png) | 390×844 |
| [`plan-completed-desktop.png`](evidence/a02/runs/a02-correction-20260929-02/plan-completed-desktop.png) | 1440×1000; badge `Completada` visible en el detalle y fila/enlace de sesión |
| [`completed-session-reopened-desktop.png`](evidence/a02/runs/a02-correction-20260929-02/completed-session-reopened-desktop.png) | 1440×1000; captura posterior al clic, fase Estudio |
| [`completed-session-reopened-mobile.png`](evidence/a02/runs/a02-correction-20260929-02/completed-session-reopened-mobile.png) | 390×844; sesión reabierta, fase Estudio |

Los siete SHA-256 y tamaños físicos están junto a cada ruta/viewport en el mismo `flow-report.json`; el script comprueba que las dimensiones PNG son exactamente las del viewport antes de reportar la captura. El intento previo `a02-correction-20260929-01` se mantiene separado: runtime MOCK y documento indexado, pero terminó con timeout al buscar el enlace por nombre accesible exacto `Metas` (el nombre también incluye el emoji). No creó meta ni plan; se corrigió el selector a `a[href="/goals"]` y la repetición `...-02` es la que demuestra el recorrido entero.

## Problemas preexistentes caracterizados (no corregidos en A02)

1. **El resultado del quiz no se presenta.** `TestPhase.next()` recibe el resultado confirmado y ejecuta `setResult(res)` inmediatamente antes de `onDone()` (`frontend/src/pages/SessionPage.tsx`, aprox. líneas 199–205). `onDone` cambia la fase de la página padre a `done`, desmonta `TestPhase` y su rama `if (result)` (líneas 210–219) no llega a mostrarse. La captura muestra “¡Sesión completada!” sin score ni “Resultado del test”, aunque el POST devolvió `200` y `100 %`. Esto caracteriza el comportamiento observado; no se modificó.
2. **El estado de volteo de flashcards se conserva entre preguntas consecutivas.** En la captura la primera tarjeta comenzó sin revelar respuesta, pero las preguntas 2–5 ya mostraban la respuesta al aparecer. `FlashCard` mantiene `flipped` local y `TestPhase` cambia `index` sin reiniciar/remontar el componente (`SessionPage.tsx`, aprox. líneas 199–205 y 226–233, 260–274). La automatización tuvo que respetar ese estado real para continuar; no se corrigió.
3. **Invalidación de caché explícita parcial al enviar quiz.** `useSubmitQuiz` (`frontend/src/hooks/queries.ts`, aprox. líneas 159–168) invalida `['dashboard']` y `['plan']`, pero no `['plans']`, `['session', id]` ni `['quiz', id]`. El detalle singular `['plan', id]` sí coincide con el prefijo `['plan']`; el plural `['plans']` es otra clave. Durante la corrida el Dashboard se refrescó y, al volver, se consultaron de nuevo el detalle y la sesión. Como las queries están stale al montarse con la configuración por defecto, **no** se afirma que esta captura demuestre datos obsoletos visibles; se registra la omisión del invalidado explícito para que el trabajo posterior valore cobertura y efecto.
4. **No hay navegación visible en móvil en la línea base.** `AppShell` (`frontend/src/components/AppShell.tsx`, aprox. líneas 14–41) oculta el `<aside>` y su `<nav>` bajo `md`, sin alternativa móvil. La evidencia confirma que el DOM conserva el nav, pero no se puede ver a 390 px. No se cambió en A02.
5. **Una sesión completada es accesible, pero no restaura su fase local.** El detalle del plan conserva el enlace y badge `Completada`; al entrar otra vez la ruta abre Estudio desde el inicio. No se registra como defecto de persistencia porque `fronted-design.md` aclara que acceder a una sesión no promete restaurar temporizador o quiz.

## Tamaño de build de producción

Medición reproducida con `npm run build` desde `frontend/`, Node `24.19.0`, npm `12.0.2`, Vite `5.4.21`, configuración de producción Vite y sin `VITE_API_URL` configurada durante el build (la API mantiene su fallback `http://localhost:8001`). Vite informó tamaño minificado y estimación gzip; los bytes físicos se midieron sobre los archivos resultantes. No es un tamaño de transferencia medido en un servidor/CDN.

| Archivo de `frontend/dist/assets/` | Tamaño reportado por Vite | Estimación gzip de Vite | Tamaño físico medido |
|---|---:|---:|---:|
| `index-BIxX56hf.js` | 808.12 kB | 239.79 kB | 808,310 bytes |
| `index-B9eKL8sc.css` | 15.36 kB | 3.58 kB | 15,357 bytes |

El build previo a la prueba de caracterización mostró los mismos nombres y cifras. La advertencia de chunk >500 kB persiste. Los reportes/comprimidos de Vite son condiciones de laboratorio de build, no métricas de LCP/INP/CLS.

## Reproducción automatizada y manual

La automatización liviana está en [`evidence/a02/replay.mjs`](evidence/a02/replay.mjs). Usa Chromium + el módulo `playwright` que ya estaba instalado fuera del repo (en esta captura: Playwright `1.62.1`, Chromium `151.0.7922.34`); A02 no añade paquetes/lockfiles. En un checkout sin ese módulo/browser el replay requiere ese prerrequisito de entorno y no puede declararse autocontenido antes de A03.

Desde la raíz del repo, tras confirmar que `8011` y `5174` están libres (no reutilizar servidores dev), ejecutar una corrida con almacenamiento temporal nuevo:

```bash
set -e
RUN_DIR="$(mktemp -d /tmp/studyai-a02-XXXXXX)"
trap 'rm -rf -- "$RUN_DIR"' EXIT
RUN_ID="a02-$(date -u +%Y%m%dT%H%M%SZ)-$(python -c 'import uuid; print(uuid.uuid4().hex[:8])')"
python .opencode/skills/webapp-testing/scripts/with_server.py \
  --server "env DATABASE_URL=sqlite:///$RUN_DIR/studyai.sqlite3 UPLOAD_DIR=$RUN_DIR/uploads CHROMA_PERSIST_DIR=$RUN_DIR/chroma ANTHROPIC_API_KEY= CORS_ORIGINS=http://127.0.0.1:5174 backend/.venv/bin/python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8011" \
  --port 8011 \
  --server "env VITE_API_URL=http://127.0.0.1:8011 npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174 --strictPort" \
  --port 5174 -- \
  env A02_RUN_ID="$RUN_ID" \
    A02_OUTPUT_DIR="docs/frontend-integration/evidence/a02/runs/$RUN_ID" \
    A02_API_BASE=http://127.0.0.1:8011 \
    A02_APP_BASE=http://127.0.0.1:5174 \
    node docs/frontend-integration/evidence/a02/replay.mjs
```

`with_server.py` inicia ambos servicios, verifica disponibilidad y los apaga en éxito/error; `trap` elimina solo el `RUN_DIR` efímero. El script sube el fixture, crea la meta exacta indicada arriba, escoge su ID y el ID del documento indexado, genera/espera el plan, recorre la primera sesión, contesta cada pregunta y guarda JSON/PNG en un directorio nuevo `runs/$RUN_ID/`. Selectores de interacción: `input[type=file]`, los placeholders de título/descripción incluidos en el script, `a[href="/goals"]`, `a[href="/plan"]`, `select` de meta, checkbox con el nombre del fixture, botones `Generar plan`, `Saltar al receso →`, `Ir al test →`, ratings `5`, botones de opción del quiz y `Finalizar`; después usa `Ver Dashboard` y hace clic en `a[href="/session/<sessionId>"]` desde el detalle con badge `Completada`.

Verificar una corrida:

```bash
python -m json.tool "docs/frontend-integration/evidence/a02/runs/$RUN_ID/flow-report.json" >/dev/null
sha256sum "docs/frontend-integration/evidence/a02/runs/$RUN_ID/"*.png
```

Comparar los hashes/sizes con `screenshots[]`; el script también valida dimensiones `1440×1000`/`390×844`. Inspeccionar `outcome.status`, `audit_summary`, `failed_http_responses`, `failed_requests`, `page_errors` y `console_events`; un `202` solo acredita `PROCESSING`, no `READY`. En reproducción manual con UI se usan los mismos valores, se elige la opción en el índice que indica la traza para cada GET de quiz, y se registra el score observado sin asumir que será 100 %.

## Salida A02 para revisión

La línea base, comandos, configuración, medidas, recorrido, trazas nuevas y lista explícita de problemas previos quedan registrados; las capturas y fixture están bajo `docs/frontend-integration/evidence/a02/`. Los artefactos de evidencia están **sin stagear** para que Dev-Reviewer pueda examinarlos. Las decisiones de diseño/paridad siguen fuera de alcance y la actividad no se marca aceptada en `Plan-New-Frontend.md`.
