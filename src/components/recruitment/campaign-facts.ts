import type { ApplicationItem, ApplicationStatus, CampaignItem, CampaignStatus, RecruitmentPosition } from "@/lib/types";
import type { StatusTone } from "@/components/ui/StatusBadge";
import { daysLeft, deadlineLabel, formatDayShort } from "@/lib/format";
import { dayDiff } from "@/lib/time";

/**
 * Small derivations shared by the recruitment components. Pure functions of
 * the campaign and the clock — no data access, no formatting of their own
 * beyond what lib/format provides.
 */

/** Green = open, brand pink = last 48 h (amber is kept for safety), cyan = not yet, grey = closed. */
export const STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  ouverte: "ok",
  "derniere-chance": "accent",
  "a-venir": "info",
  cloturee: "neutral",
};

export function isOpen(status: CampaignStatus): boolean {
  return status === "ouverte" || status === "derniere-chance";
}

type Timed = Pick<CampaignItem, "status" | "opensAt" | "closesAt">;

/** Role names as tags, seats noted when there is more than one: "Communication ×2". */
export function roleTags(positions: RecruitmentPosition[]): string[] {
  return positions.map((p) => (p.seats > 1 ? `${p.title} ×${p.seats}` : p.title));
}

/**
 * The big countdown of an index row. The value is decorative; `label` is the
 * plain-language sentence that carries the meaning for everyone.
 */
export function countdown(c: Timed, now = new Date()): { value: string; unit: string; label: string } {
  if (c.status === "cloturee") return { value: "Clos", unit: "", label: deadlineLabel(c.closesAt, now) };
  if (c.status === "a-venir") {
    const days = dayDiff(now, c.opensAt);
    const label = `Ouvre le ${formatDayShort(c.opensAt)}`;
    if (days >= 1) return { value: String(days), unit: "j", label };
    return { value: String(hoursUntil(c.opensAt, now)), unit: "h", label };
  }
  if (c.status === "derniere-chance") {
    return { value: String(hoursUntil(c.closesAt, now)), unit: "h", label: deadlineLabel(c.closesAt, now) };
  }
  return { value: String(daysLeft(c.closesAt, now) ?? 0), unit: "j", label: deadlineLabel(c.closesAt, now) };
}

function hoursUntil(iso: string, now: Date): number {
  return Math.max(1, Math.ceil((Date.parse(iso) - now.getTime()) / 3_600_000));
}

/** Deadline in a few words for compact cards: "Clôture 18 oct.", "Ouvre le 20 oct.". */
export function shortDeadline(c: Timed, now = new Date()): string {
  switch (c.status) {
    case "a-venir":
      return `Ouvre le ${formatDayShort(c.opensAt)}`;
    case "ouverte":
      return `Clôture ${formatDayShort(c.closesAt)}`;
    default:
      return deadlineLabel(c.closesAt, now);
  }
}

const WEEKLY = /(\d+)(?:\s*à\s*(\d+))?\s*h\s+par semaine/i;

/**
 * Weekly time range across roles ("2 à 3 h"), only when every role states a
 * weekly figure — otherwise null, and the page says "selon le poste".
 */
export function weeklyCommitment(positions: RecruitmentPosition[]): string | null {
  let min = Infinity;
  let max = 0;
  for (const p of positions) {
    const m = p.commitment.match(WEEKLY);
    if (!m) return null;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    min = Math.min(min, lo);
    max = Math.max(max, hi);
  }
  if (!positions.length) return null;
  return min === max ? `${min} h` : `${min} à ${max} h`;
}

/** A role can close before its campaign (e.g. referents who need training first). */
export function positionClosesAt(position: RecruitmentPosition, campaign: Pick<CampaignItem, "closesAt">): string {
  return position.closesAt ?? campaign.closesAt;
}

export function isPositionOpen(
  position: RecruitmentPosition,
  campaign: Pick<CampaignItem, "status" | "closesAt">,
  now = new Date(),
): boolean {
  return isOpen(campaign.status) && Date.parse(positionClosesAt(position, campaign)) > now.getTime();
}

/** Anchor id of a role inside its campaign page. */
export function positionAnchor(id: string): string {
  return `poste-${id}`;
}

/** Tone of an application status: info while it moves, ok when accepted, quiet when over. */
export const APPLICATION_TONE: Record<ApplicationStatus, StatusTone> = {
  brouillon: "neutral",
  envoyee: "info",
  "en-revue": "info",
  entretien: "accent",
  acceptee: "ok",
  refusee: "neutral",
  retiree: "neutral",
};

/** Statuses of an application that is still going somewhere. */
export function isActiveApplication(status: ApplicationStatus): boolean {
  return status === "brouillon" || status === "envoyee" || status === "en-revue" || status === "entretien";
}

/** The student's application to a campaign (withdrawn ones don't count), if any. */
export function findApplication(applications: ApplicationItem[], campaignId: string): ApplicationItem | null {
  return applications.find((a) => a.campaignId === campaignId && a.status !== "retiree") ?? null;
}
