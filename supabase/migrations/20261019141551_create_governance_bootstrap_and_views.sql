-- Phase 4 · Bootstrap, guardian provisioning, and the read functions the
-- governance screens use.
--
-- Bootstrap: the first BDE president, vice-president and continuity
-- guardian cannot be appointed by anyone in the app (nobody has authority
-- yet). private.bootstrap_governance() does it ONCE, from explicit user ids
-- of existing accounts, never from an e-mail match. It is in `private` with
-- no grant: only the project owner can run it (SQL editor, `postgres`), and
-- it refuses to run again once any BDE office or guardian mandate has ever
-- existed (re-running the same plan is a no-op). Replacing the guardian later
-- is the same kind of trusted provisioning (private.provision_guardian):
-- the institutional verification it needs happens outside the app and is
-- documented in docs/backend/governance.md.
--
-- Read functions: security definer, each checks what the caller may see and
-- returns only that (names, never e-mails, except an invitation's own
-- address to the people who may manage invitations).

create or replace function private.bootstrap_governance(
  p_president uuid,
  p_vice_president uuid,
  p_guardian uuid,
  p_mandate_ends_at timestamptz,
  p_guardian_ends_at timestamptz,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bde uuid := private.bde_organization_id();
  v_reason text := private.require_reason(p_reason);
  v_membership uuid;
  v_user uuid;
  v_office text;
begin
  if exists (select 1 from public.position_assignments where office in ('bde_president', 'bde_vice_president'))
     or exists (select 1 from public.platform_assignments) then
    if private.office_holder(v_bde, 'bde_president', now()) = p_president
       and private.office_holder(v_bde, 'bde_vice_president', now()) = p_vice_president
       and private.guardian_user(now()) is not distinct from p_guardian then
      return 'already_bootstrapped';
    end if;
    raise exception 'bootstrap_already_done' using errcode = 'P0001';
  end if;
  if p_president is null or p_vice_president is null or p_president = p_vice_president
     or p_guardian in (p_president, p_vice_president) then
    raise exception 'bootstrap_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from auth.users where id in (p_president, p_vice_president)) <> 2
     or (p_guardian is not null and not exists (select 1 from auth.users where id = p_guardian)) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if p_mandate_ends_at is null or p_mandate_ends_at <= now() or p_mandate_ends_at > now() + interval '13 months' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;

  foreach v_office in array array['bde_president', 'bde_vice_president'] loop
    v_user := case v_office when 'bde_president' then p_president else p_vice_president end;
    select id into v_membership
      from public.memberships
     where organization_id = v_bde and user_id = v_user and status <> 'ended';
    if v_membership is null then
      insert into public.memberships (organization_id, user_id, status)
      values (v_bde, v_user, 'active')
      returning id into v_membership;
    end if;
    insert into public.position_assignments
      (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source, appointed_by)
    select v_bde, v_membership, v_user, p.id, now(), p_mandate_ends_at, 'bootstrap', null
      from public.positions p
     where p.organization_id = v_bde and p.office = v_office;
    v_membership := null;
  end loop;

  if p_guardian is not null then
    if p_guardian_ends_at is null or p_guardian_ends_at <= now() then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
    insert into public.platform_assignments (user_id, role, starts_at, ends_at, source, reason)
    values (p_guardian, 'guardian', now(), p_guardian_ends_at, 'bootstrap', v_reason);
  end if;

  perform private.log_governance_event(
    null, 'provisioning', 'governance_bootstrapped', 'bootstrap', v_bde, null, 'organization', v_bde,
    jsonb_build_object('president', p_president, 'vice_president', p_vice_president, 'guardian', p_guardian,
                       'mandate_ends_at', p_mandate_ends_at),
    v_reason
  );
  return 'bootstrapped';
end;
$$;

create or replace function private.provision_guardian(p_user uuid, p_ends_at timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
  v_bde uuid := private.bde_organization_id();
begin
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if p_user in (
       coalesce(private.office_holder(v_bde, 'bde_president', now()), '00000000-0000-0000-0000-000000000000'::uuid),
       coalesce(private.office_holder(v_bde, 'bde_vice_president', now()), '00000000-0000-0000-0000-000000000000'::uuid)
     ) then
    raise exception 'candidate_not_allowed' using errcode = 'P0001';
  end if;
  update public.platform_assignments
     set status = case when starts_at >= now() then 'cancelled' else 'ended' end,
         ends_at = case when starts_at >= now() then ends_at else now() end,
         end_reason = v_reason
   where role = 'guardian' and status = 'active' and ends_at > now();
  insert into public.platform_assignments (user_id, role, starts_at, ends_at, source, reason)
  values (p_user, 'guardian', now(), p_ends_at, 'provisioning', v_reason);
  perform private.log_governance_event(
    null, 'provisioning', 'guardian_provisioned', 'bootstrap', null, p_user, 'platform_assignment', null,
    jsonb_build_object('ends_at', p_ends_at), v_reason
  );
end;
$$;

revoke all on function private.bootstrap_governance(uuid, uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function private.provision_guardian(uuid, timestamptz, text) from public, anon, authenticated, service_role;

-- ---- Explanations -----------------------------------------------------------------

-- Why a person has, or lacks, one key in one organization right now.
create or replace function private.explain_permission(p_user uuid, p_organization_id uuid, p_permission text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_status text;
  v_membership_status text;
begin
  if private.user_has_organization_permission(p_user, p_organization_id, p_permission, now()) then
    return case when private.position_grants(p_user, p_organization_id, p_permission, now()) then 'position' else 'delegation' end;
  end if;
  select status into v_org_status from public.organizations where id = p_organization_id;
  select status into v_membership_status
    from public.memberships
   where organization_id = p_organization_id and user_id = p_user and status <> 'ended';
  if v_membership_status is null then
    return 'not_member';
  end if;
  if v_membership_status = 'suspended' then
    return 'membership_suspended';
  end if;
  if not private.organization_status_allows(v_org_status, p_permission) then
    return 'organization_' || v_org_status;
  end if;
  if exists (
    select 1 from public.position_assignments a
      join public.position_permissions pp on pp.position_id = a.position_id
     where a.user_id = p_user and a.organization_id = p_organization_id and pp.permission_key = p_permission
       and a.status = 'active' and a.starts_at > now()
  ) then
    return 'mandate_not_started';
  end if;
  if exists (
    select 1 from public.position_assignments a
      join public.position_permissions pp on pp.position_id = a.position_id
     where a.user_id = p_user and a.organization_id = p_organization_id and pp.permission_key = p_permission
       and a.status in ('active', 'ended') and a.ends_at <= now()
  ) then
    return 'mandate_ended';
  end if;
  if exists (
    select 1 from public.delegations d
      join public.delegation_permissions dp on dp.delegation_id = d.id
     where d.delegate_user_id = p_user and d.organization_id = p_organization_id and dp.permission_key = p_permission
       and d.status = 'active' and d.starts_at <= now() and now() < d.ends_at
  ) then
    return 'delegator_lost_permission';
  end if;
  if exists (
    select 1 from public.delegations d
      join public.delegation_permissions dp on dp.delegation_id = d.id
     where d.delegate_user_id = p_user and d.organization_id = p_organization_id and dp.permission_key = p_permission
  ) then
    return 'delegation_ended';
  end if;
  return 'no_grant';
end;
$$;

revoke all on function private.explain_permission(uuid, uuid, text) from public, anon, authenticated, service_role;

-- One office of one organization: its current holder and the next one, if scheduled.
create or replace function private.office_summary(p_organization_id uuid, p_office text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'office', p.office,
    'title', p.title,
    'holder', (
      select jsonb_build_object('user_id', a.user_id, 'name', private.person_name(a.user_id), 'assignment_id', a.id,
                                'starts_at', a.starts_at, 'ends_at', a.ends_at, 'source', a.source,
                                'is_you', a.user_id = (select auth.uid()))
        from public.position_assignments a
        join public.memberships m on m.id = a.membership_id
       where a.position_id = p.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at and m.status = 'active'
       limit 1
    ),
    'next', (
      select jsonb_build_object('user_id', a.user_id, 'name', private.person_name(a.user_id), 'assignment_id', a.id,
                                'starts_at', a.starts_at, 'ends_at', a.ends_at, 'source', a.source,
                                'is_you', a.user_id = (select auth.uid()))
        from public.position_assignments a
       where a.position_id = p.id and a.status = 'active' and a.starts_at > now()
       order by a.starts_at
       limit 1
    )
  )
    from public.positions p
   where p.organization_id = p_organization_id and p.office = p_office;
$$;

revoke all on function private.office_summary(uuid, text) from public, anon, authenticated, service_role;

-- ---- Team -------------------------------------------------------------------------

create or replace function public.organization_team(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_can_invite boolean;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'members.view');
  v_can_invite := private.user_has_organization_permission(v_actor, p_organization_id, 'members.invite', now());
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'membership_id', m.id,
               'user_id', m.user_id,
               'name', private.person_name(m.user_id),
               'status', m.status,
               'status_reason', m.status_reason,
               'joined_at', m.joined_at,
               'is_you', m.user_id = v_actor,
               'assignments', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', a.id, 'position_id', a.position_id, 'title', p.title, 'office', a.office,
                          'starts_at', a.starts_at, 'ends_at', a.ends_at, 'source', a.source,
                          'upcoming', a.starts_at > now())
                        order by a.office is null, p.sort_order, p.title)
                   from public.position_assignments a
                   join public.positions p on p.id = a.position_id
                  where a.membership_id = m.id and a.status = 'active' and a.ends_at > now()
               ), '[]'::jsonb),
               'delegations', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'delegator_name', private.person_name(d.delegator_user_id),
                          'starts_at', d.starts_at, 'ends_at', d.ends_at, 'reason', d.reason,
                          'permissions', (select jsonb_agg(dp.permission_key order by dp.permission_key)
                                            from public.delegation_permissions dp where dp.delegation_id = d.id))
                        order by d.ends_at)
                   from public.delegations d
                  where d.delegate_membership_id = m.id and d.status = 'active' and d.ends_at > now()
               ), '[]'::jsonb)
             ) order by m.status, private.person_name(m.user_id))
        from public.memberships m
       where m.organization_id = p_organization_id and m.status <> 'ended'
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'description', p.description, 'office', p.office,
               'template_key', p.template_key,
               'permissions', to_jsonb(private.position_keys(p.id)),
               'holders', (select count(*) from public.position_assignments a
                            where a.position_id = p.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at))
             order by p.office is null, p.sort_order, p.title)
        from public.positions p
       where p.organization_id = p_organization_id and p.archived_at is null
    ), '[]'::jsonb),
    'invitations', case when v_can_invite then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'email', i.email, 'position_title', p.title, 'mandate_ends_at', i.mandate_ends_at,
               'invited_by_name', private.person_name(i.invited_by), 'created_at', i.created_at,
               'expires_at', i.expires_at, 'expired', i.expires_at <= now())
             order by i.created_at desc)
        from public.organization_invitations i
        left join public.positions p on p.id = i.position_id
       where i.organization_id = p_organization_id and i.status = 'pending'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'delegations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'delegator_name', private.person_name(d.delegator_user_id),
               'delegator_is_you', d.delegator_user_id = v_actor,
               'delegate_name', private.person_name(d.delegate_user_id), 'delegate_membership_id', d.delegate_membership_id,
               'delegate_is_you', d.delegate_user_id = v_actor,
               'starts_at', d.starts_at, 'ends_at', d.ends_at, 'reason', d.reason,
               -- Still backed: the delegator holds every lent key through a position.
               'effective', not exists (
                 select 1 from public.delegation_permissions dp
                  where dp.delegation_id = d.id
                    and not private.position_grants(d.delegator_user_id, d.organization_id, dp.permission_key, now())),
               'permissions', (select jsonb_agg(dp.permission_key order by dp.permission_key)
                                 from public.delegation_permissions dp where dp.delegation_id = d.id))
             order by d.ends_at)
        from public.delegations d
       where d.organization_id = p_organization_id and d.status = 'active' and d.ends_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

