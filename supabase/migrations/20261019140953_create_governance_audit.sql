-- Phase 4 · Governance audit log.
--
-- One row per privileged governance decision, written inside the same
-- transaction as the decision by the governance functions (never by the
-- app, never by a client). Append-only: no API role may insert, update or
-- delete, and a trigger refuses updates, deletes and truncation for every
-- role short of disabling it.
--
-- Honest limits: this is an ordinary table, not a cryptographic ledger.
-- Someone with the database owner's credentials (Supabase project owners)
-- could still alter it; those credentials are governed outside the app
-- (docs/backend/governance.md).
--
-- Privacy: ids, titles and keys only. Never a password, token, MFA secret,
-- CV or application content; e-mail addresses stay in the invitation rows,
-- referenced here by id.

create table public.governance_audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Null only for the provisioning procedure (run by the project owner).
  actor_user_id uuid
    constraint governance_audit_events_actor_user_id_fkey references auth.users (id) on delete restrict,
  -- The authority the actor used: their position, a delegation, BDE
  -- leadership, the guardian role, provisioning, or themselves (accepting,
  -- declining, leaving).
  authority text not null
    constraint governance_audit_events_authority_check
    check (authority in ('position', 'delegation', 'bde', 'guardian', 'provisioning', 'self')),
  action text not null
    constraint governance_audit_events_action_check check (action ~ '^[a-z_]{3,60}$'),
  category text not null
    constraint governance_audit_events_category_check
    check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap')),
  organization_id uuid
    constraint governance_audit_events_organization_id_fkey references public.organizations (id) on delete restrict,
  -- The person the decision is about, when there is one.
  subject_user_id uuid
    constraint governance_audit_events_subject_user_id_fkey references auth.users (id) on delete restrict,
  resource_type text
    constraint governance_audit_events_resource_type_check
    check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition', 'platform_assignment')),
  resource_id uuid,
  details jsonb not null default '{}'::jsonb
    constraint governance_audit_events_details_check
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4000),
  reason text
    constraint governance_audit_events_reason_check check (char_length(reason) between 1 and 500)
);

comment on table public.governance_audit_events is
  'Append-only record of governance decisions, written by the governance functions in the same transaction.';

create index governance_audit_events_organization_id_occurred_at_idx
  on public.governance_audit_events (organization_id, occurred_at desc);
create index governance_audit_events_category_occurred_at_idx
  on public.governance_audit_events (category, occurred_at desc);
create index governance_audit_events_actor_user_id_idx on public.governance_audit_events (actor_user_id);
create index governance_audit_events_subject_user_id_idx on public.governance_audit_events (subject_user_id);

create or replace function private.forbid_audit_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_records_are_append_only' using errcode = 'P0001';
end;
$$;

revoke all on function private.forbid_audit_rewrite() from public, anon, authenticated, service_role;

create trigger forbid_audit_update_delete
  before update or delete on public.governance_audit_events
  for each row execute function private.forbid_audit_rewrite();

create trigger forbid_audit_truncate
  before truncate on public.governance_audit_events
  for each statement execute function private.forbid_audit_rewrite();

-- The only writer. Called from inside the governance functions; no API role
-- may execute it.
create or replace function private.log_governance_event(
  p_actor uuid,
  p_authority text,
  p_action text,
  p_category text,
  p_organization_id uuid default null,
  p_subject_user_id uuid default null,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_details jsonb default '{}'::jsonb,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.governance_audit_events
    (actor_user_id, authority, action, category, organization_id, subject_user_id, resource_type, resource_id, details, reason)
  values
    (p_actor, p_authority, p_action, p_category, p_organization_id, p_subject_user_id, p_resource_type, p_resource_id,
     coalesce(p_details, '{}'::jsonb), nullif(btrim(p_reason), ''));
$$;

revoke all on function private.log_governance_event(uuid, text, text, text, uuid, uuid, text, uuid, jsonb, text)
  from public, anon, authenticated, service_role;

alter table public.governance_audit_events enable row level security;
revoke all on public.governance_audit_events from anon, authenticated;
