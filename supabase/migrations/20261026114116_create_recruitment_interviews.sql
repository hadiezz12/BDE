-- Phase 9 · Interviews, questions to candidates, and the campaign's message words.
--
-- Interviews: the team offers slots (one candidate each), invites candidates,
-- each candidate books one slot; the database takes the slot under its lock and
-- a unique index refuses a second booking whatever happens in the browsers.
-- Questions (clarifications): a private exchange tied to one application,
-- answered once, before a deadline the database enforces. Their files reuse
-- the private documents bucket and the same upload route.

-- ---- Message words: an allowlist of placeholders, replaced as text --------------------------------

create or replace function private.template_placeholders_ok(p_body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select not exists (
    select 1 from regexp_matches(coalesce(p_body, ''), '\{([^{}]*)\}', 'g') as m
     where m[1] not in ('prenom', 'association', 'recrutement', 'poste', 'reference'));
$$;

-- The campaign's words for this kind of message, with the placeholders filled
-- (null when the campaign wrote none: the standard message is used).
create or replace function private.render_recruitment_template(p_app public.applications, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(t.body,
           '{prenom}', coalesce(p_app.candidate_snapshot ->> 'first_name', '')),
           '{association}', coalesce(o.short_name, o.name)),
           '{recrutement}', c.title),
           '{poste}', p.title),
           '{reference}', p_app.reference)
    from public.recruitment_message_templates t
    join public.recruitment_campaigns c on c.id = t.campaign_id
    join public.organizations o on o.id = c.organization_id
    join public.recruitment_positions p on p.id = p_app.position_id
   where t.campaign_id = p_app.campaign_id and t.kind = p_kind;
$$;

create or replace function public.save_recruitment_template(p_campaign_id uuid, p_kind text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if p_kind not in ('interview_invitation', 'clarification', 'offer', 'rejection', 'waitlist') then
    raise exception 'template_invalid' using errcode = 'P0001';
  end if;
  if v_body = '' then
    delete from public.recruitment_message_templates where campaign_id = p_campaign_id and kind = p_kind;
    return;
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'template_too_long' using errcode = 'P0001';
  end if;
  if not private.template_placeholders_ok(v_body) then
    raise exception 'template_variable_unknown' using errcode = 'P0001';
  end if;
  insert into public.recruitment_message_templates (campaign_id, kind, body, updated_by)
  values (p_campaign_id, p_kind, v_body, v_actor)
  on conflict (campaign_id, kind) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- ---- Interview slots --------------------------------------------------------------------------------

-- Is this person already interviewing during that time (any campaign)?
create or replace function private.interviewer_busy(p_user uuid, p_starts timestamptz, p_ends timestamptz, p_except_slot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.recruitment_slot_interviewers si
      join public.recruitment_committee_members cm on cm.id = si.member_id
      join public.recruitment_interview_slots s on s.id = si.slot_id
     where cm.user_id = p_user and cm.revoked_at is null and s.cancelled_at is null
       and s.id is distinct from p_except_slot
       and s.starts_at < p_ends and p_starts < s.ends_at);
$$;

create or replace function private.slot_details(p_mode text, p_location text, p_meeting_link text, p_instructions text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_link text := nullif(btrim(coalesce(p_meeting_link, '')), '');
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
begin
  if p_mode not in ('in_person', 'online', 'phone') then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'mode';
  end if;
  if p_mode = 'in_person' and (v_location is null or char_length(v_location) not between 2 and 200) then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'location';
  end if;
  if v_link is not null and (p_mode <> 'online' or char_length(v_link) > 500
                             or v_link !~* '^https://[^[:space:]/?#@]+\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$') then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'link';
  end if;
  if char_length(v_instructions) > 1000 or char_length(v_location) > 200 then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'length';
  end if;
  return jsonb_build_object('location', v_location, 'meeting_link', v_link, 'instructions', v_instructions);
end;
$$;

-- Live appointments of this campaign that may sit on an interview.
create or replace function private.slot_member_ids(p_campaign_id uuid, p_member_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_member_ids, '{}'::uuid[])) x where x is not null);
begin
  if cardinality(v_ids) > 5 then
    raise exception 'too_many_interviewers' using errcode = 'P0001';
  end if;
  if (select count(*) from public.recruitment_committee_members cm
       where cm.id = any (v_ids) and cm.campaign_id = p_campaign_id
         and cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id)) <> cardinality(v_ids) then
    raise exception 'committee_member_not_found' using errcode = 'P0001';
  end if;
  return v_ids;
end;
$$;

