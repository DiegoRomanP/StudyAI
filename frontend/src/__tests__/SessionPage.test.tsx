import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import { adaptiveLearningApi } from "../api/adaptiveLearning";
import type { GraphStimulus, LearningResponseV2 } from "../api/adaptiveLearning";
import type { PlanDTO, QuizDTO, QuizResultDTO, SessionDetailDTO } from "../api/types";
import { SessionPage } from "../pages/SessionPage";
import { makeSessionDetail, makeSessionSummary, makeTopic } from "../test/fixtures";

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

const adaptiveLesson: LearningResponseV2 = {
  session_id: 5,
  content_version: 2,
  snapshot: {
    snapshot_schema_version: 2,
    profile_id: "systemic_empirical",
    profile_version: 1,
    name: "Sistémico-Empírico",
    discipline_examples: ["Biología"],
    rules: ["Relaciona datos y conclusiones."],
    bloom_levels: ["remember", "analyze"],
    allowed_question_types: ["multiple_choice"],
    primary_evaluation_criterion: "accuracy",
    estimated_minutes_per_question: { min: 3, max: 8 },
    question_time_overrides: {},
    feedback_modes: ["formula"],
    procedure_rubric_weights: null,
    objectives: [
      {
        id: "objective-1",
        skill: "Interpretar datos de germinación",
        description: "Compara las mediciones y relaciona el patrón con el resultado.",
        bloom_target: "analyze",
      },
    ],
  },
  lesson_blocks: [
    {
      id: "lesson-1",
      kind: "explanation",
      objective_ids: ["objective-1"],
      content_markdown:
        "**Compara** las series antes de explicar la tendencia. [Fuente externa](https://evil.example) ![diagrama](https://evil.example/image.png)",
      source_refs: ["source-1"],
      stimulus_id: "graph-1",
    },
    {
      id: "lesson-2",
      kind: "example",
      objective_ids: ["objective-1"],
      content_markdown: "Aplica la comparación a un ejemplo.",
      source_refs: [],
      stimulus_id: "case-1",
    },
  ],
  content_markdown: "Lección adaptativa de respaldo.",
  stimuli: [
    {
      id: "graph-1",
      kind: "graph",
      title: "Germinación por día",
      objective_ids: ["objective-1"],
      origin: "derived",
      source_id: "source-1",
      x_label: "Día",
      y_label: "Plantas",
      x_unit: "días",
      y_unit: "plantas",
      series: [
        {
          name: "Lote A",
          points: [
            { x: 1, y: 2 },
            { x: 2, y: 4 },
          ],
        },
      ],
      text_alternative: "El lote A crece de dos plantas el día 1 a cuatro el día 2.",
    },
    {
      id: "case-1",
      kind: "case",
      title: "Ejemplo de observación",
      objective_ids: ["objective-1"],
      origin: "generated_example",
      body_markdown: "Una estudiante compara dos bandejas de semillas.",
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderSession(
  options: {
    session?: SessionDetailDTO;
    quiz?: QuizDTO;
    plan?: PlanDTO;
    cachedSession?: SessionDetailDTO;
    path?: string;
    contentVersion?: 1 | 2;
    lesson?: LearningResponseV2;
    lessonError?: unknown;
  } = {},
) {
  vi.spyOn(api, "getSession").mockResolvedValue(options.session ?? session);
  vi.spyOn(api, "getQuiz").mockResolvedValue(options.quiz ?? quiz);
  vi.spyOn(api, "getPlan").mockResolvedValue(options.plan ?? plan);
  vi.spyOn(api, "getLlmRuntime").mockResolvedValue({
    source: "MOCK",
    provider: null,
    models: { topic_analysis: "mock", session_plan: "mock", session_content: "mock" },
    fallback_reason: null,
  });
  vi.spyOn(adaptiveLearningApi, "getLearningMode").mockResolvedValue({
    content_version: options.contentVersion ?? 1,
  });
  const getLesson = vi.spyOn(adaptiveLearningApi, "getLearningV2");
  if (options.lessonError) getLesson.mockRejectedValue(options.lessonError);
  else getLesson.mockResolvedValue(options.lesson ?? adaptiveLesson);
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
  it("renders v2 profile, objective, safe lesson blocks and accessible stimuli", async () => {
    const getQuiz = vi.spyOn(api, "getQuiz");
    renderSession({ contentVersion: 2, lesson: adaptiveLesson });

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));

    expect(await screen.findByText("Perfil efectivo: Sistémico-Empírico")).toBeInTheDocument();
    expect(screen.getAllByText("Interpretar datos de germinación").length).toBeGreaterThan(1);
    expect(screen.getByRole("region", { name: "Objetivos de aprendizaje" }).textContent).toContain("Bloom: Analizar");
    expect(
      screen.getAllByText("Fragmento del material de estudio; sin procedencia trazable"),
    ).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Datos de Germinación por día" })).toBeInTheDocument();
    expect(screen.getByText("Alternativa textual")).toBeInTheDocument();
    expect(screen.getByText("Ejemplo generado; no es evidencia del material fuente.")).toBeInTheDocument();
    expect(screen.getByText("Una estudiante compara dos bandejas de semillas.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Fuente externa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it("keeps every graph observation when x values repeat within or across series", async () => {
    const graph = adaptiveLesson.stimuli?.find((stimulus): stimulus is GraphStimulus => stimulus.kind === "graph");
    if (!graph) throw new Error("Test fixture must include a graph stimulus");
    const repeatedXLesson: LearningResponseV2 = {
      ...adaptiveLesson,
      lesson_blocks: [adaptiveLesson.lesson_blocks[0]],
      stimuli: [
        {
          ...graph,
          series: [
            { name: "Lote A", points: [{ x: 1, y: 2 }, { x: 1, y: 3 }] },
            { name: "Lote B", points: [{ x: 1, y: 4 }] },
          ],
        },
      ],
    };
    renderSession({ contentVersion: 2, lesson: repeatedXLesson });

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));
    const table = await screen.findByRole("table", { name: "Datos de Germinación por día" });

    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Lote A",
      "2",
      "Lote A",
      "3",
      "Lote B",
      "4",
    ]);
  });

  it.each([
    { label: "missing stimulus ID", sourceRefs: ["synthetic-source-1"], sourceId: null },
    { label: "present synthetic IDs", sourceRefs: ["synthetic-source-1"], sourceId: "synthetic-source-1" },
  ])("labels block and stimulus provenance when $label are not traceable", async ({ sourceRefs, sourceId }) => {
    const graph = adaptiveLesson.stimuli?.find((stimulus): stimulus is GraphStimulus => stimulus.kind === "graph");
    if (!graph) throw new Error("Test fixture must include a graph stimulus");
    const untraceableLesson: LearningResponseV2 = {
      ...adaptiveLesson,
      lesson_blocks: [{ ...adaptiveLesson.lesson_blocks[0], source_refs: sourceRefs }],
      stimuli: [{ ...graph, source_id: sourceId }],
    };
    renderSession({ contentVersion: 2, lesson: untraceableLesson });

    fireEvent.click(await screen.findByRole("button", { name: "Empezar" }));

    expect(
      screen.getAllByText("Fragmento del material de estudio; sin procedencia trazable"),
    ).toHaveLength(2);
    expect(screen.queryByText("synthetic-source-1")).not.toBeInTheDocument();
  });

  it("keeps reinforcement controls for a pending adaptive review without exposing review points", async () => {
    const adaptiveReview: SessionDetailDTO = {
      ...session,
      kind: "REVIEW",
      status: "PENDING",
      reinforcement_status: "NONE",
      review_points: [],
    };
    renderSession({ contentVersion: 2, session: adaptiveReview, lesson: adaptiveLesson });

    expect(await screen.findByRole("heading", { name: "Refuerza con IA" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Puntos a reforzar" })).not.toBeInTheDocument();
  });

  it.each([
    ["/session/5?fase=test", "Evaluación adaptativa"],
    ["/session/5?fase=resultado", "Resultados adaptativos"],
  ])("does not mount legacy quiz or result routes for v2 deep link %s", async (path, heading) => {
    const getQuiz = vi.spyOn(api, "getQuiz");
    const getResult = vi.spyOn(api, "getSessionResult");
    renderSession({ contentVersion: 2, lesson: adaptiveLesson, path });

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(getQuiz).not.toHaveBeenCalled();
    expect(getResult).not.toHaveBeenCalled();
  });

  it("shows CONTENT_NOT_READY instead of falling back to legacy material", async () => {
    const notReady = Object.assign(new Error("Contenido pendiente"), {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          code: "CONTENT_NOT_READY",
          detail: "El contenido de la sesión todavía no está disponible.",
        },
      },
    });
    const getQuiz = vi.spyOn(api, "getQuiz");
    renderSession({ contentVersion: 2, lessonError: notReady });

    expect(await screen.findByText("El contenido de la sesión todavía no está disponible.")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Crear un plan nuevo" })).toHaveAttribute("href", "/plan");
    expect(screen.getByText(/Este plan ya figura listo/)).toBeInTheDocument();
    expect(screen.queryByText("_Sin material._")).not.toBeInTheDocument();
    expect(getQuiz).not.toHaveBeenCalled();
  });

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

    const summary = await screen.findByRole("region", { name: "Resultado" });
    // Focus moves to the confirmed result so keyboard and screen-reader users hear it.
    expect(screen.getByRole("heading", { name: "Resultado" })).toHaveFocus();
    expect(within(summary).getByText("100%")).toBeInTheDocument();
    expect(within(summary).getByText("1 de 1 correctas")).toBeInTheDocument();
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
    expect(screen.queryByRole("region", { name: "Resultado" })).not.toBeInTheDocument();
    // The pick stays marked; once corrected its name adds the verdict.
    expect(screen.getByRole("button", { name: /^O\(n\)/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(await screen.findByRole("region", { name: "Resultado" })).toBeInTheDocument();
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

    const summary = await screen.findByRole("region", { name: "Resultado" });
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
    expect(await screen.findByRole("region", { name: "Resultado" })).toBeInTheDocument();
    expect(submitQuiz).toHaveBeenCalledTimes(1);
  });

  describe("result screen", () => {
    const topic = makeTopic({
      id: 1,
      name: "Algoritmos",
      relevance: 0.9,
      selected: true,
      mastery: 0.8,
      review_box: 1,
      mastery_state: "EN_PROGRESO",
    });
    const topicSession = makeSessionDetail({ ...session, topic_id: 1 });
    const review = (id: number, date: string) =>
      makeSessionSummary({ id, order_index: id, topic_name: "Algoritmos", kind: "REVIEW", topic_id: 1, scheduled_date: date });

    async function finishQuiz(options: Parameters<typeof renderSession>[0]) {
      vi.spyOn(api, "submitQuiz").mockResolvedValue(result);
      renderSession({ ...options, quiz: { ...quiz, questions: quiz.questions.slice(2) } });
      await goToQuiz();
      fireEvent.click(await screen.findByRole("button", { name: "O(log n)" }));
      fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
      return screen.findByRole("region", { name: "Resultado" });
    }

    it("result shows mastery, state badge and next review", async () => {
      const summary = await finishQuiz({
        session: topicSession,
        plan: { ...plan, topics: [topic], sessions: [review(6, "2099-01-01")] },
      });

      expect(await within(summary).findByText("Dominio 80 %")).toBeInTheDocument();
      expect(within(summary).getByText("En progreso")).toBeInTheDocument();
      expect(within(summary).getByText(/Próximo repaso: 1 ene/)).toBeInTheDocument();
    });

    it("next session button only when available", async () => {
      const summary = await finishQuiz({
        session: topicSession,
        plan: { ...plan, topics: [topic], sessions: [review(6, "2099-01-01")] },
      });
      await within(summary).findByText("Dominio 80 %");
      expect(within(summary).queryByRole("link", { name: "Siguiente sesión" })).not.toBeInTheDocument();
      expect(within(summary).getByRole("link", { name: "Ver plan" })).toHaveAttribute("href", "/plan/9");
    });

    it("offers the next session when a review is due", async () => {
      const summary = await finishQuiz({
        session: topicSession,
        plan: { ...plan, topics: [topic], sessions: [review(6, "2000-01-01")] },
      });

      expect(await within(summary).findByRole("link", { name: "Siguiente sesión" })).toHaveAttribute(
        "href",
        "/session/6",
      );
    });

    it("video chips use youtube search urls", async () => {
      const summary = await finishQuiz({ session: topicSession });

      const videoLinks = within(summary).getAllByRole("link", { name: /big o/i });
      expect(videoLinks).toHaveLength(1);
      expect(videoLinks[0].getAttribute("href")).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    });

    it("no removed helper copy", async () => {
      const summary = await finishQuiz({ session: topicSession });

      for (const text of [
        "Resultado del test",
        "se programaron para repasar",
        "Las tarjetas no puntúan",
        "El resultado quedó guardado",
        "Ver estadísticas",
      ]) {
        expect(within(summary).queryByText(new RegExp(text))).not.toBeInTheDocument();
        expect(within(summary).queryByRole("link", { name: text })).not.toBeInTheDocument();
      }
    });
  });

  describe("immediate correction, resume and stats", () => {
    const mcQuiz: QuizDTO = { ...quiz, questions: [quiz.questions[2]] };

    it("paints a wrong pick red, reveals the right option in green and locks the question", async () => {
      renderSession({ quiz: mcQuiz, path: "/session/5?fase=test" });

      fireEvent.click(await screen.findByRole("button", { name: "O(n)" }));

      const options = screen.getByRole("group", { name: "Opciones" });
      const wrong = within(options).getByRole("button", { name: /O\(n\).*Tu respuesta, incorrecta/ });
      const right = within(options).getByRole("button", { name: /O\(log n\).*Respuesta correcta/ });
      expect(wrong.className).toContain("border-state-error");
      expect(right.className).toContain("border-state-correct");
      expect(screen.getByText("Incorrecto. La respuesta correcta está en verde.")).toBeInTheDocument();

      // Locked: picking the right one now changes nothing.
      fireEvent.click(right);
      expect(wrong).toHaveAttribute("aria-pressed", "true");
      expect(right).toHaveAttribute("aria-pressed", "false");
    });

    it("paints a right pick green", async () => {
      renderSession({ quiz: mcQuiz, path: "/session/5?fase=test" });

      fireEvent.click(await screen.findByRole("button", { name: "O(log n)" }));

      const right = screen.getByRole("button", { name: /O\(log n\).*Respuesta correcta/ });
      expect(right.className).toContain("border-state-correct");
      expect(right).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("¡Correcto!")).toBeInTheDocument();
    });

    it("saves each answer and resumes at the first unanswered question, clearing it on submit", async () => {
      vi.spyOn(api, "submitQuiz").mockResolvedValue(result);
      renderSession({ path: "/session/5?fase=test" });
      await answerFlashcard("¿Qué mide Big O?", 0);

      const saved = JSON.parse(window.localStorage.getItem("studyai.quizDraft.5") ?? "null");
      expect(saved).toEqual({ quizId: 77, answers: { 1: { question_id: 1, quality: 0 } }, order: null });
      cleanup();

      renderSession({ path: "/session/5?fase=test" });
      expect(await screen.findByText("Pregunta 2 de 3")).toBeInTheDocument();
      await answerFlashcard("¿Qué es una pila?", 4);
      fireEvent.click(screen.getByRole("button", { name: "O(log n)" }));
      fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

      expect(await screen.findByRole("region", { name: "Resultado" })).toBeInTheDocument();
      expect(api.submitQuiz).toHaveBeenLastCalledWith(77, [
        { question_id: 1, quality: 0 },
        { question_id: 2, quality: 4 },
        { question_id: 3, selected_option: "O(log n)" },
      ]);
      expect(window.localStorage.getItem("studyai.quizDraft.5")).toBeNull();
    });

    it("shows the last result and every answer with ?fase=resultado", async () => {
      vi.spyOn(api, "getSessionResult").mockResolvedValue({
        ...result,
        score: 0,
        correct: 0,
        detail: { ...result.detail, "3": { type: "multiple_choice", correct: false, selected: "O(n)", expected: "O(log n)" } },
      });
      renderSession({ session: { ...session, status: "COMPLETED" }, path: "/session/5?fase=resultado" });

      const summary = await screen.findByRole("region", { name: "Resultado" });
      expect(within(summary).getByText("0 de 1 correctas")).toBeInTheDocument();
      const review = await screen.findByRole("region", { name: "Tus respuestas" });
      expect(within(review).getByText("Incorrecta")).toBeInTheDocument();
      expect(within(review).getByRole("button", { name: /O\(n\).*Tu respuesta, incorrecta/ })).toBeInTheDocument();
      expect(within(review).getByText(/Tu valoración: 4/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Empezar sesión de nuevo" }));
      expect(await screen.findByRole("button", { name: "Empezar" })).toBeInTheDocument();
    });

    it("explains a session with no result yet", async () => {
      vi.spyOn(api, "getSessionResult").mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } });
      renderSession({ path: "/session/5?fase=resultado" });

      expect(await screen.findByText("Esta sesión aún no tiene resultado")).toBeInTheDocument();
    });

    it("does not ask again for a new attempt confirmed in the plan panel", async () => {
      renderSession({
        session: { ...session, status: "COMPLETED", completed_at: "2026-10-10T10:00:00" },
        path: "/session/5?reintento=1",
      });
      await goToQuiz();

      expect(screen.queryByRole("button", { name: "Registrar un nuevo intento" })).not.toBeInTheDocument();
      expect(await screen.findByText("¿Qué mide Big O?")).toBeInTheDocument();
    });
  });
});
