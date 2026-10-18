import { useCallback, useState } from "react";

import { useDashboard, useDocuments, useGoals, useLlmRuntime, usePlans } from "./queries";
import { readFlag, writeFlag } from "../lib/onboardingStorage";
import { findNextSession, readyPlans } from "../lib/studyProgress";

export type OnboardingStepId = "material" | "meta" | "ia" | "plan" | "sesion";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  to: string;
}

const SETUP = "/inicio#preparar-plan";
export const DEMO_OK_FLAG = "demo-ok";

/**
 * "Primeros pasos" derived from real data (documents, goals, provider, plans, sessions).
 * `allDone` is also true once the first session is completed: at that point the learner
 * has walked the whole path, even if they kept the demo provider without saying so.
 */
export function useOnboardingProgress() {
  const documents = useDocuments();
  const goals = useGoals();
  const runtime = useLlmRuntime();
  const plans = usePlans();
  const dashboard = useDashboard();
  const [demoAccepted, setDemoAccepted] = useState(() => readFlag(DEMO_OK_FLAG) === "1");

  const acceptDemo = useCallback(() => {
    writeFlag(DEMO_OK_FLAG, "1");
    setDemoAccepted(true);
  }, []);

  const source = runtime.data?.source;
  const sessionDone =
    (plans.data ?? []).some((plan) => plan.sessions.some((session) => session.status === "COMPLETED")) ||
    (dashboard.data?.sessions_completed ?? 0) > 0;
  const next = findNextSession(plans.data);

  const steps: OnboardingStep[] = [
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
    },
    { id: "plan", label: "Genera tu plan", done: readyPlans(plans.data).length > 0, to: SETUP },
    {
      id: "sesion",
      label: "Completa tu primera sesión",
      done: sessionDone,
      to: next ? `/session/${next.session.id}` : "/plan",
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return {
    steps,
    completed,
    total: steps.length,
    allDone: completed === steps.length || sessionDone,
    isLoading:
      documents.isPending || goals.isPending || runtime.isPending || plans.isPending || dashboard.isPending,
    acceptDemo,
  };
}
