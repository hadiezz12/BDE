import type { UserProfile } from "@/lib/types";

/**
 * How an account is named on screen. Phase 1 demo accounts carry a
 * `demoLabel` ("Compte démo — étudiant·e") and empty personal fields: they
 * are shown by that label, never as a person, and unknown fields are left
 * out instead of printing stray separators. Pure, client-safe.
 */

type Named = Pick<UserProfile, "firstName" | "lastName" | "demoLabel">;

/** "Compte démo — étudiant·e" on a demo account, the person's full name otherwise. */
export function accountName(user: Named): string {
  return user.demoLabel ?? [user.firstName, user.lastName].filter(Boolean).join(" ");
}

/** Short name beside the avatar: "Compte démo", or the first name. */
export function accountShortName(user: Named): string {
  return user.demoLabel ? "Compte démo" : user.firstName || accountName(user);
}

/** The first name to greet, or null on a demo account (no one to greet by name). */
export function greetingName(user: Named): string | null {
  return user.demoLabel ? null : user.firstName || null;
}

/** "Programme Grande École · 2A" with only the parts that are known; "" when none is. */
export function studyLine(user: Pick<UserProfile, "programme" | "year">): string {
  return [user.programme, user.year].filter(Boolean).join(" · ");
}

export function isDemoAccount(user: Pick<UserProfile, "demoLabel">): boolean {
  return Boolean(user.demoLabel);
}
