import { Link, useParams } from "react-router-dom";

import type { PlanTopicDTO, SessionSummaryDTO } from "../api/types";
import { Badge, Card, ProgressBar, Spinner } from "../components/ui";
import { usePlan } from "../hooks/queries";

export function PlanDetailPage() {
  const { planId } = useParams();
  const id = planId ? Number(planId) : null;
  const { data: plan, isLoading } = usePlan(id);

  if (isLoading || !plan) return <Spinner label="Cargando plan…" />;

  if (plan.status === "PROCESSING") {
    return (
      <div className="space-y-4">
        <Link to="/plan" className="text-sm text-brand-600 hover:underline">
          ← Volver
        </Link>
        <Card className="space-y-4 text-center">
          <div className="flex justify-center">
            <Spinner />
          </div>
          <h2 className="text-lg font-semibold">Generando tu plan…</h2>
          <p className="text-sm text-slate-500">
            La IA está analizando temas, seleccionando lo más relevante (Pareto) y
            creando sesiones con material y quizzes. Esto se actualiza solo.
          </p>
          <ProgressBar value={60} />
        </Card>
      </div>
    );
  }

  if (plan.status === "FAILED") {
    return (
      <Card>
        <p className="font-medium text-red-600">La generación falló.</p>
      </Card>
    );
  }

  const selectedTopics = plan.topics.filter((t) => t.selected);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/plan" className="text-sm text-brand-600 hover:underline">
          ← Volver
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{plan.title}</h1>
        <Badge color="green">Listo · {plan.sessions.length} sesiones</Badge>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          Temas prioritarios <span className="text-sm font-normal text-slate-400">(Pareto 20%)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {selectedTopics.map((t) => (
            <TopicChip key={t.id} topic={t} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sesiones</h2>
        {plan.sessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </section>
    </div>
  );
}

function TopicChip({ topic }: { topic: PlanTopicDTO }) {
  return (
    <span className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
      {topic.name}
      <span className="ml-2 text-xs text-brand-400">dif {topic.difficulty}</span>
    </span>
  );
}

function SessionCard({ session }: { session: SessionSummaryDTO }) {
  const done = session.status === "COMPLETED";
  return (
    <Link to={`/session/${session.id}`}>
      <Card className="flex items-center justify-between hover:border-brand-300">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
            {session.order_index + 1}
          </span>
          <div>
            <p className="font-medium text-slate-800">{session.topic_name}</p>
            <p className="text-xs text-slate-400">
              {session.duration_minutes} min · repaso a {session.review_offset_days} días
            </p>
          </div>
        </div>
        {done ? <Badge color="green">Completada</Badge> : <Badge>Pendiente</Badge>}
      </Card>
    </Link>
  );
}
