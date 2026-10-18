# Plan: guía de uso en cada página (onboarding UX)

Fecha: 2026-10-17

Estado: **implementado** en la rama `feat/onboarding-guidance` (commits `b3f9d81` fase 0, `5245a07` fase 1, `e43e835` fase 2, `0c8af87` fase 3, `ad0bc4a` fase 4 y el commit de documentación de la fase 5). Las desviaciones respecto al plan están anotadas en §11.

Skills usadas en el análisis: `onboarding-ux` (`.claude/skills/onboarding-ux`) y `frontend-ui-engineering`. Las dos conviene cargarlas al implementar.

---

## 1. Problema y objetivo

Un usuario nuevo que entra a **Inicio** o a cualquier otra página no siempre entiende para qué sirve la página ni qué hacer a continuación. El objetivo es que **cada página se explique sola en el primer vistazo**:

- qué hace la página;
- cuál es la acción principal;
- qué falta para poder hacerla;
- cuál es el paso siguiente.

Todo esto sin estorbar a quien ya sabe usarla.

## 2. Decisiones tomadas con el usuario (no reabrir)

1. **Panel propio «Cómo funciona esta página»** en cada página. Es cerrable, se puede reabrir con un botón y recuerda su estado en `localStorage`. **No** se añade ninguna librería de tours ni tooltips (ni `react-joyride` ni similares).
2. **Se mantiene el orden del menú lateral**, que sigue el mockup `images/Estudio inteligente con StudyAI.png`. A cambio:
   - se añade en Inicio una checklist **«Primeros pasos»** con el progreso real;
   - se renombran solo dos etiquetas: «API Keys» pasa a **«Conectar IA»** y «Temas (Pareto)» pasa a **«Temas clave»** (etiqueta corta «Temas»).
3. **Entregable: implementación real** en `frontend/src`, por fases, con tests. No hace falta generar los artefactos `.jez/artifacts/onboarding/` que propone la skill.

## 3. Restricciones del repo (leer `CLAUDE.md` antes de empezar)

- **Solo frontend.** No se toca el backend, ni la API, ni `docs/api_contract.yaml`.
- Toda la UI está **en español**, con tono de compañero y no de manual. Frases cortas.
- Tema **solo oscuro**. Hay que usar los tokens de `frontend/src/styles/tokens.css` y los alias de `tailwind.config.js`: `text-text-muted`, `bg-surface-subtle`, `rounded-surface`, `text-action-hover`, `state-*`, etc. Nada de hex sueltos ni gradientes nuevos. `src/__tests__/design-tokens.test.ts` valida el contraste.
- Se reutilizan los primitivos de `frontend/src/components/ui.tsx` (ver §5) y `AsyncState.tsx`.
- `/demo` (`DemoPage.tsx`) **nunca** importa el cliente de API. Los componentes de ayuda nuevos no deben depender de la API para poder usarse ahí.
- Para truncar listas, `useShowMore` sigue siendo el único mecanismo.
- Las fechas del backend se parsean con `parseApiDate`.
- Los enlaces de YouTube siguen construyéndose como URL de búsqueda (`src/lib/youtube.ts`). No hay que tocarlo.
- Accesibilidad WCAG AA:
  - todo lo interactivo es un `<button>` o un enlace;
  - foco visible (ya existe en `index.css`);
  - un `h1` por página, sin saltar niveles;
  - nunca usar solo el color para transmitir un estado.
- Hay que probar en 375 px y 1280 px.
- Comandos, desde `frontend/`:
  - `npm run lint` (es `tsc --noEmit`);
  - `npm test` (Vitest);
  - `npm run build`;
  - E2E con `npm run test:e2e` (Playwright, `frontend/e2e/`, runner `scripts/run-qa.mjs`).

## 4. Hallazgos de la auditoría (estado actual)

Las referencias son relativas a `frontend/src/` y pueden haberse desplazado unas pocas líneas.

### Transversales

- **No hay infraestructura de ayuda.**
  - No se usa `localStorage` en ningún sitio. El único almacenamiento es `sessionStorage` en `hooks/useStudyStart.ts:40-78`, para retomar un plan en curso.
  - No hay tooltips, popovers ni tours.
  - El único «Tooltip» es el de recharts en `DashboardPage.tsx:178`.
- **La única guía real es `components/home/StudySetup.tsx`**: tres pasos («Tu material», «Elige tu meta», «Conecta tu IA») y el botón «Estudiar».
- **Patrón de ayuda reutilizable que ya existe**: un icono `Info` con texto atenuado, en `TopicsPage.tsx:98-107` y en `PracticePage.tsx:184-188`. Los campos `Input`, `Select` y `Textarea` aceptan `hint` y lo enlazan con `aria-describedby`.
- **Botones desactivados sin motivo**: ninguno lleva `aria-describedby` hacia una explicación.
- **Nombres inconsistentes** para la misma cosa: «Quiz» (`HomeCards.tsx:73`), «Test» (`SessionPage.tsx:168`) y «Simulacro» (Práctica). La página de documentos se llama «Recursos», pero su sección dice «Tus documentos».
- **Jerga sin explicar**: indexar/indexado, Pareto/80 %, SM-2, simulacro, flashcard/tarjeta, repaso, «proveedor efectivo», verificar, URL base, ID del modelo, y los tipos de meta Examen/Aprender/Memorizar.
- **Menú** (`components/AppShell.tsx:35-52`): Inicio → Plan de estudio → Práctica → Temas (Pareto) → Recursos → Metas → API Keys → Estadísticas. Los pasos de preparación (Recursos, Metas, API Keys) quedan al final. En móvil solo son visibles Inicio, Plan, Práctica y Estadísticas; el resto está bajo «Más». `StudyStreakCard` (`HomeCards.tsx:260-282`) dice «Completa un quiz hoy» aunque el usuario aún no tenga nada.

### Por página

