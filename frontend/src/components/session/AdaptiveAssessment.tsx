import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";

import { getApiErrorMessage } from "../../api/errors";
import type {
  AssessmentAnswerV2,
  AssessmentQuestionV2,
  AssessmentResponseV2,
  AssessmentResultV2,
  AssessmentSubmissionV2,
  LearningObjective,
  MinuteRange,
  PedagogySnapshot,
} from "../../api/adaptiveLearning";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";
import { StimulusCard } from "./LessonBlocks";
import { AdaptiveAssessmentResult } from "./AdaptiveAssessmentResult";
import { seededShuffle } from "../../lib/shuffle";

type QuestionDraft = {
  selectedOption?: string;
  selectedOptions?: string[];
  trueFalse?: boolean;
  pairs?: Record<string, string>;
  value?: string;
  orderedIds?: string[];
  sequenceConfirmed?: boolean;
  text?: string;
  criterionRatings?: Record<string, number>;
  steps?: string;
  finalAnswer?: string;
  revealed?: boolean;
  quality?: number;
};

const FLASHCARD_QUALITY = [
  "No la recordé",
  "La reconocí al verla",
  "Casi la recordé",
  "La recordé con esfuerzo",
  "La recordé con dudas",
  "La recordé perfectamente",
];
const RUBRIC_LEVELS = ["Aún no", "En parte", "Sí, lo logré"];
function questionTypeLabel(question: AssessmentQuestionV2) {
  const labels: Record<AssessmentQuestionV2["kind"], string> = {
    flashcard: "Tarjeta de memoria",
    multiple_choice: question.kind === "multiple_choice" && question.mode === "multiple" ? "Selección múltiple" : "Opción única",
    true_false: "Verdadero o falso",
    matching: "Relacionar",
    numeric: "Respuesta numérica",
    sequence: "Ordenar pasos",
    rubric: "Rúbrica",
    short_answer: "Respuesta breve",
    essay: "Ensayo",
    step_by_step: "Resolución paso a paso",
  };
  return labels[question.kind];
}

function minuteRange(question: AssessmentQuestionV2, snapshot?: PedagogySnapshot): MinuteRange | null {
  if (question.estimated_minutes_per_question) return question.estimated_minutes_per_question;
  if (!snapshot || !("estimated_minutes_per_question" in snapshot)) return null;
  const override = snapshot.question_time_overrides[question.kind];
  return override ?? snapshot.estimated_minutes_per_question;
}

function answerFor(question: AssessmentQuestionV2, draft: QuestionDraft): AssessmentAnswerV2 | null {
  switch (question.kind) {
    case "flashcard":
      return draft.revealed && draft.quality !== undefined
        ? { kind: question.kind, question_id: question.question_id, quality: draft.quality }
        : null;
    case "multiple_choice":
      if (question.mode === "single") {
        return draft.selectedOption
          ? { kind: question.kind, question_id: question.question_id, selected_option: draft.selectedOption }
          : null;
      }
      {
        const selectedOptions = question.options.filter((option) => draft.selectedOptions?.includes(option));
        return selectedOptions.length > 0
          ? { kind: question.kind, question_id: question.question_id, selected_options: selectedOptions }
          : null;
      }
    case "true_false":
      return draft.trueFalse === undefined
        ? null
        : { kind: question.kind, question_id: question.question_id, answer: draft.trueFalse };
    case "matching": {
      const pairs = question.matching_left.map((item) => ({
        left_id: item.id,
        right_id: draft.pairs?.[item.id] ?? "",
      }));
      return pairs.every((pair) => pair.right_id !== "") && new Set(pairs.map((pair) => pair.right_id)).size === pairs.length
        ? { kind: question.kind, question_id: question.question_id, pairs }
        : null;
    }
    case "numeric":
      return draft.value?.trim()
        ? { kind: question.kind, question_id: question.question_id, value: draft.value.trim() }
        : null;
    case "sequence": {
      const orderedIds = draft.orderedIds ?? question.sequence_items.map((item) => item.id);
      return draft.sequenceConfirmed && orderedIds.length === question.sequence_items.length
        ? { kind: question.kind, question_id: question.question_id, ordered_ids: orderedIds }
        : null;
    }
    case "rubric": {
      const ratings = draft.criterionRatings ?? {};
      return draft.text?.trim() && question.rubric_criteria.every((item) => ratings[item.criterion_id] !== undefined)
        ? { kind: question.kind, question_id: question.question_id, text: draft.text, criterion_ratings: ratings }
        : null;
    }
    case "short_answer":
      return draft.text?.trim()
        ? { kind: question.kind, question_id: question.question_id, text: draft.text }
        : null;
    case "essay":
      return draft.text?.trim()
        ? { kind: question.kind, question_id: question.question_id, text: draft.text }
        : null;
    case "step_by_step":
      return draft.finalAnswer?.trim()
        ? {
            kind: question.kind,
            question_id: question.question_id,
            steps: draft.steps ?? "",
            final_answer: draft.finalAnswer,
          }
        : null;
  }
}

