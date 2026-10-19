-- Phase 4 · Organization lifecycle, positions, mandates, memberships,
-- invitations and delegations: the functions the app calls.
--
-- Every function here:
--   * takes the actor from auth.uid() (the verified session), never from an
--     argument;
--   * re-checks the actor's authority in the database at call time
--     (private.user_has_organization_permission / user_has_platform_permission);
--   * requires a second-factor session (aal2) for anything that grants power;
--   * enforces the permission ceiling: nobody grants, edits, assigns or lends
--     a key they do not hold themselves through a position;
--   * never touches a protected office (association president, BDE
--     president, BDE vice-president): those change hands only through the
--     leadership transition functions (next migration);
--   * writes its audit record in the same transaction;
--   * raises a short error code (insufficient_permission, mfa_required…) that
--     the app translates; never a raw constraint error for expected cases.
-- They are security definer because no API role can write these tables.
-- Concurrency: rows being changed are locked (for update); uniqueness and
-- non-overlap are database constraints, so two simultaneous requests cannot
-- both pass.

-- ---- Shared guards ------------------------------------------------------------

create or replace function private.require_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not private.mfa_requirement_met() then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return v_actor;
end;
$$;

create or replace function private.require_aal2()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.session_is_aal2() then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.require_organization_permission(p_actor uuid, p_organization_id uuid, p_permission text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.user_has_organization_permission(p_actor, p_organization_id, p_permission, now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.require_platform_permission(p_actor uuid, p_permission text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.user_has_platform_permission(p_actor, p_permission, now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
end;
$$;

-- A written reason, 3 to 500 characters.
create or replace function private.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v) < 3 or char_length(v) > 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- 'position' when the actor holds the key through a mandate, else
-- 'delegation' (for the audit record).
create or replace function private.authority_for(p_actor uuid, p_organization_id uuid, p_permission text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when private.position_grants(p_actor, p_organization_id, p_permission, now()) then 'position' else 'delegation' end;
$$;

-- The permission ceiling: every key in the list is held by the actor
-- through a position (a delegation never lets you grant).
create or replace function private.require_ceiling(p_actor uuid, p_organization_id uuid, p_keys text[])
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text;
begin
  foreach v_key in array coalesce(p_keys, '{}'::text[]) loop
    if not private.position_grants(p_actor, p_organization_id, v_key, now()) then
      raise exception 'permission_ceiling' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- Distinct keys, each an existing grantable organization key.
create or replace function private.grantable_keys(p_keys text[])
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_keys text[] := array(select distinct k from unnest(coalesce(p_keys, '{}'::text[])) as k where k is not null order by 1);
begin
  if exists (
    select 1
      from unnest(v_keys) as k
     where not exists (
       select 1 from public.permissions p where p.key = k and p.scope = 'organization' and p.is_grantable
     )
  ) then
    raise exception 'permission_not_grantable' using errcode = 'P0001';
  end if;
  return v_keys;
end;
$$;

create or replace function private.position_keys(p_position_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(permission_key order by permission_key), '{}'::text[])
    from public.position_permissions
   where position_id = p_position_id;
$$;

-- An existing account for this address (accounts were eligible when made).
create or replace function private.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

revoke all on function private.require_actor() from public, anon, authenticated, service_role;
revoke all on function private.require_aal2() from public, anon, authenticated, service_role;
revoke all on function private.require_organization_permission(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.require_platform_permission(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.require_reason(text) from public, anon, authenticated, service_role;
revoke all on function private.authority_for(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.require_ceiling(uuid, uuid, text[]) from public, anon, authenticated, service_role;
revoke all on function private.grantable_keys(text[]) from public, anon, authenticated, service_role;
revoke all on function private.position_keys(uuid) from public, anon, authenticated, service_role;
revoke all on function private.user_id_by_email(text) from public, anon, authenticated, service_role;

-- ---- Organizations --------------------------------------------------------------

-- BDE leadership creates an association, in "setup" (not public), with its
-- protected presidency office (empty until someone accepts it).
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_category text default 'autre',
  p_accent text default 'rose',
  p_short_name text default null,
  p_tagline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_organization_id uuid;
  v_position_id uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  if p_category = 'bde' then
    raise exception 'organization_invalid' using errcode = 'P0001';
  end if;

  begin
    insert into public.organizations (slug, name, short_name, kind, category, accent, tagline, status, created_by)
    values (lower(btrim(p_slug)), btrim(p_name), nullif(btrim(p_short_name), ''), 'association',
            coalesce(p_category, 'autre'), coalesce(p_accent, 'rose'), nullif(btrim(p_tagline), ''), 'setup', v_actor)
    returning id into v_organization_id;
  exception
    when unique_violation then
      raise exception 'slug_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'organization_invalid' using errcode = 'P0001';
  end;

  insert into public.positions (organization_id, title, office, template_key, sort_order, created_by)
  select v_organization_id, t.label, t.office, t.key, t.sort_order, v_actor
    from public.position_templates t
   where t.key = 'association_president'
  returning id into v_position_id;

  insert into public.position_permissions (position_id, permission_key)
  select v_position_id, tp.permission_key
    from public.position_template_permissions tp
   where tp.template_key = 'association_president';

  perform private.log_governance_event(
    v_actor, 'bde', 'organization_created', 'organization', v_organization_id, null, 'organization', v_organization_id,
    jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug)))
  );
  return v_organization_id;
end;
$$;

-- Publish, suspend, archive or restore an association. The BDE itself never
-- changes status. Archiving keeps everything (history, mandates, audit);
-- authorization simply stops counting its mandates.
create or replace function public.set_organization_status(p_organization_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_reason text;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();

  select * into v_org from public.organizations where id = p_organization_id for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  if v_org.kind = 'bde' then
    raise exception 'bde_protected' using errcode = 'P0001';
  end if;
  if not (
       (v_org.status = 'setup' and p_status in ('active', 'archived'))
    or (v_org.status = 'active' and p_status in ('suspended', 'archived'))
    or (v_org.status = 'suspended' and p_status in ('active', 'archived'))
    or (v_org.status = 'archived' and p_status = 'active')
  ) then
    raise exception 'invalid_status_change' using errcode = 'P0001';
  end if;
  v_reason := case when p_status = 'active' and p_reason is null then null else private.require_reason(p_reason) end;

  update public.organizations
     set status = p_status,
         status_reason = v_reason,
         archived_at = case when p_status = 'archived' then now() else null end
   where id = p_organization_id;

  if p_status in ('suspended', 'archived') then
    update public.organization_invitations
       set status = 'revoked', updated_at = now()
     where organization_id = p_organization_id and status = 'pending';
  end if;
  if p_status = 'archived' then
    update public.leadership_transitions
       set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = 'organization_archived'
     where organization_id = p_organization_id and status = 'open';
  end if;

  perform private.log_governance_event(
    v_actor, 'bde', 'organization_status_changed', 'organization', p_organization_id, null, 'organization', p_organization_id,
    jsonb_build_object('from', v_org.status, 'to', p_status), v_reason
  );
end;
$$;

-- ---- Positions ------------------------------------------------------------------

create or replace function public.create_position(
  p_organization_id uuid,
  p_title text,
  p_permissions text[],
  p_template_key text default 'custom',
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_keys text[];
  v_position_id uuid;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'positions.manage');
  perform private.require_aal2();
  if not exists (select 1 from public.position_templates where key = p_template_key and office is null) then
    raise exception 'template_not_selectable' using errcode = 'P0001';
  end if;
  v_keys := private.grantable_keys(p_permissions);
  perform private.require_ceiling(v_actor, p_organization_id, v_keys);

  begin
    insert into public.positions (organization_id, title, description, template_key, created_by)
    values (p_organization_id, btrim(p_title), nullif(btrim(p_description), ''), p_template_key, v_actor)
    returning id into v_position_id;
  exception
    when unique_violation then
      raise exception 'position_title_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'position_invalid' using errcode = 'P0001';
  end;

  insert into public.position_permissions (position_id, permission_key)
  select v_position_id, k from unnest(v_keys) as k;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'positions.manage'), 'position_created', 'roles',
    p_organization_id, null, 'position', v_position_id,
    jsonb_build_object('title', btrim(p_title), 'permissions', to_jsonb(v_keys))
  );
  return v_position_id;
end;
$$;

-- Rename a position, or change its keys (applies at once to everyone
-- holding it). Offices: title and description only, never their keys.
create or replace function public.update_position(
  p_position_id uuid,
  p_title text,
  p_permissions text[] default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_position public.positions%rowtype;
  v_old text[];
  v_new text[];
  v_added text[];
  v_removed text[];
begin
  select * into v_position from public.positions where id = p_position_id for update;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_position.organization_id, 'positions.manage');
  perform private.require_aal2();
  if v_position.archived_at is not null then
    raise exception 'position_archived' using errcode = 'P0001';
  end if;

  v_old := private.position_keys(p_position_id);
  if p_permissions is null then
    v_new := v_old;
  elsif v_position.office is not null then
    raise exception 'position_protected' using errcode = 'P0001';
  else
    v_new := private.grantable_keys(p_permissions);
  end if;
  v_added := array(select k from unnest(v_new) as k except select k from unnest(v_old) as k order by 1);
  v_removed := array(select k from unnest(v_old) as k except select k from unnest(v_new) as k order by 1);
  -- Adding or removing a key you do not hold yourself is out of reach.
  perform private.require_ceiling(v_actor, v_position.organization_id, v_added || v_removed);

  begin
    update public.positions
       set title = btrim(p_title), description = nullif(btrim(p_description), '')
     where id = p_position_id;
  exception
    when unique_violation then
      raise exception 'position_title_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'position_invalid' using errcode = 'P0001';
  end;

  delete from public.position_permissions where position_id = p_position_id and permission_key = any (v_removed);
  insert into public.position_permissions (position_id, permission_key)
  select p_position_id, k from unnest(v_added) as k;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_position.organization_id, 'positions.manage'), 'position_updated', 'roles',
    v_position.organization_id, null, 'position', p_position_id,
    jsonb_build_object('title', btrim(p_title), 'previous_title', v_position.title,
                       'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed))
  );
end;
$$;

-- Retire a position: its current holders lose it now, scheduled ones are
-- cancelled. Offices cannot be archived.
create or replace function public.archive_position(p_position_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_position public.positions%rowtype;
  v_reason text := private.require_reason(p_reason);
begin
  select * into v_position from public.positions where id = p_position_id for update;
  if not found then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_position.organization_id, 'positions.manage');
  perform private.require_aal2();
  if v_position.office is not null then
    raise exception 'position_protected' using errcode = 'P0001';
  end if;
  if v_position.archived_at is not null then
    raise exception 'position_archived' using errcode = 'P0001';
  end if;
  perform private.require_ceiling(v_actor, v_position.organization_id, private.position_keys(p_position_id));

  update public.position_assignments
     set status = 'cancelled', ended_by = v_actor, end_reason = v_reason
   where position_id = p_position_id and status = 'active' and starts_at >= now();
  update public.position_assignments
     set status = 'ended', ends_at = now(), ended_by = v_actor, end_reason = v_reason
   where position_id = p_position_id and status = 'active' and starts_at < now() and ends_at > now();
  update public.positions set archived_at = now() where id = p_position_id;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_position.organization_id, 'positions.manage'), 'position_archived', 'roles',
    v_position.organization_id, null, 'position', p_position_id, jsonb_build_object('title', v_position.title), v_reason
  );