| Página | Estado vacío actual | Otros problemas |
|---|---|---|
| **Inicio** `pages/HomePage.tsx` | `empty={null}` (`:54`). Con cero datos solo se ven el header y `StudySetup`. | Solo muestra `missing[0]` (`StudySetup.tsx:251-255`). Los pasos no se marcan como hechos. «método Pareto» sin explicar (`:34`). «Repasos SM-2» (`HomeCards.tsx:74`). El `h2` de `DocumentUpload.tsx:166` queda dentro de un `h3` de paso. El estado «Error» de un plan no explica nada (`HomeCards.tsx:212-216`). |
| **Recursos** `pages/DocumentsPage.tsx` | `<p>Aún no has subido documentos.</p>` (`:84`), sin CTA. | Textos técnicos en `DocumentUpload.tsx`: «El servidor confirma la aceptación final» (`:183`) y «Estado de indexación no confirmado…» (`:40`). Error de actualización en `:51`. Badges «Indexado/Procesando/Error» (`:10-14,123`). Tras subir no se sugiere el paso siguiente. El confirm de borrado (`:96-98`) no dice si afecta a planes. |
| **Metas** `pages/GoalsPage.tsx` | `<p>Aún no tienes metas.</p>` (`:127`), sin CTA. | No se explica en qué se diferencian Examen, Aprender y Memorizar (`lib/goalTemplates.ts:62-84`). Las plantillas (`components/goals/GoalTemplatePicker.tsx`) no tienen encabezado. El hint del título es una regla de validación (`:68`). El de la descripción no dice si la IA la usa (`:105`). Tras «Meta guardada.» (`:112`) no se sugiere el paso siguiente. El formulario de edición (`:212-268`) usa elementos nativos sin hints. |
| **Plan** `pages/PlanPage.tsx` | `<p>Aún no has generado planes.</p>` (`:213`), sin CTA. Sin metas muestra un enlace en línea a Metas (`:141-143`). | Si existen metas pero ninguna está seleccionada, «Generar plan» se desactiva sin motivo. Las filas en PROCESSING muestran «0 sesiones» (`:270`). Las filas en Error no dan ninguna razón. No menciona que Inicio hace todo el flujo de una vez. |
| **Detalle de plan** `pages/PlanDetailPage.tsx` | En PROCESSING (`:90-100`) solo hay un `h2`, **sin `h1`**. «Sin sesiones» (`:181`) no tiene CTA. | No se explica qué es una sesión (estudio → receso → test). «repaso a N días» (`components/plan/SessionTimeline.tsx:112`) sin explicar. El texto de ID inválido es técnico (`:30`). |
| **Sesión** `pages/SessionPage.tsx` + `components/session/*` | `<Card>No hay preguntas…</Card>` (`QuizPhase.tsx:74`) y `<Card>Sesión completada.</Card>` (`SessionPage.tsx:151`), sin CTA. | `PhaseIndicator` (`:164-180`) pinta las fases pasadas y la actual con el mismo color: no hay «Paso X de 3» ni `aria-current`. El temporizador avanza solo al receso sin avisar (`useTimer.ts:39-48`). Las etiquetas 0–5 de `QUALITY_LABELS` (`QuizPhase.tsx:11-18`) solo están en `aria-label`. Aparece «(SM-2)» (`:192`). «Siguiente» se desactiva sin motivo (`:140`). `SessionResult.tsx` no dice que las flashcards no puntúan. |
| **Práctica** `pages/PracticePage.tsx` | Sin plan listo hay un CTA (`:115-118`). «Sin preguntas» y «sin sesiones» no tienen CTA (`:213`, `:373`). | «Simulacro» solo se explica en el subtítulo. Con un único plan no se dice cuál se está usando (`:130`). «Siguiente pregunta» se desactiva sin motivo (`:361`). |
| **Temas** `pages/TopicsPage.tsx` | Sin plan hay un CTA (`:39-44`). «Sin análisis» (`:93`) no tiene CTA. | «Pareto», «80 %» y «Dificultad estimada: X de 5» sin escala (`:157`). |
| **Estadísticas** `pages/DashboardPage.tsx` | `empty={null}` (`:81`): un usuario nuevo ve **tiles llenos de ceros** y el selector de periodo. «Completa una sesión…» (`:156`), «Sin datos todavía.» (`:234`) y «No hay revisiones programadas.» (`:261`) no tienen CTA. | «(SM-2)» en el subtítulo (`:60`). «tarjeta(s)» (`:268`) y «Precisión media» sin explicar. |
| **API Keys** `pages/SettingsPage.tsx` + `components/llm/*` | Catálogo vacío (`:133-135`). | Todos los proveedores salen expandidos sin recomendación. La tranquilidad de «funciona sin clave (modo demo)» queda enterrada en el subtítulo (`:82-86`). En `ProviderSetup.tsx`, «Activar» (`:290-295`) y «Guardar y verificar modelo» (`:254,268`) se desactivan sin motivo. Jerga en `LlmRuntimeSummary.tsx:120-161` («Proveedor efectivo», «Configuración del servidor»). |

### Datos útiles para los textos

Fuente: `backend/app/strategies/goal_strategies.py`. La duración de la sesión es la misma para todos los tipos de meta; lo que cambia es la mezcla de preguntas.

- **Examen**: 7 de opción múltiple y 3 flashcards. Pensado para practicar como en el examen.
- **Aprender**: 5 y 5. Busca equilibrio entre entender y recordar.
- **Memorizar**: 8 flashcards y 2 de opción múltiple. Centrado en memorizar.

Los repasos usan los intervalos `REVIEW_INTERVALS_DAYS` (Ebbinghaus) y luego SM-2 según tu valoración de 0 a 5. En los textos de UI se dice **«repaso espaciado»** y SM-2 solo se nombra dentro de la definición del glosario.

## 5. Primitivos existentes que hay que reutilizar

Están en `components/ui.tsx`:

