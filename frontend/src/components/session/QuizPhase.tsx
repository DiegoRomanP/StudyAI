import axios from "axios";
import { useId, useRef, useState } from "react";
import { ArrowRight, ListChecks } from "lucide-react";

import { getApiErrorMessage } from "../../api/errors";
import type { QuizAnswer, QuizQuestionDTO, QuizResultDTO } from "../../api/types";
import { useQuiz, useSubmitQuiz } from "../../hooks/queries";
import { clearQuizDraft, readQuizDraft, writeQuizDraft } from "../../lib/quizDraft";
import { EmptyState } from "../EmptyState";
import { Alert, Badge, Button, ButtonLink, Card, ProgressBar, Spinner } from "../ui";
import { ChoiceOptions } from "./ChoiceOptions";
import { SafeMarkdown } from "./SafeMarkdown";

/** Short visible labels for the 0–5 recall scale; the long ones name each button. */
export const QUALITY_SHORT_LABELS = ["Nada", "Me sonaba", "Casi", "Con esfuerzo", "Con dudas", "Perfecto"];

const QUALITY_LABELS = [
  "no la recordé",
  "la reconocí al verla",
  "casi la recordé",
  "la recordé con esfuerzo",
  "la recordé con dudas",
  "la recordé perfectamente",
];

