import type { RevisionStatus } from "@/lib/posts/model";
import type { PostReviewEntry } from "@/lib/posts/editor";
import { formatDayShort } from "@/lib/format";

/** A version's own state, in words (the post's overall stage is PostStageBadge's job). */
export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  draft: "Brouillon",
  submitted: "En relecture",
  changes_requested: "Modifications demandées",
  approved: "Approuvée",
  superseded: "Remplacée",
};

export const REVISION_STATUS_TONE: Record<RevisionStatus, "ok" | "warn" | "neutral" | "accent"> = {
  draft: "neutral",
  submitted: "warn",
  changes_requested: "warn",
  approved: "accent",
  superseded: "neutral",
};

/** One review decision as a sentence: "Julie a approuvé la version n°3." */
export function reviewSentence(entry: Pick<PostReviewEntry, "decision" | "reviewer_name" | "revision">): string {
  const version = `la version n°${entry.revision}`;
  switch (entry.decision) {
    case "approved":
      return `${entry.reviewer_name} a approuvé ${version}.`;
    case "changes_requested":
      return `${entry.reviewer_name} a demandé des modifications sur ${version}.`;
    default:
      // Direct publishing: publishing or scheduling the draft approves it.
      return `${entry.reviewer_name} a validé ${version} en la publiant ou en la programmant directement, sans relecture.`;
  }
}

const clockFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "14:32" (Paris). */
export function clock(at: string | number): string {
  return clockFormatter.format(new Date(at));
}

/** "21 oct. à 14:32" (Paris). */
export function stamp(iso: string): string {
  return `${formatDayShort(iso)} à ${clock(iso)}`;
}