-- Several slots of the same length at once (each start given), with their
-- place and their interviewers. A slot whose interviewer is already busy then
-- is not created (and said so).
create or replace function public.create_interview_slots(
  p_campaign_id uuid,
  p_position_id uuid,
  p_starts timestamptz[],
  p_minutes integer,
  p_mode text,
  p_location text default null,
  p_meeting_link text default null,
  p_instructions text default null,
  p_member_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_details jsonb;
  v_members uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_member uuid;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_busy boolean;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'interviews', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  if p_position_id is not null and not exists (select 1 from public.recruitment_positions where id = p_position_id and campaign_id = p_campaign_id) then
    raise exception 'position_not_found' using errcode = 'P0001';
  end if;
  if p_minutes is null or p_minutes not between 10 and 480 or cardinality(coalesce(p_starts, '{}')) not between 1 and 60 then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'times';
  end if;
  v_details := private.slot_details(p_mode, p_location, p_meeting_link, p_instructions);
  v_members := private.slot_member_ids(p_campaign_id, p_member_ids);
  foreach v_start in array array(select distinct x from unnest(p_starts) x where x is not null order by 1) loop
    v_end := v_start + make_interval(mins => p_minutes);
    if v_start <= now() or v_start > now() + interval '1 year' then
      v_skipped := v_skipped || jsonb_build_object('starts_at', v_start, 'reason', 'slot_in_past');
      continue;
    end if;
    v_busy := false;
    foreach v_member in array v_members loop
      perform pg_advisory_xact_lock(hashtextextended('interviewer:' || (select user_id from public.recruitment_committee_members where id = v_member), 0));
      if private.interviewer_busy((select user_id from public.recruitment_committee_members where id = v_member), v_start, v_end, null) then
        v_busy := true;
      end if;
    end loop;
    if v_busy then
      v_skipped := v_skipped || jsonb_build_object('starts_at', v_start, 'reason', 'interviewer_busy');
      continue;
    end if;
    insert into public.recruitment_interview_slots
      (campaign_id, position_id, starts_at, ends_at, mode, location, meeting_link, instructions, created_by)
    values (p_campaign_id, p_position_id, v_start, v_end, p_mode, v_details ->> 'location', v_details ->> 'meeting_link',
            v_details ->> 'instructions', v_actor)
    returning id into v_id;
    insert into public.recruitment_slot_interviewers (slot_id, member_id, campaign_id)
    select v_id, m, p_campaign_id from unnest(v_members) m;
    v_created := v_created || to_jsonb(v_id);
  end loop;
  if jsonb_array_length(v_created) > 0 then
    perform private.log_governance_event(
      v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'interviews'), 'recruitment_interview_slots_created', 'recruitment',
      v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
      jsonb_build_object('slots', jsonb_array_length(v_created), 'minutes', p_minutes, 'mode', p_mode));
  end if;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

