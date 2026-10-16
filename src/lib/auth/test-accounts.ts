/**
 * Test accounts — development and staging only.
 *
 * Students sign in with a code sent to their school address. Fictional test
 * accounts cannot receive e-mail, so a development environment can let them
 * in with a password instead, to try the site as a member, a new student…
 * Two locks keep this out of production:
 *  1. the server variable AUTH_TEST_ACCOUNTS=on (never set in production);
 *  2. only addresses of the reserved TEST_ACCOUNT_DOMAIN, which no real
 *     person has and the sign-up hook never lets anyone register.
 * Accounts are created by hand (supabase/dev/create-test-account.sql); the
 * passwords never go in git.
 */

/** Reserved for fiction (RFC 2606 / 6761): `<name>@comptes.example.test`. */
export const TEST_ACCOUNT_DOMAIN = "comptes.example.test";

export function testAccountsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTH_TEST_ACCOUNTS === "on";
}

export function isTestAccountEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at <= 0) return false;
  return /^[a-z0-9][a-z0-9.-]{0,62}$/.test(email.slice(0, at)) && email.slice(at + 1) === TEST_ACCOUNT_DOMAIN;
}
