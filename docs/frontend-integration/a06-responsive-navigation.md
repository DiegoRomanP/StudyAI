# A06 — Navegación responsive y rutas

> Estado: aprobación técnica de Dev-Reviewer tras dos ciclos de corrección y una tercera revisión independiente. QA registrado: 75 pruebas Vitest; `test:qa:runner`, 33/33 en dos ejecuciones; `test:qa`, 78/78 checks (API 3 + E2E 3 + Bruno 72), runtime `MOCK` y E2E a 320 px con retrasos controlados de 500 ms en GETs del backend. Los cambios están en el diff local sobre HEAD `c703f8f`; aún no existe commit A06. Esta aprobación técnica no resuelve decisiones de producto ni declara aprobación visual o paridad con Penpot.

## Alcance entregado

- `/` ahora presenta una página de inicio mínima: explica StudyAI y ofrece enlaces a las secciones existentes. No incorpora el flujo de preparación ni un CTA funcional «Estudiar» de A10.
- La navegación de escritorio y el menú móvil incluyen Inicio, Documentos, Metas, Plan, Dashboard y Configuración. La marca StudyAI enlaza a `/`.
- El menú móvil es una divulgación **no modal en el flujo**: usa un botón nativo con nombre «Menú», `aria-expanded` y `aria-controls`; el panel no cubre ni deshabilita el contenido. No usa `aria-modal`, fondo bloqueante, `inert` ni trampa de foco. Escape lo cierra y devuelve el foco al botón; al navegar, se cierra y el foco pasa a `main`; elegir la ruta actual cierra el panel y devuelve el foco al botón.
- El enlace «Saltar al contenido» llega a `main#main-content[tabindex="-1"]`. Los enlaces de navegación exponen `aria-current="page"` solo para rutas exactas; Plan está activo en `/plan` y `/plan/:planId`, no en Inicio ni en rutas anidadas desconocidas.
- Se conservan `/documents`, `/goals`, `/plan`, `/plan/:planId`, `/session/:sessionId`, `/dashboard` y `/settings`. Las rutas desconocidas muestran una página 404 con vuelta a Inicio.
- Los IDs de plan/sesión admiten segmentos de dígitos decimales que resuelvan a enteros positivos seguros (`Number.isSafeInteger`). Cero, signo, fracción, texto, `NaN`, `Infinity`, notación científica y overflow se rechazan antes de ejecutar la consulta TanStack Query; el enlace inválido muestra un mensaje y un destino de vuelta. Un fallo inicial de carga de un ID válido muestra error/reintento y salida; un error de refetch conserva los datos cargados y añade error/reintento.
- `AppShell` asigna `document.title` por ruta y mueve el foco a `main` después de cada cambio interno de `pathname`; no roba el foco inicial al cargar la página.
- La tarjeta de controles de estudio en `SessionPage` se apila y permite wrap bajo `sm`, porque la prueba de enlace profundo encontró el botón «Saltar al receso» saliendo del viewport de 320 px (x + ancho = 346.56 px). El cambio mantiene la fase y la lógica del temporizador intactas.
- El E2E con listas sintéticas reveló controles legacy fuera del viewport aunque `main.overflow-x-hidden` dejaba el ancho global en 320 px: acciones de una fila de meta (x=300.44–381.8), una fila de plan (x=274.95–356.31) y la grilla del selector de documentos (405 px de ancho). Las filas ahora apilan/permiten wrap en tamaño estrecho; el selector usa una sola columna `minmax(0,1fr)` y `min-w-0` en el texto. No se cambió API, selección, operaciones ni estado de estudio.

## Decisiones pendientes de producto y diseño

- **PEN-03 — navegación Home móvil:** A01 documenta cinco destinos persistentes en la barra Penpot y Home en marca/overlay; A06 del plan pide añadir Inicio, pero nadie ha confirmado un sexto tab. Esta implementación ofrece los seis destinos en el menú de divulgación y no crea una barra inferior persistente. Esa elección permite completar la navegación funcional sin cerrar la ubicación final de Home.
- Las dos decisiones de producto de la sección 8 del plan siguen sin respuesta: destino al llegar a `READY` e idempotencia estricta ante concurrencia/respuesta perdida. A06 no implementa generación ni decide esos comportamientos.
- No hubo una sesión autenticada de Penpot para este trabajo. No se inspeccionó ni modificó el canvas; no se afirma paridad, aprobación visual ni resolución de `PEN-01`, `PEN-02` o `PEN-03`. La revisión visual/responsive más amplia de A17 sigue pendiente.
- La introducción de Inicio es intencionalmente temporal y mínima; la experiencia completa de Home corresponde a A10. No se implementaron flujo de estudio, almacenamiento ni onboarding.

## Pruebas y evidencias

### Pruebas de comportamiento

