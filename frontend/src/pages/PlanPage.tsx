import { useState } from "react";
import { CalendarDays, ChevronRight, Trash2 } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/errors";
import type { PlanDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { PageHeader, Badge, Button, ButtonLink, Card, Skeleton } from "../components/ui";
import { useDeletePlan, usePlans } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";
import { sessionProgress } from "../lib/studyProgress";

const STATUS = {
  PROCESSING: { label: "Generando", color: "amber" },
  FAILED: { label: "Incompleto", color: "red" },
} as const;

export function PlanPage() {
  const plansQuery = usePlans();
  const plans = plansQuery.data;
  const { visible, hiddenCount, expanded, showMore, showLess } = useShowMore(plans);
  const [searchParams] = useSearchParams();
  const requestedGoal = Number(searchParams.get("meta"));

  // Old "/plan?meta=ID" links now live in the assistant on Inicio.
  if (requestedGoal > 0) return <Navigate replace to={`/inicio?meta=${requestedGoal}#preparar-plan`} />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Plan de estudio"
        help="plan"
        actions={
          <ButtonLink to="/inicio#preparar-plan" variant="secondary">
            + Nuevo plan
          </ButtonLink>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tus planes</h2>
        <AsyncState
          data={plans}
          isLoading={plansQuery.isPending}
          isError={plansQuery.isError}
          isFetching={plansQuery.isFetching}
          isEmpty={(items) => items.length === 0}
          loading={
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} />
              ))}
            </div>
          }
          loadingLabel="Cargando planes"
          empty={
            <EmptyState
              icon={CalendarDays}
              title="Aún no tienes planes"
              description="Un plan reparte tu material en sesiones cortas con repasos programados."
              action={<ButtonLink to="/inicio#preparar-plan">Preparar mi primer plan</ButtonLink>}
            />
          }
          onRetry={() => void plansQuery.refetch()}
          initialErrorMessage="No se pudieron cargar tus planes."
          updateErrorMessage="No se pudieron actualizar tus planes. Se muestran los últimos cargados."
        >
          {(items) => (
            <>
              <div className="grid gap-3">
                {visible.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </div>
              {hiddenCount > 0 && (
                <Button variant="secondary" onClick={showMore}>
                  Mostrar {hiddenCount} más
                </Button>
              )}
              {expanded && items.length > 6 && (
                <Button variant="ghost" onClick={showLess}>
                  Mostrar menos
                </Button>
              )}
            </>
          )}
        </AsyncState>
      </section>
    </div>
  );
}

function PlanRow({ plan }: { plan: PlanDTO }) {
  const deletePlan = useDeletePlan();
  const [error, setError] = useState<string | null>(null);
  const meta = plan.status === "READY" ? null : STATUS[plan.status];
  // Reviews are extra sessions: they never count as plan progress.
  const progress = sessionProgress([plan]);

  async function handleDelete() {
    if (
      !window.confirm(`¿Eliminar el plan "${plan.title}"? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setError(null);
    try {
      await deletePlan.mutateAsync(plan.id);
    } catch (caught: unknown) {
      setError(getApiErrorMessage(caught, "Error al eliminar el plan."));
    }
  }

  const ratio = progress.total > 0 ? progress.completed / progress.total : 0;
  const circ = 2 * Math.PI * 9;

  return (
    <Card className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <Link to={`/plan/${plan.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-text-primary hover:text-action">{plan.title}</p>
            {plan.status !== "READY" && (
              <p className="text-xs text-text-muted">
                {plan.status === "PROCESSING" ? "Generando…" : "Continuar generación"}
              </p>
            )}
          </div>
          {plan.status === "READY" && (
            <span className="flex shrink-0 items-center gap-2 text-sm text-text-muted">
              <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="rgb(var(--color-surface-muted))" strokeWidth="3" />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="#5178FF"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - ratio)}
                />
              </svg>
              <span aria-hidden="true">
                {progress.completed}/{progress.total}
              </span>
              <span className="sr-only">
                {progress.completed} de {progress.total} sesiones completadas
              </span>
            </span>
          )}
          {meta && <Badge color={meta.color}>{meta.label}</Badge>}
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
        </Link>
        <Button
          variant="ghost"
          aria-label={`Eliminar «${plan.title}»`}
          className="hover:!bg-state-error-subtle hover:!text-state-error"
          onClick={handleDelete}
          disabled={deletePlan.isPending}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-state-error">{error}</p>}
    </Card>
  );
}
