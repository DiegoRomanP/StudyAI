import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { PlanDTO } from "../api/types";
import { PAGE_GUIDES } from "../lib/pageGuides";
import { TopicsPage } from "../pages/TopicsPage";
import { makeTopic, makeSessionSummary } from "../test/fixtures";

const plan = (overrides: Partial<PlanDTO>): PlanDTO => ({
  id: 9,
  title: "Plan de algoritmos",
  status: "READY",
  goal_id: 1,
  document_ids: [1],
  created_at: "2026-10-12T10:00:00Z",
  error_message: "",
  topics: [
    makeTopic({ id: 1, name: "Grafos", subtopics: ["BFS", "DFS"], difficulty: 4, relevance: 0.95, selected: true }),
    makeTopic({ id: 2, name: "Historia", subtopics: [], difficulty: 1, relevance: 0.2, selected: false }),
  ],
  sessions: [
    makeSessionSummary({ id: 70, order_index: 0, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 0, status: "PENDING" }),
  ],
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderTopics(path = "/temas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/temas" element={<TopicsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TopicsPage", () => {
  it("shows the AI's topic analysis with relevance, difficulty, subtopics and sessions", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan({})]);
    renderTopics();

    const prioritized = await screen.findByRole("region", { name: "Priorizados" });
    const grafos = within(prioritized).getByRole("heading", { name: "Grafos" }).closest("li")!;
    expect(grafos).toHaveTextContent("Relevancia estimada95%");
    expect(grafos).toHaveTextContent("Dificultad estimada: 4 de 5 (5 = más difícil) · 1 sesión");
    expect(within(grafos).getByRole("list", { name: "Subtemas de Grafos" })).toHaveTextContent("BFSDFS");
    expect(screen.getByRole("region", { name: "Fuera de la selección" })).toHaveTextContent("Historia");
    expect(screen.getByText(/no una\s+garantía/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Temas clave" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: PAGE_GUIDES.temas.title })).toBeInTheDocument();
  });

  it("offers a way back to the plan when there is no topic analysis", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan({ topics: [] })]);
    renderTopics();

    expect(await screen.findByText("Este plan no tiene análisis de temas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mi plan" })).toHaveAttribute("href", "/plan/9");
  });

  it("selects the plan from the URL and lets the learner switch plans", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([
      plan({ id: 9, title: "Plan de algoritmos" }),
      plan({
        id: 10,
        title: "Plan de redes",
        created_at: "2026-10-13T10:00:00Z",
        topics: [makeTopic({ id: 3, name: "TCP", subtopics: [], difficulty: 3, relevance: 0.8, selected: true })],
      }),
    ]);
    renderTopics("/temas?plan=9");

    expect(await screen.findByRole("heading", { name: "Grafos" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Plan" }), { target: { value: "10" } });
    expect(await screen.findByRole("heading", { name: "TCP" })).toBeInTheDocument();
  });

  it("guides to Inicio when there is no ready plan and separates failures from empty", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan({ status: "PROCESSING" })]);
    renderTopics();
    expect(await screen.findByRole("link", { name: "Prepara tu plan en Inicio" })).toHaveAttribute("href", "/inicio#preparar-plan");
  });

  it("reports a load failure instead of an empty analysis", async () => {
    vi.spyOn(api, "listPlans").mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    renderTopics();
    expect(await screen.findByText("No se pudieron cargar tus planes.")).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no tienes un plan/)).not.toBeInTheDocument();
  });
});
