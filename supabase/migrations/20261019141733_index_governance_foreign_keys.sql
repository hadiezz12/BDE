-- Phase 4 · Covering indexes for the governance foreign keys.
--
-- The performance advisor flagged 17 foreign keys without a covering index
-- (database-conventions.md asks to keep it clean). Composite keys get a
-- composite index that replaces the single-column one it starts with; actor
-- columns (created_by, ended_by, revoked_by…) get a plain index so that
-- checking a user deletion never scans these tables.

drop index if exists public.position_assignments_membership_id_idx;
create index position_assignments_membership_fkey_idx
  on public.position_assignments (membership_id, organization_id, user_id);
drop index if exists public.position_assignments_position_id_idx;
create index position_assignments_position_fkey_idx
  on public.position_assignments (position_id, organization_id);
create index position_assignments_appointed_by_idx on public.position_assignments (appointed_by);
create index position_assignments_ended_by_idx on public.position_assignments (ended_by);

drop index if exists public.delegations_delegate_membership_id_idx;
create index delegations_delegate_fkey_idx
  on public.delegations (delegate_membership_id, organization_id, delegate_user_id);
create index delegations_revoked_by_idx on public.delegations (revoked_by);
create index delegation_permissions_permission_key_idx on public.delegation_permissions (permission_key);

drop index if exists public.organization_invitations_position_id_idx;
create index organization_invitations_position_fkey_idx
  on public.organization_invitations (position_id, organization_id);
create index organization_invitations_membership_id_idx on public.organization_invitations (membership_id);
create index organization_invitations_responded_by_idx on public.organization_invitations (responded_by);

create index organizations_created_by_idx on public.organizations (created_by);
create index platform_assignments_ended_by_idx on public.platform_assignments (ended_by);
create index platform_role_permissions_permission_key_idx on public.platform_role_permissions (permission_key);
create index position_permissions_permission_key_idx on public.position_permissions (permission_key);
create index position_template_permissions_permission_key_idx on public.position_template_permissions (permission_key);
create index positions_created_by_idx on public.positions (created_by);
create index positions_template_key_idx on public.positions (template_key);
