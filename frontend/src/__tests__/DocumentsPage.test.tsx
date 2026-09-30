import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO, DocumentStatus } from "../api/types";
import { DocumentsPage } from "../pages/DocumentsPage";

function makeDocument(id: number, filename: string, status: DocumentStatus): DocumentDTO {
  return {
    id,
    filename,
    file_type: filename.split(".").pop()?.toLowerCase() ?? "md",
    file_size: 128,
    status,
    error_message: status === "FAILED" ? "No se pudo indexar el archivo." : "",
    created_at: "2026-09-30T00:00:00Z",
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function renderDocumentsPage(queryClient = makeQueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <DocumentsPage />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function flushAsyncTasks() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe("DocumentsPage query failures", () => {
  it.each([
    ["INDEXED", "Subida aceptada e indexada."],
    ["FAILED", "La indexación falló: No se pudo indexar el archivo."],
  ] as const)(
    "automatically confirms a pending upload as %s after the initial and invalidated GET fail",
    async (status, finalFeedback) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const pendingDocument = makeDocument(29, "nuevo-material.md", "PENDING");
      const confirmedDocument = makeDocument(29, pendingDocument.filename, status);
      const listDocuments = vi
        .spyOn(api, "listDocuments")
        .mockRejectedValueOnce(new Error("initial list failed"))
        .mockRejectedValueOnce(new Error("post-upload refresh failed"))
        .mockResolvedValueOnce([confirmedDocument]);
      const uploadDocument = vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
      const { queryClient, unmount } = renderDocumentsPage();

      await flushAsyncTasks();
      expect(listDocuments).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);

      fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
        target: { files: [new File(["new notes"], pendingDocument.filename)] },
      });
      await flushAsyncTasks();

      expect(uploadDocument).toHaveBeenCalledOnce();
      expect(listDocuments).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("alert")).toHaveTextContent(/datos visibles.*pueden ser parciales/i);
      expect(screen.queryByText("Aún no has subido documentos.")).not.toBeInTheDocument();
      expect(
        screen.getByText(/estado de indexación no confirmado/i),
      ).toBeInTheDocument();
      expect(queryClient.getQueryData(["documents"])).toEqual([pendingDocument]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1999);
      });
      expect(listDocuments).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await flushAsyncTasks();

      expect(listDocuments).toHaveBeenCalledTimes(3);
      expect(uploadDocument).toHaveBeenCalledOnce();
      expect(await screen.findByText(finalFeedback)).toBeInTheDocument();
      expect(screen.queryByText(/estado de indexación no confirmado/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar carga de documentos" })).not.toBeInTheDocument();
      unmount();
    },
  );

  it.each([
    ["INDEXED", "Subida aceptada e indexada."],
    ["FAILED", "La indexación falló: No se pudo indexar el archivo."],
  ] as const)("shows the recovered %s status after a manual retry", async (status, feedback) => {
    const pendingDocument = makeDocument(21, "apuntes.md", "PENDING");
    vi.spyOn(api, "listDocuments")
      .mockRejectedValueOnce(new Error("initial list failed"))
      .mockRejectedValueOnce(new Error("polling list failed"))
      .mockResolvedValueOnce([makeDocument(21, "apuntes.md", status)]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
    renderDocumentsPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
    expect(screen.queryByText("Aún no has subido documentos.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [new File(["study notes"], pendingDocument.filename)] },
    });

    expect(
      await screen.findByText(/subida aceptada.*estado de indexación no confirmado/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carga de documentos" }));

    expect(await screen.findByText(feedback)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reintentar carga de documentos" }),
    ).not.toBeInTheDocument();
    expect(api.listDocuments).toHaveBeenCalledTimes(3);
  });

  it("preserves previously loaded documents and shows a contextual warning when refresh fails", async () => {
    const existingDocument = makeDocument(20, "material-previo.pdf", "INDEXED");
    const pendingDocument = makeDocument(21, "material-nuevo.md", "PENDING");
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce([existingDocument])
      .mockRejectedValueOnce(new Error("refresh failed"));
    vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
    renderDocumentsPage();

    expect(await screen.findByText(existingDocument.filename)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [new File(["new notes"], pendingDocument.filename)] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/se conservan los últimos datos/i);
    expect(screen.getByText(existingDocument.filename)).toBeInTheDocument();
    expect(screen.queryByText("Aún no has subido documentos.")).not.toBeInTheDocument();
    expect(
      await screen.findByText(/subida aceptada.*estado de indexación no confirmado/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(2));
  });
});
