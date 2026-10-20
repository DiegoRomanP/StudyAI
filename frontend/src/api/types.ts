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

export type SessionKind = "NEW" | "REVIEW";
export type ReinforcementStatus = "NONE" | "PROCESSING" | "READY" | "FAILED";
export type MasteryState = "SIN_DATOS" | "REFORZAR" | "EN_PROGRESO" | "DOMINADO";

export interface ReviewPoint {
  prompt: string;
  answer: string;
}

export interface PlanTopicDTO {
  id: number;
  name: string;
  subtopics: string[];
  difficulty: number;
  relevance: number;
  selected: boolean;
  mastery: number | null;
  review_box: number;
  mastery_state: MasteryState;
  priority: number;
}

export type SessionStatus = "PENDING" | "COMPLETED";

export interface SessionSummaryDTO {
  id: number;
  order_index: number;
  topic_name: string;
  duration_minutes: number;
  review_offset_days: number;
  status: SessionStatus;
  kind: SessionKind;
  topic_id: number | null;
  /** `YYYY-MM-DD`; null on sessions created before the adaptive route. */
  scheduled_date: string | null;
  reinforcement_status: ReinforcementStatus;
  /** Latest submitted test; null when the test was never sent. Only in `PlanDTO.sessions`. */
  last_result?: LastResultSummaryDTO | null;
}

export interface LastResultSummaryDTO {
  score: number;
  correct: number;
  /** Multiple-choice questions answered; 0 when the test only had flashcards. */
  total: number;
  /** Naive UTC; parse with `parseApiDate`. */
  created_at: string;
}

export type GenerationStage = "TOPICS" | "SESSIONS" | "CONTENT";

export interface PlanStatusDTO {
  id: number;
  status: PlanStatus;
  error_message: string;
  progress_stage?: GenerationStage | null;
  progress_done?: number;
  progress_total?: number;
}

export interface PlanDTO {
  id: number;
  title: string;
  status: PlanStatus;
  goal_id: number;
  document_ids: number[];
  created_at: string;
  error_message: string;
  progress_stage?: GenerationStage | null;
  progress_done?: number;
  progress_total?: number;
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
  status: SessionStatus;
  completed_at: string | null;
  material: SessionMaterialDTO | null;
  kind: SessionKind;
  topic_id: number | null;
  scheduled_date: string | null;
  review_points: ReviewPoint[];
  reinforcement_status: ReinforcementStatus;
  reinforcement_error: string;
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

export type QuizResultDetail =
  | { type: "multiple_choice"; correct: boolean; selected: string | null; expected: string }
  | { type: "flashcard"; quality: number };

export interface QuizResultDTO {
  /** Percentage of correct multiple-choice answers; meaningless when `total` is 0. */
  score: number;
  correct: number;
  /** Multiple-choice questions answered; flashcards are rated for SM-2, not graded. */
  total: number;
  detail: Record<string, QuizResultDetail>;
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
  | "DEEPSEEK"
  | "OPENROUTER"
  | "NVIDIA"
  | "OLLAMA"
  | "GEMINI";

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
  supports_custom_base_url: boolean;
  allows_custom_model: boolean;
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
  supports_custom_base_url: boolean;
  allows_custom_model: boolean;
  created_at: string;
}

export interface LLMCredentialUpsert {
  api_key?: string;
  base_url?: string;
}

export interface LLMCredentialModelUpdate {
  model: string;
  base_url?: string | null;
  expected_revision: number;
}

export interface LLMConnectionTest {
  expected_revision: number;
}

export interface LLMConnectionTestResponse {
  ok: boolean;
  credential: LLMCredentialDTO;
}

export type LLMRuntimeSource = "USER" | "ENV" | "MOCK";

export interface LLMRuntimeModels {
  topic_analysis: string;
  session_plan: string;
  session_content: string;
}

export interface LLMRuntimeDTO {
  source: LLMRuntimeSource;
  provider: LLMProviderKey | null;
  models: LLMRuntimeModels;
  fallback_reason: string | null;
  /** The server's included free-tier AI answers; the learner chose nothing. */
  bundled?: boolean;
  /** Today's allowance of the included AI; present while the server offers it. */
  free_ai?: FreeAiDTO | null;
}

export interface FreeAiDTO {
  limit: number;
  used: number;
  remaining: number;
}

export type LLMProviderErrorCode =
  | "LLM_ACCESS_DENIED"
  | "LLM_ASYNC_RESULT_UNAVAILABLE"
  | "LLM_AUTHENTICATION_FAILED"
  | "LLM_CONNECTION_FAILED"
  | "LLM_ENDPOINT_OR_MODEL_UNAVAILABLE"
  | "LLM_INVALID_RESPONSE"
  | "LLM_MODEL_UNAVAILABLE"
  | "LLM_OUTPUT_LIMIT"
  | "LLM_PROVIDER_ERROR"
  | "LLM_PROVIDER_UNAVAILABLE"
  | "LLM_QUOTA_EXHAUSTED"
  | "LLM_RATE_LIMITED"
  | "LLM_REFUSED"
  | "LLM_TIMEOUT"
  | "LLM_UNSUPPORTED_CONFIGURATION"
  | "LLM_UNSUPPORTED_REQUEST";

export interface LLMProviderErrorDTO {
  detail: string;
  code: LLMProviderErrorCode;
  provider: LLMProviderKey | null;
  upstream_status: number | null;
  retryable: boolean;
  retry_after_seconds: number | null;
}

export interface OllamaModel {
  id: string;
  size_bytes: number | null;
  parameter_size: string | null;
  context_length: number | null;
}
