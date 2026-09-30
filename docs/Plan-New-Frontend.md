# Plan de integración y verificación del nuevo frontend de StudyAI

**Objetivo:** implementar el diseño de Penpot y el recorrido definido en [`docs/fronted-design.md`](fronted-design.md), conservando las funcionalidades actuales y demostrando su funcionamiento con pruebas de componentes, **Playwright** y **Bruno CLI**.

**Arquitectura:** integración incremental sobre React 18 + TypeScript + Vite + Tailwind 3. Las páginas compondrán componentes reutilizables; la coordinación de operaciones estará en hooks; las llamadas al servidor seguirán pasando por TanStack Query y el cliente Axios tipado.

**Estado:** plan propuesto. La implementación y las pruebas descritas a continuación son actividades futuras.

## 1. Hallazgos que condicionan el trabajo

Contrasté la especificación con el código actual y consulté Penpot y la documentación de las herramientas.

| Hallazgo verificado | Consecuencia para el plan |
|---|---|
| `/` todavía redirige a `/documents`. | Hay que implementar el inicio unificado y conservar las rutas especializadas. |
| Penpot contiene páginas de escritorio, móvil y tablet. En escritorio hay 17 tableros, incluidos inicio de primera visita/regreso y configuración contextual. | El trabajo comienza con un inventario y un mapeo de pantallas, estados y componentes. |
| La revisión global final del prototipo quedó pendiente en la sesión anterior. | Debe comprobarse antes de aprobar la referencia visual de implementación. |
| Los documentos se consultan cada 2 segundos mientras hay `PENDING`; el detalle del plan cada 3 segundos mientras está `PROCESSING`. | Las pruebas deben comprobar estados asíncronos y detener la espera por condiciones reales. |
| `POST /plans/generate` devuelve `202` con un `PlanStatusDTO`, no un plan completo. | Recibir esa respuesta no permite navegar directamente a una sesión. |
| La creación de metas y planes no tiene un contrato de idempotencia. | Deshabilitar un botón evita algunos duplicados, pero no garantiza operaciones únicas ante concurrencia o respuestas perdidas. |
| `SettingsPage.tsx` concentra el flujo de credenciales y tiene 24 casos de prueba declarados. | Conviene extraer funcionalidad compartida preservando sus pruebas antes de reutilizarla en Inicio. |
| `SessionPage` guarda el resultado del quiz y cambia inmediatamente de fase, desmontando el componente que lo mostraría. | Hay que incluir una prueba y una corrección para presentar el resultado confirmado. |
| Algunas invalidaciones de caché no alcanzan sesiones, detalle del plan o dashboard. | La integración necesita verificar consistencia después de completar y eliminar recursos. |
| No hay suites versionadas de Playwright ni colecciones Bruno. Bruno CLI **4.2.0** sí está instalado. | Hay que crear infraestructura reproducible y colecciones mantenibles. |
| Los tests de backend con `TestClient` esperan las tareas en segundo plano. | No sustituyen la comprobación del comportamiento asíncrono mediante HTTP real. |

### Restricciones globales

- Mantener React 18, TypeScript, Vite, Tailwind 3, Axios y TanStack Query.
- Conservar modo demo sin claves y sin dependencias RAG pesadas.
- Preservar `/documents`, `/goals`, `/plan`, `/plan/:planId`, `/session/:sessionId`, `/dashboard` y `/settings`.
- Utilizar únicamente documentos `INDEXED` para el nuevo flujo de Inicio.
- Abrir sesiones únicamente después de obtener un plan `READY` con sesiones reales.
- Preservar la secuencia de configuración: **guardar clave → guardar borrador → verificar revisión → activar**.
- No guardar claves en almacenamiento del navegador ni incluirlas en evidencias.
- Mantener Markdown seguro y búsquedas de YouTube construidas desde palabras clave.
- Distinguir acceso a una sesión existente de restauración del temporizador o del quiz.
- Aplicar pruebas antes de dar por finalizada cada actividad funcional.

## 2. Decisiones de implementación propuestas

### 2.1. Reutilización de funcionalidad

Extraer piezas de Documentos, Metas y Configuración para que Inicio las componga. Esto evita mantener dos implementaciones de subida, plantillas o activación de proveedores.

No se trasladarán los formularios completos a Inicio: se compartirán sus operaciones y componentes necesarios, con presentación compacta y avanzada.

### 2.2. Destino cuando el plan esté listo

**Propuesta:** al llegar a `READY`, mostrar en Inicio:

- Acción principal para abrir la primera sesión pendiente, ordenada por `order_index`.
- Acción secundaria para consultar todas las sesiones.
- Acceso al detalle del plan.

Esto conserva el camino corto y permite elegir otra sesión sin una navegación automática inesperada.

### 2.3. Protección frente a duplicados

El plan contempla:

1. Bloqueo inmediato de la operación mientras está en curso.
2. Reutilización de IDs confirmados.
3. Recuperación mediante consultas al volver o recargar.
4. Ausencia de reenvío automático cuando no se sabe si una escritura llegó al servidor.

**Límite que requiere acuerdo:** si “sin duplicados” debe garantizarse también ante dos pestañas concurrentes y una respuesta perdida después de guardar, hará falta ampliar el contrato backend con idempotencia. Es una decisión previa a cerrar ese criterio, porque la especificación actual limita el alcance a la API existente.

### 2.4. Infraestructura de Playwright

