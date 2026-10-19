import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { LLMRuntimeDTO, PlanDTO, QuizDTO, SessionDetailDTO } from "../api/types";
import { SessionPage } from "../pages/SessionPage";
import { makeSessionDetail } from "../test/fixtures";

const ALWAYS_KEY = "studyai.onboarding.reinforce.always";

const review: SessionDetailDTO = makeSessionDetail({
  id: 8,
  plan_id: 9,
  topic_name: "Algoritmos",
  kind: "REVIEW",
  topic_id: 1,
  scheduled_date: "2000-01-01",
  review_points: [
    { prompt: "¿Qué mide Big O?", answer: "El crecimiento asintótico" },
    { prompt: "¿Qué es una pila?", answer: "Una estructura LIFO" },
  ],
  material: { content_markdown: "Material original del repaso.", youtube_keywords: [] },
});

const plan: PlanDTO = {
  id: 9,
  title: "Plan",
  status: "READY",
  goal_id: 1,
  document_ids: [1],
  created_at: "2026-10-10T09:00:00Z",
  error_message: "",
  topics: [],
  sessions: [],
};

const mockRuntime: LLMRuntimeDTO = {
  source: "MOCK",
  provider: null,
  models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
  fallback_reason: null,
};

const quiz: QuizDTO = {
  id: 80,
  session_id: 8,
  questions: [
    { id: 1, order_index: 0, question_type: "MULTIPLE_CHOICE", prompt: "Primera", options: ["a", "b"], answer: "a" },
    { id: 2, order_index: 1, question_type: "MULTIPLE_CHOICE", prompt: "Segunda", options: ["c", "d"], answer: "c" },
    { id: 3, order_index: 2, question_type: "MULTIPLE_CHOICE", prompt: "Tercera", options: ["e", "f"], answer: "e" },
  ],
};