- `Button` (variant `primary|secondary|ghost|danger`, forwardRef)
- `ButtonLink` (LinkProps + variant)
- `Card` (variant `paper|elevated|glass`)
- `Badge` (color `slate|green|amber|red|brand`)
- `Spinner`
- `ActivityIndicator`
- `Skeleton`
- `ProgressBar` (`value`, `label?`)
- `Input`, `Select` y `Textarea` (`id`, `label`, `hint?`, `error?`, que ya conectan `aria-describedby`)
- `Alert` (tone `info|success|warning|error`, `title?`)
- `IconTile` (`icon`, tone `flow|muted|success|warning|error`)
- `ProgressRing`
- `StatTile`
- `SegmentedControl`
- `OptionCard`
- `StepChain` (`label`, `steps: {label, detail?, icon?}[]`)

`AsyncState` (`components/AsyncState.tsx`) acepta `empty`, `isEmpty` y `onRetry`.

Los iconos vienen de `lucide-react` (ya instalado).

Hooks de datos (`hooks/queries.ts`): `useDocuments`, `useGoals`, `usePlans`, `useDashboard`, `useLlmRuntime` y `useProviderCatalog`. A esto se suman `useRuntimeConfirmed()` (`components/home/ProviderQuickSetup.tsx:140`) y las utilidades `readyPlans`, `findNextSession` y `sessionProgress` (`lib/studyProgress.ts`).

**Tests:** no hay helper de render compartido. Cada test monta `QueryClientProvider` (con `retry:false`) y `MemoryRouter` con los future flags v7, y mockea con `vi.spyOn(api, ...)` o `vi.mock`. Hay que seguir ese patrón.

---

## 6. Implementación por fases

Se trabaja en la rama `feat/onboarding-guidance` creada desde `main` (la rama `fix/plan-document-validation` no tiene relación con esto). **Un commit por fase.** Antes de cada commit tienen que pasar `npm run lint`, `npm test` y `npm run build`.

### Fase 0: Infraestructura de ayuda

Archivos nuevos:

1. **`src/lib/onboardingStorage.ts`**
   - `readFlag(key: string): string | null` y `writeFlag(key: string, value: string | null)`, con el prefijo `studyai.onboarding.`.
   - Cada acceso a `localStorage` va envuelto en try/catch. Si falla, se devuelve `null`: la página se comporta como en la primera visita, con todo visible.
2. **`src/lib/glossary.ts`**
   - `GLOSSARY: Record<TermId, { label: string; definition: string }>`, con definiciones de 1–2 frases.
   - Términos mínimos:
     - `temasClave` (Pareto 80/20)
     - `repaso` (repetición espaciada; aquí se nombra SM-2)
     - `preparando` (indexar)
     - `sesion` (estudio → receso → test)
     - `simulacro`
     - `flashcard`
     - `metaExamen`, `metaAprender`, `metaMemorizar` (con las mezclas de §4)
     - `proveedorIA`
     - `modoDemo`
     - `relevancia` (una estimación de la IA, no una garantía)
     - `dificultad` (escala de 1 a 5, donde 5 es la más difícil)
     - `precision` (porcentaje de aciertos en opción múltiple)
3. **`src/lib/pageGuides.ts`**
   - `PAGE_GUIDES: Record<GuideId, { title: string; steps: string[]; next?: { to: string; label: string } }>`.
   - Los textos están en §7. Los tests importan estas constantes en lugar de repetir los literales.
4. **`src/components/help/PageGuide.tsx`**, con props `{ id: GuideId }`:
   - **Expandida** (por defecto en la primera visita):
     - un `<section aria-labelledby>` con estilo `Card variant="glass"`;
     - un icono `Info` en `IconTile`;
     - el título;
     - un `<ol>` con 2–4 pasos;
     - un enlace opcional «Siguiente: {label}» (`ButtonLink variant="secondary"`);
     - un botón «Entendido» y una X con `aria-label="Ocultar guía"`.
   - **Colapsada**: un botón `ghost` pequeño, «¿Cómo funciona esta página?», con un icono `CircleHelp`.
   - El estado se guarda en `onboardingStorage` (`guide.<id>` = `"collapsed"`).
   - Al colapsar, el foco pasa al botón de reabrir; al expandir, al título de la sección (con `tabIndex={-1}`).
   - Va **justo después del `<header>`** de cada página.
5. **`src/components/help/HelpTerm.tsx`**, con props `{ term: TermId; children?: ReactNode }` (por defecto `children` es `GLOSSARY[term].label`):
   - Un `<button type="button">` en línea con subrayado punteado (`underline decoration-dotted underline-offset-4`), `aria-expanded` y `aria-controls`.
   - El popover es un `<span role="tooltip">` (o un `div` con `id`) con `absolute`, `z-20`, `max-w-xs`, `rounded-control`, `bg-surface-elevated`, `border` y `text-sm`, dentro de un wrapper `relative inline-block`.
   - Se abre con clic o toque. Se cierra con Esc (devolviendo el foco al botón), con un clic fuera o con un segundo clic.
   - El popover no se sale de la pantalla en 375 px: se alinea a la izquierda y usa `max-w-[min(20rem,calc(100vw-2rem))]`.
6. **`src/components/EmptyState.tsx`**, con props `{ icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }`:
   - Centrado, con `IconTile`, título en `font-display` y la descripción en `text-text-muted max-w-reading`.
   - `action` suele ser un `ButtonLink`. Lleva `role="status"`.
7. **Tests** en `src/components/help/PageGuide.test.tsx`, `HelpTerm.test.tsx` y `src/components/EmptyState.test.tsx`:
   - la guía se cierra, sigue cerrada tras volver a montarla y se reabre;
   - con `localStorage` lanzando excepción (`vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw … })`) la guía se muestra expandida y no rompe;
   - `HelpTerm` abre, se cierra con Esc y devuelve el foco, y `aria-expanded` cambia;
   - `EmptyState` renderiza el CTA.

### Fase 1: Inicio y navegación

