import { Skeleton } from "./ui";

/** Esqueleto de página (fallback de `Suspense`): título + tarjetas, con el texto solo para lectores. */
export function PageSkeleton({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <Skeleton height={36} width="40%" />
      <div className="space-y-3">
        <Skeleton height={96} />
        <Skeleton height={96} />
        <Skeleton height={96} />
      </div>
    </div>
  );
}
