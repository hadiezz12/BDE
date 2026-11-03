import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, type GovernanceErrorCode } from "@/lib/governance/messages";
import type { AcademicYearRef, Range, SeriesRow } from "@/lib/analytics/period";

/**
 * The statistics reads (Phase 13), through the person's own session only.
 * public.organization_analytics and public.platform_analytics check every
 * section's key at the time of the call, count server-side and hide small
 * groups before anything leaves the database: the site receives counts,
 * never a row about a person. Nothing here caches across requests.
 */

export interface Freshness {
  /** When the hourly count last succeeded; null before the first run. */
  data_through: string | null;
  /** More than two hours since the last success (or never). */
  stale: boolean;
  last_failed_at: string | null;
  last_status: "succeeded" | "failed" | "skipped" | null;
  /** Days 41–400 whose stored counts no longer match the records (late corrections, deletions by a retention rule). */
  differences: number;
  reconciled_from: string | null;
  reconciled_to: string | null;
}

export type SuppressionReason = "small_group" | "small_cells" | "single_outcome" | null;

/** A breakdown made safe by private.analytics_suppress: a hidden cell is null. */
export interface Suppressed<K extends string = string> {
  total: number | null;
  cells: Partial<Record<K, number | null>>;
  suppressed: K[] | null;
  reason: SuppressionReason;
}

/** Period sums as {"metric:dimension": n}, e.g. {"posts.published:article": 4}. */
export type Totals = Record<string, number>;

export interface EventRow {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  series_key: string | null;
  state: "cancelled" | "over" | "live" | "upcoming";
  mode: "none" | "internal" | "external";
  capacity: number | null;
  confirmed: number;
  waitlisted: number;
  cancelled: number;
  created: number;
  promoted: number;
  /** Confirmed ÷ capacity, only for registrations on the platform with a capacity. */
  utilization: number | null;
}

export interface CampaignFunnel {
  id: string;
  slug: string;
  title: string;
  state: string;
  opens_at: string;
  closes_at: string;
  required_reviews: number;
  positions: number;
  started: number;
  submitted: number;
  withdrawn: number;
  candidates: number;
  by_position: { title: string; submitted: number }[];
  /** Fewer sent applications than the threshold: the later stages and the outcomes are not shown. */
  small_group: boolean;
  reviewed: number | null;
  shortlisted: number | null;
  interviewed: number | null;
  outcomes: Suppressed<"offer" | "reject" | "waitlist"> | null;
  offers: Suppressed<"accepted" | "declined" | "pending" | "expired"> | null;
}

export interface CampaignWorkflow {
  id: string;
  title: string;
  state: string;
  in_review: number;
  awaiting_assignment: number;
  awaiting_reviews: number;
  reviews_done: number;
  reviews_submitted: number;
  interviews_to_schedule: number;
  interviews_scheduled: number;
  decisions_proposed: number;
  decisions_to_release: number;
  offers_pending: number;
}

export interface IssueCounts {
  critical: number;
  warning: number;
  info: number;
}

export interface OrganizationAnalytics {
  organization: { id: string; slug: string; name: string; kind: string };
  period: Range;
  compare_period: Range | null;
  rights: Record<"overview" | "content" | "events" | "recruitment" | "workflow" | "team" | "export", boolean>;
  min_group_size: number;
  freshness: Freshness | null;
  totals: Totals;
  compare: Totals | null;
  sections: {
    overview?: {
      posts_online: number;
      events_upcoming: number;
      campaigns_open: number;
      registrations_upcoming: number;
      insights: {
        approvals_waiting: number;
        approvals_waiting_since: string | null;
        schedules_failed: number;
        events_near_capacity: number;
        campaigns_closing_week: number;
      };
    };
    content?: {
      online: number;
      archived: number;
      offline: number;
      hidden: number;
      drafts: number;
      scheduled: number;
      approvals_waiting: number;
      reviews: { approved: number; changes_requested: number; median_hours: number | null };
      series: SeriesRow[];
    };
    events?: {
      upcoming: number;
      waiting_now: number;
      series: SeriesRow[];
      by_category: { label: string; events: number }[];
      list: EventRow[];
    };
    recruitment?: { candidates: number; series: SeriesRow[]; campaigns: CampaignFunnel[] };
    workflow?: { campaigns: CampaignWorkflow[] };
    team?: {
      members_active: number;
      members_suspended: number;
      positions_held: number;
      mandates_ending_60d: number;
      presidency: boolean;
      transitions_open: number;
      issues: IssueCounts;
    };
  };
}