end;
$$;

-- ---- Mandates -------------------------------------------------------------------

-- Give an ordinary position to a member, from now (or a later date) to a
-- fixed end. Never to yourself, never an office.
create or replace function public.assign_position(
  p_membership_id uuid,
  p_position_id uuid,
  p_ends_at timestamptz,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_membership public.memberships%rowtype;
  v_position public.positions%rowtype;
  v_keys text[];
  v_starts timestamptz := coalesce(p_starts_at, now());
  v_assignment_id uuid;
begin
  select * into v_membership from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_membership.organization_id, 'positions.assign');
  if v_membership.status <> 'active' then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  if v_membership.user_id = v_actor then
    raise exception 'self_assignment' using errcode = 'P0001';
  end if;

  select * into v_position from public.positions where id = p_position_id;
  if not found or v_position.organization_id <> v_membership.organization_id then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  if v_position.office is not null then
    raise exception 'position_protected' using errcode = 'P0001';
  end if;
  if v_position.archived_at is not null then
    raise exception 'position_archived' using errcode = 'P0001';
  end if;

  v_keys := private.position_keys(p_position_id);
  if cardinality(v_keys) > 0 then
    perform private.require_aal2();
  end if;
  perform private.require_ceiling(v_actor, v_membership.organization_id, v_keys);

  if v_starts < now() - interval '5 minutes' or p_ends_at is null or p_ends_at <= greatest(v_starts, now()) then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  begin
    insert into public.position_assignments
      (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source, appointed_by)
    values
      (v_membership.organization_id, v_membership.id, v_membership.user_id, p_position_id, v_starts, p_ends_at, 'appointment', v_actor)
    returning id into v_assignment_id;
  exception
    when exclusion_violation then
      raise exception 'assignment_overlap' using errcode = 'P0001';
    when check_violation then
      raise exception 'invalid_period' using errcode = 'P0001';
  end;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_membership.organization_id, 'positions.assign'), 'position_assigned', 'team',
    v_membership.organization_id, v_membership.user_id, 'assignment', v_assignment_id,
    jsonb_build_object('position_id', p_position_id, 'title', v_position.title, 'starts_at', v_starts, 'ends_at', p_ends_at)
  );
  return v_assignment_id;