Propongo **Playwright Test en TypeScript**, junto al frontend, para disponer de fixtures, proyectos por navegador, trazas, reportes y comparaciones visuales en el mismo lenguaje.

De la skill `webapp-testing` se conserva el método de inspeccionar el DOM, usar selectores semánticos y gestionar el ciclo de vida de los servidores. Sus ejemplos Python se adaptan al runner de TypeScript.

Para esta aplicación con polling se esperarán elementos, respuestas y estados concretos; `networkidle` no será la condición general de “pantalla lista”.

## 3. Organización de archivos propuesta

Las rutas nuevas de esta sección son propuestas, no archivos existentes.

| Área | Crear o modificar | Responsabilidad |
|---|---|---|
| Entrada | `frontend/src/pages/HomePage.tsx` | Inicio de primera visita y regreso. |
| Rutas | `frontend/src/App.tsx`, `frontend/src/pages/NotFoundPage.tsx` | Nueva entrada y 404 útil. |
| Navegación | `frontend/src/components/AppShell.tsx` | Navegación responsive, foco y landmarks. |
| Sistema visual | `frontend/src/styles/tokens.css`, `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/src/components/ui.tsx` | Tokens y controles compartidos. |
| Estados | `frontend/src/components/AsyncState.tsx` | Carga, vacío y error inicial; conservar contenido durante refetch. |
| Documentos | `frontend/src/components/documents/DocumentUpload.tsx`, `DocumentPicker.tsx`, `frontend/src/lib/documentValidation.ts` | Subida reutilizable, selección y validación. |
| Metas | `frontend/src/lib/goalTemplates.ts`, `frontend/src/components/goals/GoalTemplatePicker.tsx` | Una definición de plantillas para Inicio y Metas. |
| Proveedores | `frontend/src/components/llm/ProviderSetup.tsx`, `LlmRuntimeSummary.tsx`, `frontend/src/hooks/useProviderSetup.ts` | Configuración reutilizable y proveedor efectivo. |
| Coordinación de Inicio | `frontend/src/hooks/useStudyStart.ts`, `frontend/src/lib/studyStartRecovery.ts` | Guardas, secuencia de mutaciones y recuperación. |
| Sesiones | `frontend/src/components/session/StudyPhase.tsx`, `BreakPhase.tsx`, `QuizPhase.tsx`, `SessionResult.tsx` | Presentación por fase y resultado confirmado. |
| Integración de datos | `frontend/src/hooks/queries.ts`, `frontend/src/api/endpoints.ts`, `frontend/src/api/types.ts` | Contratos e invalidaciones necesarias. |
| Componentes/tests | `frontend/src/__tests__/`, `frontend/src/test/renderWithProviders.tsx` | Pruebas de comportamiento con QueryClient aislado. |
| Playwright | `frontend/playwright.config.ts`, `frontend/tsconfig.qa.json`, `frontend/e2e/` | Suite E2E y revisión visual. |
| Bruno | `frontend/bruno/bruno.json`, `frontend/bruno/environments/qa.bru`, colecciones por escenario | Contratos y flujos HTTP. |
| Entorno QA | `frontend/scripts/run-qa.mjs`, `frontend/qa/fixtures/` | Servidores aislados, datos sintéticos y ejecución reproducible. |
| Evidencias | `frontend/qa-results/` | Reportes y trazas locales, excluidos de Git. |
| Documentación | `docs/frontend-integration/`, `README.md`, `docs/AGENTS_STATUS.md` | Trazabilidad, instrucciones y estado. |

No se dividirá un archivo por sistema: las extracciones deben corresponder a responsabilidades compartidas o componentes que necesiten pruebas independientes.

## 4. Secuencia de entregas

| Entrega | Actividades | Resultado verificable |
|---|---|---|
| E0 — Referencia y protección | A01–A04 | Diseño inventariado, baseline y pruebas HTTP reproducibles. |
| E1 — Base de interfaz | A05–A06 | Navegación accesible, tokens y estados consistentes. |
| E2 — Preparación de estudio | A07–A10 | Documentos, metas, proveedores e Inicio integrados. |
| E3 — Recorrido completo | A11–A13 | Planes, sesiones, resultados y progreso consistentes. |
| E4 — Validación | A14–A17 | Evidencia API, E2E, responsive y paridad visual. |
| E5 — Cierre | A18 | Rendimiento revisado, documentación y aceptación final. |

Cada actividad funcional seguirá: **test que demuestra el comportamiento → ejecución que detecta la ausencia o fallo → implementación → test verde → revisión del diff**.

# 5. Actividades detalladas

## A01. Consolidar la referencia de Penpot y la matriz de trazabilidad

**Dependencias:** ninguna.

**Entregables:**  
`docs/frontend-integration/design-map.md`  
`docs/frontend-integration/acceptance-matrix.md`

- [x] Inventariar tableros de escritorio, móvil y tablet con ID, nombre, dimensiones y estado representado. Ver [`frontend-integration/design-map.md`](frontend-integration/design-map.md).
- [x] Verificar que los recorridos de primera visita y regreso comienzan en Inicio.
- [x] Comprobar destinos de interacciones: preparación, generación, detalle, sesión, receso, quiz, resultado y configuración.
- [x] Revisar los destinos y la contención visual que quedaron pendientes; las discrepancias están registradas en `design-map.md` y `acceptance-matrix.md`.
- [x] Mapear cada tablero a ruta, componente y datos del API que lo alimentarán.
- [x] Seleccionar explícitamente los tableros para el handoff por ID/nombre, sin depender de la selección actual de Penpot.
- [x] Extraer estructura, tokens y estilos por etapas siguiendo `penpot-design-to-code-review`.
- [x] Registrar estados no dibujados: carga, vacío, error, deshabilitado, conflicto y contenido largo.
- [x] Acordar la autoridad por dimensión: Penpot para visuales; `fronted-design.md` y contrato API para comportamiento; registrar los gaps que requieren revisión antes de aprobar el diseño.

