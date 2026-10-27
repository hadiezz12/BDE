import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { JobHealth } from "./labels";

/**
 * The continuity reads (Phase 11), each through the person's own session
 * and a database function that checks their key (the BDE's, an
 * association's, the guardian's, the privacy officer's). Null when the read
 * fails or the person may not see it: pages check the key first and say so.
 */

export interface AcademicYear {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: "planned" | "current" | "closed";
  mandate_starts_at: string;
  mandate_ends_at: string;
  handover_starts_on: string | null;
  recruitment_opens_on: string | null;
  recruitment_closes_on: string | null;
  reminder_offsets: number[];
  notes: string | null;
  created_at: string;
  rolled_over_at: string | null;
  rolled_over_by_name: string | null;
}

export interface Check {
  key: string;
  status: "ok" | "attention" | "info";
  value: unknown;
  detail?: unknown;
}

export interface YearPreparation {
  year: AcademicYear | null;
  current: AcademicYear | null;
  auto?: Check[];
  manual?: Array<{ key: string; done: boolean; note: string | null; confirmed_at: string | null; confirmed_by_name: string | null }>;
  can_roll_over?: boolean;
}

export interface Issue {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  audience: string;
  details: Record<string, unknown>;
  first_detected_at: string;
  notified_at: string | null;
  escalated_at: string | null;
}

export interface TransitionSummary {
  id: string;
  kind: string;
  effective_at: string;
  mandate_ends_at: string;
  expires_at: string;
  created_at: string;
  candidates: Array<{ office: string; name: string; accepted: boolean | null }>;
  approvals: string[];
  missing_approvals: string[] | null;
  organization?: string;
  slug?: string;
}

export interface GovernanceHealth {
  generated_at: string;
  year: AcademicYear | null;
  bde: Array<{ office: string; name: string | null; ends_at: string | null; successor: string | null; ready: boolean }>;
  guardian: { configured: boolean; name: string | null; ready: boolean };
  associations: { total: number; without_president: number };
  presidencies: Array<{ organization: string; slug: string; name: string; ends_at: string; succession: string }>;
  mandates_expiring_30: number;
  transitions: TransitionSummary[];
  delegations: { active: number; ended_30d: number };
  officers_without_mfa: number;
  handovers_not_started: number;
  issues: Issue[];
  check: { last_succeeded_at: string | null; health: JobHealth };
}

export interface JobRow {
  key: string;
  area: string;
  schedule: string;
  critical: boolean;
  retryable: boolean;
  health: JobHealth;
  last_started_at: string | null;
  last_succeeded_at: string | null;
  last_failed_at: string | null;
  last_status: "succeeded" | "failed" | "skipped" | null;
  last_duration_ms: number | null;
  last_result: Record<string, unknown> | null;
  last_error: string | null;
  consecutive_failures: number;
  cron_last_status: string | null;
  runs_24h: { succeeded: number; failed: number; skipped: number };
}

export interface BackupStatus {
  kind: string;
  status: "never" | "verified" | "partial" | "failed" | "stale";
  checked_on: string | null;
  environment: string | null;
  method: string | null;
  notes: string | null;
  recorded_by_name: string | null;
}

export interface RegisterRow {
  key: string;
  area: string;
  provider: string | null;
  owner: string | null;
  contact: string | null;
  renewal_on: string | null;
  status: "verified" | "needs_review" | "not_configured";
  notes: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  updated_at: string | null;
}

export interface IncidentRow {
  id: string;
  title: string;
  kind: string;
  severity: string;
  status: string;
  impact: string | null;
  detected_at: string;
  resolved_at: string | null;
  owner_name: string | null;
  updates: Array<{ status: string; note: string; created_at: string; author_name: string | null }>;
}

export interface PlatformOperations {
  generated_at: string;
  scheduler_available: boolean;
  jobs: JobRow[];
  notifications: { mode: string; due: number; failed_7d: number; accepted_7d: number };
  storage: { pending: number; stuck: number; oldest: string | null };
  incidents: IncidentRow[];
  backups: BackupStatus[];
  register: RegisterRow[];
  issues: Issue[];
  schema_version: string | null;
}

export interface SecurityHealth {
  generated_at: string;
  checks: Array<{ key: string; status: "ok" | "attention" | "info"; value: unknown }>;
}

