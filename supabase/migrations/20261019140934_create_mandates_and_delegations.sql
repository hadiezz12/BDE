-- Phase 4 · Mandates (position assignments), the continuity guardian, and
-- temporary delegations.
--
-- A position assignment IS the mandate: who holds which position, in which
-- organization, from when to when. Every mandate ends (ends_at is required):
-- there is no "admin forever". Authorization compares the exact timestamps
-- with now() on every request, so a mandate stops working the instant it
-- ends, without any scheduled job; statuses only record decisions (an early
-- end, a cancellation).
--
-- Overlaps are prevented by exclusion constraints, not by now()-based
-- indexes:
--   * nobody holds the same position twice at once;
--   * a protected office has one holder at any instant, including scheduled
--     future mandates;
--   * the BDE president and vice-president are two different people at any
--     instant.
-- An early end shortens ends_at to the moment it happened; a mandate that
-- had not started yet is cancelled instead.
--
-- The continuity guardian (the brief's "School Responsible") holds a
-- platform role, not a position: the guardian is not a BDE member and has no
-- organization rights. One guardian at a time; appointed only by the trusted
-- provisioning procedure (docs/backend/governance.md).
--
-- A delegation lends some of the delegator's own keys to another member of
-- the same organization for a short, fixed period. It counts only while the
-- delegator still holds those keys through a position (checked on every
-- request), and it cannot be lent on (delegated keys are never a source).

create table public.position_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  user_id uuid not null,
  position_id uuid not null,
  -- Copied from the position by trigger: the exclusion constraints below
  -- need it on this row.
  office text
    constraint position_assignments_office_check
    check (office in ('association_president', 'bde_president', 'bde_vice_president')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- active: stands (effective between starts_at and ends_at) · ended: cut
  -- short (ends_at = the moment) · cancelled: withdrawn before it started.
  status text not null default 'active'
    constraint position_assignments_status_check
    check (status in ('active', 'ended', 'cancelled')),
  source text not null
    constraint position_assignments_source_check
    check (source in ('bootstrap', 'appointment', 'invitation', 'succession', 'emergency', 'recovery')),
  -- Null only for the bootstrap (provisioning has no account).
  appointed_by uuid
    constraint position_assignments_appointed_by_fkey references auth.users (id) on delete restrict,
  ended_by uuid
    constraint position_assignments_ended_by_fkey references auth.users (id) on delete restrict,
  end_reason text
    constraint position_assignments_end_reason_check
    check (char_length(end_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint position_assignments_membership_fkey
    foreign key (membership_id, organization_id, user_id)
    references public.memberships (id, organization_id, user_id) on delete restrict,
  constraint position_assignments_position_fkey
    foreign key (position_id, organization_id)
    references public.positions (id, organization_id) on delete restrict,
  constraint position_assignments_period_check check (ends_at > starts_at),
  constraint position_assignments_max_length_check check (ends_at <= starts_at + interval '25 months'),
  constraint position_assignments_no_double_holding
    exclude using gist (membership_id with =, position_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'active'),
  constraint position_assignments_one_office_holder
    exclude using gist (position_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'active' and office is not null),
  constraint position_assignments_bde_offices_distinct
    exclude using gist (user_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'active' and office in ('bde_president', 'bde_vice_president'))
);

comment on table public.position_assignments is
  'Mandates: a member holds a position between starts_at and ends_at. Effective only inside that window, while active.';

create index position_assignments_user_id_organization_id_idx
  on public.position_assignments (user_id, organization_id);
create index position_assignments_organization_id_idx on public.position_assignments (organization_id);
create index position_assignments_position_id_idx on public.position_assignments (position_id);
create index position_assignments_membership_id_idx on public.position_assignments (membership_id);

create trigger set_updated_at
  before update on public.position_assignments
  for each row execute function private.set_updated_at();

-- The office comes from the position, never from the writer; afterwards only
-- the end of a mandate may change (ends_at earlier, status, who and why).
create or replace function private.guard_position_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select office into new.office from public.positions where id = new.position_id;
    return new;
  end if;
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
     or new.membership_id is distinct from old.membership_id or new.user_id is distinct from old.user_id
     or new.position_id is distinct from old.position_id or new.office is distinct from old.office
     or new.starts_at is distinct from old.starts_at or new.source is distinct from old.source
     or new.appointed_by is distinct from old.appointed_by or new.created_at is distinct from old.created_at then
    raise exception 'assignment_identity_immutable' using errcode = 'P0001';
  end if;
  if new.ends_at > old.ends_at then
    raise exception 'assignment_cannot_be_extended' using errcode = 'P0001';
  end if;
  if old.status <> 'active' and new.status = 'active' then
    raise exception 'assignment_closed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_position_assignment() from public, anon, authenticated, service_role;

create trigger guard_position_assignment
  before insert or update on public.position_assignments
  for each row execute function private.guard_position_assignment();

create table public.platform_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    constraint platform_assignments_user_id_fkey references auth.users (id) on delete restrict,
  role text not null
    constraint platform_assignments_role_check check (role in ('guardian')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active'
    constraint platform_assignments_status_check
    check (status in ('active', 'ended', 'cancelled')),
  source text not null default 'provisioning'
    constraint platform_assignments_source_check
    check (source in ('bootstrap', 'provisioning')),
  reason text not null
    constraint platform_assignments_reason_check
    check (char_length(reason) between 3 and 500),
  ended_by uuid
    constraint platform_assignments_ended_by_fkey references auth.users (id) on delete restrict,
  end_reason text
    constraint platform_assignments_end_reason_check
    check (char_length(end_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_assignments_period_check check (ends_at > starts_at),
  -- A longer institutional appointment than a student mandate, still bounded.
  constraint platform_assignments_max_length_check check (ends_at <= starts_at + interval '5 years'),
  constraint platform_assignments_one_holder
    exclude using gist (role with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'active')
);

comment on table public.platform_assignments is
  'Platform roles outside any organization: the continuity guardian (one at a time, provisioning only).';

create index platform_assignments_user_id_idx on public.platform_assignments (user_id);

create trigger set_updated_at
  before update on public.platform_assignments
  for each row execute function private.set_updated_at();

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint delegations_organization_id_fkey references public.organizations (id) on delete restrict,
  delegator_user_id uuid not null
    constraint delegations_delegator_user_id_fkey references auth.users (id) on delete restrict,
  delegate_membership_id uuid not null,
  delegate_user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active'
    constraint delegations_status_check check (status in ('active', 'revoked')),
  reason text not null
    constraint delegations_reason_check check (char_length(reason) between 3 and 500),
  revoked_at timestamptz,
  revoked_by uuid
    constraint delegations_revoked_by_fkey references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegations_delegate_fkey
    foreign key (delegate_membership_id, organization_id, delegate_user_id)
    references public.memberships (id, organization_id, user_id) on delete restrict,
  constraint delegations_period_check check (ends_at > starts_at),
  constraint delegations_max_length_check check (ends_at <= starts_at + interval '92 days'),
  constraint delegations_not_to_self_check check (delegator_user_id <> delegate_user_id),
  constraint delegations_revoked_check check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.delegations is
  'Temporary loan of some of the delegator''s keys to another member. Counts only while the delegator still holds them.';

create index delegations_delegate_user_id_organization_id_idx on public.delegations (delegate_user_id, organization_id);
create index delegations_organization_id_idx on public.delegations (organization_id);
create index delegations_delegator_user_id_idx on public.delegations (delegator_user_id);
create index delegations_delegate_membership_id_idx on public.delegations (delegate_membership_id);

create trigger set_updated_at
  before update on public.delegations
  for each row execute function private.set_updated_at();

create table public.delegation_permissions (
  delegation_id uuid not null
    constraint delegation_permissions_delegation_id_fkey references public.delegations (id) on delete cascade,
  permission_key text not null
    constraint delegation_permissions_permission_key_fkey references public.permissions (key) on delete restrict,
  constraint delegation_permissions_pkey primary key (delegation_id, permission_key)
);

create or replace function private.guard_delegation_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.permissions
     where key = new.permission_key and scope = 'organization' and is_delegable
  ) then
    raise exception 'permission_not_delegable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_delegation_permission() from public, anon, authenticated, service_role;

create trigger guard_delegation_permission
  before insert or update on public.delegation_permissions
  for each row execute function private.guard_delegation_permission();

alter table public.position_assignments enable row level security;
alter table public.platform_assignments enable row level security;
alter table public.delegations enable row level security;
alter table public.delegation_permissions enable row level security;

revoke all on public.position_assignments, public.platform_assignments, public.delegations, public.delegation_permissions
  from anon, authenticated;
