# Informe de QA manual: Onboarding UX (`feat/onboarding-guidance`)

Fecha: 2026-10-18 · Rama: `feat/onboarding-guidance` (HEAD `ed05fb6`) · Plan evaluado: `plans/OnboardingUX.md`

## Resumen

**Veredicto: el plan está bien implementado.** Los 10 criterios de aceptación del §8 se cumplen salvo uno
(un `h1` por página en todos los estados), que falla en la **Sesión**. Además hay 9 hallazgos menores de
copy, coherencia y accesibilidad. No encontré errores de consola, errores de red ni desbordes horizontales.

| Área | Resultado |
|---|---|
| Criterios de aceptación §8 | 9 de 10 cumplidos; falla «un `h1` por página» en Sesión |
| Flujo completo usuario nuevo (subir `.md` → meta → plan → sesión → estadísticas) | Funciona de punta a punta |
| Rendimiento (build de producción, local) | Excelente: FCP 88–304 ms, LCP 100–344 ms |
| Rendimiento (4× CPU + ~Slow 4G) | FCP ≈ 1,2 s; LCP 1,45 s (Inicio/Plan) y 2,25 s (Estadísticas) |
| `tsc --noEmit` / Vitest / build | OK / 254 tests OK / OK (2,6 s) |
| Backend `pytest` | 269 tests OK (3 s) |
| Dependencias nuevas | Ninguna (`package.json`, lockfile y `requirements.txt` iguales a `main`) |

## Cómo se probó

- Backend y frontend **aislados** en puertos 8011 y 5183, con base de datos temporal (`/tmp/studyai-onb`) y modo demo
  (`ANTHROPIC_API_KEY` vacío, `LLM_REQUEST_PACING_SECONDS=0`). Las instancias de desarrollo del usuario (8001/5173) no se tocaron.
- Playwright (Chromium) a 1280 px y 375 px, con `localStorage` limpio.
- Rendimiento: primero en modo dev, después sobre el **build de producción** servido con `vite preview` (caché fría en cada carga).
- Capturas en `.playwright-mcp/shots/` (carpeta ignorada por git).

**No se probó:** LLM real (solo demo/mock), subida de PDF, suite E2E (`npm run test:e2e`), Firefox/WebKit, 320 px,
lector de pantalla real, ni la navegación con Tab por las valoraciones 0–5.

## Criterios de aceptación (§8)

| # | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | Con BD vacía cada página explica qué hace y el siguiente paso; sin `<p>` vacíos ni tiles en cero | ✅ | Las 8 páginas del menú revisadas. Estadísticas muestra `EmptyState` «Aquí verás tu progreso» + «Preparar mi plan». Práctica y Temas usan una tarjeta con texto y CTA en lugar de `EmptyState` (equivalente) |
| 2 | Checklist con datos reales, avanza y desaparece | ✅ | 0/5 → 1/5 (tras subir) → 3/5 (tras generar plan) → desaparece al completar la primera sesión |
| 3 | Guías se cierran, persisten tras recargar y se reabren; `localStorage` bloqueado no rompe | ✅ | Clave `studyai.onboarding.guide.plan=collapsed`; tras recargar queda colapsada; foco pasa al botón de reabrir y luego al título; con `localStorage` lanzando excepción la guía se ve abierta y sin errores |
| 4 | Botón principal desactivado muestra motivo con `aria-describedby` | ✅ | «Estudiar», «Generar plan», «Siguiente» (sesión), «Siguiente pregunta», «Conectar y verificar modelo» |
| 5 | Jerga eliminada o con `HelpTerm` | ✅ con reservas | Ver H4. `HelpTerm` abre con Enter, cierra con Esc y devuelve el foco; en 375 px el popover (320 px) cabe en pantalla en los 6 casos probados |
| 6 | Sesión con «Paso X de 3» y `aria-current`; valoraciones 0–5 con texto | ✅ | «Paso 1/2/3 de 3», `aria-current="step"`, fases pasadas con check y «(hecho)», botones «0 Nada … 5 Perfecto» |
| 7 | Etiquetas «Conectar IA» y «Temas clave» | ✅ | Menú lateral, menú inferior («Más»), títulos de documento y landing |
| 8 | Un `h1` por página en todos los estados | ❌ | **Falla en Sesión** (H1). Correcto en PROCESSING y FAILED del detalle de plan, 404 y rutas inválidas |
| 9 | `lint`, `test`, `build` en verde | ✅ | `tsc` sin errores, 254 tests, build en 2,6 s. E2E no ejecutado |
| 10 | Sin dependencias nuevas | ✅ | `git diff main` vacío en manifiestos |

