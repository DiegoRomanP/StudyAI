import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { formatTime, useTimer } from "../../hooks/useTimer";
import { useEnterAnimation } from "../motion/useEnterAnimation";
import { Button } from "../ui";

export function StudyPhase({
  topic,
  durationMinutes,
  exit,
  badge,
  aside,
  preview,
  startDisabledReason,
  children,
  onDone,
}: {
  topic: string;
  durationMinutes: number;
  exit: ReactNode;
  /** Next to the topic heading (e.g. "Repaso"). */
  badge?: ReactNode;
  /** Review sessions: a side card shown before starting (below the timer on mobile). */
  aside?: ReactNode;
  /** Review sessions: what will be reinforced, shown before starting. */
  preview?: ReactNode;
  /** When set, Empezar is disabled and this visible reason is linked to it. */
  startDisabledReason?: string;
  children: ReactNode;
  onDone: () => void;
}) {
  const { remaining, start, finish } = useTimer(durationMinutes * 60, onDone);
  const reasonId = useId();
  const withSide = aside !== undefined || preview !== undefined;
  const [started, setStarted] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // La intro se desmonta al empezar; cabecera compacta y material entran con `phase`.
  useEnterAnimation(headerRef, "phase", started, { skipFirst: true });
  useEnterAnimation(bodyRef, "phase", started, { skipFirst: true });

  useEffect(() => {
    if (started) doneRef.current?.focus();
  }, [started]);

  function begin() {
    start();
    setStarted(true);
  }

  return (
    <div>
      <div
        ref={headerRef}
        className={`sticky top-0 z-10 flex ${
          started
            ? "min-h-14 flex-row items-center justify-between gap-3 border-b border-line bg-surface-paper/95 backdrop-blur"
            : `${withSide ? "min-h-[60dvh]" : "min-h-[100dvh]"} flex-col items-center justify-center`
        }`}
      >
        <div className={started ? "" : "absolute left-0 top-2"}>{exit}</div>
        {!started && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="max-w-reading text-center text-2xl font-bold">{topic}</h1>
            {badge}
          </div>
        )}
        <div
          role="timer"
          aria-label="Tiempo restante"
          className={`font-mono font-semibold text-action-hover ${
            started ? "text-2xl" : "my-12 text-5xl"
          }`}
        >
          {formatTime(remaining)}
        </div>
        {started ? (
          <Button ref={doneRef} variant="secondary" onClick={finish}>
            Terminé
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              onClick={begin}
              disabled={startDisabledReason !== undefined}
              aria-describedby={startDisabledReason !== undefined ? reasonId : undefined}
            >
              Empezar
            </Button>
            {startDisabledReason !== undefined && (
              <p id={reasonId} className="text-sm text-text-muted">
                {startDisabledReason}
              </p>
            )}
          </div>
        )}
      </div>

      {!started && aside !== undefined && (
        <div className="mx-auto max-w-reading">{aside}</div>
      )}
      {!started && preview !== undefined && <div className="mx-auto mt-6 max-w-reading">{preview}</div>}

      {started && (
        <div ref={bodyRef} className="pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-center text-2xl font-bold">{topic}</h1>
            {badge}
          </div>
          <div className="prose-study mx-auto max-w-reading">{children}</div>
        </div>
      )}
    </div>
  );
}

export function BreakPhase({ onDone }: { onDone: () => void }) {
  const { remaining, finish } = useTimer(5 * 60, onDone, { autoStart: true });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-6 text-center">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
        Descanso
      </h2>
      <div role="timer" aria-label="Tiempo restante" className="font-mono text-5xl font-semibold text-action-hover">
        {formatTime(remaining)}
      </div>
      <Button onClick={finish}>
        Ir al test
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );
}
