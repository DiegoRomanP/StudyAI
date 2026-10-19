import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

import { getApiErrorMessage } from "../../api/errors";
import type { ReviewPoint, SessionDetailDTO } from "../../api/types";
import { useCancelReinforcement, useLlmRuntime, useStartReinforcement } from "../../hooks/queries";
import { useReinforceAlways } from "../../lib/reinforcePreference";
import { Alert, Button, Card, Spinner } from "../ui";
import { SafeMarkdown } from "./SafeMarkdown";

/** The questions the learner failed in the exam that created this review. */
export function ReviewPoints({ points }: { points: ReviewPoint[] }) {
  if (points.length === 0) return null;
  return (
    <section aria-labelledby="review-points-title" className="space-y-3">
      <h2 id="review-points-title" className="font-display text-lg font-semibold text-text-primary">
        Puntos a reforzar
      </h2>
      <ul className="space-y-3">
        {points.map((point, index) => (
          <li key={`${index}-${point.prompt}`} className="rounded-surface border border-line bg-surface-paper p-4">
            <div className="prose-study max-w-none font-medium text-text-primary">
              <SafeMarkdown>{point.prompt}</SafeMarkdown>
            </div>
            <p className="mt-1 text-sm text-text-muted">→ {point.answer}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Refuerza con IA": one AI call that replaces a review's material and test with content
 * built around the failed points. The server owns the state machine; this only shows it.
 */
export function ReviewPanel({ session }: { session: SessionDetailDTO }) {
  const runtime = useLlmRuntime();
  const start = useStartReinforcement();
  const cancel = useCancelReinforcement();
  const { always, setAlways } = useReinforceAlways();
  const [choosing, setChoosing] = useState(false);
  const autoStarted = useRef(false);
  const reasonId = useId();
  const choicesId = useId();

  const status = session.reinforcement_status;
  const noFreeUses = runtime.data?.bundled === true && runtime.data.free_ai?.remaining === 0;
  const runtimeKnown = runtime.data !== undefined;

  // "Siempre": launch once per visit, never on a retry or after the learner skipped the AI.
  useEffect(() => {
    if (!always || autoStarted.current || !runtimeKnown || noFreeUses || status !== "NONE") return;
    autoStarted.current = true;
    start.mutate(session.id);
  }, [always, runtimeKnown, noFreeUses, status, session.id, start]);

  if (status === "READY") return null;

  function launch(remember: boolean) {
    if (remember) setAlways(true);
    setChoosing(false);
    start.mutate(session.id);
  }

  return (
    <Card className="space-y-3" aria-labelledby="reinforce-title" role="region">
      <h2 id="reinforce-title" className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
        <Sparkles aria-hidden="true" className="h-5 w-5 text-action-hover" />
        Refuerza con IA
      </h2>
      <p className="text-sm text-text-muted">
        Usa IA para generar material de repaso en los puntos que has fallado.
      </p>

      {start.isError && <Alert tone="error">{getApiErrorMessage(start.error, "No se pudo iniciar el refuerzo.")}</Alert>}

      {status === "PROCESSING" ? (
        <div className="space-y-2">
          <Spinner label="Generando refuerzo…" />
          <Button type="button" variant="secondary" onClick={() => cancel.mutate(session.id)} disabled={cancel.isPending}>
            Seguir sin IA
          </Button>
        </div>
      ) : (
        <>
          {status === "FAILED" && (
            <Alert tone="error">
              <p>{session.reinforcement_error || "No se pudo generar el refuerzo."}</p>
            </Alert>
          )}
          {always && !noFreeUses && status === "NONE" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-text-primary">Siempre con IA</span>
              <Button type="button" variant="ghost" onClick={() => setAlways(false)}>
                Dejar de usar siempre
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                type="button"
                variant={status === "FAILED" ? "secondary" : "primary"}
                disabled={noFreeUses || start.isPending}
                aria-expanded={status === "FAILED" ? undefined : choosing}
                aria-controls={status === "FAILED" ? undefined : choicesId}
                aria-describedby={noFreeUses ? reasonId : undefined}
                onClick={() => (status === "FAILED" ? launch(false) : setChoosing((open) => !open))}
              >
                {status === "FAILED" ? "Reintentar con IA" : "Reforzar con IA"}
              </Button>
              {noFreeUses && (
                <p id={reasonId} className="text-sm text-text-muted">
                  Sin usos gratis hoy.{" "}
                  <Link to="/settings" className="font-medium text-action hover:underline">
                    Conectar IA
                  </Link>
                </p>
              )}
              {choosing && status !== "FAILED" && (
                <div id={choicesId} className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => launch(false)}>
                    Solo esta sesión
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => launch(true)}>
                    Siempre
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