- `frontend/src/__tests__/AppShell.test.tsx`: skip link y `main`; Home y aria-current en rutas Home/detalle; ruta anidada desconocida con título 404 y sin Plan activo; 6 enlaces; `aria-expanded`; cierre por toggle/Escape; restauración de foco; contenido de fondo interactivo mientras el panel está abierto.
- `frontend/src/__tests__/AppRoutes.test.tsx`: Home y 404; inválidos decimales/no decimales para ambas rutas sin llamada a `getPlan`/`getSession`; entero máximo seguro y ceros iniciales; carga de enlaces directos válidos; actualización de título y foco tras navegar; conservar datos del plan/sesión cuando falla un refetch.
- La primera ejecución TDD, antes de producción, fue `npm test -- src/__tests__/AppShell.test.tsx src/__tests__/AppRoutes.test.tsx`: código 1, 24 fallidos / 2 aprobados. Falló por la ausencia esperada de Home, 404, skip/menu, validación de IDs, título y foco. Después de la implementación, las dos suites específicas pasan.
- `frontend/e2e/smoke/a06-navigation.spec.ts` comprueba a 320 × 560 px la tabulación por las seis opciones del menú, bounds del panel/acciones/controles, orden de foco en Home y en cada sección con acciones, reflow sin overflow de contenido, scroll vertical por teclado, acceso directo al plan de ocho sesiones y a la sesión con material largo, botón Back/Forward, fase receso y quiz, IDs inválidos sin GET (`NaN`, decimal), 404 de ruta/título/aria-current y recurso 404 con reintento explícito. Dashboard es de solo lectura: antes de medir se esperan sus valores fixture `Recursos florales urbanos` y `80%`.
- El E2E introduce una demora controlada de 500 ms únicamente al responder GETs del origen API QA; el handler no intercepta ni retrasa la SPA. Antes de medir espera el nombre de documento y su acción Eliminar; el título de meta con Editar/Eliminar; el plan fixture con enlace `/plan/27`, acción Eliminar y el checkbox del documento indexado; y el placeholder exacto de proveedor junto con Guardar clave. `assertMobileLayout` exige los controles esperados en la captura medida y en el conjunto de controles habilitados por teclado, valida sus bounds dentro de 320 px y registra el resultado adjunto `a06-mobile-readiness.json`. La sincronización es con locators web-first, no `networkidle` ni esperas fijas de prueba.
- Los interceptores de A06 se limitan al origen backend QA y sirven datos sintéticos representativos; no interceptan documentos HTML de la SPA. Las capturas se guardan bajo el directorio de resultado E2E de esa corrida, no sobreescriben A02/A05.
- `frontend/e2e/smoke/app-load.spec.ts` conserva Home/title y navega a Documentos. Sin interceptores, espera desde el preview de producción el GET real `VITE_API_URL/documents`, `200`, JSON `[]` y el estado vacío. Una respuesta leída desde el browser comprueba la URL de build y el CORS backend/frontend.
- Durante el primer pase geométrico, antes de los fixes de layout, las pruebas de 320 px fallaron con bounds de Meta/Plan fuera del viewport y el selector de documentos a 405 px; las regresiones se conservaron junto con las correcciones responsive.
- Una prueba unitaria adicional falló antes de corregir el cierre al seleccionar la ruta actual: el foco permanecía en el enlace que se ocultaba. El cierre ahora devuelve el foco al botón también en ese caso.
- Las pruebas con datos cacheados demostraron que el manejo de error inicial podía ocultar resultados si fallaba un refetch. Las páginas ahora mantienen contenido disponible y muestran un aviso de actualización fallida con acciones.

### Evidencia conservada localmente (ignorada por Git)

`npm run test:e2e` en entorno A03 aislado terminó con salida 0 y 3/3 E2E aprobados: foco A05, navegación A06 y Home→Documentos con GET real vacío. Reporte `frontend/qa-results/2026-09-30T05-48-02-736Z-3e6ab50d/run-report.json`: runtime `MOCK`, preview de producción compilado con `VITE_API_URL=http://127.0.0.1:8002`, readiness `/health` `200`, E2E `3 passed / 0 failed / 0 skipped`, procesos y datos temporales limpiados. En la misma revisión final, `npm run test:qa` terminó con salida 0: 78/78 checks (Playwright API 3/3, E2E 3/3, Bruno 21/21 requests, 51/51 aserciones y 21/21 tests), runtime `MOCK` y cleanup confirmado; reporte `frontend/qa-results/2026-09-30T05-48-42-125Z-16bc4287/run-report.json`.

- Capturas a 320 px de la corrida integrada `test:qa` en `frontend/qa-results/2026-09-30T05-48-42-125Z-16bc4287/e2e/test-results/smoke-a06-navigation-respo-80135--and-recovery-work-at-320px-e2e/`:
  - `a06-mobile-menu-320.png`
  - `a06-plan-direct-link-320.png`
  - `a06-session-direct-link-320.png`

