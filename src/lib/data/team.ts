import "server-only";
import { associationMembers, teamInvites } from "@/data/mock/team";
import type { AssociationMember, TeamInvite } from "@/lib/types";

/**
 * The people around a bureau, for /manage/[asso]/team. The bureau itself is
 * Association.team (lib/data/associations). Mock-backed in Phase 1; same
 * signatures once the memberships live in Supabase.
 */

/** Active members who are not on the bureau, longest-standing first. */
export async function getAssociationMembers(associationId: string): Promise<AssociationMember[]> {
  return associationMembers
    .filter((m) => m.associationId === associationId)
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
}

/** Bureau invitations still waiting for an answer, newest first. */
export async function getTeamInvites(associationId: string): Promise<TeamInvite[]> {
  return teamInvites
    .filter((i) => i.associationId === associationId)
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
}
