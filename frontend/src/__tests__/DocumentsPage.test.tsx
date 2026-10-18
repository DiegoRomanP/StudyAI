import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO, DocumentStatus } from "../api/types";
import { DOCUMENTS_QUERY_KEY } from "../hooks/queries";
import { PAGE_GUIDES } from "../lib/pageGuides";
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
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <DocumentsPage />
        </MemoryRouter>
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
    ["INDEXED", "Listo: ya puedes usarlo en un plan."],
    ["FAILED", "No se pudo preparar el archivo: No se pudo indexar el archivo."],
  ] as const)(
    "keeps polling after initial, invalidated, and first automatic GET failures until confirming %s",
    async (status, finalFeedback) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const pendingDocument = makeDocument(29, "nuevo-material.md", "PENDING");
      const confirmedDocument = makeDocument(29, pendingDocument.filename, status);
      const listDocuments = vi
        .spyOn(api, "listDocuments")
        .mockRejectedValueOnce(new Error("initial list failed"))
        .mockRejectedValueOnce(new Error("post-upload refresh failed"))
        .mockRejectedValueOnce(new Error("first automatic refresh failed"))
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
      expect(screen.getByRole("alert")).toHaveTextContent(/Mostramos lo último que cargó; puede que falte algo/i);
      expect(screen.queryByText("Aún no tienes documentos")).not.toBeInTheDocument();
      expect(
        screen.getByText(/aún no sabemos si terminó de prepararse/i),
      ).toBeInTheDocument();
      expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual({
        documents: [pendingDocument],
        source: "POST",
        revision: 1,
      });
      expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
      expect(screen.queryByText(finalFeedback)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1999);
      });
      expect(listDocuments).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
      expect(screen.getByText(/aún no sabemos si terminó de prepararse/i)).toBeInTheDocument();
      expect(screen.queryByText(finalFeedback)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await flushAsyncTasks();

      expect(listDocuments).toHaveBeenCalledTimes(3);
      expect(uploadDocument).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
      expect(screen.getByText(/aún no sabemos si terminó de prepararse/i)).toBeInTheDocument();
      expect(screen.queryByText(finalFeedback)).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1999);
      });
      expect(listDocuments).toHaveBeenCalledTimes(3);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      await flushAsyncTasks();

      expect(listDocuments).toHaveBeenCalledTimes(4);
      expect(uploadDocument).toHaveBeenCalledOnce();
      expect(await screen.findByText(finalFeedback)).toBeInTheDocument();
      expect(screen.queryByText(/aún no sabemos si terminó de prepararse/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reintentar carga de documentos" })).not.toBeInTheDocument();
      unmount();
    },
  );

  it.each([
    ["INDEXED", "Listo: ya puedes usarlo en un plan."],
    ["FAILED", "No se pudo preparar el archivo: No se pudo indexar el archivo."],
  ] as const)("shows the recovered %s status after a manual retry", async (status, feedback) => {
    const pendingDocument = makeDocument(21, "apuntes.md", "PENDING");
    vi.spyOn(api, "listDocuments")
      .mockRejectedValueOnce(new Error("initial list failed"))
      .mockRejectedValueOnce(new Error("polling list failed"))
      .mockResolvedValueOnce([makeDocument(21, "apuntes.md", status)]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
    renderDocumentsPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar/i);
    expect(screen.queryByText("Aún no tienes documentos")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [new File(["study notes"], pendingDocument.filename)] },
    });

    expect(
      await screen.findByText(/archivo subido.*aún no sabemos si terminó de prepararse/i),
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

    expect(await screen.findByRole("alert")).toHaveTextContent(/Mostramos lo último que cargó/i);
    expect(screen.getByText(existingDocument.filename)).toBeInTheDocument();
    expect(screen.queryByText("Aún no tienes documentos")).not.toBeInTheDocument();
    expect(
      await screen.findByText(/archivo subido.*aún no sabemos si terminó de prepararse/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(2));
  });
});

describe("DocumentsPage guidance", () => {
  it("explains an empty library and shows the page guide", async () => {
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    renderDocumentsPage();

    expect(screen.getByRole("region", { name: PAGE_GUIDES.recursos.title })).toBeInTheDocument();
    expect(await screen.findByText("Aún no tienes documentos")).toBeInTheDocument();
  });

  it("suggests preparing a plan once an upload is ready", async () => {
    const indexed = makeDocument(30, "temario.md", "INDEXED");
    vi.spyOn(api, "listDocuments").mockResolvedValueOnce([]).mockResolvedValue([indexed]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(indexed);
    renderDocumentsPage();

    await screen.findByText("Aún no tienes documentos");
    fireEvent.change(screen.getByLabelText("Selecciona uno o varios documentos"), {
      target: { files: [new File(["notes"], indexed.filename)] },
    });

    expect(await screen.findByRole("link", { name: "Preparar mi plan" })).toHaveAttribute(
      "href",
      "/inicio#preparar-plan",
    );
    expect(screen.getAllByText("Listo para usar").length).toBeGreaterThan(0);
  });
});
