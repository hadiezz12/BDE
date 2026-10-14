import "server-only";
import { memberCardOffer } from "@/data/mock/member-card";
import type { MemberCardOffer } from "@/lib/types";

/**
 * The carte cotisante an association sells, or null when it sells none
 * (only the BDE does). Mock-backed in Phase 1.
 */
export async function getMemberCardOffer(associationId: string): Promise<MemberCardOffer | null> {
  return memberCardOffer.associationId === associationId ? memberCardOffer : null;
}
