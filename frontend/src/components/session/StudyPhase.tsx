import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { formatTime, useTimer } from "../../hooks/useTimer";
import { Button } from "../ui";

export function StudyPhase({
  topic,
  durationMinutes,
  exit,
  children,
  onDone,
}: {
  topic: string;
  durationMinutes: number;
  exit: ReactNode;
  children: ReactNode;
  onDone: () => void;
}) {
  const { remaining, start, finish } = useTimer(durationMinutes * 60, onDone);
  const [started, setStarted] = useState(false);
  const doneRef = useRef<HTMLButtonElement>(null);

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
        className={`sticky top-0 z-10 flex transition-[min-height] duration-[var(--motion-card)] ease-flow ${
          started
            ? "min-h-14 flex-row items-center justify-between gap-3 border-b border-line bg-surface-paper/95 backdrop-blur"
            : "min-h-[100dvh] flex-col items-center justify-center"
        }`}
      >
        <div className={started ? "" : "absolute left-0 top-2"}>{exit}</div>
        {!started && <h1 className="max-w-reading text-center text-2xl font-bold">{topic}</h1>}
        <div
          role="timer"
          aria-label="Tiempo restante"
          className={`origin-center font-mono font-semibold text-action-hover transition-transform duration-[var(--motion-card)] ease-flow ${
            started ? "scale-100 text-2xl" : "my-12 scale-[2.5] text-3xl"
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
          <Button onClick={begin}>Empezar</Button>
        )}
      </div>

      {started && (
        <div className="pt-6 transition-opacity duration-[var(--motion-micro)]">
          <h1 className="mb-4 text-center text-2xl font-bold">{topic}</h1>
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