export interface PlatformAnalytics {
  period: Range;
  compare_period: Range | null;
  rights: Record<"view" | "configure" | "governance" | "messages" | "export", boolean>;
  min_group_size: number;
  freshness: Freshness | null;
  totals: Totals;
  /** Campus-wide recruitment totals under the threshold, left out of `totals`. */
  suppressed_totals: string[];
  compare: Totals | null;
  sections: {
    associations?: {
      active: number;
      pages_public: number;
      created: number;
      archived: number;
      memberships_active: number;
      members_distinct: number;
    };
    content?: {
      online: number;
      approvals_waiting: number;
      hidden: number;
      series: SeriesRow[];
      by_association: { name: string; slug: string; published: number }[];
    };
    events?: {
      upcoming: number;
      confirmed_for_held: number;
      series: SeriesRow[];
      by_association: { name: string; slug: string; held: number; cancelled: number; registrations: number }[];
    };
    recruitment?: {
      campaigns_open: number;
      campaigns_published: number;
      positions_open: number;
      /** [month "2026-10", count or null when under the threshold] */
      submitted_by_month: [string, number | null][];
      by_association: Suppressed;
      outcomes: Suppressed<"offer" | "reject" | "waitlist">;
      offers: Suppressed<"accepted" | "declined">;
    };
    insights?: { events_near_capacity: number; campaigns_closing_week: number; approvals_waiting_2d: number };
    governance?: {
      bde_president: boolean;
      bde_vice_president: boolean;
      associations_without_president: number;
      mandates_ending_30d: number;
      transitions_open: number;
      issues: IssueCounts;
    };
    messages?: {
      series: SeriesRow[];
      backlog: { queued: number; retrying: number; oldest_queued_at: string | null };
    };
  };
}

export type AnalyticsRead<T> = { ok: true; data: T } | { ok: false; code: GovernanceErrorCode };

async function read<T>(where: string, call: (s: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>): Promise<AnalyticsRead<T>> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false, code: "not_authenticated" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await call(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    // A refusal is expected when a key is missing or has just ended: only log the unexpected.
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false, code };
  }
  if (!data) return { ok: false, code: "unexpected" };
  return { ok: true, data: data as T };
}

export function getOrganizationAnalytics(organizationId: string, period: Range, compare: Range | null) {
  return read<OrganizationAnalytics>("organization_analytics", (s) =>
    s.rpc("organization_analytics", {
      p_organization_id: organizationId,
      p_from: period.from,
      p_to: period.to,
      p_compare_from: compare?.from,
      p_compare_to: compare?.to,
    }),
  );
}

export function getPlatformAnalytics(period: Range, compare: Range | null) {
  return read<PlatformAnalytics>("platform_analytics", (s) =>
    s.rpc("platform_analytics", { p_from: period.from, p_to: period.to, p_compare_from: compare?.from, p_compare_to: compare?.to }),
  );
}

/** The current and closed academic years of the Phase 11 calendar, newest first (empty when none is configured). */
export const getAnalyticsYears = cache(async (): Promise<AcademicYearRef[]> => {
  const r = await read<AcademicYearRef[]>("analytics_years", (s) => s.rpc("analytics_years"));
  return r.ok && Array.isArray(r.data) ? r.data : [];
});

export type ExportSection = "overview" | "content" | "events" | "recruitment" | "workflow" | "team" | "associations" | "governance" | "messages";

/** Records a report or an export (who, scope, sections, period; never the figures). Refused without the right to export. */
export async function logAnalyticsExport(args: {
  scope: "organization" | "platform";
  organizationId: string | null;
  kind: "csv" | "report";
  sections: ExportSection[];
  period: Range;
}): Promise<{ ok: true } | { ok: false; code: GovernanceErrorCode }> {
  const r = await read<null>("log_analytics_export", async (s) => {
    const { error } = await s.rpc("log_analytics_export", {
      p_scope: args.scope,
      // Null for the platform scope (the function ignores it there); the generated type cannot say "or null".
      p_organization_id: args.organizationId as string,
      p_kind: args.kind,
      p_sections: args.sections,
      p_from: args.period.from,
      p_to: args.period.to,
    });
    return { data: error ? null : true, error };
  });
  return r.ok ? { ok: true } : r;
}
