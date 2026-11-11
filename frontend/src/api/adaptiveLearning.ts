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

export const adaptiveLearningApi = {
  getLearningMode: (sessionId: number) =>
    apiClient
      .get<LearningModeResponse>(`/sessions/${sessionId}/learning-mode`)
      .then((response) => response.data),
  getLearningV2: (sessionId: number) =>
    apiClient
      .get<LearningResponseV2>(`/sessions/${sessionId}/learning-v2`)
      .then((response) => response.data),
};
