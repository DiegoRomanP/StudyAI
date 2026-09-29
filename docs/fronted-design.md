# Plan de diseño y consolidación del frontend de StudyAI

> **Estado: propuesta, no implementada.** Este documento define el trabajo futuro; no describe funcionalidades ya entregadas. Se conserva el nombre `fronted-design.md` solicitado. Diagnóstico basado en el código actual de `frontend/` y en `AGENTS.md` (septiembre de 2026).

## 1. Meta y alcance

Una persona que entra por primera vez debe poder **subir material → crear una meta → generar un plan → estudiar y responder un quiz → consultar su progreso**, también desde un móvil, entendiendo qué está pasando y cómo recuperarse de un fallo. La interfaz debe facilitar lectura y concentración, no competir visualmente con el contenido.

**Criterios de aceptación del proyecto de implementación (no de este documento):**

1. Todas las rutas principales son navegables en móvil, tablet y escritorio, con teclado y foco visible; no hay desbordamiento horizontal a 320 px ni a 200 % de zoom.
2. Cada consulta y acción crítica presenta estados distinguibles de carga, vacío, error recuperable y éxito donde corresponde. Un error de red nunca se presenta como «sin datos».
3. El flujo completo funciona con el proveedor mock, sin clave, y conserva las operaciones actuales de documentos, metas, planes, sesiones, dashboard y configuración LLM.
4. Los textos legibles, el contraste y los controles cumplen **WCAG 2.2 AA** en los recorridos críticos; los objetivos medibles de rendimiento se validan, no se presuponen.
5. El frontend sigue usando React 18 + TypeScript + Vite + Tailwind 3, el cliente Axios tipado, TanStack Query y las rutas ya existentes. No se migra a SSR ni se añaden herramientas solo por figurar en una lista.

**Límites:** este plan no implementa autenticación, pagos, endpoints nuevos ni persistencia de progreso adicional. La app es hoy una SPA con usuario demo `id=1`; cualquier estrategia de cookies `HttpOnly` requiere un proyecto separado de autenticación y cambios de servidor. Seguridad de cabeceras, analítica y despliegue se coordinan con backend/hosting, no se simulan desde React.

## 2. Diagnóstico de la superficie actual

| Área | Evidencia en el repositorio | Acción a planificar |
| --- | --- | --- |
| Navegación | `src/components/AppShell.tsx` oculta el único `<nav>` bajo `md` (`hidden ... md:flex`). | Dar acceso móvil a las cinco secciones y ofrecer «saltar al contenido»; conservar indicadores de ruta activa. |
| Estados de datos | `DocumentsPage`, `GoalsPage`, `PlanPage`, `DashboardPage`, `PlanDetailPage` y `SessionPage` usan spinners y/o ramas `!data` sin tratar sistemáticamente `isError`. `SettingsPage` ya tiene error y reintento para cargas principales. | Reutilizar estados `loading / empty / error / ready` sin borrar datos útiles ni duplicar peticiones. |
| Flujos | El recorrido existente está en `App.tsx`, `pages/*` y `hooks/queries.ts`; ingesta y generación son asíncronas, con polling al consultar documentos pendientes y detalle de plan en proceso. | Mantener los estados reales `PENDING / INDEXED / FAILED` y `PROCESSING / READY / FAILED`; no inventar porcentaje de servidor. `PlanDetailPage` muestra hoy una barra fija de 60 % durante generación. |
| Accesibilidad | El área de subida en `DocumentsPage.tsx` y la tarjeta de voltear en `SessionPage.tsx` usan `<div onClick>`; campos con `<label>` sin asociación `htmlFor`; botones de puntuación son pequeños. | Convertir acciones a controles nativos, asociar etiquetas, exponer estados/foco y aumentar áreas táctiles. |
| Composición visual | `tailwind.config.js` define violeta de marca; `index.css` apenas añade estilos de lectura; `components/ui.tsx` repite tarjeta con borde/sombra y spinner genérico. | Sustituir gradualmente por tokens semánticos y jerarquía de superficies, priorizando lectura y acciones. |
| Contratos y riesgo funcional | `useGeneratePlan()` pasa un objeto a `api.generatePlan`, mientras `endpoints.ts` recibe `(goal_id, document_ids)`; debe comprobarse con prueba de integración antes de rediseñar el flujo. | Corregir el desacople si se reproduce; no atribuir el fallo al estilo. `SettingsPage` ya prueba revisiones de credenciales y conflictos: no simplificar esa secuencia. |
| Pruebas | `src/__tests__/SettingsPage.test.tsx` y `src/api/errors.test.ts` cubren configuración y mensajes de API; no hay pruebas de componentes para el recorrido de estudio. | Añadir pruebas de comportamiento y E2E del recorrido más valioso en la fase de implementación. |

