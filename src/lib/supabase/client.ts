import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client for Client Components (code that runs in the browser).
 *
 * It uses the publishable key, so every request runs as `anon` (or, from
 * Phase 3, as the signed-in user) and row level security decides what it may
 * read or write. Nothing this client sends is trusted by the database.
 * createBrowserClient keeps a single instance per tab, so call this freely.
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
