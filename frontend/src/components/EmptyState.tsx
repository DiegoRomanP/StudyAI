import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { IconTile } from "./ui";

/** A friendly "nothing here yet" block: what this is, why it's empty, what to do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-surface border border-dashed border-line px-4 py-8 text-center"
    >
      <IconTile icon={icon} className="h-12 w-12" />
      <p className="font-display text-lg font-semibold text-text-primary">{title}</p>
      {description && <p className="max-w-reading text-sm text-text-muted">{description}</p>}
      {action && <div className="flex flex-wrap justify-center gap-2 pt-1">{action}</div>}
    </div>
  );
}