end;
$$;

-- End an ordinary mandate now (or cancel a scheduled one). The holder may
-- step down; others need positions.assign and the position's keys.
create or replace function public.end_assignment(p_assignment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_assignment public.position_assignments%rowtype;
  v_authority text;
  v_title text;
begin
  select * into v_assignment from public.position_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0001';
  end if;
  if v_assignment.status <> 'active' or v_assignment.ends_at <= now() then
    raise exception 'assignment_not_active' using errcode = 'P0001';
  end if;
  if v_assignment.office is not null then
    raise exception 'position_protected' using errcode = 'P0001';
  end if;

  if v_assignment.user_id = v_actor then
    v_authority := 'self';
  else
    perform private.require_organization_permission(v_actor, v_assignment.organization_id, 'positions.assign');
    perform private.require_ceiling(v_actor, v_assignment.organization_id, private.position_keys(v_assignment.position_id));
    v_authority := private.authority_for(v_actor, v_assignment.organization_id, 'positions.assign');
  end if;

  if v_assignment.starts_at >= now() then
    update public.position_assignments
       set status = 'cancelled', ended_by = v_actor, end_reason = nullif(btrim(p_reason), '')
     where id = p_assignment_id;
  else
    update public.position_assignments
       set status = 'ended', ends_at = now(), ended_by = v_actor, end_reason = nullif(btrim(p_reason), '')
     where id = p_assignment_id;
  end if;

  select title into v_title from public.positions where id = v_assignment.position_id;
  perform private.log_governance_event(
    v_actor, v_authority, 'position_revoked', 'team', v_assignment.organization_id, v_assignment.user_id,
    'assignment', p_assignment_id, jsonb_build_object('position_id', v_assignment.position_id, 'title', v_title),
    nullif(btrim(p_reason), '')
  );
end;
$$;

-- ---- Memberships ----------------------------------------------------------------

-- Suspend, reactivate or end a membership; or leave an organization
-- yourself. Never someone holding (or about to hold) an office: that is a
-- succession or an emergency, not a team edit.
create or replace function public.set_membership_status(p_membership_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_membership public.memberships%rowtype;
  v_authority text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_status not in ('active', 'suspended', 'ended') then
    raise exception 'invalid_status_change' using errcode = 'P0001';
  end if;
  select * into v_membership from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership_not_found' using errcode = 'P0001';
  end if;
  if v_membership.status = 'ended' then
    raise exception 'membership_ended' using errcode = 'P0001';
  end if;
  if v_membership.status = p_status then
    return;
  end if;

  if v_membership.user_id = v_actor then
    if p_status <> 'ended' then
      raise exception 'insufficient_permission' using errcode = 'P0001';
    end if;
    v_authority := 'self';
  else
    perform private.require_organization_permission(v_actor, v_membership.organization_id, 'members.manage');
    v_authority := private.authority_for(v_actor, v_membership.organization_id, 'members.manage');
    if p_status = 'suspended' then
      v_reason := private.require_reason(p_reason);
    end if;
  end if;

  if exists (
    select 1 from public.position_assignments
     where membership_id = p_membership_id and office is not null and status = 'active' and ends_at > now()
  ) then
    raise exception 'office_holder' using errcode = 'P0001';
  end if;

  if p_status = 'ended' then
    update public.position_assignments
       set status = 'cancelled', ended_by = v_actor, end_reason = coalesce(v_reason, 'membership_ended')
     where membership_id = p_membership_id and status = 'active' and starts_at >= now();
    update public.position_assignments
       set status = 'ended', ends_at = now(), ended_by = v_actor, end_reason = coalesce(v_reason, 'membership_ended')
     where membership_id = p_membership_id and status = 'active' and starts_at < now() and ends_at > now();
    update public.delegations
       set status = 'revoked', revoked_at = now(), revoked_by = v_actor
     where status = 'active' and ends_at > now()
       and organization_id = v_membership.organization_id
       and (delegate_membership_id = p_membership_id or delegator_user_id = v_membership.user_id);
  end if;

  update public.memberships
     set status = p_status,
         status_reason = v_reason,
         ended_at = case when p_status = 'ended' then now() else null end
   where id = p_membership_id;

  perform private.log_governance_event(
    v_actor, v_authority, 'membership_status_changed', 'team', v_membership.organization_id, v_membership.user_id,
    'membership', p_membership_id, jsonb_build_object('from', v_membership.status, 'to', p_status), v_reason
  );
end;
$$;

-- ---- Invitations ----------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint organization_invitations_organization_id_fkey references public.organizations (id) on delete restrict,
  -- The school address the invitation is bound to: only the account signed
  -- in with it can see or answer it (no bearer token to leak).
  email text not null
    constraint organization_invitations_email_check
    check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  -- Optional ordinary position offered with the membership, and its end.
  position_id uuid,
  mandate_ends_at timestamptz,
  invited_by uuid not null
    constraint organization_invitations_invited_by_fkey references auth.users (id) on delete restrict,
  -- pending · accepted · declined · revoked. "Expired" is pending past
  -- expires_at: computed, never needed as a stored state.
  status text not null default 'pending'
    constraint organization_invitations_status_check
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  responded_by uuid
    constraint organization_invitations_responded_by_fkey references auth.users (id) on delete restrict,
  membership_id uuid
    constraint organization_invitations_membership_id_fkey references public.memberships (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_position_fkey
    foreign key (position_id, organization_id) references public.positions (id, organization_id) on delete restrict,
  constraint organization_invitations_mandate_check check ((position_id is null) = (mandate_ends_at is null)),
  constraint organization_invitations_responded_check
    check ((status in ('accepted', 'declined')) = (responded_at is not null))
);

comment on table public.organization_invitations is
  'Invitations to join an organization, bound to a school address. Answered only by the account signed in with it.';

create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';
create index organization_invitations_email_idx on public.organization_invitations (email) where status = 'pending';
create index organization_invitations_organization_id_idx on public.organization_invitations (organization_id);
create index organization_invitations_position_id_idx on public.organization_invitations (position_id);
create index organization_invitations_invited_by_idx on public.organization_invitations (invited_by);

create trigger set_updated_at
  before update on public.organization_invitations
  for each row execute function private.set_updated_at();

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from anon, authenticated;

create policy organization_invitations_read_invitee
  on public.organization_invitations for select to authenticated
  using (email = (select private.current_user_email()));

create policy organization_invitations_read_team
  on public.organization_invitations for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('members.invite')));

