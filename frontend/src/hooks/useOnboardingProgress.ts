import { useDemoAccepted } from "./useDemoAccepted";
import { useDashboard, useDocuments, useGoals, useLlmRuntime, usePlans } from "./queries";
import { findNextSession, readyPlans } from "../lib/studyProgress";

export type OnboardingStepId = "material" | "meta" | "ia" | "plan" | "sesion";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  to: string;
  /** Optional steps never hold back the ones after them. */
  optional?: boolean;
  /** Not reachable yet: an earlier required step is still pending. */
  locked: boolean;
}

const SETUP = "/inicio#preparar-plan";

/**
 * "Primeros pasos" derived from real data (documents, goals, provider, plans, sessions).
 * Steps unlock in order: a pending step opens once the previous required step is done
 * (the optional AI step never holds back the next one), or as soon as any later step is
 * done, since real progress proves the path was walked. `allDone` is also true once the first session is completed: at that point the learner
 * has walked the whole path, even if they kept the demo provider without saying so.
 */
export function useOnboardingProgress() {
  const documents = useDocuments();
  const goals = useGoals();
  const runtime = useLlmRuntime();
  const plans = usePlans();
  const dashboard = useDashboard();
  const { accepted: demoAccepted, accept: acceptDemo } = useDemoAccepted();

  const source = runtime.data?.source;
  const sessionDone =
    (plans.data ?? []).some((plan) => plan.sessions.some((session) => session.status === "COMPLETED")) ||
    (dashboard.data?.sessions_completed ?? 0) > 0;
  const next = findNextSession(plans.data);

  const baseSteps: Omit<OnboardingStep, "locked">[] = [
    {
      id: "material",
      label: "Sube tu material",
      done: (documents.data ?? []).some((document) => document.status === "INDEXED"),
      to: SETUP,
    },
    { id: "meta", label: "Define tu meta", done: (goals.data ?? []).length > 0, to: SETUP },
    {
      id: "ia",
      label: "Conecta tu IA (opcional)",
      done: source === "USER" || source === "ENV" || demoAccepted,
      to: "/settings",
      optional: true,
    },
    { id: "plan", label: "Genera tu plan", done: readyPlans(plans.data).length > 0, to: SETUP },
    {
      id: "sesion",
      label: "Completa tu primera sesión",
      done: sessionDone,
      to: next ? `/session/${next.session.id}` : "/plan",
    },
  ];
  const lastDone = baseSteps.reduce((last, step, index) => (step.done ? index : last), -1);
  const steps: OnboardingStep[] = baseSteps.map((step, index) => {
    const before = baseSteps.slice(0, index).filter((prev) => !prev.optional);
    const previous = before[before.length - 1];
    return { ...step, locked: !step.done && index > lastDone && previous !== undefined && !previous.done };
  });
  const nextId = steps.find((step) => !step.done && !step.locked && !step.optional)?.id;
  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    nextId,
    completed,
    total: steps.length,
    allDone: completed === steps.length || sessionDone,
    isLoading:
      documents.isPending || goals.isPending || runtime.isPending || plans.isPending || dashboard.isPending,
    acceptDemo,
  };
}
