import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, Spinner } from "../components/ui";
import { useDashboard } from "../hooks/queries";

export function DashboardPage() {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <Spinner label="Cargando dashboard…" />;

  const chartData = data.scores.map((s, i) => ({
    name: `S${i + 1}`,
    topic: s.topic_name,
    score: s.score,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-500">Tu progreso y próximas revisiones (SM-2).</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Sesiones completadas" value={String(data.sessions_completed)} />
        <StatCard label="Puntaje promedio" value={`${data.average_score}%`} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Puntaje por sesión</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400">
            Completa una sesión para ver tu evolución.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Temas más débiles</h2>
          {data.weak_topics.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-2">
              {data.weak_topics.map((t, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{t.topic_name}</span>
                  <span className="font-semibold text-red-600">{t.score}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Próximas revisiones</h2>
          {data.upcoming_reviews.length === 0 ? (
            <p className="text-sm text-slate-400">No hay revisiones programadas.</p>
          ) : (
            <ul className="space-y-2">
              {data.upcoming_reviews.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>{r.next_review_date}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
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
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-800">{value}</p>
    </Card>
  );
}
