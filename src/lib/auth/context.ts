import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { withNext } from "./next-path";

/**
 * WHO is this? (authentication). Never WHAT may they do (authorization,
 * Phase 4): nothing here grants a right, and no code may treat "signed in"
 * as "allowed to manage". Every student starts with zero privileges.
 *
 * Identity comes from supabase.auth.getClaims(), which verifies the JWT
 * signature; never from getSession(), whose user object is just the cookie.
 */

/** Authenticator Assurance Level of the session: aal2 once a second factor was verified. */
export type AssuranceLevel = "aal1" | "aal2";

export interface AuthenticatedUser {
  status: "authenticated";
  userId: string;
  email: string | null;
  aal: AssuranceLevel;
  /** The student turned on two-factor authentication (verified factor). */
  mfaEnrolled: boolean;
  /** How this session signed in, most recent first ("otp", "oauth", "totp"…). */
  methods: string[];
}

export type AuthContext =
  | { status: "anonymous" }
  /** Signed in with the first factor only, while a second factor is enrolled. */
  | { status: "mfa_required"; userId: string; email: string | null }
  | AuthenticatedUser;

/** The current request's auth state, computed once per request. */
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { status: "anonymous" };
    throw error;
  }

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "anonymous" };

  const email = typeof claims.email === "string" ? claims.email : null;
  const aal: AssuranceLevel = claims.aal === "aal2" ? "aal2" : "aal1";
  // nextLevel is aal2 when the user has a verified factor. The database
  // enforces the same rule on its own (private.mfa_requirement_met).
  const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaEnrolled = levels?.nextLevel === "aal2";
  if (mfaEnrolled && aal !== "aal2") return { status: "mfa_required", userId: claims.sub, email };

  const methods = Array.isArray(claims.amr)
    ? claims.amr.map((entry) => (typeof entry === "object" && entry && "method" in entry ? String(entry.method) : String(entry)))
    : [];
  return { status: "authenticated", userId: claims.sub, email, aal, mfaEnrolled, methods };
});

/** Is this session signed in (first factor, plus the second one when enrolled)? */
export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthContext()).status === "authenticated";
}

/** Is this session at aal2? (For Phase 4's sensitive governance actions.) */
export async function isAal2(): Promise<boolean> {
  const ctx = await getAuthContext();
  return ctx.status === "authenticated" && ctx.aal === "aal2";
}

/**
 * For personal pages and Server Actions: the signed-in student, or a
 * redirect to sign in (and back to `nextPath` afterwards).
 */
export async function requireUser(nextPath: string = routes.account): Promise<AuthenticatedUser> {
  const ctx = await getAuthContext();
  if (ctx.status === "anonymous") redirect(withNext(routes.login, nextPath));
  if (ctx.status === "mfa_required") redirect(withNext(routes.loginVerification, nextPath));
  return ctx;
}

/**
 * For actions that will need a second factor (Phase 4 governance actions).
 * A student without one is sent to set it up; nothing in Phase 3 calls this.
 */
export async function requireAal2(nextPath: string = routes.accountSecurity): Promise<AuthenticatedUser> {
  const user = await requireUser(nextPath);
  if (user.aal !== "aal2") redirect(routes.accountSecurity);
  return user;
}
