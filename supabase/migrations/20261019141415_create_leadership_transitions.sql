-- Phase 4 · Leadership transitions: the only way a protected office changes
-- hands.
--
-- Kinds:
--   association_succession  the sitting association president proposes a
--                           successor, who accepts. Routine handover.
--   association_appointment BDE leadership names an association president:
--                           the first one, or an emergency replacement
--                           (reason required). The candidate accepts.
--   bde_succession          the BDE president or vice-president proposes the
--                           next president and/or vice-president. Needs the
--                           approval of BOTH sitting officeholders (two
--                           different people), then every candidate's
--                           acceptance. If exactly one office is vacant, the
--                           continuity guardian's approval stands in for it.
--   bde_recovery            break-glass: the continuity guardian fills a
--                           VACANT BDE office (reason required). Never
--                           themselves, never an occupied office.
--
-- A transition completes in the same transaction as the last required step
-- (acceptance or approval). Completion is atomic: the outgoing mandates end
-- at the effective moment and the incoming ones start then. A future
-- effective moment is simply a mandate that starts later: no scheduled job
-- is needed for the handover to happen on time. A declined candidacy cancels
-- the transition; an expired one can never complete; one open transition
-- per organization at a time (competing requests are refused).
--
-- Every step requires a second-factor session (aal2), except declining.

create table public.leadership_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint leadership_transitions_organization_id_fkey references public.organizations (id) on delete restrict,
  kind text not null
    constraint leadership_transitions_kind_check
    check (kind in ('association_succession', 'association_appointment', 'bde_succession', 'bde_recovery')),
  -- open · completed (the new mandates exist; they may start later) ·
  -- cancelled · expired (lapsed before completion).
  status text not null default 'open'
    constraint leadership_transitions_status_check
    check (status in ('open', 'completed', 'cancelled', 'expired')),
  proposed_by uuid not null
    constraint leadership_transitions_proposed_by_fkey references auth.users (id) on delete restrict,
  reason text
    constraint leadership_transitions_reason_check check (char_length(reason) between 3 and 500),
  effective_at timestamptz not null,
  mandate_ends_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint leadership_transitions_cancelled_by_fkey references auth.users (id) on delete restrict,
  cancel_reason text
    constraint leadership_transitions_cancel_reason_check check (char_length(cancel_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leadership_transitions_period_check check (mandate_ends_at > effective_at),
  constraint leadership_transitions_max_length_check check (mandate_ends_at <= effective_at + interval '13 months'),
  constraint leadership_transitions_completed_check check ((status = 'completed') = (completed_at is not null)),
  constraint leadership_transitions_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint leadership_transitions_reason_required_check
    check (kind not in ('association_appointment', 'bde_recovery') or reason is not null)
);

comment on table public.leadership_transitions is
  'Proposed changes of a protected office. Completion creates the mandates atomically; one open transition per organization.';

create unique index leadership_transitions_one_open_per_organization_idx
  on public.leadership_transitions (organization_id)
  where status = 'open';
create index leadership_transitions_organization_id_idx on public.leadership_transitions (organization_id, created_at desc);
create index leadership_transitions_proposed_by_idx on public.leadership_transitions (proposed_by);
create index leadership_transitions_cancelled_by_idx on public.leadership_transitions (cancelled_by);

create trigger set_updated_at
  before update on public.leadership_transitions
  for each row execute function private.set_updated_at();

create table public.leadership_transition_candidates (
  transition_id uuid not null
    constraint leadership_transition_candidates_transition_id_fkey
    references public.leadership_transitions (id) on delete cascade,
  office text not null
    constraint leadership_transition_candidates_office_check
    check (office in ('association_president', 'bde_president', 'bde_vice_president')),
  user_id uuid not null
    constraint leadership_transition_candidates_user_id_fkey references auth.users (id) on delete restrict,
  accepted boolean,
  responded_at timestamptz,
  constraint leadership_transition_candidates_pkey primary key (transition_id, office),
  -- The incoming president and vice-president are two different people.
  constraint leadership_transition_candidates_transition_id_user_id_key unique (transition_id, user_id),
  constraint leadership_transition_candidates_responded_check check ((accepted is null) = (responded_at is null))
);

create index leadership_transition_candidates_user_id_idx on public.leadership_transition_candidates (user_id);

create table public.leadership_transition_approvals (
  transition_id uuid not null
    constraint leadership_transition_approvals_transition_id_fkey
    references public.leadership_transitions (id) on delete cascade,
  -- The capacity the approver acted in, checked again at completion.
  capacity text not null
    constraint leadership_transition_approvals_capacity_check
    check (capacity in ('bde_president', 'bde_vice_president', 'guardian')),
  approver_user_id uuid not null
    constraint leadership_transition_approvals_approver_user_id_fkey references auth.users (id) on delete restrict,
  approved_at timestamptz not null default now(),
  constraint leadership_transition_approvals_pkey primary key (transition_id, capacity),
  -- One person never counts as two approvals.
  constraint leadership_transition_approvals_transition_id_approver_key unique (transition_id, approver_user_id)
);

create index leadership_transition_approvals_approver_user_id_idx on public.leadership_transition_approvals (approver_user_id);

alter table public.leadership_transitions enable row level security;
alter table public.leadership_transition_candidates enable row level security;
alter table public.leadership_transition_approvals enable row level security;
revoke all on public.leadership_transitions, public.leadership_transition_candidates, public.leadership_transition_approvals
  from anon, authenticated;

-- The people involved; the organization's governance viewers; platform governance.
create or replace function private.my_transition_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.leadership_transitions t where t.proposed_by = (select auth.uid())
  union
  select c.transition_id from public.leadership_transition_candidates c where c.user_id = (select auth.uid())
  union
  select a.transition_id from public.leadership_transition_approvals a where a.approver_user_id = (select auth.uid());
$$;

revoke all on function private.my_transition_ids() from public, anon, authenticated, service_role;
grant execute on function private.my_transition_ids() to authenticated;

create policy leadership_transitions_read_parties
  on public.leadership_transitions for select to authenticated
  using (id in (select private.my_transition_ids()));
create policy leadership_transitions_read_organization
  on public.leadership_transitions for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('governance.view')));
