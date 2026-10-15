/**
 * Supabase settings, read and checked in one place.
 *
 * Only two values may reach the browser: the project URL and the publishable
 * key. Next.js inlines a NEXT_PUBLIC_ variable into the client bundle only
 * when it is written out as a literal `process.env.NEXT_PUBLIC_...`, so keep
 * the two reads below in exactly that form.
 *
 * The checks run when a client is created, not when this file is imported:
 * the Phase 1 pages still read mock data and must keep working on a machine
 * with no Supabase settings at all. `npm run db:check` runs the same checks
 * (and a live connection test) on demand.
 *
 * This file stays free of Next.js and path-alias imports so the Node scripts
 * in /scripts can import it directly.
 */

export type SupabasePublicEnv = {
  /** Project API URL, without a trailing slash. */
  url: string;
  /** Publishable key (sb_publishable_...): safe in the browser, RLS applies. */
  publishableKey: string;
};

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(`${message} See docs/backend/environments.md.`);
    this.name = "SupabaseConfigError";
  }
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new SupabaseConfigError("Missing NEXT_PUBLIC_SUPABASE_URL: copy .env.example to .env.local and fill it in.");
  }
  if (!publishableKey) {
    throw new SupabaseConfigError(
      "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: copy .env.example to .env.local and fill it in.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && !isLocalHost(parsed.hostname)) {
    throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL must use https (only the local stack runs on http).");
  }

  if (isPrivilegedKey(publishableKey)) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret or service_role key, which bypasses row level security. " +
        "NEXT_PUBLIC_ values ship to every browser: put the publishable key here and rotate the exposed key in the dashboard.",
    );
  }

  return { url: url.replace(/\/+$/, ""), publishableKey };
}

/**
 * True for keys that bypass row level security: a secret key (sb_secret_...)
 * or a legacy service_role JWT. Such a key must never sit in a NEXT_PUBLIC_
 * variable.
 */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}