1. **`src/hooks/useOnboardingProgress.ts`** devuelve `{ steps: {id, label, done, to}[], completed, total, allDone, isLoading }`. Los pasos, en orden:
   1. `material`, «Sube tu material»: hay algún documento `INDEXED` (`useDocuments`). `to: "/inicio#preparar-plan"`.
   2. `meta`, «Define tu meta»: `useGoals().data.length > 0`. `to: "/inicio#preparar-plan"`.
   3. `ia`, «Conecta tu IA (opcional)»:
      - hecho si `useLlmRuntime().data.source` es `USER` o `ENV`;
      - **o** si el usuario pulsó «Seguir con el modo demo», que guarda el flag `onboardingStorage` `demo-ok`;
      - `to: "/settings"`.
   4. `plan`, «Genera tu plan»: `readyPlans(plans).length > 0`. `to: "/inicio#preparar-plan"`.
   5. `sesion`, «Completa tu primera sesión»: alguna sesión con `completed`/`status` terminada en `usePlans`, o `useDashboard().data` con quizzes resueltos (comprobar el campo exacto en `api/types.ts`). `to`: la siguiente sesión (`findNextSession`), o `/plan`.
2. **`src/components/home/GettingStarted.tsx`**:
   - `Card variant="glass"` con el título «Primeros pasos», el texto «{completed} de {total} completados» y una `ProgressBar`.
   - Una lista de pasos: cada uno muestra un icono de check o un círculo y su texto. Los pendientes son un enlace al `to`. El primer pendiente se destaca como «Siguiente».
   - En el paso `ia`, un botón secundario «Seguir con el modo demo».
   - Botón «Ocultar» (flag `checklist-dismissed`).
   - Si `allDone` o el flag de ocultar están activos, no se renderiza.
   - En `HomePage.tsx` va debajo del `<header>`. Además, se añade `id="preparar-plan"` a la `<section>` de `StudySetup`.
   - Con cero datos, esto es lo primero que ve el usuario.
3. **`HomePage.tsx`**:
   - el subtítulo pasa a «…y te guía con los `<HelpTerm term="temasClave">temas clave</HelpTerm>`»;
   - se añade `<PageGuide id="inicio" />`, aunque es aceptable omitirla en Inicio si la checklist ya cumple esa función. **Recomendado: solo la checklist** en Inicio, para no duplicar.
4. **`components/home/StudySetup.tsx`**:
   - `StepTitle` acepta `done?: boolean`. Si está hecho, muestra un `Check` en el círculo numerado y el texto visible «Hecho» (o `sr-only`, siempre que además haya un icono). Condiciones de «hecho»:
     - paso 1: `selectedIndexed.length > 0`;
     - paso 2: `goalReady`;
     - paso 3: `runtime === "confirmed"`.
   - En lugar de mostrar solo `missing[0]`, se renderiza **toda** la lista `missing` como `<ul id="study-requirements">` bajo el botón, con «Para empezar te falta:» como encabezado. «Estudiar» lleva `aria-describedby="study-requirements"` cuando está desactivado.
   - Textos nuevos:
     - «Sube un documento y espera a que termine de indexarse.» pasa a «Sube un PDF o Markdown; en unos segundos estará listo para usar.»
     - «Selecciona al menos un documento indexado.» pasa a «Marca al menos un documento listo para usar.»
     - «Confirma el proveedor de IA (Reintentar en el paso 3).» pasa a «No pudimos comprobar tu IA: pulsa «Reintentar» en el paso 3.»
   - Se añade `HelpTerm` junto a «Tipo de estudio», con la definición del tipo seleccionado.
5. **`components/documents/DocumentUpload.tsx`**: se añade la prop `headingLevel?: 2 | 3 | 4` (por defecto 2). `StudySetup` pasa `headingLevel + 2`, o lo oculta como `sr-only`, para que no haya un `h2` dentro de un `h3`.
6. **`components/home/HomeCards.tsx`**:
   - «Repasos SM-2» (`:74`) pasa a «Repaso espaciado».
   - «Quiz» pasa a «Test» (`:73`), para unificar con la sesión.
   - Las barras de relevancia llevan `HelpTerm term="relevancia"` en el subtítulo.
   - `StudyStreakCard` sin datos: «Tu racha empieza con tu primera sesión».
   - Los planes en «Error» muestran el texto «Ver qué falló →».
7. **`components/AppShell.tsx`**:
   - `{ to: "/temas", label: "Temas clave", shortLabel: "Temas", title: "Temas clave" }`
   - `{ to: "/settings", label: "Conectar IA", title: "Conectar IA" }`
   - Hay que actualizar todos los literales que aparecen en esta búsqueda:
     ```
     grep -rn "API Keys\|Temas (Pareto)" frontend/src frontend/e2e README.md CLAUDE.md
     ```
     Ficheros afectados: `SettingsPage.tsx`, `TopicsPage.tsx`, `PlanDetailPage.tsx`, `DemoPage.tsx`, `ProviderQuickSetup.tsx`, `StudySetup.tsx`, `__tests__/AppShell.test.tsx`, `__tests__/AppRoutes.test.tsx`, `__tests__/DemoPage.test.tsx`, `e2e/smoke/a05-focus.spec.ts`, `e2e/smoke/a06-navigation.spec.ts`, `README.md` y `CLAUDE.md`.
   - **No** se cambia `docs/Plan-New-Frontend.md`, que es histórico.
8. **Tests**:
   - `useOnboardingProgress`/`GettingStarted`: con cero datos muestra 0/5 y el primer paso como «Siguiente»; con progreso parcial muestra los checks correctos; con todo hecho no se renderiza; «Seguir con el modo demo» marca el paso 3.
   - `StudySetup`: con varios requisitos pendientes aparecen todos y el botón tiene `aria-describedby`.

### Fase 2: Páginas de preparación (Recursos, Metas, Conectar IA)

El patrón es el mismo en las tres páginas:
- `<PageGuide id="…" />` tras el header;
- `EmptyState` con CTA en lugar del `<p>` vacío;
- `Alert tone="success"` con un CTA de «Siguiente paso» tras una acción que salga bien.

