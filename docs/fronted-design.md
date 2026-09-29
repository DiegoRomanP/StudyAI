# Plan de diseño y consolidación del frontend de StudyAI

> **Estado: propuesta, no implementada.** Este documento define el trabajo futuro; no describe funcionalidades ya entregadas. Se conserva el nombre `fronted-design.md` solicitado. Diagnóstico basado en el código actual de `frontend/` y en `AGENTS.md` (septiembre de 2026).

## 1. Meta y alcance

Una persona que entra por primera vez debe entender **qué hace StudyAI y qué puede hacer con él** sin tener que descubrirlo visitando cada sección: subir material propio, elegir una meta de estudio, configurar opcionalmente un modelo de IA real, generar un plan, estudiar sus sesiones, responder quizzes y consultar su progreso. Desde una **pantalla de inicio unificada** debe poder subir documentos, elegir una **plantilla de meta**, conocer el proveedor efectivo y, si elige un proveedor remoto propio, configurar allí su clave mediante los pasos de seguridad existentes. Un botón principal **«Estudiar»** la acompaña hasta sus sesiones sin obligarla a pasar manualmente por Documentos → Metas → Configuración → Plan. Esto también debe funcionar en móvil y con el proveedor mock sin API key.

El camino corto **no reemplaza** la experiencia completa: una persona que quiera más control puede seguir entrando en Documentos, Metas, Configuración, Planes, Dashboard y el detalle de **todas** las sesiones generadas por cada plan, incluidas las completadas. Al volver a la aplicación, debe encontrar sus recursos y poder acceder al plan y a sus sesiones existentes sin repetir el onboarding ni crear otro plan innecesariamente. La interfaz debe facilitar lectura y concentración, no competir visualmente con el contenido.

**Criterios de aceptación del proyecto de implementación (no de este documento):**

1. En la primera vista se entienden propósito, utilidades y siguiente paso; se puede cargar material, escoger una plantilla de meta y conocer/configurar el proveedor **en el mismo recorrido**, sin mandar al usuario a otra sección para completar el primer uso. La API key se explica como necesaria para **un proveedor remoto propio**, no como requisito del modo mock, de Ollama ni de un proveedor efectivo ya configurado desde el entorno.
2. «Estudiar» guarda o reutiliza una meta real, utiliza documentos `INDEXED`, inicia la generación del plan y comunica `PROCESSING` hasta que exista un plan `READY` con sesiones; solo entonces lleva a una sesión o permite elegir entre ellas. No presenta una sesión inexistente como lista ni duplica operaciones al reintentar.
3. Todas las rutas principales y las sesiones ya generadas siguen accesibles en móvil, tablet y escritorio, con teclado y foco visible; no hay desbordamiento horizontal a 320 px ni a 200 % de zoom. Una persona que vuelve puede acceder al plan y a cualquiera de sus sesiones, incluso completadas.
4. Cada consulta y acción crítica presenta estados distinguibles de carga, vacío, error recuperable y éxito donde corresponde. Un error de red nunca se presenta como «sin datos».
5. El flujo completo funciona con el proveedor mock, sin clave, y conserva las operaciones actuales de documentos, metas, planes, sesiones, dashboard y configuración LLM; los textos, el contraste y los controles apuntan a **WCAG 2.2 AA** en recorridos críticos.
6. El frontend sigue usando React 18 + TypeScript + Vite + Tailwind 3, el cliente Axios tipado, TanStack Query y las rutas existentes; se añade solo la superficie de entrada necesaria. No se migra a SSR ni se añaden herramientas solo por figurar en una lista.

**Límites:** este plan no implementa autenticación, pagos, endpoints nuevos ni persistencia de progreso adicional. Las sesiones son registros existentes de los planes; conservar su acceso **no** significa poder reanudar exactamente el temporizador, receso o quiz si esa fase local no se persiste. La app es hoy una SPA con usuario demo `id=1`; cualquier estrategia de cookies `HttpOnly` requiere un proyecto separado de autenticación y cambios de servidor. Seguridad de cabeceras, analítica y despliegue se coordinan con backend/hosting, no se simulan desde React.

