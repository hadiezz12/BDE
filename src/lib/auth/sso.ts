import "server-only";

/**
 * Institutional sign-in ("Continuer avec ton compte de l'école"), ready but
 * OFF: it needs the school's real identity provider. Set AUTH_SSO_PROVIDER
 * to "azure" (Microsoft Entra ID, with the school's tenant configured in
 * Supabase) or "google" (Google Workspace) once those credentials exist in
 * the Supabase project; the button then appears on the sign-in page.
 * See docs/backend/authentication.md, "Institutional sign-in".
 *
 * Only identity scopes are requested (openid, email, profile): no mailbox,
 * calendar, files or contacts, and provider tokens are not stored.
 */
export type SsoProvider = "azure" | "google";

export function ssoProvider(): SsoProvider | null {
  const value = process.env.AUTH_SSO_PROVIDER;
  return value === "azure" || value === "google" ? value : null;
}

export const SSO_SCOPES: Record<SsoProvider, string | undefined> = {
  // Supabase asks Microsoft for "email" explicitly; openid/profile give the name.
  azure: "openid email profile",
  // Google's defaults are already openid, email, profile.
  google: undefined,
};
