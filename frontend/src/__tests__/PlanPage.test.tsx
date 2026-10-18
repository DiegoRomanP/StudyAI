import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO } from "../api/types";
import { DOCUMENTS_QUERY_KEY, useUploadDocument } from "../hooks/queries";
import { PlanPage } from "../pages/PlanPage";

const documents: DocumentDTO[] = [
  {
    id: 12,
    filename: "Old notes.md",
    file_type: "md",
    file_size: 256,
    status: "INDEXED",
    error_message: "",
    created_at: "2026-09-30T00:00:00Z",
  },
  {
    id: 34,
    filename: "Current notes.pdf",
    file_type: "pdf",
    file_size: 512,
    status: "INDEXED",
    error_message: "",
    created_at: "2026-09-30T00:00:00Z",
  },
];

function seedConfirmedDocuments(queryClient: QueryClient, documents: DocumentDTO[]) {
  queryClient.setQueryData(DOCUMENTS_QUERY_KEY, {
    documents,
    source: "GET",
    revision: 0,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlanPage generation", () => {
  it("blocks generation when the last selected indexed document disappears, including a stale click", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["goals"], [
      {
        id: 73,
        goal_type: "LEARNING",
        title: "Aprender biología",
        description: "",
        created_at: "2026-09-30T00:00:00Z",
      },
    ]);
    seedConfirmedDocuments(queryClient, [documents[0]]);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("checkbox", { name: documents[0].filename }));
    const generateButton = screen.getByRole("button", { name: "Generar plan" });
    expect(generateButton).toBeEnabled();

    act(() => {
      queryClient.setQueryData(DOCUMENTS_QUERY_KEY, {
        documents: [],
        source: "GET",
        revision: 1,
      });
      // Click the still-enabled DOM button in the same batch as the cache update.
      fireEvent.click(generateButton);
    });

    expect(generateButton).toBeDisabled();
    expect(
      screen.getByText(/necesitas al menos un documento listo/i),
    ).toBeInTheDocument();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("blocks plan generation when the document list cannot be read", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["goals"], [
      {
        id: 73,
        goal_type: "LEARNING",
        title: "Aprender biología",
        description: "",
        created_at: "2026-09-30T00:00:00Z",
      },
    ]);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments").mockRejectedValue(new Error("documents unavailable"));
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "73" } });

    expect(await screen.findByText(/no se puede verificar la lista de documentos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("shows an empty state only after a successful document-list response", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    let rejectInitialList: ((error: Error) => void) | undefined;
    vi.spyOn(api, "listDocuments")
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectInitialList = reject;
          }),
      )
      .mockResolvedValueOnce([]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/cargando y verificando la lista de documentos/i)).toBeInTheDocument();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();

    await act(async () => {
      rejectInitialList?.(new Error("documents unavailable"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se puede verificar la lista de documentos/i,
    );
    expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carga de documentos" }));

    expect(await screen.findByText(/aún no tienes documentos listos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reintentar carga de documentos" })).not.toBeInTheDocument();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("does not treat a POST-seeded pending document as a GET-confirmed empty list", async () => {
    const pendingDocument: DocumentDTO = {
      ...documents[0],
      id: 91,
      filename: "new-notes.md",
      status: "PENDING",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    let rejectPostRefetch: ((error: Error) => void) | undefined;
    const listDocuments = vi
      .spyOn(api, "listDocuments")
      .mockRejectedValueOnce(new Error("initial documents GET failed"))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPostRefetch = reject;
          }),
      )
      .mockResolvedValueOnce([]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    render(
      <Wrapper>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </Wrapper>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    const upload = renderHook(() => useUploadDocument(), { wrapper: Wrapper });

    act(() => {
      upload.result.current.mutate(new File(["notes"], pendingDocument.filename));
    });
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));

    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual({
      documents: [pendingDocument],
      source: "POST",
      revision: 1,
    });
    expect(screen.getByText(pendingDocument.filename)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: pendingDocument.filename })).toBeDisabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reintentar carga de documentos" })).not.toBeInTheDocument();

    await act(async () => {
      rejectPostRefetch?.(new Error("post-upload documents GET failed"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carga de documentos" }));

    expect(await screen.findByText(/aún no tienes documentos listos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();
    upload.unmount();
  });

  it("preserves the selected confirmed document but blocks generation after a pending upload", async () => {
    const pendingDocument: DocumentDTO = {
      ...documents[0],
      id: 91,
      filename: "new-notes.md",
      status: "PENDING",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([
      {
        id: 73,
        goal_type: "LEARNING",
        title: "Aprender biología",
        description: "",
        created_at: "2026-09-30T00:00:00Z",
      },
    ]);
    let rejectPostRefetch: ((error: Error) => void) | undefined;
    const listDocuments = vi
      .spyOn(api, "listDocuments")
      .mockResolvedValueOnce([documents[0]])
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectPostRefetch = reject;
          }),
      );
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    vi.spyOn(api, "uploadDocument").mockResolvedValue(pendingDocument);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    render(
      <Wrapper>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </Wrapper>,
    );

    await screen.findByRole("option", { name: "Aprender biología" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "73" } });
    const confirmedDocument = await screen.findByRole("checkbox", { name: documents[0].filename });
    fireEvent.click(confirmedDocument);
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeEnabled();

    const upload = renderHook(() => useUploadDocument(), { wrapper: Wrapper });
    act(() => {
      upload.result.current.mutate(new File(["notes"], pendingDocument.filename));
    });
    await waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("checkbox", { name: documents[0].filename })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: pendingDocument.filename })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(generatePlan).not.toHaveBeenCalled();

    await act(async () => {
      rejectPostRefetch?.(new Error("post-upload documents GET failed"));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    expect(screen.getByRole("checkbox", { name: documents[0].filename })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: pendingDocument.filename })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();
    upload.unmount();
  });

  it("hides a confirmed empty state while a later document-list refetch is failing", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("documents refetch failed"));
    vi.spyOn(api, "listPlans").mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/aún no tienes documentos listos/i)).toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["documents"] });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
  });

  it("preserves a previously selected indexed document after a refetch error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["goals"], []);
    seedConfirmedDocuments(queryClient, [documents[0]]);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments").mockRejectedValue(new Error("documents refresh failed"));
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    const generatePlan = vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const documentCheckbox = screen.getByRole("checkbox", { name: documents[0].filename });
    fireEvent.click(documentCheckbox);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["documents"] });
    });

    expect(api.listDocuments).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(DOCUMENTS_QUERY_KEY)?.status).toBe("error");
    expect(screen.getByText(documents[0].filename)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: documents[0].filename })).toBeChecked();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    expect(screen.getByRole("button", { name: "Reintentar carga de documentos" })).toBeEnabled();
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("does not treat a previously loaded pending-only list as empty while refresh is failing", async () => {
    const pendingDocument: DocumentDTO = {
      ...documents[0],
      status: "PENDING",
      filename: "processing-notes.md",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["goals"], []);
    seedConfirmedDocuments(queryClient, [pendingDocument]);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments").mockRejectedValue(new Error("documents refresh failed"));
    vi.spyOn(api, "listPlans").mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["documents"] });
    });

    expect(api.listDocuments).toHaveBeenCalledOnce();
    expect(screen.getByText(pendingDocument.filename)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se puede verificar/i);
    expect(screen.queryByText(/aún no tienes documentos listos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar plan" })).toBeDisabled();
  });

  it("sends only currently indexed document IDs when selection becomes stale before generation", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["goals"], [
      {
        id: 73,
        goal_type: "LEARNING",
        title: "Aprender biología",
        description: "",
        created_at: "2026-09-30T00:00:00Z",
      },
    ]);
    seedConfirmedDocuments(queryClient, documents);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    vi.spyOn(api, "generatePlan").mockResolvedValue({
      id: 51,
      status: "PROCESSING",
      error_message: "",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("checkbox", { name: documents[0].filename }));
    fireEvent.click(screen.getByRole("checkbox", { name: documents[1].filename }));
    act(() => {
      queryClient.setQueryData(DOCUMENTS_QUERY_KEY, {
        documents: [documents[1]],
        source: "GET",
        revision: 1,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: documents[0].filename })).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: documents[1].filename })).toBeChecked();
    });
    fireEvent.click(screen.getByRole("button", { name: "Generar plan" }));

    await waitFor(() =>
      expect(api.generatePlan).toHaveBeenCalledWith(73, [34], expect.any(String)),
    );
    expect(api.generatePlan).toHaveBeenCalledOnce();
  });
});

