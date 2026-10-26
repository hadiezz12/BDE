-- Phase 9 · Who may do what on an application, the committee, and the evaluation.
--
-- private.application_can is the one answer to "may this person do this to
-- this application?". Every function below asks it (or private.campaign_can
-- for campaign-wide work) at the moment of the request: a revoked or expired
-- appointment, an ended mandate or a suspended membership stops at the next
-- call, whatever session the person still holds.

-- ---- Powers and their organization keys -------------------------------------------------------

create or replace function private.recruitment_power_key(p_power text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_power
    when 'view' then 'recruitment.applications.view'
    when 'documents' then 'recruitment.documents.view'
    when 'review' then 'recruitment.applications.review'
    when 'view_team' then 'recruitment.reviews.view_team'
    when 'committee' then 'recruitment.committee.manage'
    when 'shortlist' then 'recruitment.applications.shortlist'
    when 'interviews' then 'recruitment.interviews.manage'
    when 'propose' then 'recruitment.decisions.propose'
    when 'approve' then 'recruitment.decisions.approve'
    when 'release' then 'recruitment.decisions.release'
    when 'export' then 'recruitment.applications.export'
  end;
$$;

create or replace function private.recruitment_powers()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['view', 'documents', 'review', 'view_team', 'committee', 'shortlist', 'interviews',
               'propose', 'approve', 'release', 'export']::text[];
$$;

-- When a campaign stops being "current" for the organization keys: when it is
-- archived, or a year after it closed (decision D60). Null: never published.
create or replace function private.campaign_sealed_at(p_campaign public.recruitment_campaigns)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_campaign.archived_at, p_campaign.closes_at + interval '12 months');
$$;

