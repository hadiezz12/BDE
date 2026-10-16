"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthError, type AuthProblem } from "@/lib/auth/messages";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { SSO_SCOPES, ssoProvider } from "@/lib/auth/sso";
import { destinationAfterSignIn } from "@/lib/auth/after-sign-in";
import { isTestAccountEmail, testAccountsEnabled } from "@/lib/auth/test-accounts";

/**
 * Sign-in, second factor and sign-out. Every action works from the server's
 * cookies through the server client; nothing here trusts an id sent by the
 * browser. Errors reach the student as a short French message (lib/auth/messages);
 * logs carry the error code only, never an address, a code or a token.
 */

export interface SignInState {
  step: "email" | "code";
  email: string;
  problem?: AuthProblem;
  /** When the last code was sent (ms since epoch), for the resend cooldown. */
  sentAt?: number;
}

export interface CodeState {
  problem?: AuthProblem;
}

export interface TestSignInState {
  email: string;
  failed?: boolean;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function logAuthProblem(where: string, error: { code?: string; status?: number }, problem: AuthProblem) {
  // Refusals students cause themselves (wrong code, ineligible address, too
  // fast) are expected; anything else deserves a log line.
  if (["not_eligible", "code_invalid", "mfa_invalid", "rate_limited", "email_invalid"].includes(problem)) return;
  console.error(`[auth] ${where} failed`, { code: error.code, status: error.status, problem });
}

/** Step 1: send a 6-digit code to the school address (creates the account on first use). */
export async function requestSignInCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const resend = form.get("resend") === "1";
  if (!EMAIL.test(email) || email.length > 254) return { step: "email", email, problem: "email_invalid" };

  const supabase = await createSupabaseServerClient();
  // The before-user-created hook refuses addresses outside the school
  // domains; this form's own check is only for comfort.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    const problem = classifyAuthError(error);
    logAuthProblem("signInWithOtp", error, problem);
    return { step: resend ? "code" : "email", email, problem };
  }
  return { step: "code", email, sentAt: Date.now() };
}

/** Step 2: check the code. Then second factor, onboarding or the destination. */
export async function verifySignInCode(prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!/^\d{6}$/.test(token)) return { step: "code", email, sentAt: prev.sentAt, problem: "code_invalid" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) {
    const problem = classifyAuthError(error);
    if (error) logAuthProblem("verifyOtp", error, problem);
    return { step: "code", email, sentAt: prev.sentAt, problem };
  }

  // Second factor if enrolled, then the first-visit form, then the destination.
  redirect(await destinationAfterSignIn(supabase, data.user, next));
}

/** Second factor at sign-in: the code from the authenticator app. */
export async function verifySecondFactor(_prev: CodeState, form: FormData): Promise<CodeState> {
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!/^\d{6}$/.test(code)) return { problem: "mfa_invalid" };

  const supabase = await createSupabaseServerClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) {
    const problem = classifyAuthError(listError);
    logAuthProblem("mfa.listFactors", listError, problem);
    return { problem };
  }
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) redirect(next ?? routes.account);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    const problem = classifyAuthError(error);
    logAuthProblem("mfa.challengeAndVerify", error, problem);
    return { problem };
  }
  // The second factor is done: only the first-visit check remains.
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  redirect(userId ? await destinationAfterSignIn(supabase, { id: userId }, next) : (next ?? routes.account));
}

/**
 * Development only: a fictional test account signs in with its password
 * (lib/auth/test-accounts). The form only exists when AUTH_TEST_ACCOUNTS=on,
 * but an action can be called directly, so both locks are checked again here.
 * Every refusal looks the same, whatever the reason.
 */
export async function signInWithTestAccount(_prev: TestSignInState, form: FormData): Promise<TestSignInState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  if (!testAccountsEnabled() || !isTestAccountEmail(email) || !password || password.length > 128) {
    return { email, failed: true };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && error.code !== "invalid_credentials") {
      logAuthProblem("signInWithPassword (test account)", error, classifyAuthError(error));
    }
    return { email, failed: true };
  }
  redirect(await destinationAfterSignIn(supabase, data.user, next));
}

/** "Continuer avec ton compte de l'école": only when an institutional provider is configured. */
export async function startSchoolSignIn(form: FormData) {
  const provider = ssoProvider();
  const next = safeNextPath(String(form.get("next") ?? "")) ?? routes.account;
  if (!provider) redirect(withNext(routes.login, next));

  // Server Actions only run for same-origin requests, so this is our own origin.
  const origin = (await headers()).get("origin");
  if (!origin) redirect(`${routes.login}?error=unknown`);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}${routes.authCallback}?next=${encodeURIComponent(next)}`,
      scopes: SSO_SCOPES[provider],
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    const problem = classifyAuthError(error);
    if (error) logAuthProblem("signInWithOAuth", error, problem);
    redirect(`${routes.login}?error=${problem === "unknown" ? "provider_error" : problem}`);
  }
  redirect(data.url);
}

/** Sign out this device ("local") or every device ("global"). POST only. */
export async function signOut(form: FormData) {
  const scope = form.get("scope") === "global" ? "global" : "local";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope });
  if (error) logAuthProblem("signOut", error, classifyAuthError(error));
  revalidatePath("/", "layout");
  redirect(`${routes.login}?signed-out=1`);
}
