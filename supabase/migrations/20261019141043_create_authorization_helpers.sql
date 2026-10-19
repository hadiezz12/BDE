-- Phase 4 · Authorization helpers and read policies.
--
-- The one question the platform asks: may THIS signed-in person do ACTION in
-- ORGANIZATION right now? Answered here, in the database, from:
--   identity (auth.uid(), from the verified JWT; never an id sent by the
--   client) → open, active membership → position assignment inside its
--   mandate window (or an active delegation whose delegator still holds the
--   key) → the key on that position → the organization's status.
-- Default: no. Every check compares timestamps with now(): an expired
-- mandate, a revoked position, a suspended membership or an archived
-- organization stops counting on the very next request, whatever the
-- user's JWT or React state says.
--
-- Helpers are security definer (they read tables the caller may not see)
-- with an empty search_path and schema-qualified names; they only return
-- booleans or ids. They live in `private` (not exposed by the Data API) and
-- `authenticated` may execute only those the policies need (foundation test
-- allowlist). No RLS recursion: the helpers run as the tables' owner, which
-- bypasses RLS, so a policy calling them never re-enters a policy.
--
-- Policies here are SELECT only. No API role has INSERT, UPDATE or DELETE on
-- any governance table: every write goes through the governance functions
-- (next migrations), which check authority, assurance and write the audit
-- record in one transaction.

-- A session that passed the second factor.
create or replace function private.session_is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

