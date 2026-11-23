import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAppConfig } from "../../hooks/useAppConfig";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { PageSkeleton } from "../PageSkeleton";

/**
 * Private routes. Without Supabase variables (demo / self-hosted) it renders the children at once, as always;
 * with them it waits for `/config` and the session so no request leaves without a token.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: config, isPending } = useAppConfig();
  const { session, loading } = useAuth();
  const { pathname, search } = useLocation();

  if (!supabase) return <>{children}</>;
  if (isPending || loading) return <PageSkeleton />;
  if (config?.auth_mode === "supabase" && !session) {
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return <>{children}</>;
}