1. **`pages/DocumentsPage.tsx`, `DocumentUpload.tsx`, `DocumentPicker.tsx`**
   - Header: h1 «Recursos» y subtítulo «Tus documentos de estudio (PDF o Markdown). La IA los usa para crear tus planes.»
   - Etiquetas de estado nuevas. **No** cambian los valores del backend (`PENDING/INDEXED/FAILED`), solo el texto:

     | Estado | Texto |
     |---|---|
     | `INDEXED` | «Listo para usar» |
     | `PENDING` | «Preparando…» |
     | `FAILED` | «No se pudo leer» (con el `error_message` debajo) |

     Los textos de `DocumentPicker.tsx:14-16` se actualizan en consonancia.
   - Textos que se reescriben en `DocumentUpload.tsx`:

     | Línea | Texto actual | Texto nuevo |
     |---|---|---|
     | `:183` | «El servidor confirma la aceptación final.» | se elimina, o pasa a «Comprobaremos el archivo al subirlo.» |
     | `:43`, `:121` | «Subida aceptada. Indexación en curso.» | «Archivo subido. Lo estamos preparando…» |
     | `:46`, `:123` | «Subida aceptada e indexada.» | «Listo: ya puedes usarlo en un plan.» |
     | `:40` | «Estado de indexación no confirmado…» | «Aún no sabemos si terminó de prepararse. Recarga en unos segundos.» |
     | `:53` | «La indexación falló:» | «No se pudo preparar el archivo:» |

   - `DocumentsPage.tsx:51`: el error de actualización pasa a «No se pudo actualizar la lista. Mostramos lo último que cargó.»
   - Estado vacío: `EmptyState` con icono `FolderOpen`, título «Aún no tienes documentos» y la descripción «Sube tus apuntes, un temario o un libro en PDF o Markdown. Es lo primero que necesita la IA para preparar tu plan.» Sin botón, porque la subida está justo encima; como mucho, un enlace de ancla al input.
   - Cuando algún documento pasa a `INDEXED` en esta sesión de página, aparece un `Alert success` con «Listo. Siguiente: prepara tu plan» → `ButtonLink to="/inicio#preparar-plan"`.
   - El confirm de borrado pasa a: «¿Eliminar "{nombre}"? Los planes ya generados se conservan, pero no podrás usar este documento en planes nuevos. Esta acción no se puede deshacer.» **Antes hay que comprobar en el backend** (`backend/app/services/document*` y `routes/documents`) qué ocurre realmente con los planes al borrar un documento, y ajustar el texto a lo que pase.
2. **`pages/GoalsPage.tsx`, `components/goals/GoalTemplatePicker.tsx`, `lib/goalTemplates.ts`**
   - En `goalTemplates.ts` se añade `GOAL_TYPE_DESCRIPTIONS`:

     | Tipo | Descripción |
     |---|---|
     | `EXAM` | «Más preguntas tipo test (7 de 10) para practicar como en el examen.» |
     | `LEARNING` | «Mitad preguntas y mitad tarjetas: entender y recordar a la vez.» |
     | `MEMORIZATION` | «Sobre todo tarjetas de memoria (8 de 10) para fijar datos.» |

     Hay que comprobar los nombres exactos del enum `GoalType` en `api/types.ts`. Las descripciones se usan como `hint` del `Select` «Tipo de estudio» (para el tipo seleccionado), en GoalsPage y en StudySetup.
   - `GoalTemplatePicker` recibe el encabezado «Elige una plantilla (puedes cambiarla luego)», como `legend` de un `fieldset` o como un `h3`.
   - El hint del título pasa a «Por ejemplo: "Examen final de Bases de datos"». La regla de no dejarlo vacío se muestra como `error` solo después de intentar guardar.
   - El hint de la descripción es «Opcional. La IA la tiene en cuenta para enfocar el plan». **Antes hay que comprobar** que el backend usa `goal.description` en el prompt (`backend/app/llm/prompts/` o `plan_service.py`). Si no la usa, el hint será «Opcional. Solo para ti.»
   - Estado vacío: `EmptyState` con icono `Target`, título «Aún no tienes metas» y la descripción «Una meta le dice a la IA para qué estudias: un examen, aprender algo nuevo o memorizar.» Sin botón, porque el formulario está encima.
   - Tras «Meta guardada.»: `Alert success` con el CTA «Generar un plan con esta meta» → `ButtonLink to={`/plan?meta=${goal.id}`}`.
   - El formulario de edición (`:212-268`) se migra a `Input`, `Select` y `Textarea` con hints. «Tipo» pasa a «Tipo de estudio».
3. **`pages/SettingsPage.tsx`, `components/llm/ProviderSetup.tsx`, `components/llm/LlmRuntimeSummary.tsx`**
   - h1 «Conectar IA». Subtítulo: «Elige qué IA genera tus planes. **No necesitas clave para probar StudyAI: el modo demo ya funciona.**»
   - `PageGuide id="conectar-ia"` (los pasos están en §7).
   - Cambios de texto en `LlmRuntimeSummary.tsx`:

     | Texto actual | Texto nuevo |
     |---|---|
     | «Proveedor efectivo» | «IA que se usa ahora» |
     | «Configuración de usuario activa» | «Tu clave» |
     | «Configuración del servidor» | «Clave del servidor (.env)» |
     | «Modo demo (LLM simulado, sin costo)» | «Modo demo (respuestas de ejemplo, sin costo)» |
     | «Usar configuración del servidor» | «Dejar de usar mi clave» |

     Hay que comprobar qué hace exactamente ese botón antes de renombrarlo.
   - `ProviderSetup.tsx`: cada botón desactivado muestra el motivo como `<p id=… className="text-sm text-text-muted">` y lo enlaza con `aria-describedby`:
     - «Activar» (`:290-295`): «Primero pulsa «Probar configuración guardada».»
     - «Guardar y verificar modelo» (`:254,268`): «Elige un modelo de la lista o escribe su ID.»
     - «Eliminar URL personalizada» (`:213`): el motivo que corresponda según el código.
   - Se añade `HelpTerm term="proveedorIA"` en el subtítulo.
   - **Fuera de alcance**: el enlace «¿Dónde obtengo una API key?» por proveedor, que aparece en el mockup. Necesita un campo nuevo en el catálogo del backend y se deja para un plan aparte.
