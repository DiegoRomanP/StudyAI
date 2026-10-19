import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  CircleDashed,
  Coffee,
  Flame,
  ListChecks,
  Play,
  RotateCcw,
  Sun,
  Trophy,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { DashboardDTO, PlanDTO, SessionSummaryDTO } from "../../api/types";
import { useDashboard } from "../../hooks/queries";
import {
  dueReviewCount,
  parseApiDate,
  quizStreakDays,
  rankTopics,
  suggestedSessionDate,
  toDateKey,
  upcomingReviewCount,
  type SessionProgress,
} from "../../lib/studyProgress";
import { HelpTerm } from "../help/HelpTerm";
import { Badge, ButtonLink, Card, IconTile, ProgressRing, StepChain } from "../ui";

const BREAK_MINUTES = 5;

function formatSuggestedDay(date: Date | null) {
  if (!date) return null;
  const today = toDateKey(new Date());
  const key = toDateKey(date);
  if (key === today) return "Sugerida para hoy";
  const label = date.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });
  return key < today ? `Pendiente desde el ${label}` : `Sugerida para el ${label}`;
}

/** "Sesión de hoy": the next pending session and the real steps it will take. */
export function TodaySessionCard({ plan, session }: { plan: PlanDTO; session: SessionSummaryDTO }) {
  const suggested = formatSuggestedDay(suggestedSessionDate(plan, session));
  return (
    <section aria-labelledby="today-session-title">
      <Card variant="elevated" className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile icon={Sun} className="h-11 w-11" />
            <div className="min-w-0">
              <h2 id="today-session-title" className="font-display text-xl font-semibold text-text-primary">
                Sesión de hoy
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                {session.duration_minutes} min de estudio · {session.topic_name}
                {session.kind === "REVIEW" && <Badge color="brand">Repaso</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {plan.title}
                {suggested ? ` · ${suggested}` : ""}
              </p>
            </div>
          </div>
          <ButtonLink to={`/session/${session.id}`} className="shrink-0 self-start">
            <Play aria-hidden="true" className="h-4 w-4" />
            Comenzar sesión
          </ButtonLink>
        </div>
        <StepChain
          label="Pasos de la sesión"
          steps={[
            { label: "Estudio", detail: `${session.duration_minutes} min`, icon: BookOpen },
            { label: "Receso", detail: `${BREAK_MINUTES} min`, icon: Coffee },
            { label: "Test", detail: "Tarjetas y opción múltiple", icon: ListChecks },
            { label: "Resultado", detail: "Repaso espaciado", icon: Trophy },
          ]}
        />
      </Card>
    </section>
  );
}

/** Shown when every session of the ready plans is completed. */
export function AllSessionsDoneCard({ plan }: { plan: PlanDTO }) {
  return (
    <section aria-labelledby="all-done-title">
      <Card variant="elevated" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <IconTile icon={Trophy} tone="success" className="h-11 w-11" />
          <div>
            <h2 id="all-done-title" className="font-display text-xl font-semibold text-text-primary">
              Completaste todas tus sesiones
            </h2>
            <p className="mt-0.5 text-sm text-text-muted">
              Último plan: {plan.title}. Repasa lo que falló o prepara un plan nuevo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/dashboard" variant="secondary">
            Ver estadísticas
          </ButtonLink>
          <ButtonLink to={`/plan/${plan.id}`} variant="ghost">
            Ver plan
          </ButtonLink>
        </div>
      </Card>
    </section>
  );
}

export function ProgressOverviewCard({
  progress,
  dashboard,
}: {
  progress: SessionProgress;
  dashboard: DashboardDTO | undefined;
}) {
  const due = dueReviewCount(dashboard);
  const scheduled = upcomingReviewCount(dashboard);
  const streak = quizStreakDays(dashboard);
  return (
    <section aria-labelledby="progress-title">
      <Card className="h-full space-y-4">
        <h2 id="progress-title" className="font-display text-lg font-semibold text-text-primary">
          Progreso general
        </h2>
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <ProgressRing value={progress.percent} label="Sesiones completadas" caption="Sesiones completadas" />
          <dl className="grid w-full gap-3 text-sm">
            <ProgressRow icon={CircleCheck} label="Completadas" value={progress.completed} />
            <ProgressRow icon={CircleDashed} label="Pendientes" value={progress.pending} />
            <ProgressRow
              icon={RotateCcw}
              label="Tarjetas por repasar hoy"
              value={due}
              hint={scheduled > due ? `${scheduled} próximas programadas` : undefined}
            />
            <ProgressRow icon={Flame} label="Racha de días con test" value={streak} />
          </dl>
        </div>
      </Card>
    </section>
  );
}

function ProgressRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-action-hover" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <dt className="text-text-muted">{label}</dt>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <dd className="font-display text-lg font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

/** "Enfoque Pareto": the AI's relevance estimate for the plan's prioritized topics. */
export function ParetoFocusCard({ plan, limit = 5 }: { plan: PlanDTO; limit?: number }) {
  const topics = rankTopics(plan.topics).filter((topic) => topic.selected).slice(0, limit);
  return (
    <section aria-labelledby="pareto-title">
      <Card className="h-full space-y-4">
        <div>
          <h2 id="pareto-title" className="font-display text-lg font-semibold text-text-primary">
            Enfoque Pareto (80/20)
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            <HelpTerm term="relevancia">Relevancia</HelpTerm> estimada por la IA para tu material. Es una
            heurística, no una garantía.
          </p>
        </div>
        {topics.length === 0 ? (
          <p className="text-sm text-text-muted">Este plan no tiene temas priorizados.</p>
        ) : (
          <ul className="space-y-3">
            {topics.map((topic) => (
              <li key={topic.id} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text-primary">{topic.name}</span>
                  <span className="shrink-0 font-medium text-text-muted">{topic.relevancePercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-flow" style={{ width: `${topic.relevancePercent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          to={`/plan/${plan.id}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-action hover:underline"
        >
          Ver el plan completo
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </Card>
    </section>
  );
}

const PLAN_STATUS = {
  PROCESSING: { label: "Generando", color: "amber" },
  READY: { label: "Listo", color: "green" },
  FAILED: { label: "Error", color: "red" },
} as const;

export function RecentPlans({ plans, limit = 3 }: { plans: PlanDTO[]; limit?: number }) {
  const recent = [...plans]
    .sort((a, b) => (parseApiDate(b.created_at)?.getTime() ?? 0) - (parseApiDate(a.created_at)?.getTime() ?? 0) || b.id - a.id)
    .slice(0, limit);
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-plans-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-plans-title" className="font-display text-lg font-semibold text-text-primary">
          Tus planes
        </h2>
        <Link to="/plan" className="inline-flex min-h-11 items-center text-sm text-action hover:underline">
          Ver todos los planes
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {recent.map((plan) => {
          const completed = plan.sessions.filter((session) => session.status === "COMPLETED").length;
          const status = PLAN_STATUS[plan.status];
          return (
            <li key={plan.id}>
              <Link
                to={`/plan/${plan.id}`}
                className="flex h-full flex-col gap-2 rounded-surface border border-line bg-surface-paper p-4 transition-colors hover:border-line-strong motion-reduce:transition-none"
              >
                <span className="line-clamp-2 font-medium text-text-primary">{plan.title}</span>
                <span className="mt-auto flex items-center justify-between gap-2 text-xs text-text-muted">
                  <span>
                    {plan.status === "FAILED"
                      ? "Ver qué falló →"
                      : plan.status === "PROCESSING"
                        ? "Generando…"
                        : `${completed} de ${plan.sessions.length} sesiones`}
                  </span>
                  <Badge color={status.color}>{status.label}</Badge>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sidebar card: consecutive days with a graded quiz, from the dashboard scores. */
export function StudyStreakCard() {
  const { data } = useDashboard();
  if (!data) return null;
  const streak = quizStreakDays(data);
  return (
    <div className="flex items-center gap-3 rounded-surface border border-line bg-surface-subtle/70 p-3">
      <IconTile icon={Flame} tone={streak > 0 ? "warning" : "muted"} className="h-9 w-9" />
      <div className="min-w-0 text-sm">
        {streak > 0 ? (
          <>
            <p className="font-medium text-text-primary">Estás en racha</p>
            <p className="text-xs text-text-muted">
              {streak === 1 ? "1 día con test" : `${streak} días seguidos con test`}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-text-primary">Empieza tu racha</p>
            <p className="text-xs text-text-muted">
              {data.scores.length === 0 ? "Tu racha empieza con tu primera sesión." : "Completa un test hoy."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
