import { lazy, Suspense, type ReactNode } from "react";
import { Outlet, Route, Routes, useMatch } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RouteErrorBoundary } from "./components/ErrorBoundary";
import { StudyStreakCard } from "./components/home/HomeCards";
import { Spinner } from "./components/ui";
import { DocumentsPage } from "./pages/DocumentsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlanPage } from "./pages/PlanPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TopicsPage } from "./pages/TopicsPage";

// Heavy routes load on demand: Recharts (Estadísticas), Markdown (Sesión/Práctica), the demo.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DemoPage = lazy(() => import("./pages/DemoPage").then((module) => ({ default: module.DemoPage })));
const PracticePage = lazy(() => import("./pages/PracticePage").then((module) => ({ default: module.PracticePage })));
const SessionPage = lazy(() => import("./pages/SessionPage").then((module) => ({ default: module.SessionPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner label="Cargando…" />}>{children}</Suspense>;
}

function AppLayout() {
  const focus = useMatch("/session/:sessionId") !== null;
  return (
    <AppShell chrome={focus ? "focus" : "default"} sidebarFooter={focus ? undefined : <StudyStreakCard />}>
      <RouteErrorBoundary>
        <Lazy>
          <Outlet />
        </Lazy>
      </RouteErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public landing without the app shell. */}
      <Route
        path="/"
        element={
          <RouteErrorBoundary>
            <LandingPage />
          </RouteErrorBoundary>
        }
      />
      <Route
        path="/demo"
        element={
          <RouteErrorBoundary>
            <Lazy>
              <DemoPage />
            </Lazy>
          </RouteErrorBoundary>
        }
      />
      <Route element={<AppLayout />}>
        <Route path="/inicio" element={<HomePage />} />
        <Route path="/practica" element={<PracticePage />} />
        <Route path="/temas" element={<TopicsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/plan/:planId" element={<PlanDetailPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
