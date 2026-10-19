import { useEffect, useRef } from "react";
import { Play } from "lucide-react";

import type { MasteryState, PlanTopicDTO, QuizResultDTO, SessionSummaryDTO } from "../../api/types";
import { parseApiDate } from "../../lib/studyProgress";
import { youtubeSearchUrl } from "../../lib/youtube";
import { Badge, ButtonLink, Card } from "../ui";

export function countRatedFlashcards(result: QuizResultDTO): number {
  return Object.values(result.detail).filter((entry) => entry.type === "flashcard").length;
}

const STATE_BADGES: Record<MasteryState, { label: string; color: "amber" | "brand" | "green" | "slate" }> = {
  SIN_DATOS: { label: "Sin datos", color: "slate" },
  REFORZAR: { label: "Reforzar", color: "amber" },
  EN_PROGRESO: { label: "En progreso", color: "brand" },
  DOMINADO: { label: "Dominado", color: "green" },
};

function formatDay(value: string) {
  return parseApiDate(value)?.toLocaleDateString("es", { day: "numeric", month: "short" }) ?? value;
}

/** Presentation only (no queries): the server-confirmed result and where the route goes next. */
export function SessionResult({
  result,
  planId,
  topic,
  nextSession = null,
  nextIsAvailable = false,
  reviewDate = null,
  keywords = [],
}: {
  result: QuizResultDTO;
  planId: number;
  topic?: PlanTopicDTO;
  nextSession?: SessionSummaryDTO | null;
  nextIsAvailable?: boolean;
  reviewDate?: string | null;
  keywords?: string[];
}) {
  const hasScore = result.total > 0;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const videos = [...new Set(keywords)];
  const showTopic = topic !== undefined && topic.mastery !== null;
  const mastered = topic?.mastery_state === "DOMINADO";

  // The submit button unmounts here; move focus so the result is announced.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="session-result-title">
      <Card className="space-y-4 text-center">
        <h2
          id="session-result-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-lg font-semibold text-text-primary"
        >
          Resultado
        </h2>
        {hasScore && (
          <div className="space-y-1">
            <p className="font-display text-5xl font-bold text-action-hover">{result.score}%</p>
            <p className="text-sm text-text-muted">
              {result.correct} de {result.total} correctas
            </p>
          </div>
        )}
        {showTopic && (
          <div className="space-y-1">
            <p className="font-medium text-text-primary">{topic.name}</p>
            <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-text-muted">
              Dominio {Math.round((topic.mastery ?? 0) * 100)} %
              <Badge color={STATE_BADGES[topic.mastery_state].color}>
                {STATE_BADGES[topic.mastery_state].label}
              </Badge>
            </p>
            {!mastered && reviewDate && (
              <p className="text-sm text-text-muted">Próximo repaso: {formatDay(reviewDate)}</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {nextSession && nextIsAvailable && (
            <ButtonLink to={`/session/${nextSession.id}`}>Siguiente sesión</ButtonLink>
          )}
          <ButtonLink to={`/plan/${planId}`} variant={nextSession && nextIsAvailable ? "secondary" : "primary"}>
            Ver plan
          </ButtonLink>
        </div>
        {videos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-muted">Vídeos</p>
            <ul className="flex flex-wrap justify-center gap-2">
              {videos.map((keyword) => (
                <li key={keyword}>
                  <a
                    href={youtubeSearchUrl(keyword)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-text-primary hover:border-action-hover hover:text-action-hover"
                  >
                    <Play aria-hidden="true" className="h-3.5 w-3.5" />
                    {keyword}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </section>
  );
}
