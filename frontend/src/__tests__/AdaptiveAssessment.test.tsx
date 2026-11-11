import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { adaptiveLearningApi, type AssessmentResponseV2, type AssessmentResultV2 } from "../api/adaptiveLearning";
import { AdaptiveAssessment } from "../components/session/AdaptiveAssessment";

const assessment: AssessmentResponseV2 = {
  quiz_id: 42,
  revision: "revision-1",
  questions: [
    {
      question_id: "card",
      kind: "flashcard",
      prompt: "¿Qué caracteriza a una inferencia?",
      flashcard_answer: "Se apoya en evidencia y reglas explícitas.",
      objective_ids: ["objective-1"],
      estimated_minutes_per_question: { min: 1, max: 2 },
    },
    {
      question_id: "single",
      kind: "multiple_choice",
      mode: "single",
      prompt: "¿Cuál opción es válida?",
      options: ["Primera", "Segunda"],
      objective_ids: ["objective-1"],
      estimated_minutes_per_question: { min: 3, max: 5 },
      stimulus_id: "graph-1",
    },
    {
      question_id: "multiple",
      kind: "multiple_choice",
      mode: "multiple",
      prompt: "Elige todas las evidencias.",
      options: ["A", "B", "C"],
      objective_ids: ["objective-1"],
    },
    {
      question_id: "boolean",
      kind: "true_false",
      prompt: "La conclusión debe apoyarse en datos.",
      objective_ids: ["objective-1"],
    },
    {
      question_id: "matching",
      kind: "matching",
      prompt: "Relaciona el concepto con su definición.",
      matching_left: [{ id: "l1", text: "Concepto A" }, { id: "l2", text: "Concepto B" }],
      matching_right: [{ id: "r1", text: "Definición A" }, { id: "r2", text: "Definición B" }],
      objective_ids: ["objective-1"],
    },
    {
      question_id: "numeric",
      kind: "numeric",
      prompt: "Escribe el valor exacto.",
      units: "unidades",
      objective_ids: ["objective-1"],
    },
    {
      question_id: "sequence",
      kind: "sequence",
      prompt: "Ordena los pasos.",
      sequence_items: [{ id: "s1", text: "Paso inicial" }, { id: "s2", text: "Paso final" }],
      objective_ids: ["objective-1"],
    },
    {
      question_id: "rubric",
      kind: "rubric",
      prompt: "Explica la relación con claridad.",
      rubric_criteria: [
        { criterion_id: "clarity", description: "Claridad", descriptors: ["Confusa", "Parcial", "Clara"] },
      ],
      objective_ids: ["objective-1"],
    },
    {
      question_id: "short",
      kind: "short_answer",
      grading_mode: "exact",
      prompt: "Escribe una respuesta breve.",
      objective_ids: ["objective-1"],
    },
    {
      question_id: "essay",
      kind: "essay",
      prompt: "Argumenta tu conclusión.",
      objective_ids: ["objective-1"],
    },
    {
      question_id: "step",
      kind: "step_by_step",
      grading_mode: "numeric",
      prompt: "Resuelve y explica el procedimiento.",
      objective_ids: ["objective-1"],
    },
  ],
  stimuli: [
    {
      id: "graph-1",
      kind: "graph",
      title: "Observaciones del experimento",
      objective_ids: ["objective-1"],
      origin: "derived",
      series: [{ name: "Muestra A", points: [{ x: 1, y: 4 }] }],
      x_label: "Ensayo",
      y_label: "Medición",
      text_alternative: "La medición del ensayo uno es cuatro.",
    },
  ],
};

