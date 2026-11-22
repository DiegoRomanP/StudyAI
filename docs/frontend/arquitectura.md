# Arquitectura frontend

> **Leer antes de** crear una página, ruta, hook o llamada a la API. Reglas obligatorias resumidas:
> `.claude/rules/frontend-ui.md`.

Vite + React 18 + TypeScript + Tailwind + TanStack Query + React Router + Axios.

## Capas

`src/pages/` (una por ruta) → `src/components/<dominio>/` → `src/hooks/` (TanStack Query: queries,
mutations, polling) → `src/api/` (frontera tipada de Axios). `apiClient` (`src/api/client.ts`) es la única
instancia de Axios (`VITE_API_URL`, default `http://localhost:8001`). Las páginas no llaman a Axios
directamente: usan un hook. Lógica pura en `src/lib/` (con tests).

## Rutas (`App.tsx`)

Públicas: `/` (landing) y `/demo` (recorrido simulado con datos locales — **nunca importa el cliente de
API**). Dentro de `AppShell`: `/inicio` (home + asistente de configuración + coordinador «Estudiar»,
`useStudyStart`), `/plan`, `/plan/:planId`, `/session/:sessionId` (`?fase=test` abre el test; se renderiza
con `AppShell chrome="focus"`: solo `<main>`, sin navegación), `/practica` (práctica de solo lectura; nunca
escribe), `/temas` («Temas clave»), `/documents` («Recursos»), `/goals`, `/dashboard` («Estadísticas»),
`/preguntas` («Mis preguntas») y `/settings` («Conectar IA»).

## Convenciones que hay que reutilizar

| Necesitas | Usa |
|---|---|
| Parsear fechas del backend (UTC naive) | `parseApiDate` (`src/lib/studyProgress.ts`), nunca `new Date()` |
| Esperar un plan en PROCESSING | `usePlan` (polling cada 3 s con `refetchInterval`) |
| Lista larga «Tus …» | `useShowMore` (`src/hooks/useShowMore.ts`): corta a 6 con «Mostrar N más», en cliente (no hay paginación en backend); hoy en `DocumentsPage`/`GoalsPage`/`PlanPage` |
| Panel de confirmación / modal | `components/Dialog.tsx` |
| Estado vacío con CTA | `components/EmptyState.tsx` |
| Ayuda contextual | `PageHeader` (prop `help`), `HelpTip`, `HelpTerm`, `usePopover` (ver [funcionalidades/ayuda-y-onboarding.md](funcionalidades/ayuda-y-onboarding.md)) |
| Animar una entrada (ruta, fase, paso, superficie) | `useEnterAnimation` + presets (`components/motion/`); ver «Movimiento» en [diseno/sistema-visual.md](diseno/sistema-visual.md) |
| Carga / error de una query | `components/AsyncState.tsx` |
| Pintar Markdown del LLM | `SafeMarkdown` (ver [seguridad.md](seguridad.md)) |
| Barajar con orden estable | `seededShuffle` (`lib/shuffle.ts`) |
| Persistir algo por navegador | `localStorage` **siempre en try/catch** (patrón de `lib/onboardingStorage.ts`, `lib/quizDraft.ts`, `lib/reinforcePreference.ts`) |
| Modo de despliegue | `useAppConfig` (`GET /config`) |
| Mensajes de error de la API | `src/api/errors.ts` |
| Tiempo relativo | `lib/timeAgo.ts` |

Un botón principal deshabilitado siempre muestra su motivo visible enlazado con `aria-describedby`.

## Carga

- **Esqueleto con la forma del contenido**, nunca spinner de página completa: cada página pasa a `AsyncState` (`loading`) o pinta directamente `Skeleton` con la geometría real (filas de plan/meta/documento, rejilla de temas, 4 tiles + bloque del dashboard, proveedores). El fallback de `Suspense` en `App.tsx` es `components/PageSkeleton.tsx`.
- Los textos de carga siguen en un contenedor `role="status"` con su nombre (`loadingLabel`, «Cargando plan…», «Cargando proveedores…»…): los tests y lectores de pantalla dependen de ellos.
- `Skeleton` lleva `skeleton-delay` (aparece tras 150 ms: sin destello en cargas rápidas).
- `AsyncState` anima el contenedor con `useEnterAnimation(ref, "content", hasData, { skipFirst: true })`: solo en «cargando → datos», no en refetch ni con caché.
- «Actualizando datos…» es una píldora `absolute` arriba a la derecha (`pointer-events-none`): refrescar no empuja el contenido.
- Usa `isPending` (no `isLoading`) para decidir «cargando»: sin red la query queda pausada y `isLoading` sería `false`, lo que mostraría un vacío falso (patrón de `PlanPage`, aplicado también a `DocumentsPage` y `SettingsPage`).
