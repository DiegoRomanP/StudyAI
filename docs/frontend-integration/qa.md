# QA aislado de frontend y API

Esta guía documenta el entorno A03. Las pruebas de Playwright y Bruno están
versionadas en `frontend/package-lock.json`; no dependen de los paquetes de
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
npm --prefix frontend run test:api        # API aislada; Bruno se añade cuando A04 cree su colección
npm --prefix frontend run test:e2e        # build de producción + smoke de UI
npm --prefix frontend run test:qa         # API + UI en una única ejecución y base aislada
```

`test:qa` es el smoke de infraestructura A03, **no** la cobertura funcional de
A04. En este checkout todavía no existe `frontend/bruno/`, por lo que
`test:api` comprueba explícitamente solo `GET /health` y
`GET /llm-settings/runtime` (`source="MOCK"`). El reporte deja Bruno como
`not-run`, con conteos cero, e informa
`apiCoverage=provisional-health-runtime-only-a04-pending`; no presenta esto como
flujo de documentos/meta/plan/quiz ni afirma que Bruno se haya ejecutado.

Cuando A04 agregue el manifiesto `frontend/bruno/bruno.json` (o
`opencollection.yml`), el entorno `frontend/bruno/environments/qa.bru` y requests
`.bru` dentro de `frontend/bruno/smoke/`, el runner ejecutará `bru run smoke -r
--env qa` desde `frontend/bruno/`, pasará `baseUrl` al API QA y pedirá a Bruno
`--reporter-json`. Una colección con un request HTTP ejecutable puede llegar al
CLI aunque no tenga aserciones: esto es intencional para que el gate obligatorio
posterior a la ejecución evalúe el reporte real, no solo una inspección textual
de los archivos. La salida `0` del CLI no basta. El runner exige un JSON legible
y válido en el formato 4.2.0 (array de iteraciones con `summary` y `results`), al
menos una request ejecutada, al menos una aserción ejecutada, cero fallos,
requests saltadas y paths esperados omitidos. Compara además los paths `.bru`
descubiertos bajo `smoke/` con `results[].path` del reporte; Bruno quita la
extensión `.bru` en ese campo. El parser verifica los campos de Bruno 4.2.0:
`summary.totalRequests`, `passedRequests`, `failedRequests`, `errorRequests`,
`skippedRequests`, `totalAssertions`, `passedAssertions` y `failedAssertions`,
además de tests de scripts; contrasta con `results[].assertionResults[]`,
`results[].skipped`/`status` y `results[].path`. La ausencia, el JSON malformado,
conteos inconsistentes o la falta de aserciones fallan la corrida sin fallback
silencioso.
Si una carpeta Bruno está presente pero falla el gate de readiness, el runner
conserva ese error y aun intenta el CLI; después exige y valida el reporte, sin
convertir la falla inicial en un “no aplica” exitoso.

La prueba local de contrato está aislada bajo `frontend/scripts/`: usa Bruno CLI
4.2.0 real contra un HTTP local sintético, verifica `res.status: eq 200`, prueba
que una colección sin aserciones puede salir con código `0` y comprueba que el
runner la rechaza usando el reporte. Los casos del parser también cubren fallos,
requests omitidas/saltadas y reportes ausentes o malformados. Estos fixtures de
test no constituyen una colección versionada A04 ni se invocan como parte del
`test:api` provisional.

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
  El E2E verifica con Playwright el rol `heading` «Documentos» y un `GET
  /documents` real con respuesta `200`/`[]`, demostrando conexión desde la UI,
  CORS y DB nueva. Las esperas usan respuestas HTTP y locators web-first; no
  dependen de `networkidle`.
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

El smoke A03 solo demuestra backend sano, runtime demo y carga real de la página
actual. No sube documentos, crea metas/planes, ejecuta quizzes, ni sustituye la
colección/flujo A04 o los recorridos posteriores A15–A17. Las decisiones de la
sección 8 del plan continúan pendientes y no se resuelven en esta actividad.
