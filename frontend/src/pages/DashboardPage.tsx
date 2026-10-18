import { useState } from "react";
import {
  CalendarClock,
  ChartColumn,
  CircleCheckBig,
  Flame,
  ListChecks,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { HelpTerm } from "../components/help/HelpTerm";
import { Button, ButtonLink, Card, IconTile, SegmentedControl, Skeleton, StatTile } from "../components/ui";
import { useDashboard, usePlans } from "../hooks/queries";
import { findNextSession, parseApiDate, quizStreakDays } from "../lib/studyProgress";
import { accuracyTrend, averageScore, scoresInRange, type StatsRange } from "../lib/studyStats";

const RANGE_LABELS: Record<StatsRange, string> = {
  "7d": "últimos 7 días",
  "30d": "últimos 30 días",
  all: "todo el historial",
};

const AXIS_TICK = { fontSize: 12, fill: "rgb(var(--color-text-muted))" };

/** Weak-topic tone by score: the backend lists every graded topic, weakest first. */
function scoreTone(score: number) {
  if (score < 60) return { text: "text-state-error", bar: "bg-state-error" };
  if (score < 80) return { text: "text-state-warning", bar: "bg-state-warning" };
  return { text: "text-state-success", bar: "bg-state-success" };
}

/** Nothing to show yet: no graded test and no completed session. */
function hasNoProgress(data: DashboardDTO) {
  return data.scores.length === 0 && data.sessions_completed === 0;
}

function shortDate(value: string | null) {
  const date = parseApiDate(value);
  return date ? date.toLocaleDateString("es", { day: "numeric", month: "short" }) : "Sin fecha";
}

export function DashboardPage() {
  const { data, isPending, isError, isFetching, refetch } = useDashboard();
  const [range, setRange] = useState<StatsRange>("7d");
  const showRange = data !== undefined && !hasNoProgress(data);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <IconTile icon={ChartColumn} className="h-11 w-11" />
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">Estadísticas</h1>
            <p className="mt-1 text-text-muted">
              Tu progreso en los tests y tus próximos <HelpTerm term="repaso">repasos</HelpTerm>.
            </p>
          </div>
        </div>
        {showRange && (
          <SegmentedControl
            label="Periodo"
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7 días" },
              { value: "30d", label: "30 días" },
              { value: "all", label: "Todo" },
            ]}
          />
        )}
      </header>
      <AsyncState
        data={data}
        isLoading={isPending}
        isError={isError}
        isFetching={isFetching}
        loading={<Skeleton height={256} />}
        loadingLabel="Cargando progreso"
        empty={null}
        onRetry={() => void refetch()}
        initialErrorMessage="No se pudo cargar tu progreso."
        updateErrorMessage="No se pudo actualizar tu progreso. Se muestran los últimos datos cargados."
      >
        {(dashboard) =>
          hasNoProgress(dashboard) ? (
            <DashboardEmpty />
          ) : (
            <DashboardContent data={dashboard} range={range} onShowAll={() => setRange("all")} />
          )
        }
      </AsyncState>
    </div>
  );
}

function DashboardEmpty() {
  const { data: plans } = usePlans();
  const next = findNextSession(plans);
  return (
    <EmptyState
      icon={ChartColumn}
      title="Aquí verás tu progreso"
      description="Cuando completes tu primera sesión aparecerán tus aciertos, tu racha y tus próximos repasos."
      action={
        next ? (
          <ButtonLink to={`/session/${next.session.id}`}>Ir a mi siguiente sesión</ButtonLink>
        ) : (
          <ButtonLink to="/inicio#preparar-plan">Preparar mi plan</ButtonLink>
        )
      }
    />
  );
}