-- Change where it happens, the instructions, or who interviews. A booked
-- candidate is told (the time itself never changes: move the interview).
create or replace function public.update_interview_slot(
  p_slot_id uuid, p_location text, p_meeting_link text, p_instructions text, p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_slot public.recruitment_interview_slots%rowtype;
  v_details jsonb;
  v_members uuid[];
  v_member uuid;
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_slot from public.recruitment_interview_slots where id = p_slot_id for update;
  if not found or v_slot.cancelled_at is not null then
    raise exception 'slot_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_with(v_actor, v_slot.campaign_id, 'interviews');
  v_details := private.slot_details(v_slot.mode, p_location, p_meeting_link, p_instructions);
  v_members := private.slot_member_ids(v_slot.campaign_id, p_member_ids);
  foreach v_member in array v_members loop
    perform pg_advisory_xact_lock(hashtextextended('interviewer:' || (select user_id from public.recruitment_committee_members where id = v_member), 0));
    if not exists (select 1 from public.recruitment_slot_interviewers where slot_id = p_slot_id and member_id = v_member)
       and private.interviewer_busy((select user_id from public.recruitment_committee_members where id = v_member),
                                    v_slot.starts_at, v_slot.ends_at, p_slot_id) then
      raise exception 'interviewer_busy' using errcode = 'P0001';
    end if;
  end loop;
  update public.recruitment_interview_slots
     set location = v_details ->> 'location', meeting_link = v_details ->> 'meeting_link', instructions = v_details ->> 'instructions'
   where id = p_slot_id;
  delete from public.recruitment_slot_interviewers where slot_id = p_slot_id and not member_id = any (v_members);
  insert into public.recruitment_slot_interviewers (slot_id, member_id, campaign_id)
  select p_slot_id, m, v_slot.campaign_id from unnest(v_members) m
  on conflict do nothing;
  select * into v_interview from public.recruitment_interviews where slot_id = p_slot_id and status = 'scheduled';
  if found and (v_details ->> 'location' is distinct from v_slot.location or v_details ->> 'meeting_link' is distinct from v_slot.meeting_link
                or v_details ->> 'instructions' is distinct from v_slot.instructions) then
    select * into v_app from public.applications where id = v_interview.application_id;
    perform private.enqueue_application_message(v_app, 'recruitment_interview_rescheduled',
      'interview:' || v_interview.id || ':details:' || extract(epoch from clock_timestamp())::bigint,
      jsonb_build_object('starts_at', v_slot.starts_at, 'ends_at', v_slot.ends_at, 'details_changed', true));
    perform private.log_application_activity(v_actor, v_app, 'interview_details_changed', '{}'::jsonb);
  end if;
end;
$$;

-- Cancel a slot. A candidate booked on it goes back to choosing (told so).
create or replace function public.cancel_interview_slot(p_slot_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_slot public.recruitment_interview_slots%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_slot from public.recruitment_interview_slots where id = p_slot_id for update;
  if not found or v_slot.cancelled_at is not null then
    raise exception 'slot_not_found' using errcode = 'P0001';
  end if;
  perform private.campaign_with(v_actor, v_slot.campaign_id, 'interviews');
  select * into v_interview from public.recruitment_interviews where slot_id = p_slot_id and status = 'scheduled' for update;
  if found then
    update public.recruitment_interviews set status = 'invited', slot_id = null, scheduled_at = null, version = version + 1
     where id = v_interview.id;
    select * into v_app from public.applications where id = v_interview.application_id;
    insert into public.application_events (application_id, action, details)
    values (v_app.id, 'interview_rescheduled', jsonb_build_object('from', v_slot.starts_at, 'to', null));
    perform private.enqueue_application_message(v_app, 'recruitment_interview_rescheduled',
      'interview:' || v_interview.id || ':slot-cancelled:' || p_slot_id,
      jsonb_build_object('starts_at', null, 'previous_starts_at', v_slot.starts_at, 'choose_again', true));
    perform private.log_application_activity(v_actor, v_app, 'interview_rescheduled',
      jsonb_build_object('from', v_slot.starts_at, 'to', null, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  end if;
  update public.recruitment_interview_slots
     set cancelled_at = now(), cancelled_by = v_actor, cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where id = p_slot_id;
end;
$$;

-- ---- Interviews ------------------------------------------------------------------------------------

-- Invite candidates: each chooses one free slot of the campaign (of their
-- position, or open to all). The message is the campaign's template unless
-- one is written here.
create or replace function public.invite_to_interview(p_application_ids uuid[], p_message text default null, p_respond_by timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_id uuid;
  v_interview uuid;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_invited integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_text text;
begin
  if cardinality(coalesce(p_application_ids, '{}')) not between 1 and 200 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  if p_respond_by is not null and (p_respond_by <= now() or p_respond_by > now() + interval '90 days') then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  foreach v_id in array array(select distinct x from unnest(p_application_ids) x) loop
    select * into v_app from public.applications where id = v_id for update;
    if not found or not private.application_can(v_actor, v_app, 'interviews') then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'application_not_found');
      continue;
    end if;
    if v_app.status <> 'submitted' then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'application_withdrawn');
      continue;
    end if;
    if exists (select 1 from public.recruitment_decisions d where d.application_id = v_id and d.status in ('finalized', 'released')
                                                                and d.outcome in ('offer', 'reject')) then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'decision_made');
      continue;
    end if;
    if exists (select 1 from public.recruitment_interviews i where i.application_id = v_id and i.status in ('invited', 'scheduled')) then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_id, 'reason', 'already_invited');
      continue;
    end if;
    v_text := coalesce(v_message, private.render_recruitment_template(v_app, 'interview_invitation'));
    insert into public.recruitment_interviews (application_id, campaign_id, message, respond_by, invited_by)
    values (v_id, v_app.campaign_id, v_text, p_respond_by, v_actor)
    returning id into v_interview;
    update public.application_pipeline
       set stage = 'interview', stage_changed_at = now(), stage_changed_by = v_actor, version = version + 1
     where application_id = v_id and stage <> 'interview';
    insert into public.application_events (application_id, action) values (v_id, 'interview_invited');
    perform private.enqueue_application_message(v_app, 'recruitment_interview_invited', 'interview:' || v_interview || ':invited',
      jsonb_build_object('respond_by', p_respond_by, 'message', v_text));
    perform private.log_application_activity(v_actor, v_app, 'interview_invited', jsonb_build_object('respond_by', p_respond_by));
    perform private.log_application_audit(v_actor, v_app, 'interviews', 'recruitment_interview_invited');
    v_invited := v_invited + 1;
  end loop;
  return jsonb_build_object('invited', v_invited, 'skipped', v_skipped);
end;
$$;

-- Take the slot for this interview, inside the slot's lock: the second
-- candidate to ask for the same slot is told it is taken. Booking again
-- (another slot) is allowed until 24 hours before the current one.
create or replace function private.take_interview_slot(p_interview public.recruitment_interviews, p_slot public.recruitment_interview_slots)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.recruitment_interviews i
              where i.slot_id = p_slot.id and i.id <> p_interview.id and i.status in ('scheduled', 'completed', 'no_show')) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
  begin
    update public.recruitment_interviews
       set status = 'scheduled', slot_id = p_slot.id, scheduled_at = now(), version = version + 1
     where id = p_interview.id;
  exception
    when unique_violation then
      raise exception 'slot_taken' using errcode = 'P0001';
  end;
