/**
 * Shapes of the governance read functions (public.my_access,
 * organization_team, member_access, organization_governance,
 * governance_overview, platform_organizations, my_governance_inbox,
 * governance_history). They return jsonb, so the generated Database types
 * only say `Json`: these interfaces mirror the SQL in
 * supabase/migrations/20261019141043_create_authorization_helpers.sql and
 * 20261019141551_create_governance_bootstrap_and_views.sql. Change both
 * together.
 *
 * Nothing here grants anything: the interface reads these lists to decide
 * what to show, and every action is checked again by the database.
 */
import type { AccentKey } from "@/lib/types";
import type { MembershipStatus, Office, OrganizationStatus, TransitionKind, TransitionStatus } from "./labels";

export type OrganizationKind = "bde" | "association";

/* ---- my_access ----------------------------------------------------------- */

export interface AccessPosition {
  title: string;
  office: Office | null;
  ends_at: string;
}

export interface AccessOrganization {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  kind: OrganizationKind;
  accent: AccentKey;
  status: OrganizationStatus;
  membership_id: string;
  membership_status: MembershipStatus;
  /** Organization keys the caller holds right now (positions + backed delegations). */
  permissions: string[];
  /** Current mandates only. */
  positions: AccessPosition[];
}

export interface MyAccess {
  /** Platform keys held right now (BDE office or guardian). */
  platform: string[];
  is_guardian: boolean;
  organizations: AccessOrganization[];
}

/* ---- organization_team ------------------------------------------------ */

export interface TeamAssignment {
  id: string;
  position_id: string;
  title: string;
  office: Office | null;
  starts_at: string;
  ends_at: string;
  source: string;
  upcoming: boolean;
}

export interface TeamMemberDelegation {
  id: string;
  delegator_name: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  permissions: string[];
}

export interface TeamMember {
  membership_id: string;
  user_id: string;
  name: string;
  status: MembershipStatus;
  status_reason: string | null;
  joined_at: string;
  is_you: boolean;
  assignments: TeamAssignment[];
  delegations: TeamMemberDelegation[];
}

export interface TeamPosition {
  id: string;
  title: string;
  description: string | null;
  office: Office | null;
  template_key: string;
  permissions: string[];
  holders: number;
}

export interface TeamInvitation {
  id: string;
  email: string;
  position_title: string | null;
  mandate_ends_at: string | null;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
}

export interface TeamDelegation {
  id: string;
  delegator_name: string;
  delegator_is_you: boolean;
  delegate_name: string;
  delegate_membership_id: string;
  delegate_is_you: boolean;
  starts_at: string;
  ends_at: string;
  reason: string;
  /** False when the person who lent the rights no longer holds them. */
  effective: boolean;
  permissions: string[];
}

export interface OrganizationTeam {
  members: TeamMember[];
  positions: TeamPosition[];
  /** Empty unless the caller may invite. */
  invitations: TeamInvitation[];
  delegations: TeamDelegation[];
}

/* ---- member_access (permission inspector) -------------------------------- */

export type AssignmentState = "current" | "upcoming" | "ended" | "cancelled";

export interface MemberAccessAssignment {
  id: string;
  title: string;
  office: Office | null;
  starts_at: string;
  ends_at: string;
  status: "active" | "ended" | "cancelled";
  source: string;
  state: AssignmentState;
}

export interface MemberAccessPermission {
  key: string;
  label: string;
  category: string;
  module_ready: boolean;
  sensitive: boolean;
  /** private.explain_permission: "position", "delegation" or why not. */
  result: string;
}

export interface MemberAccess {
  membership_id: string;
  organization_id: string;
  name: string;
  is_you: boolean;
  status: MembershipStatus;
  status_reason: string | null;
  joined_at: string;
  assignments: MemberAccessAssignment[];
  permissions: MemberAccessPermission[];
}

/* ---- organization_governance --------------------------------------------- */

export interface OfficeHolder {
  user_id: string;
  name: string;
  assignment_id: string;
  starts_at: string;
  ends_at: string;
  source: string;
  is_you: boolean;
}

export interface OfficeSummary {
  office: Office;
  title: string;
  holder: OfficeHolder | null;
  /** A mandate already planned to start later (after a passation). */
  next: OfficeHolder | null;
}

export interface GuardianSummary {
  name: string;
  ends_at: string;
  is_you: boolean;
}

export interface TransitionCandidate {
  office: Office;
  name: string;
  accepted: boolean | null;
  responded_at: string | null;
  is_you: boolean;
}

export interface TransitionApproval {
  capacity: "bde_president" | "bde_vice_president" | "guardian";
  name: string;
  approved_at: string;
  is_you: boolean;
}

