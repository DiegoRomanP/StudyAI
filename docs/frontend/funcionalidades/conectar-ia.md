# Conectar IA (SettingsPage), estado de la IA y modo de despliegue

> **Leer antes de** tocar `SettingsPage.tsx`, `components/llm/`, el paso «Elige tu IA» de `StudySetup`
> o cualquier indicador de "modo demo". Backend: [../../backend/llm/](../../backend/llm/).

- `SettingsPage` renders one card per `PROVIDER_CATALOG` entry, **fetched from the backend**
  (`GET /llm-settings/catalog`), not hardcoded, so the provider list/model suggestions never drift from the
  backend registry.
- Flujo por proveedor: guardar clave → elegir modelo (borrador) → probar esa revisión → activar solo con
  evidencia del servidor. Cambiar el modelo invalida la verificación anterior.
- `GET /llm-settings/runtime` dice qué IA se usará. **Muestra "modo demo" únicamente cuando
  `source === "MOCK"`**, e invalida ese estado tras guardar, probar, activar, desactivar o eliminar una
  credencial.
- **Modo de despliegue** (`useAppConfig`, `GET /config`): en `saas` oculta «Conectar IA», responde
  not-found en `/settings` y quita el paso «Elige tu IA» y su item de checklist. Mientras `/config` carga,
  la UI se comporta como self-hosted. Ocultar es cortesía: el backend lo impone.
- Paso «Elige tu IA» (siempre visible en self-hosted) con tres opciones: «Gratis · N al día» (solo si
  `runtime.free_ai` existe; «Usar la IA gratuita» desactiva las credenciales propias), «Mi API key» (con
  «¿Cómo conseguir una API key?» desplegable) y «En local (Ollama)». Exige un proveedor real, la IA gratuita
  con usos disponibles, o elegir el modo demo de forma explícita (`useDemoAccepted`, flag compartida con la
  checklist). Textos y URLs fijos en `lib/aiSetupHelp.ts`.