create policy organization_invitations_require_mfa_when_enrolled
  on public.organization_invitations as restrictive for select to authenticated
  using ((select private.mfa_requirement_met()));

grant select on public.organization_invitations to authenticated;

create or replace function public.invite_member(
  p_organization_id uuid,
  p_email text,
  p_position_id uuid default null,
  p_mandate_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_position public.positions%rowtype;
  v_keys text[] := '{}';
  v_invitation_id uuid;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'members.invite');
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'email_invalid' using errcode = 'P0001';
  end if;
  -- An existing account (eligible when it was made) or an address that may
  -- sign up: an invitation never opens the platform to anyone else.
  if private.user_id_by_email(v_email) is null and not private.is_email_eligible(v_email) then
    raise exception 'user_not_eligible' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_organization_id and m.status <> 'ended' and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  if p_position_id is not null then
    perform private.require_organization_permission(v_actor, p_organization_id, 'positions.assign');
    select * into v_position from public.positions where id = p_position_id;
    if not found or v_position.organization_id <> p_organization_id then
      raise exception 'position_not_found' using errcode = 'P0001';
    end if;
    if v_position.office is not null then
      raise exception 'position_protected' using errcode = 'P0001';
    end if;
    if v_position.archived_at is not null then
      raise exception 'position_archived' using errcode = 'P0001';
    end if;
    v_keys := private.position_keys(p_position_id);
    perform private.require_ceiling(v_actor, p_organization_id, v_keys);
    if p_mandate_ends_at is null or p_mandate_ends_at <= now() or p_mandate_ends_at > now() + interval '25 months' then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
  elsif p_mandate_ends_at is not null then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if cardinality(v_keys) > 0 then
    perform private.require_aal2();
  end if;

  begin
    insert into public.organization_invitations (organization_id, email, position_id, mandate_ends_at, invited_by, expires_at)
    values (p_organization_id, v_email, p_position_id, p_mandate_ends_at, v_actor, now() + interval '14 days')
    returning id into v_invitation_id;
  exception
    when unique_violation then
      -- A pending one exists. If it has lapsed, retire it and send again.
      update public.organization_invitations
         set status = 'revoked'
       where organization_id = p_organization_id and email = v_email and status = 'pending' and expires_at <= now();
      if not found then
        raise exception 'invitation_exists' using errcode = 'P0001';
      end if;
      insert into public.organization_invitations (organization_id, email, position_id, mandate_ends_at, invited_by, expires_at)
      values (p_organization_id, v_email, p_position_id, p_mandate_ends_at, v_actor, now() + interval '14 days')
      returning id into v_invitation_id;
  end;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'members.invite'), 'member_invited', 'team',
    p_organization_id, private.user_id_by_email(v_email), 'invitation', v_invitation_id,
    jsonb_build_object('position_id', p_position_id, 'title', v_position.title, 'mandate_ends_at', p_mandate_ends_at)
  );
  return v_invitation_id;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_invitation.organization_id, 'members.invite');
  if v_invitation.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  update public.organization_invitations set status = 'revoked' where id = p_invitation_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_invitation.organization_id, 'members.invite'), 'invitation_revoked', 'team',
    v_invitation.organization_id, private.user_id_by_email(v_invitation.email), 'invitation', p_invitation_id
  );
