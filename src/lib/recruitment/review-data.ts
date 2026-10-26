import "server-only";
import { cache } from "react";
import { readGovernance } from "@/lib/governance/access";
import type { GovernanceErrorCode } from "@/lib/governance/messages";
import type {
  ApplicationDetail,
  ApplicationList,
  CampaignAccess,
  CampaignBoard,
  CommitteeBoard,
  DecisionBoard,
  InterviewBoard,
  WorkItem,
} from "./review";

/**
 * Loaders of the review workspace (Phase 9). Each database function
 * identifies the caller and answers from private.application_can: what
 * comes back is already limited to what this person may see (their
 * appointment's scope, their keys within the campaign's seal). Nothing is
 * fetched and then hidden. A refusal comes back as `{ ok: false, code }`.
 * Opening an application is recorded by the database (recruitment_application).
 */

type Result<T> = { ok: true; data: T } | { ok: false; code: GovernanceErrorCode };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const getMyRecruitmentWork = cache(async (): Promise<Result<WorkItem[]>> =>
  readGovernance("my_recruitment_work", (s) => s.rpc("my_recruitment_work")),
);

export const getCampaignAccess = cache(async (campaignId: string): Promise<Result<CampaignAccess>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_campaign_access", (s) => s.rpc("recruitment_campaign_access", { p_campaign_id: campaignId }));
});

export const getCampaignBoard = cache(async (campaignId: string): Promise<Result<CampaignBoard>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_campaign_board", (s) => s.rpc("recruitment_campaign_board", { p_campaign_id: campaignId }));
});

export interface ListFilters {
  q?: string;
  position?: string;
  stage?: string;
  review?: string;
  reviewer?: string;
  tag?: string;
  from?: string;
  to?: string;
  sort?: string;
}

export const PAGE_SIZE = 25;

export async function getApplicationList(campaignId: string, filters: ListFilters, page: number): Promise<Result<ApplicationList>> {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
  return readGovernance("recruitment_application_list", (s) =>
    s.rpc("recruitment_application_list", {
      p_campaign_id: campaignId,
      p_filters: clean,
      p_limit: PAGE_SIZE,
      p_offset: Math.max(0, page - 1) * PAGE_SIZE,
    }),
  );
}

export const getApplicationDetail = cache(async (applicationId: string): Promise<Result<ApplicationDetail>> => {
  if (!UUID.test(applicationId)) return { ok: false, code: "application_not_found" };
  return readGovernance("recruitment_application", (s) => s.rpc("recruitment_application", { p_application_id: applicationId }));
});

export async function getReviewHistory(
  reviewId: string,
): Promise<Result<{ number: number; scores: Record<string, number>; recommendation: string | null; note: string | null; reason: string | null; at: string }[]>> {
  if (!UUID.test(reviewId)) return { ok: false, code: "review_not_found" };
  return readGovernance("recruitment_review_history", (s) => s.rpc("recruitment_review_history", { p_review_id: reviewId }));
}

export const getCommittee = cache(async (campaignId: string): Promise<Result<CommitteeBoard>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_committee", (s) => s.rpc("recruitment_committee", { p_campaign_id: campaignId }));
});

export const getInterviewBoard = cache(async (campaignId: string): Promise<Result<InterviewBoard>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_interview_board", (s) => s.rpc("recruitment_interview_board", { p_campaign_id: campaignId }));
});

export const getDecisionBoard = cache(async (campaignId: string): Promise<Result<DecisionBoard>> => {
  if (!UUID.test(campaignId)) return { ok: false, code: "campaign_not_found" };
  return readGovernance("recruitment_decision_board", (s) => s.rpc("recruitment_decision_board", { p_campaign_id: campaignId }));
});
