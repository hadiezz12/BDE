import type { UserProfile } from "@/lib/types";

/**
 * How the workspace greets the viewer. A Phase 1 demo account is a label
 * ("Compte démo — responsable d'asso"), not a person: no "Salut Compte démo".
 */
export function greeting(user: Pick<UserProfile, "firstName" | "demoLabel">): string | null {
  return user.demoLabel ? null : `Salut ${user.firstName}.`;
}
