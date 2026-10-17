import { describe, expect, it } from "vitest";

import type { DashboardDTO } from "../api/types";
import { accuracyTrend, averageScore, scoresInRange } from "../lib/studyStats";

const now = new Date(2026, 9, 17, 12);
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString().replace("Z", "");
const dashboard = (scores: [number, number][]): DashboardDTO => ({
  scores: scores.map(([day, score], index) => ({
    session_id: index + 1,
    topic_name: `t${index}`,
    score,
    completed_at: at(day),
  })),
  weak_topics: [],
  upcoming_reviews: [],
  sessions_completed: scores.length,
  average_score: 0,
});

describe("study stats", () => {
  it("includes today and the six previous calendar days in 7 días", () => {
    const data = dashboard([[11, 10], [10, 20], [17, 90]]);
    expect(scoresInRange(data, "7d", now).map((score) => score.score)).toEqual([10, 90]);
    expect(scoresInRange(data, "all", now)).toHaveLength(3);
  });

  it("reports a trend only when both periods have data", () => {
    expect(accuracyTrend(dashboard([[5, 50], [16, 80]]), "7d", now)).toBe(30);
    expect(accuracyTrend(dashboard([[16, 80]]), "7d", now)).toBeNull();
    expect(accuracyTrend(dashboard([[5, 50], [16, 80]]), "all", now)).toBeNull();
  });

  it("does not invent an average without data", () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([{ score: 50 }, { score: 75 }])).toBe(63);
  });
});
