import { useEffect, useRef, useState } from "react";
import { CircleCheck, FileCode, FileText, FolderOpen, Trash2, TriangleAlert } from "lucide-react";

import type { DocumentDTO } from "../api/types";
import { getApiErrorMessage } from "../api/errors";
import { EmptyState } from "../components/EmptyState";
import { PageHeader, Alert, Button, ButtonLink, Card, Skeleton, Spinner } from "../components/ui";
import { DocumentUpload } from "../components/documents/DocumentUpload";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

const STATUS_LABELS = {
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
    isPending,
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
      <PageHeader icon={FolderOpen} title="Recursos" help="recursos" />

      <DocumentUpload
        onUpload={(file) => upload.mutateAsync(file)}
        documents={documents ?? []}
        documentsError={isError}
        hideHeading
        compact={(documents ?? []).length > 0}
      />

      {justIndexed && (
        <Alert tone="success" title="Documento listo">
          <div>
            <ButtonLink to="/inicio#preparar-plan" variant="secondary">
              Preparar mi plan
            </ButtonLink>
          </div>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Tus documentos{documents && documents.length > 0 ? ` · ${documents.length}` : ""}
        </h2>
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
        {isPending && documents === undefined && !isError ? (
          <div role="status" aria-label="Cargando..." aria-busy="true" className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} height={72} />
            ))}
          </div>
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
            description="Sube un PDF o Markdown para empezar."
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

  const Icon = doc.file_type === "md" ? FileCode : FileText;
  const size =
    doc.file_size >= 1024 * 1024
      ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB`
      : `${(doc.file_size / 1024).toFixed(1)} KB`;

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <p className="truncate font-medium text-text-primary">{doc.filename}</p>
          <p className="text-xs text-text-muted">{size}</p>
          {doc.status === "FAILED" && doc.error_message && (
            <p className="mt-1 text-xs text-state-error">{doc.error_message}</p>
          )}
          {error && <p className="mt-1 text-xs text-state-error">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {doc.status === "PENDING" && <Spinner label="Preparando…" />}
        {doc.status === "INDEXED" && (
          <>
            <CircleCheck aria-hidden="true" className="h-5 w-5 text-state-correct" />
            <span className="sr-only">{STATUS_LABELS.INDEXED}</span>
          </>
        )}
        {doc.status === "FAILED" && (
          <span className="inline-flex items-center gap-1 text-xs text-state-error">
            <TriangleAlert aria-hidden="true" className="h-4 w-4" />
            {STATUS_LABELS.FAILED}
          </span>
        )}
        <Button
          variant="ghost"
          aria-label={`Eliminar «${doc.filename}»`}
          className="hover:!bg-state-error-subtle hover:!text-state-error"
          onClick={handleDelete}
          disabled={deleteDocument.isPending}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
