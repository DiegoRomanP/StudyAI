import type { DashboardDTO } from "../api/types";
import { parseApiDate } from "./studyProgress";

/**
 * Range filters over the dashboard's graded quiz history. The backend returns every
 * graded attempt (`scores`, oldest first); nothing here invents study time or accuracy
 * the API does not provide.
 */

export type StatsRange = "7d" | "30d" | "all";

export const RANGE_DAYS: Record<Exclude<StatsRange, "all">, number> = { "7d": 7, "30d": 30 };

export type ScorePoint = DashboardDTO["scores"][number] & { date: Date };

/** Local midnight `days - 1` days before `now`: "últimos 7 días" includes today. */
function rangeStart(days: number, now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  return start;
}

/** Scores with a readable date, oldest first. Undated attempts only count in "Todo". */
export function datedScores(dashboard: DashboardDTO | undefined): ScorePoint[] {
  return (dashboard?.scores ?? [])
    .map((score) => ({ ...score, date: parseApiDate(score.completed_at) }))
    .filter((score): score is ScorePoint => score.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function scoresInRange(
  dashboard: DashboardDTO | undefined,
  range: StatsRange,
  now = new Date(),
): DashboardDTO["scores"] {
  if (range === "all") return dashboard?.scores ?? [];
  const start = rangeStart(RANGE_DAYS[range], now);
  return datedScores(dashboard).filter((score) => score.date >= start && score.date <= now);
}

/** The same-length window right before the range ("7 días anteriores"). */
export function scoresInPreviousRange(
  dashboard: DashboardDTO | undefined,
  range: Exclude<StatsRange, "all">,
  now = new Date(),
): DashboardDTO["scores"] {
  const end = rangeStart(RANGE_DAYS[range], now);
  const start = new Date(end);
  start.setDate(start.getDate() - RANGE_DAYS[range]);
  return datedScores(dashboard).filter((score) => score.date >= start && score.date < end);
}

export function averageScore(scores: { score: number }[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);
}

/** Change in average accuracy (points) only when both windows have data. */
export function accuracyTrend(
  dashboard: DashboardDTO | undefined,
  range: StatsRange,
  now = new Date(),
): number | null {
  if (range === "all") return null;
  const current = averageScore(scoresInRange(dashboard, range, now));
  const previous = averageScore(scoresInPreviousRange(dashboard, range, now));
  return current === null || previous === null ? null : current - previous;
}
