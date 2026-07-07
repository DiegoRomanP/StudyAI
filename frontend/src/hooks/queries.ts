import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/endpoints";
import type { GoalCreate, QuizAnswer } from "../api/types";

// --- Documents -------------------------------------------------------------
export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
    // While anything is still indexing, keep refreshing so the UI updates.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((d) => d.status === "PENDING") ? 2000 : false,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

// --- Goals -----------------------------------------------------------------
export function useGoals() {
  return useQuery({ queryKey: ["goals"], queryFn: api.listGoals });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GoalCreate) => api.createGoal(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

// --- Plans -----------------------------------------------------------------
export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: api.listPlans });
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, documentIds }: { goalId: number; documentIds: number[] }) =>
      api.generatePlan(goalId, documentIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

/** Fetch a plan and poll every 3s while it is still PROCESSING. */
export function usePlan(planId: number | null) {
  return useQuery({
    queryKey: ["plan", planId],
    queryFn: () => api.getPlan(planId as number),
    enabled: planId != null,
    refetchInterval: (query) =>
      query.state.data?.status === "PROCESSING" ? 3000 : false,
  });
}

// --- Sessions & Quizzes ----------------------------------------------------
export function useSession(sessionId: number | null) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId as number),
    enabled: sessionId != null,
  });
}

export function useQuiz(sessionId: number | null) {
  return useQuery({
    queryKey: ["quiz", sessionId],
    queryFn: () => api.getQuiz(sessionId as number),
    enabled: sessionId != null,
  });
}

export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quizId, answers }: { quizId: number; answers: QuizAnswer[] }) =>
      api.submitQuiz(quizId, answers),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}

// --- Dashboard -------------------------------------------------------------
export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: api.getDashboard });
}