El GET de Documentos fue una petición real desde el navegador al backend aislado, no un interceptor: respuesta HTTP `200`, JSON `[]` y copy «Aún no has subido documentos.» visible. Esto valida que el build usó `VITE_API_URL` y que el origen preview `4173` pudo leer la respuesta CORS de backend `8002`. Las capturas muestran navegación/carga profunda; no son comparaciones aprobadas con tableros Penpot.

En el segundo ciclo de revisión, se comprobó la regresión **en rojo antes de añadir las esperas**: con GETs del backend QA retrasados 500 ms, `npm run test:e2e` terminó con código 1 (2 pasaron, A06 falló) al medir Documentos sin el control fixture `Eliminar`; el heading ya estaba visible. Reporte: `frontend/qa-results/2026-09-30T06-23-52-843Z-63c06cc0/run-report.json`. Tras sincronizar cada medición con su fixture, `npm run test:e2e` pasó 3/3; reporte final independiente: `frontend/qa-results/2026-09-30T06-47-48-909Z-28e4c1d6/run-report.json`.

La evidencia adjunta de la corrida integrada está en `frontend/qa-results/2026-09-30T06-48-34-072Z-16e58476/e2e/test-results/smoke-a06-navigation-respo-80135--and-recovery-work-at-320px-e2e/a06-mobile-readiness.json`: registra delay controlado de 500 ms para cada uno de 17 GETs backend observados y readiness antes de medir. Se esperaron y documentaron: fila del documento `Apuntes de ecología urbana y redes de polinizadores.md` + `Eliminar`; meta `Comprender cómo se conectan los hábitats urbanos` + `Editar`/`Eliminar`; plan `Plan de navegación A06`, enlace `/plan/27`, checkbox del documento indexado + `Eliminar`; dashboard con `Recursos florales urbanos`/`80%`; input `sk-openai-test` + `Guardar clave`; octava sesión enlazada a `/session/61`; material de sesión + `Saltar al receso`; receso + `Ir al test`; y la opción fixture del quiz. El adjunto contiene los controles efectivamente medidos y sus bounds (todos los destinos a 320 px).

La corrida final `npm run test:qa` terminó con código 0 y 78/78 checks: Playwright API 3/3, E2E 3/3 y Bruno 72 checks (21/21 requests y 51/51 aserciones; 21/21 tests), runtime `MOCK` y cleanup confirmado. Reporte: `frontend/qa-results/2026-09-30T06-48-34-072Z-16e58476/run-report.json`. Esta evidencia de QA acompaña la aprobación técnica de Dev-Reviewer; no constituye aprobación visual ni paridad con Penpot.

`npm run test:qa:runner` se ejecutó dos veces y sin paralelismo; ambas salidas fueron `33 passed / 0 failed / 0 cancelled / 0 skipped` (duración ~64 s por corrida). La suite invoca Node con `--test-concurrency=1`, da 30 s por prueba controlada de Bruno y valida la cota funcional por límites/contadores GET, ausencia de POST posteriores, reporte y gate fail-closed, no por un límite global frágil de 5 s. No se cambiaron deadlines ni comportamiento `FAILED` de A04. La corrección del runner es mantenimiento de pruebas A03/A04, no evidencia visual A06.

No se ejecutó una auditoría automatizada Lighthouse/axe ni una revisión manual con lector de pantalla; las pruebas verifican semántica DOM, estados ARIA, teclado, foco, geometría/scroll en 320 px y retry, no una certificación WCAG. La validación responsive completa, contenido de todos los estados y paridad siguen pendientes de A17/Penpot.

## Archivos

- `frontend/src/App.tsx`, `components/AppShell.tsx`, `pages/HomePage.tsx`, `pages/NotFoundPage.tsx` — rutas, shell responsive, Home mínima y 404.
- `frontend/src/lib/routeIds.ts`, `pages/PlanDetailPage.tsx`, `pages/SessionPage.tsx` — validación previa a consulta y estados útiles para IDs inválidos/no disponibles; contención móvil del temporizador/acciones.
- `frontend/src/pages/GoalsPage.tsx`, `frontend/src/pages/PlanPage.tsx` — apilado/wrap de acciones y contención del selector para que los controles/textos largos sigan dentro de 320 px.
- `frontend/src/__tests__/AppShell.test.tsx`, `src/__tests__/AppRoutes.test.tsx`, `frontend/e2e/smoke/a06-navigation.spec.ts`, `e2e/smoke/app-load.spec.ts` — regresión unitaria y Playwright.
- `frontend/package.json`, `frontend/scripts/bruno-smoke.test.mjs` — mantenimiento QA runner preexistente de este ciclo: tests Node seriales, deadline por prueba razonable y cotas del smoke controlado por contadores/eventos en vez de tiempo global.
- `frontend/scripts/run-qa.test.mjs` — cambio A06 preexistente que actualiza el nombre esperado del smoke de entrada tras reemplazar el redirect a Documentos por Home.
