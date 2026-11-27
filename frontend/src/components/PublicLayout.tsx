import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAppConfig } from "../hooks/useAppConfig";
import { Logo } from "./brand/Logo";

export const LEGAL_LINKS = [
  { to: "/terminos", label: "Términos" },
  { to: "/privacidad", label: "Privacidad" },
  { to: "/reclamaciones", label: "Libro de Reclamaciones" },
] as const;

/** Legal links for footers (landing, public pages, app shell in saas). */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { isSaas } = useAppConfig();
  return (
    <nav aria-label="Información legal" className={`flex flex-wrap justify-center gap-x-4 text-xs text-text-muted ${className}`.trim()}>
      {isSaas && (
        <Link to="/precios" className="inline-flex min-h-11 items-center underline hover:text-text-primary">
          Precios
        </Link>
      )}
      {LEGAL_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="inline-flex min-h-11 items-center underline hover:text-text-primary">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Frame of the public pages outside the app (pricing, legal): logo, content, legal footer. */
export function PublicLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | StudyAI`;
  }, [title]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-5 md:px-8">
        <Link to="/" aria-label="StudyAI, inicio" className="rounded-control">
          <Logo />
        </Link>
        <Link to="/inicio" className="inline-flex min-h-11 items-center text-sm font-semibold text-action hover:text-action-hover">
          Ir a la app
        </Link>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12 md:px-8">
        {children}
      </main>
      <footer className="border-t border-line px-4 py-4">
        <LegalLinks />
      </footer>
    </div>
  );
}
