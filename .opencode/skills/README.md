# Skills de diseño y frontend

Estas skills son locales al proyecto y OpenCode las descubre desde `.opencode/skills/`. Se pueden invocar como comandos escribiendo el nombre con `/` o mencionarlas en el prompt.

## Agente `frontend-dev`

Selecciona `frontend-dev` desde el selector `/agents` de OpenCode o recorre los agentes principales con `Tab`. Este agente prioriza la meta de la tarea, carga solo las skills pertinentes y verifica el resultado contra criterios de aceptación.

| Comando | Uso en StudyAI | Origen |
| --- | --- | --- |
| `/find-skills` | Buscar skills adicionales por tema. | [vercel-labs/skills](https://skills.sh/vercel-labs/skills/find-skills) |
| `/redesign-existing-projects` | Auditar y mejorar la interfaz actual sin rehacer la app ni romper flujos existentes. | [leonxlnx/taste-skill](https://skills.sh/leonxlnx/taste-skill/redesign-existing-projects) |
| `/ui-ux-pro-max` | Elegir paleta, tipografía, estructura responsive y patrones de usabilidad/accesibilidad con su catálogo local. | [nextlevelbuilder/ui-ux-pro-max-skill](https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max) |
| `/frontend-design` | Implementar una dirección visual distintiva y pulida para páginas y componentes. | [anthropics/skills](https://skills.sh/anthropics/skills/frontend-design) |
| `/web-design-guidelines` | Revisar UX, accesibilidad y cumplimiento de pautas web antes de cerrar cambios. | [vercel-labs/agent-skills](https://skills.sh/vercel-labs/agent-skills/web-design-guidelines) |

## Flujo sugerido

Para rediseñar StudyAI, empieza con `/redesign-existing-projects` y `/ui-ux-pro-max`; aplica `/frontend-design` durante la implementación y termina con `/web-design-guidelines`. Usa `/find-skills` cuando quieras ampliar este conjunto.

Ejemplo: `Usa /redesign-existing-projects y /ui-ux-pro-max para revisar la experiencia del dashboard de StudyAI, conservar sus flujos actuales y proponer una paleta, jerarquía visual y mejoras de usabilidad.`

Las instrucciones de `ui-ux-pro-max` y `web-design-guidelines` incluyen ajustes pequeños para resolver sus rutas y herramientas específicas de OpenCode.

El índice `skills-lock.json` conserva los orígenes y hashes registrados por el CLI `npx skills`. El CLI instala OpenCode en `.agents/skills`; para mantener el estándar del proyecto, estas skills están ubicadas en `.opencode/skills`. Al instalar más con el CLI, mueve la carpeta de la skill a esta ubicación. Reinicia OpenCode después de agregar o cambiar skills para que las cargue.
