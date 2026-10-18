import { useState } from "react";
import { ArrowRight, Check, Circle } from "lucide-react";
import { Link } from "react-router-dom";

import { useOnboardingProgress } from "../../hooks/useOnboardingProgress";
import { readFlag, writeFlag } from "../../lib/onboardingStorage";
import { Button, Card, ProgressBar } from "../ui";

const DISMISSED_FLAG = "checklist-dismissed";

/**
 * "Primeros pasos" on Inicio: the real setup progress and the next step, until the
 * first session is completed or the learner hides it.
 */
export function GettingStarted() {
  const progress = useOnboardingProgress();
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_FLAG) === "1");

  if (progress.isLoading || progress.allDone || dismissed) return null;

  const nextId = progress.steps.find((step) => !step.done)?.id;

  return (
    <section aria-labelledby="getting-started-title">
      <Card variant="glass" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="getting-started-title" className="font-display text-lg font-semibold text-text-primary">
              Primeros pasos
            </h2>
            <p className="text-sm text-text-muted">
              {progress.completed} de {progress.total} completados
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="!min-h-10 !py-2"
            onClick={() => {
              writeFlag(DISMISSED_FLAG, "1");
              setDismissed(true);
            }}
          >
            Ocultar
          </Button>
        </div>
        <ProgressBar value={(progress.completed / progress.total) * 100} label="Progreso de primeros pasos" />
        <ol className="space-y-2">
          {progress.steps.map((step) => {
            const isNext = step.id === nextId;
            return (
              <li key={step.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {step.done ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-state-success-subtle text-state-success"
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Circle aria-hidden="true" className="h-6 w-6 shrink-0 text-text-muted" strokeWidth={1.5} />
                )}
                {step.done ? (
                  <span className="text-sm text-text-muted">
                    {step.label}
                    <span className="sr-only"> (hecho)</span>
                  </span>
                ) : (
                  <Link
                    to={step.to}
                    className={`inline-flex min-h-11 items-center gap-1.5 text-sm hover:underline ${
                      isNext ? "font-semibold text-action" : "text-text-primary"
                    }`}
                  >
                    {step.label}
                    {isNext && (
                      <>
                        <span className="rounded-full bg-action-subtle px-2 py-0.5 text-xs font-medium text-action">
                          Siguiente
                        </span>
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </>
                    )}
                  </Link>
                )}
                {step.id === "ia" && !step.done && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!min-h-9 !px-3 !py-1.5"
                    onClick={progress.acceptDemo}
                  >
                    Seguir con el modo demo
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
