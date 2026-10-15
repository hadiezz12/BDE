import "server-only";
import type { Session, UserProfile } from "@/lib/types";
import { getAuthContext } from "@/lib/auth/context";
import { getAvatarUrl, getMyProfile, type StudentProfile } from "@/lib/data/profile";
import { studyYearLabel } from "@/lib/auth/profile-input";

/**
 * The visitor as pages render them: a signed-in student (real Supabase Auth
 * identity + their profile) or a visitor. Replaces the Phase 1 demo cookie.
 *
 * A real account is always role "etudiant" with no managed association:
 * signing in grants no management right (Phase 4 adds scoped permissions).
 * Personal lists (registrations, applications, memberships) stay empty until
 * their own phases bring real data; nothing here is invented.
 */
export async function getSession(): Promise<Session> {
  const ctx = await getAuthContext();
  if (ctx.status === "mfa_required") return { role: "visiteur", user: null, pending: "mfa" };
  if (ctx.status !== "authenticated") return { role: "visiteur", user: null };

  const profile = await getMyProfile();
  const user = toUserProfile(ctx.userId, ctx.email, profile, profile ? await getAvatarUrl(profile.avatarPath) : null);
  return {
    role: "etudiant",
    user,
    pending: profile?.onboardingCompleted ? undefined : "onboarding",
  };
}

/** Whether the account may open the association workspace: never, until Phase 4. */
export function canManage(session: Session): boolean {
  return Boolean(session.user && session.user.managedAssociationIds.length > 0);
}

function toUserProfile(
  userId: string,
  email: string | null,
  profile: StudentProfile | null,
  avatarUrl: string | null,
): UserProfile {
  return {
    id: userId,
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    displayName: profile?.displayName ?? undefined,
    avatarUrl: avatarUrl ?? undefined,
    email: email ?? "",
    programme: profile?.program ?? "",
    year: profile?.studyYear ? studyYearLabel(profile.studyYear) : "",
    memberships: [],
    savedEventIds: [],
    registeredEventIds: [],
    managedAssociationIds: [],
  };
}
