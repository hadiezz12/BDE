import "server-only";
import { cookies } from "next/headers";
import { getUser } from "@/lib/data/users";
import type { DemoRole, Session, UserProfile } from "@/lib/types";

/**
 * PHASE 1 DEMO ONLY — not authentication.
 * A cookie picks which of the three UX states to render (logged out, student,
 * association officer) so the shells can be reviewed. Supabase Auth replaces
 * this module in Phase 2; pages only ever call getSession().
 *
 * The two accounts are labelled as demo (UserProfile.demoLabel: "Compte démo
 * — étudiant·e", "Compte démo — responsable d'asso") and start empty: no
 * registrations, applications, notifications or card. The officer account
 * manages the Very Pink Club only.
 */
export const DEMO_ROLE_COOKIE = "vpc-demo-role";
export const DEMO_ROLES: DemoRole[] = ["visiteur", "etudiant", "responsable"];
/** A first visit (no demo cookie) is a visitor: nobody is shown as signed in until they pick a demo account. */
const DEFAULT_ROLE: DemoRole = "visiteur";

const USER_FOR_ROLE: Record<Exclude<DemoRole, "visiteur">, string> = {
  etudiant: "u-demo-etudiant",
  responsable: "u-demo-responsable",
};

export function parseDemoRole(value: string | undefined | null): DemoRole | null {
  return DEMO_ROLES.includes(value as DemoRole) ? (value as DemoRole) : null;
}

export async function getSession(): Promise<Session> {
  const store = await cookies();
  const role = parseDemoRole(store.get(DEMO_ROLE_COOKIE)?.value) ?? DEFAULT_ROLE;
  if (role === "visiteur") return { role, user: null };
  const user = await getUser(USER_FOR_ROLE[role]);
  return { role, user: user ?? null };
}

export function canManage(session: Session): boolean {
  return Boolean(session.user && session.user.managedAssociationIds.length > 0);
}

/** Who each demo role renders as (null for the visitor) — for the login screen's demo chooser. */
export async function getDemoProfile(role: DemoRole): Promise<UserProfile | null> {
  if (role === "visiteur") return null;
  return (await getUser(USER_FOR_ROLE[role])) ?? null;
}
