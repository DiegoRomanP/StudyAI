import { useState } from "react";

/** Caps a list at `pageSize` items until the user asks to see the rest. */
export function useShowMore<T>(items: T[] | undefined, pageSize = 6) {
  const [expanded, setExpanded] = useState(false);
  const all = items ?? [];
  const visible = expanded ? all : all.slice(0, pageSize);
  return {
    visible,
    expanded,
    hiddenCount: all.length - visible.length,
    showMore: () => setExpanded(true),
    showLess: () => setExpanded(false),
  };
}
