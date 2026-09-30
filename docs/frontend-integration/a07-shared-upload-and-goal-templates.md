# A07 — Subida de documentos y plantillas compartidas

> Estado: follow-up A07 aprobado técnicamente por Dev-Reviewer en segundo pase (2026-09-30). La base está committed en `5ecad50b7c006b4cc0b99157b66ee1736cc699b1`; la corrección posterior aprobada aún no tiene commit. Las verificaciones 107 Vitest, runner 33/33 y QA integrado 78/78 con runtime `MOCK` corresponden al árbol corregido posterior a la base, no al commit `5ecad50`. La validación cliente GET vs POST es provisional y la carrera backend sigue pendiente. La revisión visual/Penpot, A01, `PEN-03` y las dos decisiones §8 siguen sin aprobación. Las casillas `[x]` reflejan entregables técnicos A07; no incluyen Home/A10 ni atomicidad backend.

## Alcance implementado

- `lib/goalTemplates.ts` es la definición única, estable y tipada de las tres plantillas existentes (`EXAM`, `LEARNING`, `MEMORIZATION`) con sus labels, títulos y emojis actuales.
- `GoalTemplatePicker` es controlado por props/callback, anuncia la selección con `aria-pressed` y no ejecuta operaciones de persistencia. `GoalsPage` inicia sin plantilla aplicada aunque el tipo de creación manual sea `LEARNING`; editar el título deja de marcar la plantilla y Guardar limpia la selección visual tras la respuesta confirmada.
- `GoalsPage` usa el selector compartido. El botón explícito `Guardar meta` crea la meta únicamente después de trim/validación del título y de una respuesta confirmada; fallos de creación se anuncian sin mostrar éxito. La lista completa conserva edición y borrado.
- `lib/documentValidation.ts` valida extensiones case-insensitive `.pdf`, `.md`, `.markdown`, tamaño no vacío y el máximo inclusivo de `25 × 1024 × 1024` bytes. No usa MIME como autoridad ni desplaza la validación backend.
- `DocumentUpload` recibe una función `onUpload(file)` y la lista actual de documentos; no llama hooks ni endpoints por su cuenta. Mantiene el input nativo `multiple` con `accept`, label asociado y foco global visible; admite drag/drop como alternativa, procesa cada archivo por separado y reporta rechazos locales y errores HTTP `400`/`413` por archivo. Restablece `input.value` al cambiar para admitir el mismo nombre después de un fallo.
- La aceptación depende del DTO recibido del servidor. La interfaz distingue `PENDING` («Subida aceptada. Indexación en curso.»), `INDEXED` y `FAILED`. Si el GET falla después de un POST `PENDING`, mantiene «estado de indexación no confirmado» hasta confirmar un estado terminal. `useUploadDocument.onSuccess` agrega o reemplaza el DTO por ID en `['documents']` antes de invalidar, preservando otros documentos y evitando duplicar la misma entrada.
- `DocumentsPage` trata por separado carga, vacío, error inicial y error de refetch: muestra reintento manual y conserva datos disponibles, que pueden ser una lista parcial si la primera lectura falló. No afirma “no hay documentos” por una consulta fallida. Cuando la caché tiene un DTO `PENDING`, `useDocuments` hace polling automático cada 2 s incluso si fallan GET inicial/refetch; una respuesta exitosa actualiza el estado del intento de subida a `INDEXED` o `FAILED`. Si no llega respuesta confirmatoria, el estado permanece desconocido y hay reintento manual.
- `DocumentPicker` recibe documentos y cambios de selección por callback. `INDEXED` es la única opción habilitada; `PENDING`/`FAILED` tienen `disabled` nativo y muestran el estado/error. Limpia selección controlada si un documento cambia de estado o desaparece. El nombre accesible del checkbox es el filename y su descripción expone el estado.
- La caché `['documents']` conserva `{ documents, source, revision }`, donde `source` es `GET` o `POST`. Solo el queryFn que completó un GET con éxito marca `GET`; la respuesta `PENDING` del POST combina los DTOs existentes sin duplicar IDs, incrementa `revision` y marca `POST` provisional. Un GET que empezó antes de que cambiara la revisión no puede certificar ni sobrescribir el cache nuevo.
- `PlanPage` deshabilita el CTA sin una lista confirmada mediante GET y al menos un documento `INDEXED` seleccionado, y explica el requisito/error junto al botón (con reintento tras fallo). `handleGenerate` reconsulta sincrónicamente la procedencia y estado de `['documents']`, vuelve a filtrar por `INDEXED` y envía solo IDs vigentes; no manda `document_ids: []` al backend.
- El `DocumentPicker` solo presenta su empty state si el consumidor indica que la lista es fiable. `PlanPage` requiere tanto procedencia `GET` como estado Query `success`; un cache `POST PENDING` no habilita el vacío aunque Query tenga estado `success`. Un error de refetch también oculta un vacío anterior, conserva los datos y la selección disponibles, anuncia el error y bloquea el CTA.
- `DocumentsPage`, `GoalsPage` y `PlanPage` reutilizan estas piezas. Las mutaciones siguen en TanStack Query y no se duplican reglas backend/API.
- No se cambió backend, cliente Axios, endpoints, navegación ni rutas. Se ajustó el `onSuccess` del hook `useUploadDocument` para sembrar y luego invalidar la caché de documentos. Los componentes quedan preparados para la integración en Home, que pertenece a A10; `HomePage` no se adelantó en esta actividad.