## 2. Diagnóstico de la superficie actual

| Área | Evidencia en el repositorio | Acción a planificar |
| --- | --- | --- |
| Primer contacto | `src/App.tsx` redirige `/` a `/documents`; la primera pantalla explica la subida, pero no reúne meta, proveedor, plan y sesiones. | Proponer una ruta de inicio orientada a la tarea, con propósito, utilidades y un recorrido compacto hasta «Estudiar»; conservar las rutas especializadas. |
| Camino a sesiones | `GoalsPage.tsx` ofrece tres plantillas que **rellenan** un formulario; hay que guardar la meta antes de usarla. `PlanPage.tsx` pide seleccionar una meta y documentos indexados; `PlanDetailPage.tsx` muestra las sesiones cuando el plan está listo. | Reutilizar los hooks/API existentes en la entrada: guardar o reutilizar meta, esperar indexación, generar el plan, seguir `PROCESSING` y conducir al detalle/una sesión `READY` sin pasos entre páginas impuestos al usuario. |
| Regreso y profundidad | La lista de planes lleva a `/plan/:planId`, que muestra todas las sesiones y sus enlaces `/session/:sessionId`; el dashboard resume progreso, no reemplaza el historial de planes. | Mostrar una vía de continuación desde el inicio y conservar acceso a todos los planes/sesiones, incluidas completadas, y a controles de gestión en sus vistas completas. No inventar reanudación de fases locales. |
| Navegación | `src/components/AppShell.tsx` oculta el único `<nav>` bajo `md` (`hidden ... md:flex`). | Dar acceso móvil a las cinco secciones y ofrecer «saltar al contenido»; conservar indicadores de ruta activa. |
| Estados de datos | `DocumentsPage`, `GoalsPage`, `PlanPage`, `DashboardPage`, `PlanDetailPage` y `SessionPage` usan spinners y/o ramas `!data` sin tratar sistemáticamente `isError`. `SettingsPage` ya tiene error y reintento para cargas principales. | Reutilizar estados `loading / empty / error / ready` sin borrar datos útiles ni duplicar peticiones. |
| Flujos | El recorrido existente está en `App.tsx`, `pages/*` y `hooks/queries.ts`; ingesta y generación son asíncronas, con polling al consultar documentos pendientes y detalle de plan en proceso. | Mantener los estados reales `PENDING / INDEXED / FAILED` y `PROCESSING / READY / FAILED`; no inventar porcentaje de servidor. `PlanDetailPage` muestra hoy una barra fija de 60 % durante generación. |
| Accesibilidad | El área de subida en `DocumentsPage.tsx` y la tarjeta de voltear en `SessionPage.tsx` usan `<div onClick>`; campos con `<label>` sin asociación `htmlFor`; botones de puntuación son pequeños. | Convertir acciones a controles nativos, asociar etiquetas, exponer estados/foco y aumentar áreas táctiles. |
| Composición visual | `tailwind.config.js` define violeta de marca; `index.css` apenas añade estilos de lectura; `components/ui.tsx` repite tarjeta con borde/sombra y spinner genérico. | Sustituir gradualmente por tokens semánticos y jerarquía de superficies, priorizando lectura y acciones. |
| Contratos y riesgo funcional | `useGeneratePlan()` adapta `{ goalId, documentIds }` a `api.generatePlan(goalId, documentIds)`; el flujo compacto necesitará coordinar subida, creación de meta y generación sin duplicar mutaciones. | Cubrir contrato y transiciones con tests antes de rediseñar el inicio. `SettingsPage` ya prueba revisiones de credenciales y conflictos: no simplificar esa secuencia. |
| Pruebas | `src/__tests__/SettingsPage.test.tsx` y `src/api/errors.test.ts` cubren configuración y mensajes de API; no hay pruebas de componentes para el recorrido de estudio. | Añadir pruebas de comportamiento y E2E del recorrido más valioso en la fase de implementación. |

