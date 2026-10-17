# QA aislado de frontend y API

Esta guía documenta el entorno aislado A03 y el smoke HTTP A04. Playwright Test
y Bruno CLI están fijados en `frontend/package-lock.json`; no dependen de los paquetes de
`/home`, de servidores de desarrollo ya iniciados ni de `backend/.env`.

## Requisitos e instalación desde un checkout limpio

- Node.js 22 o posterior y npm. El lockfile contiene dependencias transitivas con
  `engines.node >=22`; Node 20 no es compatible con el conjunto fijado. Esta receta
  se verificó con Node `24.19.0`.
- Python 3.11 o posterior.
- Chromium compatible con la versión fijada de Playwright.

Ejecuta todos los comandos desde la raíz del checkout; no cambies el directorio
actual entre los bloques. Instala el cliente y Chromium una vez:

```bash
npm --prefix frontend ci
npm --prefix frontend exec -- playwright install chromium
```

En Linux, si Chromium informa bibliotecas del sistema ausentes, instala los
prerrequisitos para la distribución usada (por ejemplo,
`npm --prefix frontend exec -- playwright install-deps chromium`, con permisos
de administrador cuando sean necesarios).
El browser no está incluido en npm: el comando descarga la revisión esperada si
no existe ya en la caché local de Playwright.

El servidor QA usa un entorno Python dedicado, separado del `.venv` de desarrollo.
Instala únicamente el backend core; **no** instales `requirements-rag.txt` ni
paquetes de modelos en esta venv:

```bash
python3 -m venv backend/.venv-qa
backend/.venv-qa/bin/python -m pip install -r backend/requirements.txt
```

En Windows PowerShell, desde la misma raíz:

```powershell
python -m venv backend/.venv-qa
& backend/.venv-qa/Scripts/python.exe -m pip install -r backend/requirements.txt
```

En Windows, el intérprete equivalente es `backend/.venv-qa/Scripts/python.exe`.
El runner exige este entorno y falla antes de iniciar servicios si falta; no
instala paquetes ni descarga modelos automáticamente.

## Comandos (desde la raíz del checkout)

```bash
npm --prefix frontend run test:qa:types   # TypeScript de config, helpers y E2E
npm --prefix frontend run test:qa:runner  # runner: puertos, aislamiento, reportes y cleanup
npm --prefix frontend run test:api        # API aislada: readiness Playwright + flujo HTTP A04 de Bruno
npm --prefix frontend run test:e2e        # build de producción + smoke de UI
npm --prefix frontend run test:qa         # API/Bruno + UI en una única ejecución y base aislada
```

`test:api` ejecuta primero los checks Playwright A03 (`GET /health` y runtime
`MOCK`) y luego la colección HTTP A04 contra **el mismo backend, base SQLite y
almacenamiento temporal de esa corrida**. `test:qa` ejecuta lo mismo y añade el
smoke Playwright de la interfaz de producción; no sustituye las suites de UI
posteriores A15–A17.

La colección A04 está versionada bajo `frontend/bruno/`: `bruno.json`, el
entorno `environments/qa.bru` sin secretos y 21 requests ordenadas dentro de
`smoke/`. Cada request tiene una aserción nativa `assert {}` para estado HTTP y
validación de contenido, además de tests cuando hace falta comprobar relaciones
o datos dinámicos. El flujo sube el fixture compartido
`frontend/qa/fixtures/studyai-a04-smoke.md`, crea y encadena IDs de ejecución,
espera `INDEXED`/`READY` mediante polling GET acotado, examina cada sesión del
plan, obtiene el quiz usando `sessionId`, envía respuestas una sola vez usando
el `quizId` devuelto, comprueba sesión/dashboard y borra plan, meta y documento
con consultas posteriores de ausencia. La primera flashcard usa calidad `0` y
las demás `5`; las respuestas MC usan una opción incluida en el DTO.

El fixture Markdown es la única fuente de datos sintéticos: Bruno lo lee con la
ruta relativa `../qa/fixtures/studyai-a04-smoke.md`. El test
`frontend/e2e/api/a04-shared-fixture.spec.ts` consume el mismo archivo mediante
`fileURLToPath(new URL("../../qa/fixtures/studyai-a04-smoke.md", import.meta.url))`.
Ese test solo lee el archivo: no escribe en la base, así que no altera la
comprobación A03 de una base recién creada y vacía. No se debe copiar el
contenido a otro fixture.

El entorno de Bruno permite configurar `pollIntervalMs`,
`documentPollMaxAttempts`, `documentPollTimeoutMs`, `planPollMaxAttempts`,
`planPollTimeoutMs` y `requestTimeoutMs`; ambos polls terminan con error y
detienen la colección si reciben `FAILED` o agotan sus intentos/tiempo total.
Los GET iniciales de los dos polls también aplican `requestTimeoutMs`; los GET
internos usan el menor entre ese límite y el tiempo restante del deadline. El
CLI queda fijado en `4.2.0`; en esta versión el modo del request multipart se
declara `body: multipartForm`, mientras los campos usan
`body:multipart-form { ... }`.

