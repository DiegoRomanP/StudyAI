import { useSyncExternalStore } from "react";

import type { QuizAnswer } from "../api/types";

/**
 * Answers of a test still in progress, kept per browser so the learner can leave and
 * "Seguir desde la última pregunta". Storage can be blocked (private mode, disabled
 * site data), so every access is guarded: a failure reads as "no draft".
 */
export interface QuizDraft {
  quizId: number;
  answers: Record<number, QuizAnswer>;
  /** Question order when the learner shuffled a review; null keeps the quiz order. */
  order: number[] | null;
}

const PREFIX = "studyai.quizDraft.";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function readRaw(sessionId: number): string | null {
  try {
    return window.localStorage.getItem(PREFIX + sessionId);
  } catch {
    return null;
  }
}

function isAnswer(value: unknown): value is QuizAnswer {
  return typeof value === "object" && value !== null && Number.isSafeInteger((value as QuizAnswer).question_id);
}

function parse(raw: string | null): QuizDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<QuizDraft>;
    if (!Number.isSafeInteger(value.quizId) || typeof value.answers !== "object" || value.answers === null) return null;
    const answers: Record<number, QuizAnswer> = {};
    for (const answer of Object.values(value.answers)) {
      if (isAnswer(answer)) answers[answer.question_id] = answer;
    }
    const order = Array.isArray(value.order) && value.order.every(Number.isSafeInteger) ? value.order : null;
    return { quizId: value.quizId as number, answers, order };
  } catch {
    return null;
  }
}

export function readQuizDraft(sessionId: number): QuizDraft | null {
  return parse(readRaw(sessionId));
}

export function writeQuizDraft(sessionId: number, draft: QuizDraft): void {
  try {
    window.localStorage.setItem(PREFIX + sessionId, JSON.stringify(draft));
  } catch {
    // Not persisted: leaving the test simply loses the answers, as before.
  }
  notify();
}

export function clearQuizDraft(sessionId: number): void {
  try {
    window.localStorage.removeItem(PREFIX + sessionId);
  } catch {
    // Nothing stored to remove.
  }
  notify();
}

/** Number of answers saved for this session's test (0 without a draft). */
export function useQuizDraftCount(sessionId: number): number {
  // The raw string is a stable snapshot; parsing it here keeps re-renders cheap.
  const raw = useSyncExternalStore(subscribe, () => readRaw(sessionId), () => null);
  const draft = parse(raw);
  return draft ? Object.keys(draft.answers).length : 0;
}
