import { useState } from "react";

import type { DocumentDTO } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { DocumentUpload } from "../components/documents/DocumentUpload";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

const STATUS_COLORS = {
  PENDING: "amber",
  INDEXED: "green",
  FAILED: "red",
} as const;

export function DocumentsPage() {
  const {
    data: documents,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useDocuments();
  const upload = useUploadDocument();
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(documents);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-slate-500">
          Sube tus apuntes en PDF o Markdown. Se indexan automáticamente para el RAG.
        </p>
      </header>

      <DocumentUpload
        onUpload={(file) => upload.mutateAsync(file)}
        documents={documents ?? []}
        documentsError={isError}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus documentos</h2>
        {isError && (
          <div role="alert" className="space-y-2 rounded-surface border border-state-error bg-state-error-subtle p-4 text-sm text-state-error">
            <p>
              {documents === undefined
                ? "No se pudieron cargar los documentos."
                : "No se pudo actualizar la lista; se conservan los últimos datos visibles, que pueden ser parciales hasta confirmar una nueva respuesta."}
            </p>
            <p>{getApiErrorMessage(error, "Comprueba la conexión e inténtalo de nuevo.")}</p>
            <Button
              variant="secondary"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Reintentando…" : "Reintentar carga de documentos"}
            </Button>
          </div>
        )}
        {isLoading && documents === undefined ? (
          <Spinner label="Cargando..." />
        ) : documents && documents.length > 0 ? (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3">
              {visible.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
            {hiddenCount > 0 && (
              <Button variant="secondary" onClick={showMore}>
                Mostrar {hiddenCount} más
              </Button>
            )}
            {expanded && documents.length > 6 && (
              <Button variant="ghost" onClick={showLess}>
                Mostrar menos
              </Button>
            )}
          </>
        ) : !isError ? (
          <p className="text-sm text-slate-400">Aún no has subido documentos.</p>
        ) : null}
      </section>
    </div>
  );
}

function DocumentRow({ doc }: { doc: DocumentDTO }) {
  const deleteDocument = useDeleteDocument();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `¿Eliminar "${doc.filename}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    setError(null);
    try {
      await deleteDocument.mutateAsync(doc.id);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error al eliminar el documento.");
    }
  }

  return (
    <Card className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800">{doc.filename}</p>
        <p className="text-xs text-slate-400">
          {(doc.file_size / 1024).toFixed(1)} KB · .{doc.file_type}
        </p>
        {doc.status === "FAILED" && doc.error_message && (
          <p className="mt-1 text-xs text-red-600">{doc.error_message}</p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        {doc.status === "PENDING" && <Spinner />}
        <Badge color={STATUS_COLORS[doc.status]}>
          {doc.status === "INDEXED" ? "Indexado" : doc.status === "PENDING" ? "Procesando" : "Error"}
        </Badge>
        <Button
          variant="danger"
          className="px-2.5 py-1 text-xs"
          onClick={handleDelete}
          disabled={deleteDocument.isPending}
        >
          {deleteDocument.isPending ? "Eliminando..." : "Eliminar"}
        </Button>
      </div>
    </Card>
  );
}
