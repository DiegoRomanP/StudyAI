import type { PlanTopicDTO, SessionDetailDTO, SessionSummaryDTO } from "../api/types";

/** Adaptive-route defaults shared by every hand-built DTO in the tests. */
export function makeTopic(
  fields: Pick<PlanTopicDTO, "id" | "name" | "relevance" | "selected"> & Partial<PlanTopicDTO>,
): PlanTopicDTO {
  return {
    subtopics: [],
    difficulty: 3,
    mastery: null,
    review_box: 0,
    mastery_state: "SIN_DATOS",
    priority: 0,
    ...fields,
  };
}

export function makeSessionSummary(
  fields: Pick<SessionSummaryDTO, "id" | "order_index" | "topic_name"> & Partial<SessionSummaryDTO>,
): SessionSummaryDTO {
  return {
    duration_minutes: 25,
    review_offset_days: 1,
    status: "PENDING",
    kind: "NEW",
    topic_id: null,
    scheduled_date: null,
    reinforcement_status: "NONE",
    ...fields,
  };
}

export function makeSessionDetail(
  fields: Pick<SessionDetailDTO, "id" | "plan_id" | "topic_name"> & Partial<SessionDetailDTO>,
): SessionDetailDTO {
  return {
    order_index: 0,
    duration_minutes: 25,
    review_offset_days: 1,
    status: "PENDING",
    completed_at: null,
    material: null,
    kind: "NEW",
    topic_id: null,
    scheduled_date: null,
    review_points: [],
    reinforcement_status: "NONE",
    reinforcement_error: "",
    ...fields,
  };
}
