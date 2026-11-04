import "server-only";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, type GovernanceErrorCode } from "@/lib/governance/messages";
import type { NoticeSection } from "./notice";
import type { PrivacyRequestKind, PrivacyRequestStatus } from "./labels";

/**
 * The privacy reads (Phase 14), each through the person's own session and a
 * database function that checks who they are: the requester sees their own
 * requests, the privacy officer the queue (with the second factor). Nothing
 * here is cached.
 */

export interface RequestEvent {
  action: string;
  at: string;
  note: string | null;
  by?: string | null;
  visible?: boolean;
}

export interface MyRequest {
  id: string;
  reference: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  received_at: string;
  due_at: string;
  extended: boolean;
  extension_reason: string | null;
  decision_reason: string | null;
  completed_at: string | null;
  withdrawable: boolean;
  events: RequestEvent[];
  artifacts: { id: string; expires_at: string; size_bytes: number; downloaded_at: string | null; available: boolean }[];
}

export interface Responsibility {
  kind: "position" | "platform_role" | "committee" | "delegation";
  organization: string | null;
  title: string | null;
  office: string | null;
  ends_at: string;
}

export interface MyPrivacyOverview {
  counts: Record<string, number | boolean>;
  responsibilities: Responsibility[];
  requests: MyRequest[];
}

export interface QueueRequest {
  id: string;
  reference: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  source: "site" | "offline";
  identity_status: string;
  received_at: string;
  due_at: string;
  extended: boolean;
  overdue: boolean;
  requester: string | null;
  handler: string | null;
}

export interface QueueIncident {
  id: string;
  title: string;
  kind: string;
  severity: string;
  status: string;
  detected_at: string;
  personal_data: "unknown" | "no" | "yes";
  aware_at: string | null;
  authority_deadline: string | null;
  risk: string;
  authority_decision: string;
  individuals_decision: string;
  pending_decision: boolean;
}

export interface RetentionHold {
  id: string;
  scope: string;
  subject_id: string;
  purpose: string;
  legal_basis: string;
  decided_by: string;
  review_on: string;
  created_at: string;
  lapsed: boolean;
}

export interface PrivacyQueue {
  requests: QueueRequest[];
  incidents: QueueIncident[];
  holds: RetentionHold[];
}

export interface PrivacyRequestDetail {
  request: {
    id: string;
    reference: string;
    kind: PrivacyRequestKind;
    status: PrivacyRequestStatus;
    details: string | null;
    source: "site" | "offline";
    identity_status: string;
    identity_note: string | null;
    received_at: string;
    due_at: string;
    extended_until: string | null;
    extension_reason: string | null;
    decision_reason: string | null;
    decided_at: string | null;
    completed_at: string | null;
    effective_due_at: string;
    extension_possible: boolean;
  };
  requester: {
    name: string;
    email: string | null;
    erased: boolean;
    counts: Record<string, number | boolean>;
    responsibilities: Responsibility[];
    held: boolean;
    held_applications: number;
  } | null;
  events: RequestEvent[];
  artifacts: { id: string; created_at: string; expires_at: string; size_bytes: number; downloaded_at: string | null; download_count: number; purged_at: string | null }[];
  pending_files: number;
}

export interface PublishedNotice {
  current: {
    version: string;
    language: string;
    sections: NoticeSection[];
    hash: string;
    approved_by: string;
    approved_on: string;
    effective_at: string;
  } | null;
  upcoming: { version: string; effective_at: string } | null;
  history: { version: string; approved_on: string; effective_at: string; approved_by: string; hash: string }[];
}

export interface FormPrivacyCheck {
  draft: boolean;
  flagged: string[];
  reviewed: boolean;
  justification?: string | null;
  reviewed_at?: string | null;
}

export type PrivacyRead<T> = { ok: true; data: T } | { ok: false; code: GovernanceErrorCode };

type Call = (s: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

async function read<T>(where: string, call: Call, signedIn = true): Promise<PrivacyRead<T>> {
  if (signedIn) {
    const ctx = await getAuthContext();
    if (ctx.status !== "authenticated") return { ok: false, code: "not_authenticated" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await call(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false, code };
  }
  return { ok: true, data: data as T };
}

export const getMyPrivacyOverview = () => read<MyPrivacyOverview>("my_privacy_overview", (s) => s.rpc("my_privacy_overview"));

export const getPrivacyQueue = () => read<PrivacyQueue>("privacy_requests_queue", (s) => s.rpc("privacy_requests_queue"));

export const getPrivacyRequest = (id: string) =>
  read<PrivacyRequestDetail>("privacy_request_detail", (s) => s.rpc("privacy_request_detail", { p_request_id: id }));

/** The approved notice in force, for everyone (visitors included). */
export async function getPublishedNotice(): Promise<PublishedNotice | null> {
  try {
    const r = await read<PublishedNotice>("public_privacy_notice", (s) => s.rpc("public_privacy_notice", { p_language: "fr" }), false);
    return r.ok ? r.data : null;
  } catch {
    // No Supabase settings (a build without them): the draft is shown.
    return null;
  }
}

export const getFormPrivacyCheck = (campaignId: string) =>
  read<FormPrivacyCheck>("recruitment_form_privacy_check", (s) => s.rpc("recruitment_form_privacy_check", { p_campaign_id: campaignId }));
