import type { ApplicationItem, ApplicationStatus, CampaignItem, CampaignStatus, RecruitmentPosition } from "@/lib/types";
import type { StatusTone } from "@/components/ui/StatusBadge";
import { daysLeft, deadlineLabel, formatDayShort, plural } from "@/lib/format";
import { dayDiff } from "@/lib/time";
import { isOpen } from "@/lib/recruitment/model";

export { isOpen, isOver } from "@/lib/recruitment/model";

/**
 * Small derivations shared by the recruitment components. Pure functions of
 * the campaign and the clock — no data access, no formatting of their own
 * beyond what lib/format provides. Whether a position takes applications is
 * the database's answer (`accepting`), never recomputed here.
 */

/** Green = open, brand pink = last 48 h (amber is kept for safety), cyan = not yet, grey = paused or over. */
export const STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  ouverte: "ok",
  "derniere-chance": "accent",
  "a-venir": "info",
  "en-pause": "neutral",
  cloturee: "neutral",
  annulee: "neutral",
};

type Timed = Pick<CampaignItem, "status" | "opensAt" | "closesAt">;

/** Role names as tags, places noted when the association announced more than one: "Communication ×2". */
export function roleTags(positions: RecruitmentPosition[]): string[] {
  return positions.map((p) => (p.openings && p.openings > 1 ? `${p.title} ×${p.openings}` : p.title));
}

/** "3 postes · 5 places", or "3 postes" when a position did not say how many. */
export function positionsLine(c: Pick<CampaignItem, "positions" | "seats">): string {
  const roles = plural(c.positions.length, "poste");
  return c.seats !== null ? `${roles} · ${plural(c.seats, "place")}` : roles;
}

/**
 * The big countdown of an index row. The value is decorative; `label` is the
 * plain-language sentence that carries the meaning for everyone.
 */
export function countdown(c: Timed, now = new Date()): { value: string; unit: string; label: string } {
  if (c.status === "annulee") return { value: "Annulé", unit: "", label: "Recrutement annulé par l'association" };
  if (c.status === "cloturee") return { value: "Clos", unit: "", label: deadlineLabel(c.closesAt, now) };
  if (c.status === "en-pause") return { value: "Pause", unit: "", label: "En pause : les candidatures reprendront à la réouverture" };
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
    case "en-pause":
      return "En pause";
    case "annulee":
      return "Annulé";
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
    const m = p.commitment?.match(WEEKLY);
    if (!m) return null;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    min = Math.min(min, lo);
    max = Math.max(max, hi);
  }
  if (!positions.length) return null;
  return min === max ? `${min} h` : `${min} à ${max} h`;
}

/** Anchor id of a role inside its campaign page. */
export function positionAnchor(id: string): string {
  return `poste-${id}`;
}

/** Positions taking applications right now (the database's answer). */
export function openPositions(c: Pick<CampaignItem, "status" | "positions">): RecruitmentPosition[] {
  return isOpen(c.status) ? c.positions.filter((p) => p.accepting) : [];
}

/** Draft = quiet, sent = cyan (on its way), withdrawn = quiet. "Envoyée" never means read or accepted. */
export const APPLICATION_TONE: Record<ApplicationStatus, StatusTone> = {
  brouillon: "neutral",
  envoyee: "info",
  retiree: "neutral",
};

/** Statuses of an application that is still going somewhere. */
export function isActiveApplication(status: ApplicationStatus): boolean {
  return status === "brouillon" || status === "envoyee";
}

/** The student's applications to a campaign that still count (withdrawn ones don't). */
export function applicationsTo(applications: ApplicationItem[], campaignId: string): ApplicationItem[] {
  return applications.filter((a) => a.campaign.id === campaignId && a.status !== "retiree");
}

/** The personal line of a campaign row: "Ton brouillon t'attend", "Candidature envoyée (Trésorerie)". */
export function personalNote(applications: ApplicationItem[], campaignId: string): string | undefined {
  const mine = applicationsTo(applications, campaignId);
  if (mine.length === 0) return undefined;
  const sent = mine.filter((a) => a.status === "envoyee");
  if (sent.length > 0) return `Candidature envoyée (${sent.map((a) => a.position.title).join(", ")})`;
  return "Ton brouillon t'attend";
}