### Contratos que hay que preservar

- El contenido Markdown de sesión se muestra con `react-markdown`; evitar HTML sin sanitizar y no introducir `dangerouslySetInnerHTML`. Enlaces a YouTube: únicamente búsquedas construidas a partir de palabras clave mediante `lib/youtube.ts`.
- El quiz mezcla flashcards de calidad 0–5 y opción múltiple. La confirmación de envío debe coincidir con la respuesta real del servidor; no afirmar finalización cuando falle la mutación. Revisar por separado la exposición actual de respuestas en `QuizQuestionDTO`, que es un asunto de contrato/backend, no de CSS.
- En Configuración: **guardar clave → guardar borrador de modelo/URL → verificar revisión guardada → activar**. Conservar detección de conflicto 409, estado de fuente `USER / ENV / MOCK`, ausencia de clave para Ollama, y opciones permitidas por catálogo para NVIDIA.
- El inicio debe mostrar el proveedor **efectivo** desde el API, no adivinarlo por el modelo seleccionado ni solicitar una API key si la persona usa el mock, Ollama o una configuración efectiva ya disponible. Si quiere configurar un proveedor remoto propio durante el primer uso, ofrecer el flujo guiado **dentro del inicio**, reutilizando las mutaciones existentes en el orden guardar clave → guardar borrador de modelo/URL → verificar revisión → activar; nunca exponer la clave ni simular su activación. Configuración sigue disponible como vista completa avanzada, pero no debe ser un paso obligatorio del primer recorrido.
- Las plantillas de meta no son metas persistidas hasta que el servidor confirma su creación. En «Estudiar», no generar con documentos `PENDING`/`FAILED`; no anunciar éxito por recibir solo un plan `PROCESSING`. La lista de sesiones pertenece al plan real y debe seguir disponible desde su detalle, incluso cuando ya hayan sido completadas.
- Una eliminación de meta puede eliminar también sus planes. Mantener aviso del alcance destructivo y el invalidado de caché de las queries afectadas.

## 3. Dirección visual propuesta: «mesa de estudio clara»

La identidad debe evocar un cuaderno de trabajo organizado, no un panel de «IA» con brillos. **Una sola nota de color para la acción**, tinta de alto contraste para lectura y superficies claras para distinguir material, formularios y progreso. El rasgo distintivo es la **columna de lectura** en la sesión, con navegación y temporizador subordinados al texto; no una cuadrícula de tarjetas idénticas.

En el **inicio**, la jerarquía no es «una gran zona de subida» ni un escaparate de tarjetas: primero una frase breve de propósito y mapa de utilidades, después el bloque de preparación (material, meta de plantilla, proveedor efectivo y configuración guiada de clave solo si se elige un proveedor remoto propio) y una sola acción contextual «Estudiar». Debajo, acceso secundario a planes/sesiones existentes y a las secciones detalladas. Si la persona ya tiene un plan, su siguiente acción puede ser entrar en una sesión de ese plan sin volver a subir o generar material. No duplicar el mismo formulario completo en todas las páginas.

| Token candidato | Valor | Uso previsto |
| --- | --- | --- |
| Fondo `canvas` | `#F5F7F6` | Marco general gris verdoso, sin gradientes decorativos. |
| Superficie `paper` | `#FFFFFF` | Material de estudio, formularios y estados destacados. |
| Texto `ink` | `#182B31` | Encabezados y lectura. |
| Texto `muted` | `#4C6268` | Metadatos y ayuda, nunca información crítica aislada. |
| Acción `action` / `action-hover` | `#126C63` / `#0C514B` | Botón principal, enlace, ruta activa, foco. |
| Borde `line` | `#D4E0DC` | Separación ligera, sin sombra uniforme en todas las tarjetas. |
| Estados | éxito `#176C4A`, aviso `#8A5A12`, error `#A52F33` | Siempre con texto/ícono, no solo color. |