export interface OpenTransition {
  id: string;
  kind: TransitionKind;
  reason: string | null;
  created_at: string;
  effective_at: string;
  mandate_ends_at: string;
  expires_at: string;
  proposed_by_name: string;
  proposed_by_is_you: boolean;
  candidates: TransitionCandidate[];
  approvals: TransitionApproval[];
  required_approvals: ("bde_president" | "bde_vice_president" | "guardian")[] | null;
  can_approve: boolean;
  can_withdraw: boolean;
  can_cancel: boolean;
  can_respond: boolean;
}

export interface PastTransition {
  id: string;
  kind: TransitionKind;
  status: TransitionStatus;
  created_at: string;
  effective_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  reason: string | null;
  proposed_by_name: string;
  candidates: { office: Office; name: string }[] | null;
}

export interface OrganizationGovernance {
  organization: { id: string; slug: string; name: string; kind: OrganizationKind; status: OrganizationStatus; accent: AccentKey };
  offices: OfficeSummary[];
  guardian: GuardianSummary | null;
  transition: OpenTransition | null;
  history: PastTransition[];
  can: {
    propose_succession: boolean;
    appoint_president: boolean;
    end_president: boolean;
    propose_bde_succession: boolean;
    recover_bde: boolean;
    end_bde_office: boolean;
  };
}

/* ---- governance_overview / platform_organizations ----------------------- */

export interface GovernanceOverview {
  bde: { organization_id: string; offices: OfficeSummary[] };
  guardian: GuardianSummary | null;
  counts: { active: number; setup: number; suspended: number; archived: number };
  without_president: { id: string; slug: string; name: string; status: OrganizationStatus }[];
  open_transitions: {
    id: string;
    kind: TransitionKind;
    organization_name: string;
    organization_slug: string;
    organization_kind: OrganizationKind;
    created_at: string;
    effective_at: string;
    expires_at: string;
  }[];
  expiring_offices: {
    organization_name: string;
    organization_slug: string;
    organization_kind: OrganizationKind;
    office: Office;
    holder_name: string;
    ends_at: string;
  }[];
  health: { orphaned_assignments: number; lapsed_delegations: number; overlapping_offices: number };
}

export interface PlatformOrganization {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  kind: OrganizationKind;
  accent: AccentKey;
  status: OrganizationStatus;
  status_reason: string | null;
  /** The public page (Phase 5), separate from the organization's own status. */
  page: {
    status: "draft" | "published" | "unpublished";
    published_at: string | null;
    withheld_at: string | null;
    withheld_reason: string | null;
    is_public: boolean;
  };
  created_at: string;
  archived_at: string | null;
  president: { name: string; ends_at: string; assignment_id: string } | null;
  members: number;
  open_transition: TransitionKind | null;
}

/* ---- my_governance_inbox ----------------------------------------------- */

export interface InboxOrganization {
  id: string;
  name: string;
  slug: string;
  accent: AccentKey;
  kind: OrganizationKind;
}

export interface InboxInvitation {
  id: string;
  organization: InboxOrganization;
  position_title: string | null;
  position_permissions: string[];
  mandate_ends_at: string | null;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
}

export interface InboxCandidacy {
  transition_id: string;
  kind: TransitionKind;
  office: Office;
  organization: InboxOrganization;
  proposed_by_name: string;
  reason: string | null;
  effective_at: string;
  mandate_ends_at: string;
  expires_at: string;
  /** BDE succession: the sitting leadership has not approved yet. */
  approvals_missing: boolean;
}

export interface InboxApproval {
  transition_id: string;
  created_at: string;
  expires_at: string;
  proposed_by_name: string;
}

export interface GovernanceInbox {
  invitations: InboxInvitation[];
  candidacies: InboxCandidacy[];
  approvals: InboxApproval[];
}

/* ---- governance_history ------------------------------------------------ */

export interface GovernanceEvent {
  id: number;
  occurred_at: string;
  action: string;
  category: string;
  authority: string;
  reason: string | null;
  details: Record<string, unknown>;
  actor_name: string | null;
  subject_name: string | null;
  organization: { name: string; slug: string; kind: OrganizationKind } | null;
}

/* ---- Catalog ----------------------------------------------------------- */

export interface PermissionDefinition {
  key: string;
  scope: "organization" | "platform";
  category: string;
  label: string;
  description: string;
  is_grantable: boolean;
  is_delegable: boolean;
  is_sensitive: boolean;
  module_ready: boolean;
  sort_order: number;
}

export interface PositionTemplate {
  key: string;
  label: string;
  description: string;
  /** Set on the protected offices only, which the editor never offers. */
  office: Office | null;
  permissions: string[];
}
