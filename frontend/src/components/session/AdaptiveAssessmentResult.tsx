import { useEffect, useRef, useState } from "react";

import type {
  AssessmentMatchingPair,
  AssessmentQuestionV2,
  AssessmentResponseV2,
  AssessmentResultItemV2,
  AssessmentResultV2,
  FormativeFeedbackV2,
  LearningObjective,
} from "../../api/adaptiveLearning";
import { Badge, Button, Card } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

const REFLECTION_LEVELS = ["Aún no", "En parte", "Sí, lo logré"];

function answerLabel(
  answer: AssessmentResultItemV2["submitted_answer"] | AssessmentResultItemV2["expected_answer"],
  question?: AssessmentQuestionV2,
): string {
  if (answer === null || answer === undefined) return "Sin respuesta registrada.";
  if (typeof answer === "boolean") return answer ? "Verdadero" : "Falso";
  if (typeof answer === "string") return answer;
  if (Array.isArray(answer) && answer.length > 0 && typeof answer[0] === "object") {
    const pairs = answer as AssessmentMatchingPair[];
    if (question?.kind === "matching") {
      const left = new Map(question.matching_left.map((item) => [item.id, item.text]));
      const right = new Map(question.matching_right.map((item) => [item.id, item.text]));
      return pairs.map((pair) => `${left.get(pair.left_id) ?? "Elemento"} → ${right.get(pair.right_id) ?? "Elemento"}`).join("; ");
    }
  }
  if (Array.isArray(answer) && question?.kind === "sequence") {
    const labelById = new Map(question.sequence_items.map((item) => [item.id, item.text]));
    return answer.map((id) => labelById.get(String(id)) ?? String(id)).join(" → ");
  }
  return Array.isArray(answer) ? answer.join(", ") : String(answer);
}

function questionById(assessment: AssessmentResponseV2, questionId: string) {
  return assessment.questions.find((question) => question.question_id === questionId);
}

function objectiveById(objectives: LearningObjective[], objectiveId: string) {
  return objectives.find((objective) => objective.id === objectiveId);
}

function supportsVisitReflection(question: AssessmentQuestionV2 | undefined): question is Extract<
  AssessmentQuestionV2,
  { kind: "essay" | "step_by_step" | "short_answer" }
> {
  return question?.kind === "essay" || question?.kind === "step_by_step" ||
    (question?.kind === "short_answer" && question.grading_mode === "formative");
}