Contraste calculado de muestras iniciales: `ink` sobre `canvas` **13,66:1**, `muted` sobre `canvas` **6,00:1**, `action` sobre blanco **6,27:1**, blanco sobre `action` **6,27:1**. **Son candidatos**, no una validación completa: comprobar cada combinación final de texto, estados, enlaces, bordes, foco y deshabilitados sobre su fondo real (texto normal ≥ 4,5:1; texto grande y controles no textuales ≥ 3:1 cuando aplique).

- **Tipografía:** IBM Plex Sans para navegación, UI y cifras tabulares; Source Serif 4 solo para cuerpos largos de material de estudio si una prueba de lectura lo favorece. Autohospedar fuentes recortadas o usar fallback del sistema según presupuesto de carga, no bloquear la primera pintura por fuentes externas.
- **Escala y ritmo:** base de 1 rem, espaciado progresivo `0.5 / 0.75 / 1 / 1.5 / 2 / 3 rem`, títulos `clamp()` con líneas contenidas, altura de línea de lectura ~1,6; columna de material de 65–75 caracteres. No convertir todas las vistas en una columna estrecha: formularios y métricas necesitan anchos distintos.
- **Superficies y controles:** fondo tenue + separadores donde baste; reservar superficies elevadas para tareas o alertas. Botón principal solo para la siguiente acción, secundario y texto para las demás; áreas táctiles objetivo de ~44 × 44 CSS px. Foco visible con `:focus-visible`, estados hover/pressed discretos y `prefers-reduced-motion` respetado.
- **Iconografía:** sustituir emojis de navegación y controles por iconos SVG coherentes o etiquetas de texto. No añadir paquete de iconos si bastan activos pequeños propios. No usar animaciones automáticas en el material de lectura.

### Jerarquía y adaptación

```text
Inicio móvil (320–767 px)             Inicio escritorio ancho (≥ 1024 px)
┌ marca · menú accesible ┐            ┌ navegación ┬ propósito + utilidades       ┐
│ propósito + utilidades  │            │ secciones  │ material · meta · proveedor  │
│ material · estado       │            │            │ Estudiar + estado real       │
│ plantilla de meta       │            │            │ planes / sesiones existentes │
│ proveedor / clave opc.  │            └────────────┴─────────────────────────────┘
│ Estudiar · estado real  │
│ planes / sesiones       │
└─────────────────────────┘
```

La disposición compacta reúne las decisiones **en una misma superficie y contexto**, no exige forzar todo en un solo viewport móvil. Un CTA deshabilitado explica qué requisito falta; los estados `PENDING`/`PROCESSING` comunican espera y mantienen orientación. Las listas completas, acciones de gestión y material largo viven en rutas dedicadas y son siempre alcanzables desde el inicio y la navegación.

Mobile first: navegación móvil operable mediante botón y panel con cierre, foco gestionado y nombre de ruta activa; en tablet mostrar más espacio sin esconder acciones; en escritorio conservar una navegación persistente (ajustada, no una nueva IA). Contenedor de hasta ~72 rem para paneles, lectura individual mucho más acotada; Grid para regiones, Flexbox para grupos pequeños, `minmax(0, 1fr)` y `min-width: 0` para títulos/URLs largos. Probar 320/375, 768, 1024, 1440 px y ultrawide con máximo de contenido, orientación y 200 % de zoom; evitar `100vh` fijo y respetar zonas seguras móviles cuando exista UI fija.

## 4. Plan de implementación por entregas

Cada fase debe ser una revisión pequeña, con pruebas antes de la siguiente; no se realiza ninguna aquí.

### Fase 0 — Línea base y riesgos funcionales

