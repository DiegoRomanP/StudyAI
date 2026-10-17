import * as m from "motion/react-m";
import type { ReactNode } from "react";

/**
 * Quiet fade between routes (S10: alive, never restless). Opacity only, so layout
 * and focus positions are final immediately; MotionConfig at the root disables it
 * for users who prefer reduced motion.
 */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <m.div
      key={routeKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