4. **Tests**: se actualizan `DocumentsPage.test.tsx` (`:87,150,186`), `GoalsPage.test.tsx` (`:192`), `SettingsPage.test.tsx` y `ProviderSetup.test.tsx` con los textos nuevos. Además:
   - test de que aparece la guía;
   - test del CTA «Generar un plan con esta meta» con el `href` correcto;
   - test del motivo visible y `aria-describedby` en «Activar» desactivado.

### Fase 3: Páginas de estudio (Plan, Detalle, Sesión, Práctica)

1. **`pages/PlanPage.tsx`**
   - `PageGuide id="plan"`.
   - Lee `useSearchParams().get("meta")`. Si coincide con una meta existente, la preselecciona.
   - Sin metas (`:141-143`): «Necesitas una meta. Créala en **Metas** o hazlo todo de una vez en **Inicio**.», con dos `ButtonLink` secundarios.
   - Con metas pero ninguna seleccionada: el motivo «Elige una meta.» se añade a la lista de motivos bajo «Generar plan», enlazada con `aria-describedby`.
   - La lista de planes vacía (`:213`) pasa a un `EmptyState`: icono `CalendarDays`, título «Aún no tienes planes», descripción «Un plan reparte tu material en sesiones cortas con repasos programados.» y CTA «Preparar mi primer plan» → `/inicio#preparar-plan`.
   - Filas: en PROCESSING se muestra «Generando…» en lugar de «0 sesiones» (`:270`); en FAILED, «Ver qué falló».
2. **`pages/PlanDetailPage.tsx`, `components/plan/SessionTimeline.tsx`**
   - PROCESSING (`:90-100`): `h1` con `{plan.title}` y el `Badge` «Generando». Debajo, la lista «Qué está haciendo la IA»:
     1. «Lee tu material y detecta los temas.»
     2. «Elige los temas clave.»
     3. «Prepara cada sesión con material y preguntas.»

     Nota: «Suele tardar unos minutos. Esta página se actualiza sola; puedes salir y volver.»
   - READY: bajo el subtítulo, `StepChain` con `label="Cómo es cada sesión"` y los pasos Estudio, Receso (5 min) y Test, con iconos `BookOpen`, `Coffee` y `ClipboardCheck`.
   - `HelpTerm term="repaso"` en «repaso a N días» (`SessionTimeline.tsx:112`). `HelpTerm term="relevancia"` en «relevancia estimada» (`:210`).
   - «Ver análisis Pareto» pasa a «Ver temas clave».
   - El ID inválido (`:30`) pasa a «Este enlace de plan no es válido.»
   - «Sin sesiones» (`:181`) pasa a un `EmptyState` con el CTA «Volver a Plan de estudio».
3. **`pages/SessionPage.tsx`, `components/session/StudyPhase.tsx`, `QuizPhase.tsx`, `SessionResult.tsx`**
   - Se reescribe `PhaseIndicator` (`:164-180`):
     - un `<ol aria-label="Progreso de la sesión">` con Estudio, Receso y Test;
     - la fase actual lleva `aria-current="step"` y estilo destacado (`Badge color="brand"` más un borde o anillo);
     - las fases pasadas llevan un icono `Check` y estilo atenuado positivo;
     - las futuras van en `slate`;
     - se añade el texto visible «Paso X de 3»;
     - cuando la fase es `done`, las tres se muestran como hechas.
   - Bajo el h1 se añade la línea de ayuda: «Estudia el material. Cuando acabe el tiempo pasarás a un receso de 5 min y después al test.»
   - `StudyPhase`: antes de «Iniciar», el texto «El temporizador pasa solo al receso cuando termina. Puedes saltarlo con «Saltar al receso».»
   - `QuizPhase`:
     - Las valoraciones 0–5 muestran el texto visible de `QUALITY_LABELS` (en un grid de 2 o 3 columnas en móvil, con número y texto corto), no solo en `aria-label`.
     - «(SM-2)» (`:192`) se elimina. La leyenda pasa a «¿Qué tan bien la recordaste? Esto decide cuándo vuelve a salir (`<HelpTerm term="repaso">repaso espaciado</HelpTerm>`).»
     - Pista bajo «Siguiente»/«Finalizar» cuando está desactivado, con `aria-describedby`: en opción múltiple, «Elige una respuesta para continuar»; en flashcard, «Muestra la respuesta y valora cuánto la recordabas».
     - «No hay preguntas…» (`:74`) pasa a un `EmptyState` con el CTA «Volver al plan».
   - `SessionResult.tsx`:
     - añadir «Las tarjetas no puntúan: tu valoración decide cuándo las repasarás.»;
     - «reprogramaron con SM-2» (`:45`) pasa a «se programaron para repasar más adelante».
   - «Sesión completada.» (`SessionPage.tsx:151`) pasa a una `Card` con los CTA «Volver al plan» e «Ir a Inicio».
   - Hay que comprobar qué fases y estados usan los E2E (`frontend/e2e/`) y actualizar sus selectores si cambian.
4. **`pages/PracticePage.tsx`**
   - `PageGuide id="practica"`. Se añade `HelpTerm term="simulacro"` en el subtítulo.
   - Con un único plan, se muestra «Practicando con: {plan.title}» (`:130`).
   - Pista visible con `aria-describedby` bajo «Siguiente pregunta»/«Terminar ronda» cuando está desactivado (`:361`).
   - «Sin preguntas» (`:213`) y «sin sesiones» (`:373`) pasan a `EmptyState` con el CTA «Ver mi plan» → `/plan/{id}`.