- Recorrer con datos mock y API demo el primer uso **actual** (`/` → `/documents` → `/goals` → `/plan` → sesiones) y el regreso con planes previos; registrar capturas móvil/escritorio, saltos entre páginas, errores de consola y posibilidad de acceder a sesiones completadas. Medir bundle y LCP/INP/CLS de referencia en entorno representativo.
- Añadir una prueba del contrato `useGeneratePlan` → `api.generatePlan` para meta y documentos seleccionados, y pruebas de los pasos reales del futuro CTA (subida, meta guardada, plan `PROCESSING` → `READY`, error, evitar doble envío). No presuponer un desacople ya corregido.
- Inventariar error/carga/vacío/éxito por ruta y acordar alcance de mejoras de quiz y de autenticación que dependan del backend.
- **Salida:** línea base reproducible, pruebas del flujo actual y backlog priorizado, sin cambios de marca todavía.

### Fase 1 — Navegación y accesibilidad fundamentales

- `AppShell.tsx` y `App.tsx`: menú móvil accesible, enlace «Saltar al contenido», landmarks y títulos jerárquicos, indicación de ruta actual, 404 útil con vuelta al nuevo inicio en vez de redirección silenciosa. Dar al inicio su propia ruta `/` sin retirar `/documents`, `/goals`, `/plan`, `/plan/:planId`, `/session/:sessionId`, `/dashboard` ni `/settings`.
- `DocumentsPage.tsx`, `GoalsPage.tsx`, `PlanPage.tsx`, `SessionPage.tsx`, `SettingsPage.tsx`: controles nativos y etiquetas asociadas, errores anunciables, foco tras acciones importantes, confirmaciones accesibles para borrados sin perder la información sobre consecuencias.
- Asegurar navegación de subida sin arrastre, voltear flashcard con Enter/Espacio y selección de calidad legible para lectores de pantalla; no depender de hover ni solo del color.
- **Salida:** recorrido crítico utilizable con teclado y pantalla estrecha, probado con Testing Library y revisión manual de tecnologías de apoyo.

### Fase 2 — Sistema visual y estados reutilizables

- `tailwind.config.js`, `index.css` y `components/ui.tsx`: tokens semánticos de color, tipografía, espaciado, controles, avisos, estados de carga/vacío/error. Presentación reutilizable sin introducir un «design system» complejo ni mezclar lógica de negocio en UI.
- `pages/*`: diferenciar carga inicial con skeleton de layout reservado, vacío con siguiente acción relevante, fallo con descripción y `refetch`/reintento contextual, éxito solo tras respuesta confirmada. Polling existente se conserva; durante `PROCESSING` indicar actividad indeterminada (retirar el 60 % ficticio si la API no da progreso).
- Comprobar casos concretos: documentos rechazados o fallidos, meta sin título, sin metas/documentos indexados, plan fallido, quiz vacío o envío fallido, runtime desconocido y revisión de configuración en conflicto. En el inicio, distinguir con claridad «documento subido» de `INDEXED` y «plan solicitado» de `READY`.
- **Salida:** lenguaje visual coherente aplicado a todas las rutas sin borrar contenido en refetch ni ocultar errores con estado vacío.

### Fase 3 — Camino corto de inicio y pantallas de profundidad

