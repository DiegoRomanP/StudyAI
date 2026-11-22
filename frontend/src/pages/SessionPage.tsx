import { useState, type ReactNode } from "react";
import axios from "axios";
import { BarChart3, X } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/errors";
import type { LearningResponseV2 } from "../api/adaptiveLearning";
import type { PlanTopicDTO, QuizResultDTO, SessionDetailDTO } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { AdaptiveAssessment } from "../components/session/AdaptiveAssessment";
import { AnswerReview } from "../components/session/AnswerReview";
import { AssistantPanel, AssistantQuestionContext } from "../components/session/AssistantPanel";
import { LessonBlocks } from "../components/session/LessonBlocks";
import { QuizPhase } from "../components/session/QuizPhase";
import { ReviewPanel, ReviewPoints } from "../components/session/ReviewPanel";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import { PhaseEnter, SessionSkeleton } from "../components/session/SessionSkeleton";
import { SessionResult } from "../components/session/SessionResult";
import { BreakPhase, StudyPhase } from "../components/session/StudyPhase";
import { Alert, Badge, Button, ButtonLink, Card } from "../components/ui";
import {
  useAdaptiveAssessment,
  useAdaptiveAssessmentResult,
  useAdaptiveLearning,
  useSubmitAdaptiveAssessment,
} from "../hooks/useAdaptiveLearning";
import { usePlan, useQuiz, useSession, useSessionResult } from "../hooks/queries";
import { clearQuizDraft } from "../lib/quizDraft";
import { parsePositiveSafeRouteId } from "../lib/routeIds";
import { routeOrder, toDateKey } from "../lib/studyProgress";

type Phase = "study" | "break" | "test" | "done" | "stats";

function initialPhase(fase: string | null): Phase {
  if (fase === "test") return "test";
  if (fase === "resultado") return "stats";
  return "study";
}

export function SessionPage() {
  const { sessionId } = useParams();
  const id = parsePositiveSafeRouteId(sessionId);
  const { data: session, isLoading, isError, refetch } = useSession(id);

  if (id === null) {
    return (
      <section className="space-y-4" aria-labelledby="invalid-session-title">
        <h1 id="invalid-session-title" className="text-2xl font-bold">Enlace a la sesión no válido</h1>
        <Alert tone="error">
          <p>El identificador de la sesión debe ser un entero decimal positivo y seguro.</p>
          <ButtonLink to="/plan" variant="secondary">Ir a tus planes</ButtonLink>
        </Alert>
      </section>
    );
  }

  if (isError && !session) {
    return (
      <section className="space-y-4" aria-labelledby="session-load-error-title">
        <h1 id="session-load-error-title" className="text-2xl font-bold">No se pudo abrir la sesión</h1>
        <Alert tone="error">
          <p>La sesión no está disponible. Comprueba la conexión o vuelve a tus planes.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              Reintentar
            </Button>
            <ButtonLink to="/plan" variant="ghost">Volver a tus planes</ButtonLink>
          </div>
        </Alert>
      </section>
    );
  }

  if (isLoading || !session) return <SessionSkeleton label="Cargando sesión…" />;

  const updateError = isError ? (
    <Alert tone="error" title="No se pudo actualizar la sesión">
      <p>Se mantienen visibles los datos que ya estaban cargados.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void refetch()}>
          Reintentar actualización
        </Button>
        <ButtonLink to="/plan" variant="ghost">Volver a tus planes</ButtonLink>
      </div>
    </Alert>
  ) : null;

  // Keyed by session: phase, timers and answers never leak into another session.
  return <SessionFlow key={session.id} session={session} updateError={updateError} />;
}

