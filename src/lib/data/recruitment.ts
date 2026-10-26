import "server-only";
import { cache } from "react";
import type { CampaignItem } from "@/lib/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SupabaseConfigError } from "@/lib/supabase/env";
import {
  toCampaignItem,
  toPosition,
  type CampaignCardPayload,
  type CampaignView,
  type PublicCampaignState,
  type PublicPositionState,
  type RecruitmentFacets,
  type RecruitmentPrivacy,
} from "@/lib/recruitment/model";
import type { RecruitmentPosition } from "@/lib/types";
import { logDataError, toDataError } from "./errors";

/**
 * Recruitment as visitors read it (anon client, no cookies), through the
 * public read functions (public_recruitment_*), which return public fields
 * of published, visible campaigns of public association pages only: never a
 * draft, never a candidate, never a count of applications. Memoised per
 * request only: a publication, a pause or a hide shows on the next load.
 */

type PublicRpc =
  | "public_recruitment_campaigns"
  | "public_recruitment_campaign"
  | "public_recruitment_position"
  | "public_recruitment_facets"
  | "public_association_recruitment"
  | "public_recruitment_sitemap"
  | "public_recruitment_privacy";

async function rpc<T>(name: PublicRpc, args?: Record<string, unknown>): Promise<T | null> {
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) {
    logDataError(name, error);
    throw toDataError(error);
  }
  return data as T;
}

export interface CampaignQuery {
  view?: CampaignView;
  /** Association slug. */
  association?: string | null;
  /** "2026-2027". */
  academicYear?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function getCampaigns(query: CampaignQuery = {}): Promise<CampaignItem[]> {
  const now = new Date();
  const payload = await rpc<CampaignCardPayload[]>("public_recruitment_campaigns", {
    p_view: query.view ?? "current",
    p_organization_slug: query.association && SLUG.test(query.association) ? query.association : undefined,
    p_academic_year: query.academicYear && /^20\d{2}-20\d{2}$/.test(query.academicYear) ? query.academicYear : undefined,
    p_q: query.q?.trim() ? query.q.trim().slice(0, 80) : undefined,
    p_limit: Math.min(Math.max(query.limit ?? 50, 1), 100),
    p_offset: Math.max(query.offset ?? 0, 0),
  });
  return (payload ?? []).map((c) => toCampaignItem(c, { now }));
}

/** Campaigns taking applications now, closing soonest first — memoised for the request. */
export const getOpenCampaigns = cache(async (limit = 12): Promise<CampaignItem[]> => getCampaigns({ view: "open", limit }));

export const getRecruitmentFacets = cache(async (): Promise<RecruitmentFacets> => {
  return (
    (await rpc<RecruitmentFacets>("public_recruitment_facets")) ?? {
      current: 0,
      open: 0,
      upcoming: 0,
      closing_soon: 0,
      closed: 0,
      open_positions: 0,
      organizations: [],
      academic_years: [],
    }
  );
});

export const getCampaignPage = cache(
  async (slug: string): Promise<{ state: "ok"; campaign: CampaignItem } | { state: "moved"; slug: string } | { state: "not_found" }> => {
    if (!SLUG.test(slug) || slug.length > 100) return { state: "not_found" };
    const page = await rpc<PublicCampaignState>("public_recruitment_campaign", { p_slug: slug });
    if (!page) return { state: "not_found" };
    if (page.state === "ok") return { state: "ok", campaign: toCampaignItem(page.campaign) };
    return page;
  },
);

export const getPositionPage = cache(
  async (
    campaignSlug: string,
    positionSlug: string,
  ): Promise<
    | { state: "ok"; campaign: CampaignItem; position: RecruitmentPosition }
    | { state: "moved"; slug: string }
    | { state: "not_found" }
  > => {
    if (!SLUG.test(campaignSlug) || !SLUG.test(positionSlug) || campaignSlug.length > 100 || positionSlug.length > 80) {
      return { state: "not_found" };
    }
    const page = await rpc<PublicPositionState>("public_recruitment_position", {
      p_campaign_slug: campaignSlug,
      p_position_slug: positionSlug,
    });
    if (!page) return { state: "not_found" };
    if (page.state !== "ok") return page;
    const campaign = toCampaignItem(page.campaign);
    return { state: "ok", campaign, position: toPosition(page.position, page.campaign.closes_at) };
  },
);

/** An association page's recruitment block: what is current, then the last ones closed. */
export const getAssociationRecruitment = cache(async (slug: string): Promise<{ current: CampaignItem[]; past: CampaignItem[] }> => {
  if (!SLUG.test(slug)) return { current: [], past: [] };
  const data = await rpc<{ current: CampaignCardPayload[]; past: CampaignCardPayload[] }>("public_association_recruitment", { p_slug: slug });
  const now = new Date();
  return {
    current: (data?.current ?? []).map((c) => toCampaignItem(c, { now })),
    past: (data?.past ?? []).map((c) => toCampaignItem(c, { now })),
  };
});

export async function getRecruitmentSitemap(): Promise<{ slug: string; updated_at: string; positions: string[] }[]> {
  return (await rpc<{ slug: string; updated_at: string; positions: string[] }[]>("public_recruitment_sitemap")) ?? [];
}

/** What candidates are told before submitting (the BDE's notice; null parts are still to be decided). */
export const getRecruitmentPrivacy = cache(async (): Promise<RecruitmentPrivacy> => {
  return (
    (await rpc<RecruitmentPrivacy>("public_recruitment_privacy")) ?? {
      notice: null,
      contact: null,
      draft_months: null,
      withdrawn_months: null,
      submitted_months: null,
      selected_months: null,
      updated_at: new Date(0).toISOString(),
    }
  );
});
