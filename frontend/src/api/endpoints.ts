import { apiClient } from "./client";
import type {
  DashboardDTO,
  DocumentDTO,
  GoalCreate,
  GoalDTO,
  PlanDTO,
  PlanStatusDTO,
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

  // Goals
  listGoals: () => apiClient.get<GoalDTO[]>("/goals").then((r) => r.data),
  createGoal: (payload: GoalCreate) =>
    apiClient.post<GoalDTO>("/goals", payload).then((r) => r.data),

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
};