end;
$$;

-- The invitee answers. Only the account signed in with the invited address,
-- once, before expiry, and only if the inviter still has the authority it
-- used: a removed officer's pending invitations grant nothing.
create or replace function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_invitation public.organization_invitations%rowtype;
  v_membership public.memberships%rowtype;
  v_position public.positions%rowtype;
  v_assignment_id uuid;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  -- Someone else's invitation is reported as not found: nothing to learn.
  if not found or v_invitation.email <> private.current_user_email() then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.organization_invitations
       set status = 'declined', responded_at = now(), responded_by = v_actor
     where id = p_invitation_id;
    perform private.log_governance_event(
      v_actor, 'self', 'invitation_declined', 'team', v_invitation.organization_id, v_actor, 'invitation', p_invitation_id
    );
    return null;
  end if;

  if (select status from public.organizations where id = v_invitation.organization_id) not in ('active', 'setup') then
    raise exception 'organization_inactive' using errcode = 'P0001';
  end if;
  if not private.user_has_organization_permission(v_invitation.invited_by, v_invitation.organization_id, 'members.invite', now()) then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;
  if v_invitation.position_id is not null then
    select * into v_position from public.positions where id = v_invitation.position_id;
    if v_position.archived_at is not null or v_position.office is not null
       or not private.user_has_organization_permission(v_invitation.invited_by, v_invitation.organization_id, 'positions.assign', now()) then
      raise exception 'invitation_invalid' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from unnest(private.position_keys(v_invitation.position_id)) as k
       where not private.position_grants(v_invitation.invited_by, v_invitation.organization_id, k, now())
    ) then
      raise exception 'invitation_invalid' using errcode = 'P0001';
    end if;
    if v_invitation.mandate_ends_at <= now() then
      raise exception 'invitation_expired' using errcode = 'P0001';
    end if;
  end if;

  select * into v_membership
    from public.memberships
   where organization_id = v_invitation.organization_id and user_id = v_actor and status <> 'ended'
   for update;
  if found and v_membership.status = 'suspended' then
    raise exception 'member_suspended' using errcode = 'P0001';
  end if;
  if not found then
    insert into public.memberships (organization_id, user_id, status)
    values (v_invitation.organization_id, v_actor, 'active')
    returning * into v_membership;
  end if;

  if v_invitation.position_id is not null then
    begin
      insert into public.position_assignments
        (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source, appointed_by)
      values
        (v_invitation.organization_id, v_membership.id, v_actor, v_invitation.position_id, now(),
         v_invitation.mandate_ends_at, 'invitation', v_invitation.invited_by)
      returning id into v_assignment_id;
    exception
      when exclusion_violation then
        raise exception 'assignment_overlap' using errcode = 'P0001';
    end;
  end if;

  update public.organization_invitations
     set status = 'accepted', responded_at = now(), responded_by = v_actor, membership_id = v_membership.id
   where id = p_invitation_id;

  perform private.log_governance_event(
    v_actor, 'self', 'invitation_accepted', 'team', v_invitation.organization_id, v_actor, 'invitation', p_invitation_id,
    jsonb_build_object('membership_id', v_membership.id, 'assignment_id', v_assignment_id, 'title', v_position.title)
  );
  return v_membership.id;
