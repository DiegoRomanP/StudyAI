import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { api } from "../api/endpoints";
import type { PlanDTO, QuizDTO } from "../api/types";
import { PracticePage } from "../pages/PracticePage";
import { makeTopic, makeSessionSummary } from "../test/fixtures";

const plan: PlanDTO = {
  id: 9,
  title: "Plan de algoritmos",
  status: "READY",
  goal_id: 1,
  document_ids: [1],
  created_at: "2026-10-12T10:00:00",
  error_message: "",
  topics: [
    makeTopic({ id: 1, name: "Grafos", subtopics: [], difficulty: 5, relevance: 0.9, selected: true }),
    makeTopic({ id: 2, name: "Listas", subtopics: [], difficulty: 2, relevance: 0.7, selected: true }),
  ],
  sessions: [
    makeSessionSummary({ id: 70, order_index: 0, topic_name: "Listas", duration_minutes: 25, review_offset_days: 0, status: "COMPLETED" }),
    makeSessionSummary({ id: 71, order_index: 1, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 1, status: "PENDING" }),
  ],
};

const quizzes: Record<number, QuizDTO> = {
  70: {
    id: 700,
    session_id: 70,
    questions: [
      {
        id: 1,
        order_index: 0,
        question_type: "MULTIPLE_CHOICE",
        prompt: "¿Coste de acceder al índice *i* de un arreglo?",
        options: ["O(1)", "O(n)", "O(log n)", "O(n²)"],
        answer: "O(1)",
      },
    ],
  },
  71: {
    id: 710,
    session_id: 71,
    questions: [
      { id: 2, order_index: 0, question_type: "FLASHCARD", prompt: "¿Qué recorre BFS primero?", options: [], answer: "Los vecinos" },
    ],
  },
};

function renderPractice(path = "/practica") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/practica" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PracticePage", () => {
  it("gives immediate feedback without ever submitting a result", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan]);
    vi.spyOn(api, "getQuiz").mockImplementation(async (sessionId: number) => quizzes[sessionId]);
    const writes = (["post", "put", "patch", "delete"] as const).map((method) => vi.spyOn(apiClient, method));
    renderPractice();

    expect(await screen.findByText("Pregunta 1 de 2")).toBeInTheDocument();
    const options = screen.getByRole("group", { name: "Opciones" });
    expect(within(options).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(within(options).getByRole("button", { name: /O\(n\)$/ }));

    expect(screen.getByText("Incorrecto. La respuesta es: O(1)")).toBeInTheDocument();
    const right = within(options).getByRole("button", { name: /O\(1\).*Respuesta correcta/ });
    expect(right).toHaveAttribute("aria-disabled", "true");
    // Options lock after feedback without dropping keyboard focus.
    fireEvent.click(right);
    expect(screen.getByText("Aciertos: 0 de 1")).toBeInTheDocument();
    expect(screen.getByText("Aciertos: 0 de 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente pregunta" }));
    expect(screen.getByRole("button", { name: "Terminar ronda" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar respuesta" }));
    expect(screen.getByText("Los vecinos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminar ronda" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Terminar ronda" }));

    expect(screen.getByText("Acertaste 0 de 1 preguntas de opción múltiple.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al simulacro" })).toHaveAttribute("href", "/practica?plan=9&modo=simulacro");
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it("filters to questions from topics the AI rated as hard", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan]);
    vi.spyOn(api, "getQuiz").mockImplementation(async (sessionId: number) => quizzes[sessionId]);
    renderPractice();

    await screen.findByText("Pregunta 1 de 2");
    fireEvent.click(screen.getByRole("button", { name: "Difíciles" }));

    expect(screen.getByText("Pregunta 1 de 1")).toBeInTheDocument();
    expect(screen.getByText("¿Qué recorre BFS primero?")).toBeInTheDocument();
    expect(screen.getByText("Difícil")).toBeInTheDocument();
  });

  it("shows a repeated option once and accepts an answer with stray spaces", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([{ ...plan, sessions: [plan.sessions[0]] }]);
    vi.spyOn(api, "getQuiz").mockResolvedValue({
      ...quizzes[70],
      questions: [{ ...quizzes[70].questions[0], options: ["O(1)", "O(1)", "O(n)"], answer: "O(1) " }],
    });
    renderPractice();

    const options = await screen.findByRole("group", { name: "Opciones" });
    expect(within(options).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(options).getByRole("button", { name: "O(1)" }));
    expect(screen.getByText("¡Correcto!")).toBeInTheDocument();
  });

  it("does not restart the round when a slower quiz arrives late", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan]);
    let releaseSlow: (quiz: QuizDTO) => void = () => undefined;
    vi.spyOn(api, "getQuiz").mockImplementation((sessionId: number) =>
      sessionId === 71 ? new Promise<QuizDTO>((resolve) => (releaseSlow = resolve)) : Promise.resolve(quizzes[70]),
    );
    renderPractice();

    expect(await screen.findByText("Cargando preguntas…")).toBeInTheDocument();
    expect(screen.queryByText(/Pregunta 1 de/)).not.toBeInTheDocument();
    releaseSlow(quizzes[71]);
    expect(await screen.findByText("Pregunta 1 de 2")).toBeInTheDocument();
  });

  it("keeps the loaded questions and offers a retry when one session's quiz fails", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan]);
    const getQuiz = vi.spyOn(api, "getQuiz").mockImplementation(async (sessionId: number) => {
      if (sessionId === 71) throw { isAxiosError: true, response: { status: 503, data: {} } };
      return quizzes[sessionId];
    });
    renderPractice();

    expect(await screen.findByText("Algunas preguntas no se pudieron cargar")).toBeInTheDocument();
    expect(screen.getByText("Pregunta 1 de 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(getQuiz).toHaveBeenCalledTimes(3);
  });

  it("opens the recorded test from Simulacro", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([plan]);
    const getQuiz = vi.spyOn(api, "getQuiz");
    renderPractice("/practica?modo=simulacro");

    expect(await screen.findByRole("link", { name: "Hacer el simulacro de Grafos" })).toHaveAttribute(
      "href",
      "/session/71?fase=test",
    );
    expect(screen.getByText(/Tu resultado se guarda en Estadísticas/)).toBeInTheDocument();
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it("guides to Inicio when there is no ready plan", async () => {
    vi.spyOn(api, "listPlans").mockResolvedValue([]);
    renderPractice();
    expect(await screen.findByRole("link", { name: "Prepara tu plan en Inicio" })).toHaveAttribute("href", "/inicio#preparar-plan");
  });

  it("practice skips review copies but keeps AI reinforcement", async () => {
    const review = (id: number, reinforcement: "NONE" | "READY") =>
      makeSessionSummary({
        id,
        order_index: id,
        topic_name: "Grafos",
        kind: "REVIEW",
        topic_id: 1,
        reinforcement_status: reinforcement,
      });
    vi.spyOn(api, "listPlans").mockResolvedValue([
      { ...plan, sessions: [...plan.sessions, review(72, "NONE"), review(73, "READY")] },
    ]);
    const getQuiz = vi.spyOn(api, "getQuiz").mockImplementation(async (sessionId: number) => ({
      ...(quizzes[sessionId] ?? { id: sessionId * 10, session_id: sessionId, questions: [] }),
    }));
    renderPractice();

    await screen.findByText("Pregunta 1 de 2");
    const requested = getQuiz.mock.calls.map(([id]) => id);
    expect(requested).not.toContain(72);
    expect(requested).toContain(73);
  });
});