**Criterio de salida:** toda pantalla del recorrido tiene referencia identificada; los estados faltantes tienen una definición funcional antes de implementarse.

## A02. Capturar la línea base técnica y funcional

**Dependencias:** A01 para las comparaciones de diseño; el baseline técnico puede prepararse antes.

**Entregable:** `docs/frontend-integration/baseline.md`

- [ ] Registrar commit, versiones, configuración relevante y cambios locales preexistentes.
- [ ] Ejecutar la suite actual del frontend y del backend.
- [ ] Registrar fallos y advertencias existentes sin atribuirlos al rediseño.
- [ ] Recorrer el flujo actual con datos sintéticos: documento → meta → plan → sesión → quiz → dashboard.
- [ ] Capturar escritorio y móvil, navegación, errores de consola y acceso a sesiones completadas.
- [ ] Registrar tamaño de JS/CSS de producción y condiciones de medición.
- [ ] Añadir en `src/__tests__/queries.test.tsx` una prueba que confirme que `{ goalId, documentIds }` llega a `api.generatePlan(goalId, documentIds)` sin modificar IDs.
- [ ] Caracterizar los problemas observados de resultado del quiz e invalidación de caché.

**Comandos desde `frontend/`:**
```bash
npm run lint
npm test
npm run build
```

**Desde `backend/`, con su entorno Python activo:**
```bash
python -m pytest -q
```

**Criterio de salida:** baseline reproducible y lista explícita de problemas previos.

## A03. Crear el entorno aislado de QA

**Dependencias:** A02.

**Archivos principales:**  
`frontend/scripts/run-qa.mjs`  
`frontend/playwright.config.ts`  
`frontend/tsconfig.qa.json`  
`frontend/package.json`  
`frontend/vite.config.ts`  
`.gitignore`

- [ ] Incorporar versiones fijadas de Playwright Test y Bruno CLI; fijar inicialmente Bruno a la versión verificada, `4.2.0`.
- [ ] Crear scripts `test:e2e`, `test:api`, `test:qa` y `test:qa:types`.
- [ ] Crear un directorio temporal único por ejecución.
- [ ] Arrancar Uvicorn con base de datos, uploads y vector store exclusivos de esa ejecución.
- [ ] Forzar `ANTHROPIC_API_KEY=""` y una base nueva sin credenciales activas para el perfil demo.
- [ ] Utilizar un entorno Python con dependencias core, para evitar descargas de modelos durante el smoke demo.
- [ ] Usar puertos QA separados: propuesta backend `8002` y frontend `4173`.
- [ ] Configurar `CORS_ORIGINS` y `VITE_API_URL` de forma coherente; esta última debe estar definida al construir el frontend.
- [ ] Servir el build de producción para las pruebas finales.
- [ ] Comprobar `/health` y la disponibilidad del frontend antes de lanzar pruebas.
- [ ] Fallar si los puertos están ocupados; no reutilizar silenciosamente los servidores de desarrollo.
- [ ] Cerrar procesos en éxito, fallo o interrupción; conservar reportes y limpiar datos temporales.
- [ ] Configurar inicialmente `workers: 1` y `retries: 0`, por el usuario demo compartido.
- [ ] Limitar Vitest a pruebas bajo `src/` para que no recoja los archivos de Playwright.
- [ ] Añadir typecheck específico para configuración, helpers y tests E2E.

**Prueba del propio entorno:** un smoke consulta salud y abre la aplicación; al finalizar, los procesos QA terminan y los datos de desarrollo permanecen intactos.

**Criterio de salida:** otro desarrollador puede ejecutar QA desde un checkout limpio siguiendo instrucciones versionadas.

## A04. Crear el smoke HTTP de Bruno

**Dependencias:** A03.

**Ubicación:** `frontend/bruno/smoke/`

- [ ] Crear entorno `qa` con `baseUrl` y parámetros de espera sin secretos.
- [ ] Crear fixture Markdown sintético compartido por Bruno y Playwright.
- [ ] Implementar requests ordenadas, cada una con assertions de estado HTTP y contenido.
- [ ] Encadenar IDs mediante variables de ejecución, nunca IDs fijos.
- [ ] Implementar polling acotado para indexación y generación.
- [ ] Fallar inmediatamente ante `FAILED`.
- [ ] Fallar si se agota la espera; terminar una colección no debe confundirse con éxito.
- [ ] Consultar todas las sesiones del plan y verificar su pertenencia.
- [ ] Enviar un quiz una sola vez y comprobar su efecto en sesión y dashboard.
- [ ] Eliminar los recursos creados y verificar el resultado.

**Secuencia mínima:**

