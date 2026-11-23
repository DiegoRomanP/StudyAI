import axios from "axios";

import { supabase } from "../lib/supabase";

// Base URL of the FastAPI backend. Override with VITE_API_URL if needed.
const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export const apiClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

// T6: Supabase renews the token (~1 h), so it is asked on EVERY request and never kept in a variable.
apiClient.interceptors.request.use(async (config) => {
  if (!supabase) return config;
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) config.headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return config;
});

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    const body = error.response.data as { code?: string; detail?: { code?: string } } | undefined;
    const code = body?.code ?? body?.detail?.code;
    if ((code === "AUTH_REQUIRED" || code === "AUTH_INVALID_TOKEN") && window.location.pathname !== "/login") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
  }
  return Promise.reject(error);
});
