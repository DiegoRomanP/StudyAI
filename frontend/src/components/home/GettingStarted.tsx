import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { useOnboardingProgress, type OnboardingStep } from "../../hooks/useOnboardingProgress";
import { readFlag, writeFlag } from "../../lib/onboardingStorage";
import { Button, Card } from "../ui";

const DISMISSED_FLAG = "checklist-dismissed";

const CHIP = "flex min-h-11 w-full min-w-0 flex-1 items-center gap-2 rounded-control border px-3 py-2 text-sm lg:px-2.5";

function StepMark({ step, index }: { step: OnboardingStep; index: number }) {
  const base = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (step.done) {
    return (
      <span aria-hidden="true" className={`${base} bg-state-success-subtle text-state-success`}>
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
    );
  }
  if (step.locked) {
    return (
      <span aria-hidden="true" className={`${base} bg-surface-muted text-text-muted`}>
        <Lock className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${base} bg-action-subtle text-action`}>
      {index + 1}
    </span>
  );
}

/**
 * "Primeros pasos" on Inicio: the real setup path as a horizontal journey where each step
 * points to the next and unlocks when the one before it is done. It stays until the first
 * session is completed or the learner hides it.
 */
export function GettingStarted() {
  const progress = useOnboardingProgress();
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_FLAG) === "1");

  if (progress.isLoading || progress.allDone || dismissed) return null;

  const ia = progress.steps.find((step) => step.id === "ia");
  const showDemoShortcut = ia !== undefined && !ia.done && !ia.locked;

  return (
    <section aria-labelledby="getting-started-title">
      <Card variant="glass" className="space-y-3 !p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="getting-started-title" className="font-display text-base font-semibold text-text-primary">
              Primeros pasos
            </h2>
            <p className="text-sm text-text-muted">
              {progress.completed} de {progress.total} completados
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="!min-h-9 !px-3 !py-1.5"
            onClick={() => {
              writeFlag(DISMISSED_FLAG, "1");
              setDismissed(true);
            }}
          >
            Ocultar
          </Button>
        </div>
        <ol className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-1">
          {progress.steps.map((step, index) => {
            const isNext = step.id === progress.nextId;
            const isLast = index === progress.steps.length - 1;
            const label = (
              <span className="min-w-0 flex-1 leading-5">
                {step.label}
                {step.done && <span className="sr-only"> (hecho)</span>}
                {step.locked && <span className="sr-only"> (bloqueado hasta completar el paso anterior)</span>}
                {isNext && (
                  <span className="mt-0.5 block text-xs font-medium text-action">
                    Siguiente
                  </span>
                )}
              </span>
            );
            return (
              <li key={step.id} className="flex min-w-0 flex-col gap-1 lg:basis-0 lg:flex-1">
                <div className="flex min-w-0 flex-1 items-stretch gap-1">
                  {step.done ? (
                    <div className={`${CHIP} border-line bg-surface-subtle text-text-muted`}>
                      <StepMark step={step} index={index} />
                      {label}
                    </div>
                  ) : step.locked ? (
                    <div className={`${CHIP} border-dashed border-line text-text-muted`}>
                      <StepMark step={step} index={index} />
                      {label}
                    </div>
                  ) : (
                    <Link
                      to={step.to}
                      className={`${CHIP} hover:underline ${
                        isNext
                          ? "border-action-hover bg-action-subtle font-semibold text-text-primary"
                          : "border-line bg-surface-paper text-text-primary"
                      }`}
                    >
                      <StepMark step={step} index={index} />
                      {label}
                    </Link>
                  )}
                  {!isLast && (
                    <ChevronRight
                      aria-hidden="true"
                      className="hidden h-4 w-4 shrink-0 self-center text-text-muted lg:block"
                    />
                  )}
                </div>
                {!isLast && (
                  <ChevronDown aria-hidden="true" className="mx-auto h-4 w-4 shrink-0 text-text-muted lg:hidden" />
                )}
              </li>
            );
          })}
        </ol>
        {showDemoShortcut && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
            ¿Sin clave de IA?
            <Button
              type="button"
              variant="secondary"
              className="!min-h-9 !px-3 !py-1.5"
              onClick={progress.acceptDemo}
            >
              Seguir con el modo demo
            </Button>
          </p>
        )}
      </Card>
    </section>
  );
}
