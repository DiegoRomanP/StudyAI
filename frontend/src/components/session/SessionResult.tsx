import { useEffect, useRef } from "react";

import type { QuizResultDTO } from "../../api/types";
import { ButtonLink, Card } from "../ui";

export function countRatedFlashcards(result: QuizResultDTO): number {
  return Object.values(result.detail).filter((entry) => entry.type === "flashcard").length;
}

/** Shows the result the server confirmed for this submission. */
export function SessionResult({ result, planId }: { result: QuizResultDTO; planId: number }) {
  const ratedFlashcards = countRatedFlashcards(result);
  const hasScore = result.total > 0;
  const headingRef = useRef<HTMLHeadingElement>(null);

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
          Resultado del test
        </h2>
        {hasScore && (
          <div className="space-y-1">
            <p className="font-display text-5xl font-bold text-action-hover">{result.score}%</p>
            <p className="text-sm text-text-muted">
              {result.correct} de {result.total} preguntas de opción múltiple correctas
            </p>
          </div>
        )}
        {ratedFlashcards > 0 && (
          <p className="text-sm text-text-muted">
            {ratedFlashcards === 1
              ? "1 flashcard calificada"
              : `${ratedFlashcards} flashcards calificadas`}
            ; sus próximos repasos se reprogramaron con SM-2.
          </p>
        )}
        <p className="text-sm text-text-muted">El resultado quedó guardado en tu progreso.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to="/dashboard">Ver estadísticas</ButtonLink>
          <ButtonLink to={`/plan/${planId}`} variant="secondary">
            Volver al plan
          </ButtonLink>
        </div>
      </Card>
    </section>
  );
}