function VisitReflection({
  question,
  feedback,
}: {
  question: AssessmentQuestionV2;
  feedback: FormativeFeedbackV2;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const weights = feedback.procedure_rubric_weights;
  const hasWeightedProcedureReflection = question.kind === "step_by_step" && weights !== null && weights !== undefined;
  const criteria = hasWeightedProcedureReflection
    ? [
        { criterion_id: "result", description: "Resultado", descriptors: [] as string[] },
        { criterion_id: "procedure", description: "Procedimiento", descriptors: [] as string[] },
      ]
    : feedback.criteria?.length
      ? feedback.criteria
      : [{ criterion_id: "confidence", description: "Confianza en tu respuesta", descriptors: [] }];
  const submittedStepsAreBlank = question.kind === "step_by_step" && !feedback.submitted_text?.trim();
  const weightedRating = hasWeightedProcedureReflection && weights &&
    ratings.result !== undefined && ratings.procedure !== undefined
    ? Math.round((ratings.result * weights.result + ratings.procedure * weights.procedure) * 10) / 10
    : null;

  return (
    <div className="space-y-3 border-t border-line pt-3">
      {!isOpen ? (
        <Button type="button" variant="secondary" onClick={() => setIsOpen(true)}>
          Añadir reflexión formativa
        </Button>
      ) : (
        <fieldset className="space-y-3 rounded-control border border-line p-4">
          <legend className="px-1 font-medium text-text-primary">Reflexión formativa</legend>
          <p className="text-sm text-text-muted">Esta reflexión es local a esta visita y no cambia la nota objetiva.</p>
          {criteria.map((criterion) => {
            const groupId = `reflection-${question.question_id}-${criterion.criterion_id}`;
            const procedureNeedsSteps = question.kind === "step_by_step" &&
              criterion.criterion_id !== "result" && submittedStepsAreBlank;
            return (
              <fieldset
                key={criterion.criterion_id}
                className="rounded-control border border-line p-3"
                aria-describedby={procedureNeedsSteps ? `${groupId}-hint` : undefined}
              >
                <legend className="px-1 font-medium text-text-primary">{criterion.description}</legend>
                <div className="flex flex-wrap gap-3">
                  {REFLECTION_LEVELS.map((label, level) => (
                    <label key={level} className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-text-primary">
                      <input
                        type="radio"
                        name={groupId}
                        value={level}
                        checked={ratings[criterion.criterion_id] === level}
                        disabled={procedureNeedsSteps && level === 2}
                        onChange={() => setRatings((current) => ({ ...current, [criterion.criterion_id]: level }))}
                      />
                      Nivel {level}: {criterion.descriptors[level] ?? criterion.descriptors[criterion.descriptors.length - 1] ?? label}
                    </label>
                  ))}
                </div>
                {procedureNeedsSteps && (
                  <p id={`${groupId}-hint`} className="mt-2 text-sm text-text-muted">
                    Escribe tus pasos antes de elegir el nivel más alto de procedimiento.
                  </p>
                )}
              </fieldset>
            );
          })}
          {weightedRating !== null && (
            <p role="status" className="text-sm font-medium text-text-primary">
              Autoevaluación ponderada: {weightedRating} de 2. Esta guía formativa no modifica la nota objetiva.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

export function AdaptiveAssessmentResult({
  assessment,
  result,
  objectives,
}: {
  assessment: AssessmentResponseV2;
  result: AssessmentResultV2;
  objectives: LearningObjective[];
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formativeQuestionIdsWithGroundedFeedback = new Set(
    result.formative_feedback
      .filter((feedback) => feedback.grounded_feedback && feedback.grounded_feedback.length > 0)
      .map((feedback) => feedback.question_id),
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="space-y-4" aria-labelledby="adaptive-results-title">
      <Card className="space-y-5" aria-labelledby="adaptive-results-title">
        <div>
          <h2
            ref={headingRef}
            id="adaptive-results-title"
            tabIndex={-1}
            className="font-display text-xl font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Resultados de evaluación
          </h2>
        </div>

        <section aria-labelledby="adaptive-objective-score-title" className="space-y-3">
          <h3 id="adaptive-objective-score-title" className="font-semibold text-text-primary">
            Nota objetiva
          </h3>
          {result.total > 0 ? (
            <p className="text-text-primary">
              {result.score} % · {result.correct} de {result.total} respuestas objetivas correctas
            </p>
          ) : (
            <p className="text-text-muted">Esta evaluación no incluyó preguntas con corrección objetiva.</p>
          )}
          {result.objective_results.length > 0 && (
            <ul className="space-y-2">
              {result.objective_results.map((item) => {
                const objective = objectiveById(objectives, item.objective_id);
                return (
                  <li key={item.objective_id} className="rounded-control border border-line p-3">
                    <h4 className="font-medium text-text-primary">{objective?.skill ?? item.objective_id}</h4>
                    <p className="text-sm text-text-muted">
                      {item.correct} de {item.total} respuestas correctas
                    </p>
                    {objective?.description && <p className="mt-1 text-sm text-text-muted">{objective.description}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="adaptive-answer-review-title" className="space-y-3">
          <h3 id="adaptive-answer-review-title" className="font-semibold text-text-primary">
            Respuestas y feedback
          </h3>
          <ol className="space-y-3">
            {result.detail.map((item) => {
              const question = questionById(assessment, item.question_id);
              const flashcardAnsweredByQuality = item.kind === "flashcard" && item.quality !== null && item.quality !== undefined;
              const duplicateGroundedFeedback = formativeQuestionIdsWithGroundedFeedback.has(item.question_id);
              return (
                <li key={item.question_id}>
                  <article className="rounded-control border border-line p-4 space-y-3">
                    <h4 className="font-medium text-text-primary">
                      {question?.prompt ?? `Pregunta ${item.question_id}`}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {item.correct !== null && item.correct !== undefined && (
                        <Badge color={item.correct ? "green" : "amber"}>
                          {item.correct ? "Correcta" : "Para revisar"}
                        </Badge>
                      )}
                      {item.quality !== null && item.quality !== undefined && (
                        <Badge color="brand">Autoevaluación de memoria: {item.quality} de 5</Badge>
                      )}
                    </div>
                    {!flashcardAnsweredByQuality && (
                      <div className="space-y-2 text-sm">
                        <p className="text-text-muted">Tu respuesta</p>
                        <div className="whitespace-pre-wrap break-words text-text-primary">
                          {answerLabel(item.submitted_answer, question)}
                        </div>
                        {item.expected_answer !== null && item.expected_answer !== undefined && (
                          <>
                            <p className="pt-2 text-text-muted">Respuesta esperada</p>
                            <div className="prose-study max-w-none text-text-primary">
                              <SafeMarkdown>{answerLabel(item.expected_answer, question)}</SafeMarkdown>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {item.feedback && (
                      <div>
                        <p className="font-medium text-text-primary">Feedback</p>
                        <div className="prose-study max-w-none text-text-muted">
                          <SafeMarkdown>{item.feedback}</SafeMarkdown>
                        </div>
                      </div>
                    )}
                    {!duplicateGroundedFeedback && item.grounded_feedback.length > 0 && (
                      <div className="space-y-2 rounded-control bg-surface-subtle p-3">
                        <p className="font-medium text-text-primary">Feedback respaldado por el material</p>
                        {item.grounded_feedback.map((feedback, index) => (
                          <div key={`${feedback.mode}:${index}`} className="prose-study max-w-none text-sm text-text-muted">
                            <SafeMarkdown>{feedback.text}</SafeMarkdown>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        </section>

        {result.formative_feedback.length > 0 && (
          <section aria-labelledby="adaptive-formative-title" className="space-y-3">
            <h3 id="adaptive-formative-title" className="font-semibold text-text-primary">
              Rúbrica y feedback formativo
            </h3>
            {result.formative_feedback.map((feedback) => {
              const question = questionById(assessment, feedback.question_id);
              const ratingById = feedback.criterion_ratings ?? {};
              return (
                <article key={feedback.question_id} className="rounded-control border border-line p-4 space-y-3">
                  <h4 className="font-medium text-text-primary">
                    {question?.prompt ?? `Pregunta ${feedback.question_id}`}
                  </h4>
                  <div className="prose-study max-w-none text-sm text-text-muted">
                    <SafeMarkdown>{feedback.message}</SafeMarkdown>
                  </div>
                  {feedback.submitted_text !== null && feedback.submitted_text !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-text-primary">Texto entregado</p>
                      <div className="whitespace-pre-wrap break-words text-sm text-text-muted">{feedback.submitted_text}</div>
                    </div>
                  )}
                  {feedback.submitted_final_answer !== null && feedback.submitted_final_answer !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-text-primary">Respuesta final entregada</p>
                      <div className="whitespace-pre-wrap break-words text-sm text-text-muted">{feedback.submitted_final_answer}</div>
                    </div>
                  )}
                  {feedback.criteria && feedback.criteria.length > 0 && (
                    <ul className="space-y-2">
                      {feedback.criteria.map((criterion) => (
                        <li key={criterion.criterion_id}>
                          <p className="text-sm font-medium text-text-primary">{criterion.description}</p>
                          <p className="text-sm text-text-muted">{criterion.descriptors.join(" · ")}</p>
                          {ratingById[criterion.criterion_id] !== undefined && (
                            <p className="text-sm text-text-muted">
                              Autovaloración entregada: {ratingById[criterion.criterion_id]} de 2
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {feedback.procedure_rubric_weights && (
                    <p className="text-sm text-text-muted">
                      Guía formativa de pesos: resultado {Math.round(feedback.procedure_rubric_weights.result * 100)} %,
                      procedimiento {Math.round(feedback.procedure_rubric_weights.procedure * 100)} %. Esta guía no modifica la nota objetiva.
                    </p>
                  )}
                  {feedback.exemplar && (
                    <div>
                      <p className="font-medium text-text-primary">Ejemplo de respuesta</p>
                      <div className="prose-study max-w-none text-sm text-text-muted">
                        <SafeMarkdown>{feedback.exemplar}</SafeMarkdown>
                      </div>
                    </div>
                  )}
                  {feedback.grounded_feedback && feedback.grounded_feedback.length > 0 && (
                    <div className="space-y-2 rounded-control bg-surface-subtle p-3">
                      <p className="font-medium text-text-primary">Feedback respaldado por el material</p>
                      {feedback.grounded_feedback.map((grounded, index) => (
                        <div key={`${grounded.mode}:${index}`} className="prose-study max-w-none text-sm text-text-muted">
                          <SafeMarkdown>{grounded.text}</SafeMarkdown>
                        </div>
                      ))}
                    </div>
                  )}
                  {supportsVisitReflection(question) && <VisitReflection question={question} feedback={feedback} />}
                </article>
              );
            })}
          </section>
        )}
      </Card>
    </section>
  );
}