end;
$$;

-- ---- Delegations ----------------------------------------------------------------

-- Lend some of your own keys (held through a position, delegable) to another
-- active member, for at most 92 days, with a reason.
create or replace function public.create_delegation(
  p_organization_id uuid,
  p_delegate_membership_id uuid,
  p_permissions text[],
  p_ends_at timestamptz,
  p_reason text,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_delegate public.memberships%rowtype;
  v_keys text[] := array(select distinct k from unnest(coalesce(p_permissions, '{}'::text[])) as k where k is not null order by 1);
  v_starts timestamptz := coalesce(p_starts_at, now());
  v_delegation_id uuid;
begin
  if not private.position_grants(v_actor, p_organization_id, 'delegations.manage', now())
     or not private.user_has_organization_permission(v_actor, p_organization_id, 'delegations.manage', now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.require_aal2();

  select * into v_delegate from public.memberships where id = p_delegate_membership_id for update;
  if not found or v_delegate.organization_id <> p_organization_id then
    raise exception 'membership_not_found' using errcode = 'P0001';
  end if;
  if v_delegate.status <> 'active' then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  if v_delegate.user_id = v_actor then
    raise exception 'self_delegation' using errcode = 'P0001';
  end if;

  if cardinality(v_keys) = 0 then
    raise exception 'permission_not_delegable' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_keys) as k
     where not exists (select 1 from public.permissions p where p.key = k and p.scope = 'organization' and p.is_delegable)
  ) then
    raise exception 'permission_not_delegable' using errcode = 'P0001';
  end if;
  perform private.require_ceiling(v_actor, p_organization_id, v_keys);

  if v_starts < now() - interval '5 minutes' or p_ends_at is null or p_ends_at <= greatest(v_starts, now()) then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  begin
    insert into public.delegations
      (organization_id, delegator_user_id, delegate_membership_id, delegate_user_id, starts_at, ends_at, reason)
    values
      (p_organization_id, v_actor, v_delegate.id, v_delegate.user_id, v_starts, p_ends_at, v_reason)
    returning id into v_delegation_id;
  exception
    when check_violation then
      raise exception 'invalid_period' using errcode = 'P0001';
  end;
  insert into public.delegation_permissions (delegation_id, permission_key)
  select v_delegation_id, k from unnest(v_keys) as k;

  perform private.log_governance_event(
    v_actor, 'position', 'delegation_created', 'delegation', p_organization_id, v_delegate.user_id,
    'delegation', v_delegation_id,
    jsonb_build_object('permissions', to_jsonb(v_keys), 'starts_at', v_starts, 'ends_at', p_ends_at), v_reason
  );
  return v_delegation_id;