const result: AssessmentResultV2 = {
  quiz_id: 42,
  revision: "revision-1",
  score: 50,
  correct: 2,
  total: 4,
  detail: [
    {
      question_id: "card",
      kind: "flashcard",
      quality: 4,
      feedback: "",
      grounded_feedback: [],
    },
    {
      question_id: "single",
      kind: "multiple_choice",
      correct: true,
      submitted_answer: "Segunda",
      expected_answer: "Segunda",
      feedback: "Compara la definición con la evidencia.",
      grounded_feedback: [{ mode: "formula", text: "La inferencia aplica una regla a los datos.", source_id: "fragment-1" }],
    },
    {
      question_id: "step",
      kind: "step_by_step",
      correct: true,
      submitted_answer: "2/3",
      expected_answer: "2/3",
      feedback: "La respuesta final es correcta.",
      grounded_feedback: [{ mode: "formula", text: "Explica cada transformación.", source_id: "fragment-2" }],
    },
  ],
  formative_feedback: [
    {
      question_id: "essay",
      message: "Tu argumento identifica una relación; explica también sus límites.",
      submitted_text: "Mi argumento se apoya en el patrón observado.\n<strong>Texto literal</strong>",
      exemplar: "Respuesta modelo privada, visible después de entregar.",
      criteria: [{ criterion_id: "reasoning", description: "Razonamiento", descriptors: ["Incompleto", "Adecuado"] }],
      criterion_ratings: {},
      grounded_feedback: [],
    },
    {
      question_id: "step",
      message: "Agrega tus pasos para valorar el procedimiento.",
      submitted_text: "",
      submitted_final_answer: "2/3",
      criteria: [{ criterion_id: "procedure", description: "Procedimiento", descriptors: ["Inicial", "Parcial", "Completo"] }],
      procedure_rubric_weights: { result: 0.4, procedure: 0.6 },
      grounded_feedback: [{ mode: "formula", text: "Explica cada transformación.", source_id: "fragment-2" }],
    },
  ],
  objective_results: [{ objective_id: "objective-1", correct: 1, total: 2 }],
};

const objective = {
  id: "objective-1",
  skill: "Argumentar con evidencia",
  description: "Relaciona la conclusión con los datos.",
  bloom_target: "evaluate" as const,
};

function renderAssessment(
  options: {
    currentAssessment?: AssessmentResponseV2;
    submissionResult?: AssessmentResultV2;
    onSubmit?: (input: unknown) => Promise<AssessmentResultV2>;
    onReload?: () => Promise<AssessmentResponseV2>;
    onAlreadySubmitted?: () => Promise<AssessmentResultV2>;
  } = {},
) {
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(options.submissionResult ?? result);
  const onReload = options.onReload ?? vi.fn().mockResolvedValue(assessment);
  const view = render(
    <AdaptiveAssessment
      assessment={options.currentAssessment ?? assessment}
      objectives={[objective]}
      onSubmit={onSubmit}
      onReload={onReload}
      onAlreadySubmitted={options.onAlreadySubmitted}
    />,
  );
  return { ...view, onSubmit, onReload };
}

function currentQuestion(position: number, total = assessment.questions.length) {
  return screen.getByRole("region", { name: `Pregunta ${position} de ${total}` });
}

function goNext(position: number) {
  fireEvent.click(within(currentQuestion(position)).getByRole("button", { name: "Siguiente pregunta" }));
}

afterEach(() => vi.restoreAllMocks());

describe("adaptive assessment API", () => {
  it("uses typed assessment, submit, and persisted result routes", async () => {
    const get = vi.spyOn(apiClient, "get");
    const post = vi.spyOn(apiClient, "post");
    get.mockResolvedValueOnce({ data: assessment } as never);
    post.mockResolvedValueOnce({ data: result } as never);
    get.mockResolvedValueOnce({ data: result } as never);

    await expect(adaptiveLearningApi.getAssessmentV2(5)).resolves.toEqual(assessment);
    await expect(adaptiveLearningApi.submitAssessmentV2(42, { revision: "revision-1", answers: [] })).resolves.toEqual(result);
    await expect(adaptiveLearningApi.getAssessmentResultV2(5)).resolves.toEqual(result);

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/quizzes/5/assessment-v2",
      "/quizzes/5/assessment-v2/result",
    ]);
    expect(post).toHaveBeenCalledWith("/quizzes/42/assessment-v2/submit", {
      revision: "revision-1",
      answers: [],
    });
  });
});