`/demo` no hace ninguna llamada a la API (0 peticiones a `:8011`), como exige `CLAUDE.md`.

## Hallazgos

### Prioridad media

**H1. Dos `<h1>` en la página de Sesión (incumple §8 y WCAG de estructura).**
El título de la página es un `h1` y el contenido de estudio, renderizado por `SafeMarkdown`, añade otro `h1` cuando el
texto de la IA empieza con `# Título` (ocurre en el contenido demo: «Read» aparece dos veces). Reproducible en
`/session/1` y `/session/2`. Con un LLM real el contenido puede traer también `##`/`###` que compiten con la jerarquía
de la página. Causa: `src/components/session/SafeMarkdown.tsx` no remapea encabezados.
Sugerencia: en `SAFE_COMPONENTS` bajar un nivel (`h1→h2`, `h2→h3`, …); añadir un test que compruebe `getAllByRole("heading", { level: 1 })` con contenido que empiece por `#`.

### Prioridad baja

**H2. La checklist y el formulario de Inicio no coinciden en el paso «Conecta tu IA».**
En el formulario el paso 3 sale como «Hecho» (modo demo activo), pero en «Primeros pasos» sigue sin marcar y con el
botón «Seguir con el modo demo». Además, con el plan ya generado, el badge «Siguiente» queda sobre el paso **opcional**
«Conecta tu IA» en vez de sobre «Completa tu primera sesión». Sugerencia: no marcar como «Siguiente» un paso opcional
mientras haya pasos obligatorios pendientes, y decidir una sola regla para «hecho» en ambos sitios.

**H3. El documento subido no se selecciona solo.**
Tras subir un `.md`, «Estudiar» sigue desactivado hasta marcar el checkbox, y el paso 1 no muestra «Hecho» aunque la
checklist ya lo tiene completo. El motivo se explica bien («Marca al menos un documento listo para usar»), así que es
fricción, no bloqueo. Sugerencia: autoseleccionar el documento recién indexado.

**H4. Jerga residual.** «LLM simulado» en el paso 3 de Inicio (el plan lo cambió en `LlmRuntimeSummary` a «respuestas de
ejemplo», pero `StudySetup` conserva la frase anterior); «Enfoque Pareto (80/20)» como título de tarjeta en Inicio sin
`HelpTerm`; «Usar mi propia API key».

**H5. Textos de ayuda desfasados en Sesión.**
La línea «Estudia el material. Cuando acabe el tiempo pasarás a un receso…» se queda visible durante el receso y el test.
En las flashcards, tras pulsar «Mostrar respuesta» la pista bajo «Siguiente» sigue diciendo «Muestra la respuesta y
valora…» aunque la respuesta ya está visible (debería pedir solo la valoración).

**H6. Metas: el error de título vacío no se anuncia ni mueve el foco.**
Al pulsar «Guardar meta» sin título el campo queda con `aria-invalid="true"` y enlazado a «Escribe un título para tu
meta», pero el mensaje no usa `role="alert"` y el foco no pasa al campo. Un lector de pantalla no lo anunciaría.

**H7. «Conectar IA»: ocho proveedores expandidos y sin recomendación.**
El subtítulo ya tranquiliza («el modo demo ya funciona») y la guía ayuda, pero la página sigue siendo una pared de
formularios idénticos (la auditoría del plan lo señalaba y quedó fuera de alcance). Idea: colapsar por defecto y
destacar uno o dos proveedores.

**H8. Objetivos táctiles pequeños.** Los `HelpTerm` en línea miden entre 16 y 24 px de alto y los checkboxes de documentos
20×20 px. El texto en línea está exceptuado por WCAG 2.2 (2.5.8), pero en móvil cuesta acertar.

**H9. «Temas más débiles» puede mostrar un tema al 100 %.** Ya está anotado como desviación en el §11 del plan (el backend
lista todos los temas calificados). Sigue siendo confuso con una sola sesión; podría rotularse «Tus temas» hasta que haya
fallos.

### Observaciones (no son defectos de esta rama)

- **Calidad del contenido en modo demo.** Los temas salen de un embedder por hash y un LLM simulado: «Read», «Clave»,
  «Bases», «Datos». «Read» (de «READ UNCOMMITTED») queda como tema más relevante al 100 %. Es esperado, pero es la primera
  impresión de quien prueba sin clave; conviene que el texto «contenido simulado» sea visible donde aparecen los temas.