5. **Tests**:
   - `PhaseIndicator`: `aria-current` y el texto «Paso 1 de 3».
   - `QuizPhase`: las etiquetas visibles y la pista con el botón desactivado.
   - `PlanPage`: el estado vacío con CTA y la preselección con `?meta=`.
   - Se actualiza `PracticePage.test.tsx` si cambia algún texto que comprueba.

### Fase 4: Temas clave y Estadísticas

1. **`pages/TopicsPage.tsx`**
   - h1 «Temas clave». Subtítulo: «Los temas de tu material que la IA considera más importantes (`<HelpTerm term="temasClave">regla 80/20</HelpTerm>`). Los porcentajes son una estimación, no una garantía.»
   - `PageGuide id="temas"`.
   - «Dificultad estimada: X de 5» pasa a «Dificultad estimada: X de 5 (5 = más difícil)».
   - «Sin análisis» (`:93`) pasa a un `EmptyState` con el CTA «Ver mi plan».
   - Hay que actualizar `TopicsPage.test.tsx` (`:79` comprueba «Prepara tu plan en Inicio», que puede mantenerse).
2. **`pages/DashboardPage.tsx`**
   - Si el usuario no ha resuelto ningún quiz (comprobar el campo de `DashboardDTO` en `api/types.ts`, por ejemplo `total_quizzes === 0`), se muestra un **`EmptyState`** en lugar de los tiles y la gráfica:
     - icono `ChartColumn`;
     - título «Aquí verás tu progreso»;
     - descripción «Cuando completes tu primera sesión aparecerán tus aciertos, tu racha y tus próximos repasos.»;
     - CTA «Ir a mi siguiente sesión» → `/session/{id}` si `findNextSession(plans)` devuelve algo; si no, «Preparar mi plan» → `/inicio#preparar-plan`.
   - El selector de periodo 7d/30d/Todo se oculta mientras no haya datos.
   - Subtítulo: «Tu progreso en los tests y tus próximos `<HelpTerm term="repaso">repasos</HelpTerm>`.» (sin «(SM-2)»).
   - `HelpTerm` en «Precisión media» (`:119-123`) y en «tarjeta(s)» (`:268`).
   - Vacíos de secciones:
     - «Sin datos todavía.» (`:234`) pasa a «Aparecerán cuando falles preguntas de algún tema.»
     - «No hay revisiones programadas.» (`:261`) pasa a «Al completar una sesión programaremos tus repasos aquí.»
   - Hay que actualizar `DashboardPage.test.tsx` (`:42,46` comprueban `/Completa una sesión/`) y añadir un test del estado vacío con los dos CTA posibles.

### Fase 5: Documentación y cierre

- `CLAUDE.md`, en la sección «Frontend» (lista de rutas): `/settings` («Conectar IA»), `/temas` («Temas clave»). Hay que añadir una frase sobre los componentes de ayuda:
  > «La ayuda contextual vive en `src/components/help/` (`PageGuide`, `HelpTerm`) con textos en `src/lib/pageGuides.ts` y `src/lib/glossary.ts`; el estado de guías cerradas va en `localStorage` vía `src/lib/onboardingStorage.ts` (siempre con try/catch). Reutilízalos en páginas nuevas en vez de crear otro patrón.»
- `README.md`: renombrar las etiquetas del menú si aparecen.
- `docs/AGENTS_STATUS.md`: una entrada breve con el estado de este trabajo.
- Añadir al principio de este documento: `Estado: implementado (commits …)`.

## 7. Textos de las guías (`src/lib/pageGuides.ts`)

| id | Título | Pasos | Siguiente |
|---|---|---|---|
| `recursos` | ¿Cómo funciona Recursos? | 1. Sube un PDF o Markdown (apuntes, temario, libro). 2. Espera a que aparezca «Listo para usar» (unos segundos). 3. Elígelo al preparar tu plan. | Elegir mi meta → `/goals` |
| `metas` | ¿Para qué sirve una meta? | 1. Elige una plantilla o escribe tu objetivo. 2. Elige el tipo de estudio: cambia la mezcla de preguntas y tarjetas. 3. Úsala para generar tu plan. | Generar mi plan → `/plan` |
| `conectar-ia` | ¿Necesito conectar una IA? | 1. No es obligatorio: sin clave, StudyAI usa el modo demo con respuestas de ejemplo. 2. Para planes reales, pega tu clave en un proveedor y guárdala. 3. Elige un modelo y pulsa «Probar configuración guardada». 4. Si la prueba sale bien, pulsa «Activar». | Volver a Inicio → `/inicio` |
| `plan` | ¿Cómo se crea un plan? | 1. Elige una meta y los documentos que quieres estudiar. 2. Pulsa «Generar plan»: la IA tarda unos minutos. 3. Abre el plan y empieza por la primera sesión. | — |
| `practica` | Dos formas de practicar | 1. **Preguntas**: repasa con respuesta inmediata; no se guarda nada. 2. **Simulacro**: haz el test de una sesión; tu resultado cuenta en Estadísticas y en tus repasos. | — |
| `temas` | ¿Qué son los temas clave? | 1. La IA lee tu material y estima qué temas importan más. 2. Tu plan se centra en los marcados como prioritarios. 3. El resto queda fuera para que estudies menos y mejor. | Ver mi plan → `/plan` |

Inicio no lleva `PageGuide`: allí cumple esa función la checklist «Primeros pasos». La Sesión tampoco: la sustituyen el `PhaseIndicator` mejorado y la línea de ayuda. El Detalle de plan usa el `StepChain` «Cómo es cada sesión». Estadísticas usa su `EmptyState`. Si al implementar parece útil, se puede añadir guía a Estadísticas.

## 8. Criterios de aceptación

