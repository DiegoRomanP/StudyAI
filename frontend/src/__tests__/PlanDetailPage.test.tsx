import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { PlanDTO } from "../api/types";
import { PlanDetailPage } from "../pages/PlanDetailPage";
import { makeTopic, makeSessionSummary } from "../test/fixtures";

const readyPlan: PlanDTO = {
  id: 9,
  title: "Plan de algoritmos",
  status: "READY",
  goal_id: 3,
  document_ids: [4],
  created_at: "2026-10-01T10:00:00Z",
  error_message: "",
  topics: [
    makeTopic({ id: 1, name: "Grafos", subtopics: [], difficulty: 4, relevance: 0.9, selected: true }),
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

    expect(await screen.findByRole("heading", { level: 1, name: readyPlan.title })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Qué está haciendo la IA" })).toBeInTheDocument();
    expect(screen.getByText(/puedes salir y volver/)).toBeInTheDocument();
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

    expect(await screen.findByText("Este plan no tiene sesiones")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Plan de estudio" })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("list", { name: "Cómo es cada sesión" })).toHaveTextContent(/Estudio.*Receso.*Test/);
  });

  it("offers the next pending session and lists every session by suggested day or order", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue({
      ...readyPlan,
      created_at: "2026-10-12T10:00:00",
      sessions: [
        makeSessionSummary({ id: 70, order_index: 0, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 0, status: "COMPLETED" }),
        makeSessionSummary({ id: 72, order_index: 2, topic_name: "Heaps", duration_minutes: 25, review_offset_days: 3, status: "PENDING" }),
        makeSessionSummary({ id: 71, order_index: 1, topic_name: "Árboles", duration_minutes: 25, review_offset_days: 0, status: "PENDING" }),
      ],
    });
    renderPlan();

    expect(await screen.findByRole("link", { name: /Comenzar siguiente sesión/ })).toHaveAttribute(
      "href",
      "/session/71",
    );
    expect(screen.getByText("1 de 3 sesiones completadas")).toBeInTheDocument();

    const sessions = screen.getByRole("region", { name: "Sesiones" });
    const days = within(sessions).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatch(/12/);
    expect(days[1]).toMatch(/15/);
    expect(within(sessions).getByRole("link", { name: /Grafos.*Completada/ })).toHaveAttribute("href", "/session/70");

    fireEvent.click(within(sessions).getByRole("button", { name: "Lista" }));
    const links = within(sessions).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/session/70", "/session/71", "/session/72"]);
    expect(screen.getByRole("link", { name: /Ver temas clave/ })).toHaveAttribute("href", "/temas?plan=9");
  });

  it("links Siguiente to the review that is due before a new session and badges it", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue({
      ...readyPlan,
      created_at: "2026-10-12T10:00:00",
      sessions: [
        makeSessionSummary({ id: 70, order_index: 0, topic_name: "Grafos", status: "COMPLETED", topic_id: 1 }),
        makeSessionSummary({ id: 71, order_index: 1, topic_name: "Árboles" }),
        makeSessionSummary({
          id: 72,
          order_index: 2,
          topic_name: "Grafos",
          kind: "REVIEW",
          topic_id: 1,
          scheduled_date: "2026-10-01",
        }),
      ],
    });
    renderPlan();

    expect(await screen.findByRole("link", { name: /Comenzar siguiente sesión/ })).toHaveAttribute(
      "href",
      "/session/72",
    );
    expect(screen.getByText("1 de 2 sesiones completadas")).toBeInTheDocument();
    const sessions = screen.getByRole("region", { name: "Sesiones" });
    expect(within(sessions).getByRole("link", { name: /Grafos.*Repaso.*Pendiente/ })).toHaveAttribute(
      "href",
      "/session/72",
    );
    expect(within(sessions).queryByText(/repaso a/)).not.toBeInTheDocument();
  });
});
