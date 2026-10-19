import type { DashboardDTO, PlanDTO, PlanTopicDTO, SessionSummaryDTO } from "../api/types";

/**
 * Pure derivations from real API data. Nothing here invents a metric: every value is
 * computed from plans/sessions/dashboard fields the backend already returns.
 */

/**
 * Backend datetimes are UTC but serialized without an offset (SQLite + Pydantic), so
 * `new Date("2026-10-15T23:30:00")` would read them as local time. Treat a value with
 * no explicit offset as UTC; date-only values stay local calendar days.
 */
export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const hasTime = value.includes("T");
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTime && !hasOffset ? `${value}Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeOf(value: string) {
  return parseApiDate(value)?.getTime() ?? 0;
}

function byNewestFirst(a: PlanDTO, b: PlanDTO) {
  return timeOf(b.created_at) - timeOf(a.created_at) || b.id - a.id;
}

function byOrder(a: SessionSummaryDTO, b: SessionSummaryDTO) {
  return a.order_index - b.order_index || a.id - b.id;
}

export function readyPlans(plans: PlanDTO[] | undefined): PlanDTO[] {
  return (plans ?? []).filter((plan) => plan.status === "READY").sort(byNewestFirst);
}

/**
 * Adaptive route order: which pending session goes first today. Computed on read (never
 * persisted), because what is "due" changes every day even without a new exam.
 *   1) reviews that are due (no date, or on/before today): heavier topics first;
 *   2) new sessions in the AI's order;
 *   3) future reviews, soonest first.
 * Dates are `YYYY-MM-DD` and compare as text.
 */
export function routeOrder(
  plan: Pick<PlanDTO, "sessions" | "topics">,
  today = new Date(),
): SessionSummaryDTO[] {
  const todayKey = toDateKey(today);
  const weight = (session: SessionSummaryDTO) =>
    plan.topics.find((topic) => topic.id === session.topic_id)?.priority ?? 0;
  const pending = plan.sessions.filter((session) => session.status === "PENDING");
  const isReview = (session: SessionSummaryDTO) => session.kind === "REVIEW";
  const due = pending
    .filter((s) => isReview(s) && (s.scheduled_date === null || s.scheduled_date <= todayKey))
    .sort(
      (a, b) =>
        weight(b) - weight(a) ||
        (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "") ||
        a.id - b.id,
    );
  const fresh = pending.filter((s) => !isReview(s)).sort(byOrder);
  const future = pending
    .filter((s) => isReview(s) && s.scheduled_date !== null && s.scheduled_date > todayKey)
    .sort(
      (a, b) =>
        (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "") || weight(b) - weight(a) || a.id - b.id,
    );
  return [...due, ...fresh, ...future];
}

/** Next session of the most recent READY plan that still has a pending one (route order). */
export function findNextSession(
  plans: PlanDTO[] | undefined,
): { plan: PlanDTO; session: SessionSummaryDTO } | null {
  for (const plan of readyPlans(plans)) {
    const session = routeOrder(plan)[0];
    if (session) return { plan, session };
  }
  return null;
}

export interface SessionProgress {
  total: number;
  completed: number;
  pending: number;
  /** 0–100, rounded; 0 when there are no sessions. */
  percent: number;
}

/** Completed vs pending sessions across READY plans; reviews are extra, not progress. */
export function sessionProgress(plans: PlanDTO[] | undefined): SessionProgress {
  const sessions = readyPlans(plans)
    .flatMap((plan) => plan.sessions)
    .filter((session) => session.kind === "NEW");
  const completed = sessions.filter((session) => session.status === "COMPLETED").length;
  const total = sessions.length;
  return {
    total,
    completed,
    pending: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Flashcards due for review today or earlier, from the SM-2 schedule. */
export function dueReviewCount(dashboard: DashboardDTO | undefined, today = new Date()): number {
  const todayKey = toDateKey(today);
  return (dashboard?.upcoming_reviews ?? [])
    .filter((review) => review.next_review_date <= todayKey)
    .reduce((sum, review) => sum + review.count, 0);
}

export function upcomingReviewCount(dashboard: DashboardDTO | undefined): number {
  return (dashboard?.upcoming_reviews ?? []).reduce((sum, review) => sum + review.count, 0);
}

/** The session's suggested day: its scheduled date, or (old plans) creation date + offset. */
export function suggestedSessionDate(plan: Pick<PlanDTO, "created_at">, session: SessionSummaryDTO) {
  if (session.scheduled_date) return parseApiDate(session.scheduled_date);
  const created = parseApiDate(plan.created_at);
  if (!created) return null;
  const date = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  date.setDate(date.getDate() + session.review_offset_days);
  return date;
}

/** Local calendar day as YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Consecutive calendar days, ending today or yesterday, with at least one graded quiz
 * (dashboard `scores`). A day without a quiz breaks the streak.
 */
export function quizStreakDays(dashboard: DashboardDTO | undefined, today = new Date()): number {
  const days = new Set(
    (dashboard?.scores ?? [])
      .map((score) => parseApiDate(score.completed_at))
      .filter((date): date is Date => date !== null)
      .map(toDateKey),
  );
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(toDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface RankedTopic extends PlanTopicDTO {
  /** Relevance as an integer percentage (the AI's estimate, 0–100). */
  relevancePercent: number;
}

/** Topics ranked by the AI's estimated relevance; Pareto-selected ones first. */
export function rankTopics(topics: PlanTopicDTO[] | undefined): RankedTopic[] {
  return [...(topics ?? [])]
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.relevance - a.relevance)
    .map((topic) => ({
      ...topic,
      relevancePercent: Math.round(Math.min(1, Math.max(0, topic.relevance)) * 100),
    }));
}
