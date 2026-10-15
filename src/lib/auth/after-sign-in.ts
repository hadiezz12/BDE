import "server-only";
import { routes } from "@/lib/routes";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { withNext } from "./next-path";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Where a student goes once signed in: the second factor if they enrolled
 * one, then the short profile form on their first visit, then where they
 * were heading (`next`, already checked by safeNextPath) or their space.
 */
export async function destinationAfterSignIn(
  supabase: ServerClient,
  user: { id: string; factors?: { status: string }[] } | null | undefined,
  next: string | null,
): Promise<string> {
  if (!user) return withNext(routes.login, next);
  const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsSecondFactor =
    user.factors?.some((f) => f.status === "verified") && levels?.currentLevel !== "aal2";
  if (needsSecondFactor) return withNext(routes.loginVerification, next);

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.onboarding_completed_at) return withNext(routes.accountOnboarding, next ?? routes.account);
  return next ?? routes.account;
}
