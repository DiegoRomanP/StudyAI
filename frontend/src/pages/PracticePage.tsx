import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, ClipboardCheck, Eye, Info, RotateCcw, Timer } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import type { PlanDTO, QuizQuestionDTO, SessionSummaryDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { ChoiceOptions } from "../components/session/ChoiceOptions";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import {
  ActivityIndicator,
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  IconTile,
  SegmentedControl,
  Select,
  Skeleton,
} from "../components/ui";
import { usePlans, useSessionQuizzes } from "../hooks/queries";
import { readyPlans } from "../lib/studyProgress";

type Mode = "questions" | "exam";
type Filter = "all" | "hard";

/** Topics the AI rated 4–5 out of 5 count as "difíciles". */
const HARD_DIFFICULTY = 4;

export interface PracticeQuestion {
  question: QuizQuestionDTO;
  session: SessionSummaryDTO;
  difficulty: number | null;
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

function isCorrectChoice(choice: string, question: QuizQuestionDTO) {
  return choice.trim() === question.answer.trim();
}

/** Every question of a plan, in session order, with its topic's estimated difficulty. */
export function collectPracticeQuestions(
  plan: PlanDTO,
  quizzes: ({ questions: QuizQuestionDTO[] } | undefined)[],
): PracticeQuestion[] {
  const difficultyByTopic = new Map(plan.topics.map((topic) => [normalize(topic.name), topic.difficulty]));
  const sessions = [...plan.sessions].sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  return sessions.flatMap((session) => {
    const quiz = quizzes[plan.sessions.indexOf(session)];
    return [...(quiz?.questions ?? [])]
      .sort((a, b) => a.order_index - b.order_index)
      .map((question) => ({
        question,
        session,
        difficulty: difficultyByTopic.get(normalize(session.topic_name)) ?? null,
      }));
  });
}

/**
 * Práctica: "Preguntas" is a local practice round with immediate feedback that never
 * writes to the API (no stats, no SM-2 changes); "Simulacro" opens the real session
 * test, which does record a result.
 */
export function PracticePage() {
  const plansQuery = usePlans();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: Mode = searchParams.get("modo") === "simulacro" ? "exam" : "questions";

  function update(next: { plan?: string; modo?: Mode }) {
    const params = new URLSearchParams(searchParams);
    if (next.plan !== undefined) params.set("plan", next.plan);
    if (next.modo !== undefined) {
      if (next.modo === "exam") params.set("modo", "simulacro");
      else params.delete("modo");
    }
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <IconTile icon={ClipboardCheck} className="h-11 w-11" />
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">Práctica</h1>
          <p className="mt-1 max-w-reading text-text-muted">
            Repasa las preguntas de tus sesiones con respuesta inmediata, o haz el simulacro para
            registrar tu resultado.
          </p>
        </div>
      </header>

      <SegmentedControl
        label="Modo de práctica"
        value={mode}
        onChange={(value) => update({ modo: value })}
        options={[
          { value: "questions", label: "Preguntas" },
          { value: "exam", label: "Simulacro" },
        ]}
      />

      <AsyncState
        data={plansQuery.data}
        isLoading={plansQuery.isPending}
        isError={plansQuery.isError}
        isFetching={plansQuery.isFetching}
        isEmpty={(plans) => readyPlans(plans).length === 0}
        loading={<Skeleton height={240} />}
        loadingLabel="Cargando tus planes"
        empty={
          <Card className="space-y-3">
            <p className="text-text-muted">Todavía no tienes un plan listo para practicar.</p>
            <ButtonLink to="/inicio">Prepara tu plan en Inicio</ButtonLink>
          </Card>
        }
        onRetry={() => void plansQuery.refetch()}
        initialErrorMessage="No se pudieron cargar tus planes."
        updateErrorMessage="No se pudieron actualizar tus planes. Se muestran los últimos cargados."
      >
        {(plans) => {
          const ready = readyPlans(plans);
          const requested = Number(searchParams.get("plan"));
          const plan = ready.find((item) => item.id === requested) ?? ready[0];
          return (
            <div className="space-y-4">
              {ready.length > 1 && (
                <Select
                  id="practice-plan"
                  label="Plan"
                  value={plan.id}
                  onChange={(event) => update({ plan: event.target.value })}
                >
                  {ready.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              )}
              {mode === "questions" ? (
                <QuestionPractice key={plan.id} plan={plan} />
              ) : (
                <ExamList plan={plan} />
              )}
            </div>
          );
        }}
      </AsyncState>
    </div>
  );
}

function QuestionPractice({ plan }: { plan: PlanDTO }) {
  const quizQueries = useSessionQuizzes(plan.sessions.map((session) => session.id));
  const [filter, setFilter] = useState<Filter>("all");

  const pending = quizQueries.some((query) => query.isPending && query.fetchStatus !== "idle");
  const failed = quizQueries.filter((query) => query.isError && !query.data);
  const questions = collectPracticeQuestions(
    plan,
    quizQueries.map((query) => query.data),
  );
  const filtered =
    filter === "hard"
      ? questions.filter((item) => item.difficulty !== null && item.difficulty >= HARD_DIFFICULTY)
      : questions;

  return (
    <div className="space-y-4">
      <SegmentedControl
        label="Filtrar preguntas"
        appearance="chips"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas" },
          { value: "hard", label: "Difíciles" },
        ]}
      />
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action-hover" />
        Esta práctica no se guarda ni cambia tus repasos. «Difíciles» son preguntas de temas que la
        IA estimó con dificultad {HARD_DIFFICULTY} o más de 5.
      </p>

      {failed.length > 0 && (
        <Alert tone="error" title="Algunas preguntas no se pudieron cargar">
          <p>
            Faltan las preguntas de {failed.length} {failed.length === 1 ? "sesión" : "sesiones"}.
          </p>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => failed.forEach((query) => void query.refetch())}
            >
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {pending ? (
        <ActivityIndicator label="Cargando preguntas…" />
      ) : filtered.length === 0 ? (
        !pending &&
        failed.length === 0 && (
          <Card className="text-text-muted">
            {filter === "hard"
              ? "Este plan no tiene preguntas de temas difíciles. Prueba con «Todas»."
              : "Este plan todavía no tiene preguntas."}
          </Card>
        )
      ) : (
        <PracticeRound key={filter} planId={plan.id} questions={filtered} />
      )}
    </div>
  );
}

function PracticeRound({ planId, questions }: { planId: number; questions: PracticeQuestion[] }) {
  const [index, setIndex] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const finished = index >= questions.length;

  const graded = questions.filter((item) => picked[item.question.id] !== undefined);
  const correct = graded.filter((item) => isCorrectChoice(picked[item.question.id], item.question)).length;

  function restart() {
    setIndex(0);
    setPicked({});
    setRevealed({});
  }

  if (finished) {
    return (
      <Card variant="elevated" className="space-y-3 text-center">
        <h2 className="font-display text-xl font-semibold text-text-primary">Ronda terminada</h2>
        <p className="text-text-muted">
          {graded.length > 0
            ? `Acertaste ${correct} de ${graded.length} preguntas de opción múltiple.`
            : "Repasaste todas las tarjetas de esta ronda."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={restart}>
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Practicar de nuevo
          </Button>
          <ButtonLink to={`/practica?plan=${planId}&modo=simulacro`} variant="secondary">
            Ir al simulacro
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <PracticeQuestionCard
      item={questions[index]}
      position={index + 1}
      total={questions.length}
      score={graded.length > 0 ? { correct, graded: graded.length } : null}
      choice={picked[questions[index].question.id] ?? null}
      revealed={revealed[questions[index].question.id] === true}
      onPick={(option) => setPicked((previous) => ({ ...previous, [questions[index].question.id]: option }))}
      onReveal={() => setRevealed((previous) => ({ ...previous, [questions[index].question.id]: true }))}
      onNext={() => setIndex((current) => current + 1)}
      nextButton={nextButton}
    />
  );
}

function PracticeQuestionCard({
  item: { question, session, difficulty },
  position,
  total,
  score,
  choice,
  revealed,
  onPick,
  onReveal,
  onNext,
  nextButton,
}: {
  item: PracticeQuestion;
  position: number;
  total: number;
  score: { correct: number; graded: number } | null;
  choice: string | null;
  revealed: boolean;
  onPick: (option: string) => void;
  onReveal: () => void;
  onNext: () => void;
  nextButton: RefObject<HTMLButtonElement>;
}) {
  const isMultipleChoice = question.question_type === "MULTIPLE_CHOICE";
  // "Mostrar respuesta" disappears once used: move focus to the next action.
  useEffect(() => {
    if (!isMultipleChoice && revealed) nextButton.current?.focus();
  }, [isMultipleChoice, revealed, nextButton]);
  const answered = isMultipleChoice ? choice !== null : revealed;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <span>
          Pregunta {position} de {total}
        </span>
        {score && (
          <span>
            Aciertos: {score.correct} de {score.graded}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={isMultipleChoice ? "brand" : "slate"}>
          {isMultipleChoice ? "Opción múltiple" : "Flashcard"}
        </Badge>
        <span className="min-w-0 break-words text-sm text-text-muted">{session.topic_name}</span>
        {difficulty !== null && difficulty >= HARD_DIFFICULTY && <Badge color="amber">Difícil</Badge>}
      </div>
      <div className="prose-study max-w-none font-medium text-text-primary">
        <SafeMarkdown>{question.prompt}</SafeMarkdown>
      </div>

      {isMultipleChoice ? (
        <>
          <ChoiceOptions
            key={question.id}
            options={question.options}
            selected={choice}
            expected={choice !== null ? question.answer : undefined}
            onSelect={onPick}
          />
          <p role="status" className={`text-sm font-medium ${choice !== null && isCorrectChoice(choice, question) ? "text-state-success" : "text-state-error"}`}>
            {choice === null ? "" : isCorrectChoice(choice, question) ? "¡Correcto!" : `Incorrecto. La respuesta es: ${question.answer}`}
          </p>
        </>
      ) : revealed ? (
        <p role="status" className="rounded-control border border-line bg-surface-subtle p-4 font-medium text-action-hover">
          {question.answer}
        </p>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={onReveal}
        >
          <Eye aria-hidden="true" className="h-4 w-4" />
          Mostrar respuesta
        </Button>
      )}

      <div className="flex justify-end">
        <Button ref={nextButton} type="button" onClick={onNext} disabled={!answered}>
          {position === total ? "Terminar ronda" : "Siguiente pregunta"}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function ExamList({ plan }: { plan: PlanDTO }) {
  const sessions = [...plan.sessions].sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  if (sessions.length === 0) {
    return <Card className="text-text-muted">Este plan no tiene sesiones para el simulacro.</Card>;
  }
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <Timer aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action-hover" />
        El simulacro abre directamente el test de la sesión. Tu resultado se guarda en Estadísticas y
        actualiza tus repasos.
      </p>
      <ul className="grid grid-cols-1 gap-3">
        {sessions.map((session) => (
          <li key={session.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium text-text-primary">{session.topic_name}</p>
                <p className="text-sm text-text-muted">
                  {session.status === "COMPLETED" ? "Completada · un nuevo intento se registra aparte" : "Pendiente"}
                </p>
              </div>
              <ButtonLink
                to={`/session/${session.id}?fase=test`}
                variant={session.status === "COMPLETED" ? "secondary" : "primary"}
                aria-label={`Hacer el simulacro de ${session.topic_name}`}
              >
                Hacer el simulacro
              </ButtonLink>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
