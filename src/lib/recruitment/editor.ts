import "server-only";
import { cache } from "react";
import { readGovernance } from "@/lib/governance/access";
import type { GovernanceErrorCode } from "@/lib/governance/messages";
import type { AccentKey } from "@/lib/types";
import type { OrganizationCardPayload } from "@/lib/posts/model";
import type { CampaignCardPayload, CampaignState, PositionPayload, RecruitmentPrivacy } from "./model";
import type { FormSchema } from "./form";

/**
 * Loaders of the recruitment desk, the campaign wizard, the form preview and
 * the BDE's list. Each database function identifies the caller and checks
 * the right itself (recruitment.campaigns.manage / .questions.manage /
 * .publish in the campaign's own association; platform.content.moderate
 * for the BDE). None of them returns a candidate: counts only. A refusal
 * comes back as `{ ok: false, code }`, never as data.
 */

type Result<T> = { ok: true; data: T } | { ok: false; code: GovernanceErrorCode };

/** private.campaign_summary: a campaign as its team's desk lists it. */
export interface CampaignSummary {
  id: string;
  slug: string | null;
  title: string;
  academic_year: string | null;
  state: CampaignState;
  publication: "draft" | "published" | "unpublished";
  status: "scheduled" | "paused" | "closed" | "cancelled";
  opens_at: string | null;
  closes_at: string | null;
  hidden: { at: string; reason: string } | null;
  archived_at: string | null;
  first_published_at: string | null;
  is_public: boolean;
  /** What stops it from going online now (a database code), or null. */
  blocker: string | null;
  cover: CampaignCardPayload["cover"];
  positions: number;
  submitted: number;
  withdrawn: number;
  form: { live: number | null; draft: boolean };
  created_by_name: string | null;
  updated_at: string;
  /** Phase 9: present when the person may read this campaign's applications (null otherwise). */
  review?: { to_review: number } | null;
}

export interface RecruitmentRights {
  manage: boolean;
  questions: boolean;
  publish: boolean;
}

export interface RecruitmentDashboard {
  organization: {
    id: string;
    slug: string;
    name: string;
    short_name: string | null;
    accent: AccentKey;
    kind: "bde" | "association";
    status: "setup" | "active" | "suspended" | "archived";
    page_public: boolean;
  };
  can: RecruitmentRights;
  campaigns: CampaignSummary[];
}

/** Every column of a campaign, as its team may read it. */
export interface CampaignRow {
  id: string;
  organization_id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  cover_media_id: string | null;
  academic_year: string | null;
  opens_at: string | null;
  closes_at: string | null;
  timezone: string;
  max_applications: number;
  eligible_years: number[] | null;
  eligibility_note: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  process: { label: string; detail?: string; date?: string }[];
  faq: { question: string; answer: string }[];
  publication: "draft" | "published" | "unpublished";
  first_published_at: string | null;
  published_at: string | null;
  status: "scheduled" | "paused" | "closed" | "cancelled";
  paused_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  archived_at: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  active_form_version_id: string | null;
  duplicated_from: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PositionRow {
  id: string;
  campaign_id: string;
  slug: string;
  title: string;
  team: string | null;
  summary: string | null;
  description: string | null;
  missions: string | null;
  expectations: string | null;
  commitment: string | null;
  openings: number | null;
  closes_at: string | null;
  eligible_years: number[] | null;
  template_key: string | null;
  display_order: number;
  retired_at: string | null;
  /** Counts only. */
  submitted: number;
  withdrawn: number;
  has_applications: boolean;
  /** Effective closing (its own or the campaign's). */
  closes: string | null;
}

export interface RecruitmentEditor {
  campaign: CampaignRow;
  summary: CampaignSummary;
  organization: OrganizationCardPayload & { status: RecruitmentDashboard["organization"]["status"]; page_public: boolean };
  positions: PositionRow[];
  form: {
    draft: { id: string; number: number; edit_version: number; schema: FormSchema; updated_at: string; updated_by_name: string | null } | null;
    live: { id: string; number: number; schema: FormSchema; published_at: string } | null;
    versions: { id: string; number: number; status: "draft" | "published" | "superseded"; published_at: string | null; submitted: number }[];
  };
  media: { id: string; path: string; kind: string; width: number | null; height: number | null; alt: string | null }[];
  templates: { key: string; label: string }[];
  history: { occurred_at: string; action: string; actor_name: string | null; reason: string | null; details: Record<string, unknown> | null }[];
  can: RecruitmentRights;
  blocker: string | null;
}

export interface FormPreview {
  campaign: CampaignCardPayload;
  position: PositionPayload;
  form: FormSchema;
  number: number | null;
  which: "draft" | "live";
  privacy: RecruitmentPrivacy;
}

export type PlatformCampaign = CampaignCardPayload & {
  hidden: { at: string; reason: string; by_name: string | null } | null;
  publication: CampaignRow["publication"];
  is_public: boolean;
  submitted: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const getRecruitmentDashboard = cache(async (organizationId: string): Promise<Result<RecruitmentDashboard>> =>
  readGovernance("recruitment_dashboard", (s) => s.rpc("recruitment_dashboard", { p_organization_id: organizationId })),
);

export const getRecruitmentEditor = cache(async (campaignId: string): Promise<Result<RecruitmentEditor>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_editor", (s) => s.rpc("recruitment_editor", { p_campaign_id: campaignId }));
});

export async function getFormPreview(campaignId: string, positionId: string, which: "draft" | "live"): Promise<Result<FormPreview>> {
  if (!UUID.test(campaignId) || !UUID.test(positionId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_form_preview", (s) =>
    s.rpc("recruitment_form_preview", { p_campaign_id: campaignId, p_position_id: positionId, p_which: which }),
  );
}

export async function getPlatformRecruitment(q: string | null, view: "current" | "past" | "hidden"): Promise<Result<PlatformCampaign[]>> {
  return readGovernance("platform_recruitment", (s) =>
    s.rpc("platform_recruitment", { p_q: q?.trim() ? q.trim().slice(0, 80) : undefined, p_view: view }),
  );
}

export interface PostCampaignOptions {
  current: { id: string; slug: string | null; title: string; state: CampaignState; is_public: boolean; organization: OrganizationCardPayload } | null;
  can_change: boolean;
  options: { id: string; title: string; state: CampaignState; own: boolean; organization: OrganizationCardPayload }[];
}

export async function getPostCampaignOptions(postId: string): Promise<Result<PostCampaignOptions>> {
  if (!UUID.test(postId)) return { ok: false, code: "post_not_found" };
  return readGovernance("post_campaign_options", (s) => s.rpc("post_campaign_options", { p_post_id: postId }));
}
