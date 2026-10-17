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

  it("filters quiz history by period and offers a text alternative to the chart", async () => {
    const daysAgo = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      // Backend format: naive UTC without offset.
      return date.toISOString().replace("Z", "");
    };
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...emptyDashboard,
      scores: [
        { session_id: 1, topic_name: "Historia", score: 40, completed_at: daysAgo(20) },
        { session_id: 2, topic_name: "Grafos", score: 80, completed_at: daysAgo(1) },
      ],
      sessions_completed: 2,
      average_score: 60,
    });
    renderDashboard();

    const summary = await screen.findByRole("region", { name: "Resumen del periodo" });
    expect(screen.getByRole("button", { name: "7 días" })).toHaveAttribute("aria-pressed", "true");
    expect(summary).toHaveTextContent("Quizzes resueltos1");
    expect(summary).toHaveTextContent("Precisión media80%");
    let table = screen.getByRole("table", { name: "Puntaje por sesión" });
    expect(table).toHaveTextContent("Grafos");
    expect(table).not.toHaveTextContent("Historia");

    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    expect(summary).toHaveTextContent("Quizzes resueltos2");
    expect(summary).toHaveTextContent("Precisión media60%");
    table = screen.getByRole("table", { name: "Puntaje por sesión" });
    expect(table).toHaveTextContent("Historia");
  });

  it("explains an empty period instead of an empty chart", async () => {
    vi.spyOn(api, "getDashboard").mockResolvedValue({
      ...emptyDashboard,
      scores: [{ session_id: 1, topic_name: "Grafos", score: 80, completed_at: "2020-01-10T10:00:00" }],
      sessions_completed: 1,
      average_score: 80,
    });
    renderDashboard();

    expect(await screen.findByText("No resolviste quizzes en los últimos 7 días.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todo el historial" }));
    expect(screen.getByRole("table", { name: "Puntaje por sesión" })).toHaveTextContent("Grafos");
  });
});