-- The permission inspector: what one member can and cannot do here, and why.
-- Visible to the member themselves and to whoever may see the team.
create or replace function public.member_access(p_membership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_membership public.memberships%rowtype;
begin
  select * into v_membership from public.memberships where id = p_membership_id;
  if not found
     or (v_membership.user_id <> v_actor
         and not private.user_has_organization_permission(v_actor, v_membership.organization_id, 'members.view', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'membership_id', v_membership.id,
    'organization_id', v_membership.organization_id,
    'name', private.person_name(v_membership.user_id),
    'is_you', v_membership.user_id = v_actor,
    'status', v_membership.status,
    'status_reason', v_membership.status_reason,
    'joined_at', v_membership.joined_at,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'title', p.title, 'office', a.office, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
               'status', a.status, 'source', a.source,
               'state', case
                 when a.status = 'cancelled' then 'cancelled'
                 when a.starts_at > now() and a.status = 'active' then 'upcoming'
                 when a.ends_at <= now() or a.status = 'ended' then 'ended'
                 else 'current' end)
             order by a.starts_at desc)
        from public.position_assignments a
        join public.positions p on p.id = a.position_id
       where a.membership_id = v_membership.id
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', k.key, 'label', k.label, 'category', k.category, 'module_ready', k.module_ready,
               'sensitive', k.is_sensitive,
               'result', private.explain_permission(v_membership.user_id, v_membership.organization_id, k.key))
             order by k.sort_order)
        from public.permissions k
       where k.scope = 'organization'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---- Governance -------------------------------------------------------------------

