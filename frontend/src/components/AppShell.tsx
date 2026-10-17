import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChartColumn,
  ChartNoAxesColumnDecreasing,
  Ellipsis,
  FolderOpen,
  House,
  KeyRound,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { LogoMark } from "./brand/Logo";
import { PageTransition } from "./motion/PageTransition";

export const APP_HOME_PATH = "/inicio";

interface NavigationItem {
  to: string;
  label: string;
  /** Label for the narrow mobile bottom bar. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar; the rest live under "Más". */
  primary?: boolean;
  /** Extra routes that belong to this destination. */
  activePatterns?: string[];
  title: string;
}

// Order follows the mockup's sidebar; URLs are the existing routes.
export const NAVIGATION: NavigationItem[] = [
  { to: APP_HOME_PATH, label: "Inicio", icon: House, primary: true, title: "Inicio" },
  {
    to: "/plan",
    label: "Plan de estudio",
    shortLabel: "Plan",
    icon: CalendarDays,
    primary: true,
    activePatterns: ["/plan/:planId", "/session/:sessionId"],
    title: "Plan de estudio",
  },
  { to: "/temas", label: "Temas (Pareto)", shortLabel: "Temas", icon: ChartNoAxesColumnDecreasing, title: "Temas (Pareto)" },
  { to: "/documents", label: "Recursos", icon: FolderOpen, title: "Recursos" },
  { to: "/goals", label: "Metas", icon: Target, title: "Metas" },
  { to: "/settings", label: "API Keys", icon: KeyRound, title: "API Keys" },
  { to: "/dashboard", label: "Estadísticas", icon: ChartColumn, primary: true, title: "Estadísticas" },
];

const PRIMARY_NAVIGATION = NAVIGATION.filter((item) => item.primary);
const OVERFLOW_NAVIGATION = NAVIGATION.filter((item) => !item.primary);

function matchesRoute(path: string, pathname: string) {
  return matchPath({ path, end: true }, pathname) !== null;
}

function pageTitle(pathname: string) {
  if (matchesRoute("/plan/:planId", pathname)) return "Detalle del plan | StudyAI";
  if (matchesRoute("/session/:sessionId", pathname)) return "Sesión de estudio | StudyAI";
  const item = NAVIGATION.find((entry) => matchesRoute(entry.to, pathname));
  return item ? `${item.title} | StudyAI` : "Página no encontrada | StudyAI";
}

function isNavigationItemActive(item: NavigationItem, pathname: string) {
  return [item.to, ...(item.activePatterns ?? [])].some((path) => matchesRoute(path, pathname));
}

function BrandLink({ className }: { className: string }) {
  return (
    <Link to={APP_HOME_PATH} className={className}>
      <LogoMark className="h-9 w-9 shrink-0" />
      <span className="font-display text-xl font-bold tracking-tight">StudyAI</span>
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
  items?: NavigationItem[];
}) {
  return (
    <>
      {items.map((item) => {
        const isActive = isNavigationItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => onNavigate?.(item.to)}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-micro)] motion-reduce:transition-none ${
              isActive
                ? "bg-action-subtle text-text-primary ring-1 ring-inset ring-action-hover/40"
                : "text-text-muted hover:bg-surface-subtle hover:text-text-primary"
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`h-[1.125rem] w-[1.125rem] shrink-0 ${isActive ? "text-action-hover" : ""}`}
              strokeWidth={1.8}
            />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children, sidebarFooter }: { children: ReactNode; sidebarFooter?: ReactNode }) {
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const activeOverflowItem = OVERFLOW_NAVIGATION.find((item) =>
    isNavigationItemActive(item, pathname),
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

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface-paper/80 p-4 md:flex">
        <BrandLink className="mb-6 flex items-center gap-3 rounded-control px-2 py-3 text-text-primary" />
        <nav aria-label="Navegación principal" className="flex flex-col gap-1">
          <NavigationLinks pathname={pathname} />
        </nav>
        {sidebarFooter && <div className="mt-auto pt-6">{sidebarFooter}</div>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface-paper/80 px-4 py-2 md:hidden">
          <BrandLink className="flex items-center gap-2 rounded-control py-2 text-text-primary" />
        </header>

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden"
        >
          <div className="mx-auto max-w-6xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <nav
          aria-label="Navegación inferior"
          className="grid border-t border-line bg-surface-paper pt-1 pb-[env(safe-area-inset-bottom)]"
          style={{ gridTemplateColumns: `repeat(${PRIMARY_NAVIGATION.length + 1}, minmax(0, 1fr))` }}
        >
          {PRIMARY_NAVIGATION.map((item) => {
            const isActive = isNavigationItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-0.5 text-[0.6875rem] font-medium leading-3 transition-colors motion-reduce:transition-none ${
                  isActive
                    ? "bg-action-subtle text-text-primary"
                    : "text-text-muted hover:bg-surface-subtle hover:text-text-primary"
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 ${isActive ? "text-action-hover" : ""}`}
                  strokeWidth={1.8}
                />
                <span className="max-w-full truncate whitespace-nowrap text-center">
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            );
          })}
          <div className="min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-overflow-navigation"
              aria-current={activeOverflowItem ? "page" : undefined}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-control px-0.5 text-[0.6875rem] font-medium leading-3 transition-colors motion-reduce:transition-none ${
                activeOverflowItem
                  ? "bg-action-subtle text-text-primary"
                  : "text-text-muted hover:bg-surface-subtle hover:text-text-primary"
              }`}
            >
              <Ellipsis aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.8} />
              <span>Más</span>
              {activeOverflowItem && <span className="sr-only">, {activeOverflowItem.label} actual</span>}
            </button>
          </div>
        </nav>
        <nav
          id="mobile-overflow-navigation"
          aria-label="Más destinos"
          hidden={!mobileMenuOpen}
          className={`absolute bottom-full right-1 mb-2 w-60 gap-1 rounded-surface border border-line bg-surface-elevated p-2 shadow-flow ${
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
