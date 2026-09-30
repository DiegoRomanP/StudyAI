const BYTES_PER_KILOBYTE = 1024;
const KILOBYTES_PER_MEGABYTE = 1024;

export const MAX_DOCUMENT_SIZE_BYTES = 25 * BYTES_PER_KILOBYTE * KILOBYTES_PER_MEGABYTE;
export const MAX_DOCUMENT_SIZE_MB = MAX_DOCUMENT_SIZE_BYTES / (BYTES_PER_KILOBYTE * KILOBYTES_PER_MEGABYTE);

const ALLOWED_EXTENSIONS = new Set(["pdf", "md", "markdown"]);

export function validateDocumentFile(file: Pick<File, "name" | "size">): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return "Formato no compatible. Elige un archivo PDF o Markdown (.md o .markdown).";
  }

  if (file.size === 0) {
    return "El archivo está vacío.";
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `El archivo supera el máximo de ${MAX_DOCUMENT_SIZE_MB} MB.`;
  }

  return null;
}
