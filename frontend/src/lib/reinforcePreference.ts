import { useCallback, useSyncExternalStore } from "react";

import { readFlag, subscribeFlags, writeFlag } from "./onboardingStorage";

export const REINFORCE_ALWAYS_FLAG = "reinforce.always";

/**
 * "Always reinforce reviews with AI". Kept per browser (like the demo choice), so no
 * account setting or endpoint is needed. If storage is blocked it is simply not remembered.
 */
export function useReinforceAlways() {
  const always = useSyncExternalStore(
    subscribeFlags,
    () => readFlag(REINFORCE_ALWAYS_FLAG) === "1",
    () => false,
  );
  const setAlways = useCallback((value: boolean) => writeFlag(REINFORCE_ALWAYS_FLAG, value ? "1" : null), []);
  return { always, setAlways };
}
