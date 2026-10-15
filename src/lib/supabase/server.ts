import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Same publishable key and same row level security as the browser client: it
 * acts as the person whose cookies came with the request, never with more
 * rights. This is the client every data loader in src/lib/data uses.
 *
 * Create one per request (it reads that request's cookies); it is cheap.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Phase 3 adds the proxy
          // (proxy.ts) that refreshes the auth session before rendering, so
          // nothing is lost here.
        }
      },
    },
  });
}