end;
$$;

-- The delegator, the delegate (declining it) or a delegations.manage holder.
create or replace function public.revoke_delegation(p_delegation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_delegation public.delegations%rowtype;
  v_authority text;
begin
  select * into v_delegation from public.delegations where id = p_delegation_id for update;
  if not found then
    raise exception 'delegation_not_found' using errcode = 'P0001';
  end if;
  if v_delegation.status <> 'active' or v_delegation.ends_at <= now() then
    raise exception 'delegation_not_active' using errcode = 'P0001';
  end if;
  if v_actor in (v_delegation.delegator_user_id, v_delegation.delegate_user_id) then
    v_authority := 'self';
  elsif private.position_grants(v_actor, v_delegation.organization_id, 'delegations.manage', now())
        and private.user_has_organization_permission(v_actor, v_delegation.organization_id, 'delegations.manage', now()) then
    v_authority := 'position';
  else
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;

  update public.delegations
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor
   where id = p_delegation_id;

  perform private.log_governance_event(
    v_actor, v_authority, 'delegation_revoked', 'delegation', v_delegation.organization_id, v_delegation.delegate_user_id,
    'delegation', p_delegation_id, '{}'::jsonb, nullif(btrim(p_reason), '')
  );
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text) from public, anon;
revoke all on function public.set_organization_status(uuid, text, text) from public, anon;
revoke all on function public.create_position(uuid, text, text[], text, text) from public, anon;
revoke all on function public.update_position(uuid, text, text[], text) from public, anon;
revoke all on function public.archive_position(uuid, text) from public, anon;
revoke all on function public.assign_position(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.end_assignment(uuid, text) from public, anon;
revoke all on function public.set_membership_status(uuid, text, text) from public, anon;
revoke all on function public.invite_member(uuid, text, uuid, timestamptz) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.respond_to_invitation(uuid, boolean) from public, anon;
revoke all on function public.create_delegation(uuid, uuid, text[], timestamptz, text, timestamptz) from public, anon;
revoke all on function public.revoke_delegation(uuid, text) from public, anon;

grant execute on function public.create_organization(text, text, text, text, text, text) to authenticated;
grant execute on function public.set_organization_status(uuid, text, text) to authenticated;
grant execute on function public.create_position(uuid, text, text[], text, text) to authenticated;
grant execute on function public.update_position(uuid, text, text[], text) to authenticated;
grant execute on function public.archive_position(uuid, text) to authenticated;
grant execute on function public.assign_position(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.end_assignment(uuid, text) to authenticated;
grant execute on function public.set_membership_status(uuid, text, text) to authenticated;
grant execute on function public.invite_member(uuid, text, uuid, timestamptz) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;
grant execute on function public.create_delegation(uuid, uuid, text[], timestamptz, text, timestamptz) to authenticated;
grant execute on function public.revoke_delegation(uuid, text) to authenticated;