-- The organization-key route: the key now, and, once the campaign is sealed,
-- the key at the moment it was sealed (the officers of that year, still in
-- office). Next year's officers do not inherit last year's candidates.
create or replace function private.recruitment_key_route(p_user uuid, p_campaign public.recruitment_campaigns, p_power text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and private.recruitment_power_key(p_power) is not null
     and private.user_has_organization_permission(p_user, p_campaign.organization_id, private.recruitment_power_key(p_power), now())
     and (private.campaign_sealed_at(p_campaign) is null or now() < private.campaign_sealed_at(p_campaign)
          or private.user_has_organization_permission(p_user, p_campaign.organization_id, private.recruitment_power_key(p_power),
                                                       private.campaign_sealed_at(p_campaign)));
$$;

-- The person's appointment to this campaign, if it grants anything right now
-- (not revoked, within its dates, membership active, organization operating).
create or replace function private.live_committee_member_id(p_user uuid, p_campaign_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.id
    from public.recruitment_committee_members cm
    join public.memberships m on m.id = cm.membership_id
    join public.organizations o on o.id = cm.organization_id
   where cm.campaign_id = p_campaign_id and cm.user_id = p_user and cm.revoked_at is null
     and cm.starts_at <= now() and now() < cm.ends_at
     and m.status = 'active' and o.status in ('active', 'setup')
   limit 1;
$$;

-- Anyone with an application (draft or sent) in a campaign reviews nothing in it.
create or replace function private.candidate_in_campaign(p_user uuid, p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.applications a
                  where a.campaign_id = p_campaign_id and a.candidate_id = p_user and a.status <> 'withdrawn');
$$;

-- Campaign-wide work (the committee, the slots, the lists): the power through
-- a key or an appointment, whatever its scope.
create or replace function private.campaign_can(p_user uuid, p_campaign public.recruitment_campaigns, p_power text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_campaign.id is not null
     and not private.candidate_in_campaign(p_user, p_campaign.id)
     and (private.recruitment_key_route(p_user, p_campaign, p_power)
          or exists (select 1 from public.recruitment_committee_members cm
                      where cm.id = private.live_committee_member_id(p_user, p_campaign.id) and p_power = any (cm.powers)));
$$;

-- THE access rule for one application. Never a draft, never one's own, never
-- while one has an application in the same campaign, never with a conflict
-- declared and not cleared; then a key (within the seal) or an appointment
-- whose scope covers it (the campaign, its position, an assignment, or an
-- interview on a slot the person conducts).
create or replace function private.application_can(p_user uuid, p_app public.applications, p_power text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and p_app.id is not null and p_app.status <> 'draft' and p_app.candidate_id <> p_user
     and not private.candidate_in_campaign(p_user, p_app.campaign_id)
     and not exists (select 1 from public.recruitment_conflicts x
                      where x.application_id = p_app.id and x.user_id = p_user and x.status in ('open', 'reassigned'))
     and (
       private.recruitment_key_route(p_user, (select c from public.recruitment_campaigns c where c.id = p_app.campaign_id), p_power)
       or exists (
         select 1
           from public.recruitment_committee_members cm
          where cm.id = private.live_committee_member_id(p_user, p_app.campaign_id)
            and p_power = any (cm.powers)
            and (cm.scope = 'campaign'
                 or (cm.scope = 'positions'
                     and exists (select 1 from public.recruitment_committee_positions cp
                                  where cp.member_id = cm.id and cp.position_id = p_app.position_id))
                 or (cm.scope = 'assigned'
                     and (exists (select 1 from public.recruitment_review_assignments ra
                                   where ra.member_id = cm.id and ra.application_id = p_app.id and ra.removed_at is null)
                          or exists (select 1 from public.recruitment_interviews i
                                       join public.recruitment_slot_interviewers si on si.slot_id = i.slot_id
                                      where i.application_id = p_app.id and si.member_id = cm.id
                                        and i.status in ('scheduled', 'completed', 'no_show')))))));
$$;

-- The application, if the actor may do this to it; otherwise the same refusal
-- as for an application that does not exist (no probing by id).
create or replace function private.application_for(p_actor uuid, p_application_id uuid, p_power text, p_lock boolean default false)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
begin
  if p_lock then
    select * into v_app from public.applications where id = p_application_id for update;
  else
    select * into v_app from public.applications where id = p_application_id;
  end if;
  if not found or not private.application_can(p_actor, v_app, p_power) then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  return v_app;
end;
$$;

-- The campaign, if the actor holds this power on it (campaign-wide).
create or replace function private.campaign_with(p_actor uuid, p_campaign_id uuid, p_power text, p_lock boolean default false)
returns public.recruitment_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.recruitment_campaigns%rowtype;
begin
  if p_lock then
    select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id for update;
  else
    select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  end if;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if not private.campaign_can(p_actor, v_campaign, p_power) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return v_campaign;
end;
$$;

-- For the audit: the authority the actor used.
create or replace function private.recruitment_authority(p_actor uuid, p_campaign_id uuid, p_power text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.recruitment_key_route(p_actor, c, p_power)
              then private.authority_for(p_actor, c.organization_id, private.recruitment_power_key(p_power))
              else 'committee' end
    from public.recruitment_campaigns c where c.id = p_campaign_id;
$$;

-- Everyone who holds a power on one application right now (for messages to the team).
create or replace function private.application_users_with(p_app public.applications, p_power text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct u.user_id
    from (
      select a.user_id from public.position_assignments a
       where a.organization_id = (select organization_id from public.recruitment_campaigns where id = p_app.campaign_id)
         and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at
      union
      select d.delegate_user_id from public.delegations d
       where d.organization_id = (select organization_id from public.recruitment_campaigns where id = p_app.campaign_id)
         and d.status = 'active' and d.starts_at <= now() and now() < d.ends_at
      union
      select cm.user_id from public.recruitment_committee_members cm
       where cm.campaign_id = p_app.campaign_id and cm.revoked_at is null and now() < cm.ends_at
    ) as u
   where private.application_can(u.user_id, p_app, p_power);
$$;

-- ---- Records and messages -----------------------------------------------------------------------

create or replace function private.log_application_activity(p_actor uuid, p_app public.applications, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.application_activity (application_id, campaign_id, actor_id, action, details)
  values (p_app.id, p_app.campaign_id, p_actor, p_action, coalesce(p_details, '{}'::jsonb));
$$;

-- A material step also goes to the Phase 4 audit: the application by id only,
-- never the candidate's identity, the answers, a score or an unreleased outcome.
create or replace function private.log_application_audit(p_actor uuid, p_app public.applications, p_power text, p_action text,
                                                         p_details jsonb default '{}'::jsonb, p_reason text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.log_governance_event(
    p_actor, private.recruitment_authority(p_actor, p_app.campaign_id, p_power), p_action, 'recruitment',
    (select organization_id from public.recruitment_campaigns where id = p_app.campaign_id), null,
    'application', p_app.id,
    jsonb_build_object('campaign_id', p_app.campaign_id, 'position_id', p_app.position_id) || coalesce(p_details, '{}'::jsonb),
    p_reason);
$$;

-- What a message to the team says: where to look, nothing about the person.
create or replace function private.team_message_payload(p_app public.applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', c.title, 'position', p.title, 'organization', coalesce(o.short_name, o.name), 'reference', p_app.reference,
    'link', '/manage/' || o.slug || '/recruitment/' || c.id || '/candidatures/' || p_app.id)
    from public.recruitment_campaigns c
    join public.recruitment_positions p on p.id = p_app.position_id
    join public.organizations o on o.id = c.organization_id
   where c.id = p_app.campaign_id;
$$;

create or replace function private.enqueue_team_message(p_recipient uuid, p_app public.applications, p_kind text, p_key text,
                                                        p_extra jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_outbox (recipient_id, kind, application_id, payload, dedupe_key)
  select p_recipient, p_kind, p_app.id, private.team_message_payload(p_app) || coalesce(p_extra, '{}'::jsonb), p_key
   where p_recipient is not null
  on conflict (dedupe_key) do nothing;
$$;

-- ---- The committee ------------------------------------------------------------------------------

-- The powers asked for, checked: known, "view" included, each one held by the
-- actor on this campaign (nobody gives more than they have).
create or replace function private.committee_powers(p_actor uuid, p_campaign public.recruitment_campaigns, p_powers text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_powers text[] := array(select distinct k from unnest(coalesce(p_powers, '{}'::text[])) as k where k is not null order by 1);
  v_power text;
begin
  if cardinality(v_powers) = 0 or not 'view' = any (v_powers) or not v_powers <@ private.recruitment_powers() then
    raise exception 'powers_invalid' using errcode = 'P0001';
  end if;
  foreach v_power in array v_powers loop
    if not private.campaign_can(p_actor, p_campaign, v_power) then
      raise exception 'permission_ceiling' using errcode = 'P0001';
    end if;
  end loop;
  return v_powers;
end;
$$;

create or replace function private.committee_scope_positions(p_campaign_id uuid, p_scope text, p_position_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_position_ids, '{}'::uuid[])) as x where x is not null);
begin
  if p_scope not in ('campaign', 'positions', 'assigned') then
    raise exception 'scope_invalid' using errcode = 'P0001';
  end if;
  if p_scope <> 'positions' then
    return '{}'::uuid[];
  end if;
  if cardinality(v_ids) = 0
     or (select count(*) from public.recruitment_positions p where p.id = any (v_ids) and p.campaign_id = p_campaign_id) <> cardinality(v_ids) then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- Appoint an active member of the organization to one campaign's committee.
-- Historic access (a sealed campaign) needs a written purpose.
create or replace function public.appoint_recruitment_member(
  p_campaign_id uuid,
  p_membership_id uuid,
  p_role text,
  p_powers text[],
  p_scope text,
  p_position_ids uuid[] default null,
  p_ends_at timestamptz default null,
  p_purpose text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_membership public.memberships%rowtype;
  v_powers text[];
  v_positions uuid[];
  v_purpose text := nullif(btrim(coalesce(p_purpose, '')), '');
  v_id uuid;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  select * into v_membership from public.memberships where id = p_membership_id;
  if not found or v_membership.organization_id <> v_campaign.organization_id or v_membership.status <> 'active' then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  if private.candidate_in_campaign(v_membership.user_id, p_campaign_id) then
    raise exception 'candidate_in_campaign' using errcode = 'P0001';
  end if;
  if p_role not in ('manager', 'reviewer', 'interviewer', 'reader') then
    raise exception 'role_invalid' using errcode = 'P0001';
  end if;
  v_powers := private.committee_powers(v_actor, v_campaign, p_powers);
  v_positions := private.committee_scope_positions(p_campaign_id, p_scope, p_position_ids);
  if p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '18 months' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if private.campaign_sealed_at(v_campaign) is not null and now() >= private.campaign_sealed_at(v_campaign) then
    if v_purpose is null then
      raise exception 'purpose_required' using errcode = 'P0001';
    end if;
    v_purpose := private.require_reason(v_purpose);
  elsif v_purpose is not null then
    v_purpose := left(v_purpose, 500);
  end if;

  -- A previous appointment that simply ran out is closed, so the person can be named again.
  update public.recruitment_committee_members
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = 'Nomination arrivée à son terme'
   where campaign_id = p_campaign_id and user_id = v_membership.user_id and revoked_at is null and ends_at <= now();
  begin
    insert into public.recruitment_committee_members
      (campaign_id, organization_id, membership_id, user_id, role, powers, scope, ends_at, purpose, appointed_by)
    values (p_campaign_id, v_campaign.organization_id, p_membership_id, v_membership.user_id, p_role, v_powers, p_scope,
            p_ends_at, v_purpose, v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'already_on_committee' using errcode = 'P0001';
  end;
  insert into public.recruitment_committee_positions (member_id, campaign_id, position_id)
  select v_id, p_campaign_id, x from unnest(v_positions) as x;

  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_reviewer_assigned', 'recruitment',
    v_campaign.organization_id, v_membership.user_id, 'recruitment_committee_member', v_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'role', p_role, 'powers', to_jsonb(v_powers), 'scope', p_scope,
                       'positions', cardinality(v_positions), 'ends_at', p_ends_at, 'historic', v_purpose is not null
                                                                                      and now() >= coalesce(private.campaign_sealed_at(v_campaign), 'infinity')),
    case when now() >= coalesce(private.campaign_sealed_at(v_campaign), 'infinity') then v_purpose end);
  if v_membership.user_id <> v_actor then
    insert into public.notification_outbox (recipient_id, kind, payload, dedupe_key)
    select v_membership.user_id, 'recruitment_review_assigned',
           jsonb_build_object('title', v_campaign.title, 'organization', coalesce(o.short_name, o.name), 'committee', true,
                              'link', '/manage/evaluations'),
           'committee:' || v_id
      from public.organizations o where o.id = v_campaign.organization_id
    on conflict (dedupe_key) do nothing;
  end if;
  return v_id;
end;
$$;

-- Change an appointment's powers, scope or end date (never one's own).
create or replace function public.update_recruitment_member(
  p_member_id uuid,
  p_role text,
  p_powers text[],
  p_scope text,
  p_position_ids uuid[] default null,
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_member public.recruitment_committee_members%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_powers text[];
  v_positions uuid[];
begin
  perform private.require_aal2();
  select * into v_member from public.recruitment_committee_members where id = p_member_id for update;
  if not found or v_member.revoked_at is not null then
    raise exception 'committee_member_not_found' using errcode = 'P0001';
  end if;
  v_campaign := private.campaign_with(v_actor, v_member.campaign_id, 'committee');
  if v_member.user_id = v_actor then
    raise exception 'cannot_change_own_appointment' using errcode = 'P0001';
  end if;
  if p_role not in ('manager', 'reviewer', 'interviewer', 'reader') then
    raise exception 'role_invalid' using errcode = 'P0001';
  end if;
  v_powers := private.committee_powers(v_actor, v_campaign, p_powers);
  v_positions := private.committee_scope_positions(v_member.campaign_id, p_scope, p_position_ids);
  if p_ends_at is null or p_ends_at <= now() or p_ends_at > v_member.starts_at + interval '18 months' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  update public.recruitment_committee_members
     set role = p_role, powers = v_powers, scope = p_scope, ends_at = p_ends_at
   where id = p_member_id;
  delete from public.recruitment_committee_positions where member_id = p_member_id;
  insert into public.recruitment_committee_positions (member_id, campaign_id, position_id)
  select p_member_id, v_member.campaign_id, x from unnest(v_positions) as x;
  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, v_member.campaign_id, 'committee'), 'recruitment_reviewer_updated', 'recruitment',
    v_member.organization_id, v_member.user_id, 'recruitment_committee_member', p_member_id,
    jsonb_build_object('campaign_id', v_member.campaign_id, 'role', p_role, 'powers', to_jsonb(v_powers), 'scope', p_scope,
                       'positions', cardinality(v_positions), 'ends_at', p_ends_at,
                       'previous', jsonb_build_object('role', v_member.role, 'powers', to_jsonb(v_member.powers),
                                                      'scope', v_member.scope, 'ends_at', v_member.ends_at)));
end;
$$;

-- End an appointment now (a manager, or the person themself stepping down).
-- Their work list is emptied so the manager sees what to reassign.
create or replace function public.revoke_recruitment_member(p_member_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_member public.recruitment_committee_members%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_self boolean;
begin
  select * into v_member from public.recruitment_committee_members where id = p_member_id for update;
  if not found or v_member.revoked_at is not null then
    raise exception 'committee_member_not_found' using errcode = 'P0001';
  end if;
  v_self := v_member.user_id = v_actor;
  select * into v_campaign from public.recruitment_campaigns where id = v_member.campaign_id;
  if not v_self and not private.campaign_can(v_actor, v_campaign, 'committee') then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  update public.recruitment_committee_members
     set revoked_at = now(), revoked_by = v_actor,
         revoke_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 500), ''), case when v_self then 'Retrait volontaire' else 'Retiré du comité' end)
   where id = p_member_id;
  update public.recruitment_review_assignments set removed_at = now(), removed_by = v_actor
   where member_id = p_member_id and removed_at is null;
  perform private.log_governance_event(
    v_actor, case when v_self then 'self' else private.recruitment_authority(v_actor, v_member.campaign_id, 'committee') end,
    'recruitment_reviewer_revoked', 'recruitment', v_member.organization_id, v_member.user_id, 'recruitment_committee_member',
    p_member_id, jsonb_build_object('campaign_id', v_member.campaign_id), nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

-- ---- Work distribution ------------------------------------------------------------------------

-- Give applications to reviewers: "each" (every reviewer gets every
-- application) or "balanced" (one reviewer each, to whoever has the fewest).
-- Every pair is checked on its own; what cannot be assigned is reported.
create or replace function public.assign_recruitment_reviews(
  p_campaign_id uuid,
  p_application_ids uuid[],
  p_member_ids uuid[],
  p_mode text default 'each'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_app public.applications%rowtype;
  v_member public.recruitment_committee_members%rowtype;
  v_members uuid[];
  v_app_id uuid;
  v_target uuid;
  v_assigned integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_placed boolean;
  v_notified uuid[] := '{}'::uuid[];
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if p_mode not in ('each', 'balanced') then
    raise exception 'mode_invalid' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_application_ids, '{}')) = 0 or cardinality(coalesce(p_member_ids, '{}')) = 0
     or cardinality(p_application_ids) > 500 or cardinality(p_member_ids) > 30 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  -- Live appointments of this campaign that may review.
  v_members := array(
    select cm.id from public.recruitment_committee_members cm
     where cm.id = any (p_member_ids) and cm.campaign_id = p_campaign_id
       and cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id) and 'review' = any (cm.powers));
  if cardinality(v_members) <> cardinality(array(select distinct x from unnest(p_member_ids) x)) then
    raise exception 'member_cannot_review' using errcode = 'P0001';
  end if;

  foreach v_app_id in array array(select distinct x from unnest(p_application_ids) x) loop
    select * into v_app from public.applications where id = v_app_id and campaign_id = p_campaign_id;
    if not found or v_app.status <> 'submitted' then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_app_id, 'reason', case when found then 'application_withdrawn' else 'application_not_found' end);
      continue;
    end if;
    v_placed := false;
    for v_target in
      select m from unnest(v_members) m
       order by case when p_mode = 'balanced'
                     then (select count(*) from public.recruitment_review_assignments ra where ra.member_id = m and ra.removed_at is null)
                     else 0 end, m
    loop
      select * into v_member from public.recruitment_committee_members where id = v_target;
      v_reason := case
        when exists (select 1 from public.recruitment_conflicts x where x.application_id = v_app.id and x.user_id = v_member.user_id
                                                                     and x.status in ('open', 'reassigned')) then 'conflict'
        when v_member.user_id = v_app.candidate_id then 'own_application'
        when v_member.scope = 'positions' and not exists (select 1 from public.recruitment_committee_positions cp
                                                          where cp.member_id = v_member.id and cp.position_id = v_app.position_id) then 'out_of_scope'
        when exists (select 1 from public.recruitment_review_assignments ra
                      where ra.application_id = v_app.id and ra.member_id = v_member.id and ra.removed_at is null) then 'already_assigned'
      end;
      if v_reason is not null then
        if p_mode = 'each' then
          v_skipped := v_skipped || jsonb_build_object('application_id', v_app.id, 'member_id', v_member.id, 'reason', v_reason);
        elsif v_reason = 'already_assigned' then
          -- Balanced: it already has one of these reviewers.
          v_placed := true;
          exit;
        end if;
        continue;
      end if;
      insert into public.recruitment_review_assignments (application_id, campaign_id, member_id, assigned_by)
      values (v_app.id, p_campaign_id, v_member.id, v_actor);
      perform private.log_application_activity(v_actor, v_app, 'reviewer_assigned',
        jsonb_build_object('reviewer_name', private.person_name(v_member.user_id)));
      v_assigned := v_assigned + 1;
      if not v_member.user_id = any (v_notified) and v_member.user_id <> v_actor then
        v_notified := v_notified || v_member.user_id;
      end if;
      v_placed := true;
      exit when p_mode = 'balanced';
    end loop;
    if p_mode = 'balanced' and not v_placed then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_app.id, 'reason', 'no_reviewer_available');
    end if;
  end loop;

  foreach v_target in array v_notified loop
    insert into public.notification_outbox (recipient_id, kind, payload, dedupe_key)
    select v_target, 'recruitment_review_assigned',
           jsonb_build_object('title', v_campaign.title, 'organization', coalesce(o.short_name, o.name),
                              'link', '/manage/evaluations'),
           'assign:' || v_target || ':' || p_campaign_id || ':' || extract(epoch from now())::bigint
      from public.organizations o where o.id = v_campaign.organization_id
    on conflict (dedupe_key) do nothing;
  end loop;
  if v_assigned > 0 then
    perform private.log_governance_event(
      v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_reviews_assigned', 'recruitment',
      v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
      jsonb_build_object('assigned', v_assigned, 'reviewers', cardinality(v_members), 'mode', p_mode));
  end if;
  return jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped);