end;
$$;

create or replace function public.book_interview_slot(p_interview_id uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
  v_slot public.recruitment_interview_slots%rowtype;
  v_previous public.recruitment_interview_slots%rowtype;
  v_member uuid;
begin
  select i.* into v_interview
    from public.recruitment_interviews i join public.applications a on a.id = i.application_id
   where i.id = p_interview_id and a.candidate_id = v_actor
   for update of i;
  if not found then
    raise exception 'interview_not_found' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications where id = v_interview.application_id;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  if v_interview.status = 'scheduled' and v_interview.slot_id = p_slot_id then
    return jsonb_build_object('status', 'scheduled', 'slot_id', p_slot_id, 'already', true);
  end if;
  if v_interview.status not in ('invited', 'scheduled') then
    raise exception 'interview_closed' using errcode = 'P0001';
  end if;
  if v_interview.status = 'scheduled' then
    select * into v_previous from public.recruitment_interview_slots where id = v_interview.slot_id;
    if v_previous.starts_at <= now() + interval '24 hours' then
      raise exception 'interview_too_close' using errcode = 'P0001';
    end if;
  end if;
  select * into v_slot from public.recruitment_interview_slots where id = p_slot_id and campaign_id = v_interview.campaign_id for update;
  if not found or v_slot.cancelled_at is not null or v_slot.starts_at <= now()
     or (v_slot.position_id is not null and v_slot.position_id <> v_app.position_id) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  perform private.take_interview_slot(v_interview, v_slot);
  insert into public.application_events (application_id, action, details)
  values (v_app.id, case when v_previous.id is null then 'interview_scheduled' else 'interview_rescheduled' end,
          jsonb_build_object('from', v_previous.starts_at, 'to', v_slot.starts_at));
  perform private.enqueue_application_message(v_app, 'recruitment_interview_scheduled', 'interview:' || v_interview.id || ':slot:' || v_slot.id,
    jsonb_build_object('starts_at', v_slot.starts_at, 'ends_at', v_slot.ends_at, 'mode', v_slot.mode, 'location', v_slot.location));
  for v_member in select si.member_id from public.recruitment_slot_interviewers si where si.slot_id = v_slot.id loop
    perform private.enqueue_team_message((select user_id from public.recruitment_committee_members where id = v_member), v_app,
      'recruitment_interview_booked', 'booked:' || v_interview.id || ':' || v_slot.id || ':' || v_member,
      jsonb_build_object('starts_at', v_slot.starts_at));
  end loop;
  perform private.log_application_activity(v_actor, v_app,
    case when v_previous.id is null then 'interview_scheduled' else 'interview_rescheduled' end,
    jsonb_build_object('from', v_previous.starts_at, 'to', v_slot.starts_at, 'by_candidate', true));
  perform private.log_governance_event(
    v_actor, 'self', case when v_previous.id is null then 'recruitment_interview_scheduled' else 'recruitment_interview_rescheduled' end,
    'recruitment', (select organization_id from public.recruitment_campaigns where id = v_app.campaign_id), null, 'application', v_app.id,
    jsonb_build_object('campaign_id', v_app.campaign_id, 'slot_id', v_slot.id));
  return jsonb_build_object('status', 'scheduled', 'slot_id', v_slot.id, 'already', false);
end;
$$;

-- The team moves an interview to another free slot (or the candidate's
-- booking is undone so they choose again).
create or replace function public.reschedule_interview(p_interview_id uuid, p_slot_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
  v_slot public.recruitment_interview_slots%rowtype;
  v_previous public.recruitment_interview_slots%rowtype;
begin
  select * into v_interview from public.recruitment_interviews where id = p_interview_id for update;
  if not found then
    raise exception 'interview_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_interview.application_id, 'interviews');
  if v_interview.status not in ('invited', 'scheduled') then
    raise exception 'interview_closed' using errcode = 'P0001';
  end if;
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  select * into v_previous from public.recruitment_interview_slots where id = v_interview.slot_id;
  if p_slot_id is null then
    update public.recruitment_interviews set status = 'invited', slot_id = null, scheduled_at = null, version = version + 1
     where id = p_interview_id;
  else
    select * into v_slot from public.recruitment_interview_slots where id = p_slot_id and campaign_id = v_interview.campaign_id for update;
    if not found or v_slot.cancelled_at is not null or v_slot.starts_at <= now()
       or (v_slot.position_id is not null and v_slot.position_id <> v_app.position_id) then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    end if;
    if v_slot.id = v_previous.id then
      return;
    end if;
    perform private.take_interview_slot(v_interview, v_slot);
  end if;
  insert into public.application_events (application_id, action, details)
  values (v_app.id, 'interview_rescheduled', jsonb_build_object('from', v_previous.starts_at, 'to', v_slot.starts_at));
  perform private.enqueue_application_message(v_app, 'recruitment_interview_rescheduled',
    'interview:' || p_interview_id || ':moved:' || coalesce(v_slot.id::text, 'none') || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('starts_at', v_slot.starts_at, 'ends_at', v_slot.ends_at, 'previous_starts_at', v_previous.starts_at,
                       'choose_again', v_slot.id is null));
  perform private.log_application_activity(v_actor, v_app, 'interview_rescheduled',
    jsonb_build_object('from', v_previous.starts_at, 'to', v_slot.starts_at, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  perform private.log_application_audit(v_actor, v_app, 'interviews', 'recruitment_interview_rescheduled',
    jsonb_build_object('slot_id', v_slot.id), nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

create or replace function public.cancel_interview(p_interview_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_interview from public.recruitment_interviews where id = p_interview_id for update;
  if not found then
    raise exception 'interview_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_interview.application_id, 'interviews');
  if v_interview.status not in ('invited', 'scheduled') then
    raise exception 'interview_closed' using errcode = 'P0001';
  end if;
  update public.recruitment_interviews
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = v_reason, version = version + 1
   where id = p_interview_id;
  insert into public.application_events (application_id, action) values (v_app.id, 'interview_cancelled');
  perform private.enqueue_application_message(v_app, 'recruitment_interview_cancelled', 'interview:' || p_interview_id || ':cancelled');
  perform private.log_application_activity(v_actor, v_app, 'interview_cancelled', jsonb_build_object('reason', v_reason));
  perform private.log_application_audit(v_actor, v_app, 'interviews', 'recruitment_interview_cancelled', '{}'::jsonb, v_reason);
end;
$$;

-- It took place (or the candidate did not come). An interviewer of the slot
-- or an organizer records it, once the slot has started.
create or replace function public.complete_interview(p_interview_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_interview public.recruitment_interviews%rowtype;
  v_app public.applications%rowtype;
  v_slot public.recruitment_interview_slots%rowtype;
begin
  select * into v_interview from public.recruitment_interviews where id = p_interview_id for update;
  if not found or not private.can_assess_interview(v_actor, v_interview) then
    raise exception 'interview_not_found' using errcode = 'P0001';
  end if;
  if p_outcome not in ('completed', 'no_show') then
    raise exception 'interview_outcome_invalid' using errcode = 'P0001';
  end if;
  if v_interview.status <> 'scheduled' then
    raise exception 'interview_closed' using errcode = 'P0001';
  end if;
  select * into v_slot from public.recruitment_interview_slots where id = v_interview.slot_id;
  if v_slot.starts_at > now() then
    raise exception 'interview_not_started' using errcode = 'P0001';
  end if;
  update public.recruitment_interviews
     set status = p_outcome, completed_at = now(), completed_by = v_actor, version = version + 1
   where id = p_interview_id;
  select * into v_app from public.applications where id = v_interview.application_id;
  if p_outcome = 'completed' then
    insert into public.application_events (application_id, action) values (v_app.id, 'interview_completed');
  end if;
  perform private.log_application_activity(v_actor, v_app, 'interview_' || p_outcome, '{}'::jsonb);
end;
$$;

-- ---- Questions to the candidate ----------------------------------------------------------------------

create or replace function public.request_clarification(
  p_application_id uuid, p_question text, p_due_at timestamptz default null, p_allows_documents boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_question text := btrim(coalesce(p_question, ''));
  v_id uuid;
begin
  v_app := private.application_for(v_actor, p_application_id, 'shortlist', true);
  if v_app.status <> 'submitted' then
    raise exception 'application_withdrawn' using errcode = 'P0001';
  end if;
  if private.application_decided(v_app.id) then
    raise exception 'application_decided' using errcode = 'P0001';
  end if;
  if char_length(v_question) not between 3 and 2000 then
    raise exception 'question_invalid' using errcode = 'P0001';
  end if;
  if p_due_at is not null and (p_due_at <= now() + interval '1 hour' or p_due_at > now() + interval '60 days') then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if (select count(*) from public.recruitment_clarifications where application_id = v_app.id and status = 'open') >= 3
     or (select count(*) from public.recruitment_clarifications where application_id = v_app.id) >= 10 then
    raise exception 'clarification_limit' using errcode = 'P0001';
  end if;
  insert into public.recruitment_clarifications (application_id, campaign_id, question, allows_documents, asked_by, due_at, original_due_at)
  values (v_app.id, v_app.campaign_id, v_question, coalesce(p_allows_documents, false), v_actor, p_due_at, p_due_at)
  returning id into v_id;
  insert into public.application_events (application_id, action) values (v_app.id, 'clarification_requested');
  perform private.enqueue_application_message(v_app, 'recruitment_clarification_requested', 'clarification:' || v_id || ':asked',
    jsonb_build_object('due_at', p_due_at, 'message', private.render_recruitment_template(v_app, 'clarification')));
  perform private.log_application_activity(v_actor, v_app, 'clarification_requested', jsonb_build_object('due_at', p_due_at));
  perform private.log_application_audit(v_actor, v_app, 'shortlist', 'recruitment_clarification_requested');
  return v_id;
end;
$$;

-- More time: the new deadline is recorded next to the previous ones.
create or replace function public.extend_clarification(p_clarification_id uuid, p_due_at timestamptz, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_q public.recruitment_clarifications%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_q from public.recruitment_clarifications where id = p_clarification_id for update;
  if not found then
    raise exception 'clarification_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_q.application_id, 'shortlist');
  if v_q.status <> 'open' then
    raise exception 'clarification_closed' using errcode = 'P0001';
  end if;
  if p_due_at is null or p_due_at <= now() + interval '1 hour' or p_due_at > now() + interval '60 days'
     or (v_q.due_at is not null and p_due_at <= v_q.due_at) then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  update public.recruitment_clarifications
     set due_at = p_due_at,
         extensions = extensions || jsonb_build_array(jsonb_build_object(
           'from', v_q.due_at, 'to', p_due_at, 'at', now(), 'by_name', private.person_name(v_actor),
           'reason', nullif(left(btrim(coalesce(p_reason, '')), 300), '')))
   where id = p_clarification_id;
  insert into public.application_events (application_id, action, details)
  values (v_app.id, 'clarification_extended', jsonb_build_object('to', p_due_at));
  perform private.enqueue_application_message(v_app, 'recruitment_clarification_extended',
    'clarification:' || p_clarification_id || ':extended:' || extract(epoch from p_due_at)::bigint, jsonb_build_object('due_at', p_due_at));
  perform private.log_application_activity(v_actor, v_app, 'clarification_extended', jsonb_build_object('from', v_q.due_at, 'to', p_due_at));
  perform private.log_application_audit(v_actor, v_app, 'shortlist', 'recruitment_clarification_extended', '{}'::jsonb,
                                        nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

create or replace function public.cancel_clarification(p_clarification_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_q public.recruitment_clarifications%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_q from public.recruitment_clarifications where id = p_clarification_id for update;
  if not found then
    raise exception 'clarification_not_found' using errcode = 'P0001';
  end if;
  v_app := private.application_for(v_actor, v_q.application_id, 'shortlist');
  if v_q.status <> 'open' then
    raise exception 'clarification_closed' using errcode = 'P0001';
  end if;
  update public.application_documents set status = 'removed', removed_at = now()
   where clarification_id = p_clarification_id and status <> 'removed';
  update public.recruitment_clarifications
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
         cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where id = p_clarification_id;
  insert into public.application_events (application_id, action) values (v_app.id, 'clarification_cancelled');
  perform private.log_application_activity(v_actor, v_app, 'clarification_cancelled', '{}'::jsonb);
end;
$$;

-- A question of the caller's own, still open and on time.
create or replace function private.my_open_clarification(p_actor uuid, p_clarification_id uuid)
returns public.recruitment_clarifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.recruitment_clarifications%rowtype;
begin
  select q.* into v_q
    from public.recruitment_clarifications q join public.applications a on a.id = q.application_id
   where q.id = p_clarification_id and a.candidate_id = p_actor and a.status = 'submitted'
   for update of q;
  if not found then
    raise exception 'clarification_not_found' using errcode = 'P0001';
  end if;
  if v_q.status <> 'open' or (v_q.due_at is not null and now() >= v_q.due_at) then
    raise exception 'clarification_closed' using errcode = 'P0001';
  end if;
  return v_q;
end;
$$;

-- The candidate answers, once. Files not confirmed by now are not part of it.
create or replace function public.answer_clarification(p_clarification_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_q public.recruitment_clarifications%rowtype;
  v_app public.applications%rowtype;
  v_answer text := btrim(coalesce(p_answer, ''));
begin
  select q.* into v_q
    from public.recruitment_clarifications q join public.applications a on a.id = q.application_id
   where q.id = p_clarification_id and a.candidate_id = v_actor;
  if found and v_q.status = 'answered' then
    return jsonb_build_object('status', 'answered', 'answered_at', v_q.answered_at, 'already', true);
  end if;
  v_q := private.my_open_clarification(v_actor, p_clarification_id);
  if char_length(v_answer) not between 1 and 4000 then
    raise exception 'answer_invalid' using errcode = 'P0001';
  end if;
  update public.application_documents set status = 'removed', removed_at = now()
   where clarification_id = p_clarification_id and status = 'pending';
  update public.recruitment_clarifications set status = 'answered', answer = v_answer, answered_at = now()
   where id = p_clarification_id
  returning * into v_q;
  select * into v_app from public.applications where id = v_q.application_id;
  insert into public.application_events (application_id, action) values (v_app.id, 'clarification_answered');
  if v_q.asked_by is not null and private.application_can(v_q.asked_by, v_app, 'view') then
    perform private.enqueue_team_message(v_q.asked_by, v_app, 'recruitment_clarification_answered', 'clarification:' || v_q.id || ':answered');
  end if;
  perform private.log_application_activity(v_actor, v_app, 'clarification_answered',
    jsonb_build_object('documents', (select count(*) from public.application_documents where clarification_id = v_q.id and status = 'ready')));
  perform private.log_governance_event(
    v_actor, 'self', 'recruitment_clarification_answered', 'recruitment',
    (select organization_id from public.recruitment_campaigns where id = v_app.campaign_id), null, 'application', v_app.id,
    jsonb_build_object('campaign_id', v_app.campaign_id));
  return jsonb_build_object('status', 'answered', 'answered_at', v_q.answered_at, 'already', false);
end;
$$;

-- Files with an answer: the same reserve → upload (candidate's session) →
-- confirm sequence as the application's documents. PDF, Word, JPEG or PNG,
-- 10 MB, three files per question.
create or replace function public.reserve_clarification_document(
  p_clarification_id uuid, p_file_name text, p_mime_type text, p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_q public.recruitment_clarifications%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_name text := left(btrim(regexp_replace(coalesce(p_file_name, ''), '[[:cntrl:]/\\]+', ' ', 'g')), 120);
begin
  v_q := private.my_open_clarification(v_actor, p_clarification_id);
  if not v_q.allows_documents then
    raise exception 'documents_not_requested' using errcode = 'P0001';
  end if;
  if p_mime_type is null or p_mime_type not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                                'image/jpeg', 'image/png') then
    raise exception 'document_type_refused' using errcode = 'P0001';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 10485760 then
    raise exception 'document_too_large' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_documents d
       where d.clarification_id = p_clarification_id
         and (d.status = 'ready' or (d.status = 'pending' and d.created_at > now() - interval '15 minutes'))) >= 3 then
    raise exception 'too_many_documents' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_documents d join public.applications a on a.id = d.application_id
       where a.candidate_id = v_actor and d.created_at > now() - interval '1 hour') >= 40 then
    raise exception 'document_rate_limited' using errcode = 'P0001';
  end if;
  v_path := 'applications/' || v_q.application_id || '/' || v_id;
  insert into public.application_documents (id, application_id, question_id, object_path, file_name, mime_type, size_bytes, clarification_id)
  values (v_id, v_q.application_id, 'clarification', v_path, coalesce(nullif(v_name, ''), 'document'), p_mime_type, p_size_bytes,
          p_clarification_id);
  return jsonb_build_object('document_id', v_id, 'object_path', v_path);
end;
$$;

create or replace function public.confirm_clarification_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
begin
  select * into v_doc from public.application_documents where id = p_document_id and clarification_id is not null for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  perform private.my_open_clarification(v_actor, v_doc.clarification_id);
  if v_doc.status <> 'pending' then
    return jsonb_build_object('document_id', v_doc.id, 'status', v_doc.status);
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruitment-documents' and o.name = v_doc.object_path) then
    raise exception 'document_not_uploaded' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_documents where clarification_id = v_doc.clarification_id and status = 'ready') >= 3 then
    raise exception 'too_many_documents' using errcode = 'P0001';
  end if;
  update public.application_documents set status = 'ready', confirmed_at = now() where id = p_document_id;
  return jsonb_build_object('document_id', v_doc.id, 'status', 'ready');
end;
$$;

create or replace function public.remove_clarification_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
begin
  select * into v_doc from public.application_documents where id = p_document_id and clarification_id is not null for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  perform private.my_open_clarification(v_actor, v_doc.clarification_id);
  if v_doc.status <> 'removed' then
    update public.application_documents set status = 'removed', removed_at = now() where id = p_document_id;
  end if;
  return jsonb_build_object('object_path', v_doc.object_path);
end;
$$;

-- ---- Storage: the candidate also uploads (and removes) files of an open question --------------------

create or replace function private.can_upload_application_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.application_documents d
      join public.applications a on a.id = d.application_id
      left join public.recruitment_clarifications q on q.id = d.clarification_id
     where d.object_path = p_name and d.status = 'pending' and a.candidate_id = (select auth.uid())
       and ((d.clarification_id is null and a.status = 'draft')
            or (d.clarification_id is not null and a.status = 'submitted' and q.status = 'open'
                and (q.due_at is null or now() < q.due_at))));
$$;

create or replace function private.can_delete_application_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.application_documents d
      join public.applications a on a.id = d.application_id
      left join public.recruitment_clarifications q on q.id = d.clarification_id
     where d.object_path = p_name and d.status in ('removed', 'pending') and a.candidate_id = (select auth.uid())
       and ((d.clarification_id is null and a.status = 'draft')
            or (d.clarification_id is not null and q.status = 'open')));
$$;

-- ---- Grants -----------------------------------------------------------------------------------------

revoke all on function private.template_placeholders_ok(text) from public, anon, authenticated, service_role;
revoke all on function private.render_recruitment_template(public.applications, text) from public, anon, authenticated, service_role;
revoke all on function private.interviewer_busy(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function private.slot_details(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.slot_member_ids(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.take_interview_slot(public.recruitment_interviews, public.recruitment_interview_slots) from public, anon, authenticated, service_role;
revoke all on function private.my_open_clarification(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_upload_application_document(text) from public, anon, authenticated, service_role;
revoke all on function private.can_delete_application_document(text) from public, anon, authenticated, service_role;
grant execute on function private.can_upload_application_document(text) to authenticated;
grant execute on function private.can_delete_application_document(text) to authenticated;

revoke all on function public.save_recruitment_template(uuid, text, text) from public, anon;
revoke all on function public.create_interview_slots(uuid, uuid, timestamptz[], integer, text, text, text, text, uuid[]) from public, anon;
revoke all on function public.update_interview_slot(uuid, text, text, text, uuid[]) from public, anon;
revoke all on function public.cancel_interview_slot(uuid, text) from public, anon;
revoke all on function public.invite_to_interview(uuid[], text, timestamptz) from public, anon;
revoke all on function public.book_interview_slot(uuid, uuid) from public, anon;
revoke all on function public.reschedule_interview(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_interview(uuid, text) from public, anon;
revoke all on function public.complete_interview(uuid, text) from public, anon;
revoke all on function public.request_clarification(uuid, text, timestamptz, boolean) from public, anon;
revoke all on function public.extend_clarification(uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_clarification(uuid, text) from public, anon;
revoke all on function public.answer_clarification(uuid, text) from public, anon;
revoke all on function public.reserve_clarification_document(uuid, text, text, integer) from public, anon;
revoke all on function public.confirm_clarification_document(uuid) from public, anon;
revoke all on function public.remove_clarification_document(uuid) from public, anon;

grant execute on function public.save_recruitment_template(uuid, text, text) to authenticated;
grant execute on function public.create_interview_slots(uuid, uuid, timestamptz[], integer, text, text, text, text, uuid[]) to authenticated;
grant execute on function public.update_interview_slot(uuid, text, text, text, uuid[]) to authenticated;
grant execute on function public.cancel_interview_slot(uuid, text) to authenticated;
grant execute on function public.invite_to_interview(uuid[], text, timestamptz) to authenticated;
grant execute on function public.book_interview_slot(uuid, uuid) to authenticated;
grant execute on function public.reschedule_interview(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_interview(uuid, text) to authenticated;
grant execute on function public.complete_interview(uuid, text) to authenticated;
grant execute on function public.request_clarification(uuid, text, timestamptz, boolean) to authenticated;
grant execute on function public.extend_clarification(uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_clarification(uuid, text) to authenticated;
grant execute on function public.answer_clarification(uuid, text) to authenticated;
grant execute on function public.reserve_clarification_document(uuid, text, text, integer) to authenticated;
grant execute on function public.confirm_clarification_document(uuid) to authenticated;
grant execute on function public.remove_clarification_document(uuid) to authenticated;