- La opción de respuesta correcta del demo siempre es la «A», por lo que cualquier test automatizado da 100 %.
- 2 avisos de consola, ambos de React Router v6 (`v7_startTransition`, `v7_relativeSplatPath`); no hay errores.
- Falta guía en Estadísticas (permitido por el plan, que lo deja opcional).

## Rendimiento

Todas las cifras son **locales y sin red real**, así que son un mejor caso. La comparación útil es entre páginas.

### Build de producción, caché fría, 1280×800

| Ruta | h1 visible | FCP | LCP | Peticiones API | Mayor latencia API |
|---|---|---|---|---|---|
| `/inicio` | 182 ms | 180 ms | 344 ms | 9 | 18 ms |
| `/plan` | 92 ms | 100 ms | 100 ms | 4 | 11 ms |
| `/plan/1` | 92 ms | 104 ms | 120 ms | 2 | 6 ms |
| `/practica` | 196 ms | 196 ms | 216 ms | 5 | 9 ms |
| `/temas` | 275 ms | 304 ms | 304 ms | 2 | 7 ms |
| `/documents` | 91 ms | 96 ms | 112 ms | 2 | 6 ms |
| `/goals` | 89 ms | 104 ms | 104 ms | 2 | 6 ms |
| `/settings` | 99 ms | 108 ms | 108 ms | 5 | 11 ms |
| `/dashboard` | 116 ms | 92 ms | 140 ms | 2 | 5 ms |
| `/session/1` | 106 ms | 88 ms | 124 ms | 2 | 4 ms |

- **CLS real: 0,02–0,07** (Inicio 0,019; Estadísticas 0,025; Sesión 0,022; Práctica 0,035). Una primera medición dio ≈0,2 por un
  error mío (observadores duplicados); se descartó y se repitió.
- **Con 4× CPU y red de ~1,6 Mbps / 150 ms:** `/inicio` FCP 1,25 s, LCP 1,49 s; `/plan` FCP 1,20 s, LCP 1,45 s;
  `/dashboard` FCP 1,20 s, LCP 2,25 s (carga el chunk de gráficas).
- **Endpoints** (`curl`, localhost): 2–4 ms cada uno.
- **Bundle:** `index` 497 kB (156 kB gzip) y CSS 35 kB (7 kB gzip); `DashboardPage` 394 kB (109 kB gzip, recharts, carga
  diferida); `SafeMarkdown` 120 kB (37 kB gzip, diferido). Páginas de estudio y práctica cargan 3–4 chunks adicionales.
- **Modo dev (no representativo):** 74 recursos y ≈5 MB en `/inicio`.
- **Flujo:** subir `.md` → «Listo para usar» en **≈0,3 s** (1 chunk, embedder por hash). Generar el plan terminó dentro
  del tiempo de la captura (segundos) con LLM simulado y sin pacing; **no es una medida válida para un LLM real**
  (2 + N llamadas con 2 s de pacing).
- Estados de error: `/plan/9999` y `/session/9999` muestran su mensaje y salida en ≈1 s (reintento de TanStack incluido);
  `/plan/abc` y rutas inexistentes responden al instante.

Oportunidad: el chunk principal de 497 kB es el único peso notable en la ruta crítica; el resto ya está dividido.

## Qué funciona especialmente bien

- Estados vacíos con explicación y CTA en todas las páginas; Estadísticas ya no muestra ceros.
- Checklist «Primeros pasos» ligada a datos reales y que desaparece sola.
- Motivos visibles para botones desactivados, enlazados por `aria-describedby`.
- `PageGuide` y `HelpTerm`: persistencia, foco, Esc, `localStorage` bloqueado y popover en 375 px.
- Vista de plan en generación («Qué está haciendo la IA») y vista de fallo con el `error_message` real.
- Copy de borrado de documento coherente con el backend (borra fila, archivo y vectores; no toca los planes).
- Cero errores de consola o de red durante todo el recorrido, y `/demo` sin llamadas a la API.

## Orden sugerido para corregir

1. **H1** (único criterio del plan que falla): remapear encabezados en `SafeMarkdown` + test.
2. **H2 y H3**: coherencia de la checklist y autoselección del documento recién subido.
3. **H4 y H5**: pasar por los textos restantes.
4. **H6**: `role="alert"` y foco en el error de Metas.
5. H7–H9 como mejoras de pulido.
