import { useEffect } from "react";
import { Quote } from "lucide-react";
import { useLocation } from "react-router-dom";

import { AsyncState } from "../components/AsyncState";
import { HelpTerm } from "../components/help/HelpTerm";
import { GettingStarted } from "../components/home/GettingStarted";
import {
  AllSessionsDoneCard,
  ParetoFocusCard,
  ProgressOverviewCard,
  RecentPlans,
  TodaySessionCard,
} from "../components/home/HomeCards";
import { StudySetup } from "../components/home/StudySetup";
import { Card, Skeleton } from "../components/ui";
import { useDashboard, usePlans } from "../hooks/queries";
import { findNextSession, readyPlans, sessionProgress } from "../lib/studyProgress";

/**
 * Inicio: "what should I do next?" first. Returning learners see today's session,
 * progress and Pareto focus from real data; first-time learners get the setup flow.
 */
export function HomePage() {
  const plansQuery = usePlans();
  const dashboardQuery = useDashboard();
  const hasReadyPlan = readyPlans(plansQuery.data).length > 0;
  const { hash } = useLocation();

  // "/inicio#preparar-plan" (checklist, empty states) jumps to the setup flow. Deferred a
  // frame so it runs after AppShell moves focus to <main> on navigation.
  useEffect(() => {
    if (hash !== "#preparar-plan") return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("preparar-plan");
      target?.scrollIntoView?.({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="space-y-8">
      <header className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <p className="font-medium text-action-hover">¡Hola!</p>
          <h1 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">
            Tu camino de estudio de hoy
          </h1>
          <p className="max-w-reading text-text-muted">
            Enfócate en lo que realmente importa. La IA analiza tu material y te guía con los{" "}
            <HelpTerm term="temasClave">temas clave</HelpTerm>.
          </p>
        </div>
        <Card
          variant="glass"
          className="hidden max-w-xs items-start gap-2 !p-4 text-sm italic text-text-muted lg:flex"
        >
          <Quote aria-hidden="true" className="h-4 w-4 shrink-0 text-action-hover" />
          <p>Pequeños pasos constantes crean grandes resultados.</p>
        </Card>
      </header>

      <GettingStarted />

      <AsyncState
        data={plansQuery.data}
        isLoading={plansQuery.isPending}
        isError={plansQuery.isError}
        isFetching={plansQuery.isFetching}
        loading={<Skeleton height={220} />}
        loadingLabel="Cargando tu progreso"
        empty={null}
        onRetry={() => void plansQuery.refetch()}
        initialErrorMessage="No se pudieron cargar tus planes. Puedes preparar uno nuevo igualmente."
        updateErrorMessage="No se pudieron actualizar tus planes. Se muestran los últimos cargados."
      >
        {(plans) => {
          const ready = readyPlans(plans);
          if (ready.length === 0) {
            return plans.length > 0 ? <RecentPlans plans={plans} /> : null;
          }
          const next = findNextSession(plans);
          const focusPlan = next?.plan ?? ready[0];
          return (
            <div className="space-y-6">
              {next ? (
                <TodaySessionCard plan={next.plan} session={next.session} />
              ) : (
                <AllSessionsDoneCard plan={ready[0]} />
              )}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ProgressOverviewCard progress={sessionProgress(plans)} dashboard={dashboardQuery.data} />
                <ParetoFocusCard plan={focusPlan} />
              </div>
              <RecentPlans plans={plans} />
            </div>
          );
        }}
      </AsyncState>

      <section
        id="preparar-plan"
        tabIndex={-1}
        aria-label="Nuevo plan de estudio"
        className="scroll-mt-6 space-y-3"
      >
        {hasReadyPlan && (
          <h2 className="font-display text-lg font-semibold text-text-primary">¿Material nuevo?</h2>
        )}
        <StudySetup headingLevel={hasReadyPlan ? 3 : 2} />
      </section>
    </div>
  );
}