create or replace function public.organization_governance(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_bde uuid := private.bde_organization_id();
  v_is_guardian boolean;
  v_t public.leadership_transitions%rowtype;
  v_president uuid;
  v_vice uuid;
  v_vacant int;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  v_is_guardian := private.guardian_user(now()) = v_actor;
  if not (
       private.user_has_organization_permission(v_actor, p_organization_id, 'governance.view', now())
    or private.user_has_platform_permission(v_actor, 'platform.governance.view', now())
  ) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;

  select * into v_t
    from public.leadership_transitions
   where organization_id = p_organization_id and status = 'open' and expires_at > now();
  v_president := private.office_holder(v_bde, 'bde_president', now());
  v_vice := private.office_holder(v_bde, 'bde_vice_president', now());
  v_vacant := (v_president is null)::int + (v_vice is null)::int;

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'slug', v_org.slug, 'name', v_org.name, 'kind', v_org.kind,
                                       'status', v_org.status, 'accent', v_org.accent),
    'offices', case when v_org.kind = 'bde'
      then jsonb_build_array(private.office_summary(v_org.id, 'bde_president'), private.office_summary(v_org.id, 'bde_vice_president'))
      else jsonb_build_array(private.office_summary(v_org.id, 'association_president')) end,
    'guardian', case when v_org.kind = 'bde' then (
      select jsonb_build_object('name', private.person_name(g.user_id), 'ends_at', g.ends_at, 'is_you', g.user_id = v_actor)
        from public.platform_assignments g
       where g.role = 'guardian' and g.status = 'active' and g.starts_at <= now() and now() < g.ends_at
       limit 1) end,
    'transition', case when v_t.id is null then null else jsonb_build_object(
      'id', v_t.id, 'kind', v_t.kind, 'reason', v_t.reason, 'created_at', v_t.created_at,
      'effective_at', v_t.effective_at, 'mandate_ends_at', v_t.mandate_ends_at, 'expires_at', v_t.expires_at,
      'proposed_by_name', private.person_name(v_t.proposed_by), 'proposed_by_is_you', v_t.proposed_by = v_actor,
      'candidates', (
        select jsonb_agg(jsonb_build_object('office', c.office, 'name', private.person_name(c.user_id),
                                            'accepted', c.accepted, 'responded_at', c.responded_at, 'is_you', c.user_id = v_actor)
                         order by c.office)
          from public.leadership_transition_candidates c where c.transition_id = v_t.id),
      'approvals', coalesce((
        select jsonb_agg(jsonb_build_object('capacity', a.capacity, 'name', private.person_name(a.approver_user_id),
                                            'approved_at', a.approved_at, 'is_you', a.approver_user_id = v_actor)
                         order by a.approved_at)
          from public.leadership_transition_approvals a where a.transition_id = v_t.id), '[]'::jsonb),
      'required_approvals', case when v_t.kind = 'bde_succession' then (
        select jsonb_agg(x) from (
          select 'bde_president' as x where v_president is not null
          union all select 'bde_vice_president' where v_vice is not null
          union all select 'guardian' where v_vacant = 1
        ) r) else '[]'::jsonb end,
      'can_approve', v_t.kind = 'bde_succession' and not exists (
          select 1 from public.leadership_transition_approvals a where a.transition_id = v_t.id and a.approver_user_id = v_actor)
        and (v_actor in (coalesce(v_president, '00000000-0000-0000-0000-000000000000'::uuid),
                         coalesce(v_vice, '00000000-0000-0000-0000-000000000000'::uuid))
             or (v_is_guardian and v_vacant = 1)),
      'can_withdraw', exists (
          select 1 from public.leadership_transition_approvals a where a.transition_id = v_t.id and a.approver_user_id = v_actor),
      'can_cancel', v_t.proposed_by = v_actor
        or (v_t.kind in ('association_succession', 'association_appointment')
            and private.user_has_platform_permission(v_actor, 'platform.associations.intervene', now()))
        or (v_t.kind = 'bde_succession' and v_actor in (coalesce(v_president, '00000000-0000-0000-0000-000000000000'::uuid),
                                                         coalesce(v_vice, '00000000-0000-0000-0000-000000000000'::uuid)))
        or (v_t.kind = 'bde_recovery' and v_is_guardian),
      'can_respond', exists (
          select 1 from public.leadership_transition_candidates c
           where c.transition_id = v_t.id and c.user_id = v_actor and c.accepted is null)
    ) end,
    'history', coalesce((
      select jsonb_agg(h order by (h ->> 'created_at') desc) from (
        select jsonb_build_object('id', t.id, 'kind', t.kind, 'status',
                                  case when t.status = 'open' and t.expires_at <= now() then 'expired' else t.status end,
                                  'created_at', t.created_at, 'effective_at', t.effective_at, 'completed_at', t.completed_at,
                                  'cancelled_at', t.cancelled_at, 'cancel_reason', t.cancel_reason, 'reason', t.reason,
                                  'proposed_by_name', private.person_name(t.proposed_by),
                                  'candidates', (select jsonb_agg(jsonb_build_object('office', c.office, 'name', private.person_name(c.user_id)))
                                                   from public.leadership_transition_candidates c where c.transition_id = t.id)) as h
          from public.leadership_transitions t
         where t.organization_id = p_organization_id and t.id is distinct from v_t.id
         order by t.created_at desc
         limit 8
      ) s
    ), '[]'::jsonb),
    'can', jsonb_build_object(
      'propose_succession', v_org.kind = 'association'
        and private.office_holder(v_org.id, 'association_president', now()) = v_actor
        and private.user_has_organization_permission(v_actor, v_org.id, 'governance.succession', now()),
      'appoint_president', v_org.kind = 'association'
        and private.user_has_platform_permission(v_actor, 'platform.associations.intervene', now()),
      'end_president', v_org.kind = 'association'
        and private.user_has_platform_permission(v_actor, 'platform.associations.intervene', now()),
      'propose_bde_succession', v_org.kind = 'bde'
        and v_actor in (coalesce(v_president, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(v_vice, '00000000-0000-0000-0000-000000000000'::uuid)),
      'recover_bde', v_org.kind = 'bde' and v_is_guardian,
      'end_bde_office', v_org.kind = 'bde' and v_is_guardian
    )
  );
