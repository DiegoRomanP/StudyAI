import { describe, expect, it } from "vitest";

import type { DashboardDTO, PlanDTO } from "../api/types";
import {
  dueReviewCount,
  findNextSession,
  parseApiDate,
  quizStreakDays,
  rankTopics,
  sessionProgress,
  suggestedSessionDate,
} from "../lib/studyProgress";
import { makeSessionSummary, makeTopic } from "../test/fixtures";

function plan(overrides: Partial<PlanDTO>): PlanDTO {
  return {
    id: 1,
    title: "Plan",
    status: "READY",
    goal_id: 1,
    document_ids: [1],
    created_at: "2026-10-10T09:00:00",
    error_message: "",
    topics: [],
    sessions: [],
    ...overrides,
  };
}

const session = (id: number, order: number, status: "PENDING" | "COMPLETED", offset = 0) =>
  makeSessionSummary({
    id,
    order_index: order,
    topic_name: `Tema ${id}`,
    review_offset_days: offset,
    status,
  });

const dashboard = (overrides: Partial<DashboardDTO>): DashboardDTO => ({
  scores: [],
  weak_topics: [],
  upcoming_reviews: [],
  sessions_completed: 0,
  average_score: 0,
  ...overrides,
});

describe("study progress derivations", () => {
  it("picks the first pending session by order from the newest ready plan that has one", () => {
    const older = plan({
      id: 1,
      created_at: "2026-10-01T09:00:00",
      sessions: [session(10, 0, "PENDING")],
    });
    const newestDone = plan({
      id: 2,
      created_at: "2026-10-12T09:00:00",
      sessions: [session(20, 0, "COMPLETED")],
    });
    const newer = plan({
      id: 3,
      created_at: "2026-10-11T09:00:00",
      sessions: [session(32, 2, "PENDING"), session(31, 1, "PENDING"), session(30, 0, "COMPLETED")],
    });
    const processing = plan({ id: 4, status: "PROCESSING", created_at: "2026-10-13T09:00:00" });

    const next = findNextSession([older, newestDone, newer, processing]);
    expect(next?.plan.id).toBe(3);
    expect(next?.session.id).toBe(31);
    expect(findNextSession([newestDone])).toBeNull();
    expect(findNextSession(undefined)).toBeNull();
  });

  it("counts sessions only from ready plans and never divides by zero", () => {
    expect(sessionProgress([])).toEqual({ total: 0, completed: 0, pending: 0, percent: 0 });
    expect(
      sessionProgress([
        plan({ sessions: [session(1, 0, "COMPLETED"), session(2, 1, "PENDING"), session(3, 2, "PENDING")] }),
        plan({ id: 2, status: "FAILED", sessions: [session(4, 0, "COMPLETED")] }),
      ]),
    ).toEqual({ total: 3, completed: 1, pending: 2, percent: 33 });
  });

  it("derives the suggested day from the plan creation date and the review offset", () => {
    const date = suggestedSessionDate(plan({ created_at: "2026-10-10T23:30:00" }), session(1, 0, "PENDING", 3));
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(9);
    expect(date?.getDate()).toBe(13);
    expect(suggestedSessionDate(plan({ created_at: "no-date" }), session(1, 0, "PENDING"))).toBeNull();
  });

  it("reads offset-less backend datetimes as UTC and keeps explicit offsets", () => {
    expect(parseApiDate("2026-10-15T23:30:00")?.toISOString()).toBe("2026-10-15T23:30:00.000Z");
    expect(parseApiDate("2026-10-15T23:30:00.123456")?.toISOString()).toBe("2026-10-15T23:30:00.123Z");
    expect(parseApiDate("2026-10-15T23:30:00+02:00")?.toISOString()).toBe("2026-10-15T21:30:00.000Z");
    expect(parseApiDate("2026-10-15T23:30:00Z")?.toISOString()).toBe("2026-10-15T23:30:00.000Z");
    const day = parseApiDate("2026-10-15");
    expect([day?.getFullYear(), day?.getMonth(), day?.getDate(), day?.getHours()]).toEqual([2026, 9, 15, 0]);
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate("no-date")).toBeNull();
  });

  it("counts a streak of consecutive quiz days ending today or yesterday", () => {
    const today = new Date(2026, 9, 16, 12);
    const scored = (day: number) => ({
      session_id: day,
      topic_name: "t",
      score: 80,
      // Backend format: naive UTC, no offset.
      completed_at: new Date(2026, 9, day, 10).toISOString().replace("Z", ""),
    });

    expect(quizStreakDays(dashboard({ scores: [scored(16), scored(15), scored(14), scored(12)] }), today)).toBe(3);
    expect(quizStreakDays(dashboard({ scores: [scored(15), scored(14)] }), today)).toBe(2);
    expect(quizStreakDays(dashboard({ scores: [scored(13)] }), today)).toBe(0);
    expect(quizStreakDays(undefined, today)).toBe(0);
  });

  it("separates due reviews from all scheduled ones", () => {
    const reviews = dashboard({
      upcoming_reviews: [
        { next_review_date: "2026-10-14", count: 2 },
        { next_review_date: "2026-10-16", count: 3 },
        { next_review_date: "2026-10-20", count: 5 },
      ],
    });
    expect(dueReviewCount(reviews, new Date(2026, 9, 16, 8))).toBe(5);
  });

  it("ranks Pareto-selected topics first by estimated relevance with clamped percentages", () => {
    const ranked = rankTopics([
      makeTopic({ id: 1, name: "Redes", subtopics: [], difficulty: 2, relevance: 0.6, selected: false }),
      makeTopic({ id: 2, name: "Grafos", subtopics: [], difficulty: 4, relevance: 0.954, selected: true }),
      makeTopic({ id: 3, name: "Árboles", subtopics: [], difficulty: 3, relevance: 1.4, selected: true }),
    ]);
    expect(ranked.map((topic) => [topic.name, topic.relevancePercent])).toEqual([
      ["Árboles", 100],
      ["Grafos", 95],
      ["Redes", 60],
    ]);
  });
});
