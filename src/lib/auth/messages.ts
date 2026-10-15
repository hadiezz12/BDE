/**
 * Supabase Auth errors, translated for students. Nobody sees an error code,
 * a stack trace or the words OAuth, JWT or Supabase: each failure maps to a
 * short French sentence that says what to do next.
 *
 * No path-alias imports: the unit tests load this file with plain Node.
 */

export type AuthProblem =
  | "not_eligible"
  | "email_invalid"
  | "code_invalid"
  | "rate_limited"
  | "link_invalid"
  | "oauth_cancelled"
  | "provider_error"
  | "mfa_invalid"
  | "mfa_required"
  | "session_expired"
  | "unavailable"
  | "unknown";

export const AUTH_MESSAGES: Record<AuthProblem, string> = {
  not_eligible:
    "Utilise ton adresse e-mail de l'école : les comptes sont réservés aux étudiant·es de GEM Alpine Business School.",
  email_invalid: "Cette adresse e-mail n'a pas l'air complète. Vérifie-la.",
  code_invalid: "Ce code n'est pas le bon ou il a expiré. Vérifie-le, ou demande-en un nouveau.",
  rate_limited: "Trop de demandes d'un coup. Attends une minute avant de réessayer.",
  link_invalid: "Ce lien de connexion a expiré ou a déjà servi. Recommence depuis la page de connexion.",
  oauth_cancelled: "Connexion annulée. Tu peux réessayer quand tu veux.",
  provider_error: "Le service de connexion de l'école n'a pas répondu comme prévu. Réessaie, ou utilise ton adresse e-mail.",
  mfa_invalid: "Ce code ne correspond pas. Vérifie l'heure de ton téléphone et entre le code affiché maintenant.",
  mfa_required: "Confirme d'abord ta connexion avec le code de ton application d'authentification.",
  session_expired: "Ta session a expiré. Reconnecte-toi.",
  unavailable: "La connexion est momentanément indisponible. Réessaie dans un instant.",
  unknown: "Quelque chose s'est mal passé. Réessaie ; si ça continue, préviens le bureau.",
};

type ErrorLike = { code?: string | null; message?: string | null; status?: number | null } | null | undefined;

const BY_CODE: Record<string, AuthProblem> = {
  otp_expired: "code_invalid",
  otp_disabled: "unavailable",
  over_email_send_rate_limit: "rate_limited",
  over_request_rate_limit: "rate_limited",
  over_sms_send_rate_limit: "rate_limited",
  email_address_invalid: "email_invalid",
  email_address_not_authorized: "not_eligible",
  signup_disabled: "not_eligible",
  email_provider_disabled: "unavailable",
  validation_failed: "email_invalid",
  flow_state_expired: "link_invalid",
  flow_state_not_found: "link_invalid",
  bad_code_verifier: "link_invalid",
  bad_oauth_state: "link_invalid",
  bad_oauth_callback: "provider_error",
  oauth_provider_not_supported: "provider_error",
  provider_disabled: "provider_error",
  mfa_verification_failed: "mfa_invalid",
  mfa_challenge_expired: "mfa_invalid",
  mfa_verification_rejected: "mfa_invalid",
  insufficient_aal: "mfa_required",
  session_not_found: "session_expired",
  session_expired: "session_expired",
  refresh_token_not_found: "session_expired",
  refresh_token_already_used: "session_expired",
};

/** Maps an AuthError (or any { code, message, status }) to what the student is told. */
export function classifyAuthError(error: ErrorLike): AuthProblem {
  if (!error) return "unknown";
  const message = error.message ?? "";
  // The before-user-created hook answers with this code as its message.
  if (message.includes("signup_email_not_eligible")) return "not_eligible";
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  if (error.status === 429) return "rate_limited";
  if ((error.status ?? 0) >= 500 || /fetch failed|network|timeout/i.test(message)) return "unavailable";
  return "unknown";
}

/** The ?error= values the sign-in page accepts (from the callback); anything else is ignored. */
export function parseAuthProblem(value: string | string[] | undefined): AuthProblem | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw in AUTH_MESSAGES ? (raw as AuthProblem) : null;
}
