import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/endpoints";
import type {
  LLMCredentialDTO,
  GoalCreate,
  GoalUpdate,
  LLMCredentialModelUpdate,
  LLMCredentialUpsert,
  LLMConnectionTest,
  LLMProviderKey,
  QuizAnswer,
} from "../api/types";

function replaceCachedLlmCredential(
  qc: ReturnType<typeof useQueryClient>,
  credential: LLMCredentialDTO,
) {
  const queryKey = ["llm-credentials"];
  if (!qc.getQueryData<LLMCredentialDTO[]>(queryKey)) {
    qc.invalidateQueries({ queryKey });
    return;
  }
  qc.setQueryData<LLMCredentialDTO[]>(queryKey, (credentials) => {
    if (!credentials) return credentials;
    const exists = credentials.some((item) => item.provider === credential.provider);
    return exists
      ? credentials.map((item) => (item.provider === credential.provider ? credential : item))
      : [...credentials, credential];
  });
}

function invalidateLlmRuntime(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["llm-runtime"] });
}

function invalidateLlmCredentialsOnConflict(
  qc: ReturnType<typeof useQueryClient>,
  error: unknown,
) {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
  if (response?.status === 409 || response?.data?.code === "LLM_AUTHENTICATION_FAILED") {
    qc.invalidateQueries({ queryKey: ["llm-credentials"] });
    invalidateLlmRuntime(qc);
  }
}

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

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteDocument(id),
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

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: GoalUpdate }) =>
      api.updateGoal(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteGoal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      // Deleting a goal cascades to its plans on the backend.
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
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

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deletePlan(id),
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

// --- LLM settings (bring-your-own-key) --------------------------------------
export function useProviderCatalog() {
  return useQuery({ queryKey: ["llm-provider-catalog"], queryFn: api.listProviderCatalog });
}

export function useLlmCredentials() {
  return useQuery({ queryKey: ["llm-credentials"], queryFn: api.listLlmCredentials });
}

export function useLlmRuntime() {
  return useQuery({ queryKey: ["llm-runtime"], queryFn: api.getLlmRuntime });
}

export function useSaveLlmCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, payload }: { provider: LLMProviderKey; payload: LLMCredentialUpsert }) =>
      api.saveLlmCredential(provider, payload),
    onSuccess: (credential) => {
      replaceCachedLlmCredential(qc, credential);
      invalidateLlmRuntime(qc);
    },
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
  });
}

export function useUpdateLlmCredentialModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      payload,
    }: {
      provider: LLMProviderKey;
      payload: LLMCredentialModelUpdate;
    }) => api.updateLlmCredentialModel(provider, payload),
    onSuccess: (credential) => {
      replaceCachedLlmCredential(qc, credential);
      invalidateLlmRuntime(qc);
    },
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
  });
}

export function useActivateLlmCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, expectedRevision }: { provider: LLMProviderKey; expectedRevision: number }) =>
      api.activateLlmCredential(provider, expectedRevision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-credentials"] });
      invalidateLlmRuntime(qc);
    },
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
  });
}

export function useDeactivateAllLlmCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deactivateAllLlmCredentials(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-credentials"] });
      invalidateLlmRuntime(qc);
    },
  });
}

export function useDeleteLlmCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: LLMProviderKey) => api.deleteLlmCredential(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["llm-credentials"] });
      invalidateLlmRuntime(qc);
    },
  });
}

export function useTestLlmCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, payload }: { provider: LLMProviderKey; payload: LLMConnectionTest }) =>
      api.testLlmCredential(provider, payload),
    onSuccess: ({ credential }) => {
      replaceCachedLlmCredential(qc, credential);
      invalidateLlmRuntime(qc);
    },
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
  });
}

export function useOllamaModels(enabled: boolean) {
  return useQuery({
    queryKey: ["ollama-models"],
    queryFn: api.listOllamaModels,
    enabled,
    retry: false,
  });
}