export function AdaptiveAssessment({
  assessment,
  initialResult,
  objectives = [],
  snapshot,
  onSubmit,
  onReload,
  onAlreadySubmitted,
}: {
  assessment: AssessmentResponseV2;
  initialResult?: AssessmentResultV2 | null;
  objectives?: LearningObjective[];
  snapshot?: PedagogySnapshot;
  onSubmit: (input: AssessmentSubmissionV2) => Promise<AssessmentResultV2>;
  onReload: () => Promise<AssessmentResponseV2>;
  onAlreadySubmitted?: () => Promise<AssessmentResultV2>;
}) {
  const [currentAssessment, setCurrentAssessment] = useState(assessment);
  const currentAssessmentRef = useRef(assessment);
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [result, setResult] = useState<AssessmentResultV2 | null>(initialResult ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);
  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questions = useMemo(
    () => seededShuffle(currentAssessment.questions, `${currentAssessment.quiz_id}:${currentAssessment.revision}`),
    [currentAssessment],
  );
  const question = questions[currentIndex];
  const questionDraft = drafts[question?.question_id] ?? {};
  const currentAnswer = question ? answerFor(question, questionDraft) : null;
  const allComplete = questions.length > 0 && questions.every((item) => answerFor(item, drafts[item.question_id] ?? {}) !== null);
  const stimulusById = useMemo(
    () => new Map(currentAssessment.stimuli.map((stimulus) => [stimulus.id, stimulus])),
    [currentAssessment.stimuli],
  );

  useEffect(() => {
    if (assessment.revision !== currentAssessmentRef.current.revision) {
      setOutdated(true);
      setSubmitError("La evaluación publicada cambió. Recarga para continuar con la nueva revisión.");
    }
  }, [assessment.revision]);

  useEffect(() => {
    if (initialResult && initialResult.revision === currentAssessmentRef.current.revision) {
      setResult((current) => current ?? initialResult);
    }
  }, [initialResult]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex]);

  function patchDraft(questionId: string, patch: Partial<QuestionDraft>) {
    setDrafts((current) => ({ ...current, [questionId]: { ...current[questionId], ...patch } }));
    setSubmitError(null);
  }

  async function reloadAssessment() {
    setReloadPending(true);
    setSubmitError(null);
    try {
      const refreshed = await onReload();
      if (refreshed.revision !== currentAssessmentRef.current.revision) {
        currentAssessmentRef.current = refreshed;
        setCurrentAssessment(refreshed);
        setDrafts({});
        setCurrentIndex(0);
        setResult(null);
        setOutdated(false);
      } else {
        setSubmitError("La evaluación todavía tiene la misma revisión. Vuelve a intentar la recarga.");
      }
    } catch (caught: unknown) {
      setSubmitError(getApiErrorMessage(caught, "No se pudo recargar la evaluación."));
    } finally {
      setReloadPending(false);
    }
  }

  async function submit() {
    if (!question || !allComplete || submittingRef.current || outdated) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const answers = questions
      .map((item) => answerFor(item, drafts[item.question_id] ?? {}))
      .filter((answer): answer is AssessmentAnswerV2 => answer !== null);
    try {
      const submitted = await onSubmit({ revision: currentAssessment.revision, answers });
      setResult(submitted);
    } catch (caught: unknown) {
      const code = axios.isAxiosError<{ code?: unknown }>(caught) ? caught.response?.data?.code : undefined;
      if (code === "QUIZ_OUTDATED") {
        setOutdated(true);
        setSubmitError(getApiErrorMessage(caught, "La evaluación cambió. Recarga la versión publicada para continuar."));
      } else if (code === "ASSESSMENT_ALREADY_SUBMITTED" && onAlreadySubmitted) {
        try {
          setResult(await onAlreadySubmitted());
        } catch (resultError: unknown) {
          setSubmitError(getApiErrorMessage(resultError, "Ya existe una entrega, pero no se pudo cargar el resultado."));
        }
      } else {
        setSubmitError(getApiErrorMessage(caught, "No se pudo enviar la evaluación. Tus respuestas siguen en esta visita."));
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (result) {
    return <AdaptiveAssessmentResult assessment={currentAssessment} result={result} objectives={objectives} />;
  }

  if (!question) {
    return (
      <Alert tone="warning" title="Esta evaluación no tiene preguntas">
        <p>Vuelve al material o consulta con tu docente.</p>
      </Alert>
    );
  }

  const answerHintId = `adaptive-answer-hint-${question.question_id}`;
  const incompleteHint = currentAnswer ? undefined : question.kind === "flashcard"
    ? "Revela la tarjeta y elige cuánto la recordabas."
    : question.kind === "sequence"
      ? "Confirma el orden para registrar tu respuesta."
      : "Completa esta respuesta para continuar.";
  const estimate = minuteRange(question, snapshot);
  const stimulus = question.stimulus_id ? stimulusById.get(question.stimulus_id) : undefined;
  function renderInput() {
    switch (question.kind) {
      case "flashcard":
        return (
          <div className="space-y-4">
            <div role="status" aria-live="polite" className="rounded-control border border-line bg-surface-subtle p-4">
              {questionDraft.revealed ? (
                <div className="prose-study max-w-none"><SafeMarkdown>{question.flashcard_answer}</SafeMarkdown></div>
              ) : <p>Revela la respuesta cuando estés listo.</p>}
            </div>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={questionDraft.revealed === true}
              onClick={() => patchDraft(question.question_id, { revealed: true })}
              disabled={questionDraft.revealed === true}
            >
              {questionDraft.revealed ? "Respuesta revelada" : "Mostrar respuesta"}
            </Button>
            {questionDraft.revealed && (
              <fieldset className="space-y-2">
                <legend className="font-medium text-text-primary">Autoevaluación</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FLASHCARD_QUALITY.map((label, quality) => (
                    <label key={quality} className="flex min-h-11 items-center gap-2 rounded-control border border-line px-3 py-2 text-sm">
                      <input
                        type="radio"
                        name={`quality-${question.question_id}`}
                        aria-label={`Calidad ${quality}: ${label}`}
                        checked={questionDraft.quality === quality}
                        onChange={() => patchDraft(question.question_id, { quality })}
                      />
                      <span><strong>{quality}</strong> · {label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        );
      case "multiple_choice":
        return (
          <fieldset className="space-y-2">
            <legend className="font-medium text-text-primary">
              {question.mode === "multiple" ? "Elige todas las respuestas que correspondan" : "Elige una respuesta"}
            </legend>
            {question.options.map((option, index) => {
              const selected = question.mode === "single"
                ? questionDraft.selectedOption === option
                : questionDraft.selectedOptions?.includes(option) === true;
              return (
                <label key={`${option}:${index}`} className="flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface-paper px-4 py-2">
                  <input
                    type={question.mode === "single" ? "radio" : "checkbox"}
                    name={`choice-${question.question_id}`}
                    checked={selected}
                    onChange={() => {
                      if (question.mode === "single") {
                        patchDraft(question.question_id, { selectedOption: option });
                      } else {
                        const current = questionDraft.selectedOptions ?? [];
                        patchDraft(question.question_id, {
                          selectedOptions: current.includes(option)
                            ? current.filter((item) => item !== option)
                            : [...current, option],
                        });
                      }
                    }}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </fieldset>
        );
      case "true_false":
        return (
          <fieldset className="space-y-2">
            <legend className="font-medium text-text-primary">Selecciona una respuesta</legend>
            {[true, false].map((answer) => (
              <label key={String(answer)} className="flex min-h-11 items-center gap-3 rounded-control border border-line px-4 py-2">
                <input
                  type="radio"
                  name={`true-false-${question.question_id}`}
                  checked={questionDraft.trueFalse === answer}
                  onChange={() => patchDraft(question.question_id, { trueFalse: answer })}
                />
                {answer ? "Verdadero" : "Falso"}
              </label>
            ))}
          </fieldset>
        );
      case "matching": {
        const pairs = questionDraft.pairs ?? {};
        return (
          <fieldset className="space-y-3">
            <legend className="font-medium text-text-primary">Relaciona cada elemento</legend>
            {question.matching_left.map((item) => {
              const usedByOther = new Set(Object.entries(pairs).filter(([leftId]) => leftId !== item.id).map(([, rightId]) => rightId));
              return (
                <div key={item.id} className="space-y-1">
                  <label htmlFor={`match-${question.question_id}-${item.id}`} className="block text-sm font-medium text-text-primary">
                    Relación para {item.text}
                  </label>
                  <select
                    id={`match-${question.question_id}-${item.id}`}
                    value={pairs[item.id] ?? ""}
                    onChange={(event) => patchDraft(question.question_id, { pairs: { ...pairs, [item.id]: event.target.value } })}
                    className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    <option value="">Elige una relación</option>
                    {question.matching_right.map((right) => (
                      <option key={right.id} value={right.id} disabled={usedByOther.has(right.id)}>
                        {right.text}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </fieldset>
        );
      }
      case "numeric":
        return (
          <div>
            <label htmlFor={`numeric-${question.question_id}`} className="mb-1 block text-sm font-medium text-text-primary">
              Respuesta numérica
            </label>
            <input
              id={`numeric-${question.question_id}`}
              type="text"
              inputMode="decimal"
              maxLength={64}
              value={questionDraft.value ?? ""}
              onChange={(event) => patchDraft(question.question_id, { value: event.target.value })}
              className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 text-text-primary"
              aria-describedby={question.units ? `numeric-unit-${question.question_id}` : undefined}
            />
            {question.units && <p id={`numeric-unit-${question.question_id}`} className="mt-1 text-sm text-text-muted">Unidad: {question.units}</p>}
          </div>
        );
      case "sequence": {
        const ids = questionDraft.orderedIds ?? question.sequence_items.map((item) => item.id);
        const itemById = new Map(question.sequence_items.map((item) => [item.id, item]));
        function moveItem(index: number, offset: -1 | 1) {
          const nextIndex = index + offset;
          if (nextIndex < 0 || nextIndex >= ids.length) return;
          const next = [...ids];
          [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
          patchDraft(question.question_id, { orderedIds: next, sequenceConfirmed: false });
        }
        return (
          <div className="space-y-3">
            <ol aria-label="Orden de pasos" className="space-y-2">
              {ids.map((id, index) => {
                const item = itemById.get(id);
                if (!item) return null;
                return (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3">
                    <span>{index + 1}. {item.text}</span>
                    <span className="flex gap-1">
                      <Button type="button" variant="ghost" disabled={index === 0} aria-label={`Mover ${item.text} arriba`} onClick={() => moveItem(index, -1)}>↑</Button>
                      <Button type="button" variant="ghost" disabled={index === ids.length - 1} aria-label={`Mover ${item.text} abajo`} onClick={() => moveItem(index, 1)}>↓</Button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="secondary" onClick={() => patchDraft(question.question_id, { orderedIds: ids, sequenceConfirmed: true })}>
              Confirmar orden
            </Button>
            {questionDraft.sequenceConfirmed && <p role="status">Orden confirmado.</p>}
          </div>
        );
      }
      case "rubric":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor={`rubric-text-${question.question_id}`} className="mb-1 block text-sm font-medium text-text-primary">Tu respuesta</label>
              <textarea
                id={`rubric-text-${question.question_id}`}
                maxLength={2000}
                rows={4}
                value={questionDraft.text ?? ""}
                onChange={(event) => patchDraft(question.question_id, { text: event.target.value })}
                className="w-full rounded-control border border-control bg-surface-paper p-3 text-text-primary"
              />
            </div>
            {question.rubric_criteria.map((criterion) => (
              <fieldset key={criterion.criterion_id} className="space-y-2 rounded-control border border-line p-3">
                <legend className="px-1 font-medium text-text-primary">{criterion.description}</legend>
                <div className="flex flex-wrap gap-3">
                  {[0, 1, 2].map((level) => (
                    <label key={level} className="inline-flex min-h-11 items-center gap-2 px-2">
                      <input
                        type="radio"
                        name={`rubric-${question.question_id}-${criterion.criterion_id}`}
                        checked={questionDraft.criterionRatings?.[criterion.criterion_id] === level}
                        onChange={() => patchDraft(question.question_id, {
                          criterionRatings: { ...questionDraft.criterionRatings, [criterion.criterion_id]: level },
                        })}
                      />
                      Nivel {level}: {criterion.descriptors[level] ?? criterion.descriptors[criterion.descriptors.length - 1] ?? RUBRIC_LEVELS[level]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        );
      case "short_answer":
      case "essay":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor={`text-${question.question_id}`} className="mb-1 block text-sm font-medium text-text-primary">Tu respuesta</label>
              <textarea
                id={`text-${question.question_id}`}
                maxLength={2000}
                rows={question.kind === "essay" ? 7 : 4}
                value={questionDraft.text ?? ""}
                onChange={(event) => patchDraft(question.question_id, { text: event.target.value })}
                className="w-full rounded-control border border-control bg-surface-paper p-3 text-text-primary"
              />
            </div>
          </div>
        );
      case "step_by_step":
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor={`steps-${question.question_id}`} className="mb-1 block text-sm font-medium text-text-primary">Pasos de resolución</label>
              <textarea
                id={`steps-${question.question_id}`}
                maxLength={2000}
                rows={5}
                value={questionDraft.steps ?? ""}
                onChange={(event) => patchDraft(question.question_id, { steps: event.target.value })}
                className="w-full rounded-control border border-control bg-surface-paper p-3 text-text-primary"
              />
            </div>
            <div>
              <label htmlFor={`final-${question.question_id}`} className="mb-1 block text-sm font-medium text-text-primary">Respuesta final</label>
              <input
                id={`final-${question.question_id}`}
                maxLength={2000}
                value={questionDraft.finalAnswer ?? ""}
                onChange={(event) => patchDraft(question.question_id, { finalAnswer: event.target.value })}
                className="min-h-11 w-full rounded-control border border-control bg-surface-paper px-3 text-text-primary"
              />
            </div>
          </div>
        );
    }
  }

  const allDraftInputs = renderInput();
  const answerIsComplete = currentAnswer !== null;
  const nextDisabled = !answerIsComplete || outdated || submitting;

  return (
    <section className="space-y-4" aria-labelledby="adaptive-assessment-title" aria-busy={submitting}>
      <Card className="space-y-5">
        <header>
          <h2 id="adaptive-assessment-title" className="font-display text-xl font-semibold text-text-primary">
            Evaluación adaptativa
          </h2>
        </header>

        {outdated && (
          <Alert tone="warning" title="La evaluación cambió">
            <p>{submitError ?? "Recarga la revisión publicada para continuar."}</p>
            <Button type="button" variant="secondary" onClick={() => void reloadAssessment()} disabled={reloadPending}>
              {reloadPending ? "Recargando…" : "Recargar evaluación"}
            </Button>
          </Alert>
        )}
        {submitError && !outdated && (
          <Alert tone="error" title="No se pudo enviar la evaluación">
            <p>Tus respuestas siguen guardadas en esta visita. Puedes volver a intentar el envío.</p>
            <p>{submitError}</p>
          </Alert>
        )}

        <section aria-labelledby={`adaptive-question-title-${question.question_id}`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              ref={headingRef}
              id={`adaptive-question-title-${question.question_id}`}
              tabIndex={-1}
              className="font-display text-lg font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              Pregunta {currentIndex + 1} de {questions.length}
            </h3>
            <Badge color="brand">{questionTypeLabel(question)}</Badge>
          </div>
          <div className="prose-study max-w-none text-text-primary">
            <SafeMarkdown>{question.prompt}</SafeMarkdown>
          </div>
          {estimate && (
            <p className="text-sm text-text-muted">
              Tiempo estimado: {estimate.min}–{estimate.max} min
            </p>
          )}
          {stimulus && <StimulusCard stimulus={stimulus} />}
          {allDraftInputs}
          {incompleteHint && (
            <p id={answerHintId} className="text-sm text-text-muted">
              {incompleteHint}
            </p>
          )}

          <nav aria-label="Navegación de evaluación" className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={() => setCurrentIndex((index) => index - 1)} disabled={currentIndex === 0 || submitting}>
              Anterior
            </Button>
            {currentIndex < questions.length - 1 ? (
              <Button
                type="button"
                onClick={() => setCurrentIndex((index) => index + 1)}
                disabled={nextDisabled}
                aria-describedby={answerIsComplete ? undefined : answerHintId}
              >
                Siguiente pregunta
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={!allComplete || submitting || outdated}
                aria-describedby={allComplete ? undefined : answerHintId}
              >
                {submitting ? "Enviando…" : "Enviar evaluación"}
              </Button>
            )}
          </nav>
          {submitting && <Spinner label="Enviando evaluación…" />}
        </section>
      </Card>
    </section>
  );
}