describe("AdaptiveAssessment", () => {
  it("renders all formats and sends one complete typed answer per question", async () => {
    const { onSubmit } = renderAssessment();

    expect(currentQuestion(1)).toHaveTextContent("¿Qué caracteriza a una inferencia?");
    expect(currentQuestion(1)).toHaveTextContent("Tiempo estimado: 1–2 min");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText("Se apoya en evidencia y reglas explícitas.")).not.toBeInTheDocument();
    fireEvent.click(within(currentQuestion(1)).getByRole("button", { name: "Mostrar respuesta" }));
    expect(within(currentQuestion(1)).getByText("Se apoya en evidencia y reglas explícitas.")).toBeInTheDocument();
    fireEvent.click(within(currentQuestion(1)).getByRole("radio", { name: /Calidad 4/ }));
    goNext(1);

    const single = currentQuestion(2);
    expect(within(single).getByRole("table", { name: "Datos de Observaciones del experimento" })).toBeInTheDocument();
    fireEvent.click(within(single).getByRole("radio", { name: "Segunda" }));
    goNext(2);

    const multiple = currentQuestion(3);
    fireEvent.click(within(multiple).getByRole("checkbox", { name: "A" }));
    fireEvent.click(within(multiple).getByRole("checkbox", { name: "C" }));
    goNext(3);

    fireEvent.click(within(currentQuestion(4)).getByRole("radio", { name: "Verdadero" }));
    goNext(4);

    const matching = currentQuestion(5);
    fireEvent.change(within(matching).getByLabelText("Relación para Concepto A"), { target: { value: "r2" } });
    fireEvent.change(within(matching).getByLabelText("Relación para Concepto B"), { target: { value: "r1" } });
    goNext(5);

    fireEvent.change(within(currentQuestion(6)).getByLabelText("Respuesta numérica"), { target: { value: "3/4" } });
    goNext(6);

    const sequence = currentQuestion(7);
    fireEvent.click(within(sequence).getByRole("button", { name: "Mover Paso final arriba" }));
    fireEvent.click(within(sequence).getByRole("button", { name: "Confirmar orden" }));
    goNext(7);

    const rubric = currentQuestion(8);
    fireEvent.change(within(rubric).getByLabelText("Tu respuesta"), { target: { value: "La relación es directa." } });
    fireEvent.click(within(rubric).getByRole("radio", { name: "Nivel 2: Clara" }));
    goNext(8);

    fireEvent.change(within(currentQuestion(9)).getByLabelText("Tu respuesta"), { target: { value: "Respuesta breve" } });
    goNext(9);

    const essay = currentQuestion(10);
    fireEvent.change(within(essay).getByLabelText("Tu respuesta"), { target: { value: "Mi argumento" } });
    goNext(10);

    const step = currentQuestion(11);
    fireEvent.change(within(step).getByLabelText("Pasos de resolución"), { target: { value: " Descompongo el problema. \n" } });
    fireEvent.change(within(step).getByLabelText("Respuesta final"), { target: { value: "2/3 " } });
    fireEvent.click(within(step).getByRole("button", { name: "Enviar evaluación" }));

    expect(await screen.findByRole("heading", { name: "Resultados de evaluación" })).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({
      revision: "revision-1",
      answers: [
        { kind: "flashcard", question_id: "card", quality: 4 },
        { kind: "multiple_choice", question_id: "single", selected_option: "Segunda" },
        { kind: "multiple_choice", question_id: "multiple", selected_options: ["A", "C"] },
        { kind: "true_false", question_id: "boolean", answer: true },
        { kind: "matching", question_id: "matching", pairs: [{ left_id: "l1", right_id: "r2" }, { left_id: "l2", right_id: "r1" }] },
        { kind: "numeric", question_id: "numeric", value: "3/4" },
        { kind: "sequence", question_id: "sequence", ordered_ids: ["s2", "s1"] },
        { kind: "rubric", question_id: "rubric", text: "La relación es directa.", criterion_ratings: { clarity: 2 } },
        { kind: "short_answer", question_id: "short", text: "Respuesta breve" },
        { kind: "essay", question_id: "essay", text: "Mi argumento" },
        { kind: "step_by_step", question_id: "step", steps: " Descompongo el problema. \n", final_answer: "2/3 " },
      ],
    });
    expect(screen.getByText(/<strong>Texto literal<\/strong>/)).toHaveTextContent(
      "Mi argumento se apoya en el patrón observado. <strong>Texto literal</strong>",
    );
    expect(screen.getAllByText("Explica cada transformación.")).toHaveLength(1);
    expect(screen.getByText("Autoevaluación de memoria: 4 de 5")).toBeInTheDocument();
    expect(screen.queryByText("Sin respuesta registrada.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Revisión guardada:/)).not.toBeInTheDocument();
  });

  it("offers visit-only reflection beside the saved result and disables procedure maxima when no steps were submitted", async () => {
    const stepAssessment: AssessmentResponseV2 = { ...assessment, questions: [assessment.questions[10]] };
    const procedureResult: AssessmentResultV2 = {
      ...result,
      detail: [{
        question_id: "step",
        kind: "step_by_step",
        correct: true,
        submitted_answer: "2/3",
        expected_answer: "2/3",
        feedback: "La respuesta final es correcta.",
        grounded_feedback: [{ mode: "formula", text: "Explica cada transformación.", source_id: "fragment-2" }],
      }],
      formative_feedback: [result.formative_feedback[1]],
    };
    const { onSubmit } = renderAssessment({ currentAssessment: stepAssessment, submissionResult: procedureResult });
    const question = currentQuestion(1, 1);

    fireEvent.change(within(question).getByLabelText("Respuesta final"), { target: { value: "2/3" } });
    expect(within(question).queryByRole("button", { name: "Añadir reflexión formativa" })).not.toBeInTheDocument();
    fireEvent.click(within(question).getByRole("button", { name: "Enviar evaluación" }));
    expect(await screen.findByRole("heading", { name: "Resultados de evaluación" })).toBeInTheDocument();
    expect(screen.getAllByText("Explica cada transformación.")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Añadir reflexión formativa" }));
    const procedureGroup = screen.getByRole("group", { name: "Procedimiento" });
    expect(within(procedureGroup).getByRole("radio", { name: /Nivel 2/ })).toBeDisabled();
    expect(screen.getByText(/resultado 40 %.*procedimiento 60 %/i)).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "Resultado" })).getByRole("radio", { name: /^Nivel 1/ }));
    fireEvent.click(within(procedureGroup).getByRole("radio", { name: /^Nivel 1/ }));
    expect(screen.getByText(/autoevaluación ponderada/i)).toBeInTheDocument();

    expect(onSubmit).toHaveBeenCalledWith({
      revision: "revision-1",
      answers: [{ kind: "step_by_step", question_id: "step", steps: "", final_answer: "2/3" }],
    });
  });

  it("requires an explicit reload after QUIZ_OUTDATED and clears drafts only when revision changes", async () => {
    const error = Object.assign(new Error("La revisión cambió."), {
      isAxiosError: true,
      response: { data: { code: "QUIZ_OUTDATED", detail: "La evaluación cambió; recarga para continuar." } },
    });
    const singleQuestion: AssessmentResponseV2 = { ...assessment, questions: [assessment.questions[1]] };
    const nextRevision: AssessmentResponseV2 = { ...singleQuestion, revision: "revision-2" };
    const onSubmit = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(result);
    const onReload = vi.fn().mockResolvedValue(nextRevision);
    renderAssessment({ currentAssessment: singleQuestion, onSubmit, onReload });
    const question = currentQuestion(1, 1);
    fireEvent.click(within(question).getByRole("radio", { name: "Segunda" }));
    fireEvent.click(within(question).getByRole("button", { name: "Enviar evaluación" }));

    expect(await screen.findByText("La evaluación cambió; recarga para continuar.")).toBeInTheDocument();
    expect(onReload).not.toHaveBeenCalled();
    expect(within(currentQuestion(1, 1)).getByRole("radio", { name: "Segunda" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Recargar evaluación" }));

    await waitFor(() => expect(within(currentQuestion(1, 1)).getByRole("radio", { name: "Segunda" })).not.toBeChecked());
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("loads the persisted result after ASSESSMENT_ALREADY_SUBMITTED", async () => {
    const error = Object.assign(new Error("Ya entregada."), {
      isAxiosError: true,
      response: { data: { code: "ASSESSMENT_ALREADY_SUBMITTED", detail: "Ya existe una entrega." } },
    });
    const singleQuestion: AssessmentResponseV2 = { ...assessment, questions: [assessment.questions[1]] };
    const onAlreadySubmitted = vi.fn().mockResolvedValue(result);
    const onSubmit = vi.fn().mockRejectedValue(error);
    renderAssessment({ currentAssessment: singleQuestion, onSubmit, onAlreadySubmitted });
    const question = currentQuestion(1, 1);
    fireEvent.click(within(question).getByRole("radio", { name: "Segunda" }));
    fireEvent.click(within(question).getByRole("button", { name: "Enviar evaluación" }));

    expect(await screen.findByRole("heading", { name: "Resultados de evaluación" })).toBeInTheDocument();
    expect(onAlreadySubmitted).toHaveBeenCalledOnce();
  });

  it("shows solution and grounded/formative feedback only after submission", async () => {
    const oneQuestion: AssessmentResponseV2 = { ...assessment, questions: [assessment.questions[1]] };
    renderAssessment({ currentAssessment: oneQuestion });
    const question = currentQuestion(1, 1);
    expect(screen.queryByText("Respuesta modelo privada, visible después de entregar.")).not.toBeInTheDocument();
    fireEvent.click(within(question).getByRole("radio", { name: "Segunda" }));
    fireEvent.click(within(question).getByRole("button", { name: "Enviar evaluación" }));

    expect(await screen.findByText("Nota objetiva")).toBeInTheDocument();
    expect(screen.getByText("Argumentar con evidencia")).toBeInTheDocument();
    expect(screen.getByText("Respuesta modelo privada, visible después de entregar.")).toBeInTheDocument();
    expect(screen.getByText("La inferencia aplica una regla a los datos.")).toBeInTheDocument();
  });

  it("keeps an open draft stale until the learner explicitly reloads a newer query revision", async () => {
    const singleQuestion: AssessmentResponseV2 = { ...assessment, questions: [assessment.questions[1]] };
    const nextRevision: AssessmentResponseV2 = { ...singleQuestion, revision: "revision-2" };
    const { rerender, onReload } = renderAssessment({ currentAssessment: singleQuestion, onReload: vi.fn().mockResolvedValue(nextRevision) });
    const question = currentQuestion(1, 1);
    fireEvent.click(within(question).getByRole("radio", { name: "Segunda" }));

    rerender(
      <AdaptiveAssessment
        assessment={nextRevision}
        objectives={[objective]}
        onSubmit={vi.fn().mockResolvedValue(result)}
        onReload={onReload}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("La evaluación publicada cambió");
    expect(within(currentQuestion(1, 1)).getByRole("radio", { name: "Segunda" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Recargar evaluación" }));

    await waitFor(() => expect(within(currentQuestion(1, 1)).getByRole("radio", { name: "Segunda" })).not.toBeChecked());
    expect(onReload).toHaveBeenCalledOnce();
  });
});
