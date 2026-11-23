import { apiClient } from "./client";
import type {
  AdaptivePlanOptions,
  AppConfigDTO,
  AssistantAskDTO,
  AssistantAskInput,
  AssistantHistoryDTO,
  AssistantQuestionDTO,
  CreditBalanceDTO,
  CreditLedgerEntryDTO,
  DashboardDTO,
  DocumentDTO,
  GoalCreate,
  GoalDTO,
  GoalUpdate,
  LLMCredentialDTO,
  LLMCredentialModelUpdate,
  LLMCredentialUpsert,
  LLMConnectionTest,
  LLMConnectionTestResponse,
  LLMProviderKey,
  LLMRuntimeDTO,
  OllamaModel,
  PlanDTO,
  PlanStatusDTO,
  ProviderCatalogEntry,
  QuizAnswer,
  QuizDTO,
  QuizResultDTO,
  SessionDetailDTO,
} from "./types";

// Thin, typed wrappers around each backend endpoint.
export const api = {
  getAppConfig: () => apiClient.get<AppConfigDTO>("/config").then((r) => r.data),
  // Documents
  listDocuments: () =>
    apiClient.get<DocumentDTO[]>("/documents").then((r) => r.data),
  getDocument: (id: number) =>
    apiClient.get<DocumentDTO>(`/documents/${id}`).then((r) => r.data),
  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient
      .post<DocumentDTO>("/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  deleteDocument: (id: number) =>
    apiClient.delete<void>(`/documents/${id}`).then(() => undefined),

  // Goals
  listGoals: () => apiClient.get<GoalDTO[]>("/goals").then((r) => r.data),
  createGoal: (payload: GoalCreate) =>
    apiClient.post<GoalDTO>("/goals", payload).then((r) => r.data),
  updateGoal: (id: number, payload: GoalUpdate) =>
    apiClient.put<GoalDTO>(`/goals/${id}`, payload).then((r) => r.data),
  deleteGoal: (id: number) =>
    apiClient.delete<void>(`/goals/${id}`).then(() => undefined),
  archiveGoal: (id: number) => apiClient.post<GoalDTO>(`/goals/${id}/archive`).then((r) => r.data),
  unarchiveGoal: (id: number) => apiClient.post<GoalDTO>(`/goals/${id}/unarchive`).then((r) => r.data),

  // Credits (saas only)
  getCredits: () => apiClient.get<CreditBalanceDTO>("/account/credits").then((r) => r.data),
  getCreditHistory: (limit = 20) =>
    apiClient.get<CreditLedgerEntryDTO[]>("/account/credits/history", { params: { limit } }).then((r) => r.data),

  // Plans
  listPlans: () => apiClient.get<PlanDTO[]>("/plans").then((r) => r.data),
  /**
   * Same `idempotencyKey` + same payload replays the original plan (202); the same
   * key with another payload is a 409 `IDEMPOTENCY_KEY_REUSED`.
   */
  generatePlan: (
    goal_id: number,
    document_ids: number[],
    idempotencyKey?: string,
    pedagogy?: AdaptivePlanOptions,
  ) => {
    const payload = {
      goal_id,
      document_ids,
      ...(pedagogy
        ? { content_version: pedagogy.content_version, profile_hint: pedagogy.profile_hint ?? "auto" }
        : {}),
    };
    return apiClient
      .post<PlanStatusDTO>(
        "/plans/generate",
        payload,
        idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined,
      )
      .then((r) => r.data);
  },
  getPlanStatus: (id: number) =>
    apiClient.get<PlanStatusDTO>(`/plans/${id}/status`).then((r) => r.data),
  getPlan: (id: number) =>
    apiClient.get<PlanDTO>(`/plans/${id}`).then((r) => r.data),
  /** Generates only what a FAILED plan is missing (202; 409 if not resumable, 429 without free uses). */
  resumePlan: (id: number) =>
    apiClient.post<PlanStatusDTO>(`/plans/${id}/resume`).then((r) => r.data),
  deletePlan: (id: number) =>
    apiClient.delete<void>(`/plans/${id}`).then(() => undefined),

  // Sessions
  getSession: (id: number) =>
    apiClient.get<SessionDetailDTO>(`/sessions/${id}`).then((r) => r.data),
  getSessionResult: (id: number) =>
    apiClient.get<QuizResultDTO>(`/sessions/${id}/result`).then((r) => r.data),
  startReinforcement: (id: number) =>
    apiClient.post<SessionDetailDTO>(`/sessions/${id}/reinforcement`).then((r) => r.data),
  cancelReinforcement: (id: number) =>
    apiClient.post<SessionDetailDTO>(`/sessions/${id}/reinforcement/cancel`).then((r) => r.data),

  // Study assistant
  getAssistantHistory: (sessionId: number) =>
    apiClient.get<AssistantHistoryDTO>(`/sessions/${sessionId}/assistant`).then((r) => r.data),
  askAssistant: (sessionId: number, input: AssistantAskInput) =>
    apiClient.post<AssistantAskDTO>(`/sessions/${sessionId}/assistant`, input).then((r) => r.data),
  listAssistantQuestions: (planId?: number) =>
    apiClient
      .get<AssistantQuestionDTO[]>("/assistant/questions", { params: planId ? { plan_id: planId } : {} })
      .then((r) => r.data),

  // Quizzes
  getQuiz: (sessionId: number) =>
    apiClient.get<QuizDTO>(`/quizzes/${sessionId}`).then((r) => r.data),
  submitQuiz: (quizId: number, answers: QuizAnswer[]) =>
    apiClient
      .post<QuizResultDTO>(`/quizzes/${quizId}/submit`, { answers })
      .then((r) => r.data),

  // Dashboard
  getDashboard: () =>
    apiClient.get<DashboardDTO>("/dashboard").then((r) => r.data),

  // LLM settings (bring-your-own-key)
  listProviderCatalog: () =>
    apiClient.get<ProviderCatalogEntry[]>("/llm-settings/catalog").then((r) => r.data),
  listLlmCredentials: () =>
    apiClient.get<LLMCredentialDTO[]>("/llm-settings").then((r) => r.data),
  getLlmRuntime: () =>
    apiClient.get<LLMRuntimeDTO>("/llm-settings/runtime").then((r) => r.data),
  saveLlmCredential: (provider: LLMProviderKey, payload: LLMCredentialUpsert) =>
    apiClient
      .put<LLMCredentialDTO>(`/llm-settings/${provider}`, payload)
      .then((r) => r.data),
  updateLlmCredentialModel: (provider: LLMProviderKey, payload: LLMCredentialModelUpdate) =>
    apiClient
      .patch<LLMCredentialDTO>(`/llm-settings/${provider}/model`, payload)
      .then((r) => r.data),
  activateLlmCredential: (provider: LLMProviderKey, expected_revision: number) =>
    apiClient
      .post<LLMCredentialDTO>(`/llm-settings/${provider}/activate`, { expected_revision })
      .then((r) => r.data),
  deactivateAllLlmCredentials: () =>
    apiClient.post<void>("/llm-settings/deactivate-all").then(() => undefined),
  deleteLlmCredential: (provider: LLMProviderKey) =>
    apiClient.delete<void>(`/llm-settings/${provider}`).then(() => undefined),
  testLlmCredential: (provider: LLMProviderKey, payload: LLMConnectionTest) =>
    apiClient
      .post<LLMConnectionTestResponse>(`/llm-settings/${provider}/test`, payload)
      .then((r) => r.data),
  listProviderModels: (provider: LLMProviderKey) =>
    apiClient.get<OllamaModel[]>(`/llm-settings/${provider}/models`).then((r) => r.data),
};
