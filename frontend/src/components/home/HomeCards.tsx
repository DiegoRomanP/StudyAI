import {
  ArrowRight,
  BookOpen,
  Coffee,
  FileUp,
  Flame,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Sun,
  Target,
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
  sessionProgress,
  suggestedSessionDate,
  toDateKey,
  type SessionProgress,
} from "../../lib/studyProgress";
import { HelpTerm } from "../help/HelpTerm";
import { Badge, Button, ButtonLink, Card, IconTile, Skeleton, StepChain } from "../ui";

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
export function TodaySessionCard({
  plan,
  session,
  examLabel,
}: {
  plan: PlanDTO;
  session: SessionSummaryDTO;
  examLabel?: string | null;
}) {
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
                {examLabel ? ` · ${examLabel}` : ""}
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
export function AllSessionsDoneCard({ plan, onNewPlan }: { plan: PlanDTO; onNewPlan: () => void }) {
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
          <Button type="button" onClick={onNewPlan}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Preparar plan nuevo
          </Button>
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

/** Secondary shortcuts under the main action: Inicio is where you start, not a page to read. */
export function QuickActions({ dueReviews, onNewPlan }: { dueReviews: number; onNewPlan: () => void }) {
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Button type="button" variant="secondary" onClick={onNewPlan}>
        <Plus aria-hidden="true" className="h-4 w-4" />
        Nuevo plan
      </Button>
      <ButtonLink to="/goals?nueva=1" variant="secondary">
        <Target aria-hidden="true" className="h-4 w-4" />
        Nueva meta
      </ButtonLink>
      <ButtonLink to="/documents" variant="secondary">
        <FileUp aria-hidden="true" className="h-4 w-4" />
        Subir material
      </ButtonLink>
      {dueReviews > 0 && (
        <ButtonLink to="/practica" variant="secondary">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Repasar {dueReviews} {dueReviews === 1 ? "tarjeta" : "tarjetas"}
        </ButtonLink>
      )}
    </nav>
  );
}

/** One compact strip: progress numbers plus the three prioritized topics. */
export function StudyPulse({
  progress,
  dashboard,
  plan,
  examLabel,
}: {
  progress: SessionProgress;
  dashboard: DashboardDTO | undefined;
  plan: PlanDTO;
  examLabel: string | null;
}) {
  const due = dueReviewCount(dashboard);
  const streak = quizStreakDays(dashboard);
  const topics = rankTopics(plan.topics).filter((topic) => topic.selected).slice(0, 3);
  return (
    <section aria-label="Tu progreso">
      <Card className="space-y-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <PulseItem label="Sesiones" value={`${progress.completed}/${progress.total}`} />
          <PulseItem label="Por repasar hoy" value={String(due)} />
          <PulseItem label="Racha" value={streak === 1 ? "1 día" : `${streak} días`} />
          {examLabel && <PulseItem label="Examen" value={examLabel.replace(/^Examen /, "")} />}
        </dl>
        {topics.length > 0 && (
          <p className="text-sm text-text-muted">
            <HelpTerm term="relevancia">Prioridad</HelpTerm>:{" "}
            {topics.map((topic) => `${topic.name} ${topic.relevancePercent}%`).join(", ")}.{" "}
            <Link to="/temas" className="inline-flex min-h-11 items-center gap-1 text-action hover:underline">
              Ver temas clave
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </p>
        )}
      </Card>
    </section>
  );
}

function PulseItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-display text-lg font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

const PLAN_STATUS = {
  PROCESSING: { label: "Generando", color: "amber" },
  READY: { label: "Listo", color: "green" },
  FAILED: { label: "Incompleto", color: "red" },
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
          // Reviews are extra sessions: they never count as plan progress.
          const progress = sessionProgress([plan]);
          const status = PLAN_STATUS[plan.status];
          return (
            <li key={plan.id}>
              <Link
                to={`/plan/${plan.id}`}
                className="flex h-full flex-col gap-2 rounded-surface border border-line bg-surface-paper p-4 hover:border-line-strong transition-interactive duration-micro ease-flow motion-safe:active:scale-press active:duration-press"
              >
                <span className="line-clamp-2 font-medium text-text-primary">{plan.title}</span>
                <span className="mt-auto flex items-center justify-between gap-2 text-xs text-text-muted">
                  <span>
                    {plan.status === "FAILED"
                      ? "Continuar generación →"
                      : plan.status === "PROCESSING"
                        ? "Generando…"
                        : `${progress.completed} de ${progress.total} sesiones`}
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
  if (!data) return <Skeleton height={62} />;
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
