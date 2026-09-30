import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO } from "../api/types";
import { PlanPage } from "../pages/PlanPage";

vi.mock("../components/documents/DocumentPicker", () => ({
  DocumentPicker: ({
    documents,
    onSelectionChange,
  }: {
    documents: DocumentDTO[];
    onSelectionChange: (ids: number[]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSelectionChange([12, 34])}>
        Select previously indexed documents
      </button>
      <p>Current documents: {documents.map((document) => document.id).join(", ")}</p>
    </div>
  ),
}));

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
    queryClient.setQueryData(["documents"], [documents[0]]);
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
    fireEvent.click(screen.getByRole("button", { name: "Select previously indexed documents" }));
    const generateButton = screen.getByRole("button", { name: "Generar plan" });
    expect(generateButton).toBeEnabled();

    act(() => {
      queryClient.setQueryData(["documents"], []);
      // Click the still-enabled DOM button in the same batch as the cache update.
      fireEvent.click(generateButton);
    });

    expect(generateButton).toBeDisabled();
    expect(
      screen.getByText(/necesitas al menos un documento indexado/i),
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
    queryClient.setQueryData(["documents"], documents);
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
    fireEvent.click(screen.getByRole("button", { name: "Select previously indexed documents" }));
    act(() => {
      queryClient.setQueryData(["documents"], [documents[1]]);
    });
    expect(await screen.findByText("Current documents: 34")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generar plan" }));

    await waitFor(() => expect(api.generatePlan).toHaveBeenCalledWith(73, [34]));
    expect(api.generatePlan).toHaveBeenCalledOnce();
  });
});
