# Skills de diseño y frontend

Estas skills son locales al proyecto y OpenCode las descubre desde `.opencode/skills/`. Se pueden invocar como comandos escribiendo el nombre con `/` o mencionarlas en el prompt.

## Agente `frontend-dev`

Selecciona `frontend-dev` desde el selector `/agents` de OpenCode o recorre los agentes principales con `Tab`. Este agente prioriza la meta de la tarea, carga solo las skills pertinentes y verifica el resultado contra criterios de aceptación.

## Equipo del plan frontend

Para ejecutar una actividad de [`docs/Plan-New-Frontend.md`](../../docs/Plan-New-Frontend.md), selecciona el agente principal `Dev-Project` en OpenCode y escribe, por ejemplo: `Haz la tarea 1 de @docs/Plan-New-Frontend.md`. `Dev-Project` (GPT-6 Sol/max) encarga la implementación a `Dev-Code` (GPT-6 Luna/max), espera su resultado y después encarga la revisión independiente a `Dev-Reviewer` (GPT-6 Sol/high). Si encuentra bloqueantes corregibles, coordina una corrección y una nueva revisión antes del veredicto. Estos agentes solo existen en `.opencode/agent/` de este proyecto; `frontend-dev` sigue disponible para solicitudes generales de interfaz.

Los agentes cargan las skills pertinentes según la actividad, no todas a la vez. Las cuatro skills adicionales buscadas para este equipo son:

| Skill | Aplicación | Origen |
| --- | --- | --- |
| `/test-driven-development` | `Dev-Code`: prueba fallida, cambio y prueba verde para actividades de comportamiento. | [obra/superpowers](https://skills.sh/obra/superpowers/test-driven-development) |
| `/code-review-and-quality` | `Dev-Reviewer`: auditar corrección, arquitectura, seguridad y rendimiento. | [addyosmani/agent-skills](https://skills.sh/addyosmani/agent-skills/code-review-and-quality) |
| `/playwright-best-practices` | Ambos: configurar/revisar Playwright Test TypeScript, fixtures, selectores y esperas. | [currents-dev/playwright-best-practices-skill](https://skills.sh/currents-dev/playwright-best-practices-skill/playwright-best-practices) |
| `/accessibility` | Ambos: comprobar teclado, foco, zoom, contraste y lector de pantalla. | [addyosmani/web-quality-skills](https://skills.sh/addyosmani/web-quality-skills/accessibility) |

`Dev-Project` usa `/writing-plans` si la actividad exige desglose adicional y `/verification-before-completion` antes de concluir. `Dev-Code` también puede usar `/frontend-design`, `/ui-ux-pro-max`, `/penpot-design-to-code-review`, `/webapp-testing` y `/vercel-react-best-practices` según el alcance; `Dev-Reviewer` usa las guías de revisión visual y accesibilidad cuando correspondan. La fuente de aceptación sigue siendo el plan, no las recomendaciones genéricas de una skill. Antes de las actividades funcionales, el plan exige acordar el destino tras `READY` y el alcance de idempotencia (sección 8).

| Comando | Uso en StudyAI | Origen |
| --- | --- | --- |
| `/find-skills` | Buscar skills adicionales por tema. | [vercel-labs/skills](https://skills.sh/vercel-labs/skills/find-skills) |
| `/redesign-existing-projects` | Auditar y mejorar la interfaz actual sin rehacer la app ni romper flujos existentes. | [leonxlnx/taste-skill](https://skills.sh/leonxlnx/taste-skill/redesign-existing-projects) |
| `/ui-ux-pro-max` | Elegir paleta, tipografía, estructura responsive y patrones de usabilidad/accesibilidad con su catálogo local. | [nextlevelbuilder/ui-ux-pro-max-skill](https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max) |
| `/frontend-design` | Implementar una dirección visual distintiva y pulida para páginas y componentes. | [anthropics/skills](https://skills.sh/anthropics/skills/frontend-design) |
| `/web-design-guidelines` | Revisar UX, accesibilidad y cumplimiento de pautas web antes de cerrar cambios. | [vercel-labs/agent-skills](https://skills.sh/vercel-labs/agent-skills/web-design-guidelines) |
| `/writing-plans` | Convertir requisitos en tareas pequeñas con archivos, interfaces, pruebas y comandos de verificación concretos. | [obra/superpowers](https://skills.sh/obra/superpowers/writing-plans) |
| `/webapp-testing` | Probar recorridos de la aplicación local en navegador con Playwright y revisar capturas/logs. | [anthropics/skills](https://skills.sh/anthropics/skills/webapp-testing) |
| `/vercel-react-best-practices` | Consultar pautas de rendimiento para React; aplicar solo las compatibles con React 18 + Vite y conservar TanStack Query. | [vercel-labs/agent-skills](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) |
| `/penpot-design-to-code-review` | Comparar una selección de Penpot con el componente implementado y reportar diferencias visuales/estados sin modificar el lienzo. | [penpot/penpot-ai-kit](https://skills.sh/penpot/penpot-ai-kit/penpot-design-to-code-review) |
| `/verification-before-completion` | Exigir resultados de verificación recientes antes de marcar una tarea como completada. | [obra/superpowers](https://skills.sh/obra/superpowers/verification-before-completion) |

## Flujo sugerido

Para implementar el frontend de Penpot, usa `/writing-plans` para desglosar `docs/fronted-design.md`, conserva `/redesign-existing-projects` y `/ui-ux-pro-max` para orientar el trabajo visual, y aplica `/frontend-design` en componentes concretos. Comprueba los recorridos con `/webapp-testing`, compara pantallas implementadas con `/penpot-design-to-code-review` y cierra cada entrega con las pruebas del proyecto y `/verification-before-completion`. Al consultar `/vercel-react-best-practices`, filtra las recomendaciones para Next.js o APIs posteriores a React 18 que no correspondan al stack actual.

`webapp-testing` incluye un ayudante Python para gestionar servidores; úsalo como herramienta complementaria a Vitest/Testing Library y adapta las esperas a los estados de polling de StudyAI.

Ejemplo: `Usa /redesign-existing-projects y /ui-ux-pro-max para revisar la experiencia del dashboard de StudyAI, conservar sus flujos actuales y proponer una paleta, jerarquía visual y mejoras de usabilidad.`

Las instrucciones de `ui-ux-pro-max` y `web-design-guidelines` incluyen ajustes pequeños para resolver sus rutas y herramientas específicas de OpenCode.

El índice `skills-lock.json` conserva los orígenes y hashes registrados por el CLI `npx skills`. El CLI instala OpenCode en `.agents/skills`; para mantener el estándar del proyecto, estas skills están ubicadas en `.opencode/skills`. Al instalar más con el CLI, mueve la carpeta de la skill a esta ubicación. Reinicia OpenCode después de agregar o cambiar skills para que las cargue.
