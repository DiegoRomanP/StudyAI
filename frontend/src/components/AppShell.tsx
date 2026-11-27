import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ChartColumn,
  ChartNoAxesColumnDecreasing,
  ClipboardCheck,
  Ellipsis,
  FolderOpen,
  House,
  KeyRound,
  LogOut,
  MessageCircleQuestion,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link, matchPath, useLocation } from "react-router-dom";

import { LogoMark } from "./brand/Logo";
import { Button } from "./ui";
import { PageTransition } from "./motion/PageTransition";
import { useEnterAnimation } from "./motion/useEnterAnimation";

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
  /** Only in this deployment mode (saas = the shell got `hideAiSettings`). */
  mode?: "saas" | "self_hosted";
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
  { to: "/practica", label: "Práctica", icon: ClipboardCheck, primary: true, title: "Práctica" },
  { to: "/temas", label: "Temas clave", shortLabel: "Temas", icon: ChartNoAxesColumnDecreasing, title: "Temas clave" },
  { to: "/preguntas", label: "Mis preguntas", shortLabel: "Preguntas", icon: MessageCircleQuestion, title: "Mis preguntas" },
  { to: "/documents", label: "Recursos", icon: FolderOpen, title: "Recursos" },
  { to: "/goals", label: "Metas", icon: Target, title: "Metas" },
  { to: "/settings", label: "Conectar IA", icon: KeyRound, title: "Conectar IA", mode: "self_hosted" },
  { to: "/cuenta", label: "Cuenta", icon: UserRound, activePatterns: ["/pago/resultado"], title: "Cuenta", mode: "saas" },
  { to: "/dashboard", label: "Estadísticas", icon: ChartColumn, primary: true, title: "Estadísticas" },
];


function matchesRoute(path: string, pathname: string) {
  return matchPath({ path, end: true }, pathname) !== null;
}

function pageTitle(pathname: string) {
  if (matchesRoute("/plan/:planId", pathname)) return "Detalle del plan | StudyAI";
  if (matchesRoute("/session/:sessionId", pathname)) return "Sesión de estudio | StudyAI";
  if (matchesRoute("/pago/resultado", pathname)) return "Resultado del pago | StudyAI";
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

function SignOutButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} className={className}>
      <LogOut aria-hidden="true" className="h-4 w-4" />
      Cerrar sesión
    </Button>
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
            className={`flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-micro motion-reduce:transition-none ${
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

export function AppShell({
  children,
  sidebarFooter,
  chrome = "default",
  hideAiSettings = false,
  onSignOut,
  creditChip,
  footer,
}: {
  children: ReactNode;
  sidebarFooter?: ReactNode;
  chrome?: "default" | "focus";
  /** SaaS: the learner does not choose or connect an AI, so "Conectar IA" does not exist. */
  hideAiSettings?: boolean;
  /** Only with a Supabase session: shows «Cerrar sesión». */
  onSignOut?: () => void;
  /** SaaS only: credit balance chip (the shell stays free of data hooks). */
  creditChip?: ReactNode;
  /** SaaS only: legal links under the page content. */
  footer?: ReactNode;
}) {
  const mode = hideAiSettings ? "saas" : "self_hosted";
  const navigation = NAVIGATION.filter((item) => !item.mode || item.mode === mode);
  const primaryNavigation = navigation.filter((item) => item.primary);
  const overflowNavigation = navigation.filter((item) => !item.primary);
  const { pathname } = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const moreSheetRef = useRef<HTMLElement>(null);
  useEnterAnimation(moreSheetRef, "pop", mobileMenuOpen, { skipFirst: true });
  const previousPathname = useRef(pathname);
  const activeOverflowItem = overflowNavigation.find((item) =>
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

  if (chrome === "focus") {
    return (
      <div className="min-h-screen">
        <main ref={mainRef} id="main-content" tabIndex={-1} className="min-w-0 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 pb-8 md:px-8">
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </div>
        </main>
      </div>
    );
  }

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
          <NavigationLinks pathname={pathname} items={navigation} />
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          {creditChip}
          {sidebarFooter}
          {onSignOut && <SignOutButton onClick={onSignOut} className="w-full justify-start" />}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface-paper/80 px-4 py-2 md:hidden">
          <BrandLink className="flex items-center gap-2 rounded-control py-2 text-text-primary" />
          <div className="flex items-center gap-1">
            {creditChip}
            {onSignOut && <SignOutButton onClick={onSignOut} />}
          </div>
        </header>

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-x-hidden"
        >
          <div className="mx-auto max-w-6xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
            <PageTransition routeKey={pathname}>{children}</PageTransition>
            {footer && <footer className="mt-12 border-t border-line pt-2">{footer}</footer>}
          </div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <nav
          aria-label="Navegación inferior"
          className="grid border-t border-line bg-surface-paper pt-1 pb-[env(safe-area-inset-bottom)]"
          style={{ gridTemplateColumns: `repeat(${primaryNavigation.length + 1}, minmax(0, 1fr))` }}
        >
          {primaryNavigation.map((item) => {
            const isActive = isNavigationItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-control px-0.5 text-[0.6875rem] font-medium leading-3 transition-colors duration-micro motion-reduce:transition-none ${
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
              className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-control px-0.5 text-[0.6875rem] font-medium leading-3 transition-colors duration-micro motion-reduce:transition-none ${
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
          ref={moreSheetRef}
          id="mobile-overflow-navigation"
          aria-label="Más destinos"
          hidden={!mobileMenuOpen}
          className={`absolute bottom-full right-1 mb-2 origin-bottom-right w-60 gap-1 rounded-surface border border-line bg-surface-elevated p-2 shadow-flow ${
            mobileMenuOpen ? "grid" : "hidden"
          }`}
        >
          <NavigationLinks
            pathname={pathname}
            items={overflowNavigation}
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
