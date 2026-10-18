import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";

import type { DocumentDTO } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { EmptyState } from "../components/EmptyState";
import { PageGuide } from "../components/help/PageGuide";
import { Alert, Badge, Button, ButtonLink, Card, Spinner } from "../components/ui";
import { DocumentUpload } from "../components/documents/DocumentUpload";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

const STATUS_COLORS = {
  PENDING: "amber",
  INDEXED: "green",
  FAILED: "red",
} as const;

const STATUS_LABELS = {
  PENDING: "Preparando…",
  INDEXED: "Listo para usar",
  FAILED: "No se pudo leer",
} as const;

/** True once a document becomes INDEXED while this page is open (not on first load). */
function useJustIndexed(documents: DocumentDTO[] | undefined) {
  const previous = useRef<Map<number, DocumentDTO["status"]> | null>(null);
  const [justIndexed, setJustIndexed] = useState(false);

  useEffect(() => {
    if (!documents) return;
    const before = previous.current;
    previous.current = new Map(documents.map((document) => [document.id, document.status]));
    if (!before) return;
    if (documents.some((document) => document.status === "INDEXED" && before.get(document.id) !== "INDEXED")) {
      setJustIndexed(true);
    }
  }, [documents]);

  return justIndexed;
}

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
  const justIndexed = useJustIndexed(documents);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Recursos</h1>
        <p className="text-text-muted">
          Tus documentos de estudio (PDF o Markdown). La IA los usa para crear tus planes.
        </p>
      </header>

      <PageGuide id="recursos" />

      <DocumentUpload
        onUpload={(file) => upload.mutateAsync(file)}
        documents={documents ?? []}
        documentsError={isError}
      />

      {justIndexed && (
        <Alert tone="success" title="Listo. Siguiente: prepara tu plan">
          <p>Tu documento ya se puede usar. Elige tu meta y genera el plan desde Inicio.</p>
          <div>
            <ButtonLink to="/inicio#preparar-plan" variant="secondary">
              Preparar mi plan
            </ButtonLink>
          </div>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus documentos</h2>
        {isError && (
          <div role="alert" className="space-y-2 rounded-surface border border-state-error bg-state-error-subtle p-4 text-sm text-state-error">
            <p>
              {documents === undefined
                ? "No se pudieron cargar los documentos."
                : "No se pudo actualizar la lista. Mostramos lo último que cargó; puede que falte algo."}
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
          <EmptyState
            icon={FolderOpen}
            title="Aún no tienes documentos"
            description="Sube tus apuntes, un temario o un libro en PDF o Markdown. Es lo primero que necesita la IA para preparar tu plan."
          />
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
      `¿Eliminar "${doc.filename}"? Los planes ya generados se conservan, pero no podrás usar este documento en planes nuevos. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    setError(null);
    try {
      await deleteDocument.mutateAsync(doc.id);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al eliminar el documento."));
    }
  }

  return (
    <Card className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-text-primary">{doc.filename}</p>
        <p className="text-xs text-text-muted">
          {(doc.file_size / 1024).toFixed(1)} KB · .{doc.file_type}
        </p>
        {doc.status === "FAILED" && doc.error_message && (
          <p className="mt-1 text-xs text-state-error">{doc.error_message}</p>
        )}
        {error && <p className="mt-1 text-xs text-state-error">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        {doc.status === "PENDING" && <Spinner />}
        <Badge color={STATUS_COLORS[doc.status]}>
          {STATUS_LABELS[doc.status]}
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