| Paso | Petición | Aserción principal |
|---|---|---|
| Salud | `GET /health` | `200`, `status="ok"` |
| Runtime | `GET /llm-settings/runtime` | `source="MOCK"` en el entorno demo |
| Subida | `POST /documents/upload` | `201`, ID real |
| Indexación | `GET /documents/{id}` | Termina en `INDEXED` |
| Meta | `POST /goals` | `201`, tipo y título correctos |
| Generación | `POST /plans/generate` | `202`, ID y estado `PROCESSING` |
| Espera | `GET /plans/{id}/status` | Termina en `READY` |
| Detalle | `GET /plans/{id}` | Documentos/meta correctos y sesiones no vacías |
| Sesión | `GET /sessions/{id}` | Material y `plan_id` correctos |
| Quiz | `GET /quizzes/{sessionId}` | Preguntas y `quiz.id` reales |
| Envío | `POST /quizzes/{quizId}/submit` | Resultado válido |
| Progreso | Sesión + dashboard | Finalización y revisiones reflejadas |
| Limpieza | DELETE de recursos | `204` y ausencia posterior |

**Importante:** `sessionId` y `quizId` son identificadores distintos.

**Criterio de salida:** el flujo backend funciona por HTTP real y produce reporte Bruno con salida `0`.

## A05. Implementar tokens y componentes base

**Dependencias:** A01–A03.

**Archivos:** tokens, CSS global, Tailwind, `components/ui.tsx`, `AsyncState.tsx`.

> Estado: implementación para revisión independiente. Las casillas `[x]` registran entregables implementados; no equivalen a aceptación de A05, aprobación de A01 ni paridad validada con Penpot.

- [x] Mapear valores observados del handoff Penpot a variables CSS semánticas y utilidades Tailwind.
- [x] Resolver/documentar las decisiones de implementación y las diferencias/candidatos que siguen pendientes de validación en Penpot.
- [x] Definir tipografía, espaciado, bordes, superficies, acciones y estados.
- [x] Implementar botón, enlace con aspecto de botón, input, select, avisos y estado de actividad.
- [x] Mantener semántica correcta; el enlace con aspecto de botón es un `<a>` y se migraron los dos enlaces con botones anidados del estado completado de `SessionPage`.
- [x] Incorporar foco visible, áreas táctiles objetivo de 44 × 44 px y movimiento reducido.
- [x] Crear estados de carga, vacío y error con acciones contextuales.
- [x] Diferenciar error inicial de error al actualizar datos ya disponibles, conservando el contenido previo.
- [x] Reservar el espacio necesario en skeletons con dimensiones explícitas.

**Pruebas:** `src/__tests__/ui.test.tsx`

Comprobar etiquetas y estado deshabilitado de `Input`/`Select`, navegación semántica de `ButtonLink`, skeleton, vacío, error inicial/reintento y conservación del contenido al reintentar una actualización. `e2e/smoke/a05-focus.spec.ts` verifica con teclado y estilos computados el foco de controles legacy a 320/390 px, el enlace de navegación en escritorio y el comportamiento con hover/movimiento reducido.

**Criterio de salida:** los componentes base se pueden usar en todas las páginas sin introducir lógica de negocio.

> La implementación A05 queda pendiente de revisión independiente. Este registro no declara aceptada A05, no certifica paridad/contraste WCAG y no cierra los hallazgos pendientes de la revisión A01. Véase [`frontend-integration/a05-tokens-and-components.md`](frontend-integration/a05-tokens-and-components.md).

## A06. Integrar navegación responsive y rutas

**Dependencias:** A05.

**Archivos:** `AppShell.tsx`, `App.tsx`, `NotFoundPage.tsx`.

- [ ] Añadir Inicio a la navegación.
- [ ] Implementar menú móvil con botón, nombre accesible y `aria-expanded`.
- [ ] Gestionar apertura, cierre, Escape y devolución del foco.
- [ ] Si el panel es modal, mantener foco dentro y evitar interacción con el fondo.
- [ ] Añadir “Saltar al contenido”, `main` y ruta activa mediante `aria-current`.
- [ ] Conservar todas las rutas existentes.
- [ ] Añadir 404 útil con vuelta al Inicio.
- [ ] Validar identificadores de URL antes de consultar; evitar solicitudes con `NaN`.
- [ ] Gestionar títulos de página y foco al cambiar de ruta.

**Pruebas:** `AppShell.test.tsx`, `AppRoutes.test.tsx`.

**Criterio de salida:** todas las secciones son alcanzables con teclado y a 320 px, incluido un enlace directo a plan o sesión.

## A07. Extraer subida de documentos y plantillas compartidas

**Dependencias:** A05.

**Archivos:** componentes de documentos/metas, `goalTemplates.ts`, `documentValidation.ts`, `DocumentsPage.tsx`, `GoalsPage.tsx`.

- [ ] Extraer una única definición de las tres plantillas actuales.
- [ ] Mantener que elegir plantilla rellena datos, pero no crea una meta.
- [ ] Implementar subida por selector nativo y arrastre.
- [ ] Validar `.pdf`, `.md`, `.markdown`, archivo vacío y tamaño.
- [ ] Utilizar el límite documentado de `25 × 1024 × 1024` bytes para el perfil actual y mantener el error del servidor como autoridad final.
- [ ] Conservar carga múltiple y mostrar resultado individual por archivo.
- [ ] Permitir volver a seleccionar un archivo cuyo intento haya fallado.
- [ ] Mostrar claramente subida aceptada frente a indexación terminada.
- [ ] Deshabilitar selección para generación de documentos `PENDING` o `FAILED`.
- [ ] Mantener gestión, edición y borrado en las páginas completas.

**Pruebas:**

- `DocumentUpload.test.tsx`: carga múltiple, error parcial, archivo vacío, límite exacto y límite + 1 byte.
- `DocumentPicker.test.tsx`: solo `INDEXED` seleccionable.
- `GoalsPage.test.tsx`: plantilla no persistida, título vacío y creación confirmada.