end;
$$;

-- The platform at a glance: BDE leadership, the guardian, associations
-- without a president, transitions in progress, offices about to lapse.
-- Real counts only.
create or replace function public.governance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_bde uuid := private.bde_organization_id();
begin
  perform private.require_platform_permission(v_actor, 'platform.governance.view');
  return jsonb_build_object(
    'bde', jsonb_build_object(
      'organization_id', v_bde,
      'offices', jsonb_build_array(private.office_summary(v_bde, 'bde_president'), private.office_summary(v_bde, 'bde_vice_president'))
    ),
    'guardian', (
      select jsonb_build_object('name', private.person_name(g.user_id), 'ends_at', g.ends_at, 'is_you', g.user_id = v_actor)
        from public.platform_assignments g
       where g.role = 'guardian' and g.status = 'active' and g.starts_at <= now() and now() < g.ends_at
       limit 1
    ),
    'counts', (
      select jsonb_build_object(
               'active', count(*) filter (where status = 'active'),
               'setup', count(*) filter (where status = 'setup'),
               'suspended', count(*) filter (where status = 'suspended'),
               'archived', count(*) filter (where status = 'archived'))
        from public.organizations where kind = 'association'
    ),
    'without_president', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'status', o.status) order by o.name)
        from public.organizations o
       where o.kind = 'association' and o.status in ('active', 'setup')
         and private.office_holder(o.id, 'association_president', now()) is null
    ), '[]'::jsonb),
    'open_transitions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'organization_name', o.name, 'organization_slug', o.slug,
                                          'organization_kind', o.kind, 'created_at', t.created_at,
                                          'effective_at', t.effective_at, 'expires_at', t.expires_at)
                       order by t.created_at)
        from public.leadership_transitions t
        join public.organizations o on o.id = t.organization_id
       where t.status = 'open' and t.expires_at > now()
    ), '[]'::jsonb),
    'expiring_offices', coalesce((
      select jsonb_agg(jsonb_build_object('organization_name', o.name, 'organization_slug', o.slug, 'organization_kind', o.kind,
                                          'office', a.office, 'holder_name', private.person_name(a.user_id), 'ends_at', a.ends_at)
                       order by a.ends_at)
        from public.position_assignments a
        join public.organizations o on o.id = a.organization_id
       where a.office is not null and a.status = 'active' and a.starts_at <= now()
         and a.ends_at > now() and a.ends_at <= now() + interval '45 days'
         and o.status in ('active', 'setup')
         and not exists (
           select 1 from public.position_assignments n
            where n.position_id = a.position_id and n.status = 'active' and n.starts_at >= a.ends_at
         )
    ), '[]'::jsonb),
    'health', jsonb_build_object(
      'orphaned_assignments', (
        select count(*) from public.position_assignments a
          join public.memberships m on m.id = a.membership_id
         where a.status = 'active' and a.starts_at <= now() and now() < a.ends_at and m.status <> 'active'),
      'lapsed_delegations', (
        select count(*) from public.delegations d
         where d.status = 'active' and d.ends_at <= now() and d.ends_at > now() - interval '30 days'),
      'overlapping_offices', (
        select count(*) from public.position_assignments a
          join public.position_assignments b
            on b.position_id = a.position_id and b.id <> a.id and b.status = 'active'
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(b.starts_at, b.ends_at)
         where a.office is not null and a.status = 'active')
    )
  );