-- What a suspended or archived organization still allows: reading, never
-- operating.
create or replace function private.organization_status_allows(p_status text, p_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status in ('active', 'setup') then true
    when p_status in ('suspended', 'archived') then p_permission in ('members.view', 'governance.view', 'audit.view')
    else false
  end;
$$;

-- Keys held through the user's OWN mandates (never through delegations).
create or replace function private.position_grants(p_user uuid, p_organization_id uuid, p_permission text, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.position_assignments a
      join public.memberships m on m.id = a.membership_id
      join public.positions p on p.id = a.position_id
      join public.position_permissions pp on pp.position_id = a.position_id
     where a.user_id = p_user
       and a.organization_id = p_organization_id
       and pp.permission_key = p_permission
       and a.status = 'active'
       and a.starts_at <= p_at
       and p_at < a.ends_at
       and m.status = 'active'
       and p.archived_at is null
  );
$$;

create or replace function private.user_has_organization_permission(
  p_user uuid,
  p_organization_id uuid,
  p_permission text,
  p_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
     and exists (
       select 1
         from public.organizations o
         join public.permissions k on k.key = p_permission and k.scope = 'organization'
        where o.id = p_organization_id
          and private.organization_status_allows(o.status, p_permission)
     )
     and (
       private.position_grants(p_user, p_organization_id, p_permission, p_at)
       or exists (
         select 1
           from public.delegations d
           join public.delegation_permissions dp on dp.delegation_id = d.id
           join public.permissions k on k.key = dp.permission_key and k.is_delegable
           join public.memberships m on m.id = d.delegate_membership_id
          where d.delegate_user_id = p_user
            and d.organization_id = p_organization_id
            and dp.permission_key = p_permission
            and d.status = 'active'
            and d.starts_at <= p_at
            and p_at < d.ends_at
            and m.status = 'active'
            -- The delegator must still hold the key through a position.
            and private.position_grants(d.delegator_user_id, p_organization_id, p_permission, p_at)
       )
     );
$$;

-- Platform keys: only from a BDE office mandate or the guardian role.
create or replace function private.user_has_platform_permission(p_user uuid, p_permission text, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (
      select 1
        from public.position_assignments a
        join public.memberships m on m.id = a.membership_id
        join public.position_permissions pp on pp.position_id = a.position_id
        join public.permissions k on k.key = pp.permission_key and k.scope = 'platform'
       where a.user_id = p_user
         and a.office in ('bde_president', 'bde_vice_president')
         and pp.permission_key = p_permission
         and a.status = 'active'
         and a.starts_at <= p_at
         and p_at < a.ends_at
         and m.status = 'active'
    )
    or exists (
      select 1
        from public.platform_assignments g
        join public.platform_role_permissions rp on rp.role = g.role
       where g.user_id = p_user
         and rp.permission_key = p_permission
         and g.status = 'active'
         and g.starts_at <= p_at
         and p_at < g.ends_at
    )
  );
$$;

-- The caller's versions, used by the policies.
create or replace function private.has_organization_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission((select auth.uid()), p_organization_id, p_permission, now());
$$;

create or replace function private.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_platform_permission((select auth.uid()), p_permission, now());
$$;

-- Organizations where the caller holds a key right now (evaluated once per
-- statement by the policies, instead of once per row).
create or replace function private.my_organization_ids_with(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
   where (
       exists (select 1 from public.position_assignments a where a.user_id = (select auth.uid()) and a.organization_id = o.id)
       or exists (select 1 from public.delegations d where d.delegate_user_id = (select auth.uid()) and d.organization_id = o.id)
     )
     and private.user_has_organization_permission((select auth.uid()), o.id, p_permission, now());
$$;

-- Organizations where the caller has an open (active or suspended) membership.
create or replace function private.my_open_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.memberships m
   where m.user_id = (select auth.uid())
     and m.status <> 'ended';
$$;

-- Who holds an office at a moment (null: vacant). A holder whose membership
-- is suspended cannot act, so the office counts as vacant.
create or replace function private.office_holder(p_organization_id uuid, p_office text, p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id
    from public.position_assignments a
    join public.memberships m on m.id = a.membership_id
   where a.organization_id = p_organization_id
     and a.office = p_office
     and a.status = 'active'
     and a.starts_at <= p_at
     and p_at < a.ends_at
     and m.status = 'active'
   limit 1;
$$;

create or replace function private.bde_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.organizations where kind = 'bde';
$$;

create or replace function private.guardian_user(p_at timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.user_id
    from public.platform_assignments g
   where g.role = 'guardian'
     and g.status = 'active'
     and g.starts_at <= p_at
     and p_at < g.ends_at
   limit 1;
$$;

-- The caller's sign-in address, from auth.users (not from a possibly older JWT).
create or replace function private.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid());
$$;

-- How the platform names a person in governance screens: their chosen name,
-- else first and last name. Never their e-mail.
create or replace function private.person_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(p.display_name, nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''))
       from public.profiles p
      where p.id = p_user),
    'Compte sans nom'
  );
$$;

revoke all on function private.session_is_aal2() from public, anon, authenticated, service_role;
revoke all on function private.organization_status_allows(text, text) from public, anon, authenticated, service_role;
revoke all on function private.position_grants(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.user_has_organization_permission(uuid, uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.user_has_platform_permission(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.has_organization_permission(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.has_platform_permission(text) from public, anon, authenticated, service_role;
revoke all on function private.my_organization_ids_with(text) from public, anon, authenticated, service_role;
revoke all on function private.my_open_organization_ids() from public, anon, authenticated, service_role;
revoke all on function private.office_holder(uuid, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.bde_organization_id() from public, anon, authenticated, service_role;
revoke all on function private.guardian_user(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.current_user_email() from public, anon, authenticated, service_role;
revoke all on function private.person_name(uuid) from public, anon, authenticated, service_role;

-- The policies below run as the caller: these (and Phase 3's
-- mfa_requirement_met) are the only private helpers `authenticated` may call.
-- Each answers about the caller only.
grant execute on function private.has_organization_permission(uuid, text) to authenticated;
grant execute on function private.has_platform_permission(text) to authenticated;
grant execute on function private.my_organization_ids_with(text) to authenticated;
grant execute on function private.my_open_organization_ids() to authenticated;
grant execute on function private.current_user_email() to authenticated;

-- ---- Read policies ----------------------------------------------------------

-- Organizations: public columns of active and archived organizations for
-- everyone; setup and suspended ones for their members and for platform
-- governance. created_by and status_reason are never granted to the API roles.
create policy organizations_read_public
  on public.organizations for select to anon, authenticated
  using (status in ('active', 'archived'));

create policy organizations_read_members
  on public.organizations for select to authenticated
  using (id in (select private.my_open_organization_ids()));

create policy organizations_read_platform_governance
  on public.organizations for select to authenticated
  using ((select private.has_platform_permission('platform.governance.view')));

create policy organizations_require_mfa_when_enrolled
  on public.organizations as restrictive for select to authenticated
  using (status in ('active', 'archived') or (select private.mfa_requirement_met()));

grant select (id, slug, name, short_name, kind, category, accent, tagline, description, status, archived_at, created_at, updated_at)
  on public.organizations to anon, authenticated;

-- Memberships: your own, and those of organizations where you may see the team.
create policy memberships_read_own
  on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_read_team
  on public.memberships for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('members.view')));

-- Catalog and templates: not secret, readable once signed in.
create policy permissions_read
  on public.permissions for select to authenticated using (true);
create policy position_templates_read
  on public.position_templates for select to authenticated using (true);
create policy position_template_permissions_read
  on public.position_template_permissions for select to authenticated using (true);
create policy platform_role_permissions_read
  on public.platform_role_permissions for select to authenticated using (true);

-- Positions: members of the organization, and platform governance.
create policy positions_read_members
  on public.positions for select to authenticated
  using (organization_id in (select private.my_open_organization_ids()));

create policy positions_read_platform_governance
  on public.positions for select to authenticated
  using ((select private.has_platform_permission('platform.governance.view')));

create policy position_permissions_read
  on public.position_permissions for select to authenticated
  using (position_id in (select p.id from public.positions p));

-- Mandates: your own; the team's, with members.view; protected offices of
-- every organization for platform governance (who presides where).
create policy position_assignments_read_own
  on public.position_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create policy position_assignments_read_team
  on public.position_assignments for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('members.view')));

create policy position_assignments_read_offices
  on public.position_assignments for select to authenticated
  using (office is not null and (select private.has_platform_permission('platform.governance.view')));

-- The guardian appointment: the guardian, and platform governance.
create policy platform_assignments_read_own
  on public.platform_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create policy platform_assignments_read_platform_governance
  on public.platform_assignments for select to authenticated
  using ((select private.has_platform_permission('platform.governance.view')));

-- Delegations: the two people involved, and the team viewers.
create policy delegations_read_parties
  on public.delegations for select to authenticated
  using (delegator_user_id = (select auth.uid()) or delegate_user_id = (select auth.uid()));

create policy delegations_read_team
  on public.delegations for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('members.view')));

create policy delegation_permissions_read
  on public.delegation_permissions for select to authenticated
  using (delegation_id in (select d.id from public.delegations d));

-- Audit: an organization's history with audit.view there; the whole
-- platform's for BDE leadership; leadership, recovery, bootstrap and
-- organization events for the guardian; decisions about yourself.
create policy governance_audit_read_organization
  on public.governance_audit_events for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('audit.view')));

