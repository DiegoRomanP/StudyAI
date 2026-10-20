# Historial del frontend

> Resumen de la integración del nuevo frontend (septiembre–octubre 2026). Sustituye a
> `Plan-New-Frontend.md`, `fronted-design.md`, `frontend-integration/*` (salvo la guía viva de QA, que quedó
> en `docs/qa-aislado.md`), sus capturas de evidencia y `QA-OnboardingUX-2026-10-18.md`. Los textos
> originales siguen en el historial de git. Estado operativo actual: `docs/AGENTS_STATUS.md`, `CLAUDE.md`
> («Frontend») y el código.

## 1. Propuesta de diseño (`fronted-design.md`, septiembre) — superada

Meta: que quien entra por primera vez entienda qué hace StudyAI y llegue a «Estudiar» sin recorrer cada
sección (subir material → elegir meta → configurar IA → generar plan → estudiar), sin perder el acceso a
Documentos, Metas, Planes, Estadísticas y a todas las sesiones, incluidas las completadas. Criterios que
se mantuvieron: estados de carga/vacío/error distinguibles (un error de red nunca es «sin datos»),
WCAG 2.2 AA en recorridos críticos, sin desbordamiento a 320 px, funcionamiento con el proveedor mock, y
stack sin cambios (React 18, Vite, Tailwind 3, Axios, TanStack Query).

Lo que **no** sobrevivió: la paleta clara y el layout propuestos, sustituidos el 2026-10-17 por el tema
oscuro «flow» del plan ODD `studyai-fluid-learning` y el mockup `images/Estudio inteligente con StudyAI.png`.

## 2. Plan de integración A01–A18 (`Plan-New-Frontend.md`)

| Actividad | Qué se hizo | Referencia |
|---|---|---|
| A01 | Inventario de Penpot (54 boards) y matriz de trazabilidad. Revisión: «CAMBIOS REQUERIDOS»; nunca se aprobó formalmente | — |
| A02 | Línea base técnica y funcional con evidencia reproducible | `cc3f115` |
| A03 | Entorno aislado de QA (Playwright + runner), guía en `docs/qa-aislado.md` | `46bebfa` |
| A04 | Smoke HTTP con Bruno (`frontend/bruno/smoke/`) | `0e01e89` |
| A05 | Tokens y componentes base (Penpot no tenía biblioteca de tokens; contrastes calculados) | `c703f8f` |
| A06 | Navegación responsive, 404, validación de IDs, títulos y foco | `58e3a97` |
| A07 | Subida de documentos y plantillas de meta compartidas | `5ecad50` |
| A08–A13 | Vía ODD `studyai-fluid-learning`: ProviderSetup, Inicio/coordinador «Estudiar», Plan y Temas, sesión/quiz/resultado, Estadísticas, landing y `/demo` | `e207aba` … `57e536a` |
| A14–A18 | Cubiertas en parte por el E2E `e2e/smoke/study-flow.spec.ts` y la revisión responsive de T10 | — |

**Decisiones de producto que quedaron sin cerrar formalmente:** (1) al llegar a `READY`, botón a la primera
sesión pendiente + «ver todas» en vez de redirigir (en la práctica Inicio funciona como coordinador); (2) la
idempotencia se resolvió con `src/lib/idempotency.ts` + `Plan.idempotency_key` único en backend.

## 3. Contratos que el frontend no puede respaldar (`t12-contract-gaps.md`)

El mockup tiene widgets que la API no alimenta; la app real solo muestra lo derivable con honestidad y el
resto vive **solo en `/demo`** (que nunca importa el cliente de API). Para cerrar una fila hay que añadir el
campo en backend (+ backfill en `init_db.py`, esquema, `api_contract.yaml`, tests) y mostrar el widget real.

| Widget | Falta en backend |
|---|---|
| «Ver explicación» en Práctica | `explanation` por `QuizQuestion` (generada en `session_content`, sin URLs) |
| Filtro «Incorrectas» | Endpoint con las preguntas falladas del usuario |
| «Tiempo de estudio» | Minutos reales por sesión |
| Dificultad por pregunta | `difficulty` en `QuizQuestion` (hoy solo en temas) |
| Calendario con fechas | Fecha programada persistida por sesión (hoy: creación + `review_offset_days`) |
| «¡Hola, Nombre!» | Nombre de usuario (requiere auth real) |
| Tendencias «+28 %» | Agregados por periodo en servidor; `upcoming_reviews` limitado a 200 filas |
| «Temas dominados 68 %» | Definición de dominio expuesta por API (parcialmente cubierta por la ruta adaptativa) |

**Defectos de contrato abiertos:** los `datetime` salen sin zona horaria (el frontend los parsea como UTC con
`parseApiDate`); `weak_topics` incluye todos los temas calificados, también al 100 %. (`document_ids`
inexistentes en `POST /plans/generate` ya se validan en el servidor.)

## 4. Lecciones de las actividades A05–A07

- Penpot no tiene tokens ni escala de espaciado: los tokens salen de los literales observados y de
  `fronted-design.md`; `line` (#D4E0DC) sobre blanco da solo 1,36:1, por lo que no es el único límite visual
  de un input.
- `PEN-01/02/03` (prototipo con destinos cruzados, sidebar contradictoria en estados no-MOCK, y si Inicio es un
  sexto tab móvil) nunca se resolvieron; el menú móvil ofrece los seis destinos en un panel no modal.
- La verificación de IDs de documento en cliente no elimina la carrera con un borrado en servidor; la defensa
  real es la validación del backend.
- El warning de bundle > 500 kB (≈825 kB minificado) está registrado y sin tratar.

## 5. QA manual del onboarding (2026-10-18)

Veredicto: bien implementado, 9/10 criterios, sin errores de consola/red ni desbordes; rendimiento local
excelente (LCP 100–344 ms; con 4× CPU + Slow 4G, LCP 1,45–2,25 s). El único criterio fallido (dos `h1` en
Sesión) está corregido en `SafeMarkdown`. No se probó: LLM real, PDF, `npm run test:e2e`, Firefox/WebKit,
320 px, lector de pantalla real.

## Pendientes que sobreviven

- Cerrar `PEN-01/02/03` y la paridad formal con Penpot (o declararla innecesaria tras el rediseño «flow»).
- Auditoría de accesibilidad real: axe/Lighthouse y lector de pantalla (nunca se hicieron).
- Las 8 filas de la tabla de §3 y los dos defectos de contrato.
- Partir el bundle principal (> 500 kB) con `React.lazy` por ruta.
- QA H2–H9 del onboarding si siguen vigentes: checklist vs. formulario en «Conecta tu IA», documento subido
  que no se auto-selecciona, textos de ayuda desfasados en Sesión, error de título vacío en Metas sin foco,
  8 proveedores expandidos sin recomendación, objetivos táctiles de 16–24 px en `HelpTerm`.
