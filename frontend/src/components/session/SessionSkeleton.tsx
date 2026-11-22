import { useRef, type ReactNode } from "react";

import { useEnterAnimation } from "../motion/useEnterAnimation";
import type { EnterPreset } from "../motion/presets";
import { Skeleton } from "../ui";

/** Carga con la forma de la sesión (cabecera + bloque de lectura); `label` queda en `role=status`. */
export function SessionSkeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} aria-live="polite" aria-busy="true" className="space-y-4">
      <p className="text-sm text-text-muted">{label}</p>
      <Skeleton height={32} width="55%" />
      <Skeleton height={160} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={16} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

/** Contenedor de una fase: entra con `phase` al cambiar `phase` (solo entrada, nunca dos a la vez). */
export function PhaseEnter({ phase, children }: { phase: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnterAnimation(ref, "phase", phase);
  return (
    <div ref={ref} className="space-y-4">
      {children}
    </div>
  );
}

/** Entrada puntual al montar (revelar una respuesta, pop de un icono o de una cifra). */
export function EnterOnMount({
  preset,
  className,
  children,
}: {
  preset: EnterPreset;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEnterAnimation(ref, preset);
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

/** Pregunta que entra desde la derecha al cambiar `id` (sin animar la primera). Sin remontar hijos. */
export function StepEnter({ id, children }: { id: unknown; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnterAnimation(ref, "stepForward", id, { skipFirst: true });
  return <div ref={ref}>{children}</div>;
}