create policy governance_audit_read_platform
  on public.governance_audit_events for select to authenticated
  using ((select private.has_platform_permission('platform.audit.view')));

create policy governance_audit_read_guardian
  on public.governance_audit_events for select to authenticated
  using (
    category in ('leadership', 'recovery', 'bootstrap', 'organization')
    and (select private.has_platform_permission('platform.recovery'))
  );

create policy governance_audit_read_about_me
  on public.governance_audit_events for select to authenticated
  using (actor_user_id = (select auth.uid()) or subject_user_id = (select auth.uid()));

-- A half-finished sign-in (MFA enrolled, aal1) reads nothing here, as in Phase 3.
create policy memberships_require_mfa_when_enrolled on public.memberships
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy positions_require_mfa_when_enrolled on public.positions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy position_permissions_require_mfa_when_enrolled on public.position_permissions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy position_assignments_require_mfa_when_enrolled on public.position_assignments
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy platform_assignments_require_mfa_when_enrolled on public.platform_assignments
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy delegations_require_mfa_when_enrolled on public.delegations
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy delegation_permissions_require_mfa_when_enrolled on public.delegation_permissions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy governance_audit_require_mfa_when_enrolled on public.governance_audit_events
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.memberships, public.permissions, public.position_templates, public.position_template_permissions,
  public.platform_role_permissions, public.positions, public.position_permissions, public.position_assignments,
  public.platform_assignments, public.delegations, public.delegation_permissions, public.governance_audit_events
  to authenticated;

-- ---- What the interface may show ---------------------------------------------

-- The caller's effective access right now: platform keys, and for each
-- organization they belong to, its identity, their keys and their current
-- positions. Navigation is built from this; every action is checked again by
-- the function that performs it.
create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.mfa_requirement_met() then
    return null;
  end if;
  return jsonb_build_object(
    'platform', coalesce((
      select jsonb_agg(k.key order by k.sort_order)
        from public.permissions k
       where k.scope = 'platform'
         and private.user_has_platform_permission(v_user, k.key, now())
    ), '[]'::jsonb),
    'is_guardian', private.guardian_user(now()) is not distinct from v_user and v_user is not null,
    'organizations', coalesce((
      select jsonb_agg(org order by (org ->> 'kind') = 'bde' desc, org ->> 'name')
        from (
          select jsonb_build_object(
                   'id', o.id,
                   'slug', o.slug,
                   'name', o.name,
                   'short_name', o.short_name,
                   'kind', o.kind,
                   'accent', o.accent,
                   'status', o.status,
                   'membership_id', m.id,
                   'membership_status', m.status,
                   'permissions', coalesce((
                     select jsonb_agg(k.key order by k.sort_order)
                       from public.permissions k
                      where k.scope = 'organization'
                        and private.user_has_organization_permission(v_user, o.id, k.key, now())
                   ), '[]'::jsonb),
                   'positions', coalesce((
                     select jsonb_agg(jsonb_build_object('title', p.title, 'office', a.office, 'ends_at', a.ends_at) order by p.sort_order, p.title)
                       from public.position_assignments a
                       join public.positions p on p.id = a.position_id
                      where a.membership_id = m.id
                        and a.status = 'active'
                        and a.starts_at <= now()
                        and now() < a.ends_at
                   ), '[]'::jsonb)
                 ) as org
            from public.memberships m
            join public.organizations o on o.id = m.organization_id
           where m.user_id = v_user
             and m.status <> 'ended'
        ) s
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
