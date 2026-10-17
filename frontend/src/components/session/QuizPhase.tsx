import { useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { getApiErrorMessage } from "../../api/errors";
import type { QuizAnswer, QuizQuestionDTO, QuizResultDTO } from "../../api/types";
import { useQuiz, useSubmitQuiz } from "../../hooks/queries";
import { Alert, Badge, Button, ButtonLink, Card, ProgressBar, Spinner } from "../ui";

const QUALITY_LABELS = [
  "no la recordé",
  "la reconocí al verla",
  "casi la recordé",
  "la recordé con esfuerzo",
  "la recordé con dudas",
  "la recordé perfectamente",
];

export function QuizPhase({
  sessionId,
  planId,
  alreadyCompleted,
  onSubmitted,
}: {
  sessionId: number;
  planId: number;
  alreadyCompleted: boolean;
  onSubmitted: (result: QuizResultDTO) => void;
}) {
  const { data: quiz, isLoading, isError, isFetching, refetch } = useQuiz(sessionId);
  const submit = useSubmitQuiz();
  const [retakeConfirmed, setRetakeConfirmed] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Blocks a second submission synchronously, before the pending state re-renders.
  const submitting = useRef(false);

  if (alreadyCompleted && !retakeConfirmed) {
    return (
      <Alert tone="warning" title="Esta sesión ya tiene un resultado guardado">
        <p>
          Si respondes el test de nuevo, se registrará como un nuevo intento y actualizará tus
          estadísticas y repasos.
        </p>
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
    return <Card>No hay preguntas para esta sesión.</Card>;
  }

  const questions = quiz.questions;
  const question = questions[Math.min(index, questions.length - 1)];
  const isLast = index >= questions.length - 1;
  const currentAnswered = answers[question.id] !== undefined;
  const answeredCount = questions.filter((item) => answers[item.id] !== undefined).length;

  function record(answer: QuizAnswer) {
    setSubmitError(null);
    setAnswers((previous) => ({ ...previous, [answer.question_id]: answer }));
  }

  async function next() {
    if (!isLast) {
      setIndex((current) => current + 1);
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
      onSubmitted(result);
    } catch (caught: unknown) {
      setSubmitError(getApiErrorMessage(caught, ""));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <ProgressBar value={(answeredCount / questions.length) * 100} label="Preguntas respondidas" />
      <p className="text-sm text-text-muted">
        Pregunta {index + 1} de {questions.length}
      </p>

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

      <div className="flex justify-end">
        <Button type="button" onClick={next} disabled={!currentAnswered || submit.isPending}>
          {submit.isPending ? "Enviando…" : isLast ? "Finalizar" : "Siguiente"}
          {!submit.isPending && !isLast && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </Button>
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
      <Badge>Flashcard</Badge>
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-control border border-line bg-surface-subtle p-6 text-center">
        <p className="text-lg text-text-primary">{question.prompt}</p>
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
            ¿Qué tan bien la recordaste? (SM-2)
          </legend>
          <div className="flex flex-wrap justify-center gap-2">
            {QUALITY_LABELS.map((label, quality) => (
              <button
                key={quality}
                type="button"
                aria-pressed={rated === quality}
                aria-label={`Calidad ${quality}: ${label}`}
                onClick={() => onRate(quality)}
                className={`h-11 w-11 rounded-full text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  rated === quality
                    ? "bg-action-fill text-text-on-action"
                    : "bg-surface-muted text-text-muted hover:bg-surface-action-subtle hover:text-text-primary"
                }`}
              >
                {quality}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between px-1 text-xs text-text-muted" aria-hidden="true">
            <span>0 · nada</span>
            <span>5 · perfecto</span>
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
  return (
    <Card className="space-y-3">
      <Badge color="brand">Opción múltiple</Badge>
      <p className="font-medium text-text-primary">{question.prompt}</p>
      <div className="grid gap-2">
        {question.options.map((option, optionIndex) => (
          <button
            key={`${optionIndex}-${option}`}
            type="button"
            aria-pressed={selected === option}
            onClick={() => onSelect(option)}
            className={`min-h-11 rounded-control border px-4 py-2 text-left text-sm transition-colors motion-reduce:transition-none ${
              selected === option
                ? "border-action bg-action-subtle text-text-primary"
                : "border-line text-text-primary hover:bg-surface-subtle"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </Card>
  );
}
