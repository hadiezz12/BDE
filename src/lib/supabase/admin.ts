import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv, isPrivilegedKey, SupabaseConfigError } from "./env";

/**
 * PRIVILEGED client. The secret key bypasses row level security entirely.
 *
 * Not for pages, data loaders or anything done on behalf of a user: those use
 * createSupabaseServerClient() and let row level security decide. This client
 * is reserved for narrowly defined trusted server jobs, each one listed in
 * docs/backend/security-foundations.md (there are none in Phase 2).
 *
 * `server-only` makes any import from browser code fail the build, and ESLint
 * rejects every import of this file: a caller needs an
 * `eslint-disable-next-line no-restricted-imports -- <reason>` comment that a
 * reviewer can see.
 */
export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new SupabaseConfigError("Missing SUPABASE_SECRET_KEY (server only; never prefix it with NEXT_PUBLIC_).");
  }
  if (!isPrivilegedKey(secretKey)) {
    throw new SupabaseConfigError("SUPABASE_SECRET_KEY is not a secret key (expected sb_secret_...).");
  }

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
