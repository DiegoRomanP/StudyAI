import type { QuizQuestionDTO, QuizResultDTO } from "../../api/types";
import { Badge, Card } from "../ui";
import { ChoiceOptions } from "./ChoiceOptions";
import { QUALITY_SHORT_LABELS } from "./QuizPhase";
import { SafeMarkdown } from "./SafeMarkdown";

/**
 * Question-by-question review of a submitted test: each multiple-choice question with
 * the learner's pick (red if wrong) and the right answer (green), and each flashcard
 * with its rating. Questions the quiz no longer has (replaced by a reinforcement) are skipped.
 */
export function AnswerReview({ questions, result }: { questions: QuizQuestionDTO[]; result: QuizResultDTO }) {
  const reviewed = questions.filter((question) => result.detail[String(question.id)] !== undefined);
  if (reviewed.length === 0) return null;

  return (
    <section aria-labelledby="answer-review-title" className="space-y-3">
      <h2 id="answer-review-title" className="font-display text-lg font-semibold text-text-primary">
        Tus respuestas
      </h2>
      <ol className="space-y-3">
        {reviewed.map((question, position) => {
          const entry = result.detail[String(question.id)];
          return (
            <li key={question.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-muted">Pregunta {position + 1}</span>
                  {entry.type === "multiple_choice" ? (
                    entry.correct ? <Badge color="green">Correcta</Badge> : <Badge color="red">Incorrecta</Badge>
                  ) : (
                    <Badge>Tarjeta</Badge>
                  )}
                </div>
                <div className="prose-study max-w-none font-medium text-text-primary">
                  <SafeMarkdown>{question.prompt}</SafeMarkdown>
                </div>
                {entry.type === "multiple_choice" ? (
                  <ChoiceOptions
                    label={`Opciones de la pregunta ${position + 1}`}
                    options={question.options}
                    selected={entry.selected}
                    onSelect={() => undefined}
                    expected={entry.expected}
                  />
                ) : (
                  <div className="space-y-1 text-sm">
                    <p className="text-text-primary">{question.answer}</p>
                    <p className="text-text-muted">
                      Tu valoración: {entry.quality} · {QUALITY_SHORT_LABELS[entry.quality] ?? ""}
                    </p>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
