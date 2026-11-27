import { lazy, Suspense, type ReactNode } from "react";
import { Outlet, Route, Routes, useMatch, useNavigate } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/auth/RequireAuth";
import { PageSkeleton } from "./components/PageSkeleton";
import { RouteErrorBoundary } from "./components/ErrorBoundary";
import { CreditChip } from "./components/credits/CreditChip";
import { StudyStreakCard } from "./components/home/HomeCards";
import { useAppConfig } from "./hooks/useAppConfig";
import { useAuth } from "./hooks/useAuth";
import { LegalLinks } from "./components/PublicLayout";
import { AccountPage } from "./pages/AccountPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ComplaintsPage } from "./pages/legal/ComplaintsPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { PaymentResultPage } from "./pages/PaymentResultPage";
import { PricingPage } from "./pages/PricingPage";
import { GoalsPage } from "./pages/GoalsPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlanPage } from "./pages/PlanPage";
import { RecoverPage } from "./pages/RecoverPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";
import { TopicsPage } from "./pages/TopicsPage";

// Heavy routes load on demand: Recharts (Estadísticas), Markdown (Sesión/Práctica), the demo.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DemoPage = lazy(() => import("./pages/DemoPage").then((module) => ({ default: module.DemoPage })));
const QuestionsPage = lazy(() => import("./pages/QuestionsPage").then((module) => ({ default: module.QuestionsPage })));
const PracticePage = lazy(() => import("./pages/PracticePage").then((module) => ({ default: module.PracticePage })));
const SessionPage = lazy(() => import("./pages/SessionPage").then((module) => ({ default: module.SessionPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

// SaaS has no bring-your-own-key page: the backend answers 404 there, so the UI does too.
function SettingsRoute() {
  const { isSaas } = useAppConfig();
  return isSaas ? <NotFoundPage /> : <SettingsPage />;
}

// Billing exists only in SaaS: in self-hosted the backend has no such routes, so the UI answers 404 too.
function SaasOnly({ children }: { children: ReactNode }) {
  const { isSaas, isPending } = useAppConfig();
  if (isPending) return <PageSkeleton />;
  return isSaas ? <>{children}</> : <NotFoundPage />;
}

function AppLayout() {
  const focus = useMatch("/session/:sessionId") !== null;
  const { isSaas, hasLogin } = useAppConfig();
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <AppShell
      onSignOut={hasLogin && session ? () => void signOut().then(() => navigate("/login", { replace: true })) : undefined}
      chrome={focus ? "focus" : "default"}
      sidebarFooter={focus ? undefined : <StudyStreakCard />}
      hideAiSettings={isSaas}
      creditChip={isSaas ? <CreditChip /> : undefined}
      footer={isSaas ? <LegalLinks /> : undefined}
    >
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
      {/* Login pages: they only exist when /config reports Supabase auth (see AuthLayout). */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<SignupPage />} />
      <Route path="/recuperar" element={<RecoverPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      {/* Public pages: pricing (saas only) and the legal texts. */}
      <Route path="/precios" element={<SaasOnly><PricingPage /></SaasOnly>} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/reclamaciones" element={<ComplaintsPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/inicio" element={<HomePage />} />
        <Route path="/practica" element={<PracticePage />} />
        <Route path="/temas" element={<TopicsPage />} />
        <Route path="/preguntas" element={<QuestionsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/plan/:planId" element={<PlanDetailPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/cuenta" element={<SaasOnly><AccountPage /></SaasOnly>} />
        <Route path="/pago/resultado" element={<SaasOnly><PaymentResultPage /></SaasOnly>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
