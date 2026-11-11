import { apiClient } from "./client";

export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
export type PedagogyProfileId =
  | "logical_deductive"
  | "critical_argumentative"
  | "linguistic_interpretive"
  | "systemic_empirical"
  | "applied_practical"
  | "general"
  | "history"
  | "mathematics";
export type EvaluationCriterion = "accuracy" | "procedure" | "argumentation";
export type FeedbackMode = "formula" | "chapter_reference" | "counterargument";

export interface LearningModeResponse {
  content_version: 1 | 2;
}

export interface MinuteRange {
  min: number;
  max: number;
}

export interface LearningObjective {
  id: string;
  skill: string;
  description: string;
  bloom_target?: BloomLevel;
}

export interface PedagogySnapshotV2 {
  snapshot_schema_version: 2;
  profile_id: Exclude<PedagogyProfileId, "history" | "mathematics">;
  profile_version: number;
  name: string;
  discipline_examples: string[];
  rules: string[];
  bloom_levels: BloomLevel[];
  allowed_question_types: string[];
  primary_evaluation_criterion: EvaluationCriterion;
  estimated_minutes_per_question: MinuteRange;
  question_time_overrides: Record<string, MinuteRange>;
  feedback_modes: FeedbackMode[];
  procedure_rubric_weights: { result: number; procedure: number } | null;
  objectives: (LearningObjective & { bloom_target: BloomLevel })[];
}

export interface LegacyPedagogySnapshot {
  profile_id: "history" | "mathematics" | "general";
  profile_version: number;
  rules: string[];
  objectives: LearningObjective[];
}

export type PedagogySnapshot = PedagogySnapshotV2 | LegacyPedagogySnapshot;

export interface LessonBlock {
  id: string;
  kind: string;
  objective_ids: string[];
  content_markdown: string;
  source_refs?: string[];
  stimulus_id?: string | null;
}

interface StimulusBase {
  id: string;
  title: string;
  objective_ids: string[];
  origin: "derived" | "generated_example";
  source_id?: string | null;
}

export interface DiagramStimulus extends StimulusBase {
  kind: "diagram";
  origin: "derived";
  nodes: { id: string; label: string }[];
  edges: { from_id: string; to_id: string; label: string }[];
  text_alternative: string;
}

export interface GraphStimulus extends StimulusBase {
  kind: "graph";
  origin: "derived";
  x_label: string;
  y_label: string;
  x_unit?: string | null;
  y_unit?: string | null;
  series: { name: string; points: { x: number | string; y: number }[] }[];
  text_alternative: string;
}

export interface CaseStimulus extends StimulusBase {
  kind: "case";
  body_markdown: string;
}

export interface LongTextStimulus extends StimulusBase {
  kind: "long_text";
  origin: "derived";
  body_markdown: string;
}

export type LessonStimulus = DiagramStimulus | GraphStimulus | CaseStimulus | LongTextStimulus;

export interface LearningResponseV2 {
  session_id: number;
  content_version: 2;
  snapshot: PedagogySnapshot;
  lesson_blocks: LessonBlock[];
  content_markdown: string;
  stimuli?: LessonStimulus[];
}

export interface AssessmentMatchingItem {
  id: string;
  text: string;
}

export interface AssessmentMatchingPair {
  left_id: string;
  right_id: string;
}

export interface AssessmentRubricCriterion {
  criterion_id: string;
  description: string;
  descriptors: string[];
}

export interface AssessmentSequenceItem {
  id: string;
  text: string;
}

interface AssessmentQuestionBase {
  question_id: string;
  prompt: string;
  objective_ids: string[];
  estimated_minutes_per_question?: MinuteRange | null;
  stimulus_id?: string | null;
}

