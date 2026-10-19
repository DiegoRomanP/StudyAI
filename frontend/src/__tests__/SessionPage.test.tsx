import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { QuizDTO, QuizResultDTO, SessionDetailDTO } from "../api/types";
import { SessionPage } from "../pages/SessionPage";
import { makeSessionDetail } from "../test/fixtures";

const session: SessionDetailDTO = makeSessionDetail({
  id: 5,
  plan_id: 9,
  topic_name: "Algoritmos",
  review_offset_days: 0,
  material: {
    content_markdown:
      "# Algoritmos\n\nLee [esta fuente](https://evil.example/phish) y mira ![diagrama](https://evil.example/pixel.png).",
    youtube_keywords: ["big o", "big o"],
  },
});

const quiz: QuizDTO = {
  id: 77,
  session_id: 5,
  questions: [
    {
      id: 1,
      order_index: 0,
      question_type: "FLASHCARD",
      prompt: "¿Qué mide Big O?",
      options: [],
      answer: "El crecimiento asintótico",
    },
    {
      id: 2,
      order_index: 1,
      question_type: "FLASHCARD",
      prompt: "¿Qué es una pila?",
      options: [],
      answer: "Una estructura LIFO",
    },
    {
      id: 3,
      order_index: 2,
      question_type: "MULTIPLE_CHOICE",
      prompt: "¿Complejidad de búsqueda binaria?",
      options: ["O(n)", "O(log n)"],
      answer: "O(log n)",
    },
  ],
};

