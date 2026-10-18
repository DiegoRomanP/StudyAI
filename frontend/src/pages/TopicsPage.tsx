import { ChartNoAxesColumnDecreasing, Info } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import type { PlanDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { Alert, Badge, ButtonLink, Card, IconTile, Select, Skeleton } from "../components/ui";
import { usePlans } from "../hooks/queries";
import { rankTopics, readyPlans } from "../lib/studyProgress";

/**
 * "Temas clave": the AI's topic analysis for one plan, exactly as the backend
 * stored it (relevance 0–1, difficulty 1–5, subtopics, Pareto selection).
 */
export function TopicsPage() {
  const plansQuery = usePlans();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <IconTile icon={ChartNoAxesColumnDecreasing} className="h-11 w-11" />
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary sm:text-3xl">Temas clave</h1>
          <p className="mt-1 max-w-reading text-text-muted">
            Qué temas de tu material priorizó la IA y por qué. Los porcentajes son su estimación de
            relevancia, no una garantía de que esos temas den el 80 % del resultado.
          </p>
        </div>
      </header>

      <AsyncState
        data={plansQuery.data}
        isLoading={plansQuery.isPending}
        isError={plansQuery.isError}
        isFetching={plansQuery.isFetching}
        isEmpty={(plans) => readyPlans(plans).length === 0}
        loading={<Skeleton height={240} />}
        loadingLabel="Cargando temas"
        empty={
          <Card className="space-y-3">
            <p className="text-text-muted">Todavía no tienes un plan listo para analizar.</p>
            <ButtonLink to="/inicio">Prepara tu plan en Inicio</ButtonLink>
          </Card>
        }
        onRetry={() => void plansQuery.refetch()}
        initialErrorMessage="No se pudieron cargar tus planes."
        updateErrorMessage="No se pudieron actualizar tus planes. Se muestran los últimos cargados."
      >
        {(plans) => {
          const ready = readyPlans(plans);
          const requested = Number(searchParams.get("plan"));
          const plan = ready.find((item) => item.id === requested) ?? ready[0];
          const requestedMissing = searchParams.has("plan") && plan.id !== requested;
          return (
            <div className="space-y-4">
              {requestedMissing && (
                <Alert tone="info">
                  <p>Ese plan no está disponible o aún no está listo; se muestra tu plan más reciente.</p>
                </Alert>
              )}
              {ready.length > 1 && (
                <Select
                  id="topics-plan"
                  label="Plan"
                  value={plan.id}
                  onChange={(event) => setSearchParams({ plan: event.target.value }, { replace: true })}
                >
                  {ready.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </Select>
              )}
              <TopicAnalysis plan={plan} />
            </div>
          );
        }}
      </AsyncState>
    </div>
  );
}

function TopicAnalysis({ plan }: { plan: PlanDTO }) {
  const topics = rankTopics(plan.topics);
  const prioritized = topics.filter((topic) => topic.selected);
  const others = topics.filter((topic) => !topic.selected);
  const sessionCount = (name: string) =>
    plan.sessions.filter((session) => session.topic_name.trim().toLowerCase() === name.trim().toLowerCase())
      .length;

  if (topics.length === 0) {
    return <Card className="text-text-muted">Este plan no tiene un análisis de temas guardado.</Card>;
  }

  return (
    <div className="space-y-6">
      <Card variant="glass" className="flex items-start gap-3 text-sm text-text-muted">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-action-hover" />
        <p>
          <Link to={`/plan/${plan.id}`} className="font-medium text-action hover:underline">
            {plan.title}
          </Link>
          : {prioritized.length} de {topics.length} temas priorizados. La IA estima relevancia y
          dificultad a partir de tu material; las sesiones se crean sobre los temas priorizados.
        </p>
      </Card>

      <TopicList title="Priorizados" topics={prioritized} sessionCount={sessionCount} highlighted />
      {others.length > 0 && (
        <TopicList title="Fuera de la selección" topics={others} sessionCount={sessionCount} />
      )}
    </div>
  );
}

function TopicList({
  title,
  topics,
  sessionCount,
  highlighted = false,
}: {
  title: string;
  topics: ReturnType<typeof rankTopics>;
  sessionCount: (name: string) => number;
  highlighted?: boolean;
}) {
  const headingId = `topics-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="font-display text-lg font-semibold text-text-primary">
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {topics.map((topic) => {
          const sessions = sessionCount(topic.name);
          return (
            <li key={topic.id}>
              <Card className="h-full space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words font-medium text-text-primary">{topic.name}</h3>
                  {highlighted ? <Badge color="brand">Prioritario</Badge> : <Badge>No priorizado</Badge>}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm text-text-muted">
                    <span>Relevancia estimada</span>
                    <span className="font-medium text-text-primary">{topic.relevancePercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${highlighted ? "bg-flow" : "bg-line-strong"}`}
                      style={{ width: `${topic.relevancePercent}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-text-muted">
                  Dificultad estimada: {topic.difficulty} de 5
                  {sessions > 0 && ` · ${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`}
                </p>
                {topic.subtopics.length > 0 && (
                  <ul aria-label={`Subtemas de ${topic.name}`} className="flex flex-wrap gap-1.5">
                    {topic.subtopics.map((subtopic) => (
                      <li key={subtopic} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-text-muted">
                        {subtopic}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
