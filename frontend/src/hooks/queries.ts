import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { api } from "../api/endpoints";
import { isNotFoundError } from "../api/errors";
import type {
  DocumentDTO,
  LLMCredentialDTO,
  GoalCreate,
  GoalUpdate,
  LLMCredentialModelUpdate,
  LLMCredentialUpsert,
  LLMConnectionTest,
  LLMProviderKey,
  PlanDTO,
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
  // 409: concurrent change; 404: another tab deleted the configuration.
  if (
    response?.status === 409 ||
    response?.status === 404 ||
    response?.data?.code === "LLM_AUTHENTICATION_FAILED"
  ) {
    qc.invalidateQueries({ queryKey: ["llm-credentials"] });
    invalidateLlmRuntime(qc);
  }
}

// --- Documents -------------------------------------------------------------
export const DOCUMENTS_QUERY_KEY = ["documents"] as const;

export interface DocumentListCache {
  documents: DocumentDTO[];
  source: "GET" | "POST";
  revision: number;
}

export function getDocumentsListSnapshot(queryClient: QueryClient) {
  const query = queryClient.getQueryState<DocumentListCache>(DOCUMENTS_QUERY_KEY);
  const cachedList = query?.data;

  return {
    documents: cachedList?.documents,
    isConfirmedByGet: query?.status === "success" && cachedList?.source === "GET",
  };
}

function mergeDocumentLists(
  fetchedDocuments: DocumentDTO[],
  newerDocuments: DocumentDTO[],
) {
  const documentsById = new Map(fetchedDocuments.map((document) => [document.id, document]));
  for (const document of newerDocuments) {
    documentsById.set(document.id, document);
  }
  return [...documentsById.values()];
}

export function useDocuments() {
  return useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: async ({ client }) => {
      const revisionAtFetchStart =
        client.getQueryData<DocumentListCache>(DOCUMENTS_QUERY_KEY)?.revision ?? 0;
      const documents = await api.listDocuments();
      const latestCache = client.getQueryData<DocumentListCache>(DOCUMENTS_QUERY_KEY);

      // Keep useful rows from a stale GET, but do not let it confirm the newer POST seed.
      if (latestCache && latestCache.revision !== revisionAtFetchStart) {
        return {
          ...latestCache,
          documents: mergeDocumentLists(documents, latestCache.documents),
        };
      }

      return { documents, source: "GET" as const, revision: revisionAtFetchStart };
    },
    select: (snapshot) => snapshot.documents,
    // While anything is still indexing, keep refreshing so the UI updates.
    refetchInterval: (query) =>
      (query.state.data?.documents ?? []).some((d) => d.status === "PENDING") ? 2000 : false,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: (uploadedDocument) => {
      const cachedList = qc.getQueryData<DocumentListCache>(DOCUMENTS_QUERY_KEY);
      const documents = cachedList?.documents ?? [];
      const existingIndex = documents.findIndex(
        (document) => document.id === uploadedDocument.id,
      );
      const nextDocuments =
        existingIndex === -1
          ? [...documents, uploadedDocument]
          : documents.map((document) =>
              document.id === uploadedDocument.id ? uploadedDocument : document,
            );

      qc.setQueryData<DocumentListCache>(DOCUMENTS_QUERY_KEY, {
        documents: nextDocuments,
        source: "POST",
        revision: (cachedList?.revision ?? 0) + 1,
      });
      return qc.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteDocument(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }),
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
      // Deleting a goal cascades to its plans (and their results/reviews) on the backend.
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
    mutationFn: ({
      goalId,
      documentIds,
      idempotencyKey,
    }: {
      goalId: number;
      documentIds: number[];
      /** Reuse the same key when retrying the same logical request. */
      idempotencyKey?: string;
    }) => api.generatePlan(goalId, documentIds, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deletePlan(id),
    onSuccess: (_, id) => {
      // Its sessions and quizzes no longer exist either: never reopen them from cache.
      const cachedSessions = [
        ...(qc.getQueryData<PlanDTO>(["plan", id])?.sessions ?? []),
        ...(qc.getQueryData<PlanDTO[]>(["plans"])?.find((plan) => plan.id === id)?.sessions ?? []),
      ];
      for (const session of cachedSessions) {
        qc.removeQueries({ queryKey: ["session", session.id] });
        qc.removeQueries({ queryKey: ["quiz", session.id] });
      }
      qc.removeQueries({ queryKey: ["plan", id] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      // The plan's quiz results and flashcard reviews are deleted with it.
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** Fetch a plan and poll every 3s while it is still PROCESSING. */
export function usePlan(planId: number | null) {
  return useQuery({
    queryKey: ["plan", planId],
    queryFn: () => api.getPlan(planId as number),
    enabled: planId != null,
    refetchInterval: (query) =>
      query.state.data?.status === "PROCESSING" && !isNotFoundError(query.state.error) ? 3000 : false,
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
    mutationFn: ({
      quizId,
      answers,
    }: {
      quizId: number;
      sessionId: number;
      answers: QuizAnswer[];
    }) => api.submitQuiz(quizId, answers),
    onSuccess: (_, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
    // The variables carry the plaintext key: never keep a finished save in the mutation cache.
    gcTime: 0,
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
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
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
    onError: (error) => invalidateLlmCredentialsOnConflict(qc, error),
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

/** Installed models for a provider whose catalog entry supports model discovery. */
export function useProviderModels(provider: LLMProviderKey, enabled: boolean) {
  return useQuery({
    queryKey: ["llm-provider-models", provider],
    queryFn: () => api.listProviderModels(provider),
    enabled,
    retry: false,
  });
}
