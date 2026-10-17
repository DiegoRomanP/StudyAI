import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import type { QuizResultDTO, SessionDetailDTO } from "../api/types";
import { QuizPhase } from "../components/session/QuizPhase";
import { SessionResult } from "../components/session/SessionResult";
import { BreakPhase, StudyPhase } from "../components/session/StudyPhase";
import { Alert, Badge, Button, ButtonLink, Card, Spinner } from "../components/ui";
import { useSession } from "../hooks/queries";
import { parsePositiveSafeRouteId } from "../lib/routeIds";

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
  const [phase, setPhase] = useState<Phase>("study");
  const [result, setResult] = useState<QuizResultDTO | null>(null);
  // Live from the server (a cached PENDING may refetch as COMPLETED); this visit's own
  // submission moves to the result, so it never asks to confirm itself.
  const alreadyCompleted = session.status === "COMPLETED";

  function handleSubmitted(confirmed: QuizResultDTO) {
    setResult(confirmed);
    setPhase("done");
  }

  return (
    <div className="space-y-6">
      {updateError}
      <div>
        <Link to={`/plan/${session.plan_id}`} className="text-sm text-action hover:underline">
          ← Volver al plan
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{session.topic_name}</h1>
        <PhaseIndicator phase={phase} />
      </div>

      {alreadyCompleted && phase !== "done" && (
        <Alert tone="info">
          <p>
            Ya completaste esta sesión
            {session.completed_at ? ` el ${formatDate(session.completed_at)}` : ""}. Puedes repasar
            el material; responder el test de nuevo registrará otro intento.
          </p>
        </Alert>
      )}

      {phase === "study" && (
        <StudyPhase
          durationMinutes={session.duration_minutes}
          markdown={session.material?.content_markdown ?? ""}
          keywords={session.material?.youtube_keywords ?? []}
          onDone={() => setPhase("break")}
        />
      )}
      {phase === "break" && <BreakPhase onDone={() => setPhase("test")} />}
      {phase === "test" && (
        <QuizPhase
          sessionId={session.id}
          planId={session.plan_id}
          alreadyCompleted={alreadyCompleted}
          onSubmitted={handleSubmitted}
        />
      )}
      {phase === "done" &&
        (result ? (
          <SessionResult result={result} planId={session.plan_id} />
        ) : (
          <Card>Sesión completada.</Card>
        ))}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

function PhaseIndicator({ phase }: { phase: Phase }) {
  const steps: { key: Phase; label: string }[] = [
    { key: "study", label: "Estudio" },
    { key: "break", label: "Receso" },
    { key: "test", label: "Test" },
  ];
  const order: Phase[] = ["study", "break", "test", "done"];
  return (
    <div className="mt-2 flex gap-2">
      {steps.map((step) => (
        <Badge key={step.key} color={order.indexOf(phase) >= order.indexOf(step.key) ? "brand" : "slate"}>
          {step.label}
        </Badge>
      ))}
    </div>
  );
}
