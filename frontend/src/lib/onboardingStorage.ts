/**
 * Per-browser onboarding flags (closed guides, dismissed checklist, "demo is fine").
 * Storage can be blocked (private mode, disabled site data), so every access is
 * guarded: a failure reads as "first visit" and the UI shows everything.
 */
const PREFIX = "studyai.onboarding.";

const listeners = new Set<() => void>();

/** Lets several components (wizard, checklist) react to the same flag. */
export function subscribeFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not persisted: the flag simply resets on the next visit.
  }
  listeners.forEach((listener) => listener());
}