end;
$$;

create or replace function public.platform_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.governance.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'kind', o.kind,
             'category', o.category, 'accent', o.accent, 'status', o.status, 'status_reason', o.status_reason,
             'created_at', o.created_at, 'archived_at', o.archived_at,
             'president', (
               select jsonb_build_object('name', private.person_name(a.user_id), 'ends_at', a.ends_at, 'assignment_id', a.id)
                 from public.position_assignments a
                 join public.memberships m on m.id = a.membership_id
                where a.organization_id = o.id and a.office = 'association_president' and a.status = 'active'
                  and a.starts_at <= now() and now() < a.ends_at and m.status = 'active'
                limit 1),
             'members', (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
             'open_transition', (
               select t.kind from public.leadership_transitions t
                where t.organization_id = o.id and t.status = 'open' and t.expires_at > now() limit 1))
           order by o.kind = 'bde' desc, o.status = 'archived', o.name)
      from public.organizations o
  ), '[]'::jsonb);
end;
$$;

-- What waits for the caller: invitations to answer, candidacies to accept,
-- BDE approvals to give.
create or replace function public.my_governance_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_email text := private.current_user_email();
  v_bde uuid := private.bde_organization_id();
  v_president uuid := private.office_holder(v_bde, 'bde_president', now());
  v_vice uuid := private.office_holder(v_bde, 'bde_vice_president', now());
  v_is_guardian boolean := private.guardian_user(now()) = v_actor;
