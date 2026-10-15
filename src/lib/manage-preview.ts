import "server-only";
import type { Session } from "@/lib/types";
import { getUser } from "@/lib/data/users";

/**
 * The association workspace (/manage) is a Phase 1 design shell. Real,
 * scoped management rights arrive in Phase 4; until then nobody manages
 * anything, signed in or not.
 *
 * In `next dev` only, the shell can still be reviewed with the fictional
 * "Compte démo — responsable d'asso" from the mock data. That viewer is not
 * the signed-in student and grants nothing. `next build` sets NODE_ENV to
 * "production", which inlines this flag to false: production always shows
 * the "not available yet" state.
 */
export const MANAGE_PREVIEW = process.env.NODE_ENV === "development";

/** The workspace's viewer: the demo officer in development, nobody in production. */
export async function getManagePreviewSession(): Promise<Session> {
  if (!MANAGE_PREVIEW) return { role: "visiteur", user: null };
  const user = await getUser("u-demo-responsable");
  return user ? { role: "responsable", user } : { role: "visiteur", user: null };
}
