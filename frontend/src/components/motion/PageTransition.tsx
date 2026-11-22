import { useRef, type ReactNode } from "react";
import { useEnterAnimation } from "./useEnterAnimation";

/**
 * Entrada breve entre rutas (fundido + 4 px). Solo entrada, y no en la primera carga.
 * Con reduced-motion el hook se queda en un fundido corto.
 */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEnterAnimation(ref, "route", routeKey, { skipFirst: true });
  return (
    <div key={routeKey} ref={ref}>
      {children}
    </div>
  );
}