export type AssessmentQuestionV2 =
  | (AssessmentQuestionBase & { kind: "flashcard"; flashcard_answer: string })
  | (AssessmentQuestionBase & { kind: "multiple_choice"; mode: "single" | "multiple"; options: string[] })
  | (AssessmentQuestionBase & { kind: "true_false" })
  | (AssessmentQuestionBase & { kind: "matching"; matching_left: AssessmentMatchingItem[]; matching_right: AssessmentMatchingItem[] })
  | (AssessmentQuestionBase & { kind: "numeric"; units?: string | null })
  | (AssessmentQuestionBase & { kind: "sequence"; sequence_items: AssessmentSequenceItem[] })
  | (AssessmentQuestionBase & { kind: "rubric"; rubric_criteria: AssessmentRubricCriterion[] })
  | (AssessmentQuestionBase & { kind: "short_answer"; grading_mode: "exact" | "formative" })
  | (AssessmentQuestionBase & { kind: "essay" })
  | (AssessmentQuestionBase & { kind: "step_by_step"; grading_mode: "exact" | "numeric" | "formative" });

export interface AssessmentResponseV2 {
  quiz_id: number;
  revision: string;
  questions: AssessmentQuestionV2[];
  stimuli: LessonStimulus[];
}

export type AssessmentAnswerV2 =
  | { kind: "flashcard"; question_id: string; quality: number }
  | { kind: "multiple_choice"; question_id: string; selected_option?: string | null; selected_options?: string[] | null }
  | { kind: "true_false"; question_id: string; answer: boolean }
  | { kind: "matching"; question_id: string; pairs: AssessmentMatchingPair[] }
  | { kind: "numeric"; question_id: string; value: string }
  | { kind: "sequence"; question_id: string; ordered_ids: string[] }
  | { kind: "rubric"; question_id: string; text: string; criterion_ratings: Record<string, number> }
  | { kind: "short_answer"; question_id: string; text: string }
  | { kind: "essay"; question_id: string; text: string }
  | { kind: "step_by_step"; question_id: string; steps: string; final_answer: string };

export interface AssessmentSubmissionV2 {
  revision: string;
  answers: AssessmentAnswerV2[];
}

export interface GroundedAssessmentFeedback {
  mode: FeedbackMode;
  text: string;
  source_id?: string | null;
}

export interface AssessmentResultItemV2 {
  question_id: string;
  kind: Exclude<AssessmentQuestionV2["kind"], "rubric">;
  correct?: boolean | null;
  quality?: number | null;
  submitted_answer?: boolean | string | string[] | AssessmentMatchingPair[] | null;
  expected_answer?: boolean | string | string[] | AssessmentMatchingPair[] | null;
  feedback: string;
  grounded_feedback: GroundedAssessmentFeedback[];
}

export interface ProcedureRubricWeights {
  result: number;
  procedure: number;
}

export interface FormativeFeedbackV2 {
  question_id: string;
  criterion_ratings?: Record<string, number>;
  criteria?: AssessmentRubricCriterion[];
  exemplar?: string | null;
  message: string;
  submitted_text?: string | null;
  submitted_final_answer?: string | null;
  procedure_rubric_weights?: ProcedureRubricWeights | null;
  grounded_feedback?: GroundedAssessmentFeedback[];
}

export interface ObjectiveResultV2 {
  objective_id: string;
  correct: number;
  total: number;
}

export interface AssessmentResultV2 {
  quiz_id: number;
  revision: string;
  score: number;
  correct: number;
  total: number;
  detail: AssessmentResultItemV2[];
  formative_feedback: FormativeFeedbackV2[];
  objective_results: ObjectiveResultV2[];
}

export const adaptiveLearningApi = {
  getLearningMode: (sessionId: number) =>
    apiClient
      .get<LearningModeResponse>(`/sessions/${sessionId}/learning-mode`)
      .then((response) => response.data),
  getLearningV2: (sessionId: number) =>
    apiClient
      .get<LearningResponseV2>(`/sessions/${sessionId}/learning-v2`)
      .then((response) => response.data),
  getAssessmentV2: (sessionId: number) =>
    apiClient
      .get<AssessmentResponseV2>(`/quizzes/${sessionId}/assessment-v2`)
      .then((response) => response.data),
  submitAssessmentV2: (quizId: number, input: AssessmentSubmissionV2) =>
    apiClient
      .post<AssessmentResultV2>(`/quizzes/${quizId}/assessment-v2/submit`, input)
      .then((response) => response.data),
  getAssessmentResultV2: (sessionId: number) =>
    apiClient
      .get<AssessmentResultV2>(`/quizzes/${sessionId}/assessment-v2/result`)
      .then((response) => response.data),
};
