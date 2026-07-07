import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Countdown timer that computes remaining time from a target timestamp, so it
 * does not drift even if the interval callback is delayed or the tab throttles.
 */
export function useTimer(durationSeconds: number, onComplete?: () => void) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const [running, setRunning] = useState(false);
  const targetRef = useRef<number>(Date.now() + durationSeconds * 1000);
  const completedRef = useRef(false);

  const start = useCallback(() => {
    targetRef.current = Date.now() + remaining * 1000;
    completedRef.current = false;
    setRunning(true);
  }, [remaining]);

  const reset = useCallback(
    (newDuration = durationSeconds) => {
      setRunning(false);
      completedRef.current = false;
      setRemaining(newDuration);
      targetRef.current = Date.now() + newDuration * 1000;
    },
    [durationSeconds],
  );

  const finish = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const secs = Math.max(0, Math.round((targetRef.current - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) {
        clearInterval(id);
        finish();
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, finish]);

  return { remaining, running, start, reset, finish };
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
