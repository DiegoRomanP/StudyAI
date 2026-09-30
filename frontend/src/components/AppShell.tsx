import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";

const NAVIGATION = [
  { to: "/", label: "Inicio" },
  { to: "/documents", label: "Documentos" },
  { to: "/goals", label: "Metas" },
  { to: "/plan", label: "Plan" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Configuración" },
];

function matchesRoute(path: string, pathname: string) {
  return matchPath({ path, end: true }, pathname) !== null;
}

function pageTitle(pathname: string) {
  if (matchesRoute("/", pathname)) return "Inicio | StudyAI";
  if (matchesRoute("/documents", pathname)) return "Documentos | StudyAI";
  if (matchesRoute("/goals", pathname)) return "Metas | StudyAI";
  if (matchesRoute("/plan", pathname)) return "Plan de estudio | StudyAI";
  if (matchesRoute("/plan/:planId", pathname)) return "Detalle del plan | StudyAI";
  if (matchesRoute("/session/:sessionId", pathname)) return "Sesión de estudio | StudyAI";
  if (matchesRoute("/dashboard", pathname)) return "Dashboard | StudyAI";
  if (matchesRoute("/settings", pathname)) return "Configuración | StudyAI";
  return "Página no encontrada | StudyAI";
}

function isNavigationItemActive(to: string, pathname: string) {
  if (to === "/plan") {
    return matchesRoute("/plan", pathname) || matchesRoute("/plan/:planId", pathname);
  }
  return matchesRoute(to, pathname);
}

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: (to: string) => void;
}) {
  return (
    <>
      {NAVIGATION.map((item) => {
        const isActive = isNavigationItemActive(item.to, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => onNavigate?.(item.to)}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-control px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${
              isActive ? "bg-action-subtle text-action" : "text-text-primary hover:bg-surface-subtle"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  useEffect(() => {
    const pathChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (!pathChanged) return;

    setMobileMenuOpen(false);
    mainRef.current?.focus();
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="absolute left-4 top-2 z-50 -translate-y-20 rounded-control bg-action px-4 py-3 font-medium text-text-on-action focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface-paper p-4 md:flex">
        <Link to="/" className="mb-6 rounded-control px-2 py-3 text-lg font-bold text-text-primary">
          StudyAI
        </Link>
        <nav aria-label="Navegación principal" className="flex flex-col gap-1">
          <NavigationLinks pathname={pathname} />
        </nav>
        <div className="mt-auto px-2 pt-6 text-xs text-text-muted">MVP · usuario demo</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface-paper px-4 py-2 md:hidden">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <Link to="/" className="rounded-control py-2 text-lg font-bold text-text-primary">
              StudyAI
            </Link>
            <button
              ref={menuButtonRef}
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-control bg-surface-paper px-3 text-sm font-semibold text-text-primary hover:bg-surface-subtle"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="h-5 w-5"
              >
                {mobileMenuOpen ? (
                  <path d="m6 6 12 12M18 6 6 18" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
              <span>Menú</span>
            </button>
          </div>
          <nav
            id="mobile-navigation"
            aria-label="Navegación móvil"
            hidden={!mobileMenuOpen}
            className={`mt-2 gap-1 border-t border-line pt-2 ${mobileMenuOpen ? "grid" : "hidden"}`}
          >
            <NavigationLinks
              pathname={pathname}
              onNavigate={(to) => {
                setMobileMenuOpen(false);
                if (pathname === to) menuButtonRef.current?.focus();
              }}
            />
          </nav>
        </header>

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden"
        >
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
