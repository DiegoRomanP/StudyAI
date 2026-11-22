import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO } from "../api/types";
import { DOCUMENTS_QUERY_KEY } from "../hooks/queries";
import { PlanPage } from "../pages/PlanPage";
import { makeSessionSummary } from "../test/fixtures";

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

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="location">{`${pathname}${search}${hash}`}</p>;
}

describe("PlanPage errors", () => {
  const goal = {
    id: 73,
    goal_type: "LEARNING" as const,
    title: "Aprender biología",
    description: "",
    exam_date: null,
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

  it("does not present failed goal or plan lists as empty", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, []);
    vi.spyOn(api, "listGoals").mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    vi.spyOn(api, "listDocuments").mockResolvedValue([]);
    vi.spyOn(api, "listPlans").mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    renderPage(queryClient);

    expect(await screen.findByText("No se pudieron cargar tus planes.")).toBeInTheDocument();
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
      } finally {
      onlineManager.setOnline(true);
    }
  });

  it("labels a failed plan as incomplete and offers to continue it", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, [documents[0]]);
    vi.spyOn(api, "listGoals").mockResolvedValue([goal]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([
      {
        id: 51,
        title: "Plan cortado",
        status: "FAILED",
        goal_id: goal.id,
        document_ids: [documents[0].id],
        created_at: "2026-10-01T00:00:00Z",
        error_message: "Se cortó.",
        topics: [],
        sessions: [],
      },
    ]);
    renderPage(queryClient);

    expect(await screen.findByText("Incompleto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Plan cortado.*Continuar generación/ })).toHaveAttribute("href", "/plan/51");
  });

  it("counts only the planned sessions of a ready plan, never the extra reviews", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seedConfirmedDocuments(queryClient, [documents[0]]);
    vi.spyOn(api, "listGoals").mockResolvedValue([goal]);
    vi.spyOn(api, "listDocuments").mockResolvedValue([documents[0]]);
    vi.spyOn(api, "listPlans").mockResolvedValue([
      {
        id: 52,
        title: "Plan con repaso",
        status: "READY",
        goal_id: goal.id,
        document_ids: [documents[0].id],
        created_at: "2026-10-01T00:00:00Z",
        error_message: "",
        topics: [],
        sessions: [
          makeSessionSummary({ id: 1, order_index: 0, topic_name: "A", status: "COMPLETED" }),
          makeSessionSummary({ id: 2, order_index: 1, topic_name: "B" }),
          makeSessionSummary({ id: 3, order_index: 2, topic_name: "A", kind: "REVIEW" }),
        ],
      },
    ]);
    renderPage(queryClient);

    expect(await screen.findByText("1 de 2 sesiones completadas")).toBeInTheDocument();
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
  });

  it("sends old ?meta= links to the assistant on Inicio", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[`/plan?meta=${goal.id}`]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/inicio" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("location")).toHaveTextContent(`?meta=${goal.id}#preparar-plan`);
  });
});
