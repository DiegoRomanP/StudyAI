# Seguridad en el frontend (no regresar)

> **Leer antes de** pintar cualquier cosa generada por el LLM (texto, enlaces, imágenes, SVG, recursos).

- **YouTube**: los enlaces se construyen siempre como *URL de búsqueda* a partir de las keywords del LLM
  (`src/lib/youtube.ts`). Nunca se renderiza una URL generada por el LLM.
- **Markdown**: `SafeMarkdown` renderiza tablas GFM y fórmulas KaTeX (`$...$`, `trust: false`). Imágenes y
  enlaces del LLM siguen **bloqueados**.
- **SVG de estímulos v2**: solo como `<img>` con data URI (`SvgFigure` en `LessonBlocks.tsx`), nunca inline
  en el DOM. El backend ya lo sanea (ver [../backend/documentos/ingesta-y-figuras.md](../backend/documentos/ingesta-y-figuras.md)).
- **Figuras del documento**: URL construida desde el ID numérico (`DocumentFigure`), nunca desde texto del LLM.
- **Ayuda de IA**: comandos de Ollama y fuentes de claves viven en `lib/aiSetupHelp.ts` como texto y URLs
  fijos, nunca generados por el LLM.
- **Claves**: el navegador nunca recibe una clave; solo `key_preview`.
