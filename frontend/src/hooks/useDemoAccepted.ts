import { useCallback, useSyncExternalStore } from "react";

import { readFlag, subscribeFlags, writeFlag } from "../lib/onboardingStorage";

export const DEMO_OK_FLAG = "demo-ok";

/**
 * "I'll try the demo mode": the learner explicitly chose to continue without an AI
 * provider. Shared by the setup wizard and the "Primeros pasos" checklist. If storage is
 * blocked the choice simply isn't remembered and the step asks again.
 */
export function useDemoAccepted() {
  const accepted = useSyncExternalStore(
    subscribeFlags,
    () => readFlag(DEMO_OK_FLAG) === "1",
    () => false,
  );
  const accept = useCallback(() => writeFlag(DEMO_OK_FLAG, "1"), []);
  return { accepted, accept };
}