- **Inicio `/`:** explicar en una lectura qué hace StudyAI y para qué sirven documentos, metas, proveedor, plan, sesiones/quiz y progreso. Reunir subida de documentos, elección entre las tres plantillas existentes y estado del proveedor efectivo. Si se opta por un proveedor remoto propio, desplegar una configuración contextual y progresiva en esta misma superficie, reutilizando catálogo/runtime y las mutaciones seguras de Configuración (guardar clave, guardar modelo/URL, verificar revisión, activar) con manejo de 409 y errores; no crear una ruta de almacenamiento nueva ni conservar claves en `localStorage` o mostrarlas después de guardarlas. «Estudiar» guarda la meta escogida o usa una existente, genera el plan solo cuando se cumplen requisitos, muestra espera/errores y conduce a las sesiones cuando el plan es `READY`. Evitar generación duplicada por doble clic, refresh o retorno.
- **Regreso al inicio:** mostrar accesos a planes/sesiones existentes y orientar a una siguiente sesión según estados reales, sin obligar a repetir preparación ni ocultar planes anteriores. Si no hay señal suficiente para identificar la «siguiente», ofrecer elección en el detalle del plan sin inventar progreso.
- **Documentos / Metas:** mantener las vistas completas, carga múltiple, edición/eliminación e historial, con entrada de ida y vuelta desde el inicio. Validación temprana de extensión/tamaño y texto vacío, respetando siempre validación del servidor. La plantilla rellena una meta, no es una meta ya creada.
- **Plan / Detalle:** distinguir selección de meta y documentos, generación en curso, fallo con enlace a Configuración cuando proceda y lista **completa** de sesiones (pendientes y completadas), cada una con enlace estable a su detalle. Mantener datos y estados de API tal cual; no inventar reintento o recuperación sin contrato ni reemplazar planes antiguos al usar el CTA compacto.
- **Sesión:** priorizar material, temporizador, receso, quiz y resultado; botones separables en móvil y feedback de envío. Unir visualmente progreso de preguntas sin mover lógica de temporizador al componente de presentación.
- **Dashboard / Configuración:** resumen comprensible incluso sin datos; gráfico con equivalente textual o tabla para lectura sin visión de color, etiquetas y fechas legibles; jerarquizar la fuente LLM efectiva y sus pasos sin omitir verificación, conflictos ni seguridad de la clave. En el inicio explicar que una API key propia habilita un proveedor remoto, pero **mock sin clave y Ollama sin clave** siguen siendo opciones válidas; los cuatro pasos de activación se reutilizan allí solo si el usuario decide configurarlo, mientras Configuración conserva todos los controles avanzados.
- **Salida:** pruebas de integración de flujos, capturas comparadas y aprobación de lectura/navegación en dispositivos reales o emulados.

### Fase 4 — Rendimiento, seguridad y mantenimiento

- Separar rutas con `React.lazy`/`Suspense` donde el análisis de bundle muestre beneficio; examinar especialmente Recharts en Dashboard y Markdown en Sesión. Evitar precargar toda la app o partir módulos diminutos innecesariamente.
- Reservar dimensiones de cualquier imagen o gráfico nuevo, minimizar JS en primera visita y evitar tareas largas al interactuar. SPA/CSR sigue siendo adecuada para el producto demo de usuario único, sin requisito de SEO de contenido; **SSR/SSG solo con necesidad demostrada**.
- Revisar renderizado Markdown y destinos externos; nunca mostrar HTML no saneado ni claves completas. Definir CSP (`script-src`, `connect-src`, `img-src`, `font-src`, etc.) compatible con Vite en producción y protección anti-clickjacking mediante cabeceras **del servidor/proxy** (`frame-ancestors`, y según compatibilidad `X-Frame-Options`), después de inventariar orígenes; no prometer que un componente React las aplica.
- Si se incorpora autenticación real: diseño de sesiones/cookies `HttpOnly`, `Secure`, `SameSite` y CSRF junto al backend; no guardar tokens en `localStorage` ni fingir login en la UI actual.
- Evaluar ESLint y Prettier con reglas acordadas y mínimo ruido, y hooks de pre-commit solo si el equipo quiere ese flujo; hoy `npm run lint` ejecuta `tsc --noEmit`, **no ESLint**. Proponer Sentry/telemetría solo tras definir alojamiento, consentimiento/privacidad, filtrado de secretos y finalidad; no registrar claves, prompts ni materiales de estudio.
- **Salida:** medidas antes/después, configuración de despliegue revisada y documentación actualizada al implementar; no añadir dependencias hasta justificar coste/beneficio.

## 5. Verificación y definición de terminado