**Criterio de salida:** Inicio y páginas completas pueden reutilizar las mismas piezas sin duplicar reglas.

## A08. Extraer configuración de proveedor para Inicio y Configuración

**Dependencias:** A05; mantener verdes las pruebas existentes.

**Archivos:** `ProviderSetup.tsx`, `LlmRuntimeSummary.tsx`, `useProviderSetup.ts`, `SettingsPage.tsx`.

- [ ] Extraer el comportamiento de `ProviderCard` conservando revisiones, borrador y conflictos.
- [ ] Compartir validación y presentación del runtime efectivo.
- [ ] Exponer variantes de presentación `compact` y `advanced`.
- [ ] Obtener capacidades desde el catálogo: clave requerida, URL personalizada, modelos libres y descubrimiento.
- [ ] Mantener el orden de escritura, verificación y activación.
- [ ] Utilizar siempre la revisión devuelta por la última operación confirmada.
- [ ] Invalidar evidencia visual cuando cambian clave, modelo o URL.
- [ ] Mantener recuperación de conflictos `409`.
- [ ] Limpiar la clave del estado local después de guardarla.
- [ ] No identificar un proveedor como activo hasta confirmar el runtime.
- [ ] Mostrar “proveedor desconocido” ante error o respuesta incompatible.
- [ ] Preservar Ollama sin clave y NVIDIA limitado a su catálogo.

**Pruebas:** existentes de `SettingsPage.test.tsx` y nuevas de `ProviderSetup.test.tsx`.

**Criterio de salida:** el mismo flujo seguro puede completarse dentro de Inicio y en Configuración.

## A09. Implementar la coordinación de «Estudiar»

**Dependencias:** A07–A08.

**Archivo central:** `frontend/src/hooks/useStudyStart.ts`.

**Interfaz propuesta:**

```ts
type GoalSelection =
  | { kind: "existing"; goalId: number }
  | { kind: "template"; payload: GoalCreate };

type StudyStartInput = {
  goal: GoalSelection;
  documentIds: number[];
};
```

El hook expondrá `start(input)`, fase, IDs confirmados, error y acción de recuperación. Las fases serán:

`idle → saving-goal → requesting-plan → processing → ready`

Con ramas explícitas de `error` y `uncertain`.

- [ ] Validar selección antes de mutar: documentos existentes/indexados y meta válida.
- [ ] Comprobar que la configuración efectiva se ha consultado correctamente.
- [ ] Tomar una instantánea de la selección al iniciar.
- [ ] Bloquear sincrónicamente una segunda ejecución, además de deshabilitar el botón.
- [ ] Reutilizar una meta seleccionada por ID; crear solo cuando se utiliza una plantilla nueva.
- [ ] Conservar el `goalId` si la creación tuvo éxito y falla la siguiente operación.
- [ ] Generar el plan y conservar inmediatamente su ID confirmado.
- [ ] Consultar `usePlan(planId)` hasta `READY` o `FAILED`.
- [ ] Verificar sesiones no vacías antes de ofrecer navegación.
- [ ] No ejecutar escrituras desde efectos de montaje ni reintentar automáticamente un POST incierto.
- [ ] Recuperar IDs confirmados y consultar recursos al recargar.
- [ ] Si se usa `sessionStorage`, guardar solo una referencia versionada mínima, nunca claves, contenido o respuestas.
- [ ] Ante resultado incierto, consultar y permitir seleccionar recursos existentes; no deducir identidad únicamente por título.

**Pruebas:** `useStudyStart.test.tsx`.

Cubrir doble clic, StrictMode, meta reutilizada, fallo después de guardar meta, plan fallido, respuesta perdida, recarga y `READY` sin sesiones.

**Criterio de salida:** una acción normal produce una única secuencia; los casos inciertos no provocan reenvío silencioso. La garantía estricta entre peticiones concurrentes permanece vinculada a la decisión de idempotencia.

## A10. Construir Inicio: primera visita y regreso

**Dependencias:** A06–A09.

**Archivo:** `HomePage.tsx`.

- [ ] Presentar propósito y utilidades de StudyAI antes del formulario.
- [ ] Integrar material, meta y proveedor en la misma superficie.
- [ ] Mostrar explicación del requisito pendiente junto a «Estudiar».
- [ ] Permitir completar configuración contextual sin salir de Inicio.
- [ ] Mostrar progreso indeterminado durante indexación y generación.
- [ ] Mostrar la sesión sugerida y enlace al detalle cuando el plan esté listo.
- [ ] Añadir planes existentes para el regreso.
- [ ] Mantener acceso a todos los planes y sesiones, incluidas completadas.
- [ ] Mostrar “Abrir sesión” sin prometer restauración de fases locales.
- [ ] Conservar preparación ante errores recuperables.
- [ ] Hacer explícita la reutilización de una meta existente, evitando deducciones por nombre.

**Pruebas:** `HomePage.test.tsx`.

Verificar primera visita, regreso, `MOCK`, `ENV`, `USER`, runtime desconocido y el recorrido completo sin visitar manualmente cuatro secciones.

**Criterio de salida:** el usuario puede preparar y comenzar el estudio desde `/`.

## A11. Integrar páginas profundas y coherencia de caché

**Dependencias:** A07 y A10.

**Archivos:** páginas de Documentos, Metas, Plan y Detalle; `hooks/queries.ts`.

