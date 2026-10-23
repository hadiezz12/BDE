import type { ReportReason } from "@/lib/posts/editor";
import { routes } from "@/lib/routes";
import { formatDayShort, formatTime } from "@/lib/format";

/**
 * Words of the BDE's moderation and "à la une" screens. The reasons are the
 * ones a student picks when reporting (public.content_reports.reason), in
 * the order the report form offers them.
 */

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  harassment: "Harcèlement",
  discrimination: "Contenu discriminatoire",
  misleading: "Information trompeuse ou dangereuse",
  privacy: "Vie privée",
  image_rights: "Image d'une personne sans son accord",
  spam: "Spam",
  other: "Autre",
};

export const REPORT_REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

/** The moderation views, in the URL (?vue=…); the open reports are the default. */
export const MODERATION_VIEWS = [
  { key: null, label: "Signalements ouverts" },
  { key: "masques", label: "Masqués" },
  { key: "traites", label: "Traités" },
  { key: "historique", label: "Historique" },
] as const;

export type ModerationView = "ouverts" | "masques" | "traites" | "historique";

export function parseModerationView(raw: string | string[] | undefined): ModerationView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "masques" || v === "traites" || v === "historique" ? v : "ouverts";
}

/** One reported or hidden post, as its moderator reads it (published content only). */
export function moderatedPostHref(postId: string): string {
  return `${routes.managePlatformModeration}/${postId}`;
}

export function moderationViewHref(view: ModerationView): string {
  return view === "ouverts" ? routes.managePlatformModeration : `${routes.managePlatformModeration}?vue=${view}`;
}

/** "14 oct. à 21h30", Paris time. */
export function stamp(iso: string): string {
  return `${formatDayShort(iso)} à ${formatTime(iso)}`;
}

/** Campus-wide prominence: at most 3 stories "à la une", 2 important BDE notices (public.set_post_prominence). */
export const PROMINENCE_LIMIT = { featured: 3, important: 2 } as const;

/** The furthest end date the database accepts for a prominence (60 days from now). */
export const PROMINENCE_MAX_DAYS = 59;