function DashboardContent({
  data,
  range,
  onShowAll,
}: {
  data: DashboardDTO;
  range: StatsRange;
  onShowAll: () => void;
}) {
  const scores = scoresInRange(data, range);
  const average = averageScore(scores);
  const trend = accuracyTrend(data, range);
  const streak = quizStreakDays(data);
  const chartData = scores.map((score, index) => ({
    key: `${score.session_id}-${index}`,
    name: shortDate(score.completed_at),
    topic: score.topic_name,
    score: score.score,
  }));

  return (
    <div className="space-y-6">
      <section aria-label="Resumen del periodo" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ListChecks} label="Tests resueltos" value={scores.length} hint={RANGE_LABELS[range]} />
        <StatTile
          icon={Target}
          tone="flow"
          label={<HelpTerm term="precision">Precisión media</HelpTerm>}
          value={average === null ? "—" : `${average}%`}
          hint={
            trend === null ? (
              "en preguntas de opción múltiple"
            ) : (
              <span className="inline-flex items-center gap-1">
                {trend >= 0 ? (
                  <TrendingUp aria-hidden="true" className="h-3.5 w-3.5 text-state-success" />
                ) : (
                  <TrendingDown aria-hidden="true" className="h-3.5 w-3.5 text-state-error" />
                )}
                {trend >= 0 ? "+" : "−"}
                {Math.abs(trend)} pts vs. el periodo anterior
              </span>
            )
          }
        />
        <StatTile
          icon={Flame}
          tone="warning"
          label="Racha actual"
          value={`${streak} ${streak === 1 ? "día" : "días"}`}
          hint="días seguidos con test"
        />
        <StatTile
          icon={CircleCheckBig}
          tone="success"
          label="Sesiones completadas"
          value={data.sessions_completed}
          hint="en total"
        />
      </section>

      <Card>
        <h2 className="mb-3 font-display text-lg font-semibold text-text-primary">Precisión por test</h2>
        {data.scores.length === 0 ? (
          <p className="text-sm text-text-muted">Completa el test de una sesión para ver tu evolución.</p>
        ) : chartData.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">No resolviste tests en los {RANGE_LABELS[range]}.</p>
            <Button type="button" variant="secondary" onClick={onShowAll}>
              Ver todo el historial
            </Button>
          </div>
        ) : (
          <>
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(var(--color-action-primary))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="rgb(var(--color-action-primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS_TICK} stroke="rgb(var(--color-line))" />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} stroke="rgb(var(--color-line))" />
                  <Tooltip
                    contentStyle={{
                      background: "rgb(var(--color-surface-elevated))",
                      border: "1px solid rgb(var(--color-line))",
                      borderRadius: 12,
                      color: "rgb(var(--color-text-primary))",
                    }}
                    labelStyle={{ color: "rgb(var(--color-text-muted))" }}
                    formatter={(value: number) => [`${value}%`, "Precisión"]}
                    labelFormatter={(label, payload) => {
                      const topic = payload?.[0]?.payload?.topic;
                      return topic ? `${label} · ${topic}` : String(label);
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="rgb(var(--color-action-primary))"
                    strokeWidth={2}
                    fill="url(#score-fill)"
                    dot={{ r: 3, fill: "rgb(var(--color-action-primary))" }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 text-text-muted">Ver datos en tabla</summary>
              <table className="mt-2 w-full text-left" aria-label="Puntaje por sesión">
                <thead>
                  <tr className="text-text-muted">
                    <th scope="col" className="py-1 font-medium">Fecha</th>
                    <th scope="col" className="py-1 font-medium">Tema</th>
                    <th scope="col" className="py-1 text-right font-medium">Precisión</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((point) => (
                    <tr key={point.key} className="border-t border-line">
                      <td className="py-1 pr-2">{point.name}</td>
                      <td className="break-words py-1 pr-2">{point.topic}</td>
                      <td className="py-1 text-right">{point.score}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-primary">Temas más débiles</h2>
          <p className="mb-3 text-xs text-text-muted">Según todo tu historial de tests.</p>
          {data.weak_topics.length === 0 ? (
            <p className="text-sm text-text-muted">Aparecerán cuando respondas preguntas de opción múltiple.</p>
          ) : (
            <ul className="space-y-3">
              {data.weak_topics.map((topic, index) => {
                const tone = scoreTone(topic.score);
                return (
                  <li key={`${index}-${topic.topic_name}`} className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{topic.topic_name}</span>
                      <span className={`font-semibold ${tone.text}`}>{topic.score}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, topic.score))}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <CalendarClock aria-hidden="true" className="h-5 w-5 text-action-hover" />
            Próximas revisiones
          </h2>
          <p className="-mt-2 mb-3 text-xs text-text-muted">
            Las <HelpTerm term="flashcard">tarjetas</HelpTerm> que te toca repasar cada día.
          </p>
          {data.upcoming_reviews.length === 0 ? (
            <p className="text-sm text-text-muted">Al completar una sesión programaremos tus repasos aquí.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_reviews.map((review) => (
                <li key={review.next_review_date} className="flex items-center justify-between text-sm">
                  <span>{shortDate(review.next_review_date)}</span>
                  <span className="rounded-full bg-action-subtle px-2 py-0.5 text-xs font-medium text-action">
                    {review.count} tarjeta{review.count !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
