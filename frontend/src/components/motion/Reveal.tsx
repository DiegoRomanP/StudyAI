import * as m from "motion/react-m";
import type { ElementType, ReactNode } from "react";

const MAX_STAGGER = 6;

/**
 * Builds a box in place the first time it scrolls into view (S10: alive, never restless).
 * `index` staggers siblings that enter together so a grid assembles one box after another.
 * Plays once; MotionConfig at the root drops the movement for users who prefer reduced motion.
 */
export function Reveal({
  as = "div",
  index = 0,
  id,
  className,
  children,
}: {
  as?: "div" | "li" | "details" | "h2";
  index?: number;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const Component = m[as] as ElementType;
  return (
    <Component
      id={id}
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, MAX_STAGGER) * 0.1 }}
      className={className}
    >
      {children}
    </Component>
  );
}
