import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Header that tells Server Components which path is being rendered (a layout
 * cannot read it otherwise). Always overwritten here, so a value sent by the
 * browser is never trusted.
 */
export const PATHNAME_HEADER = "x-vpc-pathname";

/**
 * Runs in the proxy on every page request: refreshes the auth session cookie
 * before anything renders, as in Supabase's current Next.js guide, and
 * returns the verified claims (null when signed out).
 *
 * Do not add code between createServerClient and getClaims(), and always
 * return `response` (or copy its cookies): otherwise refreshed sessions are
 * lost and people get signed out at random.
 */
export async function updateSession(request: NextRequest) {
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  let env;
  try {
    env = getSupabasePublicEnv();
  } catch {
    // No Supabase settings (a fresh clone, CI's build job): the public site
    // still works, and nobody is signed in.
    return { response, claims: null };
  }

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Supabase sends Cache-Control: private, no-store with refreshed cookies.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}
