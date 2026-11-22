import { MessageCircleQuestion } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import type { AssistantQuestionDTO } from "../api/types";
import { AsyncState } from "../components/AsyncState";
import { EmptyState } from "../components/EmptyState";
import { SafeMarkdown } from "../components/session/SafeMarkdown";
import { PageHeader, Badge, Button, ButtonLink, Card, Select, Skeleton } from "../components/ui";
import { useAssistantQuestions } from "../hooks/queries";
import { useShowMore } from "../hooks/useShowMore";
import { parseApiDate } from "../lib/studyProgress";
import { formatTimeAgo } from "../lib/timeAgo";

/** "Mis preguntas": every doubt the learner asked the study assistant, with its reply. */
export function QuestionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useAssistantQuestions();
  const requested = Number(searchParams.get("plan")) || null;

  return (
    <div className="space-y-6">
      <PageHeader icon={MessageCircleQuestion} title="Mis preguntas" help="preguntas" />

      <AsyncState
        data={query.data}
        isLoading={query.isPending}
        isError={query.isError}
        isFetching={query.isFetching}
        isEmpty={(items) => items.length === 0}
        loading={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={88} />
            ))}
          </div>
        }
        loadingLabel="Cargando tus preguntas"
        empty={
          <EmptyState
            icon={MessageCircleQuestion}
            title="Todavía no le has preguntado nada al asistente"
            description="Abre una sesión y pulsa «Pregúntale al asistente» cuando te surja una duda."
            action={<ButtonLink to="/plan">Ir a mi plan</ButtonLink>}
          />
        }
        onRetry={() => void query.refetch()}
        initialErrorMessage="No se pudieron cargar tus preguntas."
        updateErrorMessage="No se pudieron actualizar tus preguntas. Se muestran las últimas cargadas."
      >
        {(items) => {
          const plans = [...new Map(items.map((item) => [item.plan_id, item.plan_title])).entries()];
          const shown = requested ? items.filter((item) => item.plan_id === requested) : items;
          return (
            <div className="space-y-4">
              {plans.length > 1 && (
                <Select
                  id="questions-plan"
                  label="Plan"
                  value={requested ?? ""}
                  onChange={(event) =>
                    setSearchParams(event.target.value ? { plan: event.target.value } : {}, { replace: true })
                  }
                >
                  <option value="">Todos los planes</option>
                  {plans.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </Select>
              )}
              <QuestionList items={shown} />
            </div>
          );
        }}
      </AsyncState>
    </div>
  );
}

function QuestionList({ items }: { items: AssistantQuestionDTO[] }) {
  const { visible, hiddenCount, showMore } = useShowMore(items);
  return (
    <>
      <ul className="space-y-3">
        {visible.map((item) => {
          const asked = parseApiDate(item.created_at);
          return (
            <li key={item.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  <Link to={`/session/${item.session_id}`} className="font-medium text-action hover:underline">
                    {item.topic_name}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>{item.plan_title}</span>
                  {asked && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formatTimeAgo(asked)}</span>
                    </>
                  )}
                  {item.mode === "EXAM" && <Badge color="amber">Durante el examen</Badge>}
                </div>
                <p className="whitespace-pre-wrap font-medium text-text-primary">{item.question}</p>
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-action">Ver la respuesta</summary>
                  <div className="prose-study mt-2 text-sm">
                    <SafeMarkdown>{item.answer}</SafeMarkdown>
                  </div>
                </details>
              </Card>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <Button type="button" variant="secondary" onClick={showMore}>
          Mostrar {hiddenCount} más
        </Button>
      )}
    </>
  );
}