- [ ] Con la base de datos vacía, cada página dice en menos de 10 segundos qué hace y cuál es el siguiente paso. Ninguna página muestra un `<p>` vacío sin explicación, ni tiles llenos de ceros.
- [ ] La checklist «Primeros pasos» refleja datos reales, avanza al completar cada paso y desaparece al completar la primera sesión o al ocultarla.
- [ ] Las guías se cierran, siguen cerradas tras recargar y se reabren con «¿Cómo funciona esta página?». Con `localStorage` bloqueado todo funciona y las guías se ven abiertas.
- [ ] Todo botón principal desactivado muestra un motivo visible enlazado con `aria-describedby`.
- [ ] La jerga (Pareto, SM-2, indexar, simulacro, tarjeta, proveedor, relevancia, dificultad) desaparece de los textos visibles o lleva un `HelpTerm`.
- [ ] La sesión muestra «Paso X de 3» con `aria-current`. Las valoraciones 0–5 tienen texto visible.
- [ ] Las etiquetas del menú son «Conectar IA» y «Temas clave» en el menú lateral, la barra móvil, los títulos de documento, los tests, los E2E, el README y CLAUDE.md.
- [ ] Un `h1` por página, en todos los estados (incluido el PROCESSING del detalle de plan), sin saltos de nivel.
- [ ] `npm run lint`, `npm test` y `npm run build` en verde. `npm run test:e2e` en verde si el entorno lo permite (si no, indicarlo).
- [ ] No se añaden dependencias nuevas en `package.json`.

## 9. Verificación manual (usuario nuevo)

1. Backend en modo demo con una base de datos limpia. Desde `backend/`:
   ```bash
   export DATABASE_URL=sqlite:////tmp/studyai-onb/studyai.db \
          UPLOAD_DIR=/tmp/studyai-onb/uploads \
          CHROMA_PERSIST_DIR=/tmp/studyai-onb/chroma \
          ANTHROPIC_API_KEY=
   uvicorn main:app --port 8001
   ```
   Primero hay que confirmar en `app/core/config.py` los nombres exactos de las variables y el formato de `DATABASE_URL`.
2. `cd frontend && npm run dev` y abrir `http://localhost:5173/inicio` en una ventana privada (con `localStorage` limpio).
3. Recorrer todas las páginas del menú con cero datos, a 375 px y a 1280 px.
4. Completar el flujo: subir un `.md` → meta → plan → primera sesión. Comprobar que la checklist avanza y desaparece.
5. Cerrar dos guías, recargar y comprobar que siguen cerradas. Después reabrirlas.
6. Solo con teclado: Tab hasta un `HelpTerm`, Enter para abrir, Esc para cerrar (el foco vuelve). Tab por `PageGuide` y por las valoraciones 0–5.
7. Si está disponible, usar la skill `browser-testing-with-devtools` o Playwright para hacer capturas de cada página vacía y comprobar que no hay errores en la consola.

## 10. Fuera de alcance / futuro

- Enlaces «¿Dónde obtengo una API key?» por proveedor. Requiere un campo nuevo en `ProviderMeta` del backend, que se sirve en `GET /llm-settings/catalog`.
- Tour guiado con burbujas: descartado por decisión del usuario.
- Reordenar el menú según el flujo: descartado, se mantiene el orden del mockup.
- Datos de ejemplo precargados (*seed*) para un usuario nuevo: `/demo` ya ofrece un recorrido con datos locales.
- Página de ayuda o FAQ dentro de la app: se puede derivar más adelante de `glossary.ts` y `pageGuides.ts`.

## 11. Notas de implementación (desviaciones)

- **StudySetup «Tipo de estudio»**: la definición del tipo se muestra como `hint` visible del `Select` (`GOAL_TYPE_DESCRIPTIONS`) en lugar de un `HelpTerm`: un botón dentro de un `<label>` interfiere con el clic del campo.
- **«repaso a N días»** (`SessionTimeline`): cada fila es un enlace, y un botón dentro de un enlace no es HTML válido. El `HelpTerm` de repaso va en la nota al pie de la línea de tiempo. Igual con «relevancia estimada» en el detalle del plan: una frase bajo «Temas prioritarios».
- **Metas**: «Guardar meta» ya no se desactiva con el título vacío; al pulsarlo aparece el error enlazado al campo.
- **Recursos**: el aviso de error de actualización conserva el matiz «puede que falte algo», porque la lista puede incluir filas sembradas por una subida sin confirmar.
- **Estadísticas**: «Sin datos todavía» pasa a «Aparecerán cuando respondas preguntas de opción múltiple»: el backend lista todos los temas calificados, no solo los fallados. El estado vacío se usa cuando no hay tests ni sesiones completadas.
- **Checklist**: desaparece al completar la primera sesión aunque el paso «Conecta tu IA» siga sin marcar.
- **Terminología**: «Quiz»/«quizzes» pasa a «Test»/«tests» también en Estadísticas, y «Flashcard» a «Tarjeta» en las insignias.
- **Checklist en horizontal (2026-10-18)**: «Primeros pasos» pasa de lista vertical a un recorrido horizontal (vertical bajo `lg`) con flechas entre pasos. Cada paso se desbloquea al completar el obligatorio anterior (los pendientes bloqueados no son enlaces y llevan «bloqueado» para lectores de pantalla); «Conecta tu IA (opcional)» no bloquea al siguiente y «Siguiente» solo marca pasos obligatorios. Se quitó la barra de progreso (el recorrido ya lo muestra) y «Seguir con el modo demo» pasó a una línea bajo el recorrido.
- **Inicio como asistente de un paso a la vez (2026-10-18)**: para un usuario sin plan, Inicio muestra solo el asistente (Material → Meta → IA → Listo) con «Continuar» bloqueado (y su motivo visible) hasta completar cada paso; «Estudiar» solo aparece en el último. La checklist «Primeros pasos» y la cita decorativa solo se muestran cuando ya hay un plan listo. El paso de IA ya no se da por hecho con el modo demo: exige un proveedor real (clave propia, Ollama o clave del servidor) o pulsar «Seguir en modo demo». Sin clave se ofrece «Aún no tengo API key» (enlaces a las consolas de los proveedores) y «Usar Ollama (gratis)» (comandos copiables). El modo demo sigue siendo una salida explícita para no romper la garantía de que la app funciona sin claves.
