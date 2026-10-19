import { useState } from "react";
import { CircleCheck, CircleDashed, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { PlanDTO, SessionSummaryDTO } from "../../api/types";
import { suggestedSessionDate, toDateKey } from "../../lib/studyProgress";
import { Badge, SegmentedControl } from "../ui";

type View = "calendar" | "list";

function byOrder(a: SessionSummaryDTO, b: SessionSummaryDTO) {
  return a.order_index - b.order_index || a.id - b.id;
}

function dayLabel(date: Date) {
  const label = date.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Every session of the plan, with stable links. "Calendario" groups them by their
 * scheduled day; "Lista" keeps the study order.
 */
export function SessionTimeline({ plan }: { plan: PlanDTO }) {
  const [view, setView] = useState<View>("calendar");
  const sessions = [...plan.sessions].sort(byOrder);
  const todayKey = toDateKey(new Date());

  const groups = new Map<string, { date: Date | null; sessions: SessionSummaryDTO[] }>();
  for (const session of sessions) {
    const date = suggestedSessionDate(plan, session);
    const key = date ? toDateKey(date) : "sin-fecha";
    const group = groups.get(key) ?? { date, sessions: [] };
    group.sessions.push(session);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section aria-labelledby="sessions-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sessions-title" className="font-display text-lg font-semibold text-text-primary">
          Sesiones
        </h2>
        <SegmentedControl
          label="Vista de sesiones"
          value={view}
          onChange={setView}
          options={[
            { value: "calendar", label: "Calendario" },
            { value: "list", label: "Lista" },
          ]}
        />
      </div>

      {view === "calendar" ? (
        <ol className="space-y-4">
          {orderedGroups.map(([key, group]) => (
            <li key={key} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-muted">
                {group.date ? dayLabel(group.date) : "Sin fecha sugerida"}
                {key === todayKey && <Badge color="brand">Hoy</Badge>}
              </h3>
              <ul className="space-y-2">
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <SessionRow session={session} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <SessionRow session={session} showOrder />
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-text-muted">Fechas sugeridas.</p>
    </section>
  );
}

function SessionRow({ session, showOrder = false }: { session: SessionSummaryDTO; showOrder?: boolean }) {
  const done = session.status === "COMPLETED";
  const StatusIcon = done ? CircleCheck : CircleDashed;
  return (
    <Link
      to={`/session/${session.id}`}
      className="flex min-h-14 items-center gap-3 rounded-surface border border-line bg-surface-paper px-4 py-3 transition-colors hover:border-line-strong hover:bg-surface-subtle motion-reduce:transition-none"
    >
      {showOrder ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-muted">
          {session.order_index + 1}
        </span>
      ) : (
        <StatusIcon
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 ${done ? "text-state-success" : "text-text-muted"}`}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-text-primary">{session.topic_name}</span>
        <span className="block text-xs text-text-muted">
          {session.duration_minutes} min
        </span>
      </span>
      {session.kind === "REVIEW" && <Badge color="brand">Repaso</Badge>}
      {done ? <Badge color="green">Completada</Badge> : <Badge>Pendiente</Badge>}
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
    </Link>
  );
}
