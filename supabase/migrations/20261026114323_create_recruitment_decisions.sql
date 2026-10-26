-- Phase 9 · Decisions, offers, onboarding, and what withdrawal, cancellation
-- and retention now cover.
--
-- Three steps that never collapse into one: a recruiter PROPOSES an outcome;
-- the campaign's approvers FINALIZE it (one approver, two different ones, or
-- an approver and the president); someone allowed to announce RELEASES it
-- (now, or at a date). Only a release reaches the candidate. A score never
-- decides anything: no function here reads a score.

-- ---- Helpers ------------------------------------------------------------------------------------------

-- The president of the organization right now (association or BDE office).
create or replace function private.organization_president(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.office_holder(o.id, case when o.kind = 'bde' then 'bde_president' else 'association_president' end, now())
    from public.organizations o where o.id = p_organization_id;
$$;

-- Submitted application reviews that count (not from someone who then declared a conflict).
create or replace function private.counted_reviews(p_application_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.recruitment_reviews r
   where r.application_id = p_application_id and r.kind = 'application' and r.status = 'submitted'
     and not exists (select 1 from public.recruitment_conflicts x
                      where x.application_id = r.application_id and x.user_id = r.reviewer_id and x.status in ('open', 'reassigned'));
$$;

-- Places a position has given (finalized or released offers not declined, expired or withdrawn).
create or replace function private.position_offers(p_position_id uuid, p_except uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.recruitment_decisions d
    left join public.recruitment_offers o on o.decision_id = d.id
   where d.position_id = p_position_id and d.outcome = 'offer' and d.status in ('finalized', 'released')
     and d.id is distinct from p_except
     and (o.id is null or o.status in ('pending', 'accepted'));
$$;

create or replace function private.approvals_met(p_decision_id uuid, p_policy text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_policy
    when 'single' then count(*) >= 1
    when 'two' then count(*) >= 2
    when 'president' then bool_or(a.as_president) and bool_or(not a.as_president)
    else false end
    from public.recruitment_decision_approvals a where a.decision_id = p_decision_id;
$$;

-- ---- Proposals --------------------------------------------------------------------------------------

create or replace function public.propose_recruitment_decision(
  p_application_id uuid, p_outcome text, p_rationale text default null, p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_rationale text := nullif(btrim(coalesce(p_rationale, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_id uuid;
  v_user uuid;
begin
  v_app := private.application_for(v_actor, p_application_id, 'propose', true);
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  if p_outcome not in ('offer', 'reject', 'waitlist') then
    raise exception 'outcome_invalid' using errcode = 'P0001';
  end if;
  if char_length(v_rationale) > 1000 or char_length(v_message) > 2000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  if private.application_decided(v_app.id) then
    raise exception 'application_decided' using errcode = 'P0001';
  end if;
  if p_outcome = 'waitlist' and exists (select 1 from public.recruitment_decisions d
                                         where d.application_id = v_app.id and d.status = 'released' and d.outcome = 'waitlist') then
    raise exception 'already_waitlisted' using errcode = 'P0001';
  end if;
  begin
    insert into public.recruitment_decisions (application_id, campaign_id, position_id, outcome, rationale, message, proposed_by)
    values (v_app.id, v_app.campaign_id, v_app.position_id, p_outcome, v_rationale, v_message, v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'decision_pending' using errcode = 'P0001';
  end;
  perform private.log_application_activity(v_actor, v_app, 'decision_proposed', jsonb_build_object('outcome', p_outcome));
  perform private.log_application_audit(v_actor, v_app, 'propose', 'recruitment_decision_proposed');
  for v_user in select u from private.application_users_with(v_app, 'approve') u where u <> v_actor loop
    perform private.enqueue_team_message(v_user, v_app, 'recruitment_decision_to_approve', 'decision:' || v_id || ':to:' || v_user);
  end loop;
  return v_id;
end;
$$;

-- An approver adds their approval. When the campaign's rule is met, the
-- decision is finalized in the same transaction, after the last checks: the
-- reviews the campaign requires (or a written reason to go without) and, for
-- an offer, the openings of the position (or a written exception). Two
-- approvers finalizing at once wait for each other on the application's lock.
create or replace function public.approve_recruitment_decision(
  p_decision_id uuid, p_reviews_override_reason text default null, p_capacity_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_president uuid;
  v_reviews_reason text;
  v_capacity_reason text;
  v_count integer;
begin
  perform private.require_aal2();
  select * into v_decision from public.recruitment_decisions where id = p_decision_id;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_decision.application_id, 'approve', true);
  select * into v_decision from public.recruitment_decisions where id = p_decision_id for update;
  if v_decision.status in ('finalized', 'released') then
    return jsonb_build_object('status', v_decision.status, 'already', true);
  end if;
  if v_decision.status <> 'proposed' then
    raise exception 'decision_closed' using errcode = 'P0001';
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  v_president := private.organization_president(v_campaign.organization_id);
  if v_campaign.approval_policy = 'president' and v_president is null then
    raise exception 'president_vacant' using errcode = 'P0001';
  end if;
  insert into public.recruitment_decision_approvals (decision_id, approver_id, as_president)
  values (p_decision_id, v_actor, v_actor = v_president and v_campaign.approval_policy = 'president')
  on conflict (decision_id, approver_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'proposed', 'already', true);
  end if;
  perform private.log_application_activity(v_actor, v_app, 'decision_approved', '{}'::jsonb);

  if not private.approvals_met(p_decision_id, v_campaign.approval_policy) then
    perform private.log_application_audit(v_actor, v_app, 'approve', 'recruitment_decision_approved');
    return jsonb_build_object('status', 'proposed', 'already', false,
                              'approvals', (select count(*) from public.recruitment_decision_approvals where decision_id = p_decision_id));
  end if;

  if private.counted_reviews(v_app.id) < v_campaign.required_reviews then
    if nullif(btrim(coalesce(p_reviews_override_reason, '')), '') is null then
      raise exception 'reviews_incomplete' using errcode = 'P0001';
    end if;
    v_reviews_reason := private.require_reason(p_reviews_override_reason);
  end if;
  if v_decision.outcome = 'offer' then
    perform pg_advisory_xact_lock(hashtextextended('recruitment-position:' || v_decision.position_id, 0));
    select * into v_position from public.recruitment_positions where id = v_decision.position_id;
    v_count := private.position_offers(v_decision.position_id, p_decision_id);
    if v_position.openings is not null and v_count >= v_position.openings then
      if nullif(btrim(coalesce(p_capacity_override_reason, '')), '') is null then
        raise exception 'capacity_reached' using errcode = 'P0001';
      end if;
      v_capacity_reason := private.require_reason(p_capacity_override_reason);
    end if;
  end if;
  update public.recruitment_decisions
     set status = 'finalized', finalized_at = now(), reviews_override_reason = v_reviews_reason,
         capacity_override_reason = v_capacity_reason, version = version + 1
   where id = p_decision_id;
  perform private.log_application_activity(v_actor, v_app, 'decision_finalized',
    jsonb_build_object('outcome', v_decision.outcome, 'reviews_override', v_reviews_reason, 'capacity_override', v_capacity_reason));
  perform private.log_application_audit(v_actor, v_app, 'approve', 'recruitment_decision_finalized',
    jsonb_build_object('reviews_override', v_reviews_reason is not null, 'capacity_override', v_capacity_reason is not null));
  return jsonb_build_object('status', 'finalized', 'already', false);
end;
$$;

-- An approver sends a proposal back (it stays on record; a new one can follow).
create or replace function public.return_recruitment_decision(p_decision_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_decision from public.recruitment_decisions where id = p_decision_id;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_decision.application_id, 'approve', true);
  select * into v_decision from public.recruitment_decisions where id = p_decision_id for update;
  if v_decision.status <> 'proposed' then
    raise exception 'decision_closed' using errcode = 'P0001';
  end if;
  update public.recruitment_decisions
     set status = 'returned', returned_at = now(), returned_by = v_actor, return_reason = v_reason, version = version + 1
   where id = p_decision_id;
  perform private.log_application_activity(v_actor, v_app, 'decision_returned', jsonb_build_object('reason', v_reason));
  perform private.log_application_audit(v_actor, v_app, 'approve', 'recruitment_decision_returned', '{}'::jsonb, v_reason);
end;
$$;

-- Withdraw a decision not yet released: its proposer or an approver while
-- proposed; an approver (second factor) once finalized.
create or replace function public.cancel_recruitment_decision(p_decision_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_decision from public.recruitment_decisions where id = p_decision_id;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications where id = v_decision.application_id for update;
  select * into v_decision from public.recruitment_decisions where id = p_decision_id for update;
  if v_decision.status = 'proposed' then
    if not ((v_decision.proposed_by = v_actor and private.application_can(v_actor, v_app, 'propose'))
            or private.application_can(v_actor, v_app, 'approve')) then
      raise exception 'decision_not_found' using errcode = 'P0001';
    end if;
  elsif v_decision.status = 'finalized' then
    perform private.require_aal2();
    if not private.application_can(v_actor, v_app, 'approve') then
      raise exception 'decision_not_found' using errcode = 'P0001';
    end if;
  else
    raise exception 'decision_closed' using errcode = 'P0001';
  end if;
  update public.recruitment_decisions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = v_reason,
         release_scheduled_at = null, release_scheduled_by = null, version = version + 1
   where id = p_decision_id;
  perform private.log_application_activity(v_actor, v_app, 'decision_cancelled', jsonb_build_object('reason', v_reason));
  perform private.log_application_audit(v_actor, v_app, 'propose', 'recruitment_decision_cancelled', '{}'::jsonb, v_reason);
end;
$$;

-- The personal words sent with the outcome (before release only).
create or replace function public.set_recruitment_decision_message(p_decision_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_decision public.recruitment_decisions%rowtype;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select * into v_decision from public.recruitment_decisions where id = p_decision_id for update;
  if not found then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  perform private.application_for(v_actor, v_decision.application_id, 'release');
  if v_decision.status not in ('proposed', 'finalized') then
    raise exception 'decision_closed' using errcode = 'P0001';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  update public.recruitment_decisions set message = v_message, version = version + 1 where id = p_decision_id;
end;
$$;

-- The order of the waiting list, as the team decides it (first = 1).
create or replace function public.order_recruitment_waitlist(p_campaign_id uuid, p_decision_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
  v_rank integer := 0;
begin
  perform private.campaign_with(v_actor, p_campaign_id, 'propose', true);
  if cardinality(coalesce(p_decision_ids, '{}')) not between 1 and 999 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  foreach v_id in array p_decision_ids loop
    v_rank := v_rank + 1;
    update public.recruitment_decisions d set waitlist_rank = v_rank
     where d.id = v_id and d.campaign_id = p_campaign_id and d.outcome = 'waitlist' and d.status in ('proposed', 'finalized', 'released')
       and private.application_can(v_actor, (select a from public.applications a where a.id = d.application_id), 'propose');
    if not found then
      raise exception 'decision_not_found' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- ---- Release ---------------------------------------------------------------------------------------

-- One finalized decision reaches its candidate: their page changes, a message
-- is queued in this same transaction (a failed e-mail never undoes it), an
-- offer opens for an "offer". A previous waiting-list decision is superseded.
create or replace function private.release_decision(p_decision_id uuid, p_actor uuid, p_offer_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
  v_message text;
  v_offer uuid;
begin
  select * into v_decision from public.recruitment_decisions where id = p_decision_id;
  select * into v_app from public.applications where id = v_decision.application_id;
  v_message := coalesce(v_decision.message,
    private.render_recruitment_template(v_app, case v_decision.outcome when 'offer' then 'offer' when 'reject' then 'rejection' else 'waitlist' end));
  update public.recruitment_decisions
     set status = 'superseded', superseded_at = now()
   where application_id = v_app.id and id <> p_decision_id and status = 'released' and outcome = 'waitlist';
  update public.recruitment_decisions
     set status = 'released', released_at = now(), released_by = p_actor, release_scheduled_at = null, message = v_message,
         offer_expires_at = case when outcome = 'offer' then p_offer_expires_at end, version = version + 1
   where id = p_decision_id;
  insert into public.application_events (application_id, action, details)
  values (v_app.id, 'decision_released', jsonb_build_object('outcome', v_decision.outcome));
  if v_decision.outcome = 'offer' then
    insert into public.recruitment_offers (decision_id, application_id, campaign_id, candidate_id, expires_at)
    values (p_decision_id, v_app.id, v_app.campaign_id, v_app.candidate_id, p_offer_expires_at)
    returning id into v_offer;
    perform private.enqueue_application_message(v_app, 'recruitment_offer', 'decision:' || p_decision_id || ':released',
      jsonb_build_object('expires_at', p_offer_expires_at, 'message', v_message));
  else
    perform private.enqueue_application_message(v_app,
      case v_decision.outcome when 'reject' then 'recruitment_rejected' else 'recruitment_waitlisted' end,
      'decision:' || p_decision_id || ':released', jsonb_build_object('message', v_message));
  end if;
  perform private.log_application_activity(p_actor, v_app, 'decision_released', jsonb_build_object('outcome', v_decision.outcome));
  perform private.log_application_audit(p_actor, v_app, 'release', 'recruitment_decision_released');
end;
$$;

-- Release finalized decisions now, or schedule them for a date (p_at). Each
-- one is checked on its own; what cannot go out is reported.
create or replace function public.release_recruitment_decisions(
  p_decision_ids uuid[], p_offer_expires_at timestamptz default null, p_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
  v_id uuid;
  v_released integer := 0;
  v_scheduled integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  perform private.require_aal2();
  if cardinality(coalesce(p_decision_ids, '{}')) not between 1 and 500 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  if p_offer_expires_at is not null and (p_offer_expires_at <= now() + interval '1 hour' or p_offer_expires_at > now() + interval '60 days') then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if p_at is not null and (p_at <= now() + interval '5 minutes' or p_at > now() + interval '60 days'
                           or (p_offer_expires_at is not null and p_offer_expires_at <= p_at + interval '1 hour')) then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  foreach v_id in array array(select distinct x from unnest(p_decision_ids) x) loop
    select * into v_decision from public.recruitment_decisions where id = v_id;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('decision_id', v_id, 'reason', 'decision_not_found');
      continue;
    end if;
    select * into v_app from public.applications where id = v_decision.application_id for update;
    select * into v_decision from public.recruitment_decisions where id = v_id for update;
    if not private.application_can(v_actor, v_app, 'release') then
      v_skipped := v_skipped || jsonb_build_object('decision_id', v_id, 'reason', 'decision_not_found');
      continue;
    end if;
    if v_decision.status <> 'finalized' then
      v_skipped := v_skipped || jsonb_build_object('decision_id', v_id,
        'reason', case when v_decision.status = 'released' then 'already_released' else 'decision_not_finalized' end);
      continue;
    end if;
    if v_app.status <> 'submitted' then
      v_skipped := v_skipped || jsonb_build_object('decision_id', v_id, 'reason', 'application_withdrawn');
      continue;
    end if;
    if p_at is not null then
      update public.recruitment_decisions
         set release_scheduled_at = p_at, release_scheduled_by = v_actor,
             offer_expires_at = case when outcome = 'offer' then p_offer_expires_at end, version = version + 1
       where id = v_id;
      perform private.log_application_activity(v_actor, v_app, 'decision_release_scheduled', jsonb_build_object('at', p_at));
      v_scheduled := v_scheduled + 1;
    else
      perform private.release_decision(v_id, v_actor, p_offer_expires_at);
      v_released := v_released + 1;
    end if;
  end loop;
  return jsonb_build_object('released', v_released, 'scheduled', v_scheduled, 'skipped', v_skipped);
end;
$$;

create or replace function public.cancel_scheduled_release(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_decision public.recruitment_decisions%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_decision from public.recruitment_decisions where id = p_decision_id for update;
  if not found or v_decision.release_scheduled_at is null then
    raise exception 'decision_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_decision.application_id, 'release');
  update public.recruitment_decisions set release_scheduled_at = null, release_scheduled_by = null, version = version + 1
   where id = p_decision_id;
  perform private.log_application_activity(v_actor, v_app, 'decision_release_unscheduled', '{}'::jsonb);
end;
$$;

-- ---- Offers ------------------------------------------------------------------------------------

-- The candidate answers. Answering twice the same way returns the same
-- answer; a past deadline refuses; accepting grants nothing in the
-- organization (an officer may then send a Phase 4 invitation).
create or replace function public.respond_to_recruitment_offer(p_offer_id uuid, p_accept boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_offer public.recruitment_offers%rowtype;
  v_app public.applications%rowtype;
  v_decision public.recruitment_decisions%rowtype;
  v_status text := case when p_accept then 'accepted' else 'declined' end;
  v_user uuid;
begin
  if p_accept is null then
    raise exception 'answer_invalid' using errcode = 'P0001';
  end if;
  select * into v_offer from public.recruitment_offers where id = p_offer_id and candidate_id = v_actor for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  if v_offer.status = v_status then
    return jsonb_build_object('status', v_offer.status, 'responded_at', v_offer.responded_at, 'already', true);
  end if;
  if v_offer.status = 'expired' or (v_offer.status = 'pending' and v_offer.expires_at is not null and v_offer.expires_at <= now()) then
    raise exception 'offer_expired' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications where id = v_offer.application_id;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  update public.recruitment_offers
     set status = v_status, responded_at = now(), response_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_offer_id
  returning * into v_offer;
  insert into public.application_events (application_id, action) values (v_app.id, 'offer_' || v_status);
  select * into v_decision from public.recruitment_decisions where id = v_offer.decision_id;
  for v_user in
    select u from private.application_users_with(v_app, 'release') u
    union select v_decision.proposed_by where v_decision.proposed_by is not null and private.application_can(v_decision.proposed_by, v_app, 'view')
  loop
    perform private.enqueue_team_message(v_user, v_app, 'recruitment_offer_' || v_status, 'offer:' || p_offer_id || ':' || v_status || ':' || v_user);
  end loop;
  perform private.log_application_activity(v_actor, v_app, 'offer_' || v_status, '{}'::jsonb);
  perform private.log_governance_event(
    v_actor, 'self', 'recruitment_offer_' || v_status, 'recruitment',
    (select organization_id from public.recruitment_campaigns where id = v_app.campaign_id), null, 'recruitment_offer', p_offer_id,
    jsonb_build_object('campaign_id', v_app.campaign_id, 'application_id', v_app.id));
  return jsonb_build_object('status', v_offer.status, 'responded_at', v_offer.responded_at, 'already', false);
end;
$$;

-- The team takes back an offer not yet answered (a mistake, a position closed).
create or replace function public.withdraw_recruitment_offer(p_offer_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_offer public.recruitment_offers%rowtype;
  v_app public.applications%rowtype;
begin
  perform private.require_aal2();
  select * into v_offer from public.recruitment_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_offer.application_id, 'release');
  if v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode = 'P0001';
  end if;
  update public.recruitment_offers set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = v_actor, withdraw_reason = v_reason
   where id = p_offer_id;
  insert into public.application_events (application_id, action) values (v_app.id, 'offer_withdrawn');
  perform private.enqueue_application_message(v_app, 'recruitment_offer_withdrawn', 'offer:' || p_offer_id || ':withdrawn');
  perform private.log_application_activity(v_actor, v_app, 'offer_withdrawn', jsonb_build_object('reason', v_reason));
  perform private.log_application_audit(v_actor, v_app, 'release', 'recruitment_offer_withdrawn', '{}'::jsonb, v_reason);
end;
$$;

-- ---- Onboarding: a Phase 4 invitation, never a shortcut ---------------------------------------

-- After the candidate accepted, an officer who can invite members (and can
-- see this application) sends the ordinary invitation: invite_member checks
-- members.invite, refuses protected offices (presidencies, BDE offices),
-- applies the permission ceiling and the second factor for a position with
-- keys. The candidate still has to accept it.
create or replace function public.start_recruitment_onboarding(
  p_offer_id uuid, p_position_id uuid default null, p_mandate_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_offer public.recruitment_offers%rowtype;
  v_app public.applications%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_invitation uuid;
begin
  select * into v_offer from public.recruitment_offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_offer.application_id, 'view');
  if v_offer.status <> 'accepted' then
    raise exception 'offer_not_accepted' using errcode = 'P0001';
  end if;
  if v_offer.onboarding_invitation_id is not null
     and exists (select 1 from public.organization_invitations i
                  where i.id = v_offer.onboarding_invitation_id and i.status in ('pending', 'accepted') and i.expires_at > now()) then
    raise exception 'onboarding_started' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  v_invitation := public.invite_member(v_campaign.organization_id, (select u.email from auth.users u where u.id = v_offer.candidate_id),
                                       p_position_id, p_mandate_ends_at);
  update public.recruitment_offers set onboarding_invitation_id = v_invitation, onboarding_at = now(), onboarding_by = v_actor
   where id = p_offer_id;
  perform private.log_application_activity(v_actor, v_app, 'membership_onboarding_initiated',
    jsonb_build_object('position', (select title from public.positions where id = p_position_id)));
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_campaign.organization_id, 'members.invite'), 'membership_onboarding_initiated', 'recruitment',
    v_campaign.organization_id, v_offer.candidate_id, 'invitation', v_invitation,
    jsonb_build_object('campaign_id', v_campaign.id, 'offer_id', p_offer_id, 'position_id', p_position_id));
  return v_invitation;
end;
$$;

-- ---- Withdrawal now stops what was under way ---------------------------------------------------

create or replace function public.withdraw_application(p_application_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_user uuid;
  v_recipients uuid[];
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = v_actor for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  if v_app.status = 'withdrawn' then
    return jsonb_build_object('status', 'withdrawn', 'already', true);
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_not_submitted' using errcode = 'P0001';
  end if;
  -- Who works on it, while they still can see it (for the message below).
  v_recipients := array(
    select u from private.application_users_with(v_app, 'committee') u
    union
    select cm.user_id from public.recruitment_review_assignments ra
      join public.recruitment_committee_members cm on cm.id = ra.member_id
     where ra.application_id = v_app.id and ra.removed_at is null and cm.revoked_at is null);

  update public.applications
     set status = 'withdrawn', withdrawn_at = now(),
         withdrawal_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), ''), version = version + 1
   where id = p_application_id
  returning * into v_app;
  insert into public.application_events (application_id, action) values (p_application_id, 'withdrawn');
  perform private.enqueue_application_message(v_app, 'application_withdrawn', 'app:' || v_app.id || ':withdrawn');

  -- Phase 9: interviews, questions, decisions not yet released, and an
  -- unanswered offer stop. (An offer already accepted stays as it was.)
  update public.recruitment_interviews
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = 'Candidature retirée', version = version + 1
   where application_id = p_application_id and status in ('invited', 'scheduled');
  update public.application_documents d set status = 'removed', removed_at = now()
    from public.recruitment_clarifications q
   where d.clarification_id = q.id and q.application_id = p_application_id and q.status = 'open' and d.status = 'pending';
  update public.recruitment_clarifications
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = 'Candidature retirée'
   where application_id = p_application_id and status = 'open';
  update public.recruitment_decisions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = 'Candidature retirée par la personne',
         release_scheduled_at = null, release_scheduled_by = null, version = version + 1
   where application_id = p_application_id and status in ('proposed', 'finalized');
  update public.recruitment_offers set status = 'withdrawn', withdrawn_at = now(), withdraw_reason = 'Candidature retirée'
   where application_id = p_application_id and status = 'pending';
  if exists (select 1 from public.application_pipeline where application_id = p_application_id) then
    perform private.log_application_activity(v_actor, v_app, 'candidate_withdrew', '{}'::jsonb);
    foreach v_user in array v_recipients loop
      perform private.enqueue_team_message(v_user, v_app, 'recruitment_candidate_withdrew', 'withdrew:' || v_app.id || ':' || v_user);
    end loop;
  end if;
  return jsonb_build_object('status', 'withdrawn', 'already', false);
end;
$$;

-- A cancelled campaign stops its interviews, questions, pending decisions and
-- unanswered offers (candidates already got the cancellation message).
create or replace function private.stop_cancelled_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recruitment_interviews
     set status = 'cancelled', cancelled_at = now(), cancelled_by = new.cancelled_by, cancel_reason = 'Recrutement annulé', version = version + 1
   where campaign_id = new.id and status in ('invited', 'scheduled');
  update public.application_documents d set status = 'removed', removed_at = now()
    from public.recruitment_clarifications q
   where d.clarification_id = q.id and q.campaign_id = new.id and q.status = 'open' and d.status = 'pending';
  update public.recruitment_clarifications
     set status = 'cancelled', cancelled_at = now(), cancelled_by = new.cancelled_by, cancel_reason = 'Recrutement annulé'
   where campaign_id = new.id and status = 'open';
  update public.recruitment_decisions
     set status = 'cancelled', cancelled_at = now(), cancelled_by = new.cancelled_by, cancel_reason = 'Recrutement annulé',
         release_scheduled_at = null, release_scheduled_by = null, version = version + 1
   where campaign_id = new.id and status in ('proposed', 'finalized');
  update public.recruitment_offers set status = 'withdrawn', withdrawn_at = now(), withdrawn_by = new.cancelled_by,
                                       withdraw_reason = 'Recrutement annulé'
   where campaign_id = new.id and status = 'pending';
  update public.recruitment_interview_slots set cancelled_at = now(), cancelled_by = new.cancelled_by, cancel_reason = 'Recrutement annulé'
   where campaign_id = new.id and cancelled_at is null;
  return new;
end;
$$;
revoke all on function private.stop_cancelled_campaign() from public, anon, authenticated, service_role;

create trigger recruitment_campaigns_stop_cancelled
  after update of status on public.recruitment_campaigns
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function private.stop_cancelled_campaign();

-- ---- Scheduled work ------------------------------------------------------------------------------

-- Every five minutes: scheduled releases that are due (only if the person who
-- scheduled them may still release), offers past their deadline, and the
-- reminders (an offer or a question closing within 24 hours).
create or replace function private.run_recruitment_review_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_app public.applications%rowtype;
  v_released integer := 0;
  v_skipped integer := 0;
  v_expired integer := 0;
  v_reminded integer := 0;
  v_user uuid;
begin
  for v_row in
    select d.id, d.application_id, d.release_scheduled_by, d.offer_expires_at
      from public.recruitment_decisions d
     where d.status = 'finalized' and d.release_scheduled_at is not null and d.release_scheduled_at <= now()
     order by d.release_scheduled_at
     limit 200
     for update skip locked
  loop
    select * into v_app from public.applications where id = v_row.application_id for update;
    if v_app.status = 'submitted' and v_row.release_scheduled_by is not null
       and private.application_can(v_row.release_scheduled_by, v_app, 'release')
       and (v_row.offer_expires_at is null or v_row.offer_expires_at > now() + interval '1 hour') then
      perform private.release_decision(v_row.id, v_row.release_scheduled_by, v_row.offer_expires_at);
      v_released := v_released + 1;
    else
      update public.recruitment_decisions set release_scheduled_at = null, release_scheduled_by = null, version = version + 1
       where id = v_row.id;
      perform private.log_application_activity(null, v_app, 'decision_release_skipped', '{}'::jsonb);
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  for v_row in
    select o.id, o.application_id, o.decision_id from public.recruitment_offers o
     where o.status = 'pending' and o.expires_at is not null and o.expires_at <= now()
     for update skip locked
  loop
    update public.recruitment_offers set status = 'expired' where id = v_row.id;
    select * into v_app from public.applications where id = v_row.application_id;
    insert into public.application_events (application_id, action) values (v_app.id, 'offer_expired');
    perform private.enqueue_application_message(v_app, 'recruitment_offer_expired', 'offer:' || v_row.id || ':expired');
    for v_user in select u from private.application_users_with(v_app, 'release') u loop
      perform private.enqueue_team_message(v_user, v_app, 'recruitment_offer_declined', 'offer:' || v_row.id || ':expired:' || v_user,
                                           jsonb_build_object('expired', true));
    end loop;
    perform private.log_application_activity(null, v_app, 'offer_expired', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for v_row in
    select o.id, o.application_id, o.expires_at from public.recruitment_offers o
     where o.status = 'pending' and o.expires_at between now() and now() + interval '24 hours'
       and o.created_at < o.expires_at - interval '24 hours'
  loop
    select * into v_app from public.applications where id = v_row.application_id;
    perform private.enqueue_application_message(v_app, 'recruitment_offer_reminder',
      'offer:' || v_row.id || ':reminder:' || extract(epoch from v_row.expires_at)::bigint, jsonb_build_object('expires_at', v_row.expires_at));
    v_reminded := v_reminded + 1;
  end loop;
  for v_row in
    select q.id, q.application_id, q.due_at from public.recruitment_clarifications q
     where q.status = 'open' and q.due_at between now() and now() + interval '24 hours'
       and q.asked_at < q.due_at - interval '24 hours'
  loop
    select * into v_app from public.applications where id = v_row.application_id;
    if v_app.status = 'submitted' then
      perform private.enqueue_application_message(v_app, 'recruitment_clarification_reminder',
        'clarification:' || v_row.id || ':reminder:' || extract(epoch from v_row.due_at)::bigint, jsonb_build_object('due_at', v_row.due_at));
      v_reminded := v_reminded + 1;
    end if;
  end loop;
  return jsonb_build_object('released', v_released, 'release_skipped', v_skipped, 'expired', v_expired, 'reminders', v_reminded);
end;
$$;

-- ---- Retention: applications that ended with an accepted offer have their own period -----------------

create or replace function private.purge_recruitment_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.recruitment_settings%rowtype;
  v_stale integer;
  v_drafts integer := 0;
  v_withdrawn integer := 0;
  v_submitted integer := 0;
  v_selected integer := 0;
begin
  update public.application_documents set status = 'removed', removed_at = now()
   where status = 'pending' and created_at < now() - interval '1 day';
  get diagnostics v_stale = row_count;

  select * into v_settings from public.recruitment_settings where id;
  if v_settings.draft_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c, public.recruitment_positions p
     where a.campaign_id = c.id and p.id = a.position_id and a.status = 'draft'
       and (c.status = 'cancelled' or c.closes_at <= now())
       and greatest(coalesce(c.cancelled_at, c.closes_at), a.updated_at)
           < now() - make_interval(months => v_settings.draft_retention_months);
    get diagnostics v_drafts = row_count;
  end if;
  if v_settings.withdrawn_retention_months is not null then
    delete from public.applications
     where status = 'withdrawn' and withdrawn_at < now() - make_interval(months => v_settings.withdrawn_retention_months);
    get diagnostics v_withdrawn = row_count;
  end if;
  -- Everything evaluated about an application (reviews, notes, interviews,
  -- questions, decisions, records, files) leaves with it.
  if v_settings.submitted_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c
     where a.campaign_id = c.id and a.status = 'submitted'
       and not exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
       and (c.status = 'cancelled' or c.status = 'closed' or c.closes_at <= now())
       and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_settings.submitted_retention_months);
    get diagnostics v_submitted = row_count;
  end if;
  if v_settings.selected_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c
     where a.campaign_id = c.id and a.status = 'submitted'
       and exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
       and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_settings.selected_retention_months);
    get diagnostics v_selected = row_count;
  end if;
  if v_drafts + v_withdrawn + v_submitted + v_selected > 0 then
    perform private.log_governance_event(
      null, 'scheduler', 'recruitment_data_purged', 'recruitment', null, null, 'recruitment_settings', null,
      jsonb_build_object('drafts', v_drafts, 'withdrawn', v_withdrawn, 'submitted', v_submitted, 'selected', v_selected));
  end if;
  return jsonb_build_object('stale_uploads', v_stale, 'drafts', v_drafts, 'withdrawn', v_withdrawn, 'submitted', v_submitted,
                            'selected', v_selected);
end;
$$;

create or replace function public.set_recruitment_settings(
  p_privacy_notice text,
  p_privacy_contact text,
  p_draft_months integer,
  p_withdrawn_months integer,
  p_submitted_months integer,
  p_selected_months integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  if (p_draft_months is not null and p_draft_months not between 1 and 60)
     or (p_withdrawn_months is not null and p_withdrawn_months not between 1 and 60)
     or (p_submitted_months is not null and p_submitted_months not between 1 and 60)
     or (p_selected_months is not null and p_selected_months not between 1 and 60) then
    raise exception 'retention_invalid' using errcode = 'P0001';
  end if;
  update public.recruitment_settings
     set privacy_notice = nullif(btrim(coalesce(p_privacy_notice, '')), ''),
         privacy_contact = nullif(btrim(coalesce(p_privacy_contact, '')), ''),
         draft_retention_months = p_draft_months, withdrawn_retention_months = p_withdrawn_months,
         submitted_retention_months = p_submitted_months, selected_retention_months = p_selected_months,
         updated_by = v_actor, updated_at = now()
   where id;
  perform private.log_governance_event(
    v_actor, 'bde', 'recruitment_settings_updated', 'recruitment', null, null, 'recruitment_settings', null,
    jsonb_build_object('draft_months', p_draft_months, 'withdrawn_months', p_withdrawn_months,
                       'submitted_months', p_submitted_months, 'selected_months', p_selected_months,
                       'notice', p_privacy_notice is not null));
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('recruitment-review-jobs', '*/5 * * * *', 'select private.run_recruitment_review_jobs()');
  end if;
end;
$cron$;

-- ---- Grants -------------------------------------------------------------------------------------

revoke all on function private.organization_president(uuid) from public, anon, authenticated, service_role;
revoke all on function private.counted_reviews(uuid) from public, anon, authenticated, service_role;
revoke all on function private.position_offers(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.approvals_met(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.release_decision(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.run_recruitment_review_jobs() from public, anon, authenticated, service_role;
revoke all on function private.purge_recruitment_data() from public, anon, authenticated, service_role;

revoke all on function public.propose_recruitment_decision(uuid, text, text, text) from public, anon;
revoke all on function public.approve_recruitment_decision(uuid, text, text) from public, anon;
revoke all on function public.return_recruitment_decision(uuid, text) from public, anon;
revoke all on function public.cancel_recruitment_decision(uuid, text) from public, anon;
revoke all on function public.set_recruitment_decision_message(uuid, text) from public, anon;
revoke all on function public.order_recruitment_waitlist(uuid, uuid[]) from public, anon;
revoke all on function public.release_recruitment_decisions(uuid[], timestamptz, timestamptz) from public, anon;
revoke all on function public.cancel_scheduled_release(uuid) from public, anon;
revoke all on function public.respond_to_recruitment_offer(uuid, boolean, text) from public, anon;
revoke all on function public.withdraw_recruitment_offer(uuid, text) from public, anon;
revoke all on function public.start_recruitment_onboarding(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.withdraw_application(uuid, text) from public, anon;
revoke all on function public.set_recruitment_settings(text, text, integer, integer, integer, integer) from public, anon;

grant execute on function public.propose_recruitment_decision(uuid, text, text, text) to authenticated;
grant execute on function public.approve_recruitment_decision(uuid, text, text) to authenticated;
grant execute on function public.return_recruitment_decision(uuid, text) to authenticated;
grant execute on function public.cancel_recruitment_decision(uuid, text) to authenticated;
grant execute on function public.set_recruitment_decision_message(uuid, text) to authenticated;
grant execute on function public.order_recruitment_waitlist(uuid, uuid[]) to authenticated;
grant execute on function public.release_recruitment_decisions(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_scheduled_release(uuid) to authenticated;
grant execute on function public.respond_to_recruitment_offer(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_recruitment_offer(uuid, text) to authenticated;
grant execute on function public.start_recruitment_onboarding(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.withdraw_application(uuid, text) to authenticated;
grant execute on function public.set_recruitment_settings(text, text, integer, integer, integer, integer) to authenticated;

-- The five-argument settings function of Phase 8 gives way to this one.
drop function public.set_recruitment_settings(text, text, integer, integer, integer);
