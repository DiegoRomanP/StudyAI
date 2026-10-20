import type { SessionSummaryDTO } from "../api/types";

/** Where the learner is with a session's test, as the plan's session list sees it. */
export type SessionState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

/** A submitted test completes the session; saved answers (this browser) mean it is under way. */
export function sessionState(session: SessionSummaryDTO, draftAnswers: number): SessionState {
  if (session.status === "COMPLETED") return "COMPLETED";
  return draftAnswers > 0 ? "IN_PROGRESS" : "NOT_STARTED";
}