const result: QuizResultDTO = {
  score: 100,
  correct: 1,
  total: 1,
  detail: {
    "1": { type: "flashcard", quality: 0 },
    "2": { type: "flashcard", quality: 4 },
    "3": { type: "multiple_choice", correct: true, selected: "O(log n)", expected: "O(log n)" },
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderSession(
  options: { session?: SessionDetailDTO; quiz?: QuizDTO; cachedSession?: SessionDetailDTO; path?: string } = {},
) {
  vi.spyOn(api, "getSession").mockResolvedValue(options.session ?? session);
  vi.spyOn(api, "getQuiz").mockResolvedValue(options.quiz ?? quiz);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (options.cachedSession) queryClient.setQueryData(["session", 5], options.cachedSession);
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[options.path ?? "/session/5"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/session/:sessionId" element={<SessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

async function goToQuiz() {
  fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Terminé" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ir al test" }));
}

async function answerFlashcard(prompt: string, quality: number) {
  expect(await screen.findByText(prompt)).toBeInTheDocument();
  const reveal = screen.getByRole("button", { name: "Mostrar respuesta" });
  expect(reveal).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(reveal);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Calidad ${quality}`) }));
  fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
}

describe("SessionPage", () => {
  it("material headings never add a second h1", async () => {
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    await screen.findByText(/Lee/);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Algoritmos" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2, name: "Algoritmos" })).toHaveLength(1);
  });

  it("pre-start shows only exit, heading, 25:00 and Empezar", async () => {
    renderSession();

    expect(await screen.findByRole("heading", { level: 1, name: "Algoritmos" })).toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Tiempo restante" })).toHaveTextContent("25:00");
    expect(screen.getByRole("button", { name: "Empezar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Salir de la sesión" })).toHaveAttribute("href", "/plan/9");
    expect(screen.queryByText(/Lee/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminé" })).not.toBeInTheDocument();
  });

  it("Empezar reveals the material and focuses Terminé", async () => {
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    expect(await screen.findByText(/Lee/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminé" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Empezar" })).not.toBeInTheDocument();
  });

  it("Terminé starts the break automatically", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Terminé" }));
    const heading = await screen.findByRole("heading", { name: "Descanso" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("timer")).toHaveTextContent("05:00");
    await vi.advanceTimersByTimeAsync(3000);
    expect(screen.getByRole("timer")).toHaveTextContent("04:57");
  });

  it("study moves to the break at 0", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    await vi.advanceTimersByTimeAsync(25 * 60 * 1000);
    expect(await screen.findByRole("heading", { name: "Descanso" })).toBeInTheDocument();
  });

  it("the break moves to the test at 0", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Terminé" }));
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
  });

  it("Ir al test skips the break", async () => {
    renderSession();
    await goToQuiz();

    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Descanso" })).not.toBeInTheDocument();
  });

  it("removed copy is gone", async () => {
    renderSession();

    await screen.findByRole("button", { name: "Empezar" });
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    await screen.findByText(/Lee/);
    const removed = [
      "Saltar al receso",
      "Iniciar",
      "Receso activo",
      "Paso ",
      "tiempo de estudio",
      "Camina 5 minutos",
      "Volver al plan",
      "Buscar videos relacionados",
    ];
    for (const text of removed) expect(screen.queryByText(new RegExp(text))).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Progreso de la sesión" })).not.toBeInTheDocument();
  });

  it("Repasar el material only with ?fase=test", async () => {
    renderSession();
    await goToQuiz();
    await screen.findByText("¿Qué mide Big O?");
    expect(screen.queryByRole("button", { name: "Repasar el material" })).not.toBeInTheDocument();
  });

  it("labels the recall scale visibly and explains why Siguiente is disabled", async () => {
    renderSession();
    await goToQuiz();

    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    const next = screen.getByRole("button", { name: /siguiente/i });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription("Muestra la respuesta y valora cuánto la recordabas.");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar respuesta" }));
    expect(screen.getByRole("button", { name: /^Calidad 0/ })).toHaveTextContent("0Nada");
    expect(screen.getByRole("button", { name: /^Calidad 5/ })).toHaveTextContent("5Perfecto");
    expect(screen.queryByText(/SM-2/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Calidad 3/ }));
    expect(next).toBeEnabled();
    expect(next).not.toHaveAccessibleDescription();
  });

  it("shows the server-confirmed result after the last answer", async () => {
    const submitQuiz = vi.spyOn(api, "submitQuiz").mockResolvedValue(result);
    renderSession();
    await goToQuiz();

    await answerFlashcard("¿Qué mide Big O?", 0);
    // The next flashcard starts on its prompt, not on the previous card's flipped side.
    await answerFlashcard("¿Qué es una pila?", 4);
    fireEvent.click(screen.getByRole("button", { name: "O(log n)" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    const summary = await screen.findByRole("region", { name: "Resultado del test" });
    // Focus moves to the confirmed result so keyboard and screen-reader users hear it.
    expect(screen.getByRole("heading", { name: "Resultado del test" })).toHaveFocus();
    expect(within(summary).getByText("100%")).toBeInTheDocument();
    expect(within(summary).getByText(/1 de 1 preguntas de opción múltiple correctas/)).toBeInTheDocument();
    expect(within(summary).getByText(/2 tarjetas valoradas/)).toBeInTheDocument();
    expect(submitQuiz).toHaveBeenCalledTimes(1);
    expect(submitQuiz).toHaveBeenCalledWith(77, [
      { question_id: 1, quality: 0 },
      { question_id: 2, quality: 4 },
      { question_id: 3, selected_option: "O(log n)" },
    ]);
  });

  it("keeps the answers and explains a failed submission without announcing success", async () => {
    const submitQuiz = vi
      .spyOn(api, "submitQuiz")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
      .mockResolvedValueOnce(result);
    renderSession();
    await goToQuiz();
    await answerFlashcard("¿Qué mide Big O?", 3);
    await answerFlashcard("¿Qué es una pila?", 5);
    fireEvent.click(screen.getByRole("button", { name: "O(n)" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    expect(await screen.findByText("No se pudo enviar el test. Tus respuestas siguen aquí.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resultado del test" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "O(n)" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(await screen.findByRole("region", { name: "Resultado del test" })).toBeInTheDocument();
    expect(submitQuiz).toHaveBeenCalledTimes(2);
    expect(submitQuiz.mock.calls[1][1]).toEqual(submitQuiz.mock.calls[0][1]);
  });

  it("describes a flashcard-only result without inventing a 0% score", async () => {
    const flashcardOnly: QuizDTO = { ...quiz, questions: quiz.questions.slice(0, 1) };
    vi.spyOn(api, "submitQuiz").mockResolvedValue({
      score: 0,
      correct: 0,
      total: 0,
      detail: { "1": { type: "flashcard", quality: 5 } },
    });
    renderSession({ quiz: flashcardOnly });
    await goToQuiz();
    fireEvent.click(await screen.findByRole("button", { name: "Mostrar respuesta" }));
    expect(screen.getByRole("status", { name: "Respuesta" })).toHaveTextContent(
      "El crecimiento asintótico",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Calidad 5/ }));
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    const summary = await screen.findByRole("region", { name: "Resultado del test" });
    expect(within(summary).getByText(/1 tarjeta valorada/)).toBeInTheDocument();
    expect(within(summary).queryByText("0%")).not.toBeInTheDocument();
  });

  it("opens straight on the test from Práctica's Simulacro and keeps the material one click away", async () => {
    renderSession({ path: "/session/5?fase=test" });

    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /saltar al receso/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar respuesta" }));
    fireEvent.click(screen.getByRole("button", { name: /^Calidad 3/ }));

    fireEvent.click(screen.getByRole("button", { name: "Repasar el material" }));
    expect(screen.getByText("¿Qué mide Big O?")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Volver al test" }));

    // The answer given before reading the material is still there.
    expect(screen.getByRole("button", { name: /^Calidad 3/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks before a new attempt on a completed session even when opened on the test", async () => {
    renderSession({ session: { ...session, status: "COMPLETED", completed_at: "2026-10-10T10:00:00" }, path: "/session/5?fase=test" });

    fireEvent.click(await screen.findByRole("button", { name: "Registrar un nuevo intento" }));
    fireEvent.click(screen.getByRole("button", { name: "Repasar el material" }));
    fireEvent.click(screen.getByRole("button", { name: "Volver al test" }));
    expect(screen.queryByRole("button", { name: "Registrar un nuevo intento" })).not.toBeInTheDocument();
    expect(screen.getByText("¿Qué mide Big O?")).toBeInTheDocument();
  });

  it("shows multiple-choice options as lettered choices with a Markdown prompt", async () => {
    renderSession({ path: "/session/5?fase=test" });
    await answerFlashcard("¿Qué mide Big O?", 0);
    await answerFlashcard("¿Qué es una pila?", 4);

    const options = screen.getByRole("group", { name: "Opciones" });
    expect(within(options).getAllByRole("button").map((button) => button.textContent)).toEqual(
      quiz.questions[2].options.map((option, index) => `${"ABCD"[index]}${option}`),
    );
  });

  it("offers a retry when the quiz cannot be loaded", async () => {
    renderSession();
    vi.mocked(api.getQuiz).mockReset();
    const getQuiz = vi
      .spyOn(api, "getQuiz")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: {} } })
      .mockResolvedValueOnce(quiz);
    await goToQuiz();

    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    expect(getQuiz).toHaveBeenCalledTimes(2);
  });

  it("asks before recording a new attempt for a completed session", async () => {
    const submitQuiz = vi.spyOn(api, "submitQuiz").mockResolvedValue(result);
    renderSession({
      session: { ...session, status: "COMPLETED", completed_at: "2026-10-10T12:00:00Z" },
    });

    await goToQuiz();
    expect(screen.queryByText("¿Qué mide Big O?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Registrar un nuevo intento" }));
    expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    expect(submitQuiz).not.toHaveBeenCalled();
  });

  it("still asks for confirmation when a stale cached session turns out to be completed", async () => {
    renderSession({
      cachedSession: session,
      session: { ...session, status: "COMPLETED", completed_at: "2026-10-10T12:00:00Z" },
    });

    await goToQuiz();
    expect(await screen.findByRole("button", { name: "Registrar un nuevo intento" })).toBeInTheDocument();
    expect(screen.queryByText("¿Qué mide Big O?")).not.toBeInTheDocument();
  });

  it("renders study material without LLM-provided links or remote images", async () => {
    renderSession();

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    expect(await screen.findByText("esta fuente")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "esta fuente" })).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://evil.example/pixel.png"]')).toBeNull();
  });

  it("does not submit twice when the final button is activated repeatedly", async () => {
    let resolveSubmit: (value: QuizResultDTO) => void = () => undefined;
    const submitQuiz = vi.spyOn(api, "submitQuiz").mockReturnValue(
      new Promise<QuizResultDTO>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    renderSession({ quiz: { ...quiz, questions: quiz.questions.slice(2) } });
    await goToQuiz();
    fireEvent.click(await screen.findByRole("button", { name: "O(log n)" }));
    const finish = screen.getByRole("button", { name: "Finalizar" });
    fireEvent.click(finish);
    fireEvent.click(finish);

    await waitFor(() => expect(submitQuiz).toHaveBeenCalledTimes(1));
    resolveSubmit(result);
    expect(await screen.findByRole("region", { name: "Resultado del test" })).toBeInTheDocument();
    expect(submitQuiz).toHaveBeenCalledTimes(1);
  });
});