export interface RetentionOverview {
  policies: Array<{
    key: string;
    keep_months: number | null;
    note: string | null;
    updated_at: string | null;
    updated_by_name: string | null;
    eligible: { count: number; oldest: string | null } | null;
  }>;
  recruitment: Record<string, { months: number | null; applications: number | null; documents: number | null; campaigns: number | null }>;
  housekeeping: Array<{ key: string; keep_days: number }>;
  last_run: { at: string | null; status: string | null; result: Record<string, unknown> | null } | null;
  can_edit: boolean;
}

export interface HandoverItem {
  key: string;
  area: string;
  label: string;
  help: string | null;
  metric: unknown;
  done: boolean;
  note: string | null;
  updated_at: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  can_edit: boolean;
}

export interface OrganizationContinuity {
  organization: { id: string; name: string; slug: string; status: string };
  year: AcademicYear | null;
  president: { name: string; ends_at: string; is_me: boolean } | null;
  successor: { name: string; renewal: boolean } | null;
  succession: { state: string; ends_at: string | null };
  transition: TransitionSummary | null;
  officers_expiring: Array<{ name: string; position: string; ends_at: string }> | null;
  counts: Record<"officers_expiring" | "scheduled_posts" | "pending_posts" | "upcoming_events" | "active_campaigns", number>;
  handover: HandoverItem[];
  members: Array<{ user_id: string; name: string }> | null;
  issues: Issue[];
  can: { succession: boolean; team: boolean; areas: string[] };
}

export interface GuardianContinuity {
  generated_at: string;
  offices: Array<{ office: string; name: string | null; ends_at: string | null; vacant: boolean }>;
  transition: TransitionSummary | null;
  issues: Array<{ id: string; kind: string; severity: string; office: string | null; ends_at: string | null; first_detected_at: string }>;
  readiness: { mfa: boolean; recovery_procedure: string | null; technical_owner: string | null };
}

export interface HandoverReport {
  generated_at: string;
  current_year: AcademicYear | null;
  next_year: AcademicYear | null;
  from: string;
  bde: Array<{ office: string; current: string | null; incoming: string | null }>;
  bde_transition: TransitionSummary | null;
  associations: { total: number; ready: number; action: Array<{ name: string; slug: string; state: string }> };
  work: { upcoming_events: number; scheduled_posts: number; open_campaigns: number };
  platform: {
    jobs_not_ok: string[];
    failed_deliveries_7d: number;
    notification_mode: string;
    backups: BackupStatus[];
    register_not_verified: number;
    retention_unconfigured: number;
  };
  issues: Issue[];
}

export interface Heartbeat {
  database: boolean;
  jobs_on_time: boolean | null;
  checked_at: string;
}

type Rpc = (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

async function read<T>(where: string, rpc: Rpc, signedIn = true): Promise<T | null> {
  if (signedIn) {
    const ctx = await getAuthContext();
    if (ctx.status !== "authenticated") return null;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc(supabase);
  if (error) {
    // A refusal is expected when the key is missing: only log the unexpected.
    if (error.code !== "P0001") logDataError(where, { code: error.code ?? "", message: "" });
    return null;
  }
  return (data ?? null) as T | null;
}

export const getGovernanceHealth = cache(() => read<GovernanceHealth>("governance_health", (s) => s.rpc("governance_health")));
export const getPlatformOperations = cache(() => read<PlatformOperations>("platform_operations", (s) => s.rpc("platform_operations")));
export const getSecurityHealth = cache(() => read<SecurityHealth>("security_health", (s) => s.rpc("security_health")));
export const getAcademicYears = cache(() => read<AcademicYear[]>("academic_years", (s) => s.rpc("academic_years")));
export const getYearPreparation = cache((yearId: string | null) =>
  read<YearPreparation>("academic_year_preparation", (s) => s.rpc("academic_year_preparation", yearId ? { p_year_id: yearId } : {})),
);
export const getRetentionOverview = cache(() => read<RetentionOverview>("retention_overview", (s) => s.rpc("retention_overview")));
export const getOrganizationContinuity = cache((organizationId: string) =>
  read<OrganizationContinuity>("organization_continuity", (s) => s.rpc("organization_continuity", { p_organization_id: organizationId })),
);
export const getGuardianContinuity = cache(() => read<GuardianContinuity>("guardian_continuity", (s) => s.rpc("guardian_continuity")));
export const getHandoverReport = cache(() => read<HandoverReport>("continuity_handover_report", (s) => s.rpc("continuity_handover_report")));

/** Booleans only, for anyone (the public /api/health and the BDE's banner). */
export const getHeartbeat = cache(() => read<Heartbeat>("platform_heartbeat", (s) => s.rpc("platform_heartbeat"), false));
