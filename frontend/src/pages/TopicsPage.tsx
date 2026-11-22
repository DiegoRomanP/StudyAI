import { CalendarDays, ChartNoAxesColumnDecreasing, SearchX } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import type { PlanDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { PageHeader, Alert, ButtonLink, Card, Select, Skeleton } from "../components/ui";
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
      <PageHeader icon={ChartNoAxesColumnDecreasing} title="Temas clave" help="temas" />

      <AsyncState
        data={plansQuery.data}
        isLoading={plansQuery.isPending}
        isError={plansQuery.isError}
        isFetching={plansQuery.isFetching}
        isEmpty={(plans) => readyPlans(plans).length === 0}
        loading={
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton height={240} />
            <Skeleton height={240} />
          </div>
        }
        loadingLabel="Cargando temas"
        empty={
          <Card className="space-y-3">
            <p className="text-text-muted">Todavía no tienes un plan listo para analizar.</p>
            <ButtonLink to="/inicio#preparar-plan">Prepara tu plan en Inicio</ButtonLink>
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
    return (
      <EmptyState
        icon={SearchX}
        title="Este plan no tiene análisis de temas"
        description="La IA no guardó temas para este plan. Sus sesiones siguen disponibles."
        action={
          <ButtonLink to={`/plan/${plan.id}`} variant="secondary">
            Ver mi plan
          </ButtonLink>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        <Link to={`/plan/${plan.id}`} className="font-medium text-action hover:underline">
          {plan.title} →
        </Link>{" "}
        · {prioritized.length} de {topics.length} priorizados
      </p>

      <TopicList title="Priorizados" topics={prioritized} sessionCount={sessionCount} highlighted />
      {others.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer font-display text-lg font-semibold text-text-primary">
            Fuera de la selección · {others.length}
          </summary>
          <div className="mt-3">
            <TopicList title="Fuera de la selección" topics={others} sessionCount={sessionCount} hideTitle />
          </div>
        </details>
      )}
    </div>
  );
}

function TopicList({
  title,
  topics,
  sessionCount,
  highlighted = false,
  hideTitle = false,
}: {
  title: string;
  topics: ReturnType<typeof rankTopics>;
  sessionCount: (name: string) => number;
  highlighted?: boolean;
  hideTitle?: boolean;
}) {
  const headingId = `topics-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2
        id={headingId}
        className={hideTitle ? "sr-only" : "font-display text-lg font-semibold text-text-primary"}
      >
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {topics.map((topic) => {
          const sessions = sessionCount(topic.name);
          return (
            <li key={topic.id}>
              <Card className="h-full space-y-3">
                <h3 className="min-w-0 break-words font-medium text-text-primary">{topic.name}</h3>
                <div className="space-y-1">
                  <div className="text-right text-sm font-medium text-text-primary">{topic.relevancePercent} %</div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${highlighted ? "bg-flow" : "bg-line-strong"}`}
                      style={{ width: `${topic.relevancePercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-text-muted">
                  <span role="img" aria-label={`Dificultad ${topic.difficulty} de 5`} className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${n <= topic.difficulty ? "bg-text-primary" : "bg-surface-muted"}`}
                      />
                    ))}
                  </span>
                  {sessions > 0 && (
                    <span
                      className="flex items-center gap-1"
                      aria-label={`${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`}
                    >
                      <CalendarDays aria-hidden="true" className="h-4 w-4" />
                      {sessions}
                    </span>
                  )}
                </div>
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
