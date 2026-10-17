import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DashboardDTO } from "../api/types";
import { DashboardPage } from "../pages/DashboardPage";

const emptyDashboard: DashboardDTO = {
  scores: [],
  weak_topics: [],
  upcoming_reviews: [],
  sessions_completed: 0,
  average_score: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  it("distinguishes a failed load from an empty dashboard and recovers on retry", async () => {
    const getDashboard = vi
      .spyOn(api, "getDashboard")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: {} } })
      .mockResolvedValueOnce(emptyDashboard);
    renderDashboard();

    expect(await screen.findByText("No se pudo cargar tu progreso.")).toBeInTheDocument();
    expect(screen.queryByText(/Completa una sesión/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar carga" }));

    expect(await screen.findByText(/Completa una sesión/)).toBeInTheDocument();
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });

  it("offers a text alternative to the score chart", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...emptyDashboard,
      scores: [
        { session_id: 1, topic_name: "Grafos", score: 80, completed_at: "2026-10-10T10:00:00Z" },
      ],
      sessions_completed: 1,
      average_score: 80,
    });
    renderDashboard();

    const table = await screen.findByRole("table", { name: "Puntaje por sesión" });
    expect(table).toHaveTextContent("Grafos");
    expect(table).toHaveTextContent("80%");
  });
});
