// Shared API types mirroring the backend Pydantic schemas.

export type DocumentStatus = "PENDING" | "INDEXED" | "FAILED";
export type GoalType = "EXAM" | "LEARNING" | "MEMORIZATION";
export type PlanStatus = "PROCESSING" | "READY" | "FAILED";
export type QuestionType = "FLASHCARD" | "MULTIPLE_CHOICE";

export interface DocumentDTO {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  status: DocumentStatus;
  error_message: string;
  created_at: string;
}

export interface GoalDTO {
  id: number;
  goal_type: GoalType;
  title: string;
  description: string;
  created_at: string;
}

export interface GoalCreate {
  goal_type: GoalType;
  title: string;
  description: string;
}

export interface GoalUpdate {
  goal_type?: GoalType;
  title?: string;
  description?: string;
}

export interface PlanTopicDTO {
  id: number;
  name: string;
  subtopics: string[];
  difficulty: number;
  relevance: number;
  selected: boolean;
}

export interface SessionSummaryDTO {
  id: number;
  order_index: number;
  topic_name: string;
  duration_minutes: number;
  review_offset_days: number;
  status: string;
}

export interface PlanStatusDTO {
  id: number;
  status: PlanStatus;
  error_message: string;
}

export interface PlanDTO {
  id: number;
  title: string;
  status: PlanStatus;
  goal_id: number;
  document_ids: number[];
  created_at: string;
  error_message: string;
  topics: PlanTopicDTO[];
  sessions: SessionSummaryDTO[];
}

export interface SessionMaterialDTO {
  content_markdown: string;
  youtube_keywords: string[];
}

export interface SessionDetailDTO {
  id: number;
  plan_id: number;
  order_index: number;
  topic_name: string;
  duration_minutes: number;
  review_offset_days: number;
  status: string;
  completed_at: string | null;
  material: SessionMaterialDTO | null;
}

export interface QuizQuestionDTO {
  id: number;
  order_index: number;
  question_type: QuestionType;
  prompt: string;
  options: string[];
  answer: string;
}

export interface QuizDTO {
  id: number;
  session_id: number;
  questions: QuizQuestionDTO[];
}

export interface QuizAnswer {
  question_id: number;
  selected_option?: string | null;
  quality?: number | null;
}

export interface QuizResultDTO {
  score: number;
  correct: number;
  total: number;
  detail: Record<string, unknown>;
}

export interface DashboardDTO {
  scores: { session_id: number; topic_name: string; score: number; completed_at: string | null }[];
  weak_topics: { topic_name: string; score: number }[];
  upcoming_reviews: { next_review_date: string; count: number }[];
  sessions_completed: number;
  average_score: number;
}

// --- LLM settings (bring-your-own-key) -------------------------------------

export type LLMProviderKey =
  | "ANTHROPIC"
  | "OPENAI"
  | "GLM"
  | "OPENROUTER"
  | "NVIDIA"
  | "HUGGINGFACE"
  | "OLLAMA";

export interface ModelOption {
  id: string;
  free: boolean;
}

export interface ProviderCatalogEntry {
  provider: LLMProviderKey;
  label: string;
  requires_model_selection: boolean;
  default_model: string;
  default_base_url: string | null;
  // Always ordered free models first, then cheapest-to-priciest.
  common_models: ModelOption[];
  key_placeholder: string;
  requires_api_key: boolean;
  supports_model_discovery: boolean;
}

export interface LLMCredentialDTO {
  provider: LLMProviderKey;
  label: string;
  masked_api_key: string;
  model: string;
  base_url: string;
  is_active: boolean;
  config_revision: number;
  is_verified: boolean;
  verified_at: string | null;
  requires_model_selection: boolean;
  requires_api_key: boolean;
  supports_model_discovery: boolean;
  created_at: string;
}

export interface LLMCredentialUpsert {
  api_key?: string;
  base_url?: string;
}

export interface LLMCredentialModelUpdate {
  model: string;
  base_url?: string;
  expected_revision: number;
}

export interface LLMConnectionTest {
  expected_revision: number;
}

export interface LLMConnectionTestResponse {
  ok: boolean;
  credential: LLMCredentialDTO;
}

export interface OllamaModel {
  id: string;
  size_bytes: number | null;
  parameter_size: string | null;
  context_length: number | null;
}
