import { useQuery } from "@tanstack/react-query";

import { api } from "../api/endpoints";
import { useAppConfig } from "./useAppConfig";

export const CREDITS_QUERY_KEY = ["account-credits"] as const;

/**
 * Credit balance. SaaS only: in self-hosted/demo the query is disabled, so /account/credits is
 * never called and `enabled` is false. Sign-out clears the whole query cache (useAuth).
 */
export function useCredits() {
  const { isSaas } = useAppConfig();
  const query = useQuery({ queryKey: CREDITS_QUERY_KEY, queryFn: api.getCredits, enabled: isSaas });
  return { ...query, enabled: isSaas, noCredits: isSaas && query.data?.total === 0 };
}

export function useCreditHistory(enabled: boolean) {
  return useQuery({ queryKey: [...CREDITS_QUERY_KEY, "history"], queryFn: () => api.getCreditHistory(20), enabled });
}
