import { useRef, type ReactNode } from "react";

import { useEnterAnimation } from "./motion/useEnterAnimation";

import { ActivityIndicator, Alert, Button } from "./ui";

export interface AsyncStateProps<T> {
  data: T | null | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  isEmpty?: (data: NonNullable<T>) => boolean;
  loading: ReactNode;
  loadingLabel?: string;
  empty: ReactNode;
  onRetry: () => void;
  initialErrorMessage?: ReactNode;
  updateErrorMessage?: ReactNode;
  retryLabel?: string;
  retryUpdateLabel?: string;
  refreshingLabel?: string;
  children: (data: NonNullable<T>) => ReactNode;
}

export function AsyncState<T>({
  data,
  isLoading,
  isError,
  isFetching = false,
  isEmpty,
  loading,
  loadingLabel = "Cargando datos",
  empty,
  onRetry,
  initialErrorMessage = "No se pudieron cargar los datos.",
  updateErrorMessage = "No se pudieron actualizar los datos. Se conservan los datos disponibles.",
  retryLabel = "Reintentar carga",
  retryUpdateLabel = "Reintentar actualización",
  refreshingLabel = "Actualizando datos…",
  children,
}: AsyncStateProps<T>) {
  const hasData = data !== null && data !== undefined;
  const dataRef = useRef<HTMLDivElement>(null);
  // Solo anima la transición «cargando → datos», no los refetch ni un montaje con caché.
  useEnterAnimation(dataRef, "content", hasData, { skipFirst: true });

  if (!hasData) {
    if (isError) {
      return (
        <Alert tone="error">
          <p>{initialErrorMessage}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </Alert>
      );
    }

    if (isLoading) {
      return (
        <div role="status" aria-label={loadingLabel} aria-busy="true">
          {loading}
        </div>
      );
    }

    return <>{empty}</>;
  }

  const currentData = data as NonNullable<T>;
  const content = isEmpty?.(currentData) ? empty : children(currentData);

  if (isError) {
    return (
      <div ref={dataRef} className="space-y-3">
        <Alert tone="error">
          <p>{updateErrorMessage}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            {retryUpdateLabel}
          </Button>
        </Alert>
        {content}
      </div>
    );
  }

  return (
    <div ref={dataRef} className="relative space-y-3">
      {isFetching && (
        <ActivityIndicator
          label={refreshingLabel}
          className="pointer-events-none absolute right-0 top-0 z-10 rounded-full bg-surface px-3 py-1 shadow-sm"
        />
      )}
      {content}
    </div>
  );
}
