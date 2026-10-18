import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { isNotFoundError } from "../api/errors";
import { SessionTimeline } from "../components/plan/SessionTimeline";
import {
  ActivityIndicator,
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  ProgressBar,
  Spinner,
} from "../components/ui";
import { usePlan } from "../hooks/queries";
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
          <p>El identificador del plan debe ser un entero decimal positivo y seguro.</p>
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
        <Card className="space-y-4 text-center">
          <h2 className="text-lg font-semibold">Generando tu plan…</h2>
          <div className="flex justify-center">
            <ActivityIndicator label="Generación en curso" />
          </div>
          <p className="text-sm text-text-muted">
            La IA está analizando temas, seleccionando lo más relevante (Pareto) y
            creando sesiones con material y quizzes. Esta página se actualiza sola; el servidor no
            informa un porcentaje de avance.
          </p>
        </Card>
      </div>
    );
  }

  if (plan.status === "FAILED") {
    return (
      <div className="space-y-4">
        {updateError}
        <BackToPlans />
        <h1 className="text-2xl font-bold">{plan.title}</h1>
        <Alert tone="error" title="La generación falló">
          {plan.error_message && (
            <pre className="whitespace-pre-wrap break-words rounded-control bg-canvas/60 p-3 text-xs text-text-primary">
              {plan.error_message}
            </pre>
          )}
          <p className="text-text-primary">
            Si el error menciona un límite de solicitudes («rate limit») o una clave inválida,
            revisa tu proveedor en{" "}
            <Link className="underline" to="/settings">
              Conectar IA
            </Link>{" "}
            e intenta generar el plan de nuevo desde{" "}
            <Link className="underline" to="/plan">
              Plan de estudio
            </Link>
            .
          </p>
        </Alert>
      </div>
    );
  }

  const topics = rankTopics(plan.topics).filter((topic) => topic.selected);
  const completed = plan.sessions.filter((session) => session.status === "COMPLETED").length;
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
        <Badge color="green">Listo · {plan.sessions.length} sesiones</Badge>
      </div>

      <Card variant="elevated" className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-text-muted">
              {completed} de {plan.sessions.length} sesiones completadas
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
          value={plan.sessions.length === 0 ? 0 : (completed / plan.sessions.length) * 100}
          label="Sesiones completadas del plan"
        />
      </Card>

      {plan.sessions.length === 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-text-primary">Sesiones</h2>
          <p className="text-sm text-text-muted">Este plan no tiene sesiones disponibles.</p>
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
            Ver análisis Pareto
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
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

function BackToPlans() {
  return (
    <Link to="/plan" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-action hover:underline">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Volver a los planes
    </Link>
  );
}
