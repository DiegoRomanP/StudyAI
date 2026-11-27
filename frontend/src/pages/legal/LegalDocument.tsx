import type { ReactNode } from "react";

import { PublicLayout } from "../../components/PublicLayout";
import { Alert } from "../../components/ui";

export const LEGAL_UPDATED = "27 de noviembre de 2026";

/** Shared frame of the legal texts: draft notice on top until a lawyer approves them. */
export function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicLayout title={title}>
      <article className="max-w-3xl space-y-6 pt-4">
        <Alert tone="warning" title="Borrador pendiente de revisión legal">
          <p>Este texto aún no ha sido revisado por un abogado y puede cambiar antes del lanzamiento público.</p>
        </Alert>
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold text-text-primary">{title}</h1>
          <p className="text-sm text-text-muted">Última actualización: {LEGAL_UPDATED}</p>
        </header>
        <div className="space-y-6 text-text-muted [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-text-primary [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_section]:space-y-2 [&_strong]:text-text-primary">
          {children}
        </div>
      </article>
    </PublicLayout>
  );
}