end;
$$;

create or replace function public.unassign_recruitment_review(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_assignment public.recruitment_review_assignments%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_assignment from public.recruitment_review_assignments where id = p_assignment_id and removed_at is null for update;
  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_with(v_actor, v_assignment.campaign_id, 'committee');
  update public.recruitment_review_assignments set removed_at = now(), removed_by = v_actor where id = p_assignment_id;
  select * into v_app from public.applications where id = v_assignment.application_id;
  perform private.log_application_activity(v_actor, v_app, 'reviewer_unassigned',
    jsonb_build_object('reviewer_name', private.person_name((select user_id from public.recruitment_committee_members where id = v_assignment.member_id))));
end;
$$;

-- How many reviews an application needs, and who finalizes decisions.
create or replace function public.set_recruitment_review_policy(p_campaign_id uuid, p_required_reviews integer, p_approval_policy text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if not private.campaign_can(v_actor, v_campaign, 'approve') then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if p_required_reviews is null or p_required_reviews not between 0 and 5 or p_approval_policy not in ('single', 'two', 'president') then
    raise exception 'policy_invalid' using errcode = 'P0001';
  end if;
  update public.recruitment_campaigns set required_reviews = p_required_reviews, approval_policy = p_approval_policy
   where id = p_campaign_id;
  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_review_policy_changed', 'recruitment',
    v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('required_reviews', p_required_reviews, 'approval_policy', p_approval_policy,
                       'previous', jsonb_build_object('required_reviews', v_campaign.required_reviews,
                                                      'approval_policy', v_campaign.approval_policy)));
end;
$$;

-- ---- Rubrics ---------------------------------------------------------------------------------------

-- Criteria are data: 1 to 12 of {id, label, description, max (2-10), weight
-- (1-10), required}. Returns them normalized, or refuses (rubric_invalid).
create or replace function private.validate_rubric(p_criteria jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_label text;
  v_description text;
  v_max integer;
  v_weight integer;
begin
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) > 12 then
    raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'criteria';
  end if;
  for v_item in select * from jsonb_array_elements(p_criteria) loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('id', 'label', 'description', 'max', 'weight', 'required')) then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'criterion';
    end if;
    v_id := v_item ->> 'id';
    v_label := btrim(coalesce(v_item ->> 'label', ''));
    v_description := nullif(btrim(coalesce(v_item ->> 'description', '')), '');
    if v_id is null or v_id !~ '^[a-z0-9_]{1,40}$' or v_id = any (v_ids) then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'id';
    end if;
    if char_length(v_label) not between 2 and 80 or v_label ~ '[[:cntrl:]]' then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'label:' || v_id;
    end if;
    if char_length(v_description) > 300 then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'description:' || v_id;
    end if;
    begin
      v_max := coalesce((v_item ->> 'max')::integer, 5);
      v_weight := coalesce((v_item ->> 'weight')::integer, 1);
    exception when others then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'number:' || v_id;
    end;
    if v_max not between 2 and 10 or v_weight not between 1 and 10
       or (v_item ? 'required' and jsonb_typeof(v_item -> 'required') <> 'boolean') then
      raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'number:' || v_id;
    end if;
    v_ids := v_ids || v_id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'label', v_label, 'description', v_description, 'max', v_max, 'weight', v_weight,
      'required', coalesce((v_item ->> 'required')::boolean, true)));
  end loop;
  return v_out;