- [ ] Aplicar estados y estilo compartidos a consultas y mutaciones.
- [ ] Sustituir la barra fija del 60 % por actividad indeterminada.
- [ ] Conservar todas las sesiones del plan y sus enlaces estables.
- [ ] Tratar errores de consulta, recurso eliminado y `READY` sin sesiones.
- [ ] Mantener selección y datos útiles después de un error.
- [ ] Mantener avisos sobre la eliminación de metas y sus planes.
- [ ] Actualizar o invalidar las cachés afectadas por borrado: planes, detalles, sesiones, quizzes y dashboard.
- [ ] Actualizar Inicio cuando se elimina un documento, meta o plan que estaba seleccionado.
- [ ] Distinguir reconsultar un plan de generar uno nuevo.

**Pruebas:** `PlanPage.test.tsx`, `PlanDetailPage.test.tsx`, `queries.test.tsx`.

**Criterio de salida:** listas, detalle, Inicio y progreso reflejan la misma realidad del servidor después de cada operación.

## A12. Integrar sesión, quiz y resultado

**Dependencias:** A05 y A11.

**Archivos:** `SessionPage.tsx`, componentes de sesión, `useTimer.ts`, `queries.ts`.

- [ ] Priorizar lectura con ancho de aproximadamente 65–75 caracteres.
- [ ] Mantener lógica del temporizador en su hook.
- [ ] Extraer fases con contratos claros y controles accesibles.
- [ ] Convertir el volteo de flashcard en una acción nativa de teclado.
- [ ] Reiniciar el estado de volteo al cambiar de pregunta.
- [ ] Exponer selección de calidad 0–5 y opción múltiple de forma accesible.
- [ ] Conservar respuestas si falla el envío.
- [ ] Bloquear doble envío.
- [ ] Elevar `QuizResultDTO` al componente que presenta la fase final; evitar desmontar el resultado antes de mostrarlo.
- [ ] Cambiar a éxito únicamente tras confirmación del API.
- [ ] Actualizar sesión, planes y dashboard después del envío.
- [ ] Comprobar que abrir una sesión completada no dispara otra escritura.
- [ ] Mantener Markdown sin HTML inseguro y los enlaces de búsqueda existentes.

**Pruebas:** `SessionPage.test.tsx`, `QuizPhase.test.tsx`, `useTimer.test.ts`.

Incluir quiz vacío, última pregunta, calidad `0`, fallo de envío, resultado visible, expiración única del temporizador y cambio de sesión.

**Criterio de salida:** estudio → receso → quiz → resultado funciona con datos reales y sin confirmaciones prematuras.

## A13. Integrar Dashboard y completar Configuración

**Dependencias:** A08 y A12.

- [ ] Mostrar estadísticas exclusivamente desde `DashboardDTO`.
- [ ] Diferenciar dashboard vacío de consulta fallida.
- [ ] Añadir equivalente textual o tabular a los gráficos.
- [ ] Mantener etiquetas y fechas legibles en móvil.
- [ ] Confirmar actualización tras completar sesión o borrar planes/metas.
- [ ] Completar la presentación avanzada de Configuración con las piezas compartidas.
- [ ] Comprobar borrado, desactivación y retorno a `ENV` o `MOCK`.
- [ ] Conservar texto correcto: desactivar una credencial no implica necesariamente pasar a demo.

**Pruebas:** `DashboardPage.test.tsx` y suite de Configuración.

**Criterio de salida:** progreso y proveedor efectivo se muestran correctamente tanto al entrar como después de mutaciones.

## A14. Ampliar Bruno: errores, credenciales y regresión

**Dependencias:** A04 y A08–A13.

**Carpetas propuestas:**

```text
frontend/bruno/
├── smoke/
├── documents/
├── goals/
├── plans/
├── quizzes/
├── llm-contract/
└── live-provider/
```

- [ ] Hacer cada escenario independiente mediante sus propios recursos.
- [ ] Añadir archivos inválidos, vacíos y sobredimensionados.
- [ ] Verificar `400` para validación de dominio y `422` para cuerpos inválidos según el contrato actual.
- [ ] Probar recursos inexistentes y eliminados.
- [ ] Comprobar revisión obsoleta y activación sin evidencia vigente.
- [ ] Probar restricciones de URL y modelo sin realizar conexiones externas innecesarias.
- [ ] Verificar que respuestas de credenciales no exponen claves completas.
- [ ] Cubrir calidad de flashcard fuera de rango.
- [ ] Comprobar eliminación de planes/metas y actualización de revisiones del dashboard.
- [ ] Mantener una colección separada para proveedor real.
- [ ] Generar reportes JSON y JUnit.

**Polling propuesto para mock:**

- Documento: máximo 60 segundos.
- Plan: máximo 120 segundos.
- Intervalo de consulta acotado.
- Repetir únicamente GET mediante `bru.setNextRequest`.
- En `FAILED` o timeout: assertion fallida y ejecución fallida.

El backend actualmente permite ciertas entradas de generación que el nuevo Inicio impedirá. Bruno debe caracterizar el contrato existente; no afirmar que el servidor rechaza documentos no indexados si todavía no lo hace.

**Criterio de salida:** positivos y negativos tienen assertions explícitas; ninguna excepción del runner se confunde con una prueba superada.

## A15. Implementar Playwright del recorrido completo

**Dependencias:** A10–A14.

**Archivos:**