El runner permite ajustar esos parámetros sin editar la colección mediante
`STUDYAI_BRUNO_DELAY_MS`, `STUDYAI_BRUNO_POLL_INTERVAL_MS`,
`STUDYAI_BRUNO_DOCUMENT_POLL_MAX_ATTEMPTS`,
`STUDYAI_BRUNO_DOCUMENT_POLL_TIMEOUT_MS`,
`STUDYAI_BRUNO_PLAN_POLL_MAX_ATTEMPTS`, `STUDYAI_BRUNO_PLAN_POLL_TIMEOUT_MS`
y `STUDYAI_BRUNO_REQUEST_TIMEOUT_MS`. Los límites cortos se usan en las pruebas
controladas; para `test:api`/`test:qa` contra FastAPI conserva los valores de
`environments/qa.bru` para no convertir latencia normal de indexación en un
falso fallo.

El runner ejecuta `bru run smoke -r --env qa` desde `frontend/bruno/`, pasa
`baseUrl` al backend QA y solicita JSON, HTML y JUnit con cabeceras/cuerpos
omitidos. Ejecuta en sandbox `safe`, con `--bail` para parar en el primer fallo
y `--noproxy` para no enviar el tráfico local a un proxy configurado. La salida
`0` del CLI no basta: el gate posterior comprueba el JSON real de Bruno 4.2.0,
pide al menos una request y una aserción ejecutadas, y rechaza fallos, saltos,
paths omitidos/inesperados, reportes ausentes/malformados o conteos
inconsistentes. Compara los `.bru` esperados con `results[].path` (Bruno quita
la extensión) y valida `summary` y resultados de aserciones/tests. Si readiness
falla, el runner conserva el error y aun inspecciona la ejecución; no convierte
una colección inválida ni sin aserciones en un “no aplica” exitoso.

`npm run test:qa:runner` incluye pruebas de contrato A03 y
`frontend/scripts/bruno-smoke.test.mjs`. Este último ejecuta Bruno CLI **4.2.0
real** con los `.bru` versionados de `frontend/bruno/smoke/` contra un servidor
HTTP local controlado, no contra FastAPI: cubre varias respuestas
`PENDING`/`PROCESSING` que resuelven, `FAILED` inmediato, timeout por intentos y
deadline, timeout del GET inicial, el cese de requests posteriores y el conteo
de POST únicos. El runner A03 inspecciona el mismo reporte y rechaza cualquier
fallo u omisión. Los parámetros de estas pruebas se acortan mediante las
variables QA documentadas arriba; la colección real no se copia ni se modifica.
Estos negativos controlados no sustituyen `npm run test:api`, que conserva el
smoke HTTP positivo contra el FastAPI aislado real. La cobertura API combina
readiness Playwright A03, consumo de fixture solo-lectura Playwright y el flujo
Bruno A04; no se presenta como la suite de UI de A15–A17.

El runner Node se ejecuta secuencialmente (`node --test --test-concurrency=1`)
para que procesos Bruno/Playwright de archivos distintos no compitan por CPU.
Los casos de colección HTTP controlada en `bruno-smoke.test.mjs` tienen un límite
de seguridad de 30 segundos por prueba; no usan un umbral fijo de tiempo
transcurrido como prueba de que el polling fue
acotado. Esa propiedad se comprueba por separado con los límites configurados,
el número exacto de GET permitidos, la ausencia de escrituras posteriores y el
reporte/salida que conserva la compuerta fail-closed. Este timeout pertenece al
test Node; los intervalos, deadlines, máximos de intentos y comportamiento
`FAILED` de la colección A04 no se relajan.

## Aislamiento y secuencia

- Cada invocación obtiene un `runId` único y un directorio `mkdtemp` propio para
  SQLite, uploads, vector store y build frontend. El directorio temporal se
  borra en éxito, fallo, `SIGINT` o `SIGTERM`; los reportes quedan aparte.
- Los puertos predeterminados son backend `127.0.0.1:8002` y frontend
  `127.0.0.1:4173`. Se pueden cambiar con
  `STUDYAI_QA_BACKEND_PORT` y `STUDYAI_QA_FRONTEND_PORT` (enteros 1024–65535 y
  distintos). Antes de crear datos o arrancar servicios se comprueban todos los
  puertos requeridos. Si uno está ocupado, la corrida termina con código distinto
  de cero; no conecta ni reutiliza el proceso que ya los ocupa. Uvicorn/Vite
  también se lanzan sin reload y con binding/puerto estricto para cerrar la
  carrera entre comprobación y arranque.
