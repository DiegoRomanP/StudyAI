import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";

/** Supabase session. Signing out or switching user empties the query cache (T7: no data of the previous user). */
export function useAuth() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      const id = next?.user.id ?? null;
      if (event === "SIGNED_OUT" || (userId.current && id && userId.current !== id)) queryClient.clear();
      userId.current = id;
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  return { session, user: session?.user ?? null, loading, signOut };
}
