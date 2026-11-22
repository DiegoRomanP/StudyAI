# Ingesta de documentos, figuras y estímulos ricos

> **Leer antes de** tocar `app/processors/`, `app/rag/`, `document_service.py`,
> `document_asset_service.py`, `app/pedagogy/svg_sanitizer.py` o `app/pedagogy/stimuli.py`.

## Pipeline de ingesta

Background task with its own DB session: Validate → Parse (`DocumentProcessorFactory`) → Describe →
Chunk → Embed → Store (`app/processors/pipeline.py`). Cada paso pesado tiene fallback puro (ver
[../arquitectura/capas-y-patrones.md](../arquitectura/capas-y-patrones.md#dual-implementation-with-fallback-invariante-del-modo-demo)).

## Figuras del documento

- **Describe step** (`app/services/document_asset_service.py::FigureDescriber`): each extracted image
  ≥ 64 px, deduplicated by hash, capped at `PDF_MAX_IMAGES`, becomes a `DocumentAsset` row and an indexed
  marker `[figura:N] description`. Only a provider with `supports_images` (the agent CLIs) describes it, one
  `image_description` call per figure (budget 512); the first failure stops the rest and a description
  failure never fails the document. The bundled free AI and the mock never get these calls. Without the hook
  the pipeline strips image references (`drop_images`), so no server path reaches RAG.
- `GET /documents/figures/{asset_id}` serves the PNG after checking the owning document (404 otherwise);
  `delete_document` removes the rows and the folder explicitly (FK cascade inert on SQLite).

## Estímulos v2 (`svg`, `figure`)

- `svg` (generated_example): `app/pedagogy/svg_sanitizer.py` rebuilds it from an element/attribute
  allowlist, idempotent because stored payloads revalidate.
- `figure` (derived): `asset_id` must appear as `[figura:N]` in the cited fragment, so only the plan's own
  figures.
- The prompt offers them only when the provider has `rich_content` (the agent CLIs) — everyone else gets the
  unchanged prompt — and still in the one `session_content` call.
- Frontend: SVG only as an `<img>` data URI; figure URL built from the numeric ID (ver
  [../../frontend/seguridad.md](../../frontend/seguridad.md)).
