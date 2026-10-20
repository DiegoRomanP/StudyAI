import { useState } from "react";
import { CircleCheck, CircleDashed, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { PlanDTO, SessionSummaryDTO } from "../../api/types";
import { clearQuizDraft, useQuizDraftCount } from "../../lib/quizDraft";
import { sessionState, type SessionState } from "../../lib/sessionState";
import { parseApiDate, suggestedSessionDate, toDateKey } from "../../lib/studyProgress";
import { formatTimeAgo } from "../../lib/timeAgo";
import { Dialog } from "../Dialog";
import { Badge, Button, SegmentedControl } from "../ui";

type View = "calendar" | "list";

function byOrder(a: SessionSummaryDTO, b: SessionSummaryDTO) {
  return a.order_index - b.order_index || a.id - b.id;
}

function dayLabel(date: Date) {
  const label = date.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Every session of the plan. "Calendario" groups them by their scheduled day; "Lista"
 * keeps the study order. A session opens a panel with what can be done next.
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

const DIALOG_TITLES: Record<SessionState, string> = {
  NOT_STARTED: "¿Qué quieres hacer?",
  IN_PROGRESS: "Tienes este test a medias",
  COMPLETED: "Sesión completada",
};

function SessionRow({ session, showOrder = false }: { session: SessionSummaryDTO; showOrder?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const draftAnswers = useQuizDraftCount(session.id);
  const state = sessionState(session, draftAnswers);
  const done = state === "COMPLETED";
  const StatusIcon = done ? CircleCheck : CircleDashed;
  const result = session.last_result ?? null;
  const resultDate = result ? parseApiDate(result.created_at) : null;
  const path = `/session/${session.id}`;

  function go(to: string, { clearDraft = false } = {}) {
    if (clearDraft) clearQuizDraft(session.id);
    setOpen(false);
    navigate(to);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="block w-full rounded-surface border border-line bg-surface-paper text-left transition-colors hover:border-line-strong hover:bg-surface-subtle motion-reduce:transition-none"
      >
        <span className="flex min-h-14 items-center gap-3 px-4 py-3">
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
          {done ? (
            <Badge color="green">Completada</Badge>
          ) : state === "IN_PROGRESS" ? (
            <Badge color="amber">En curso</Badge>
          ) : (
            <Badge>Pendiente</Badge>
          )}
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
        </span>
        {done && result && (
          <span className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-xs text-text-muted">
            {result.total > 0 ? (
              <>
                <span className="font-semibold text-text-primary">{Math.round(result.score)}% aciertos</span>
                <span className="text-state-correct">{result.correct} buenas</span>
                <span className="text-state-error">{result.total - result.correct} malas</span>
              </>
            ) : (
              <span>Solo tarjetas</span>
            )}
            {resultDate && <span>Realizado {formatTimeAgo(resultDate)}</span>}
          </span>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={DIALOG_TITLES[state]} description={session.topic_name}>
        {state === "NOT_STARTED" && (
          <>
            <Button type="button" onClick={() => go(path)}>Ver sesión</Button>
            <Button type="button" variant="secondary" onClick={() => go(`${path}?fase=test`)}>
              Ir al test
            </Button>
          </>
        )}
        {state === "IN_PROGRESS" && (
          <>
            <Button type="button" onClick={() => go(`${path}?fase=test`)}>
              Seguir desde la última pregunta no terminada
            </Button>
            <Button type="button" variant="secondary" onClick={() => go(`${path}?fase=test`, { clearDraft: true })}>
              Empezar test desde 0
            </Button>
          </>
        )}
        {state === "COMPLETED" && (
          <>
            <Button type="button" onClick={() => go(`${path}?fase=resultado`)}>Ver estadísticas</Button>
            <Button type="button" variant="secondary" onClick={() => go(`${path}?reintento=1`, { clearDraft: true })}>
              Empezar sesión de nuevo
            </Button>
          </>
        )}
      </Dialog>
    </>
  );
}