- `frontend/e2e/home-study.spec.ts`
- `frontend/e2e/returning-user.spec.ts`
- `frontend/e2e/resource-management.spec.ts`
- `frontend/e2e/fixtures.ts`

### Recorrido de primera visita

- [ ] Abrir `/` con un entorno nuevo.
- [ ] Ver propósito y proveedor demo.
- [ ] Subir el Markdown por el control visible.
- [ ] Esperar `INDEXED`.
- [ ] Seleccionar plantilla.
- [ ] Pulsar «Estudiar».
- [ ] Comprobar IDs y número de POST de creación/generación.
- [ ] Esperar plan `READY` y sesiones reales.
- [ ] Abrir sesión y verificar material.
- [ ] Recorrer estudio y receso utilizando las acciones existentes.
- [ ] Responder quiz.
- [ ] Verificar resultado, estado `COMPLETED` y dashboard.
- [ ] Recargar y comprobar persistencia del estado confirmado.

### Regreso

- [ ] Volver a Inicio.
- [ ] Acceder a un plan previo.
- [ ] Abrir cada sesión del plan, incluida la completada.
- [ ] Confirmar que no se crean documentos, metas o planes por regresar.
- [ ] Probar navegación directa y botón Atrás.

### Gestión completa

- [ ] Subir varios documentos.
- [ ] Crear, editar y eliminar meta.
- [ ] Generar desde `/plan`.
- [ ] Borrar plan y verificar actualización de vistas.

**Reglas:** selectores por rol/etiqueta; esperas por estado; reloj de Playwright para pruebas temporales; sin esperas reales de 25 minutos.

**Criterio de salida:** recorrido principal con frontend, API y persistencia reales; el LLM determinista está en el servidor, no sustituido por respuestas falsas del navegador.

## A16. Implementar Playwright de fallos y configuración

**Dependencias:** A15.

**Archivos:** `frontend/e2e/error-recovery.spec.ts`, `frontend/e2e/provider-setup.spec.ts`.

- [ ] Simular consulta fallida y recuperación sin mostrar “sin datos”.
- [ ] Mantener datos anteriores durante fallo de refetch.
- [ ] Mantener documentos pendientes sin habilitar generación.
- [ ] Mostrar indexación fallida y permitir una acción adecuada.
- [ ] Cubrir generación fallida y estado incierto tras perder una respuesta.
- [ ] Recargar durante `PROCESSING` sin repetir generación.
- [ ] Probar doble clic.
- [ ] Interrumpir el envío de quiz y comprobar que no aparece éxito.
- [ ] Probar credenciales con revisión obsoleta y runtime que cambia desde otra pestaña.
- [ ] Cubrir `MOCK`, `ENV`, `USER`, Ollama y restricciones NVIDIA mediante escenarios controlados.
- [ ] Ejecutar una prueba separada contra un proveedor real configurado desde Inicio.

**Distinción de evidencias:**

- Los errores inducidos con `page.route` demuestran comportamiento de la UI.
- Bruno y backend verifican el contrato y sus efectos.
- La aceptación de proveedor real requiere un servidor que efectivamente lo verifique y active.

Para claves reales, desactivar trazas y registros de cuerpos sensibles. Omitir una prueba por falta de credenciales debe registrarse como **pendiente/bloqueada**, no aprobada.

## A17. Verificar responsive, accesibilidad y paridad con Penpot

**Dependencias:** A05–A16.

**Archivos:** `responsive.spec.ts`, `accessibility.spec.ts`, `visual.spec.ts`.

### Matriz de tamaños

| Tamaño | Revisión |
|---|---|
| 320 px | Reflow y ausencia de desbordamiento global |
| 375 px | Recorrido móvil completo |
| 768 px | Tablet |
| 1024 px | Cambio de distribución |
| 1240 × 790 | Comparación con tableros desktop actuales |
| 1440 px | Escritorio amplio |
| 1920 px o superior | Máximo de contenido y lectura |

- [ ] Probar todas las rutas con contenido corto y largo.
- [ ] Capturar estados de carga, vacío, error y éxito donde correspondan.
- [ ] Verificar teclado, foco visible, foco no oculto y controles con nombre.
- [ ] Revisar movimiento reducido.
- [ ] Comprobar zoom real al 200 %; cambiar `deviceScaleFactor` no sustituye esta prueba.
- [ ] Realizar recorrido con lector de pantalla en navegación, subida, quiz y configuración.
- [ ] Validar contraste en combinaciones finales de texto y controles.
- [ ] Comprobar que bloques largos no generan desbordamiento de toda la página.
- [ ] Comparar capturas con Penpot a dimensiones equivalentes.
- [ ] Normalizar colores, unidades y tipografía antes del informe DRIFT.
- [ ] Clasificar diferencias en `match`, `drift`, `design-only` y `code-only`.
- [ ] Registrar token, delta, gravedad y corrección para cada diferencia.
- [ ] Aprobar explícitamente las primeras imágenes de referencia; no aceptar snapshots automáticamente para hacer pasar la suite.

**Entregables:**

- `docs/frontend-integration/drift-report.md`
- Matriz de estados diseño/código.
- Evidencia Playwright.
- Registro manual de accesibilidad.

**Criterio de salida:** ninguna diferencia crítica abierta; las diferencias mayores se corrigen o quedan aprobadas con justificación.

## A18. Revisar rendimiento, documentación y aceptación final

**Dependencias:** todas las anteriores.