## Diseño y accesibilidad

Se conserva la paleta/tipografía/tokens A05. La subida combina un control nativo visible con un área separada de drop, para no hacer un `div onClick` sustituto del selector. Mensajes de error/estado usan regiones semánticas, etiquetas explícitas, controles con área táctil de al menos 44 px y el foco de 3 px definido globalmente. El foco está comprobado por el smoke Playwright A05; no equivale a una auditoría WCAG completa.

La primera pasada de `npm run test:e2e` después de integrar las piezas reveló dos regresiones: `outline-none` local ocultaba el outline de foco global esperado por A05; y el nombre accesible del checkbox de Plan combinaba filename y estado, rompiendo el contrato de medición A06. Se retiró el override de outline y se separaron el nombre (`aria-labelledby`) y descripción (`aria-describedby`). La siguiente ejecución E2E y la corrida integrada final pasan.

## TDD y verificaciones

Las pruebas del segundo ciclo se escribieron primero y reprodujeron el fallo: un click sobre el botón todavía habilitado podía enviar una generación cuando el último documento seleccionado desaparecía de la caché; una lista de documentos fallida no bloqueaba el CTA; y tras un POST `PENDING` la caché no quedaba sembrada, por lo que un error de GET impedía activar el polling. El test con tiempo controlado falla el GET inicial y el de invalidación, verifica que a 1.999 ms no hubo GET adicional y avanza 1 ms hasta confirmar tanto `INDEXED` como `FAILED`, con un solo POST. Otro test verifica que el cache update conserva otros DTOs y reemplaza un ID existente. El pase enfocado verde terminó con **10/10 pruebas**:

```bash
npm test -- src/__tests__/PlanPage.test.tsx src/__tests__/DocumentsPage.test.tsx src/__tests__/queries.test.tsx
```

Verificación del segundo ciclo, desde `frontend/`, en orden secuencial:

| Comando | Resultado observado |
|---|---|
| `npm run lint` | Exit 0; `tsc --noEmit`. |
| `npm test` | Exit 0; 11 archivos, 100 pruebas aprobadas. |
| `npm run build` | Exit 0; Vite generó build. Se mantiene advertencia de chunk JS >500 kB; 824.30 kB minificado (244.37 kB gzip). |
| `npm run test:qa:types` | Exit 0; typecheck de la configuración QA. |
| `npm run test:qa:runner` | Exit 0; 33/33 tests Node. Las peticiones fallidas en la salida son escenarios negativos controlados del runner, no fallos de sus tests. |
| `npm run test:api` | Exit 0; Playwright API 3/3 + Bruno 21/21 requests, 51/51 aserciones y 21/21 tests. El `202 Accepted` de generación se siguió por GET hasta `READY`. |
| `npm run test:e2e` | Exit 0; 3/3 smoke Playwright, incluidos foco A05 y navegación A06 a 320 px. |
| `npm run test:qa` | Exit 0; runtime `MOCK`; API 3/3, E2E 3/3, Bruno 72/72 checks (21 requests + 51 aserciones), total 78/78; cero fallos, skips u omisiones; procesos y datos temporales limpiados. |