end;
$$;

create or replace function public.save_recruitment_rubric(p_campaign_id uuid, p_kind text, p_edit_version integer, p_criteria jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_criteria jsonb;
  v_draft public.recruitment_rubric_versions%rowtype;
begin
  perform private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if p_kind not in ('application', 'interview') then
    raise exception 'rubric_invalid' using errcode = 'P0001', detail = 'kind';
  end if;
  v_criteria := private.validate_rubric(p_criteria);
  select * into v_draft from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = p_kind and status = 'draft' for update;
  if found then
    if v_draft.edit_version <> coalesce(p_edit_version, -1) then
      raise exception 'draft_conflict' using errcode = 'P0001';
    end if;
    update public.recruitment_rubric_versions set criteria = v_criteria, edit_version = edit_version + 1, updated_by = v_actor
     where id = v_draft.id
    returning * into v_draft;
  else
    insert into public.recruitment_rubric_versions (campaign_id, kind, number, criteria, created_by, updated_by)
    values (p_campaign_id, p_kind,
            coalesce((select max(number) from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = p_kind), 0) + 1,
            v_criteria, v_actor, v_actor)
    returning * into v_draft;
  end if;
  return jsonb_build_object('id', v_draft.id, 'number', v_draft.number, 'edit_version', v_draft.edit_version);
end;
$$;

create or replace function public.discard_recruitment_rubric_draft(p_campaign_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  delete from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = p_kind and status = 'draft';
end;
$$;

-- The draft becomes the grid reviewers use from now on. Reviews already
-- written keep the version they were written against.
create or replace function public.publish_recruitment_rubric(p_campaign_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_draft public.recruitment_rubric_versions%rowtype;
  v_previous public.recruitment_rubric_versions%rowtype;
  v_reviews integer := 0;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  select * into v_draft from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = p_kind and status = 'draft' for update;
  if not found then
    raise exception 'rubric_not_found' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_draft.criteria) = 0 then
    raise exception 'rubric_empty' using errcode = 'P0001';
  end if;
  select * into v_previous from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = p_kind and status = 'published' for update;
  if found then
    select count(*) into v_reviews from public.recruitment_reviews where rubric_version_id = v_previous.id;
    update public.recruitment_rubric_versions set status = 'superseded', superseded_at = now() where id = v_previous.id;
  end if;
  update public.recruitment_rubric_versions set status = 'published', published_at = now(), published_by = v_actor
   where id = v_draft.id;
  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_rubric_published', 'recruitment',
    v_campaign.organization_id, null, 'recruitment_rubric', v_draft.id,
    jsonb_build_object('campaign_id', p_campaign_id, 'kind', p_kind, 'number', v_draft.number,
                       'criteria', jsonb_array_length(v_draft.criteria), 'reviews_on_previous', v_reviews));
  return jsonb_build_object('id', v_draft.id, 'number', v_draft.number, 'reviews_on_previous', v_reviews);
end;
$$;

-- ---- Reviews -------------------------------------------------------------------------------------

-- Scores kept to the criteria of the version, each an integer from 1 to its max.
create or replace function private.review_scores(p_criteria jsonb, p_scores jsonb, p_final boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c jsonb;
  v_value jsonb;
  v_out jsonb := '{}'::jsonb;
  v_n numeric;
begin
  if p_scores is not null and jsonb_typeof(p_scores) <> 'object' then
    raise exception 'score_invalid' using errcode = 'P0001';
  end if;
  for v_c in select * from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb)) loop
    v_value := coalesce(p_scores, '{}'::jsonb) -> (v_c ->> 'id');
    if v_value is null or jsonb_typeof(v_value) = 'null' then
      if p_final and (v_c ->> 'required')::boolean then
        raise exception 'score_missing' using errcode = 'P0001', detail = v_c ->> 'id';
      end if;
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'score_invalid' using errcode = 'P0001', detail = v_c ->> 'id';
    end if;
    v_n := (v_value #>> '{}')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > (v_c ->> 'max')::integer then
      raise exception 'score_invalid' using errcode = 'P0001', detail = v_c ->> 'id';
    end if;
    v_out := v_out || jsonb_build_object(v_c ->> 'id', v_n::integer);
  end loop;
  return v_out;
end;
$$;

-- The weighted result of one review, with its basis: Σ(score × weight) over
-- Σ(max × weight), counting only the criteria scored.
create or replace function private.review_total(p_criteria jsonb, p_scores jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with s as (
    select (c ->> 'weight')::numeric as w, (c ->> 'max')::numeric as m, (p_scores ->> (c ->> 'id'))::numeric as v
      from jsonb_array_elements(coalesce(p_criteria, '[]'::jsonb)) c
     where p_scores ? (c ->> 'id'))
  select case when count(*) = 0 then null
              else jsonb_build_object('points', sum(v * w), 'out_of', sum(m * w),
                                      'percent', round(100 * sum(v * w) / nullif(sum(m * w), 0), 1), 'scored', count(*)) end
    from s;
$$;

-- May this person write an assessment of this interview? An interviewer of
-- its slot, or someone who organizes the campaign's interviews, who can open
-- the application.
create or replace function private.can_assess_interview(p_user uuid, p_interview public.recruitment_interviews)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_interview.id is not null and p_interview.status in ('scheduled', 'completed', 'no_show')
     and private.application_can(p_user, (select a from public.applications a where a.id = p_interview.application_id), 'view')
     and (exists (select 1 from public.recruitment_slot_interviewers si
                   where si.slot_id = p_interview.slot_id
                     and si.member_id = private.live_committee_member_id(p_user, p_interview.campaign_id))
          or private.campaign_can(p_user, (select c from public.recruitment_campaigns c where c.id = p_interview.campaign_id), 'interviews'));
$$;

-- No more evaluation once the final outcome (offer or refusal) is released.
create or replace function private.application_decided(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.recruitment_decisions d
                  where d.application_id = p_application_id and d.status = 'released' and d.outcome in ('offer', 'reject'));
$$;

-- Save one's own draft (created on first save). An application review is
-- written against the campaign's live grid, an interview assessment against
-- the interview grid.
create or replace function public.save_recruitment_review(
  p_application_id uuid,
  p_interview_id uuid default null,
  p_scores jsonb default '{}'::jsonb,
  p_recommendation text default null,
  p_note text default null,
  p_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_kind text := case when p_interview_id is null then 'application' else 'interview' end;
  v_review public.recruitment_reviews%rowtype;
  v_rubric public.recruitment_rubric_versions%rowtype;
  v_scores jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_pipeline public.application_pipeline%rowtype;
begin
  if v_kind = 'application' then
    v_app := private.application_for(v_actor, p_application_id, 'review');
  else
    select * into v_interview from public.recruitment_interviews where id = p_interview_id and application_id = p_application_id;
    if not found or not private.can_assess_interview(v_actor, v_interview) then
      raise exception 'application_not_found' using errcode = 'P0001';
    end if;
    select * into v_app from public.applications where id = p_application_id;
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  if private.application_decided(v_app.id) then
    raise exception 'application_decided' using errcode = 'P0001';
  end if;
  if p_recommendation is not null and p_recommendation not in ('shortlist', 'interview', 'offer', 'waitlist', 'reject', 'undecided') then
    raise exception 'recommendation_invalid' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 4000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  select * into v_rubric from public.recruitment_rubric_versions
   where campaign_id = v_app.campaign_id and kind = v_kind and status = 'published';
  v_scores := private.review_scores(v_rubric.criteria, p_scores, false);

  select * into v_review from public.recruitment_reviews
   where reviewer_id = v_actor and application_id = v_app.id and kind = v_kind
     and interview_id is not distinct from p_interview_id
   for update;
  if found then
    if v_review.status = 'submitted' then
      raise exception 'review_submitted' using errcode = 'P0001';
    end if;
    if p_version is not null and p_version <> v_review.version then
      raise exception 'draft_conflict' using errcode = 'P0001';
    end if;
    update public.recruitment_reviews
       set rubric_version_id = v_rubric.id, scores = v_scores, recommendation = p_recommendation, note = v_note, version = version + 1
     where id = v_review.id
    returning * into v_review;
  else
    begin
      insert into public.recruitment_reviews
        (application_id, campaign_id, reviewer_id, kind, interview_id, rubric_version_id, scores, recommendation, note)
      values (v_app.id, v_app.campaign_id, v_actor, v_kind, p_interview_id, v_rubric.id, v_scores, p_recommendation, v_note)
      returning * into v_review;
    exception
      when unique_violation then
        raise exception 'draft_conflict' using errcode = 'P0001';
    end;
    -- The first look at a new application moves it to "under review" (the
    -- candidate's page then says it is being examined; nothing more).
    select * into v_pipeline from public.application_pipeline where application_id = v_app.id for update;
    if found and v_pipeline.stage = 'new' then
      update public.application_pipeline
         set stage = 'under_review', stage_changed_at = now(), stage_changed_by = v_actor, version = version + 1
       where application_id = v_app.id;
      perform private.log_application_activity(v_actor, v_app, 'stage_changed', jsonb_build_object('from', 'new', 'to', 'under_review'));
      if not exists (select 1 from public.application_events where application_id = v_app.id and action = 'review_started') then
        insert into public.application_events (application_id, action) values (v_app.id, 'review_started');
      end if;
    end if;
  end if;
  return jsonb_build_object('id', v_review.id, 'version', v_review.version, 'status', v_review.status,
                            'rubric_version_id', v_review.rubric_version_id, 'scores', v_review.scores);
end;
$$;

-- Submit one's draft: required criteria scored, a recommendation given. The
-- access is checked again (an appointment revoked meanwhile stops here).
create or replace function public.submit_recruitment_review(p_review_id uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_review public.recruitment_reviews%rowtype;
  v_app public.applications%rowtype;
  v_criteria jsonb;
  v_scores jsonb;
begin
  select * into v_review from public.recruitment_reviews where id = p_review_id and reviewer_id = v_actor for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
  if v_review.status = 'submitted' then
    return jsonb_build_object('id', v_review.id, 'status', 'submitted', 'already', true);
  end if;
  if v_review.version <> p_version then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  if v_review.kind = 'application' then
    v_app := private.application_for(v_actor, v_review.application_id, 'review');
  else
    if not private.can_assess_interview(v_actor, (select i from public.recruitment_interviews i where i.id = v_review.interview_id)) then
      raise exception 'application_not_found' using errcode = 'P0001';
    end if;
    select * into v_app from public.applications where id = v_review.application_id;
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  if v_review.recommendation is null then
    raise exception 'recommendation_required' using errcode = 'P0001';
  end if;
  -- Written against a grid that has since changed: it must be redone on the live one.
  if v_review.rubric_version_id is distinct from
     (select id from public.recruitment_rubric_versions where campaign_id = v_review.campaign_id and kind = v_review.kind and status = 'published') then
    raise exception 'rubric_changed' using errcode = 'P0001';
  end if;
  select criteria into v_criteria from public.recruitment_rubric_versions where id = v_review.rubric_version_id;
  v_scores := private.review_scores(v_criteria, v_review.scores, true);
  update public.recruitment_reviews
     set status = 'submitted', submitted_at = now(), scores = v_scores, revision_count = 0, version = version + 1
   where id = p_review_id
  returning * into v_review;
  insert into public.recruitment_review_revisions (review_id, number, rubric_version_id, scores, recommendation, note)
  values (v_review.id, 1, v_review.rubric_version_id, v_review.scores, v_review.recommendation, v_review.note);
  perform private.log_application_activity(v_actor, v_app,
    case when v_review.kind = 'application' then 'review_submitted' else 'interview_assessed' end, '{}'::jsonb);
  perform private.log_application_audit(v_actor, v_app, 'review',
    case when v_review.kind = 'application' then 'recruitment_review_submitted' else 'recruitment_interview_assessed' end);
  return jsonb_build_object('id', v_review.id, 'status', 'submitted', 'already', false);
end;
$$;

-- Change a submitted review: the earlier state stays in the revisions, with
-- the reason for the change.
create or replace function public.amend_recruitment_review(
  p_review_id uuid, p_scores jsonb, p_recommendation text, p_note text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_review public.recruitment_reviews%rowtype;
  v_app public.applications%rowtype;
  v_criteria jsonb;
  v_scores jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_review from public.recruitment_reviews where id = p_review_id and reviewer_id = v_actor for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
  if v_review.status <> 'submitted' then
    raise exception 'review_not_submitted' using errcode = 'P0001';
  end if;
  if v_review.kind = 'application' then
    v_app := private.application_for(v_actor, v_review.application_id, 'review');
  else
    if not private.can_assess_interview(v_actor, (select i from public.recruitment_interviews i where i.id = v_review.interview_id)) then
      raise exception 'application_not_found' using errcode = 'P0001';
    end if;
    select * into v_app from public.applications where id = v_review.application_id;
  end if;
  if private.application_decided(v_app.id) then
    raise exception 'application_decided' using errcode = 'P0001';
  end if;
  if p_recommendation is null or p_recommendation not in ('shortlist', 'interview', 'offer', 'waitlist', 'reject', 'undecided') then
    raise exception 'recommendation_required' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 4000 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  select criteria into v_criteria from public.recruitment_rubric_versions where id = v_review.rubric_version_id;
  v_scores := private.review_scores(v_criteria, p_scores, true);
  update public.recruitment_reviews
     set scores = v_scores, recommendation = p_recommendation, note = v_note, revision_count = revision_count + 1,
         amended_at = now(), version = version + 1
   where id = p_review_id
  returning * into v_review;
  insert into public.recruitment_review_revisions (review_id, number, rubric_version_id, scores, recommendation, note, reason)
  values (v_review.id, v_review.revision_count + 1, v_review.rubric_version_id, v_review.scores, v_review.recommendation,
          v_review.note, v_reason);
  perform private.log_application_activity(v_actor, v_app, 'review_amended', jsonb_build_object('reason', v_reason));
  perform private.log_application_audit(v_actor, v_app, 'review', 'recruitment_review_amended', '{}'::jsonb, v_reason);
  return jsonb_build_object('id', v_review.id, 'revision', v_review.revision_count + 1);
end;
$$;

create or replace function public.delete_recruitment_review_draft(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  delete from public.recruitment_reviews where id = p_review_id and reviewer_id = v_actor and status = 'draft';
  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---- Conflicts of interest -------------------------------------------------------------------------

-- "I know this candidate" (or any other reason): from now on the person can
-- no longer open, evaluate or decide on this application; their assignment
-- to it ends so the manager can give it to someone else.
create or replace function public.declare_recruitment_conflict(p_application_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_id uuid;
begin
  v_app := private.application_for(v_actor, p_application_id, 'view');
  insert into public.recruitment_conflicts (application_id, campaign_id, user_id, note)
  values (v_app.id, v_app.campaign_id, v_actor, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;
  update public.recruitment_review_assignments ra set removed_at = now(), removed_by = v_actor
    from public.recruitment_committee_members cm
   where ra.member_id = cm.id and cm.user_id = v_actor and ra.application_id = v_app.id and ra.removed_at is null;
  perform private.log_application_activity(v_actor, v_app, 'conflict_declared', '{}'::jsonb);
  perform private.log_governance_event(
    v_actor, 'self', 'recruitment_conflict_declared', 'recruitment',
    (select organization_id from public.recruitment_campaigns where id = v_app.campaign_id), v_actor, 'application', v_app.id,
    jsonb_build_object('campaign_id', v_app.campaign_id));
  return v_id;
end;
$$;

-- A manager settles it: "cleared" (no real conflict: the access comes back)
-- or "reassigned" (the person stays out of this application for good).
create or replace function public.resolve_recruitment_conflict(p_conflict_id uuid, p_resolution text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_conflict public.recruitment_conflicts%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_conflict from public.recruitment_conflicts where id = p_conflict_id for update;
  if not found or v_conflict.status not in ('open', 'reassigned') then
    raise exception 'conflict_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_with(v_actor, v_conflict.campaign_id, 'committee');
  if v_conflict.user_id = v_actor then
    raise exception 'cannot_resolve_own_conflict' using errcode = 'P0001';
  end if;
  if p_resolution not in ('cleared', 'reassigned') or (v_conflict.status = 'reassigned' and p_resolution = 'reassigned') then
    raise exception 'resolution_invalid' using errcode = 'P0001';
  end if;
  update public.recruitment_conflicts
     set status = p_resolution, resolved_at = now(), resolved_by = v_actor, resolution = v_reason
   where id = p_conflict_id;
  select * into v_app from public.applications where id = v_conflict.application_id;
  perform private.log_application_activity(v_actor, v_app, 'conflict_resolved',
    jsonb_build_object('resolution', p_resolution, 'person_name', private.person_name(v_conflict.user_id)));
  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, v_conflict.campaign_id, 'committee'), 'recruitment_conflict_resolved', 'recruitment',
    (select organization_id from public.recruitment_campaigns where id = v_conflict.campaign_id), v_conflict.user_id,
    'application', v_conflict.application_id, jsonb_build_object('campaign_id', v_conflict.campaign_id, 'resolution', p_resolution),
    v_reason);
end;
$$;

-- ---- Tags ---------------------------------------------------------------------------------------------

create or replace function public.create_recruitment_tag(p_campaign_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  perform private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if char_length(v_label) not between 2 and 40 or v_label ~ '[[:cntrl:]]' then
    raise exception 'tag_invalid' using errcode = 'P0001';
  end if;
  if (select count(*) from public.recruitment_tags where campaign_id = p_campaign_id) >= 30 then
    raise exception 'tag_limit' using errcode = 'P0001';
  end if;
  begin
    insert into public.recruitment_tags (campaign_id, label, created_by) values (p_campaign_id, v_label, v_actor) returning id into v_id;
  exception
    when unique_violation then
      raise exception 'tag_exists' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

create or replace function public.delete_recruitment_tag(p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_tag public.recruitment_tags%rowtype;
begin
  select * into v_tag from public.recruitment_tags where id = p_tag_id;
  if not found then
    raise exception 'tag_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_with(v_actor, v_tag.campaign_id, 'committee');
  delete from public.recruitment_tags where id = p_tag_id;
end;
$$;

create or replace function public.set_application_tag(p_application_id uuid, p_tag_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
begin
  v_app := private.application_for(v_actor, p_application_id, 'review');
  if not exists (select 1 from public.recruitment_tags where id = p_tag_id and campaign_id = v_app.campaign_id) then
    raise exception 'tag_not_found' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.application_tags (application_id, tag_id, campaign_id, added_by)
    values (v_app.id, p_tag_id, v_app.campaign_id, v_actor)
    on conflict do nothing;
  else
    delete from public.application_tags where application_id = v_app.id and tag_id = p_tag_id;
  end if;
end;
$$;

-- ---- Internal discussion ---------------------------------------------------------------------------

-- Committee members who can read the team's work on this application talk
-- here. A mention notifies only people who can read it too.
create or replace function public.post_application_comment(p_application_id uuid, p_body text, p_mentions uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_mentions uuid[] := array(select distinct x from unnest(coalesce(p_mentions, '{}'::uuid[])) x where x is not null and x <> v_actor);
  v_user uuid;
  v_id uuid;
begin
  v_app := private.application_for(v_actor, p_application_id, 'view_team');
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'comment_invalid' using errcode = 'P0001';
  end if;
  if cardinality(v_mentions) > 10 then
    raise exception 'mention_not_allowed' using errcode = 'P0001';
  end if;
  foreach v_user in array v_mentions loop
    if not private.application_can(v_user, v_app, 'view_team') then
      raise exception 'mention_not_allowed' using errcode = 'P0001';
    end if;
  end loop;
  insert into public.application_comments (application_id, campaign_id, author_id, body, mentions)
  values (v_app.id, v_app.campaign_id, v_actor, v_body, v_mentions)
  returning id into v_id;
  foreach v_user in array v_mentions loop
    perform private.enqueue_team_message(v_user, v_app, 'recruitment_mention', 'mention:' || v_id || ':' || v_user,
      jsonb_build_object('by_name', private.person_name(v_actor)));
  end loop;
  return v_id;
end;
$$;

create or replace function public.retract_application_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  update public.application_comments set retracted_at = now()
   where id = p_comment_id and author_id = v_actor and retracted_at is null;
  if not found then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---- The pipeline --------------------------------------------------------------------------------------

-- Move applications to "under review" or "shortlisted" (or back). Each one is
-- checked on its own; "interview" comes from an invitation, never from here.
create or replace function public.move_recruitment_applications(p_application_ids uuid[], p_stage text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_pipeline public.application_pipeline%rowtype;
  v_id uuid;
  v_moved integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  if p_stage not in ('under_review', 'shortlisted') then
    raise exception 'stage_invalid' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_application_ids, '{}')) not between 1 and 500 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  foreach v_id in array array(select distinct x from unnest(p_application_ids) x) loop
    select * into v_app from public.applications where id = v_id;
    if not found or not private.application_can(v_actor, v_app, 'shortlist') then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'application_not_found');
      continue;
    end if;
    if v_app.status <> 'submitted' then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'application_withdrawn');
      continue;
    end if;
    if exists (select 1 from public.recruitment_decisions d where d.application_id = v_id and d.status in ('finalized', 'released')) then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'decision_made');
      continue;
    end if;
    select * into v_pipeline from public.application_pipeline where application_id = v_id for update;
    if v_pipeline.stage = p_stage then
      continue;
    end if;
    if v_pipeline.stage = 'interview'
       and exists (select 1 from public.recruitment_interviews i where i.application_id = v_id and i.status in ('invited', 'scheduled')) then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'interview_pending');
      continue;
    end if;
    update public.application_pipeline
       set stage = p_stage, stage_changed_at = now(), stage_changed_by = v_actor, version = version + 1
     where application_id = v_id;
    perform private.log_application_activity(v_actor, v_app, 'stage_changed', jsonb_build_object('from', v_pipeline.stage, 'to', p_stage));
    if p_stage = 'shortlisted' then
      perform private.log_application_audit(v_actor, v_app, 'shortlist', 'recruitment_application_shortlisted');
    end if;
    if v_pipeline.stage = 'new' and not exists (select 1 from public.application_events where application_id = v_id and action = 'review_started') then
      insert into public.application_events (application_id, action) values (v_id, 'review_started');
    end if;
    v_moved := v_moved + 1;
  end loop;
  return jsonb_build_object('moved', v_moved, 'skipped', v_skipped);
end;
$$;

-- ---- Grants -------------------------------------------------------------------------------------------

revoke all on function private.recruitment_power_key(text) from public, anon, authenticated, service_role;
revoke all on function private.recruitment_powers() from public, anon, authenticated, service_role;
revoke all on function private.campaign_sealed_at(public.recruitment_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.recruitment_key_route(uuid, public.recruitment_campaigns, text) from public, anon, authenticated, service_role;
revoke all on function private.live_committee_member_id(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.candidate_in_campaign(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.campaign_can(uuid, public.recruitment_campaigns, text) from public, anon, authenticated, service_role;
revoke all on function private.application_can(uuid, public.applications, text) from public, anon, authenticated, service_role;
revoke all on function private.application_for(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.campaign_with(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.recruitment_authority(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.application_users_with(public.applications, text) from public, anon, authenticated, service_role;
revoke all on function private.log_application_activity(uuid, public.applications, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.log_application_audit(uuid, public.applications, text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.team_message_payload(public.applications) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_team_message(uuid, public.applications, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.committee_powers(uuid, public.recruitment_campaigns, text[]) from public, anon, authenticated, service_role;
revoke all on function private.committee_scope_positions(uuid, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.validate_rubric(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.review_scores(jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
revoke all on function private.review_total(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.can_assess_interview(uuid, public.recruitment_interviews) from public, anon, authenticated, service_role;
revoke all on function private.application_decided(uuid) from public, anon, authenticated, service_role;

revoke all on function public.appoint_recruitment_member(uuid, uuid, text, text[], text, uuid[], timestamptz, text) from public, anon;
revoke all on function public.update_recruitment_member(uuid, text, text[], text, uuid[], timestamptz) from public, anon;
revoke all on function public.revoke_recruitment_member(uuid, text) from public, anon;
revoke all on function public.assign_recruitment_reviews(uuid, uuid[], uuid[], text) from public, anon;
revoke all on function public.unassign_recruitment_review(uuid) from public, anon;
revoke all on function public.set_recruitment_review_policy(uuid, integer, text) from public, anon;
revoke all on function public.save_recruitment_rubric(uuid, text, integer, jsonb) from public, anon;
revoke all on function public.discard_recruitment_rubric_draft(uuid, text) from public, anon;
revoke all on function public.publish_recruitment_rubric(uuid, text) from public, anon;
revoke all on function public.save_recruitment_review(uuid, uuid, jsonb, text, text, integer) from public, anon;
revoke all on function public.submit_recruitment_review(uuid, integer) from public, anon;
revoke all on function public.amend_recruitment_review(uuid, jsonb, text, text, text) from public, anon;
revoke all on function public.delete_recruitment_review_draft(uuid) from public, anon;
revoke all on function public.declare_recruitment_conflict(uuid, text) from public, anon;
revoke all on function public.resolve_recruitment_conflict(uuid, text, text) from public, anon;
revoke all on function public.create_recruitment_tag(uuid, text) from public, anon;
revoke all on function public.delete_recruitment_tag(uuid) from public, anon;
revoke all on function public.set_application_tag(uuid, uuid, boolean) from public, anon;
revoke all on function public.post_application_comment(uuid, text, uuid[]) from public, anon;
revoke all on function public.retract_application_comment(uuid) from public, anon;
revoke all on function public.move_recruitment_applications(uuid[], text) from public, anon;

grant execute on function public.appoint_recruitment_member(uuid, uuid, text, text[], text, uuid[], timestamptz, text) to authenticated;
grant execute on function public.update_recruitment_member(uuid, text, text[], text, uuid[], timestamptz) to authenticated;
grant execute on function public.revoke_recruitment_member(uuid, text) to authenticated;
grant execute on function public.assign_recruitment_reviews(uuid, uuid[], uuid[], text) to authenticated;
grant execute on function public.unassign_recruitment_review(uuid) to authenticated;
grant execute on function public.set_recruitment_review_policy(uuid, integer, text) to authenticated;
grant execute on function public.save_recruitment_rubric(uuid, text, integer, jsonb) to authenticated;
grant execute on function public.discard_recruitment_rubric_draft(uuid, text) to authenticated;
grant execute on function public.publish_recruitment_rubric(uuid, text) to authenticated;
grant execute on function public.save_recruitment_review(uuid, uuid, jsonb, text, text, integer) to authenticated;
grant execute on function public.submit_recruitment_review(uuid, integer) to authenticated;
grant execute on function public.amend_recruitment_review(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.delete_recruitment_review_draft(uuid) to authenticated;
grant execute on function public.declare_recruitment_conflict(uuid, text) to authenticated;
grant execute on function public.resolve_recruitment_conflict(uuid, text, text) to authenticated;
grant execute on function public.create_recruitment_tag(uuid, text) to authenticated;
grant execute on function public.delete_recruitment_tag(uuid) to authenticated;
grant execute on function public.set_application_tag(uuid, uuid, boolean) to authenticated;
grant execute on function public.post_application_comment(uuid, text, uuid[]) to authenticated;
grant execute on function public.retract_application_comment(uuid) to authenticated;
grant execute on function public.move_recruitment_applications(uuid[], text) to authenticated;