function SessionFlow({ session, updateError }: { session: SessionDetailDTO; updateError: ReactNode }) {
  const adaptive = useAdaptiveLearning(session.id);

  if (!adaptive.mode.data) {
    if (adaptive.mode.isError) {
      return (
        <section className="space-y-4" aria-labelledby="session-mode-title">
          <h1 id="session-mode-title" className="text-2xl font-bold">{session.topic_name}</h1>
          <Alert tone="error" title="No se pudo confirmar el tipo de sesión">
            <p>{getApiErrorMessage(adaptive.mode.error, "La versión de la sesión no está disponible.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void adaptive.mode.refetch()}>
                Reintentar
              </Button>
              <ButtonLink to={`/plan/${session.plan_id}`} variant="ghost">Volver al plan</ButtonLink>
            </div>
          </Alert>
        </section>
      );
    }
    return <SessionSkeleton label="Comprobando el tipo de sesión…" />;
  }

  if (adaptive.mode.data.content_version === 1) {
    return <LegacySessionFlow session={session} updateError={updateError} />;
  }

  if (!adaptive.lesson.data) {
    if (adaptive.lesson.isError) {
      const contentNotReady =
        axios.isAxiosError<{ code?: unknown }>(adaptive.lesson.error) &&
        adaptive.lesson.error.response?.data?.code === "CONTENT_NOT_READY";
      if (contentNotReady) {
        return (
          <AdaptiveContentNotReady
            session={session}
            updateError={updateError}
            onRetry={() => void adaptive.lesson.refetch()}
          />
        );
      }
      return (
        <section className="space-y-4" aria-labelledby="adaptive-content-title">
          <h1 id="adaptive-content-title" className="text-2xl font-bold">{session.topic_name}</h1>
          {updateError}
          <Alert tone="error" title="No se pudo cargar la lección adaptativa">
            <p>{getApiErrorMessage(adaptive.lesson.error, "No se pudo cargar la lección adaptativa.")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void adaptive.lesson.refetch()}>
                Reintentar
              </Button>
              <ButtonLink to={`/plan/${session.plan_id}`} variant="ghost">Volver al plan</ButtonLink>
            </div>
          </Alert>
        </section>
      );
    }
    return <SessionSkeleton label="Cargando lección adaptativa…" />;
  }

  return <AdaptiveSessionFlow session={session} lesson={adaptive.lesson.data} updateError={updateError} />;
}

function AdaptiveContentNotReady({
  session,
  updateError,
  onRetry,
}: {
  session: SessionDetailDTO;
  updateError: ReactNode;
  onRetry: () => void;
}) {
  const planQuery = usePlan(session.plan_id);
  const planReady = planQuery.data?.status === "READY";

  return (
    <section className="space-y-4" aria-labelledby="adaptive-content-title">
      <h1 id="adaptive-content-title" className="text-2xl font-bold">{session.topic_name}</h1>
      {updateError}
      <Alert tone="warning" title="Contenido adaptativo en preparación">
        <p>El contenido de la sesión todavía no está disponible.</p>
        {planReady ? (
          <p>Este plan ya figura listo. Crea un plan nuevo para generar contenido adaptativo para sus sesiones.</p>
        ) : (
          <p>Si el plan sigue generándose, vuelve al plan para consultar su progreso.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onRetry}>Reintentar</Button>
          {planReady ? (
            <ButtonLink to="/plan" variant="ghost">Crear un plan nuevo</ButtonLink>
          ) : (
            <ButtonLink to={`/plan/${session.plan_id}`} variant="ghost">Volver al plan</ButtonLink>
          )}
        </div>
      </Alert>
    </section>
  );
}

function LegacySessionFlow({
  session,
  updateError,
}: {
  session: SessionDetailDTO;
  updateError: ReactNode;
}) {
  // Práctica → Simulacro opens the test directly (`?fase=test`); the material stays one click back.
  // The plan's session panel opens the stats (`?fase=resultado`) or a confirmed retake (`?reintento=1`).
  const [searchParams, setSearchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>(() => initialPhase(searchParams.get("fase")));
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [retakeConfirmed, setRetakeConfirmed] = useState(() => searchParams.get("reintento") === "1");
  const [result, setResult] = useState<QuizResultDTO | null>(null);
  // Reading the material during the test keeps QuizPhase mounted (answers, retake consent).
  const [reviewing, setReviewing] = useState(false);
  // Live from the server (a cached PENDING may refetch as COMPLETED); this visit's own
  // submission moves to the result, so it never asks to confirm itself.
  const alreadyCompleted = session.status === "COMPLETED";
  // Only read once the exam is done; the plan (topic mastery, route) was just refreshed.
  const plan = usePlan(phase === "done" || phase === "stats" ? session.plan_id : null).data;
  const topic = plan?.topics.find((item) => item.id === session.topic_id);
  const nextSession = plan ? routeOrder(plan).find((item) => item.id !== session.id) ?? null : null;
  const nextIsAvailable =
    nextSession !== null &&
    (nextSession.kind === "NEW" ||
      nextSession.scheduled_date === null ||
      nextSession.scheduled_date <= toDateKey(new Date()));
  const reviewDate =
    plan?.sessions.find(
      (item) =>
        item.kind === "REVIEW" &&
        item.status === "PENDING" &&
        item.topic_id === session.topic_id &&
        item.id !== session.id,
    )?.scheduled_date ?? null;

  function handleSubmitted(confirmed: QuizResultDTO) {
    setResult(confirmed);
    setPhase("done");
  }

  function restart() {
    clearQuizDraft(session.id);
    setRetakeConfirmed(true);
    setReviewing(false);
    setPhase("study");
    setSearchParams({ reintento: "1" }, { replace: true });
  }

  const fromPractice = searchParams.get("fase") === "test";
  const material = session.material?.content_markdown || "_Sin material._";
  const isReview = session.kind === "REVIEW";
  const points = session.review_points ?? [];
  const reinforced = session.reinforcement_status === "READY";
  const showReviewSide = isReview && points.length > 0;
  const badge = isReview ? (
    <>
      <Badge color="brand">Repaso</Badge>
      {reinforced && <Badge color="green">Con IA</Badge>}
    </>
  ) : undefined;
  const exit = (
    <ButtonLink to={`/plan/${session.plan_id}`} variant="ghost" aria-label="Salir de la sesión">
      <X aria-hidden="true" className="h-5 w-5" />
    </ButtonLink>
  );

  return (
    <AssistantQuestionContext.Provider value={setQuestionId}>
      <div className="space-y-4">
        {updateError}

        <PhaseEnter phase={phase}>
          {phase === "study" ? (
            <StudyPhase
              topic={session.topic_name}
              durationMinutes={session.duration_minutes}
              exit={exit}
              badge={badge}
              aside={showReviewSide && !reinforced ? <ReviewPanel session={session} /> : undefined}
              preview={showReviewSide ? <ReviewPoints points={points} /> : undefined}
              startDisabledReason={
                session.reinforcement_status === "PROCESSING" ? "Esperando el refuerzo con IA" : undefined
              }
              onDone={() => setPhase("break")}
            >
              {showReviewSide && <ReviewPoints points={points} />}
              <SafeMarkdown>{material}</SafeMarkdown>
            </StudyPhase>
          ) : (
            <>
              <div className="flex items-center gap-2 pt-2">
                {exit}
                {phase === "test" && fromPractice && (
                  <Button type="button" variant="ghost" aria-pressed={reviewing} onClick={() => setReviewing((current) => !current)}>
                    {reviewing ? "Volver al test" : "Repasar el material"}
                  </Button>
                )}
              </div>
              <h1 className="sr-only">{session.topic_name}</h1>
            </>
          )}

          {phase === "break" && <BreakPhase onDone={() => setPhase("test")} />}
          {phase === "test" && reviewing && (
            <Card>
              <div className="prose-study mx-auto max-w-reading">
                <SafeMarkdown>{material}</SafeMarkdown>
              </div>
            </Card>
          )}
          {phase === "test" && (
            <div hidden={reviewing}>
              <QuizPhase
                sessionId={session.id}
                planId={session.plan_id}
                alreadyCompleted={alreadyCompleted}
                allowShuffle={isReview}
                retakeAlreadyConfirmed={retakeConfirmed}
                onSubmitted={handleSubmitted}
              />
            </div>
          )}
          {phase === "stats" && <SessionStats session={session} topic={topic} onRestart={restart} />}
          {phase === "done" &&
            (result ? (
              <SessionResult
                result={result}
                planId={session.plan_id}
                topic={topic}
                nextSession={nextSession}
                nextIsAvailable={nextIsAvailable}
                reviewDate={reviewDate}
                keywords={session.material?.youtube_keywords ?? []}
              />
            ) : (
              <Card className="space-y-3">
                <p className="font-medium text-text-primary">Sesión completada.</p>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink to={`/plan/${session.plan_id}`}>Volver al plan</ButtonLink>
                  <ButtonLink to="/inicio" variant="secondary">
                    Ir a Inicio
                  </ButtonLink>
                </div>
              </Card>
            ))}
        </PhaseEnter>
      </div>
      <AssistantPanel sessionId={session.id} mode={phase === "test" ? "EXAM" : "STUDY"} questionId={questionId} />
    </AssistantQuestionContext.Provider>
  );
}

function AdaptiveSessionFlow({
  session,
  lesson,
  updateError,
}: {
  session: SessionDetailDTO;
  lesson: LearningResponseV2;
  updateError: ReactNode;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const completed = session.status === "COMPLETED";
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    completed && searchParams.get("reintento") === "1" ? "stats" : initialPhase(searchParams.get("fase")),
  );
  const isReview = session.kind === "REVIEW";
  const reinforced = session.reinforcement_status === "READY";
  const showReviewPanel = isReview && session.status === "PENDING" && !reinforced;
  const badge = isReview ? (
    <>
      <Badge color="brand">Repaso</Badge>
      {reinforced && <Badge color="green">Con IA</Badge>}
    </>
  ) : undefined;
  const exit = (
    <ButtonLink to={`/plan/${session.plan_id}`} variant="ghost" aria-label="Salir de la sesión">
      <X aria-hidden="true" className="h-5 w-5" />
    </ButtonLink>
  );

  function openResult() {
    setPhase("stats");
    const next = new URLSearchParams(searchParams);
    next.set("fase", "resultado");
    next.delete("reintento");
    setSearchParams(next, { replace: true });
  }

  return (
    <AssistantQuestionContext.Provider value={setQuestionId}>
      <div className="space-y-4">
        {updateError}
        <PhaseEnter phase={phase}>
          {phase === "study" ? (
            <StudyPhase
              topic={session.topic_name}
              durationMinutes={session.duration_minutes}
              exit={exit}
              badge={badge}
              aside={showReviewPanel ? <ReviewPanel session={session} /> : undefined}
              startDisabledReason={
                session.reinforcement_status === "PROCESSING" ? "Esperando el refuerzo con IA" : undefined
              }
              onDone={() => setPhase("break")}
            >
              <LessonBlocks lesson={lesson} />
            </StudyPhase>
          ) : (
            <div className="flex items-center gap-2 pt-2">
              {exit}
              <Button type="button" variant="ghost" onClick={() => setPhase("study")}>
                Volver al material
              </Button>
            </div>
          )}

          {phase === "break" && <BreakPhase onDone={() => setPhase("test")} />}
          {(phase === "test" || phase === "stats") && (
            <AdaptiveAssessmentPhase
              session={session}
              lesson={lesson}
              showResult={phase === "stats" || completed}
              onOpenAssessment={() => setPhase("test")}
              onResult={openResult}
            />
          )}
        </PhaseEnter>
      </div>
      <AssistantPanel
        sessionId={session.id}
        mode={phase === "test" && !completed ? "EXAM" : "STUDY"}
        questionId={questionId}
      />
    </AssistantQuestionContext.Provider>
  );
}

function AdaptiveAssessmentPhase({
  session,
  lesson,
  showResult,
  onOpenAssessment,
  onResult,
}: {
  session: SessionDetailDTO;
  lesson: LearningResponseV2;
  showResult: boolean;
  onOpenAssessment: () => void;
  onResult: () => void;
}) {
  const assessment = useAdaptiveAssessment(session.id);
  const result = useAdaptiveAssessmentResult(session.id, showResult);
  const submit = useSubmitAdaptiveAssessment(session.id, session.plan_id);

  if (showResult && !result.data && axios.isAxiosError(result.error) && result.error.response?.status === 404) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Esta sesión aún no tiene resultado"
        description={session.status === "PENDING" ? "Entrega la evaluación para consultar el resultado." : undefined}
        action={session.status === "PENDING" ? (
          <Button type="button" onClick={onOpenAssessment}>Abrir evaluación</Button>
        ) : undefined}
      />
    );
  }

  const waiting = !assessment.data ? assessment : showResult && !result.data ? result : null;
  if (waiting?.isError) {
    if (axios.isAxiosError<{ code?: unknown }>(waiting.error) && waiting.error.response?.data?.code === "CONTENT_NOT_READY") {
      return (
        <AdaptiveContentNotReady session={session} updateError={null} onRetry={() => void waiting.refetch()} />
      );
    }
    return (
      <Alert tone="error" title={showResult ? "No se pudo cargar el resultado" : "No se pudo cargar la evaluación"}>
        <p>{getApiErrorMessage(waiting.error, "No se pudo consultar el contenido adaptativo.")}</p>
        <Button type="button" variant="secondary" onClick={() => void waiting.refetch()}>Reintentar</Button>
      </Alert>
    );
  }
  const published = assessment.data;
  const stored = showResult ? result.data : undefined;
  if (!published || (showResult && !stored)) {
    return <SessionSkeleton label={showResult ? "Cargando resultado…" : "Cargando evaluación adaptativa…"} />;
  }
  if (stored && stored.revision !== published.revision) {
    if (assessment.isFetching || result.isFetching) return <SessionSkeleton label="Cargando la revisión del resultado…" />;
    return (
      <Alert tone="warning" title="La evaluación y el resultado tienen revisiones distintas">
        <p>Vuelve a consultar la evaluación y el resultado guardado.</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void Promise.all([assessment.refetch(), result.refetch()])}
        >
          Reintentar resultado
        </Button>
      </Alert>
    );
  }

  return (
    <AdaptiveAssessment
      key={stored?.revision}
      assessment={published}
      initialResult={stored}
      objectives={lesson.snapshot.objectives}
      snapshot={lesson.snapshot}
      onSubmit={async (input) => {
        const saved = await submit.mutateAsync({ quizId: published.quiz_id, input });
        onResult();
        return saved;
      }}
      onReload={async () => {
        const refreshed = await assessment.refetch({ throwOnError: true });
        if (!refreshed.data) throw new Error("No se pudo recargar la evaluación.");
        return refreshed.data;
      }}
      onAlreadySubmitted={async () => {
        const stored = await result.refetch({ throwOnError: true });
        if (!stored.data) throw new Error("No se pudo cargar el resultado guardado.");
        onResult();
        return stored.data;
      }}
    />
  );
}

/** The latest submitted test of a completed session, question by question. */
function SessionStats({
  session,
  topic,
  onRestart,
}: {
  session: SessionDetailDTO;
  topic?: PlanTopicDTO;
  onRestart: () => void;
}) {
  const result = useSessionResult(session.id);
  const quiz = useQuiz(session.id);

  if (result.isError) {
    if (axios.isAxiosError(result.error) && result.error.response?.status === 404) {
      return (
        <EmptyState
          icon={BarChart3}
          title="Esta sesión aún no tiene resultado"
          description="Haz el test para ver aquí tus aciertos y fallos."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={onRestart}>Empezar sesión</Button>
              <ButtonLink to={`/plan/${session.plan_id}`} variant="secondary">Volver al plan</ButtonLink>
            </div>
          }
        />
      );
    }
    return (
      <Alert tone="error" title="No se pudieron cargar las estadísticas">
        <div>
          <Button type="button" variant="secondary" onClick={() => void result.refetch()}>
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }
  if (!result.data) return <SessionSkeleton label="Cargando estadísticas…" />;

  return (
    <div className="space-y-4">
      <SessionResult
        result={result.data}
        planId={session.plan_id}
        topic={topic}
        keywords={session.material?.youtube_keywords ?? []}
      />
      <div className="flex justify-center">
        <Button type="button" variant="secondary" onClick={onRestart}>
          Empezar sesión de nuevo
        </Button>
      </div>
      {quiz.data && <AnswerReview questions={quiz.data.questions} result={result.data} />}
    </div>
  );
}
