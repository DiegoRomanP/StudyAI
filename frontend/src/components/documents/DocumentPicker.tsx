import { useEffect, useId, type ReactNode } from "react";

import type { DocumentDTO } from "../../api/types";

interface DocumentPickerProps {
  documents: DocumentDTO[];
  selectedDocumentIds: number[];
  onSelectionChange: (documentIds: number[]) => void;
  emptyState?: ReactNode;
}

function getStatusLabel(document: DocumentDTO) {
  if (document.status === "PENDING") return "Pendiente: indexación en curso.";
  if (document.status === "FAILED") return "Indexación fallida.";
  return "Indexado y disponible para generar.";
}

export function DocumentPicker({
  documents,
  selectedDocumentIds,
  onSelectionChange,
  emptyState,
}: DocumentPickerProps) {
  const idPrefix = useId();
  const indexedCount = documents.filter((document) => document.status === "INDEXED").length;
  const selectedCount = documents.filter(
    (document) =>
      document.status === "INDEXED" && selectedDocumentIds.includes(document.id),
  ).length;

  useEffect(() => {
    const indexedDocumentIds = new Set(
      documents
        .filter((document) => document.status === "INDEXED")
        .map((document) => document.id),
    );
    const validSelection = selectedDocumentIds.filter((id) => indexedDocumentIds.has(id));

    if (validSelection.length !== selectedDocumentIds.length) {
      onSelectionChange(validSelection);
    }
  }, [documents, onSelectionChange, selectedDocumentIds]);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium text-text-primary">
        Documentos ({selectedCount} seleccionados)
      </legend>

      {indexedCount === 0 && (
        <div role="status" className="text-sm text-state-warning">
          {emptyState ?? "No hay documentos indexados disponibles para generar."}
        </div>
      )}

      {documents.length > 0 && (
        <ul className="grid min-w-0 grid-cols-1 gap-2">
          {documents.map((document) => {
            const selectable = document.status === "INDEXED";
            const checked = selectable && selectedDocumentIds.includes(document.id);
            const checkboxId = `${idPrefix}-document-${document.id}`;
            const filenameId = `${checkboxId}-filename`;
            const statusId = `${checkboxId}-status`;

            return (
              <li key={document.id} className="min-w-0">
                <label
                  htmlFor={checkboxId}
                  className={`flex min-h-11 min-w-0 items-center gap-3 rounded-control border border-line px-3 py-2 text-sm ${
                    selectable
                      ? "cursor-pointer bg-surface-paper hover:bg-surface-subtle"
                      : "cursor-not-allowed bg-surface-muted"
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    disabled={!selectable}
                    aria-labelledby={filenameId}
                    aria-describedby={statusId}
                    onChange={(event) => {
                      if (!selectable) return;
                      const nextIds = event.currentTarget.checked
                        ? [...selectedDocumentIds.filter((id) => id !== document.id), document.id]
                        : selectedDocumentIds.filter((id) => id !== document.id);
                      onSelectionChange(nextIds);
                    }}
                    className="h-5 w-5 shrink-0 accent-action focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span id={filenameId} className="block truncate font-medium text-text-primary">
                      {document.filename}
                    </span>
                    <span id={statusId} className="block text-xs text-text-muted">
                      {getStatusLabel(document)}
                      {document.status === "FAILED" && document.error_message
                        ? ` ${document.error_message}`
                        : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
