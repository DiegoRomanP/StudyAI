import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import type { QuizResultDTO, SessionDetailDTO } from "../api/types";
import { QuizPhase } from "../components/session/QuizPhase";
import { ReviewPanel, ReviewPoints } from "../components/session/ReviewPanel";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import { SessionResult } from "../components/session/SessionResult";
import { BreakPhase, StudyPhase } from "../components/session/StudyPhase";
import { Alert, Badge, Button, ButtonLink, Card, Spinner } from "../components/ui";
import { usePlan, useSession } from "../hooks/queries";
import { parsePositiveSafeRouteId } from "../lib/routeIds";
import { routeOrder, toDateKey } from "../lib/studyProgress";

type Phase = "study" | "break" | "test" | "done";

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

  if (isLoading || !session) return <Spinner label="Cargando sesión…" />;

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

function SessionFlow({
  session,
  updateError,
}: {
  session: SessionDetailDTO;
  updateError: ReactNode;
}) {
  // Práctica → Simulacro opens the test directly (`?fase=test`); the material stays one click back.
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>(() => (searchParams.get("fase") === "test" ? "test" : "study"));
  const [result, setResult] = useState<QuizResultDTO | null>(null);
  // Reading the material during the test keeps QuizPhase mounted (answers, retake consent).
  const [reviewing, setReviewing] = useState(false);
  // Live from the server (a cached PENDING may refetch as COMPLETED); this visit's own
  // submission moves to the result, so it never asks to confirm itself.
  const alreadyCompleted = session.status === "COMPLETED";
  // Only read once the exam is done; the plan (topic mastery, route) was just refreshed.
  const plan = usePlan(phase === "done" ? session.plan_id : null).data;
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
    <div className="space-y-4">
      {updateError}

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
            onSubmitted={handleSubmitted}
          />
        </div>
      )}
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
    </div>
  );
}
