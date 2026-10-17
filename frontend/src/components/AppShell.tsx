import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { PageTransition } from "./motion/PageTransition";

const NAVIGATION = [
  { to: "/", label: "Inicio" },
  { to: "/documents", label: "Documentos" },
  { to: "/goals", label: "Metas" },
  { to: "/plan", label: "Plan" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Configuración" },
];

const PRIMARY_NAVIGATION = NAVIGATION.slice(0, 5);
const OVERFLOW_NAVIGATION = NAVIGATION.slice(5);

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

function BrandLink({ className }: { className: string }) {
  return (
    <Link to="/" className={className}>
      <img
        src="/favicon.svg"
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-control border border-line bg-surface-action-subtle p-1"
      />
      <span>StudyAI</span>
    </Link>
  );
}

function NavigationLinks({
  pathname,
  onNavigate,
  items = NAVIGATION,
}: {
  pathname: string;
  onNavigate?: (to: string) => void;
  items?: typeof NAVIGATION;
}) {
  return (
    <>
      {items.map((item) => {
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

function NavigationIcon({ to }: { to: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="h-[1.125rem] w-[1.125rem] shrink-0"
    >
      {to === "/" ? (
        <>
          <path d="m3.5 10 8.5-7 8.5 7" />
          <path d="M5.5 9v11h13V9M9.5 20v-6h5v6" />
        </>
      ) : to === "/documents" ? (
        <>
          <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 16h6" />
        </>
      ) : to === "/goals" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" />
        </>
      ) : to === "/plan" ? (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M4 9h16M8 13h3M8 16h7" />
        </>
      ) : to === "/dashboard" ? (
        <path d="M4 20V12h4v8M10 20V5h4v15M16 20V9h4v11" />
      ) : (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      )}
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const isOverflowRouteActive = OVERFLOW_NAVIGATION.some((item) =>
    isNavigationItemActive(item.to, pathname),
  );

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
      moreButtonRef.current?.focus();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="absolute left-4 top-2 z-50 -translate-y-20 rounded-control bg-action-fill px-4 py-3 font-medium text-text-on-action focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface-paper p-4 md:flex">
        <BrandLink className="mb-6 flex items-center gap-3 rounded-control px-2 py-3 text-lg font-bold text-text-primary" />
        <nav aria-label="Navegación principal" className="flex flex-col gap-1">
          <NavigationLinks pathname={pathname} />
        </nav>
        <div className="mt-auto px-2 pt-6 text-xs text-text-muted">MVP · usuario demo</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface-paper px-4 py-2 md:hidden">
          <BrandLink className="flex items-center gap-2 rounded-control py-2 text-lg font-bold text-text-primary" />
        </header>

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden"
        >
          <div className="mx-auto max-w-5xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <nav
          aria-label="Navegación inferior"
          className="grid grid-cols-[repeat(5,minmax(0,1fr))_3rem] border-t border-line bg-surface-paper pt-1 pb-[env(safe-area-inset-bottom)]"
        >
          {PRIMARY_NAVIGATION.map((item) => {
            const isActive = isNavigationItemActive(item.to, pathname);
            const labelSize =
              item.to === "/documents"
                ? "text-[0.5625rem] tracking-[-0.035em] min-[375px]:text-[0.625rem]"
                : "text-[0.625rem] tracking-[-0.025em]";
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-0.5 font-medium leading-3 transition-colors motion-reduce:transition-none ${labelSize} ${
                  isActive ? "bg-action-subtle text-action" : "text-text-muted hover:bg-surface-subtle hover:text-text-primary"
                }`}
              >
                <NavigationIcon to={item.to} />
                <span className="max-w-full truncate whitespace-nowrap text-center">{item.label}</span>
              </Link>
            );
          })}
          <div className="min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-overflow-navigation"
              aria-current={isOverflowRouteActive ? "page" : undefined}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-control px-0.5 text-[0.625rem] font-medium leading-3 tracking-[-0.025em] transition-colors motion-reduce:transition-none ${
                isOverflowRouteActive
                  ? "bg-action-subtle text-action"
                  : "text-text-muted hover:bg-surface-subtle hover:text-text-primary"
              }`}
            >
              <NavigationIcon to="/more" />
              <span>Más</span>
              {isOverflowRouteActive && <span className="sr-only">, Configuración actual</span>}
            </button>
          </div>
        </nav>
        <nav
          id="mobile-overflow-navigation"
          aria-label="Más destinos"
          hidden={!mobileMenuOpen}
          className={`absolute bottom-full right-1 mb-2 w-56 gap-1 rounded-surface border border-line bg-surface-elevated p-2 shadow-lg ${
            mobileMenuOpen ? "grid" : "hidden"
          }`}
        >
          <NavigationLinks
            pathname={pathname}
            items={OVERFLOW_NAVIGATION}
            onNavigate={(to) => {
              setMobileMenuOpen(false);
              if (pathname === to) moreButtonRef.current?.focus();
            }}
          />
        </nav>
      </div>
    </div>
  );
}
