# Ingesta de documentos, figuras y estímulos ricos

> **Leer antes de** tocar `app/processors/`, `app/rag/`, `document_service.py`,
> `document_asset_service.py`, `app/pedagogy/svg_sanitizer.py` o `app/pedagogy/stimuli.py`.

## Pipeline de ingesta

Background task with its own DB session: Validate → Parse (`DocumentProcessorFactory`) → Describe →
Chunk → Embed → Store (`app/processors/pipeline.py`). Cada paso pesado tiene fallback puro (ver
[../arquitectura/capas-y-patrones.md](../arquitectura/capas-y-patrones.md#dual-implementation-with-fallback-invariante-del-modo-demo)).

## Almacenamiento y validación de subidas

- `app/storage/file_storage.py`: `FileStorage` (`save`, `local_copy`, `delete`, `delete_prefix`) con
  `LocalFileStorage` (raíz `UPLOAD_DIR`) y `S3FileStorage` (boto3 perezoso, endpoint genérico: R2/S3),
  elegido por `get_file_storage()` según `STORAGE_BACKEND`. Con `s3` sin variables o sin boto3 cae a local
  con un warning. Las claves son `users/{user_id}/documents/{uuid}.{ext}` (`Document.storage_path`) y
  `assets/{document_id}/{sha256}.png` (figuras); una ruta absoluta antigua en local se usa tal cual.
  Una clave relativa que sale de la raíz se rechaza (path traversal).
- El pipeline siempre lee y extrae en un directorio temporal (`local_copy` + `TemporaryDirectory`); las
  figuras conservadas se guardan después en el storage y la ruta las sirve leyendo de él.
- `DocumentService.create_upload` valida: extensión, tamaño (`MAX_UPLOAD_MB`), no vacío, `%PDF-` al inicio
  para PDF, UTF-8 válido para `.md`; el nombre se sanea (`sanitize_filename`: sin directorios ni caracteres
  de control, 255 caracteres máx. conservando la extensión). El nombre es solo informativo: el archivo se
  guarda bajo una clave generada. Errores: `ValidationError` (400).
- Pendiente (E2 del plan): PDF cifrado y `MAX_PDF_PAGES` al procesar.

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