/** Fisher-Yates on a copy. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function QuizPhase({
  sessionId,
  planId,
  alreadyCompleted,
  allowShuffle = false,
  retakeAlreadyConfirmed = false,
  onSubmitted,
}: {
  sessionId: number;
  planId: number;
  alreadyCompleted: boolean;
  /** Reviews can reorder their questions (before the first answer). */
  allowShuffle?: boolean;
  /** The learner already chose to start again (plan panel), so don't ask twice. */
  retakeAlreadyConfirmed?: boolean;
  onSubmitted: (result: QuizResultDTO) => void;
}) {
  const { data: quiz, isLoading, isError, isFetching, refetch } = useQuiz(sessionId);
  const submit = useSubmitQuiz();
  const [retakeConfirmed, setRetakeConfirmed] = useState(retakeAlreadyConfirmed);
  // Answers saved in this browser by an unfinished attempt; the test resumes from them.
  const [draft] = useState(() => readQuizDraft(sessionId));
  // null until the learner moves: then it starts at the first unanswered question.
  const [index, setIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>(() => draft?.answers ?? {});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The quiz was replaced while the learner answered: the server asked to reload it.
  const [outdated, setOutdated] = useState<string | null>(null);
  const [shuffledIds, setShuffledIds] = useState<number[] | null>(() => draft?.order ?? null);
  // Blocks a second submission synchronously, before the pending state re-renders.
  const submitting = useRef(false);

  if (alreadyCompleted && !retakeConfirmed) {
    return (
      <Alert tone="warning" title="Esta sesión ya tiene un resultado guardado">
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setRetakeConfirmed(true)}>
            Registrar un nuevo intento
          </Button>
          <ButtonLink to={`/plan/${planId}`} variant="secondary">
            Volver al plan
          </ButtonLink>
        </div>
      </Alert>
    );
  }

  if (isError && !quiz) {
    return (
      <Alert tone="error" title="No se pudo cargar el test">
        <p>Comprueba la conexión e inténtalo de nuevo.</p>
        <div>
          <Button type="button" variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }

  if (isLoading || !quiz) return <Spinner label="Cargando quiz…" />;
  if (quiz.questions.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Esta sesión no tiene preguntas"
        description="Puedes repasar el material o seguir con otra sesión del plan."
        action={
          <ButtonLink to={`/plan/${planId}`} variant="secondary">
            Volver al plan
          </ButtonLink>
        }
      />
    );
  }

  const shuffled = shuffledIds
    ? shuffledIds
        .map((id) => quiz.questions.find((item) => item.id === id))
        .filter((item): item is QuizQuestionDTO => item !== undefined)
    : null;
  // A saved order that no longer matches the quiz (replaced by a reinforcement) is ignored.
  const questions = shuffled && shuffled.length === quiz.questions.length ? shuffled : quiz.questions;
  const firstUnanswered = questions.findIndex((item) => answers[item.id] === undefined);
  const position = index ?? (firstUnanswered === -1 ? questions.length - 1 : firstUnanswered);
  const question = questions[Math.min(position, questions.length - 1)];
  const isLast = position >= questions.length - 1;
  const currentAnswered = answers[question.id] !== undefined;
  const answeredCount = questions.filter((item) => answers[item.id] !== undefined).length;
  const nextHintId = `quiz-next-hint-${question.id}`;
  const nextHint = currentAnswered
    ? null
    : question.question_type === "FLASHCARD"
      ? "Muestra la respuesta y valora cuánto la recordabas."
      : "Elige una respuesta para continuar.";

  function toggleShuffle() {
    setIndex(0);
    setShuffledIds((current) => (current ? null : shuffle(quiz!.questions.map((item) => item.id))));
  }

  function record(answer: QuizAnswer) {
    setSubmitError(null);
    setOutdated(null);
    const updated = { ...answers, [answer.question_id]: answer };
    setAnswers(updated);
    setIndex(position);
    writeQuizDraft(sessionId, {
      quizId: quiz!.id,
      answers: updated,
      order: questions === quiz!.questions ? null : questions.map((item) => item.id),
    });
  }

  async function next() {
    if (!isLast) {
      setIndex(position + 1);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setSubmitError(null);
    try {
      const payload = questions
        .map((item) => answers[item.id])
        .filter((answer): answer is QuizAnswer => answer !== undefined);
      const result = await submit.mutateAsync({ quizId: quiz!.id, sessionId, answers: payload });
      clearQuizDraft(sessionId);
      onSubmitted(result);
    } catch (caught: unknown) {
      if (axios.isAxiosError(caught) && caught.response?.data?.code === "QUIZ_OUTDATED") {
        // Keep the answers whose questions still exist; the reloaded quiz asks for the rest.
        setOutdated(getApiErrorMessage(caught, ""));
        setSubmitError(null);
        setShuffledIds(null);
        setIndex(0);
        await refetch();
      } else {
        setSubmitError(getApiErrorMessage(caught, ""));
      }
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <ProgressBar value={(answeredCount / questions.length) * 100} label="Preguntas respondidas" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          Pregunta {position + 1} de {questions.length}
        </p>
        {allowShuffle && answeredCount === 0 && (
          <Button type="button" variant="ghost" aria-pressed={shuffledIds !== null} onClick={toggleShuffle}>
            Mezclar
          </Button>
        )}
      </div>

      {outdated !== null && <Alert tone="warning">{outdated}</Alert>}

      {question.question_type === "FLASHCARD" ? (
        <FlashCard
          key={question.id}
          question={question}
          onRate={(quality) => record({ question_id: question.id, quality })}
          rated={answers[question.id]?.quality}
        />
      ) : (
        <MultipleChoice
          key={question.id}
          question={question}
          selected={answers[question.id]?.selected_option ?? null}
          onSelect={(option) => record({ question_id: question.id, selected_option: option })}
        />
      )}

      {submitError !== null && (
        <Alert tone="error">
          <p>No se pudo enviar el test. Tus respuestas siguen aquí.</p>
          {submitError && <p>{submitError}</p>}
        </Alert>
      )}

      <div className="flex flex-col items-end gap-2">
        <Button
          type="button"
          onClick={next}
          disabled={!currentAnswered || submit.isPending}
          aria-describedby={nextHint ? nextHintId : undefined}
        >
          {submit.isPending ? "Enviando…" : isLast ? "Finalizar" : "Siguiente"}
          {!submit.isPending && !isLast && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </Button>
        {nextHint && (
          <p id={nextHintId} className="text-sm text-text-muted">
            {nextHint}
          </p>
        )}
      </div>
    </div>
  );
}

function FlashCard({
  question,
  onRate,
  rated,
}: {
  question: QuizQuestionDTO;
  onRate: (quality: number) => void;
  rated?: number | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const answerId = useId();

  return (
    <Card className="space-y-4">
      <Badge>Tarjeta</Badge>
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-control border border-line bg-surface-subtle p-6 text-center">
        <div className="prose-study max-w-none text-lg text-text-primary">
          <SafeMarkdown>{question.prompt}</SafeMarkdown>
        </div>
        {/* A stable control name; the revealed answer is announced from its own live region. */}
        <div id={answerId} role="status" aria-label="Respuesta" className="w-full">
          {flipped && (
            <p className="border-t border-line pt-3 text-lg font-medium text-action-hover">
              {question.answer}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          variant="secondary"
          aria-expanded={flipped}
          aria-controls={answerId}
          onClick={() => setFlipped((current) => !current)}
        >
          {flipped ? "Ocultar respuesta" : "Mostrar respuesta"}
        </Button>
      </div>

      {flipped && (
        <fieldset>
          <legend className="mb-2 w-full text-center text-sm font-medium text-text-muted">
            ¿Qué tan bien la recordaste?
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {QUALITY_LABELS.map((label, quality) => (
              <button
                key={quality}
                type="button"
                aria-pressed={rated === quality}
                aria-label={`Calidad ${quality}: ${label}`}
                onClick={() => onRate(quality)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-control px-3 py-2 text-sm transition-colors motion-reduce:transition-none ${
                  rated === quality
                    ? "bg-action-fill text-text-on-action"
                    : "bg-surface-muted text-text-muted hover:bg-surface-action-subtle hover:text-text-primary"
                }`}
              >
                <span className="font-semibold">{quality}</span>
                <span>{QUALITY_SHORT_LABELS[quality]}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </Card>
  );
}

function MultipleChoice({
  question,
  selected,
  onSelect,
}: {
  question: QuizQuestionDTO;
  selected: string | null;
  onSelect: (option: string) => void;
}) {
  const answered = selected !== null;
  // Same comparison the server grades with (quiz_service.submit).
  const correct = answered && selected.trim() === question.answer.trim();
  return (
    <Card className="space-y-4">
      <Badge color="brand">Opción múltiple</Badge>
      <div className="prose-study max-w-none font-medium text-text-primary">
        <SafeMarkdown>{question.prompt}</SafeMarkdown>
      </div>
      {/* Once picked, the answer is corrected on the spot and locked. */}
      <ChoiceOptions
        options={question.options}
        selected={selected}
        onSelect={onSelect}
        expected={answered ? question.answer : undefined}
      />
      <p role="status" className={`text-sm font-medium ${correct ? "text-state-correct" : "text-state-error"}`}>
        {answered && (correct ? "¡Correcto!" : "Incorrecto. La respuesta correcta está en verde.")}
      </p>
    </Card>
  );
}
