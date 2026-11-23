import { useQuery } from "@tanstack/react-query";

import { api } from "../api/endpoints";

/**
 * What this deployment offers. The backend enforces it too: hiding in the UI is only courtesy.
 * While it loads (or if it fails) the app behaves as self-hosted, today's default.
 */
export function useAppConfig() {
  const query = useQuery({ queryKey: ["app-config"], queryFn: api.getAppConfig, staleTime: Infinity });
  return {
    ...query,
    isSaas: query.data?.deployment_mode === "saas",
    hasLogin: query.data?.auth_mode === "supabase",
  };
}