- El backend se ejecuta desde `backend/`, por lo que puede cargar su `.env` local;
  el runner **no lee ni copia sus valores**. El entorno del proceso tiene
  prioridad sobre dotenv y fuerza `ANTHROPIC_API_KEY=""`, paths de storage QA,
  `CORS_ORIGINS=http://127.0.0.1:4173` y una `SECRET_KEY` efímera. SQLite parte
  vacío, sin filas `LLMCredential` activas; el runner exige que runtime informe
  `MOCK` antes de probar. Las credenciales heredadas se filtran del entorno de
  los subprocesses y no se guardan en reportes.
- Se fija `OLLAMA_BASE_URL` a un puerto local no servido y los flags offline de
  Hugging Face/Transformers. La venv dedicada se instala solo desde
  `backend/requirements.txt`; el runner también rechaza PyMuPDF, Sentence
  Transformers, ChromaDB y LangChain text splitters en esa venv.
- El build se ejecuta después de fijar `VITE_API_URL=http://127.0.0.1:8002` en
  el entorno del proceso. Vite escribe en el directorio temporal y `vite
  preview` sirve ese build de producción en `4173`; no se sobrescribe el `dist/`
  de desarrollo ni se inicia `vite dev`.
- Antes de tests, el runner espera `/health` (`200`, `status="ok"`), comprueba el
  runtime MOCK y, en suites con UI, espera que `/` del preview responda `200`.
  El E2E verifica con Playwright el heading y título de Inicio, navega mediante
  «Explorar documentos» y espera el `GET /documents` real con respuesta `200`/`[]`
  junto con el estado vacío «Aún no has subido documentos.». Esto demuestra
  conexión desde la UI, CORS y DB nueva; no afirma que Documentos tenga ese
  heading en el smoke de app-load. Las esperas usan respuestas HTTP y locators
  web-first; no dependen de `networkidle`.
- Playwright selecciona los proyectos `api` y `e2e` por directorios, no por
  etiquetas del título; los specs nuevos dentro de esas rutas se incluyen sin
  necesitar tags. `workers: 1`, `retries: 0`, `forbidOnly: true` y suites
  secuenciales por el usuario demo compartido. Un proyecto sin pruebas, fallidas
  u omitidas falla. `npm test` de Vitest queda limitado a
  `src/**/*.{test,spec}.{js,ts,jsx,tsx}`.
- Los procesos se inician en grupos separados. El runner termina los grupos y
  sus descendientes, comprueba que no queden procesos y solo entonces borra el
  directorio temporal. Un fallo de setup, una suite no ejecutada, un código de
  salida distinto de cero o cleanup incompleto hace fallar el comando.

## Reportes y alcance del smoke

Cada ejecución conserva artefactos bajo:

```text
frontend/qa-results/<runId>/
├── run-report.json
├── api/playwright-report/
├── api/test-results/
├── e2e/playwright-report/
└── e2e/test-results/
```

Si se ejecutó una colección, `bruno-report.json`, `bruno-report.html` y
`bruno-report.xml` también quedan en la raíz de ese directorio.

Los subdirectorios API/E2E solo existen si corrió esa suite. Bruno añade sus
reportes al directorio de la corrida cuando existe una colección ejecutable.
`run-report.json` (schema 3) incluye el commit, ref y estado limpio/sucio
verificados de Git, versiones de Node/npm/Python/Playwright/Bruno, URLs/puertos
QA, URL de API embebida al compilar, conteos `passed`/`failed`/`skipped` por
suite y total de checks, estado/código de salida/señal de Bruno y métricas de
requests separadas (`expected`, `total`, `executed`, `passed`, `failed`,
`skipped`, `omitted`, `unexpected`), comando solicitado/código de salida general,
resultado, readiness, fuente MOCK y confirmación de cleanup. El total agrega
casos Playwright y aserciones/tests ejecutados por Bruno; las requests Bruno se
agregan en su bloque separado para no contarlas dos veces como checks.
El JSON detallado de Playwright se procesa dentro del directorio temporal y se
elimina al terminar; el reporte conservado contiene solo los conteos, no cuerpos
de respuesta. No serializa variables de entorno, `.env`, claves ni material de
usuarios. Los reportes están ignorados por Git y se conservan para revisión
manual. Los datos, DB y build temporales no se conservan.

Cuando corre Bruno, también se conservan sus reportes JSON, HTML y JUnit. Las
opciones `--reporter-skip-all-headers` y `--reporter-skip-body` excluyen las
cabeceras y cuerpos de requests/responses; `run-report.json` no copia esos
artefactos y solo persiste conteos, estado/código y métricas derivadas de comparar
los paths esperados con los observados.

La suite Playwright API comprueba readiness y runtime demo; la suite Bruno A04
cubre el flujo HTTP real de documento/meta/plan/sesiones/quiz/dashboard/limpieza.
Los E2E actuales incluyen el foco legacy A05, navegación A06 a 320 px con datos
sintéticos y un smoke sin interceptores que comprueba `GET /documents` `200`/`[]`
desde el preview de producción. No sustituyen los recorridos UI A15–A17. Las
decisiones de la sección 8 del plan continúan pendientes y no se resuelven en
estas actividades.
