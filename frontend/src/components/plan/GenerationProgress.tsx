import { Check } from "lucide-react";

import type { GenerationStage, PlanDTO } from "../../api/types";
import { HelpTerm } from "../help/HelpTerm";
import { ActivityIndicator, ProgressBar } from "../ui";

type Progress = Pick<PlanDTO, "progress_stage" | "progress_done" | "progress_total">;

const STAGE_ORDER: GenerationStage[] = ["TOPICS", "SESSIONS", "CONTENT"];

/** What the AI is doing right now, from the stage the server reports (never a guess). */
export function generationLabel(plan: Progress): string {
  const done = plan.progress_done ?? 0;
  const total = plan.progress_total ?? 0;
  if (plan.progress_stage === "SESSIONS") return "Repartiendo las sesiones…";
  if (plan.progress_stage === "CONTENT") {
    return total > 0 ? `Preparando la sesión ${Math.min(done + 1, total)} de ${total}` : "Preparando las sesiones…";
  }
  return "Analizando tu material…";
}

export function GenerationProgress({
  stage,
  done,
  total,
}: {
  stage: GenerationStage | null;
  done: number;
  total: number;
}) {
  const current = STAGE_ORDER.indexOf(stage ?? "TOPICS");
  const steps = [
    "Leer tu material y detectar los temas",
    <>
      Elegir los <HelpTerm term="temasClave">temas clave</HelpTerm> y repartir las sesiones
    </>,
    "Preparar cada sesión con material y preguntas",
  ];

  return (
    <div className="space-y-4">
      <ActivityIndicator label={generationLabel({ progress_stage: stage, progress_done: done, progress_total: total })} />
      {/* Only real data draws a bar: there is no percentage before the sessions exist. */}
      {stage === "CONTENT" && total > 0 && (
        <ProgressBar value={Math.round((done / total) * 100)} label="Sesiones preparadas" />
      )}
      <section aria-labelledby="plan-generation-steps" className="space-y-2">
        <h2 id="plan-generation-steps" className="font-display text-lg font-semibold text-text-primary">
          Qué está haciendo la IA
        </h2>
        <ol className="space-y-1 text-sm">
          {steps.map((step, index) => (
            <li
              key={STAGE_ORDER[index]}
              aria-current={index === current ? "step" : undefined}
              className={`flex items-start gap-2 ${
                index === current ? "font-medium text-text-primary" : "text-text-muted"
              }`}
            >
              <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {index < current ? (
                  <Check className="h-4 w-4 text-state-success" />
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full ${index === current ? "bg-action" : "bg-line"}`}
                  />
                )}
              </span>
              <span>
                {step}
                {index < current && <span className="sr-only"> (hecho)</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