- [ ] Comparar bundle y comportamiento con A02.
- [ ] Evaluar `React.lazy`/`Suspense` para Dashboard y Sesión cuando reduzca el coste de Inicio.
- [ ] Mantener consultas independientes en paralelo.
- [ ] Evitar duplicar peticiones y estado derivado.
- [ ] Comprobar que el temporizador no provoca renders costosos de todo el material.
- [ ] Aplicar las reglas React compatibles con React 18; no introducir APIs de React 19, Next.js o SWR por copiar ejemplos de la skill.
- [ ] Revisar carga de fuentes y estabilidad visual.
- [ ] Medir LCP/CLS en condiciones reproducibles; registrar interacciones de laboratorio sin presentarlas como INP de campo.
- [ ] Mantener como objetivos LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1; documentar qué pudo medirse realmente.
- [ ] Documentar las cabeceras necesarias para el hosting elegido y verificarlas allí cuando exista ese entorno.
- [ ] Actualizar README, guía de pruebas y estado del proyecto.
- [ ] Mantener `docs/api_contract.yaml` sincronizado si se aprueba alguna modificación de contrato.
- [ ] Ejecutar todas las verificaciones finales sobre el mismo estado del código.
- [ ] Revisar diff, evidencias y matriz de aceptación.
- [ ] Registrar incidencias remanentes y su impacto.

**Criterio de salida:** cada requisito tiene prueba o evidencia identificable y no quedan bloqueantes ocultos.

## 6. Comandos previstos de verificación

Los scripts `test:*` adicionales se crearán en A03.

### Frontend — desde `frontend/`

```bash
npm run lint
npm test
npm run build
npm run test:qa:types
npm run test:api
npm run test:e2e
npm run test:qa
```

`test:qa` deberá ejecutar Bruno y Playwright con entornos aislados y propagar cualquier código de fallo.

### Backend — desde `backend/`

```bash
python -m pytest -q
```

### Bruno directo — desde `frontend/bruno/`

Con el entorno QA ya levantado y el directorio de reportes preparado:

```bash
bru run smoke -r \
  --env qa \
  --sandbox safe \
  --delay 500 \
  --reporter-json ../qa-results/bruno-smoke.json \
  --reporter-junit ../qa-results/bruno-smoke.xml \
  --reporter-skip-all-headers \
  --reporter-skip-body
```

Los flags anteriores están disponibles en la CLI 4.2.0 consultada. La ejecución cotidiana recomendada será mediante `npm run test:api`, para asegurar aislamiento, versión fijada y limpieza.

### Política de evidencias

Cada ejecución debe registrar:

- Commit o referencia del estado probado.
- Versiones de herramientas.
- Perfil de entorno y proveedor.
- Comando y código de salida.
- Pruebas aprobadas, fallidas y omitidas.
- Reportes y capturas relevantes.
- Limitaciones concretas.

Un reporte generado o un proceso terminado no equivale por sí solo a pruebas aprobadas.

## 7. Matriz final de aceptación

| Requisito | Evidencia mínima |
|---|---|
| Inicio explica producto y siguiente paso | Revisión de contenido + `HomePage.test.tsx` + Playwright |
| Subida, meta y proveedor en el mismo recorrido | E2E desde `/` |
| Solo documentos indexados | Tests del selector/coordinador + escenario E2E pendiente/fallido |
| Espera real del plan | Bruno `202 → READY` + Playwright |
| Prevención de doble operación | Tests del coordinador + conteo de POST + recuperación |
| Regreso sin onboarding obligatorio | E2E de usuario recurrente |
| Todas las sesiones accesibles | Comparación con IDs reales del plan, incluidas completadas |
| Configuración segura reutilizada | Tests existentes y nuevos + Bruno + prueba de proveedor real |
| Resultado de quiz confirmado | Test de componente + E2E + consulta posterior del servidor |
| Progreso consistente | Bruno y Playwright tras completar y borrar |
| Error distinguible de vacío | Tests de consultas + fallos inducidos |
| Responsive y teclado | Matriz de viewports y recorridos accesibles |
| Correspondencia con Penpot | Capturas emparejadas e informe DRIFT |
| Demo sin claves | Ejecución aislada con runtime `MOCK` |
| Calidad técnica | Typecheck, Vitest, build, pytest, Bruno y Playwright |
| Rendimiento | Comparación baseline/final con método documentado |

### Condiciones que bloquearían la aceptación

- Éxito mostrado antes de confirmación del servidor.
- Duplicados silenciosos provocados por el flujo de la UI.
- Pérdida de acceso a planes o sesiones existentes.
- Configuración que omite verificación o utiliza una revisión incorrecta.
- Claves expuestas en interfaz, almacenamiento o evidencias.
- Recorrido principal inaccesible en móvil o con teclado.
- Pruebas fallidas, omitidas o simuladas presentadas como validación completa.

## 8. Dos decisiones para aprobar antes de implementar

1. **Entrada a la sesión:** se propone mostrar al llegar a `READY` un botón para la primera sesión pendiente y otro para ver todas, en lugar de redirigir automáticamente.
2. **Idempotencia:** se propone comenzar con protección y recuperación frontend, dejando documentado su alcance. Si se requiere garantía estricta ante concurrencia y respuestas perdidas, debe aprobarse una actividad backend adicional antes de considerar satisfecho ese requisito.

La secuencia recomendada es **aprobar esas dos decisiones, cerrar el handoff de Penpot y ejecutar E0**. Así, la primera modificación del recorrido de estudio ya tendrá una base de pruebas y contratos con la que detectar regresiones.
