import { FileUp } from "lucide-react";
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
  /** Level of the "Subir documentos" heading, so it nests under the caller's headings. */
  headingLevel?: 2 | 3 | 4 | 5;
  /** Drop the "Subir documentos" heading when the caller's own title already says it. */
  hideHeading?: boolean;
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
          "Archivo subido. Aún no sabemos si terminó de prepararse. Recarga en unos segundos.",
      };
    }
    return { status, message: "Archivo subido. Lo estamos preparando…" };
  }
  if (status === "INDEXED") {
    return { status, message: "Listo: ya puedes usarlo en un plan." };
  }
  if (status === "FAILED" && attempt.documentId) {
    const detail =
      currentDocument?.error_message ||
      attempt.errorMessage ||
      "No se pudo procesar el documento.";
    return { status, message: `No se pudo preparar el archivo: ${detail}` };
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
  headingLevel = 2,
  hideHeading = false,
}: DocumentUploadProps) {
  const Heading = `h${headingLevel}` as const;
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
              ? "Archivo subido. Lo estamos preparando…"
              : uploadedDocument.status === "INDEXED"
                ? "Listo: ya puedes usarlo en un plan."
                : `No se pudo preparar el archivo: ${uploadedDocument.error_message || "No se pudo procesar el documento."}`;
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
    <section
      className="space-y-3"
      aria-labelledby={hideHeading ? undefined : `${inputId}-title`}
      aria-label={hideHeading ? "Subir documentos" : undefined}
    >
      {!hideHeading && (
        <Heading id={`${inputId}-title`} className="text-lg font-semibold text-text-primary">
          Subir documentos
        </Heading>
      )}
      <div
        role="region"
        aria-label="Zona de arrastre de documentos"
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-surface border-2 border-dashed transition-colors focus-within:ring-2 focus-within:ring-action focus-within:ring-offset-2 motion-reduce:transition-none ${
          isDragging
            ? "border-action bg-action-subtle"
            : "border-line-strong bg-surface-paper hover:border-action-hover hover:bg-surface-subtle"
        } ${isUploading ? "opacity-60" : ""}`}
      >
        <input
          id={inputId}
          type="file"
          accept=".pdf,.md,.markdown"
          multiple
          disabled={isUploading}
          aria-label="Selecciona uno o varios documentos"
          aria-describedby={helpId}
          onChange={handleInputChange}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className={`flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center ${
            isUploading ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <FileUp aria-hidden="true" className="h-8 w-8 text-action-hover" />
          <span className="text-lg font-semibold text-text-primary">Arrastra tus archivos aquí</span>
          <span className="text-sm font-medium text-action">o haz clic para elegirlos</span>
          <span id={helpId} className="text-sm text-text-muted">
            PDF o Markdown · máx. {MAX_DOCUMENT_SIZE_MB} MB
          </span>
        </label>
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
