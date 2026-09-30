import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import type { DocumentDTO, DocumentStatus } from "../../api/types";
import { getApiErrorMessage } from "../../api/errors";
import { Spinner } from "../ui";
import { MAX_DOCUMENT_SIZE_MB, validateDocumentFile } from "../../lib/documentValidation";

type UploadAttemptStatus = DocumentStatus | "UPLOADING" | "REJECTED";

interface UploadAttempt {
  id: number;
  filename: string;
  status: UploadAttemptStatus;
  message: string;
  documentId?: number;
  errorMessage?: string;
}

interface DocumentUploadProps {
  onUpload: (file: File) => Promise<DocumentDTO>;
  documents?: DocumentDTO[];
  documentsError?: boolean;
}

function getUploadFeedback(
  attempt: UploadAttempt,
  documents: DocumentDTO[],
  documentsError: boolean,
) {
  const currentDocument = attempt.documentId
    ? documents.find((document) => document.id === attempt.documentId)
    : undefined;
  const status = currentDocument?.status ?? attempt.status;

  if (status === "PENDING") {
    if (documentsError) {
      return {
        status,
        message:
          "Subida aceptada. Estado de indexación no confirmado; la última respuesta indicó que seguía pendiente.",
      };
    }
    return { status, message: "Subida aceptada. Indexación en curso." };
  }
  if (status === "INDEXED") {
    return { status, message: "Subida aceptada e indexada." };
  }
  if (status === "FAILED" && attempt.documentId) {
    const detail =
      currentDocument?.error_message ||
      attempt.errorMessage ||
      "No se pudo procesar el documento.";
    return { status, message: `La indexación falló: ${detail}` };
  }
  if (status === "UPLOADING") {
    return { status, message: attempt.message };
  }
  return { status: "REJECTED" as const, message: attempt.message };
}

export function DocumentUpload({
  onUpload,
  documents = [],
  documentsError = false,
}: DocumentUploadProps) {
  const id = useId();
  const inputId = `document-upload-${id}`;
  const helpId = `${inputId}-help`;
  const nextAttemptId = useRef(0);
  const uploadingRef = useRef(false);
  const [attempts, setAttempts] = useState<UploadAttempt[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  function updateAttempt(idToUpdate: number, update: Partial<UploadAttempt>) {
    setAttempts((current) =>
      current.map((attempt) =>
        attempt.id === idToUpdate ? { ...attempt, ...update } : attempt,
      ),
    );
  }

  async function processFiles(files: File[]) {
    if (files.length === 0 || uploadingRef.current) return;

    uploadingRef.current = true;
    setIsUploading(true);
    setIsDragging(false);

    const batch = files.map((file) => ({ id: nextAttemptId.current++, file }));
    setAttempts((current) => [
      ...current,
      ...batch.map(({ id: attemptId, file }) => ({
        id: attemptId,
        filename: file.name,
        status: "UPLOADING" as const,
        message: "Preparando la subida…",
      })),
    ]);

    try {
      for (const { id: attemptId, file } of batch) {
        const validationError = validateDocumentFile(file);
        if (validationError) {
          updateAttempt(attemptId, {
            status: "REJECTED",
            message: validationError,
          });
          continue;
        }

        updateAttempt(attemptId, {
          status: "UPLOADING",
          message: `Subiendo ${file.name}…`,
        });

        try {
          const uploadedDocument = await onUpload(file);
          const message =
            uploadedDocument.status === "PENDING"
              ? "Subida aceptada. Indexación en curso."
            : uploadedDocument.status === "INDEXED"
                ? "Subida aceptada e indexada."
                : `La indexación falló: ${uploadedDocument.error_message || "No se pudo procesar el documento."}`;
          updateAttempt(attemptId, {
            status: uploadedDocument.status,
            documentId: uploadedDocument.id,
            message,
            errorMessage: uploadedDocument.error_message || undefined,
          });
        } catch (error) {
          updateAttempt(attemptId, {
            status: "REJECTED",
            message: getApiErrorMessage(error, "El servidor no pudo aceptar el archivo."),
          });
        }
      }
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    // Reset even for a failed attempt so the same filename can be selected again.
    event.currentTarget.value = "";
    void processFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (isUploading || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    if (uploadingRef.current) return;
    void processFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className="text-lg font-semibold text-text-primary">
        Subir documentos
      </h2>
      <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
        Selecciona uno o varios documentos
      </label>
      <input
        id={inputId}
        type="file"
        accept=".pdf,.md,.markdown"
        multiple
        disabled={isUploading}
        aria-describedby={helpId}
        onChange={handleInputChange}
        className="block min-h-11 w-full cursor-pointer rounded-control border border-control bg-surface-paper text-sm text-text-primary file:mr-4 file:min-h-11 file:border-0 file:bg-action-subtle file:px-4 file:font-semibold file:text-action focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p id={helpId} className="text-sm text-text-muted">
        PDF o Markdown (.md o .markdown), hasta {MAX_DOCUMENT_SIZE_MB} MB. El servidor confirma la
        aceptación final.
      </p>

      <div
        role="region"
        aria-label="Zona de arrastre de documentos"
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-surface border-2 border-dashed p-5 text-center transition-colors motion-reduce:transition-none ${
          isDragging
            ? "border-action bg-action-subtle"
            : "border-line-strong bg-surface-paper"
        } ${isUploading ? "opacity-60" : ""}`}
      >
        <p className="font-medium text-text-primary">Arrastra archivos aquí</p>
        <p className="mt-1 text-sm text-text-muted">También puedes usar el selector de archivos.</p>
      </div>

      {isUploading && <Spinner label="Subiendo documentos…" />}

      {attempts.length > 0 && (
        <ul aria-label="Resultados de subida" className="space-y-2">
          {attempts.map((attempt) => {
            const feedback = getUploadFeedback(attempt, documents, documentsError);
            const isError = feedback.status === "REJECTED" || feedback.status === "FAILED";
            return (
              <li
                key={attempt.id}
                className="rounded-control border border-line bg-surface-paper px-3 py-2"
              >
                <p className="break-words text-sm font-medium text-text-primary">{attempt.filename}</p>
                {feedback.status === "UPLOADING" ? (
                  <Spinner label={feedback.message} className="mt-1" />
                ) : (
                  <p
                    role={isError ? "alert" : "status"}
                    className={`mt-1 text-sm ${
                      isError ? "text-state-error" : "text-text-muted"
                    }`}
                  >
                    {feedback.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
