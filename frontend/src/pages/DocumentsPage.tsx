import { useRef, useState } from "react";

import type { DocumentDTO } from "../api/types";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { useDeleteDocument, useDocuments, useUploadDocument } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";

const STATUS_COLORS = {
  PENDING: "amber",
  INDEXED: "green",
  FAILED: "red",
} as const;

export function DocumentsPage() {
  const { data: documents, isLoading } = useDocuments();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(documents);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file);
      } catch (e: any) {
        setError(e?.response?.data?.detail ?? "Error al subir el archivo.");
      }
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-slate-500">
          Sube tus apuntes en PDF o Markdown. Se indexan automáticamente para el RAG.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:bg-slate-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.md,.markdown"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="text-4xl">⬆️</div>
        <p className="mt-2 font-medium text-slate-700">
          Arrastra archivos aquí o haz clic para seleccionar
        </p>
        <p className="text-sm text-slate-400">PDF o Markdown, hasta 25 MB</p>
        {upload.isPending && (
          <div className="mt-4 flex justify-center">
            <Spinner label="Subiendo..." />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus documentos</h2>
        {isLoading ? (
          <Spinner label="Cargando..." />
        ) : documents && documents.length > 0 ? (
          <>
            <div className="grid gap-3">
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
        ) : (
          <p className="text-sm text-slate-400">Aún no has subido documentos.</p>
        )}
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
