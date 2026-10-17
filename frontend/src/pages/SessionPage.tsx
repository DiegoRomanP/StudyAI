import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import type { QuizResultDTO, SessionDetailDTO } from "../api/types";
import { QuizPhase } from "../components/session/QuizPhase";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import { SessionResult } from "../components/session/SessionResult";
import { BreakPhase, StudyPhase } from "../components/session/StudyPhase";
import { Alert, Badge, Button, ButtonLink, Card, Spinner } from "../components/ui";
import { useSession } from "../hooks/queries";
import { parsePositiveSafeRouteId } from "../lib/routeIds";
import { parseApiDate } from "../lib/studyProgress";

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

  function handleSubmitted(confirmed: QuizResultDTO) {
    setResult(confirmed);
    setPhase("done");
  }

  return (
    <div className="space-y-6">
      {updateError}
      <div>
        <Link
          to={`/plan/${session.plan_id}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-action hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver al plan
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{session.topic_name}</h1>
        <PhaseIndicator phase={phase} />
        {phase === "test" && (
          <Button type="button" variant="ghost" className="mt-2" aria-pressed={reviewing} onClick={() => setReviewing((current) => !current)}>
            {reviewing ? "Volver al test" : "Repasar el material"}
          </Button>
        )}
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
      {phase === "test" && reviewing && (
        <Card>
          <div className="prose-study mx-auto max-w-reading">
            <SafeMarkdown>{session.material?.content_markdown || "_Sin material._"}</SafeMarkdown>
          </div>
        </Card>
      )}
      {phase === "test" && (
        <div hidden={reviewing}>
          <QuizPhase
            sessionId={session.id}
            planId={session.plan_id}
            alreadyCompleted={alreadyCompleted}
            onSubmitted={handleSubmitted}
          />
        </div>
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
  const date = parseApiDate(value);
  return !date
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
