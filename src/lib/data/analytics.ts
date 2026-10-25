import "server-only";
import { addDaysToKey, parisDateKey, parisISO } from "@/lib/time";
import type {
  ApplicationStatus,
  CampaignItem,
  EventItem,
  PostKind,
  RecruitmentPosition,
} from "@/lib/types";
import { getCampaigns } from "./recruitment";
import { getApplicants } from "./users";

/**
 * Statistics of one association (/manage/[asso]/analytics). Counts only, all
 * derived from records the platform holds: registrations against capacity,
 * applications, publications. No page views, no "reach": nothing is tracked.
 *
 * The shapes are kept for the analytics phase, which will fill them from
 * SQL aggregates; until then only recruitment is derived.
 */

/** One day of a daily series. `key` is the Paris date ("2026-10-08"); `iso` is noon that day. */
export interface DayCount {
  key: string;
  iso: string;
  count: number;
}

export interface MonthCount {
  /** "2026-09" */
  key: string;
  /** Middle of the month, Paris time — for formatting the month name. */
  iso: string;
  published: number;
  /** Programmed for that month, not out yet. */
  scheduled: number;
}

export type FillPhase = "past" | "live" | "upcoming";

/** An event whose registrations can be measured against a capacity. */
export interface EventFill {
  event: EventItem;
  taken: number;
  capacity: number;
  phase: FillPhase;
}

/** An event of the season that has nothing to measure yet, and why. */
export interface UncountedEvent {
  event: EventItem;
  reason: string;
}

export interface SalesStats {
  event: EventItem;
  days: DayCount[];
  total: number;
  /** Days on which a post about this event went out in the fil. */
  posts: { key: string; title: string }[];
}

export interface CampaignStats {
  campaign: CampaignItem;
  total: number;
  byStatus: Partial<Record<ApplicationStatus, number>>;
  byPosition: { position: RecruitmentPosition; count: number }[];
  /** Applications received per day, from opening to today (or closing). */
  perDay: DayCount[];
}

export interface PostStats {
  months: MonthCount[];
  published: number;
  scheduled: number;
  drafts: number;
  byKind: Partial<Record<PostKind, number>>;
}

export interface AssociationAnalytics {
  season: { label: string; startsAt: string };
  events: { counted: EventFill[]; uncounted: UncountedEvent[] };
  sales: SalesStats[];
  campaigns: CampaignStats[];
  posts: PostStats;
}

/* ---- Calendar helpers (Paris) ------------------------------------------ */

/** The school year runs from 1 September: "2026-2027". */
function seasonOf(now: Date) {
  const key = parisDateKey(now);
  const year = Number(key.slice(0, 4));
  const start = Number(key.slice(5, 7)) >= 9 ? year : year - 1;
  return {
    label: `${start}-${start + 1}`,
    startKey: `${start}-09-01`,
    endKey: `${start + 1}-09-01`,
  };
}

function dayRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  for (let k = fromKey; k <= toKey && keys.length < 400; k = addDaysToKey(k, 1)) keys.push(k);
  return keys;
}

const noon = (key: string) => parisISO(key, "12:00");

export async function getAssociationAnalytics(associationId: string, now = new Date()): Promise<AssociationAnalytics> {
  const season = seasonOf(now);
  const todayKey = parisDateKey(now);

  const campaigns = await getCampaigns({ associationId, scope: "all" });
  // Unsent applications never reach the bureau, so they are not counted.
  const applicants = campaigns.length
    ? (await getApplicants({ campaignIds: campaigns.map((c) => c.id) })).filter((a) => a.status !== "brouillon")
    : [];

  /*
   * Events: registrations now live in the database (Phase 7) and the bureau
   * reads them, with their counts, in the events desk. Their season-long
   * statistics come with the analytics phase; until then nothing is derived
   * from Phase 1 mock series.
   */
  const counted: EventFill[] = [];
  const uncounted: UncountedEvent[] = [];
  const sales: SalesStats[] = [];

  /* Applications per campaign: by status, by role, per day. */
  const campaignStats: CampaignStats[] = campaigns.map((campaign) => {
    const mine = applicants.filter((a) => a.campaignId === campaign.id);
    const byStatus: Partial<Record<ApplicationStatus, number>> = {};
    for (const a of mine) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const byPosition = campaign.positions.map((position) => ({
      position,
      count: mine.filter((a) => a.positionId === position.id).length,
    }));
    const openKey = parisDateKey(campaign.opensAt);
    const closeKey = parisDateKey(campaign.closesAt);
    const lastKey = closeKey < todayKey ? closeKey : todayKey;
    const perDay = openKey <= lastKey
      ? dayRange(openKey, lastKey).map((key) => ({
          key,
          iso: noon(key),
          count: mine.filter((a) => parisDateKey(a.submittedAt) === key).length,
        }))
      : [];
    return { campaign, total: mine.length, byStatus, byPosition, perDay };
  });

  /*
   * Posts per month: the publishing records now live in the database
   * (Phase 6); their statistics come with the analytics phase. Until then the
   * series is empty rather than derived from Phase 1 mock posts.
   */
  const months: MonthCount[] = [];
  const byKind: Partial<Record<PostKind, number>> = {};

  return {
    season: { label: season.label, startsAt: noon(season.startKey) },
    events: { counted, uncounted },
    sales,
    campaigns: campaignStats,
    posts: { months, published: 0, scheduled: 0, drafts: 0, byKind },
  };
}
