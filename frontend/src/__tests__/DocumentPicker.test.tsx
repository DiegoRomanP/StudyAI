import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DocumentDTO } from "../api/types";
import { DocumentPicker } from "../components/documents/DocumentPicker";

const documents: DocumentDTO[] = [
  {
    id: 1,
    filename: "Biología indexada.md",
    file_type: "md",
    file_size: 400,
    status: "INDEXED",
    error_message: "",
    created_at: "2026-09-30T00:00:00Z",
  },
  {
    id: 2,
    filename: "Historia pendiente.pdf",
    file_type: "pdf",
    file_size: 500,
    status: "PENDING",
    error_message: "",
    created_at: "2026-09-30T00:00:00Z",
  },
  {
    id: 3,
    filename: "Química fallida.md",
    file_type: "md",
    file_size: 600,
    status: "FAILED",
    error_message: "No se pudo indexar.",
    created_at: "2026-09-30T00:00:00Z",
  },
];

describe("DocumentPicker", () => {
  it("allows selecting only INDEXED documents", () => {
    const onSelectionChange = vi.fn();
    render(
      <DocumentPicker
        documents={documents}
        selectedDocumentIds={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    const indexed = screen.getByRole("checkbox", { name: "Biología indexada.md" });
    const pending = screen.getByRole("checkbox", { name: "Historia pendiente.pdf" });
    const failed = screen.getByRole("checkbox", { name: "Química fallida.md" });

    expect(indexed).toBeEnabled();
    expect(pending).toBeDisabled();
    expect(failed).toBeDisabled();
    expect(screen.getByText(/indexación en curso/i)).toBeInTheDocument();
    expect(pending).toHaveAccessibleDescription("Pendiente: indexación en curso.");
    expect(failed.closest("label")).toHaveTextContent("No se pudo indexar.");

    fireEvent.click(indexed);
    expect(onSelectionChange).toHaveBeenCalledWith([1]);
    fireEvent.click(pending);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it("explains when there are no indexed documents", () => {
    render(
      <DocumentPicker
        documents={documents.slice(1)}
        selectedDocumentIds={[]}
        onSelectionChange={() => undefined}
        emptyState={<p>Sube un documento en Documentos.</p>}
      />,
    );

    expect(screen.getByText("Sube un documento en Documentos.")).toBeInTheDocument();
  });

  it("removes a selected document when it stops being INDEXED", async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DocumentPicker
        documents={[documents[0]]}
        selectedDocumentIds={[1]}
        onSelectionChange={onSelectionChange}
      />,
    );

    rerender(
      <DocumentPicker
        documents={[{ ...documents[0], status: "FAILED" }]}
        selectedDocumentIds={[1]}
        onSelectionChange={onSelectionChange}
      />,
    );

    await waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith([]));
    expect(screen.getByRole("checkbox", { name: "Biología indexada.md" })).toBeDisabled();
  });

  it("removes a selected document when it disappears from the list", async () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <DocumentPicker
        documents={[documents[0]]}
        selectedDocumentIds={[1]}
        onSelectionChange={onSelectionChange}
      />,
    );

    rerender(
      <DocumentPicker
        documents={[]}
        selectedDocumentIds={[1]}
        onSelectionChange={onSelectionChange}
      />,
    );

    await waitFor(() => expect(onSelectionChange).toHaveBeenCalledWith([]));
    expect(screen.getByText("No hay documentos indexados disponibles para generar.")).toBeInTheDocument();
  });
});