function renderReview(
  options: { session?: SessionDetailDTO; runtime?: LLMRuntimeDTO; path?: string; strict?: boolean; quiz?: QuizDTO } = {},
) {
  vi.spyOn(api, "getSession").mockResolvedValue(options.session ?? review);
  vi.spyOn(api, "getQuiz").mockResolvedValue(options.quiz ?? quiz);
  vi.spyOn(api, "getPlan").mockResolvedValue(plan);
  vi.spyOn(api, "getLlmRuntime").mockResolvedValue(options.runtime ?? mockRuntime);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[options.path ?? "/session/8"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/session/:sessionId" element={<SessionPage />} />
          <Route path="/settings" element={<p>Ajustes</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("review session", () => {
  it("shows the failed points and the AI card, the card first in the DOM", async () => {
    renderReview();

    const card = await screen.findByRole("heading", { name: "Refuerza con IA" });
    const points = screen.getByRole("heading", { name: "Puntos a reforzar" });
    expect(card.compareDocumentPosition(points) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Repaso")).toBeInTheDocument();
    expect(screen.getByText(/→ El crecimiento asintótico/)).toBeInTheDocument();
    expect(screen.getByText("Usa IA para generar material de repaso en los puntos que has fallado.")).toBeInTheDocument();
  });

  it("no review points hides card and list", async () => {
    renderReview({ session: { ...review, review_points: [] } });

    await screen.findByRole("button", { name: "Empezar" });
    expect(screen.queryByRole("heading", { name: "Refuerza con IA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Puntos a reforzar" })).not.toBeInTheDocument();
  });

  it("Solo esta sesión starts the reinforcement without remembering it", async () => {
    const start = vi.spyOn(api, "startReinforcement").mockResolvedValue({ ...review, reinforcement_status: "PROCESSING" });
    renderReview();

    const open = await screen.findByRole("button", { name: "Reforzar con IA" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Solo esta sesión" }));

    await waitFor(() => expect(start).toHaveBeenCalledWith(8));
    expect(window.localStorage.getItem(ALWAYS_KEY)).toBeNull();
    expect(await screen.findByText("Generando refuerzo…")).toBeInTheDocument();
  });

  it("Siempre starts it and remembers the choice", async () => {
    const start = vi.spyOn(api, "startReinforcement").mockResolvedValue({ ...review, reinforcement_status: "PROCESSING" });
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Reforzar con IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Siempre" }));

    await waitFor(() => expect(start).toHaveBeenCalledWith(8));
    expect(window.localStorage.getItem(ALWAYS_KEY)).toBe("1");
  });

  it("with always preference the request fires once under StrictMode", async () => {
    window.localStorage.setItem(ALWAYS_KEY, "1");
    const start = vi.spyOn(api, "startReinforcement").mockResolvedValue({ ...review, reinforcement_status: "PROCESSING" });
    renderReview({ strict: true });

    await screen.findByText("Generando refuerzo…");
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });

  it("always preference does not fire when the free uses are spent", async () => {
    window.localStorage.setItem(ALWAYS_KEY, "1");
    const start = vi.spyOn(api, "startReinforcement");
    renderReview({
      runtime: { ...mockRuntime, source: "ENV", bundled: true, free_ai: { limit: 3, used: 3, remaining: 0 } },
    });

    const button = await screen.findByRole("button", { name: "Reforzar con IA" });
    expect(button).toBeDisabled();
    expect(start).not.toHaveBeenCalled();
  });

  it("no free uses disables the button with a linked reason", async () => {
    renderReview({
      runtime: { ...mockRuntime, source: "ENV", bundled: true, free_ai: { limit: 3, used: 3, remaining: 0 } },
    });

    const button = await screen.findByRole("button", { name: "Reforzar con IA" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleDescription(/Sin usos gratis hoy\./);
    expect(screen.getByRole("link", { name: "Conectar IA" })).toHaveAttribute("href", "/settings");
  });

  it("processing disables Empezar with a visible reason and Seguir sin IA cancels", async () => {
    const cancel = vi
      .spyOn(api, "cancelReinforcement")
      .mockResolvedValue({ ...review, reinforcement_status: "NONE" });
    renderReview({ session: { ...review, reinforcement_status: "PROCESSING" } });

    const empezar = await screen.findByRole("button", { name: "Empezar" });
    expect(empezar).toBeDisabled();
    expect(empezar).toHaveAccessibleDescription("Esperando el refuerzo con IA");
    fireEvent.click(screen.getByRole("button", { name: "Seguir sin IA" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith(8));
    await waitFor(() => expect(screen.getByRole("button", { name: "Empezar" })).toBeEnabled());
  });

  it("failed shows the error and keeps Empezar enabled", async () => {
    renderReview({
      session: { ...review, reinforcement_status: "FAILED", reinforcement_error: "La IA no devolvió material válido." },
    });

    expect(await screen.findByText("La IA no devolvió material válido.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar con IA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar" })).toBeEnabled();
  });

  it("ready hides the card and marks the review as AI reinforced", async () => {
    renderReview({ session: { ...review, reinforcement_status: "READY" } });

    await screen.findByRole("button", { name: "Empezar" });
    expect(screen.queryByRole("heading", { name: "Refuerza con IA" })).not.toBeInTheDocument();
    expect(screen.getByText("Con IA")).toBeInTheDocument();
  });

  it("the document after Empezar is the failed points followed by the material", async () => {
    renderReview();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    expect(await screen.findByText("Material original del repaso.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Puntos a reforzar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Refuerza con IA" })).not.toBeInTheDocument();
  });
});

describe("review quiz", () => {
  it("Mezclar reorders only before the first answer and is absent on NEW sessions", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    renderReview({ path: "/session/8?fase=test" });

    expect(await screen.findByText("Primera")).toBeInTheDocument();
    const mezclar = screen.getByRole("button", { name: "Mezclar" });
    expect(mezclar).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mezclar);
    expect(screen.getByText("Segunda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mezclar" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "c" }));
    expect(screen.queryByRole("button", { name: "Mezclar" })).not.toBeInTheDocument();
  });

  it("does not offer Mezclar on a new session", async () => {
    renderReview({ session: { ...review, kind: "NEW", review_points: [] }, path: "/session/8?fase=test" });

    await screen.findByText("Primera");
    expect(screen.queryByRole("button", { name: "Mezclar" })).not.toBeInTheDocument();
  });

  it("QUIZ_OUTDATED keeps answers and reloads the quiz", async () => {
    const outdated = {
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "Las preguntas de este test cambiaron. Vuelve a cargarlo.", code: "QUIZ_OUTDATED" },
      },
    };
    vi.spyOn(api, "submitQuiz").mockRejectedValueOnce(outdated);
    renderReview({ path: "/session/8?fase=test", quiz: { ...quiz, questions: [quiz.questions[0]] } });
    const getQuiz = vi.mocked(api.getQuiz);

    fireEvent.click(await screen.findByRole("button", { name: "a" }));
    // The replaced quiz keeps question 1 and adds a new one.
    getQuiz.mockResolvedValue({ ...quiz, questions: [quiz.questions[0], quiz.questions[1]] });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByText("Las preguntas de este test cambiaron. Vuelve a cargarlo.")).toBeInTheDocument();
    await waitFor(() => expect(getQuiz).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Pregunta 1 de 2")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Opciones" })).getByRole("button", { name: "a" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
