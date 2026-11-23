import { useEffect, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import { useAppConfig } from "../../hooks/useAppConfig";
import { useAuth } from "../../hooks/useAuth";
import { safeNext } from "../../lib/authErrors";
import { supabase } from "../../lib/supabase";
import { LogoMark } from "../brand/Logo";
import { PageSkeleton } from "../PageSkeleton";
import { Card } from "../ui";

/**
 * Frame of the public login pages. Without login in this deployment it sends to /inicio; with a session it
 * sends to `next` (except where the session is the point, e.g. resetting the password).
 */
export function AuthLayout({
  title,
  intro,
  keepSession = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  keepSession?: boolean;
  children: ReactNode;
}) {
  const { data: config, isPending } = useAppConfig();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();

  useEffect(() => {
    document.title = `${title} | StudyAI`;
  }, [title]);

  if (!supabase) return <Navigate to="/inicio" replace />;
  if (isPending || loading) return <main className="mx-auto max-w-md p-4"><PageSkeleton /></main>;
  if (config?.auth_mode !== "supabase") return <Navigate to="/inicio" replace />;
  if (session && !keepSession) return <Navigate to={safeNext(params.get("next"))} replace />;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Link to="/" className="flex items-center gap-3 self-center rounded-control text-text-primary">
        <LogoMark className="h-9 w-9 shrink-0" />
        <span className="font-display text-xl font-bold tracking-tight">StudyAI</span>
      </Link>
      <Card className="space-y-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-text-primary">{title}</h1>
          {intro && <p className="text-sm text-text-muted">{intro}</p>}
        </div>
        {children}
      </Card>
    </main>
  );
}
