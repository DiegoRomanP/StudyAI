import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { Card, Skeleton } from "../components/ui";
import { useDashboard } from "../hooks/queries";

export function DashboardPage() {
  const { data, isPending, isError, isFetching, refetch } = useDashboard();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-text-muted">Tu progreso y próximas revisiones (SM-2).</p>
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
        {(dashboard) => <DashboardContent data={dashboard} />}
      </AsyncState>
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardDTO }) {
  const chartData = data.scores.map((s, i) => ({
    name: `S${i + 1}`,
    topic: s.topic_name,
    score: s.score,
  }));

  return (
    <div className="space-y-6">

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Sesiones completadas" value={String(data.sessions_completed)} />
        <StatCard label="Puntaje promedio" value={`${data.average_score}%`} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Puntaje por sesión</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-text-muted">
            Completa una sesión para ver tu evolución.
          </p>
        ) : (
          <>
          <div className="h-64 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, "Puntaje"]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.topic ?? ""
                  }
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="rgb(var(--color-action-primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-text-muted">Ver datos en tabla</summary>
            <table className="mt-2 w-full text-left" aria-label="Puntaje por sesión">
              <thead>
                <tr className="text-text-muted">
                  <th scope="col" className="py-1 font-medium">Sesión</th>
                  <th scope="col" className="py-1 font-medium">Tema</th>
                  <th scope="col" className="py-1 text-right font-medium">Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((point) => (
                  <tr key={point.name} className="border-t border-line">
                    <td className="py-1">{point.name}</td>
                    <td className="py-1">{point.topic}</td>
                    <td className="py-1 text-right">{point.score}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Temas más débiles</h2>
          {data.weak_topics.length === 0 ? (
            <p className="text-sm text-text-muted">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-2">
              {data.weak_topics.map((t, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{t.topic_name}</span>
                  <span className="font-semibold text-state-error">{t.score}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Próximas revisiones</h2>
          {data.upcoming_reviews.length === 0 ? (
            <p className="text-sm text-text-muted">No hay revisiones programadas.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_reviews.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>{r.next_review_date}</span>
                  <span className="rounded-full bg-action-subtle px-2 py-0.5 text-xs font-medium text-action">
                    {r.count} tarjeta{r.count !== 1 ? "s" : ""}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold text-text-primary">{value}</p>
    </Card>
  );
}
