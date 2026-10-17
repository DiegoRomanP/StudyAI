import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { PlanDTO } from "../api/types";
import { PlanDetailPage } from "../pages/PlanDetailPage";

const readyPlan: PlanDTO = {
  id: 9,
  title: "Plan de algoritmos",
  status: "READY",
  goal_id: 3,
  document_ids: [4],
  created_at: "2026-10-01T10:00:00Z",
  error_message: "",
  topics: [
    { id: 1, name: "Grafos", subtopics: [], difficulty: 4, relevance: 0.9, selected: true },
  ],
  sessions: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPlan() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/plan/9"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/plan/:planId" element={<PlanDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlanDetailPage", () => {
  it("shows indeterminate activity while generating instead of an invented percentage", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue({ ...readyPlan, status: "PROCESSING", topics: [] });
    renderPlan();

    expect(await screen.findByText("Generando tu plan…")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Generación en curso" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("explains that a deleted plan no longer exists", async () => {
    vi.spyOn(api, "getPlan").mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: "Plan no encontrado." } },
    });
    renderPlan();

    expect(await screen.findByRole("heading", { name: "Este plan ya no existe" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a los planes" })).toHaveAttribute("href", "/plan");
  });

  it("states that a ready plan has no sessions instead of rendering an empty list", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    renderPlan();

    expect(await screen.findByText("Este plan no tiene sesiones disponibles.")).toBeInTheDocument();
  });
});