| Meta | Evidencia requerida en la implementación |
| --- | --- |
| Resultado funcional | E2E desde `/`, sin navegar manualmente a cuatro secciones: subir `.md` demo → esperar `INDEXED` → elegir plantilla → «Estudiar» (guardar meta si falta) → plan `PROCESSING` → `READY` → una sesión → estudio/receso/quiz → resultado/dashboard. Repetir con proveedor remoto propio configurado **en el inicio** (borrador, verificación y activación reales) y en modo mock sin clave; comprobar fallo de subida/indexación/generación, API caída y doble clic sin crear metas/planes duplicados. Al volver, abrir un plan previo y **cada** sesión generada (incluida completada) desde su detalle, además de poder seguir gestionando documentos, metas y configuración desde las rutas completas. No se almacenan respuestas ficticias ni se promete reanudar fases no persistidas. |
| Facilidad de uso | Prueba sin instrucciones: en la primera vista identificar qué hace la app y localizar material, plantilla de meta, proveedor y «Estudiar»; llegar a una sesión sin saltos de página obligatorios y saber por qué aún no se puede estudiar. En el regreso, localizar un plan previo y elegir cualquier sesión sin repetir el onboarding. Mensajes claros en vacío, espera, error y éxito; probar menú, scroll y selección de documentos en 320/375/768/1440 px. |
| Diseño visual | Capturas de todas las rutas y cuatro estados de UI con datos reales/demo; contraste validado en contexto, legibilidad de Markdown, textos largos y modo de zoom. |
| Accesibilidad | Recorrido solo con Tab/Shift+Tab/Enter/Espacio, foco visible/no tapado, nombres/roles/estados accesibles, zoom 200 %, movimiento reducido y lector de pantalla en navegación, subida, quiz y configuración. Objetivo WCAG 2.2 AA sin afirmar certificación automática. |
| Calidad técnica | Vitest + Testing Library para transiciones de inicio, guardas `INDEXED`/`READY`, operaciones únicas, regreso con historial, errores/contrato/estados (mantener pruebas existentes de SettingsPage); E2E Playwright o equivalente tras decidir infraestructura; `npm run lint`, `npm test`, `npm run build` **desde `frontend/`**. Ninguna nueva advertencia de typecheck ni regresión en demo. |
| Rendimiento | Medir en dispositivo/red reproducibles y en campo si hay tráfico: percentil 75 de **LCP ≤ 2,5 s**, **INP ≤ 200 ms**, **CLS ≤ 0,1** como objetivos de Web Vitals; registrar baseline, método, entorno y comparación antes/después. No confundir métrica de laboratorio sin INP real con medición de campo. |

## 6. Decisiones antes de ejecutar

1. **Prioridad ya aclarada por la historia de usuario:** primero resolver el inicio unificado y el acceso rápido al estudio; en paralelo conservar las vistas profundas y todas las sesiones para uso avanzado y regreso. Validar con usuarios dónde ubicar el historial/continuación y si la acción de entrada al estar `READY` debe abrir la primera sesión pendiente o presentar elección; no borrar ni esconder alternativas mientras se decide.
2. Validar prototipo del nuevo inicio y la «mesa de estudio clara» (paleta y dos estilos tipográficos) tanto en primera visita como con planes existentes antes de extenderlo; si dificulta encontrar el CTA, la lista de sesiones o leer material largo, revisarlo sin perder el camino corto.
3. Acordar entorno de despliegue y presupuesto de performance para CSP/observabilidad; fijar si se necesita auténtico E2E en CI y qué datos demo utilizará. Estas decisiones no bloquean las fases 0–2.

**Priorización:** explicar la app y despejar el recorrido de inicio → sesiones sin perder rutas profundas es la meta de producto; navegación móvil, estados reales, errores y accesibilidad son bloqueantes de ese recorrido. Identidad visual y pulido de las demás pantallas siguen inmediatamente; herramientas nuevas, SSR, autenticación y monitoreo son decisiones independientes basadas en necesidad, no requisitos implícitos de este diseño.
