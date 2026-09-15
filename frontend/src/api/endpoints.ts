import { apiClient } from "./client";
import type {
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

  // Plans
  listPlans: () => apiClient.get<PlanDTO[]>("/plans").then((r) => r.data),
  generatePlan: (goal_id: number, document_ids: number[]) =>
    apiClient
      .post<PlanStatusDTO>("/plans/generate", { goal_id, document_ids })
      .then((r) => r.data),
  getPlanStatus: (id: number) =>
    apiClient.get<PlanStatusDTO>(`/plans/${id}/status`).then((r) => r.data),
  getPlan: (id: number) =>
    apiClient.get<PlanDTO>(`/plans/${id}`).then((r) => r.data),
  deletePlan: (id: number) =>
    apiClient.delete<void>(`/plans/${id}`).then(() => undefined),

  // Sessions
  getSession: (id: number) =>
    apiClient.get<SessionDetailDTO>(`/sessions/${id}`).then((r) => r.data),

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
  listOllamaModels: () =>
    apiClient.get<OllamaModel[]>("/llm-settings/OLLAMA/models").then((r) => r.data),
};