El reporte integrado es [`../../frontend/qa-results/2026-09-30T09-24-33-120Z-1c6bb2a5/run-report.json`](../../frontend/qa-results/2026-09-30T09-24-33-120Z-1c6bb2a5/run-report.json), ignorado por Git. Confirma `status=passed`, `exitCode=0`, HEAD `58e3a97861993122f41a712310bc9b5d5d5dc2ca`, rama `fix/frontend-ui-fixes`, árbol sucio, runtime `MOCK`, 78/78 checks, cero fallos/skips/omisiones y cleanup. No se llamó un proveedor LLM real; un `202 Accepted` por sí solo no se tomó como aprobación. Es evidencia de QA del árbol previo al commit; no equivale a aceptación de A07.

## Historial del primer pase y corrección del follow-up (2026-09-30)

En el primer pase del follow-up, Dev-Reviewer solicitó cambios (veredicto `CAMBIOS REQUERIDOS`, 2026-09-30): `PlanPage` no podía inferir procedencia por `documentsQuery.status === "success"`, porque `useUploadDocument.onSuccess` siembra el DTO `PENDING` con `setQueryData` y eso también marca Query como `success` antes de que un GET confirme la lista. La corrección posterior añade procedencia explícita, ligada al `QueryClient`, en el dato cacheado `['documents']`: `{ documents, source: "GET" | "POST", revision }`. En el segundo pase (2026-09-30), Dev-Reviewer aprobó técnicamente el follow-up corregido. `useDocuments` devuelve los DTOs mediante `select`, marca `GET` solo al resolver correctamente el GET y sigue programando el polling existente de 2 s si el cache incluye `PENDING`. `useUploadDocument` agrega/reemplaza por ID, conserva otros DTOs y avanza la revisión con fuente `POST`; una petición que arrancó con una revisión anterior no puede certificar ni sobrescribir el cache provisional más nuevo. No se cambian endpoints, backend, política de retry ni cantidad de pollers.

`PlanPage` exige `source === "GET"` y Query `status === "success"` para presentar vacío o habilitar generación. El guard síncrono de `handleGenerate` aplica la misma procedencia/estado antes de filtrar solo los IDs todavía `INDEXED`; no envía `document_ids: []`. Un `POST PENDING` no confirma el nuevo estado aunque eleve Query a `success`. Los datos y selección previos permanecen visibles, pero el CTA queda bloqueado hasta que GET confirme; tras error de refetch también se oculta el vacío de una respuesta `[]` anterior y se ofrece retry.

**TDD:** la regresión de `PlanPage` con `QueryClient` real, el hook `useUploadDocument` real y `DocumentPicker` real falló primero como se esperaba: después del seed POST `PENDING`, antes de resolver el GET invalidado, el DOM mostraba falsamente «No hay documentos indexados». Un test del hook detectó también que un GET que comenzó antes de cambiar la revisión podía ocultar otros documentos de ese resultado; falló al quedar solo el DTO POST en caché. El mismo escenario de Plan ahora fuerza GET inicial fallido → POST único PENDING → GET invalidado fallido → retry GET exitoso `[]`; comprueba el estado provisional mientras el GET está pendiente, el aviso/retry y CTA bloqueado tras fallar, y el empty state solo tras el GET exitoso. También cubre GET `[]` exitoso seguido de refetch fallido, y una lista GET previa con un documento INDEXED seleccionado seguida de subida PENDING: el anterior y la selección se conservan y el CTA se bloquea. `queries.test.tsx` verifica el ciclo POST, que el DTO previo no se pierde ni duplica, y que un GET en vuelo anterior se mezcla sin confirmar la caché provisional.

`DocumentsPage.test.tsx` conserva el caso de polling con temporizadores controlados: POST devuelve `PENDING`; fallan GET inicial, GET de invalidación y primer GET automático a +2 s; el segundo GET automático a +4 s confirma `INDEXED` o `FAILED`. Verifica retry habilitado tras cada error, sin éxito terminal prematuro y sin repetir POST.

