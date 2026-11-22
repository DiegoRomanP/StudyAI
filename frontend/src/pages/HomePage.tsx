import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AsyncState } from "../components/AsyncState";
import {
  AllSessionsDoneCard,
  QuickActions,
  RecentPlans,
  StudyPulse,
  TodaySessionCard,
} from "../components/home/HomeCards";
import { StudySetup } from "../components/home/StudySetup";
import { useEnterAnimation } from "../components/motion/useEnterAnimation";
import { Button, Skeleton } from "../components/ui";
import { useDashboard, useGoals, usePlans } from "../hooks/queries";
import {
  dueReviewCount,
  examCountdown,
  findNextSession,
  readyPlans,
  sessionProgress,
} from "../lib/studyProgress";

/** Home-shaped placeholder: today card, quick actions row, strip and three plan cards. */
function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton height={183} />
      <Skeleton height={44} />
      <Skeleton height={72} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton height={96} />
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
    </div>
  );
}

function EnterReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnterAnimation(ref, "reveal");
  return <div ref={ref}>{children}</div>;
}

/**
 * Inicio: the starting point. Returning learners get today's session, quick actions
 * (new plan, new goal, upload, review) and a compact progress strip; the plan assistant
 * stays folded until asked for. First-time learners see only the assistant, open.
 */
export function HomePage() {
  const plansQuery = usePlans();
  const dashboardQuery = useDashboard();
  const goals = useGoals().data;
  const hasReadyPlan = readyPlans(plansQuery.data).length > 0;
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [openRequested, setOpenRequested] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  // While plans are pending nothing decides the assistant: no flash of it before today's card.
  // Latched: when the first plan turns ready the assistant stays so "¡Tu plan está listo!" is seen.
  const [firstRun, setFirstRun] = useState(false);
  if (!plansQuery.isPending && !hasReadyPlan && !firstRun) setFirstRun(true);
  const setupOpen = openRequested || firstRun;

  function openSetup() {
    setOpenRequested(true);
    setFocusRequest((n) => n + 1);
  }

  // "/inicio#preparar-plan" (empty states, goals, /plan) opens the assistant.
  useEffect(() => {
    if (hash === "#preparar-plan") openSetup();
  }, [hash]);

  // Deferred a frame so it runs after AppShell moves focus to <main> and the assistant has rendered.
  useEffect(() => {
    if (focusRequest === 0) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("preparar-plan");
      target?.scrollIntoView?.({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);

  function closeSetup() {
    setOpenRequested(false);
    setFirstRun(false);
    // Drop the hash so a later "#preparar-plan" link can open it again.
    navigate("/inicio", { replace: true });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-text-primary sm:text-4xl">
          Tu camino de estudio de hoy
        </h1>
      </header>

      <AsyncState
        data={plansQuery.data}
        isLoading={plansQuery.isPending}
        isError={plansQuery.isError}
        isFetching={plansQuery.isFetching}
        loading={<HomeSkeleton />}
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
          const examLabel = examCountdown(goals?.find((goal) => goal.id === focusPlan.goal_id)?.exam_date);
          return (
            <div className="space-y-6">
              {next ? (
                <TodaySessionCard plan={next.plan} session={next.session} examLabel={examLabel} />
              ) : (
                <AllSessionsDoneCard plan={ready[0]} onNewPlan={openSetup} />
              )}
              <QuickActions dueReviews={dueReviewCount(dashboardQuery.data)} onNewPlan={openSetup} />
              <StudyPulse
                progress={sessionProgress(plans)}
                dashboard={dashboardQuery.data}
                plan={focusPlan}
                examLabel={examLabel}
              />
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
          <h2 className="font-display text-lg font-semibold text-text-primary">Nuevo plan</h2>
        )}
        {setupOpen ? (
          <EnterReveal>
            <StudySetup headingLevel={hasReadyPlan ? 3 : 2} onClose={hasReadyPlan ? closeSetup : undefined} />
          </EnterReveal>
        ) : plansQuery.isPending ? null : (
          <Button type="button" variant="secondary" onClick={openSetup}>
            Preparar otro plan
          </Button>
        )}
      </section>
    </div>
  );
}