begin
  return jsonb_build_object(
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'organization', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'accent', o.accent, 'kind', o.kind),
               'position_title', p.title, 'position_permissions', case when p.id is null then '[]'::jsonb else to_jsonb(private.position_keys(p.id)) end,
               'mandate_ends_at', i.mandate_ends_at, 'invited_by_name', private.person_name(i.invited_by),
               'created_at', i.created_at, 'expires_at', i.expires_at)
             order by i.created_at desc)
        from public.organization_invitations i
        join public.organizations o on o.id = i.organization_id
        left join public.positions p on p.id = i.position_id
       where i.email = v_email and i.status = 'pending' and i.expires_at > now()
    ), '[]'::jsonb),
    'candidacies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'transition_id', t.id, 'kind', t.kind, 'office', c.office,
               'organization', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'accent', o.accent, 'kind', o.kind),
               'proposed_by_name', private.person_name(t.proposed_by), 'reason', t.reason,
               'effective_at', t.effective_at, 'mandate_ends_at', t.mandate_ends_at, 'expires_at', t.expires_at,
               'approvals_missing', case when t.kind = 'bde_succession' then (
                  (v_president is not null and not exists (select 1 from public.leadership_transition_approvals a
                     where a.transition_id = t.id and a.capacity = 'bde_president' and a.approver_user_id = v_president))
                  or (v_vice is not null and not exists (select 1 from public.leadership_transition_approvals a
                     where a.transition_id = t.id and a.capacity = 'bde_vice_president' and a.approver_user_id = v_vice))) else false end)
             order by t.created_at)
        from public.leadership_transition_candidates c
        join public.leadership_transitions t on t.id = c.transition_id
        join public.organizations o on o.id = t.organization_id
       where c.user_id = v_actor and c.accepted is null and t.status = 'open' and t.expires_at > now()
    ), '[]'::jsonb),
    'approvals', coalesce((
      select jsonb_agg(jsonb_build_object('transition_id', t.id, 'created_at', t.created_at, 'expires_at', t.expires_at,
                                          'proposed_by_name', private.person_name(t.proposed_by)))
        from public.leadership_transitions t
       where t.kind = 'bde_succession' and t.status = 'open' and t.expires_at > now()
         and not exists (select 1 from public.leadership_transition_approvals a where a.transition_id = t.id and a.approver_user_id = v_actor)
         and (v_actor in (coalesce(v_president, '00000000-0000-0000-0000-000000000000'::uuid),
                          coalesce(v_vice, '00000000-0000-0000-0000-000000000000'::uuid))
              or (v_is_guardian and ((v_president is null) <> (v_vice is null))))
    ), '[]'::jsonb)
  );