Los tests focalizados fallaron antes de producción por los dos síntomas descritos y pasaron después: **17/17** en los tres archivos objetivo. Verificación fresca desde `frontend/`, secuencialmente por uso de puertos:

| Comando | Resultado observado |
|---|---|
| `npm test -- src/__tests__/PlanPage.test.tsx src/__tests__/DocumentsPage.test.tsx src/__tests__/queries.test.tsx` | Exit 0; 3 archivos, 17/17 pruebas. |
| `npm run lint` | Exit 0; `tsc --noEmit`. |
| `npm test` | Exit 0; 11 archivos, 107/107 pruebas. |
| `npm run build` | Exit 0; warning conocido de chunk >500 kB, 825.02 kB minificado (244.66 kB gzip). |
| `npm run test:qa:types` | Exit 0; typecheck de configuración QA. |
| `npm run test:qa:runner` | Exit 0; 33/33 pruebas Node secuenciales. Los reportes Bruno fallidos que aparecen en stdout son escenarios negativos inducidos comprobados por el runner. |
| `npm run test:api` | Exit 0; Playwright API 3/3 + Bruno 21/21 requests, 51/51 assertions, 21/21 tests; runtime `MOCK`. |
| `npm run test:e2e` | Exit 0; 3/3 smoke Playwright de producción. |
| `npm run test:qa` | Exit 0; API 3/3, E2E 3/3, Bruno 21/21 requests + 51/51 assertions, 78/78 total; cero fallos/skips/omisiones, runtime `MOCK`, cleanup confirmado. |

Reporte integrado fresco (ignorado por Git): [`../../frontend/qa-results/2026-09-30T10-58-54-065Z-9dcc6378/run-report.json`](../../frontend/qa-results/2026-09-30T10-58-54-065Z-9dcc6378/run-report.json). Registra `status=passed`, `exitCode=0`, commit base `5ecad50b7c006b4cc0b99157b66ee1736cc699b1`, rama `fix/frontend-ui-fixes`, árbol `dirty`, runtime `MOCK`, API/E2E/Bruno 78/78, `temporaryDataRemoved=true` y `processTreesStopped=true`. `test:api` y `test:e2e` también generaron reportes separados en `2026-09-30T10-58-03-881Z-d20dfa9a` y `2026-09-30T10-58-25-219Z-88bab1a0`. La evidencia de QA pertenece al árbol local posterior al commit base y no se atribuye a `5ecad50`; el reporte acredita QA, mientras que la aprobación técnica consta en el veredicto del segundo pase descrito arriba. La corrección aprobada sigue sin commit y no se inventa un hash para ella.

## Límites y trabajo posterior

- Home conserva la página mínima A06; no integra todavía subida, selector o CTA. A10 los podrá componer usando callbacks sin duplicar reglas.
- No se usó Penpot ni se afirma paridad visual. A01 mantiene hallazgos; `PEN-03` y las dos decisiones de producto §8 siguen abiertas. A07 no depende de ellas y no las aprueba.
- El test de carga no llama un proveedor real. El QA integrado usa el backend aislado y `MOCK`; la colección A04 es regresión API, no evidencia del UI de A07.
- La verificación y filtrado de IDs son cliente-side; no eliminan la carrera entre el último GET confirmado y un cambio de estado/borrado en servidor antes de procesar POST `/plans/generate`. El contrato ejecutable actual confirma que la ruta pasa IDs a `PlanService.create_plan`, que valida la meta pero guarda la lista de IDs sin revalidar atómicamente existencia, propietario o estado `INDEXED` de cada documento. No hay garantía backend de idempotencia para escrituras concurrentes o respuestas perdidas. Cerrar esas garantías requeriría cambios de contrato/backend fuera de este follow-up; A07 no las afirma.
- La corrección no añade caché/errores globales A11 ni altera la política general de retry de TanStack Query.
- La subida `25 MiB` es validación anticipada para el perfil actual; configuraciones backend más restrictivas pueden seguir rechazando la petición y el error del servidor se muestra por archivo.
- El warning del bundle >500 kB ya estaba registrado en A02; esta actividad no realiza el análisis de rendimiento de A18.
- `frontend/qa/fixtures/studyai-a04-smoke.md` y la evidencia/baseline A02 no se modificaron.
