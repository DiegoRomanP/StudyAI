import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Alert, Button, ButtonLink } from "./ui";

interface BoundaryState {
  failed: boolean;
}

class PageErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Development aid only; nothing is sent anywhere.
    console.error("Error al renderizar la página", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="space-y-4" aria-labelledby="page-error-title">
        <h1 id="page-error-title" className="text-2xl font-bold">
          Algo salió mal al mostrar esta página
        </h1>
        <Alert tone="error">
          <p>Tus datos guardados no se han perdido. Recarga la página o vuelve al inicio.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
              Recargar
            </Button>
            <ButtonLink to="/" variant="ghost">
              Ir al inicio
            </ButtonLink>
          </div>
        </Alert>
      </section>
    );
  }
}

/** Contains a render error to the current page; navigating elsewhere recovers. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary key={pathname}>{children}</PageErrorBoundary>;
}
