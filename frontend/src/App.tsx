import { Outlet, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RouteErrorBoundary } from "./components/ErrorBoundary";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlanPage } from "./pages/PlanPage";
import { SessionPage } from "./pages/SessionPage";
import { SettingsPage } from "./pages/SettingsPage";

function AppLayout() {
  return (
    <AppShell>
      <RouteErrorBoundary>
        <Outlet />
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
      <Route element={<AppLayout />}>
        <Route path="/inicio" element={<HomePage />} />
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
