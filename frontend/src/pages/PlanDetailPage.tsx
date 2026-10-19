import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Coffee, Play } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { Link, useParams } from "react-router-dom";

import { getApiErrorMessage, isNotFoundError } from "../api/errors";
import type { PlanDTO } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { HelpTerm } from "../components/help/HelpTerm";
import { GenerationProgress } from "../components/plan/GenerationProgress";
import { SessionTimeline } from "../components/plan/SessionTimeline";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ProgressBar,
  Spinner,
  StepChain,
} from "../components/ui";
import { useLlmRuntime, usePlan, useResumePlan } from "../hooks/queries";
import { parsePositiveSafeRouteId } from "../lib/routeIds";
import { findNextSession, rankTopics } from "../lib/studyProgress";

export function PlanDetailPage() {
  const { planId } = useParams();
  const id = parsePositiveSafeRouteId(planId);
  const { data: plan, isLoading, isError, error, refetch } = usePlan(id);

  if (id === null) {
    return (
      <section className="space-y-4" aria-labelledby="invalid-plan-title">
        <h1 id="invalid-plan-title" className="text-2xl font-bold">Enlace al plan no válido</h1>
        <Alert tone="error">
          <p>Este enlace de plan no es válido.</p>
          <ButtonLink to="/plan" variant="secondary">Ir a los planes</ButtonLink>
        </Alert>
      </section>
    );
  }

  if (isError && isNotFoundError(error)) {
    return (
      <section className="space-y-4" aria-labelledby="plan-missing-title">
        <h1 id="plan-missing-title" className="text-2xl font-bold">Este plan ya no existe</h1>
        <Alert tone="info">
          <p>Puede que se haya eliminado junto con su meta. Tus otros planes siguen disponibles.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/plan" variant="secondary">Volver a los planes</ButtonLink>
            <Button type="button" variant="ghost" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        </Alert>
      </section>
    );
  }

  if (isError && !plan) {
    return (
      <section className="space-y-4" aria-labelledby="plan-load-error-title">
        <h1 id="plan-load-error-title" className="text-2xl font-bold">No se pudo abrir el plan</h1>
        <Alert tone="error">
          <p>El plan no está disponible. Comprueba la conexión o vuelve a la lista de planes.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void refetch()}>
              Reintentar
            </Button>
            <ButtonLink to="/plan" variant="ghost">Volver a los planes</ButtonLink>
          </div>
        </Alert>
      </section>
    );
  }

  if (isLoading || !plan) return <Spinner label="Cargando plan…" />;

  const updateError = isError ? (
    <Alert tone="error" title="No se pudo actualizar el plan">
      <p>Se mantienen visibles los datos que ya estaban cargados.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void refetch()}>
          Reintentar actualización
        </Button>
        <ButtonLink to="/plan" variant="ghost">Volver a los planes</ButtonLink>
      </div>
    </Alert>
  ) : null;

  if (plan.status === "PROCESSING") {
    return (
      <div className="space-y-4">
        {updateError}
        <BackToPlans />
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">{plan.title}</h1>
          <Badge color="amber">Generando</Badge>
        </div>
        <Card className="space-y-4">
          <GenerationProgress
            stage={plan.progress_stage ?? null}
            done={plan.progress_done ?? 0}
            total={plan.progress_total ?? 0}
          />
          <p className="text-sm text-text-muted">
            Suele tardar unos minutos. Esta página se actualiza sola; puedes salir y volver.
          </p>
        </Card>
      </div>
    );
  }

  if (plan.status === "FAILED") return <IncompletePlan plan={plan} updateError={updateError} />;

  const topics = rankTopics(plan.topics).filter((topic) => topic.selected);
  // Reviews are extra: they never change the "N of M" progress of the plan.
  const planned = plan.sessions.filter((session) => session.kind === "NEW");
  const completed = planned.filter((session) => session.status === "COMPLETED").length;
  const next = findNextSession([plan]);

  return (
    <div className="space-y-6">
      {updateError}
      <div className="space-y-2">
        <BackToPlans />
        <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">{plan.title}</h1>
        <p className="max-w-reading text-text-muted">
          La IA analizó tu material y organizó las sesiones alrededor de los temas que estimó más
          relevantes.
        </p>
        <Badge color="green">Listo · {planned.length} sesiones</Badge>
        <div className="pt-2">
          <StepChain
            label="Cómo es cada sesión"
            steps={[
              { label: "Estudio", detail: "Lees el material", icon: BookOpen },
              { label: "Receso", detail: "5 min", icon: Coffee },
              { label: "Test", detail: "Preguntas y tarjetas", icon: ClipboardCheck },
            ]}
          />
        </div>
      </div>

      <Card variant="elevated" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-text-muted">
              {completed} de {planned.length} sesiones completadas
            </p>
            {next ? (
              <p className="font-medium text-text-primary">Siguiente: {next.session.topic_name}</p>
            ) : (
              plan.sessions.length > 0 && (
                <p className="font-medium text-text-primary">Completaste todas las sesiones de este plan.</p>
              )
            )}
          </div>
          {next && (
            <ButtonLink to={`/session/${next.session.id}`} className="shrink-0 self-start sm:self-auto">
              <Play aria-hidden="true" className="h-4 w-4" />
              Comenzar siguiente sesión
            </ButtonLink>
          )}
        </div>
        <ProgressBar
          value={planned.length === 0 ? 0 : (completed / planned.length) * 100}
          label="Sesiones completadas del plan"
        />
      </Card>

      {plan.sessions.length === 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-text-primary">Sesiones</h2>
          <EmptyState
            icon={CalendarDays}
            title="Este plan no tiene sesiones"
            description="Puede pasar si el material era muy corto. Prueba a generar otro plan con más documentos."
            action={
              <ButtonLink to="/plan" variant="secondary">
                Volver a Plan de estudio
              </ButtonLink>
            }
          />
        </section>
      ) : (
        <SessionTimeline plan={plan} />
      )}

      <section aria-labelledby="priority-topics-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="priority-topics-title" className="font-display text-lg font-semibold text-text-primary">
            Temas prioritarios
          </h2>
          <Link
            to={`/temas?plan=${plan.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-action hover:underline"
          >
            Ver temas clave
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-sm text-text-muted">
          El porcentaje es la <HelpTerm term="relevancia">relevancia estimada</HelpTerm> de cada tema.
        </p>
        {topics.length === 0 ? (
          <p className="text-sm text-text-muted">Este plan no tiene temas priorizados.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li
                key={topic.id}
                className="rounded-full border border-line bg-action-subtle px-3 py-1 text-sm text-text-primary"
              >
                {topic.name}
                <span className="ml-2 text-xs text-text-muted">relevancia estimada {topic.relevancePercent}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A FAILED plan keeps what was generated; "Continuar generación" only asks for what is missing. */
function IncompletePlan({ plan, updateError }: { plan: PlanDTO; updateError: ReactNode }) {
  const runtime = useLlmRuntime();
  const resume = useResumePlan();
  const sending = useRef(false);
  const reasonId = useId();

  const noFreeUses = runtime.data?.bundled === true && runtime.data.free_ai?.remaining === 0;
  const selectedTopics = plan.topics.filter((topic) => topic.selected).length;
  const total = plan.progress_total ?? 0;
  const kept =
    total > 0
      ? `Se conservaron ${selectedTopics} temas y ${plan.progress_done ?? 0} de ${total} sesiones.`
      : plan.topics.length > 0
        ? `Se conservaron ${plan.topics.length} temas.`
        : null;

  function continueGeneration() {
    // A double click must not send two requests, even before the pending state re-renders.
    if (sending.current) return;
    sending.current = true;
    resume.mutate(plan.id, { onSettled: () => (sending.current = false) });
  }

  return (
    <div className="space-y-4">
      {updateError}
      <BackToPlans />
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">{plan.title}</h1>
        <Badge color="red">Incompleto</Badge>
      </div>
      <Alert tone="error" title="La generación quedó incompleta">
        {plan.error_message && (
          <pre className="whitespace-pre-wrap break-words rounded-control bg-canvas/60 p-3 text-xs text-text-primary">
            {plan.error_message}
          </pre>
        )}
        {kept && <p className="text-text-primary">{kept}</p>}
      </Alert>
      {resume.isError && (
        <Alert tone="error">{getApiErrorMessage(resume.error, "No se pudo continuar la generación.")}</Alert>
      )}
      <div className="space-y-2">
        <Button
          type="button"
          disabled={noFreeUses || resume.isPending}
          aria-describedby={noFreeUses ? reasonId : undefined}
          onClick={continueGeneration}
        >
          {resume.isPending ? "Continuando…" : "Continuar generación"}
        </Button>
        {noFreeUses && (
          <p id={reasonId} className="text-sm text-text-muted">
            Sin usos gratis hoy.{" "}
            <Link to="/settings" className="font-medium text-action hover:underline">
              Conectar IA
            </Link>
          </p>
        )}
      </div>
      <p className="text-sm text-text-muted">
        Si el error menciona un límite de solicitudes («rate limit») o una clave inválida, revisa tu proveedor en{" "}
        <Link className="underline" to="/settings">
          Conectar IA
        </Link>{" "}
        y continúa la generación. Si usas Ollama, comprueba que su servidor tenga OLLAMA_CONTEXT_LENGTH de al menos
        16384.
      </p>
    </div>
  );
}

function BackToPlans() {
  return (
    <Link to="/plan" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-action hover:underline">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Volver a los planes
    </Link>
  );
}
