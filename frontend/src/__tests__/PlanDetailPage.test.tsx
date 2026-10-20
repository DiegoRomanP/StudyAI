import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

/** Where a session panel sent the learner. */
function SessionProbe() {
  const location = useLocation();
  return <p>Destino: {location.pathname + location.search}</p>;
}

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
          <Route path="/session/:sessionId" element={<SessionProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlanDetailPage", () => {
  it("shows indeterminate activity while analysing instead of an invented percentage", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue({
      ...readyPlan,
      status: "PROCESSING",
      topics: [],
      progress_stage: "TOPICS",
      progress_done: 0,
      progress_total: 0,
    });
    renderPlan();

    expect(await screen.findByRole("heading", { level: 1, name: readyPlan.title })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Qué está haciendo la IA" })).toBeInTheDocument();
    expect(screen.getByText(/puedes salir y volver/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Analizando tu material…" })).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows which session is being prepared with a real progress bar", async () => {
    vi.spyOn(api, "getPlan").mockResolvedValue({
      ...readyPlan,
      status: "PROCESSING",
      progress_stage: "CONTENT",
      progress_done: 1,
      progress_total: 3,
    });
    renderPlan();

    expect(await screen.findByText("Preparando la sesión 2 de 3")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
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
    expect(within(sessions).getByRole("button", { name: /Grafos.*Completada/ })).toBeInTheDocument();

    fireEvent.click(within(sessions).getByRole("button", { name: "Lista" }));
    const rows = within(sessions).getAllByRole("button", { name: /min/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^1Grafos/),
      expect.stringMatching(/^2Árboles/),
      expect.stringMatching(/^3Heaps/),
    ]);
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
    expect(within(sessions).getByRole("button", { name: /Grafos.*Repaso.*Pendiente/ })).toBeInTheDocument();
    expect(within(sessions).queryByText(/repaso a/)).not.toBeInTheDocument();
  });

  describe("an incomplete plan", () => {
    const failedPlan: PlanDTO = {
      ...readyPlan,
      status: "FAILED",
      error_message: "La IA cortó la respuesta.",
      progress_stage: "CONTENT",
      progress_done: 2,
      progress_total: 3,
      topics: [1, 2, 3, 4].map((id) =>
        makeTopic({ id, name: `Tema ${id}`, subtopics: [], difficulty: 3, relevance: 0.5, selected: id < 4 }),
      ),
    };

    function mockRuntime(remaining: number | null) {
      vi.spyOn(api, "getLlmRuntime").mockResolvedValue({
        source: remaining === null ? "USER" : "ENV",
        bundled: remaining !== null,
        free_ai: remaining === null ? null : { limit: 3, used: 3 - remaining, remaining },
      } as Awaited<ReturnType<typeof api.getLlmRuntime>>);
    }

    it("keeps what was generated and continues it with a single request on a double click", async () => {
      mockRuntime(null);
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      let release: (value: Awaited<ReturnType<typeof api.resumePlan>>) => void = () => {};
      const resume = vi.spyOn(api, "resumePlan").mockReturnValue(new Promise((resolve) => (release = resolve)));
      renderPlan();

      expect(await screen.findByText("Incompleto")).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByText("La IA cortó la respuesta.")).toBeInTheDocument();
      expect(screen.getByText("Se conservaron 3 temas y 2 de 3 sesiones.")).toBeInTheDocument();
      const button = screen.getByRole("button", { name: "Continuar generación" });

      fireEvent.click(button);
      fireEvent.click(button);

      expect(await screen.findByRole("button", { name: "Continuando…" })).toBeDisabled();
      expect(resume).toHaveBeenCalledTimes(1);
      expect(resume).toHaveBeenCalledWith(9);
      release({ id: 9, status: "PROCESSING", error_message: "" });
    });

    it("explains why it cannot continue without free uses left", async () => {
      mockRuntime(0);
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      renderPlan();

      const reason = await screen.findByText(/Sin usos gratis hoy\./);
      const button = screen.getByRole("button", { name: "Continuar generación" });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-describedby", reason.id);
      expect(within(reason).getByRole("link", { name: "Conectar IA" })).toHaveAttribute("href", "/settings");
    });

    it("shows the server's refusal", async () => {
      mockRuntime(1);
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      vi.spyOn(api, "resumePlan").mockRejectedValue({
        isAxiosError: true,
        response: { status: 429, data: { detail: "Ya usaste tus 3 usos gratis de hoy.", code: "FREE_AI_DAILY_LIMIT" } },
      });
      renderPlan();

      fireEvent.click(await screen.findByRole("button", { name: "Continuar generación" }));

      expect(await screen.findByText("Ya usaste tus 3 usos gratis de hoy.")).toBeInTheDocument();
    });

    it("mentions only the topics when no session was planned", async () => {
      mockRuntime(null);
      vi.spyOn(api, "getPlan").mockResolvedValue({ ...failedPlan, progress_stage: "SESSIONS", progress_total: 0, progress_done: 0 });
      renderPlan();

      expect(await screen.findByText("Se conservaron 4 temas.")).toBeInTheDocument();
    });
  });

  describe("the session panel", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 60_000).toISOString();

    function mockSessions() {
      vi.spyOn(api, "getPlan").mockResolvedValue({
        ...readyPlan,
        sessions: [
          makeSessionSummary({
            id: 70,
            order_index: 0,
            topic_name: "Grafos",
            status: "COMPLETED",
            last_result: { score: 75, correct: 3, total: 4, created_at: twoHoursAgo },
          }),
          makeSessionSummary({ id: 71, order_index: 1, topic_name: "Árboles" }),
          makeSessionSummary({ id: 72, order_index: 2, topic_name: "Heaps" }),
        ],
      });
    }

    async function openRow(name: RegExp) {
      const sessions = await screen.findByRole("region", { name: "Sesiones" });
      fireEvent.click(within(sessions).getByRole("button", { name }));
      return screen.getByRole("dialog");
    }

    it("offers the material or the test for a session not started, and closes with Escape", async () => {
      mockSessions();
      renderPlan();

      let dialog = await openRow(/Árboles.*Pendiente/);
      expect(dialog).toHaveAccessibleName("¿Qué quieres hacer?");
      expect(within(dialog).getByRole("button", { name: "Ver sesión" })).toHaveFocus();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      dialog = await openRow(/Árboles/);
      fireEvent.click(within(dialog).getByRole("button", { name: "Ir al test" }));
      expect(await screen.findByText("Destino: /session/71?fase=test")).toBeInTheDocument();
    });

    it("resumes or restarts a test left halfway", async () => {
      window.localStorage.setItem(
        "studyai.quizDraft.72",
        JSON.stringify({ quizId: 5, answers: { 1: { question_id: 1, selected_option: "a" } }, order: null }),
      );
      mockSessions();
      renderPlan();

      const dialog = await openRow(/Heaps.*En curso/);
      expect(within(dialog).getByRole("button", { name: "Seguir desde la última pregunta no terminada" })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Empezar test desde 0" }));

      expect(await screen.findByText("Destino: /session/72?fase=test")).toBeInTheDocument();
      expect(window.localStorage.getItem("studyai.quizDraft.72")).toBeNull();
    });

    it("shows the last result under a completed session and offers its stats or a new attempt", async () => {
      mockSessions();
      renderPlan();

      const sessions = await screen.findByRole("region", { name: "Sesiones" });
      const row = within(sessions).getByRole("button", { name: /Grafos.*Completada/ });
      expect(row).toHaveTextContent("75% aciertos");
      expect(row).toHaveTextContent("3 buenas");
      expect(row).toHaveTextContent("1 malas");
      expect(row).toHaveTextContent("Realizado hace 2 horas");

      const dialog = await openRow(/Grafos.*Completada/);
      expect(within(dialog).getByRole("button", { name: "Empezar sesión de nuevo" })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Ver estadísticas" }));
      expect(await screen.findByText("Destino: /session/70?fase=resultado")).toBeInTheDocument();
    });
  });
});
