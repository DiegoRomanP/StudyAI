import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentDTO, DocumentStatus } from "../api/types";
import { DocumentUpload } from "../components/documents/DocumentUpload";
import { MAX_DOCUMENT_SIZE_BYTES } from "../lib/documentValidation";

function makeDocument(id: number, filename: string, status: DocumentStatus): DocumentDTO {
  return {
    id,
    filename,
    file_type: filename.split(".").pop()?.toLowerCase() ?? "md",
    file_size: 8,
    status,
    error_message: "",
    created_at: "2026-09-30T00:00:00Z",
  };
}

function makeFile(name: string, size = 8, type = "application/octet-stream"): File {
  const file = new File(["study notes"], name, { type });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function serverError(status: number, detail: string) {
  return Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

describe("DocumentUpload", () => {
  const onUpload = vi.fn<(file: File) => Promise<DocumentDTO>>();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads multiple files independently and reports a partial server failure", async () => {
    const pendingFile = makeFile("Apuntes.MD");
    const rejectedFile = makeFile("Tema.pdf");
    onUpload
      .mockResolvedValueOnce(makeDocument(10, pendingFile.name, "PENDING"))
      .mockRejectedValueOnce(serverError(413, "El servidor rechazó el archivo por su tamaño."));

    render(<DocumentUpload onUpload={onUpload} />);
    const input = screen.getByLabelText("Selecciona uno o varios documentos");
    fireEvent.change(input, { target: { files: [pendingFile, rejectedFile] } });

    expect(await screen.findByText(/subida aceptada\. indexación en curso/i)).toBeInTheDocument();
    const serverErrorResult = await screen.findByRole("alert");
    expect(serverErrorResult).toHaveTextContent("El servidor rechazó el archivo por su tamaño.");
    expect(serverErrorResult.closest("li")).toHaveTextContent(rejectedFile.name);
    expect(onUpload).toHaveBeenNthCalledWith(1, pendingFile);
    expect(onUpload).toHaveBeenNthCalledWith(2, rejectedFile);
  });

  it("accepts a file at the exact byte limit and rejects one byte over", async () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(25 * 1024 * 1024);
    const acceptedFile = makeFile("limite.pdf", MAX_DOCUMENT_SIZE_BYTES);
    const oversizedFile = makeFile("exceso.markdown", MAX_DOCUMENT_SIZE_BYTES + 1);
    onUpload.mockResolvedValueOnce(makeDocument(11, acceptedFile.name, "INDEXED"));

    render(<DocumentUpload onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [acceptedFile, oversizedFile] },
    });

    expect(await screen.findByText(/subida aceptada e indexada/i)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/supera el máximo de 25 mb/i);
    expect(onUpload).toHaveBeenCalledOnce();
    expect(onUpload).toHaveBeenCalledWith(acceptedFile);
  });

  it("rejects empty files before sending them to the server", async () => {
    render(<DocumentUpload onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [makeFile("vacío.pdf", 0)] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/archivo está vacío/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("validates extensions instead of trusting the browser MIME type", async () => {
    render(<DocumentUpload onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [makeFile("notas.txt", 8, "application/pdf")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/formato no compatible/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("clears the native input and allows retrying the same failed filename", async () => {
    const retryFile = makeFile("mismo-archivo.md");
    onUpload
      .mockRejectedValueOnce(serverError(400, "El servidor no pudo aceptar el archivo."))
      .mockResolvedValueOnce(makeDocument(12, retryFile.name, "INDEXED"));

    render(<DocumentUpload onUpload={onUpload} />);
    const input = screen.getByLabelText("Selecciona uno o varios documentos") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [retryFile] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor no pudo aceptar el archivo.");
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { files: [retryFile] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/subida aceptada e indexada/i)).toBeInTheDocument();
  });

  it("supports dropping files without replacing the native file selector", async () => {
    const file = makeFile("arrastrado.markdown");
    onUpload.mockResolvedValueOnce(makeDocument(13, file.name, "INDEXED"));

    render(<DocumentUpload onUpload={onUpload} />);
    const dropZone = screen.getByRole("region", { name: "Zona de arrastre de documentos" });
    const dataTransfer = { files: [file], types: ["Files"] };
    fireEvent.dragOver(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    expect(await screen.findByText(/subida aceptada e indexada/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Selecciona uno o varios documentos")).toBeInTheDocument();
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("updates an accepted upload when the polled document becomes INDEXED", async () => {
    const file = makeFile("biology.pdf");
    const pendingDocument = makeDocument(14, file.name, "PENDING");
    onUpload.mockResolvedValueOnce(pendingDocument);
    const { rerender } = render(<DocumentUpload onUpload={onUpload} documents={[]} />);

    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [file] },
    });

    expect(await screen.findByText(/subida aceptada\. indexación en curso/i)).toBeInTheDocument();
    rerender(
      <DocumentUpload
        onUpload={onUpload}
        documents={[{ ...pendingDocument, status: "INDEXED" }]}
      />,
    );

    expect(await screen.findByText(/subida aceptada e indexada/i)).toBeInTheDocument();
  });
});
