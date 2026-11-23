import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** `null` when the variables are missing (demo / self-hosted): the app then has no login at all. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
