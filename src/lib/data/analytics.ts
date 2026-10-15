import "server-only";
import { ticketSales } from "@/data/mock";
import { addDaysToKey, parisDateKey, parisISO } from "@/lib/time";
import type {
  ApplicationStatus,
  CampaignItem,
  EventItem,
  PostKind,
  RecruitmentPosition,
} from "@/lib/types";
import { getEvents } from "./events";
import { getPosts } from "./posts";
import { getCampaigns } from "./recruitment";
import { getApplicants } from "./users";

/**
 * Statistics of one association (/manage/[asso]/analytics). Counts only, all
 * derived from records the platform holds: registrations against capacity,
 * applications, publications. No page views, no "reach": nothing is tracked.
 *
 * Phase 1 derives everything from the mock data (plus the daily ticket
 * series in data/mock/analytics). Phase 2: the same shapes from SQL
 * aggregates over Supabase tables.
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

function nextMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const noon = (key: string) => parisISO(key, "12:00");

/* ---- Derivations ---------------------------------------------------------- */

function phaseOf(e: EventItem, now: Date): FillPhase {
  if (Date.parse(e.endsAt ?? e.startsAt) < now.getTime()) return "past";
  return Date.parse(e.startsAt) <= now.getTime() ? "live" : "upcoming";
}

function uncountedReason(e: EventItem): string {
  if (e.publication === "brouillon") return "Brouillon, pas encore d'inscriptions";
  if (e.publication === "programme") return "Programmé, pas encore dans l'agenda";
  if (e.registration.status === "libre") return "Entrée libre, sans inscription";
  if (e.registration.capacity === undefined) return "Billetterie pas encore ouverte, jauge à fixer";
  return "Billetterie pas encore ouverte";
}

export async function getAssociationAnalytics(associationId: string, now = new Date()): Promise<AssociationAnalytics> {
  const season = seasonOf(now);
  const todayKey = parisDateKey(now);
  const inSeason = (iso: string) => {
    const k = parisDateKey(iso);
    return k >= season.startKey && k < season.endKey;
  };

  const [upcoming, past, posts, campaigns] = await Promise.all([
    getEvents({ associationId, includeUnpublished: true, when: "upcoming" }),
    getEvents({ associationId, includeUnpublished: true, when: "past" }),
    getPosts({ associationId, includeUnpublished: true }),
    getCampaigns({ associationId, scope: "all" }),
  ]);
  // Unsent applications never reach the bureau, so they are not counted.
  const applicants = campaigns.length
    ? (await getApplicants({ campaignIds: campaigns.map((c) => c.id) })).filter((a) => a.status !== "brouillon")
    : [];

  /* Events: registrations against capacity, chronological. */
  const seasonEvents = [...past, ...upcoming]
    .filter((e) => inSeason(e.startsAt))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const counted: EventFill[] = [];
  const uncounted: UncountedEvent[] = [];
  for (const e of seasonEvents) {
    const { capacity, taken } = e.registration;
    if (e.publication === "publie" && capacity !== undefined && capacity > 0 && taken !== undefined) {
      counted.push({ event: e, taken, capacity, phase: phaseOf(e, now) });
    } else {
      uncounted.push({ event: e, reason: uncountedReason(e) });
    }
  }

  /* Ticket sales per day, with the days a related post went out. */
  const byId = new Map(seasonEvents.map((e) => [e.id, e]));
  const sales: SalesStats[] = ticketSales
    .filter((s) => byId.has(s.eventId))
    .map((s) => {
      const event = byId.get(s.eventId)!;
      const days = s.days
        .map((d) => ({ key: parisDateKey(d.day), iso: d.day, count: d.count }))
        .filter((d) => d.key <= todayKey);
      const keys = new Set(days.map((d) => d.key));
      const related = posts
        .filter((p) => p.relatedEventId === event.id && p.publication === "publie")
        .map((p) => ({ key: parisDateKey(p.publishedAt), title: p.title }))
        .filter((p) => keys.has(p.key));
      return { event, days, total: days.reduce((n, d) => n + d.count, 0), posts: related };
    })
    .filter((s) => s.days.length > 0);

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

  /* Posts per month of the season (published, then programmed). */
  const published = posts.filter((p) => p.publication === "publie" && inSeason(p.publishedAt));
  const scheduled = posts.filter((p) => p.publication === "programme" && p.scheduledFor && inSeason(p.scheduledFor));
  const monthOf = (iso: string) => parisDateKey(iso).slice(0, 7);
  let lastMonth = todayKey.slice(0, 7);
  for (const p of scheduled) if (monthOf(p.scheduledFor!) > lastMonth) lastMonth = monthOf(p.scheduledFor!);
  const months: MonthCount[] = [];
  for (let m = season.startKey.slice(0, 7); m <= lastMonth && months.length < 12; m = nextMonth(m)) {
    months.push({
      key: m,
      iso: noon(`${m}-15`),
      published: published.filter((p) => monthOf(p.publishedAt) === m).length,
      scheduled: scheduled.filter((p) => monthOf(p.scheduledFor!) === m).length,
    });
  }
  const byKind: Partial<Record<PostKind, number>> = {};
  for (const p of published) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;

  return {
    season: { label: season.label, startsAt: noon(season.startKey) },
    events: { counted, uncounted },
    sales,
    campaigns: campaignStats,
    posts: {
      months,
      published: published.length,
      scheduled: scheduled.length,
      drafts: posts.filter((p) => p.publication === "brouillon").length,
      byKind,
    },
  };
}
