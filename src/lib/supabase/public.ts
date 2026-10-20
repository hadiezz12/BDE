import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client for what ANY visitor may read, on the server: no cookies,
 * no session, always the `anon` role. Used for the public association pages
 * and the public media routes, so that "can a visitor see this?" is answered
 * by the database exactly as for a visitor, whoever happens to be signed in.
 * Never use it for anything personal.
 */
export function createSupabasePublicClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