create policy leadership_transitions_read_platform_governance
  on public.leadership_transitions for select to authenticated
  using ((select private.has_platform_permission('platform.governance.view')));
create policy leadership_transitions_require_mfa_when_enrolled
  on public.leadership_transitions as restrictive for select to authenticated
  using ((select private.mfa_requirement_met()));

create policy leadership_transition_candidates_read
  on public.leadership_transition_candidates for select to authenticated
  using (transition_id in (select t.id from public.leadership_transitions t));
create policy leadership_transition_approvals_read
  on public.leadership_transition_approvals for select to authenticated
  using (transition_id in (select t.id from public.leadership_transitions t));

grant select on public.leadership_transitions, public.leadership_transition_candidates, public.leadership_transition_approvals
  to authenticated;

-- ---- Internals ------------------------------------------------------------------

create or replace function private.expire_lapsed_transitions(p_organization_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.leadership_transitions
     set status = 'expired'
   where organization_id = p_organization_id and status = 'open' and expires_at <= now();
$$;

-- Validates a mandate window for a new office holder.
create or replace function private.require_office_period(p_effective_at timestamptz, p_mandate_ends_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_effective timestamptz := greatest(coalesce(p_effective_at, now()), now());
begin
  if p_mandate_ends_at is null or p_mandate_ends_at <= v_effective
     or p_mandate_ends_at > v_effective + interval '13 months'
     or v_effective > now() + interval '6 months' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  return v_effective;
end;
$$;

-- A candidate is an existing account, not suspended in the organization.
create or replace function private.require_candidate(p_organization_id uuid, p_email text, p_actor uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.user_id_by_email(p_email);
begin
  if v_user is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if v_user = p_actor then
    raise exception 'candidate_not_allowed' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.memberships
     where organization_id = p_organization_id and user_id = v_user and status = 'suspended'
  ) then
    raise exception 'candidate_suspended' using errcode = 'P0001';
  end if;
  return v_user;
end;
$$;

-- Completes an open transition when every condition holds at this moment;
-- otherwise leaves it open (or raises when it can no longer complete).
-- Called with the transition row already locked by the caller.
create or replace function private.try_complete_transition(p_transition_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_t public.leadership_transitions%rowtype;
  v_bde uuid := private.bde_organization_id();
  v_effective timestamptz;
  v_holder uuid;
  v_vacant int := 0;
  v_guardian uuid := private.guardian_user(now());
  v_office text;
  v_candidate record;
  v_position_id uuid;
  v_membership public.memberships%rowtype;
  v_source text;
  v_offices jsonb := '[]'::jsonb;
begin
  select * into v_t from public.leadership_transitions where id = p_transition_id for update;
  if v_t.status <> 'open' then
    return v_t.status;
  end if;
  if v_t.expires_at <= now() then
    raise exception 'transition_expired' using errcode = 'P0001';
  end if;
  -- Every candidate has accepted.
  if exists (
    select 1 from public.leadership_transition_candidates
     where transition_id = p_transition_id and accepted is not true
  ) then
    return 'open';
  end if;
  if (select status from public.organizations where id = v_t.organization_id) not in ('active', 'setup') then
    raise exception 'organization_inactive' using errcode = 'P0001';
  end if;

  -- The proposer's authority still stands, and the approvals are valid now.
  if v_t.kind = 'association_succession' then
    if private.office_holder(v_t.organization_id, 'association_president', now()) is distinct from v_t.proposed_by then
      raise exception 'proposer_lost_authority' using errcode = 'P0001';
    end if;
  elsif v_t.kind = 'association_appointment' then
    if not private.user_has_platform_permission(v_t.proposed_by, 'platform.associations.intervene', now()) then
      raise exception 'proposer_lost_authority' using errcode = 'P0001';
    end if;
  elsif v_t.kind = 'bde_recovery' then
    if v_guardian is distinct from v_t.proposed_by then
      raise exception 'proposer_lost_authority' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.leadership_transition_candidates c
       where c.transition_id = p_transition_id and private.office_holder(v_bde, c.office, now()) is not null
    ) then
      raise exception 'office_occupied' using errcode = 'P0001';
    end if;
  elsif v_t.kind = 'bde_succession' then
    foreach v_office in array array['bde_president', 'bde_vice_president'] loop
      v_holder := private.office_holder(v_bde, v_office, now());
      if v_holder is null then
        v_vacant := v_vacant + 1;
      elsif not exists (
        select 1 from public.leadership_transition_approvals
         where transition_id = p_transition_id and capacity = v_office and approver_user_id = v_holder
      ) then
        return 'open';
      end if;
    end loop;
    if v_vacant = 2 then
      raise exception 'bde_leadership_vacant' using errcode = 'P0001';
    end if;
    if v_vacant = 1 and (
      v_guardian is null or not exists (
        select 1 from public.leadership_transition_approvals
         where transition_id = p_transition_id and capacity = 'guardian' and approver_user_id = v_guardian
      )
    ) then
      return 'open';
    end if;
  end if;

  v_effective := greatest(v_t.effective_at, now());
  if v_t.mandate_ends_at <= v_effective then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  v_source := case v_t.kind
    when 'association_succession' then 'succession'
    when 'bde_succession' then 'succession'
    when 'association_appointment' then 'emergency'
    else 'recovery'
  end;

  -- 1. Outgoing mandates of every office being filled end at the effective
  --    moment; scheduled ones that would overlap the new mandate are
  --    cancelled (a later one, e.g. an approved successor after an interim,
  --    is kept). All before any new mandate, so a vice-president can become
  --    president in the same handover.
  for v_candidate in
    select c.office, c.user_id from public.leadership_transition_candidates c where c.transition_id = p_transition_id
  loop
    select p.id into v_position_id
      from public.positions p
     where p.organization_id = v_t.organization_id and p.office = v_candidate.office;
    update public.position_assignments
       set status = 'cancelled', ended_by = v_actor, end_reason = 'leadership_transition'
     where position_id = v_position_id and status = 'active'
       and starts_at >= v_effective and starts_at < v_t.mandate_ends_at;
    update public.position_assignments
       set ends_at = v_effective,
           status = case when v_effective <= now() then 'ended' else 'active' end,
           ended_by = v_actor,
           end_reason = 'leadership_transition'
     where position_id = v_position_id and status = 'active' and starts_at < v_effective and ends_at > v_effective;
  end loop;

  -- 2. Incoming mandates, with a membership when the candidate has none.
  for v_candidate in
    select c.office, c.user_id from public.leadership_transition_candidates c where c.transition_id = p_transition_id
  loop
    select p.id into v_position_id
      from public.positions p
     where p.organization_id = v_t.organization_id and p.office = v_candidate.office;
    select * into v_membership
      from public.memberships
     where organization_id = v_t.organization_id and user_id = v_candidate.user_id and status <> 'ended'
     for update;
    if found and v_membership.status = 'suspended' then
      raise exception 'candidate_suspended' using errcode = 'P0001';
    end if;
    if not found then
      insert into public.memberships (organization_id, user_id, status)
      values (v_t.organization_id, v_candidate.user_id, 'active')
      returning * into v_membership;
    end if;
    begin
      insert into public.position_assignments
        (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source, appointed_by)
      values
        (v_t.organization_id, v_membership.id, v_candidate.user_id, v_position_id, v_effective, v_t.mandate_ends_at,
         v_source, v_t.proposed_by);
    exception
      when exclusion_violation then
        raise exception 'transition_conflict' using errcode = 'P0001';
    end;
    v_offices := v_offices || jsonb_build_object('office', v_candidate.office, 'user_id', v_candidate.user_id);
  end loop;

  update public.leadership_transitions
     set status = 'completed', completed_at = now()
   where id = p_transition_id;

  perform private.log_governance_event(
    v_actor, 'self', 'leadership_transition_completed',
    case when v_t.kind = 'bde_recovery' then 'recovery' else 'leadership' end,
    v_t.organization_id, null, 'transition', p_transition_id,
    jsonb_build_object('kind', v_t.kind, 'offices', v_offices, 'effective_at', v_effective, 'mandate_ends_at', v_t.mandate_ends_at),
    v_t.reason
  );
  return 'completed';
end;
$$;

revoke all on function private.expire_lapsed_transitions(uuid) from public, anon, authenticated, service_role;
revoke all on function private.require_office_period(timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.require_candidate(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.try_complete_transition(uuid) from public, anon, authenticated, service_role;

-- ---- Proposals ------------------------------------------------------------------

-- Routine association handover, by the sitting president.
create or replace function public.propose_association_succession(
  p_organization_id uuid,
  p_candidate_email text,
  p_mandate_ends_at timestamptz,
  p_effective_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_effective timestamptz;
  v_candidate uuid;
  v_transition_id uuid;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  if not found or v_org.kind <> 'association' then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  if private.office_holder(p_organization_id, 'association_president', now()) is distinct from v_actor
     or not private.user_has_organization_permission(v_actor, p_organization_id, 'governance.succession', now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.require_aal2();
  v_effective := private.require_office_period(p_effective_at, p_mandate_ends_at);
  v_candidate := private.require_candidate(p_organization_id, p_candidate_email, v_actor);

  perform private.expire_lapsed_transitions(p_organization_id);
  begin
    insert into public.leadership_transitions
      (organization_id, kind, proposed_by, effective_at, mandate_ends_at, expires_at)
    values
      (p_organization_id, 'association_succession', v_actor, v_effective, p_mandate_ends_at, now() + interval '14 days')
    returning id into v_transition_id;
  exception
    when unique_violation then
      raise exception 'transition_conflict' using errcode = 'P0001';
  end;
  insert into public.leadership_transition_candidates (transition_id, office, user_id)
  values (v_transition_id, 'association_president', v_candidate);

  perform private.log_governance_event(
    v_actor, 'position', 'association_succession_started', 'leadership', p_organization_id, v_candidate,
    'transition', v_transition_id, jsonb_build_object('effective_at', v_effective, 'mandate_ends_at', p_mandate_ends_at)
  );
  return v_transition_id;
end;
$$;

-- BDE leadership names an association president: the first one, or an
-- emergency replacement. Always with a written reason; never themselves.
create or replace function public.propose_association_appointment(
  p_organization_id uuid,
  p_candidate_email text,
  p_reason text,
  p_mandate_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_org public.organizations%rowtype;
  v_effective timestamptz;
  v_candidate uuid;
  v_transition_id uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.associations.intervene');
  perform private.require_aal2();
  select * into v_org from public.organizations where id = p_organization_id;
  if not found or v_org.kind <> 'association' then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  if v_org.status not in ('active', 'setup') then
    raise exception 'organization_inactive' using errcode = 'P0001';
  end if;
  v_effective := private.require_office_period(now(), p_mandate_ends_at);
  v_candidate := private.require_candidate(p_organization_id, p_candidate_email, v_actor);

  perform private.expire_lapsed_transitions(p_organization_id);
  begin
    insert into public.leadership_transitions
      (organization_id, kind, proposed_by, reason, effective_at, mandate_ends_at, expires_at)
    values
      (p_organization_id, 'association_appointment', v_actor, v_reason, v_effective, p_mandate_ends_at, now() + interval '14 days')
    returning id into v_transition_id;
  exception
    when unique_violation then
      raise exception 'transition_conflict' using errcode = 'P0001';
  end;
  insert into public.leadership_transition_candidates (transition_id, office, user_id)
  values (v_transition_id, 'association_president', v_candidate);

  perform private.log_governance_event(
    v_actor, 'bde', 'association_appointment_started', 'leadership', p_organization_id, v_candidate,
    'transition', v_transition_id, jsonb_build_object('mandate_ends_at', p_mandate_ends_at), v_reason
  );
  return v_transition_id;
end;
$$;

-- The next BDE president and/or vice-president, proposed by a sitting
-- officeholder. Approvals come separately, from both of them.
create or replace function public.propose_bde_succession(
  p_president_email text,
  p_vice_president_email text,
  p_mandate_ends_at timestamptz,
  p_effective_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_bde uuid := private.bde_organization_id();
  v_effective timestamptz;
  v_president uuid;
  v_vice uuid;
  v_guardian uuid := private.guardian_user(now());
  v_transition_id uuid;
begin
  if v_actor not in (
       coalesce(private.office_holder(v_bde, 'bde_president', now()), '00000000-0000-0000-0000-000000000000'::uuid),
       coalesce(private.office_holder(v_bde, 'bde_vice_president', now()), '00000000-0000-0000-0000-000000000000'::uuid)
     )
     or not private.user_has_platform_permission(v_actor, 'platform.bde.succession', now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.require_aal2();
  v_effective := private.require_office_period(p_effective_at, p_mandate_ends_at);

  if nullif(btrim(p_president_email), '') is null and nullif(btrim(p_vice_president_email), '') is null then
    raise exception 'candidate_required' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_president_email), '') is not null then
    v_president := private.user_id_by_email(p_president_email);
    if v_president is null then
      raise exception 'user_not_found' using errcode = 'P0001';
    end if;
  end if;
  if nullif(btrim(p_vice_president_email), '') is not null then
    v_vice := private.user_id_by_email(p_vice_president_email);
    if v_vice is null then
      raise exception 'user_not_found' using errcode = 'P0001';
    end if;
  end if;
  if v_president = v_vice then
    raise exception 'candidates_must_differ' using errcode = 'P0001';
  end if;
  -- The guardian stays outside BDE leadership.
  if v_guardian is not null and v_guardian in (v_president, v_vice) then
    raise exception 'candidate_not_allowed' using errcode = 'P0001';
  end if;
  -- Someone who keeps the other office through the handover cannot also
  -- take this one (the two offices are always two people).
  if v_president is not null and v_vice is null
     and private.office_holder(v_bde, 'bde_vice_president', v_effective) = v_president then
    raise exception 'candidate_holds_other_office' using errcode = 'P0001';
  end if;
  if v_vice is not null and v_president is null
     and private.office_holder(v_bde, 'bde_president', v_effective) = v_vice then
    raise exception 'candidate_holds_other_office' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.memberships
     where organization_id = v_bde and user_id in (v_president, v_vice) and status = 'suspended'
  ) then
    raise exception 'candidate_suspended' using errcode = 'P0001';
  end if;

  perform private.expire_lapsed_transitions(v_bde);
  begin
    insert into public.leadership_transitions (organization_id, kind, proposed_by, effective_at, mandate_ends_at, expires_at)
    values (v_bde, 'bde_succession', v_actor, v_effective, p_mandate_ends_at, now() + interval '30 days')
    returning id into v_transition_id;
  exception
    when unique_violation then
      raise exception 'transition_conflict' using errcode = 'P0001';
  end;
  if v_president is not null then
    insert into public.leadership_transition_candidates (transition_id, office, user_id)
    values (v_transition_id, 'bde_president', v_president);
  end if;
  if v_vice is not null then
    insert into public.leadership_transition_candidates (transition_id, office, user_id)
    values (v_transition_id, 'bde_vice_president', v_vice);
  end if;

  perform private.log_governance_event(
    v_actor, 'bde', 'bde_succession_started', 'leadership', v_bde, null, 'transition', v_transition_id,
    jsonb_build_object('president', v_president, 'vice_president', v_vice, 'effective_at', v_effective,
                       'mandate_ends_at', p_mandate_ends_at)
  );
  return v_transition_id;
end;
$$;

-- Break-glass: the continuity guardian fills a vacant BDE office.
create or replace function public.propose_bde_recovery(
  p_office text,
  p_candidate_email text,
  p_reason text,
  p_mandate_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_bde uuid := private.bde_organization_id();
  v_effective timestamptz;
  v_candidate uuid;
  v_transition_id uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.recovery');
  perform private.require_aal2();
  if p_office not in ('bde_president', 'bde_vice_president') then
    raise exception 'invalid_office' using errcode = 'P0001';
  end if;
  if private.office_holder(v_bde, p_office, now()) is not null then
    raise exception 'office_occupied' using errcode = 'P0001';
  end if;
  v_effective := private.require_office_period(now(), p_mandate_ends_at);
  v_candidate := private.require_candidate(v_bde, p_candidate_email, v_actor);
  if private.office_holder(v_bde, case p_office when 'bde_president' then 'bde_vice_president' else 'bde_president' end, now())
     = v_candidate then
    raise exception 'candidate_holds_other_office' using errcode = 'P0001';
  end if;

  perform private.expire_lapsed_transitions(v_bde);
  begin
    insert into public.leadership_transitions
      (organization_id, kind, proposed_by, reason, effective_at, mandate_ends_at, expires_at)
    values
      (v_bde, 'bde_recovery', v_actor, v_reason, v_effective, p_mandate_ends_at, now() + interval '14 days')
    returning id into v_transition_id;
  exception
    when unique_violation then
      raise exception 'transition_conflict' using errcode = 'P0001';
  end;
  insert into public.leadership_transition_candidates (transition_id, office, user_id)
  values (v_transition_id, p_office, v_candidate);

  perform private.log_governance_event(
    v_actor, 'guardian', 'guardian_recovery_started', 'recovery', v_bde, v_candidate, 'transition', v_transition_id,
    jsonb_build_object('office', p_office, 'mandate_ends_at', p_mandate_ends_at), v_reason
  );
  return v_transition_id;
end;
$$;

-- ---- Steps ----------------------------------------------------------------------

-- A candidate accepts (aal2) or declines. Declining cancels the transition.
create or replace function public.respond_to_leadership_candidacy(p_transition_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_t public.leadership_transitions%rowtype;
  v_candidate public.leadership_transition_candidates%rowtype;
begin
  select * into v_t from public.leadership_transitions where id = p_transition_id for update;
  if not found then
    raise exception 'transition_not_found' using errcode = 'P0001';
  end if;
  select * into v_candidate
    from public.leadership_transition_candidates
   where transition_id = p_transition_id and user_id = v_actor
   for update;
  if not found then
    raise exception 'transition_not_found' using errcode = 'P0001';
  end if;
  if v_t.status <> 'open' then
    raise exception 'transition_not_open' using errcode = 'P0001';
  end if;
  if v_t.expires_at <= now() then
    raise exception 'transition_expired' using errcode = 'P0001';
  end if;
  if v_candidate.accepted is not null then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;

  if not p_accept then
    update public.leadership_transition_candidates
       set accepted = false, responded_at = now()
     where transition_id = p_transition_id and user_id = v_actor;
    update public.leadership_transitions
       set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = 'candidate_declined'
     where id = p_transition_id;
    perform private.log_governance_event(
      v_actor, 'self', 'leadership_candidacy_declined', 'leadership', v_t.organization_id, v_actor,
      'transition', p_transition_id, jsonb_build_object('office', v_candidate.office)
    );
    return 'cancelled';
  end if;

  perform private.require_aal2();
  update public.leadership_transition_candidates
     set accepted = true, responded_at = now()
   where transition_id = p_transition_id and user_id = v_actor;
  perform private.log_governance_event(
    v_actor, 'self', 'leadership_candidacy_accepted', 'leadership', v_t.organization_id, v_actor,
    'transition', p_transition_id, jsonb_build_object('office', v_candidate.office)
  );
  return private.try_complete_transition(p_transition_id);
end;
$$;

-- A sitting BDE officeholder approves a BDE succession (or the guardian,
-- when exactly one office is vacant).
create or replace function public.approve_bde_succession(p_transition_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_t public.leadership_transitions%rowtype;
  v_bde uuid := private.bde_organization_id();
  v_president uuid := private.office_holder(v_bde, 'bde_president', now());
  v_vice uuid := private.office_holder(v_bde, 'bde_vice_president', now());
  v_capacity text;
begin
  perform private.require_aal2();
  select * into v_t from public.leadership_transitions where id = p_transition_id for update;
  if not found or v_t.kind <> 'bde_succession' then
    raise exception 'transition_not_found' using errcode = 'P0001';
  end if;
  if v_t.status <> 'open' then
    raise exception 'transition_not_open' using errcode = 'P0001';
  end if;
  if v_t.expires_at <= now() then
    raise exception 'transition_expired' using errcode = 'P0001';
  end if;

  if v_actor = v_president
     and private.user_has_platform_permission(v_actor, 'platform.bde.succession', now()) then
    v_capacity := 'bde_president';
  elsif v_actor = v_vice
     and private.user_has_platform_permission(v_actor, 'platform.bde.succession', now()) then
    v_capacity := 'bde_vice_president';
  elsif v_actor = private.guardian_user(now())
     and ((v_president is null) <> (v_vice is null)) then
    v_capacity := 'guardian';
  else
    raise exception 'approval_not_allowed' using errcode = 'P0001';
  end if;

  begin
    insert into public.leadership_transition_approvals (transition_id, capacity, approver_user_id)
    values (p_transition_id, v_capacity, v_actor);
  exception
    when unique_violation then
      raise exception 'already_approved' using errcode = 'P0001';
  end;

  perform private.log_governance_event(
    v_actor, case when v_capacity = 'guardian' then 'guardian' else 'bde' end, 'bde_succession_approved', 'leadership',
    v_bde, null, 'transition', p_transition_id, jsonb_build_object('capacity', v_capacity)
  );
  return private.try_complete_transition(p_transition_id);
end;
$$;

create or replace function public.withdraw_bde_approval(p_transition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_t public.leadership_transitions%rowtype;
  v_capacity text;
begin
  select * into v_t from public.leadership_transitions where id = p_transition_id for update;
  if not found or v_t.status <> 'open' then
    raise exception 'transition_not_open' using errcode = 'P0001';
  end if;
  delete from public.leadership_transition_approvals
   where transition_id = p_transition_id and approver_user_id = v_actor
  returning capacity into v_capacity;
  if v_capacity is null then
    raise exception 'approval_not_found' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(
    v_actor, case when v_capacity = 'guardian' then 'guardian' else 'bde' end, 'bde_succession_approval_withdrawn',
    'leadership', v_t.organization_id, null, 'transition', p_transition_id, jsonb_build_object('capacity', v_capacity)
  );
end;
$$;

-- Withdraw an open transition: its proposer; BDE leadership for association
-- ones; a sitting BDE officeholder for a BDE succession; the guardian for a
-- recovery.
create or replace function public.cancel_leadership_transition(p_transition_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_t public.leadership_transitions%rowtype;
  v_bde uuid := private.bde_organization_id();
  v_authority text;
begin
  select * into v_t from public.leadership_transitions where id = p_transition_id for update;
  if not found then
    raise exception 'transition_not_found' using errcode = 'P0001';
  end if;
  if v_t.status <> 'open' then
    raise exception 'transition_not_open' using errcode = 'P0001';
  end if;

  if v_actor = v_t.proposed_by then
    v_authority := 'self';
  elsif v_t.kind in ('association_succession', 'association_appointment')
        and private.user_has_platform_permission(v_actor, 'platform.associations.intervene', now()) then
    v_authority := 'bde';
  elsif v_t.kind = 'bde_succession'
        and v_actor in (
          coalesce(private.office_holder(v_bde, 'bde_president', now()), '00000000-0000-0000-0000-000000000000'::uuid),
          coalesce(private.office_holder(v_bde, 'bde_vice_president', now()), '00000000-0000-0000-0000-000000000000'::uuid)
        ) then
    v_authority := 'bde';
  elsif v_t.kind = 'bde_recovery' and v_actor = private.guardian_user(now()) then
    v_authority := 'guardian';
  else
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;

  update public.leadership_transitions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'cancelled')
   where id = p_transition_id;

  perform private.log_governance_event(
    v_actor, v_authority, 'leadership_transition_cancelled',
    case when v_t.kind = 'bde_recovery' then 'recovery' else 'leadership' end,
    v_t.organization_id, null, 'transition', p_transition_id, jsonb_build_object('kind', v_t.kind), nullif(btrim(p_reason), '')
  );
end;
$$;

-- Emergency: end an office mandate now (compromised account, holder gone).
-- An association presidency: BDE leadership. A BDE office: the continuity
-- guardian only (the two BDE officers cannot remove each other). Reason
-- required; filling the office is a separate, accepted appointment.
create or replace function public.end_office_mandate(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_assignment public.position_assignments%rowtype;
begin
  perform private.require_aal2();
  select * into v_assignment from public.position_assignments where id = p_assignment_id for update;
  if not found or v_assignment.office is null then
    raise exception 'assignment_not_found' using errcode = 'P0001';
  end if;
  if v_assignment.status <> 'active' or v_assignment.ends_at <= now() then
    raise exception 'assignment_not_active' using errcode = 'P0001';
  end if;

  if v_assignment.office = 'association_president' then
    perform private.require_platform_permission(v_actor, 'platform.associations.intervene');
  else
    perform private.require_platform_permission(v_actor, 'platform.recovery');
  end if;

  if v_assignment.starts_at >= now() then
    update public.position_assignments
       set status = 'cancelled', ended_by = v_actor, end_reason = v_reason
     where id = p_assignment_id;
  else
    update public.position_assignments
       set status = 'ended', ends_at = now(), ended_by = v_actor, end_reason = v_reason
     where id = p_assignment_id;
  end if;

  perform private.log_governance_event(
    v_actor,
    case when v_assignment.office = 'association_president' then 'bde' else 'guardian' end,
    case when v_assignment.office = 'association_president' then 'association_president_removed' else 'bde_office_removed' end,
    case when v_assignment.office = 'association_president' then 'leadership' else 'recovery' end,
    v_assignment.organization_id, v_assignment.user_id, 'assignment', p_assignment_id,
    jsonb_build_object('office', v_assignment.office), v_reason
  );
end;
$$;

revoke all on function public.propose_association_succession(uuid, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.propose_association_appointment(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.propose_bde_succession(text, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.propose_bde_recovery(text, text, text, timestamptz) from public, anon;
revoke all on function public.respond_to_leadership_candidacy(uuid, boolean) from public, anon;
revoke all on function public.approve_bde_succession(uuid) from public, anon;
revoke all on function public.withdraw_bde_approval(uuid) from public, anon;
revoke all on function public.cancel_leadership_transition(uuid, text) from public, anon;
revoke all on function public.end_office_mandate(uuid, text) from public, anon;

grant execute on function public.propose_association_succession(uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.propose_association_appointment(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.propose_bde_succession(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.propose_bde_recovery(text, text, text, timestamptz) to authenticated;
grant execute on function public.respond_to_leadership_candidacy(uuid, boolean) to authenticated;
grant execute on function public.approve_bde_succession(uuid) to authenticated;
grant execute on function public.withdraw_bde_approval(uuid) to authenticated;
grant execute on function public.cancel_leadership_transition(uuid, text) to authenticated;
grant execute on function public.end_office_mandate(uuid, text) to authenticated;
