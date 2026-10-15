import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { destinationAfterSignIn } from "@/lib/auth/after-sign-in";
import { classifyAuthError, type AuthProblem } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";

/**
 * Where Supabase Auth sends people back: the school's sign-in provider
 * (PKCE code exchange, once institutional sign-in is configured) or an email
 * link (token_hash). The exchange happens on the server, the session lands
 * in cookies, and the browser is redirected to a clean URL so no code stays
 * in the address bar or the history.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const fail = (problem: AuthProblem) => {
    const url = new URL(routes.login, origin);
    url.searchParams.set("error", problem);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // The provider (or Auth) reports a problem: cancelled, domain refused…
  const providerError = searchParams.get("error");
  if (providerError) {
    const description = searchParams.get("error_description") ?? "";
    if (description.includes("signup_email_not_eligible")) return fail("not_eligible");
    return fail(providerError === "access_denied" ? "oauth_cancelled" : "provider_error");
  }

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");

  let user;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const problem = classifyAuthError(error);
      return fail(problem === "unknown" ? "link_invalid" : problem);
    }
    user = data.user;
  } else if (tokenHash && searchParams.get("type") === "email") {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error) {
      const problem = classifyAuthError(error);
      return fail(problem === "unknown" || problem === "code_invalid" ? "link_invalid" : problem);
    }
    user = data.user;
  } else {
    return fail("link_invalid");
  }

  return NextResponse.redirect(new URL(await destinationAfterSignIn(supabase, user, next), origin));
}