describe("PlanPage errors", () => {
  const goal = {
    id: 73,
    goal_type: "LEARNING" as const,
    title: "Aprender biología",
    description: "",
    created_at: "2026-09-30T00:00:00Z",
  };

  function renderPage(queryClient: QueryClient, initialEntry = "/plan") {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <PlanPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("explains a failed generation and retries the same request with the same idempotency key", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["goals"], [goal]);
    seedConfirmedDocuments(queryClient, [documents[0]]);
    queryClient.setQueryData(["plans"], []);
    vi.spyOn(api, "listGoals").mockResolvedValue([goal]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    const generatePlan = vi
      .spyOn(api, "generatePlan")
      .mockRejectedValueOnce({ isAxiosError: true, request: {}, message: "Network Error" })
      .mockResolvedValueOnce({ id: 51, status: "PROCESSING", error_message: "" });
    renderPage(queryClient);

    fireEvent.change(screen.getByLabelText("Meta"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("checkbox", { name: documents[0].filename }));
    fireEvent.click(screen.getByRole("button", { name: "Generar plan" }));

    expect(
      await screen.findByText("No se pudo conectar con el servidor. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: documents[0].filename })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Generar plan" }));
    await waitFor(() => expect(generatePlan).toHaveBeenCalledTimes(2));
    const firstKey = generatePlan.mock.calls[0][2];
    expect(firstKey).toEqual(expect.any(String));
    expect(generatePlan.mock.calls[1][2]).toBe(firstKey);
  });

  it("does not present failed goal or plan lists as empty", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, []);
    vi.spyOn(api, "listGoals").mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    vi.spyOn(api, "listPlans").mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    renderPage(queryClient);

    expect(await screen.findByText("No se pudieron cargar tus metas.")).toBeInTheDocument();
    expect(await screen.findByText("No se pudieron cargar tus planes.")).toBeInTheDocument();
    expect(screen.queryByText(/Necesitas una meta/)).not.toBeInTheDocument();
    expect(screen.queryByText("Aún no tienes planes")).not.toBeInTheDocument();
  });

  it("shows waiting, not an empty list, while offline queries are paused", async () => {
    onlineManager.setOnline(false);
    try {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      seedConfirmedDocuments(queryClient, []);
      vi.spyOn(api, "listGoals").mockResolvedValue([]);
      vi.spyOn(api, "listDocuments").mockResolvedValue([]);
      vi.spyOn(api, "listPlans").mockResolvedValue([]);
      renderPage(queryClient);

      expect(await screen.findByRole("status", { name: "Cargando planes" })).toBeInTheDocument();
      expect(screen.queryByText("Aún no tienes planes")).not.toBeInTheDocument();
      expect(screen.queryByText(/Necesitas una meta/)).not.toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("explains an empty plan list with a call to action", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, [documents[0]]);
    vi.spyOn(api, "listGoals").mockResolvedValue([goal]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    renderPage(queryClient);

    expect(await screen.findByText("Aún no tienes planes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preparar mi primer plan" })).toHaveAttribute(
      "href",
      "/inicio#preparar-plan",
    );
    // With goals but none chosen, the disabled button says why.
    const generateButton = screen.getByRole("button", { name: "Generar plan" });
    expect(generateButton).toBeDisabled();
    expect(generateButton).toHaveAccessibleDescription(/Elige una meta\./);
  });

  it("preselects the goal passed as ?meta=", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, [documents[0]]);
    vi.spyOn(api, "listGoals").mockResolvedValue([goal]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    renderPage(queryClient, `/plan?meta=${goal.id}`);

    await waitFor(() => expect(screen.getByLabelText("Meta")).toHaveValue(String(goal.id)));
    expect(screen.queryByText("Elige una meta.")).not.toBeInTheDocument();
  });
});
