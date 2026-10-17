import { useRef } from "react";

/** A unique key for one logical write; the backend replays the same request for it. */
export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context (e.g. not plain-HTTP LAN access).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * Identity of a plan-generation request as the server sees it: document order and
 * duplicates do not change the payload, so they must not change the key either.
 */
export function planRequestFingerprint(goalId: number, documentIds: number[]): string {
  const uniqueSorted = [...new Set(documentIds)].sort((a, b) => a - b);
  return `${goalId}:${uniqueSorted.join(",")}`;
}

/**
 * Keeps one idempotency key per request payload: retrying the same payload after an
 * error or a lost response reuses the key, so the server returns the original result
 * instead of creating a duplicate. A different payload gets a fresh key.
 */
export function useIdempotencyKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    keyFor(fingerprint: string): string {
      if (current.current?.fingerprint !== fingerprint) {
        current.current = { fingerprint, key: createIdempotencyKey() };
      }
      return current.current.key;
    },
    reset() {
      current.current = null;
    },
  };
}