end;
$$;

-- Governance history the caller may read: an organization's (audit.view
-- there, or platform audit), or the platform's (BDE: everything; guardian:
-- leadership, recovery, bootstrap, organization; others: decisions about
-- themselves).
create or replace function public.governance_history(p_organization_id uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_platform boolean := private.user_has_platform_permission(v_actor, 'platform.audit.view', now());
  v_guardian boolean := private.user_has_platform_permission(v_actor, 'platform.recovery', now());
  v_org boolean := p_organization_id is not null
                   and private.user_has_organization_permission(v_actor, p_organization_id, 'audit.view', now());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_organization_id is not null and not (v_org or v_platform or v_guardian) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(e order by (e ->> 'id')::bigint desc) from (
      select jsonb_build_object(
               'id', g.id, 'occurred_at', g.occurred_at, 'action', g.action, 'category', g.category,
               'authority', g.authority, 'reason', g.reason, 'details', g.details,
               'actor_name', case when g.actor_user_id is null then null else private.person_name(g.actor_user_id) end,
               'subject_name', case when g.subject_user_id is null then null else private.person_name(g.subject_user_id) end,
               'organization', case when o.id is null then null
                                    else jsonb_build_object('name', o.name, 'slug', o.slug, 'kind', o.kind) end
             ) as e
        from public.governance_audit_events g
        left join public.organizations o on o.id = g.organization_id
       where (p_organization_id is null or g.organization_id = p_organization_id)
         and (
              v_platform
           or (v_org and g.organization_id = p_organization_id)
           or (v_guardian and g.category in ('leadership', 'recovery', 'bootstrap', 'organization'))
           or g.actor_user_id = v_actor
           or g.subject_user_id = v_actor
         )
       order by g.id desc
       limit v_limit
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.organization_team(uuid) from public, anon;
revoke all on function public.member_access(uuid) from public, anon;
revoke all on function public.organization_governance(uuid) from public, anon;
revoke all on function public.governance_overview() from public, anon;
revoke all on function public.platform_organizations() from public, anon;
revoke all on function public.my_governance_inbox() from public, anon;
revoke all on function public.governance_history(uuid, integer) from public, anon;

grant execute on function public.organization_team(uuid) to authenticated;
grant execute on function public.member_access(uuid) to authenticated;
grant execute on function public.organization_governance(uuid) to authenticated;
grant execute on function public.governance_overview() to authenticated;
grant execute on function public.platform_organizations() to authenticated;
grant execute on function public.my_governance_inbox() to authenticated;
grant execute on function public.governance_history(uuid, integer) to authenticated;