### Contratos que hay que preservar

- El contenido Markdown de sesión se muestra con `react-markdown`; evitar HTML sin sanitizar y no introducir `dangerouslySetInnerHTML`. Enlaces a YouTube: únicamente búsquedas construidas a partir de palabras clave mediante `lib/youtube.ts`.
- El quiz mezcla flashcards de calidad 0–5 y opción múltiple. La confirmación de envío debe coincidir con la respuesta real del servidor; no afirmar finalización cuando falle la mutación. Revisar por separado la exposición actual de respuestas en `QuizQuestionDTO`, que es un asunto de contrato/backend, no de CSS.
- En Configuración: **guardar clave → guardar borrador de modelo/URL → verificar revisión guardada → activar**. Conservar detección de conflicto 409, estado de fuente `USER / ENV / MOCK`, ausencia de clave para Ollama, y opciones permitidas por catálogo para NVIDIA.
- Una eliminación de meta puede eliminar también sus planes. Mantener aviso del alcance destructivo y el invalidado de caché de las queries afectadas.

## 3. Dirección visual propuesta: «mesa de estudio clara»

La identidad debe evocar un cuaderno de trabajo organizado, no un panel de «IA» con brillos. **Una sola nota de color para la acción**, tinta de alto contraste para lectura y superficies claras para distinguir material, formularios y progreso. El rasgo distintivo es la **columna de lectura** en la sesión, con navegación y temporizador subordinados al texto; no una cuadrícula de tarjetas idénticas.

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
Móvil (320–767 px)                  Escritorio ancho (≥ 1024 px)
┌ marca · menú accesible ┐          ┌ navegación ┬ contenido, ancho acotado ┐
│ título + contexto       │          │ secciones  │ título + acción principal │
│ siguiente acción        │          │ y estado   │ contenido principal       │
│ contenido / formulario  │          │ demo       │ panel contextual opcional  │
│ estado / ayuda          │          └────────────┴───────────────────────────┘
└─────────────────────────┘
```

Mobile first: navegación móvil operable mediante botón y panel con cierre, foco gestionado y nombre de ruta activa; en tablet mostrar más espacio sin esconder acciones; en escritorio conservar una navegación persistente (ajustada, no una nueva IA). Contenedor de hasta ~72 rem para paneles, lectura individual mucho más acotada; Grid para regiones, Flexbox para grupos pequeños, `minmax(0, 1fr)` y `min-width: 0` para títulos/URLs largos. Probar 320/375, 768, 1024, 1440 px y ultrawide con máximo de contenido, orientación y 200 % de zoom; evitar `100vh` fijo y respetar zonas seguras móviles cuando exista UI fija.

## 4. Plan de implementación por entregas

Cada fase debe ser una revisión pequeña, con pruebas antes de la siguiente; no se realiza ninguna aquí.

### Fase 0 — Línea base y riesgos funcionales

- Recorrer con datos mock y API demo los caminos existentes; registrar capturas móvil/escritorio y errores de consola. Medir bundle y LCP/INP/CLS de referencia en entorno representativo.
- Añadir una prueba del contrato `useGeneratePlan` → `api.generatePlan` para la meta y documentos seleccionados; si confirma el desacople detectado, arreglarlo antes de atribuir fallos al rediseño.
- Inventariar error/carga/vacío/éxito por ruta y acordar alcance de mejoras de quiz y de autenticación que dependan del backend.
- **Salida:** línea base reproducible, pruebas del flujo actual y backlog priorizado, sin cambios de marca todavía.

### Fase 1 — Navegación y accesibilidad fundamentales

- `AppShell.tsx` y `App.tsx`: menú móvil accesible, enlace «Saltar al contenido», landmarks y títulos jerárquicos, indicación de ruta actual, 404 útil con vuelta a Documentos en vez de redirección silenciosa.
- `DocumentsPage.tsx`, `GoalsPage.tsx`, `PlanPage.tsx`, `SessionPage.tsx`, `SettingsPage.tsx`: controles nativos y etiquetas asociadas, errores anunciables, foco tras acciones importantes, confirmaciones accesibles para borrados sin perder la información sobre consecuencias.
- Asegurar navegación de subida sin arrastre, voltear flashcard con Enter/Espacio y selección de calidad legible para lectores de pantalla; no depender de hover ni solo del color.
- **Salida:** recorrido crítico utilizable con teclado y pantalla estrecha, probado con Testing Library y revisión manual de tecnologías de apoyo.

### Fase 2 — Sistema visual y estados reutilizables

- `tailwind.config.js`, `index.css` y `components/ui.tsx`: tokens semánticos de color, tipografía, espaciado, controles, avisos, estados de carga/vacío/error. Presentación reutilizable sin introducir un «design system» complejo ni mezclar lógica de negocio en UI.
- `pages/*`: diferenciar carga inicial con skeleton de layout reservado, vacío con siguiente acción relevante, fallo con descripción y `refetch`/reintento contextual, éxito solo tras respuesta confirmada. Polling existente se conserva; durante `PROCESSING` indicar actividad indeterminada (retirar el 60 % ficticio si la API no da progreso).
- Comprobar casos concretos: documentos rechazados o fallidos, meta sin título, sin metas/documentos indexados, plan fallido, quiz vacío o envío fallido, runtime desconocido y revisión de configuración en conflicto.
- **Salida:** lenguaje visual coherente aplicado a todas las rutas sin borrar contenido en refetch ni ocultar errores con estado vacío.

### Fase 3 — Pantallas según la tarea de estudio

- **Documentos / Metas:** introducir requisitos por pasos con vínculos claros; mantener carga múltiple y edición/eliminación. Validación temprana de extensión/tamaño y texto vacío, respetando siempre validación del servidor.
- **Plan / Detalle:** distinguir selección de meta y documentos, generación en curso, fallo con enlace a Configuración cuando proceda y lista de sesiones con siguiente paso claro. Mantener datos y estados de API tal cual; no inventar reintento o recuperación sin contrato.
- **Sesión:** priorizar material, temporizador, receso, quiz y resultado; botones separables en móvil y feedback de envío. Unir visualmente progreso de preguntas sin mover lógica de temporizador al componente de presentación.
- **Dashboard / Configuración:** resumen comprensible incluso sin datos; gráfico con equivalente textual o tabla para lectura sin visión de color, etiquetas y fechas legibles; jerarquizar la fuente LLM efectiva y sus pasos sin omitir verificación, conflictos ni seguridad de la clave.
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
| Resultado funcional | E2E en navegador real: subir `.md` demo → esperar `INDEXED` → crear meta → generar plan `READY` → estudiar/receso/quiz → ver resultado/dashboard. Casos alternos: `FAILED`, API caída y configuración en modo mock. No se almacenan respuestas ficticias. |
| Facilidad de uso | Prueba con usuarios sin indicarles los pasos: ubicar la siguiente acción y volver atrás; mensajes claros en vacío, espera, error y éxito. Probar menú, scroll y selección de documentos en 320/375/768/1440 px. |
| Diseño visual | Capturas de todas las rutas y cuatro estados de UI con datos reales/demo; contraste validado en contexto, legibilidad de Markdown, textos largos y modo de zoom. |
| Accesibilidad | Recorrido solo con Tab/Shift+Tab/Enter/Espacio, foco visible/no tapado, nombres/roles/estados accesibles, zoom 200 %, movimiento reducido y lector de pantalla en navegación, subida, quiz y configuración. Objetivo WCAG 2.2 AA sin afirmar certificación automática. |
| Calidad técnica | Vitest + Testing Library para errores/contrato/estados (mantener pruebas existentes de SettingsPage); E2E Playwright o equivalente tras decidir infraestructura; `npm run lint`, `npm test`, `npm run build` **desde `frontend/`**. Ninguna nueva advertencia de typecheck ni regresión en demo. |
| Rendimiento | Medir en dispositivo/red reproducibles y en campo si hay tráfico: percentil 75 de **LCP ≤ 2,5 s**, **INP ≤ 200 ms**, **CLS ≤ 0,1** como objetivos de Web Vitals; registrar baseline, método, entorno y comparación antes/después. No confundir métrica de laboratorio sin INP real con medición de campo. |

## 6. Decisiones antes de ejecutar

1. Confirmar con usuarios si la prioridad es **primer uso (documentos → plan)** o **sesiones diarias de estudio**; el plan propone resolver primero los bloqueos compartidos y luego optimizar ambos recorridos.
2. Validar prototipo sencillo de «mesa de estudio clara» (paleta y dos estilos tipográficos) en una sesión real antes de extenderlo; si dificulta leer material largo, se revisa sin cambiar el flujo.
3. Acordar entorno de despliegue y presupuesto de performance para CSP/observabilidad; fijar si se necesita auténtico E2E en CI y qué datos demo utilizará. Estas decisiones no bloquean las fases 0–2.

**Priorización:** navegación móvil, errores y accesibilidad son bloqueantes; identidad visual y pulido de las pantallas siguen inmediatamente; herramientas nuevas, SSR, autenticación y monitoreo son decisiones independientes basadas en necesidad, no requisitos implícitos de este diseño.
