-- Phase 9 · What each person may read: the candidate's projection, the
-- reviewer's work, the application in full, the committee, interviews,
-- decisions, files, the export and data-rights reports.
--
-- Every read asks private.application_can (or private.campaign_can) row by
-- row inside the database: nothing is fetched first and hidden afterwards.
-- Opening an application or one of its files is recorded.

-- ---- Names ----------------------------------------------------------------------------------------

create or replace function private.candidate_name(p_app public.applications)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(concat_ws(' ', p_app.candidate_snapshot ->> 'first_name', p_app.candidate_snapshot ->> 'last_name')), ''),
                  p_app.candidate_snapshot ->> 'display_name', 'Candidature ' || p_app.reference);
$$;

-- ---- The candidate's view: a projection, never the pipeline ---------------------------------------

-- What the candidate is told about where their application stands, and what
-- they have to do. Internal stages (shortlisted, decision proposed or
-- finalized) never show: until a release, a submitted application is
-- "received", then "being examined" once someone started reviewing it.
create or replace function private.candidate_status(p_app public.applications)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decision public.recruitment_decisions%rowtype;
  v_offer public.recruitment_offers%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_q public.recruitment_clarifications%rowtype;
begin
  if p_app.status = 'draft' then
    return jsonb_build_object('key', 'draft');
  end if;
  if p_app.status = 'withdrawn' then
    return jsonb_build_object('key', 'withdrawn', 'since', p_app.withdrawn_at);
  end if;
  select * into v_decision from public.recruitment_decisions
   where application_id = p_app.id and status = 'released' order by released_at desc limit 1;
  if found and v_decision.outcome = 'offer' then
    select * into v_offer from public.recruitment_offers where decision_id = v_decision.id;
    return jsonb_build_object(
      'key', case v_offer.status when 'pending' then case when v_offer.expires_at is not null and v_offer.expires_at <= now()
                                                          then 'offer_expired' else 'offer' end
                                 else 'offer_' || v_offer.status end,
      'since', v_decision.released_at, 'deadline', v_offer.expires_at);
  elsif found and v_decision.outcome = 'reject' then
    return jsonb_build_object('key', 'not_selected', 'since', v_decision.released_at);
  end if;
  select * into v_q from public.recruitment_clarifications
   where application_id = p_app.id and status = 'open' and (due_at is null or due_at > now()) order by asked_at limit 1;
  if found then
    return jsonb_build_object('key', 'question', 'since', v_q.asked_at, 'deadline', v_q.due_at);
  end if;
  select * into v_interview from public.recruitment_interviews
   where application_id = p_app.id and status in ('invited', 'scheduled') limit 1;
  if found and v_interview.status = 'invited' then
    return jsonb_build_object('key', 'interview_to_book', 'since', v_interview.invited_at, 'deadline', v_interview.respond_by);
  elsif found then
    return jsonb_build_object('key', 'interview_scheduled', 'since', v_interview.scheduled_at,
                              'at', (select starts_at from public.recruitment_interview_slots where id = v_interview.slot_id));
  end if;
  if v_decision.id is not null then
    return jsonb_build_object('key', 'waitlisted', 'since', v_decision.released_at);
  end if;
  if exists (select 1 from public.application_events where application_id = p_app.id and action = 'review_started') then
    return jsonb_build_object('key', 'under_review',
                              'since', (select min(occurred_at) from public.application_events where application_id = p_app.id and action = 'review_started'));
  end if;
  return jsonb_build_object('key', 'received', 'since', p_app.submitted_at);
end;
$$;

create or replace function public.my_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'application', jsonb_build_object(
               'id', a.id, 'status', a.status, 'reference', a.reference, 'created_at', a.created_at,
               'updated_at', a.updated_at, 'last_saved_at', a.last_saved_at, 'submitted_at', a.submitted_at,
               'withdrawn_at', a.withdrawn_at,
               'refusal', case when a.status = 'draft' then private.position_refusal(p, c) end,
               'progress', case when a.status = 'draft' then private.application_progress(a) end,
               'stage', private.candidate_status(a)),
             'campaign', case when private.campaign_is_public(c) then private.campaign_card(c)
                              else jsonb_build_object('id', c.id, 'slug', null, 'title', c.title,
                                                      'organization', private.organization_card(c.organization_id),
                                                      'state', private.campaign_state(c), 'closes_at', c.closes_at,
                                                      'cancellation_reason', c.cancellation_reason, 'unavailable', true) end,
             'position', jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title, 'team', p.team,
                                            'closes_at', private.position_closes(p, c)))
           order by case a.status when 'draft' then 0 when 'submitted' then 1 else 2 end, a.updated_at desc)
      from public.applications a
      join public.recruitment_campaigns c on c.id = a.campaign_id
      join public.recruitment_positions p on p.id = a.position_id
     where a.candidate_id = v_actor), '[]'::jsonb);
end;
$$;

-- One application, everything the candidate needs: the form and answers, and
-- now what the association asks of them (a slot to choose, a question, an
-- offer) and the outcome once released. Never a score, a note, a reviewer.
create or replace function public.my_application(p_application_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_position public.recruitment_positions%rowtype;
  v_schema jsonb;
  v_profile public.profiles%rowtype;
  v_interview public.recruitment_interviews%rowtype;
  v_slot public.recruitment_interview_slots%rowtype;
  v_decision public.recruitment_decisions%rowtype;
  v_offer public.recruitment_offers%rowtype;
begin
  select * into v_app from public.applications where id = p_application_id and candidate_id = v_actor;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  select * into v_position from public.recruitment_positions where id = v_app.position_id;
  select schema into v_schema from public.recruitment_form_versions where id = v_app.form_version_id;
  select * into v_profile from public.profiles where id = v_actor;
  select * into v_interview from public.recruitment_interviews
   where application_id = v_app.id and status in ('invited', 'scheduled') limit 1;
  if v_interview.slot_id is not null then
    select * into v_slot from public.recruitment_interview_slots where id = v_interview.slot_id;
  end if;
  select * into v_decision from public.recruitment_decisions
   where application_id = v_app.id and status = 'released' order by released_at desc limit 1;
  if v_decision.id is not null and v_decision.outcome = 'offer' then
    select * into v_offer from public.recruitment_offers where decision_id = v_decision.id;
  end if;
  return jsonb_build_object(
    'application', jsonb_build_object(
      'id', v_app.id, 'status', v_app.status, 'reference', v_app.reference, 'version', v_app.version,
      'answers', v_app.answers, 'created_at', v_app.created_at, 'updated_at', v_app.updated_at,
      'last_saved_at', v_app.last_saved_at, 'submitted_at', v_app.submitted_at, 'withdrawn_at', v_app.withdrawn_at,
      'withdrawal_reason', v_app.withdrawal_reason, 'privacy_acknowledged_at', v_app.privacy_acknowledged_at,
      'form_version', (select number from public.recruitment_form_versions where id = v_app.form_version_id),
      'form_changed', v_app.status = 'draft' and v_campaign.active_form_version_id is distinct from v_app.form_version_id,
      'refusal', case when v_app.status = 'draft' then private.position_refusal(v_position, v_campaign) end,
      'eligibility', case when v_app.status = 'draft' then private.application_eligibility(v_actor, v_position, v_campaign) end,
      'progress', case when v_app.status = 'draft' then private.application_progress(v_app) end,
      'stage', private.candidate_status(v_app)),
    'form', private.form_for_position(v_schema, v_app.position_id),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', d.id, 'question_id', d.question_id, 'file_name', d.file_name, 'mime_type', d.mime_type,
                             'size_bytes', d.size_bytes, 'status', d.status, 'created_at', d.created_at) order by d.created_at)
                             from public.application_documents d
                            where d.application_id = v_app.id and d.status = 'ready' and d.clarification_id is null), '[]'::jsonb),
    'campaign', (case when private.campaign_is_public(v_campaign) then private.campaign_card(v_campaign)
                      else jsonb_build_object('id', v_campaign.id, 'slug', null, 'title', v_campaign.title,
                                              'organization', private.organization_card(v_campaign.organization_id),
                                              'state', private.campaign_state(v_campaign), 'closes_at', v_campaign.closes_at,
                                              'cancellation_reason', v_campaign.cancellation_reason, 'unavailable', true) end)
                 || jsonb_build_object('contact', case when v_campaign.contact_name is null and v_campaign.contact_email is null then null
                                                       else jsonb_build_object('name', v_campaign.contact_name, 'role', v_campaign.contact_role,
                                                                               'email', v_campaign.contact_email) end),
    'position', jsonb_build_object('id', v_position.id, 'slug', v_position.slug, 'title', v_position.title, 'team', v_position.team,
                                   'closes_at', private.position_closes(v_position, v_campaign)),
    'candidate', coalesce(v_app.candidate_snapshot, jsonb_build_object(
      'first_name', v_profile.first_name, 'last_name', v_profile.last_name, 'display_name', v_profile.display_name,
      'email', (select u.email from auth.users u where u.id = v_actor),
      'program', v_profile.program, 'study_year', v_profile.study_year)),
    -- The live interview: the invitation, the free slots to choose from (room
    -- shown for in-person ones, never a link), and once booked the full details.
    'interview', case when v_interview.id is null then null else jsonb_build_object(
      'id', v_interview.id, 'status', v_interview.status, 'message', v_interview.message, 'respond_by', v_interview.respond_by,
      'invited_at', v_interview.invited_at,
      'slot', case when v_slot.id is null then null else jsonb_build_object(
                'id', v_slot.id, 'starts_at', v_slot.starts_at, 'ends_at', v_slot.ends_at, 'mode', v_slot.mode,
                'location', v_slot.location, 'meeting_link', v_slot.meeting_link, 'instructions', v_slot.instructions) end,
      'can_change', v_interview.status = 'invited' or v_slot.starts_at > now() + interval '24 hours',
      'slots', case when v_app.status = 'submitted' and (v_interview.status = 'invited' or v_slot.starts_at > now() + interval '24 hours') then
        coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mode', s.mode,
                                                      'location', case when s.mode = 'in_person' then s.location end)
                                   order by s.starts_at)
                    from (select s.* from public.recruitment_interview_slots s
                           where s.campaign_id = v_app.campaign_id and s.cancelled_at is null and s.starts_at > now()
                             and (s.position_id is null or s.position_id = v_app.position_id)
                             and s.id is distinct from v_slot.id
                             and not exists (select 1 from public.recruitment_interviews i
                                              where i.slot_id = s.id and i.status in ('scheduled', 'completed', 'no_show'))
                           order by s.starts_at limit 120) s), '[]'::jsonb) else '[]'::jsonb end) end,
    'clarifications', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', q.id, 'question', q.question, 'asked_at', q.asked_at, 'due_at', q.due_at,
                                  'status', case when q.status = 'open' and q.due_at is not null and q.due_at <= now() then 'closed' else q.status end,
                                  'answer', q.answer, 'answered_at', q.answered_at, 'allows_documents', q.allows_documents,
                                  'documents', coalesce((select jsonb_agg(jsonb_build_object(
                                                           'id', d.id, 'file_name', d.file_name, 'mime_type', d.mime_type,
                                                           'size_bytes', d.size_bytes, 'status', d.status) order by d.created_at)
                                                           from public.application_documents d
                                                          where d.clarification_id = q.id and d.status = 'ready'), '[]'::jsonb))
                                  order by q.asked_at)
                                 from public.recruitment_clarifications q
                                where q.application_id = v_app.id and q.status <> 'cancelled'), '[]'::jsonb),
    'outcome', case when v_decision.id is null then null else jsonb_build_object(
      'outcome', v_decision.outcome, 'released_at', v_decision.released_at, 'message', v_decision.message,
      'offer', case when v_offer.id is null then null else jsonb_build_object(
        'id', v_offer.id, 'status', case when v_offer.status = 'pending' and v_offer.expires_at is not null and v_offer.expires_at <= now()
                                         then 'expired' else v_offer.status end,
        'expires_at', v_offer.expires_at, 'responded_at', v_offer.responded_at) end) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.occurred_at, 'details', e.details)
                                          order by e.occurred_at)
                           from public.application_events e where e.application_id = v_app.id), '[]'::jsonb),
    'privacy', public.public_recruitment_privacy());
end;
$$;

-- ---- The reviewer's own work, across associations ---------------------------------------------------

-- The campaigns the caller works on right now (a key within the seal, or an
-- appointment), with their own counts. The default page of a reviewer.
create or replace function public.my_recruitment_work()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'campaign', jsonb_build_object('id', c.id, 'title', c.title, 'academic_year', c.academic_year,
                                            'state', private.campaign_state(c), 'closes_at', c.closes_at,
                                            'archived', c.archived_at is not null),
             'organization', private.organization_card(c.organization_id),
             'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, c, k))),
             'member', (select jsonb_build_object('id', cm.id, 'role', cm.role, 'scope', cm.scope, 'ends_at', cm.ends_at)
                          from public.recruitment_committee_members cm where cm.id = private.live_committee_member_id(v_actor, c.id)),
             'assigned', (select count(*) from public.recruitment_review_assignments ra
                           where ra.member_id = private.live_committee_member_id(v_actor, c.id) and ra.removed_at is null),
             'to_review', (select count(*) from public.recruitment_review_assignments ra
                            join public.applications a on a.id = ra.application_id
                           where ra.member_id = private.live_committee_member_id(v_actor, c.id) and ra.removed_at is null
                             and a.status = 'submitted'
                             and not exists (select 1 from public.recruitment_reviews r
                                              where r.application_id = a.id and r.reviewer_id = v_actor and r.kind = 'application'
                                                and r.status = 'submitted')),
             'interviews', (select count(*) from public.recruitment_interviews i
                              join public.recruitment_slot_interviewers si on si.slot_id = i.slot_id
                              join public.recruitment_interview_slots s on s.id = i.slot_id
                             where si.member_id = private.live_committee_member_id(v_actor, c.id) and i.status = 'scheduled'
                               and s.ends_at > now()),
             'to_approve', case when private.campaign_can(v_actor, c, 'approve') then
                             (select count(*) from public.recruitment_decisions d
                               where d.campaign_id = c.id and d.status = 'proposed'
                                 and not exists (select 1 from public.recruitment_decision_approvals x where x.decision_id = d.id and x.approver_id = v_actor)
                                 and private.application_can(v_actor, (select a from public.applications a where a.id = d.application_id), 'approve'))
                           end,
             'submitted', case when private.campaign_can(v_actor, c, 'committee') then
                            (select count(*) from public.applications a where a.campaign_id = c.id and a.status = 'submitted') end)
           order by (c.archived_at is not null), c.closes_at desc nulls last)
      from public.recruitment_campaigns c
     where c.first_published_at is not null
       and private.campaign_can(v_actor, c, 'view')
       and (exists (select 1 from public.memberships m where m.user_id = v_actor and m.organization_id = c.organization_id and m.status = 'active'))
  ), '[]'::jsonb);
end;
$$;

-- ---- One campaign: what the caller may do (the tabs of its pages) -----------------------------------

create or replace function public.recruitment_campaign_access(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_powers text[];
  v_editor boolean;
begin
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  v_powers := array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k));
  v_editor := exists (select 1 from unnest(array['recruitment.campaigns.manage', 'recruitment.questions.manage', 'recruitment.campaigns.publish']) k
                       where private.user_has_organization_permission(v_actor, v_campaign.organization_id, k, now()));
  if cardinality(v_powers) = 0 and not v_editor then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_campaign.id, 'title', v_campaign.title, 'state', private.campaign_state(v_campaign),
    'published', v_campaign.first_published_at is not null, 'archived', v_campaign.archived_at is not null,
    'powers', to_jsonb(v_powers), 'editor', v_editor,
    'candidate', private.candidate_in_campaign(v_actor, p_campaign_id));
end;
$$;

-- ---- One campaign: the command centre ---------------------------------------------------------------

-- How the review stands, counted over the applications the caller may open
-- (the whole campaign for a manager, their positions or assignments for a
-- reviewer). Never a name here.
create or replace function public.recruitment_campaign_board(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'view');
  return (
    with mine as (
      select a.*, pl.stage,
             (select d.status from public.recruitment_decisions d
               where d.application_id = a.id and d.status in ('proposed', 'finalized', 'released')
               order by d.created_at desc limit 1) as decision,
             private.counted_reviews(a.id) as reviews,
             exists (select 1 from public.recruitment_review_assignments ra where ra.application_id = a.id and ra.removed_at is null) as assigned
        from public.applications a
        join public.application_pipeline pl on pl.application_id = a.id
       where a.campaign_id = p_campaign_id and a.status <> 'draft' and private.application_can(v_actor, a, 'view')
    )
    select jsonb_build_object(
      'campaign', private.campaign_summary(v_campaign) || jsonb_build_object(
                    'required_reviews', v_campaign.required_reviews, 'approval_policy', v_campaign.approval_policy,
                    'sealed', private.campaign_sealed_at(v_campaign) is not null and now() >= private.campaign_sealed_at(v_campaign)),
      'organization', private.organization_card(v_campaign.organization_id),
      'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k))),
      'member', (select jsonb_build_object('id', cm.id, 'role', cm.role, 'scope', cm.scope, 'ends_at', cm.ends_at)
                   from public.recruitment_committee_members cm where cm.id = private.live_committee_member_id(v_actor, p_campaign_id)),
      'counts', jsonb_build_object(
        'received', (select count(*) from mine),
        'withdrawn', (select count(*) from mine where status = 'withdrawn'),
        'new', (select count(*) from mine where status = 'submitted' and stage = 'new' and decision is null),
        'under_review', (select count(*) from mine where status = 'submitted' and stage = 'under_review' and decision is null),
        'shortlisted', (select count(*) from mine where status = 'submitted' and stage = 'shortlisted' and decision is null),
        'interview', (select count(*) from mine where status = 'submitted' and stage = 'interview' and decision is null),
        'decision_pending', (select count(*) from mine where status = 'submitted' and decision = 'proposed'),
        'finalized', (select count(*) from mine where status = 'submitted' and decision = 'finalized'),
        'released', (select count(*) from mine where decision = 'released'),
        'interviews_scheduled', (select count(*) from public.recruitment_interviews i join mine on mine.id = i.application_id
                                  where i.status = 'scheduled')),
      'positions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'title', p.title, 'openings', p.openings, 'retired', p.retired_at is not null,
                 'offers', private.position_offers(p.id, null),
                 'total', (select count(*) from mine where mine.position_id = p.id and mine.status = 'submitted'),
                 'not_assigned', (select count(*) from mine where mine.position_id = p.id and mine.status = 'submitted'
                                                               and not mine.assigned and mine.reviews = 0),
                 'awaiting', (select count(*) from mine where mine.position_id = p.id and mine.status = 'submitted'
                                                           and mine.assigned and mine.reviews = 0),
                 'partial', (select count(*) from mine where mine.position_id = p.id and mine.status = 'submitted'
                                                          and mine.reviews > 0 and mine.reviews < v_campaign.required_reviews),
                 'complete', (select count(*) from mine where mine.position_id = p.id and mine.status = 'submitted'
                                                           and mine.reviews >= greatest(v_campaign.required_reviews, 1)))
               order by p.display_order, p.id)
          from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
      'mine', jsonb_build_object(
        'assigned', (select count(*) from public.recruitment_review_assignments ra
                      where ra.member_id = private.live_committee_member_id(v_actor, p_campaign_id) and ra.removed_at is null),
        'reviewed', (select count(*) from public.recruitment_reviews r
                      where r.campaign_id = p_campaign_id and r.reviewer_id = v_actor and r.kind = 'application' and r.status = 'submitted'),
        'drafts', (select count(*) from public.recruitment_reviews r
                    where r.campaign_id = p_campaign_id and r.reviewer_id = v_actor and r.status = 'draft')),
      'rubric', (select jsonb_build_object('number', number, 'criteria', jsonb_array_length(criteria))
                   from public.recruitment_rubric_versions where campaign_id = p_campaign_id and kind = 'application' and status = 'published'),
      'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'state', private.campaign_state(c))
                                              order by c.closes_at desc nulls last)
                               from public.recruitment_campaigns c
                              where c.organization_id = v_campaign.organization_id and c.first_published_at is not null
                                and private.campaign_can(v_actor, c, 'view')), '[]'::jsonb))
  );
end;
$$;

-- ---- The applicant list --------------------------------------------------------------------------

-- Filtered, sorted and paged in the database, over the applications the
-- caller may open. No answer, no file, no note: names, position, dates and
-- where each application stands.
create or replace function public.recruitment_application_list(
  p_campaign_id uuid, p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_q text := private.fold_accents(btrim(coalesce(p_filters ->> 'q', '')));
  v_position uuid;
  v_member uuid;
  v_tag uuid;
  v_stage text := nullif(p_filters ->> 'stage', '');
  v_review text := nullif(p_filters ->> 'review', '');
  v_sort text := coalesce(nullif(p_filters ->> 'sort', ''), 'submitted_desc');
  v_from timestamptz;
  v_to timestamptz;
  v_team boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'view');
  begin
    v_position := nullif(p_filters ->> 'position', '')::uuid;
    v_member := nullif(p_filters ->> 'reviewer', '')::uuid;
    v_tag := nullif(p_filters ->> 'tag', '')::uuid;
    v_from := nullif(p_filters ->> 'from', '')::timestamptz;
    v_to := nullif(p_filters ->> 'to', '')::timestamptz;
  exception when others then
    raise exception 'filter_invalid' using errcode = 'P0001';
  end;
  v_team := private.campaign_can(v_actor, v_campaign, 'view_team');
  return (
    with base as (
      select a.*, pl.stage, p.title as position_title,
             private.candidate_name(a) as name,
             (select jsonb_build_object('id', d.id, 'status', d.status, 'outcome', d.outcome) from public.recruitment_decisions d
               where d.application_id = a.id and d.status in ('proposed', 'finalized', 'released')
               order by d.created_at desc limit 1) as decision,
             private.counted_reviews(a.id) as reviews,
             (select r.status from public.recruitment_reviews r
               where r.application_id = a.id and r.reviewer_id = v_actor and r.kind = 'application') as my_review
        from public.applications a
        join public.application_pipeline pl on pl.application_id = a.id
        join public.recruitment_positions p on p.id = a.position_id
       where a.campaign_id = p_campaign_id and a.status <> 'draft'
         and (v_position is null or a.position_id = v_position)
         and (v_from is null or a.submitted_at >= v_from)
         and (v_to is null or a.submitted_at < v_to)
         and (v_tag is null or exists (select 1 from public.application_tags t where t.application_id = a.id and t.tag_id = v_tag))
         and (v_member is null or exists (select 1 from public.recruitment_review_assignments ra
                                           where ra.application_id = a.id and ra.member_id = v_member and ra.removed_at is null))
         and (v_q = '' or private.fold_accents(concat_ws(' ', a.candidate_snapshot ->> 'first_name', a.candidate_snapshot ->> 'last_name',
                                                          a.candidate_snapshot ->> 'display_name')) like '%' || v_q || '%'
              or lower(a.reference) = lower(v_q))
         and private.application_can(v_actor, a, 'view')
    ), filtered as (
      select * from base b
       where (v_stage is null
              or (v_stage = 'withdrawn' and b.status = 'withdrawn')
              or (v_stage in ('new', 'under_review', 'shortlisted', 'interview') and b.status = 'submitted' and b.stage = v_stage
                  and b.decision is null)
              or (v_stage = 'decision_pending' and b.status = 'submitted' and b.decision ->> 'status' = 'proposed')
              or (v_stage = 'finalized' and b.status = 'submitted' and b.decision ->> 'status' = 'finalized')
              or (v_stage = 'released' and b.decision ->> 'status' = 'released'))
         and (v_review is null
              or (v_review = 'none' and b.reviews = 0
                  and not exists (select 1 from public.recruitment_review_assignments ra where ra.application_id = b.id and ra.removed_at is null))
              or (v_review = 'awaiting' and b.reviews = 0
                  and exists (select 1 from public.recruitment_review_assignments ra where ra.application_id = b.id and ra.removed_at is null))
              or (v_review = 'partial' and b.reviews > 0 and b.reviews < v_campaign.required_reviews)
              or (v_review = 'complete' and b.reviews >= greatest(v_campaign.required_reviews, 1))
              or (v_review = 'mine_todo' and b.status = 'submitted' and coalesce(b.my_review, 'none') <> 'submitted'
                  and exists (select 1 from public.recruitment_review_assignments ra
                               where ra.application_id = b.id and ra.removed_at is null
                                 and ra.member_id = private.live_committee_member_id(v_actor, p_campaign_id)))
              or (v_review = 'mine_done' and b.my_review = 'submitted'))
    ), page as (
      select * from filtered f
       order by case when v_sort = 'name' then f.name end,
                case when v_sort = 'submitted_asc' then f.submitted_at end,
                f.submitted_at desc, f.id
       limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'limit', v_limit, 'offset', v_offset,
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', pg.id, 'reference', pg.reference, 'name', pg.name, 'status', pg.status,
                 'program', pg.candidate_snapshot ->> 'program', 'study_year', pg.candidate_snapshot -> 'study_year',
                 'position', jsonb_build_object('id', pg.position_id, 'title', pg.position_title),
                 'submitted_at', pg.submitted_at, 'withdrawn_at', pg.withdrawn_at, 'stage', pg.stage, 'decision', pg.decision,
                 'reviews', jsonb_build_object('counted', pg.reviews, 'required', v_campaign.required_reviews, 'mine', pg.my_review),
                 'assigned', coalesce((select jsonb_agg(private.person_name(cm.user_id) order by ra.assigned_at)
                                         from public.recruitment_review_assignments ra
                                         join public.recruitment_committee_members cm on cm.id = ra.member_id
                                        where ra.application_id = pg.id and ra.removed_at is null), '[]'::jsonb),
                 'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label)
                                     from public.application_tags at join public.recruitment_tags t on t.id = at.tag_id
                                    where at.application_id = pg.id), '[]'::jsonb),
                 -- Others' scores only for those who may read the team's reviews.
                 'score', case when v_team then (
                            select round(avg((private.review_total(v.criteria, r.scores) ->> 'percent')::numeric), 1)
                              from public.recruitment_reviews r
                              join public.recruitment_rubric_versions v on v.id = r.rubric_version_id
                             where r.application_id = pg.id and r.kind = 'application' and r.status = 'submitted') end)
               order by case when v_sort = 'name' then pg.name end,
                        case when v_sort = 'submitted_asc' then pg.submitted_at end,
                        pg.submitted_at desc, pg.id) from page pg), '[]'::jsonb),
      'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label)
                          from public.recruitment_tags t where t.campaign_id = p_campaign_id), '[]'::jsonb),
      'reviewers', coalesce((select jsonb_agg(jsonb_build_object('id', cm.id, 'name', private.person_name(cm.user_id)) order by private.person_name(cm.user_id))
                               from public.recruitment_committee_members cm
                              where cm.campaign_id = p_campaign_id and cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id)
                                and 'review' = any (cm.powers)), '[]'::jsonb),
      'positions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) order by p.display_order, p.id)
                               from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
      'required_reviews', v_campaign.required_reviews,
      'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k)))));
end;
$$;

-- ---- One application, in full ----------------------------------------------------------------------

-- Everything the caller may see about one application, in two parts that
-- never mix: what the candidate sent (exact form version, answers, files,
-- answers to questions) and what the team produced (reviews, discussion,
-- interviews, decisions, history). Opening it is recorded (once per half hour).
create or replace function public.recruitment_application(p_application_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_app public.applications%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
  v_schema jsonb;
  v_can jsonb;
  v_docs boolean;
  v_team boolean;
  v_committee boolean;
  v_interviews boolean;
  v_decide boolean;
  v_open boolean;
begin
  v_app := private.application_for(v_actor, p_application_id, 'view');
  select * into v_campaign from public.recruitment_campaigns where id = v_app.campaign_id;
  select schema into v_schema from public.recruitment_form_versions where id = v_app.form_version_id;
  v_can := (select jsonb_object_agg(k, private.application_can(v_actor, v_app, k)) from unnest(private.recruitment_powers()) k)
           || jsonb_build_object('invite_members', private.user_has_organization_permission(v_actor, v_campaign.organization_id, 'members.invite', now()));
  v_docs := (v_can ->> 'documents')::boolean;
  v_team := (v_can ->> 'view_team')::boolean;
  v_committee := (v_can ->> 'committee')::boolean;
  v_interviews := (v_can ->> 'interviews')::boolean;
  v_decide := (v_can ->> 'propose')::boolean or (v_can ->> 'approve')::boolean or (v_can ->> 'release')::boolean;
  -- A withdrawn application keeps its record, not its content.
  v_open := v_app.status = 'submitted';

  if not exists (select 1 from public.application_access_log l
                  where l.application_id = v_app.id and l.actor_id = v_actor and l.action = 'application_opened'
                    and l.occurred_at > now() - interval '30 minutes') then
    insert into public.application_access_log (application_id, campaign_id, actor_id, action)
    values (v_app.id, v_app.campaign_id, v_actor, 'application_opened');
  end if;

  return jsonb_build_object(
    'application', jsonb_build_object('id', v_app.id, 'reference', v_app.reference, 'status', v_app.status,
                                      'submitted_at', v_app.submitted_at, 'withdrawn_at', v_app.withdrawn_at,
                                      'form_version', (select number from public.recruitment_form_versions where id = v_app.form_version_id)),
    'campaign', jsonb_build_object('id', v_campaign.id, 'title', v_campaign.title, 'state', private.campaign_state(v_campaign),
                                   'required_reviews', v_campaign.required_reviews, 'approval_policy', v_campaign.approval_policy,
                                   'organization', private.organization_card(v_campaign.organization_id),
                                   'president_name', (select private.person_name(u) from private.organization_president(v_campaign.organization_id) u
                                                       where u is not null)),
    'position', (select jsonb_build_object('id', p.id, 'title', p.title, 'openings', p.openings, 'offers', private.position_offers(p.id, null))
                   from public.recruitment_positions p where p.id = v_app.position_id),
    'can', v_can,
    -- What the candidate sent.
    'candidate', v_app.candidate_snapshot,
    'form', case when v_open then private.form_for_position(v_schema, v_app.position_id) end,
    'answers', case when v_open then v_app.answers end,
    'documents', case when v_open and v_docs then
                   coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'question_id', d.question_id, 'file_name', d.file_name,
                                                                 'mime_type', d.mime_type, 'size_bytes', d.size_bytes) order by d.created_at)
                               from public.application_documents d
                              where d.application_id = v_app.id and d.status = 'ready' and d.clarification_id is null), '[]'::jsonb) end,
    'document_count', (select count(*) from public.application_documents d
                        where d.application_id = v_app.id and d.status = 'ready' and d.clarification_id is null),
    'clarifications', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', q.id, 'question', q.question, 'asked_at', q.asked_at,
                                  'asked_by_name', case when q.asked_by is null then null else private.person_name(q.asked_by) end,
                                  'due_at', q.due_at, 'original_due_at', q.original_due_at, 'extensions', q.extensions,
                                  'status', case when q.status = 'open' and q.due_at is not null and q.due_at <= now() then 'closed' else q.status end,
                                  'allows_documents', q.allows_documents,
                                  'answer', case when v_open then q.answer end, 'answered_at', q.answered_at,
                                  'cancel_reason', q.cancel_reason,
                                  'documents', case when v_open and v_docs then coalesce((select jsonb_agg(jsonb_build_object(
                                                   'id', d.id, 'file_name', d.file_name, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes)
                                                   order by d.created_at) from public.application_documents d
                                                  where d.clarification_id = q.id and d.status = 'ready'), '[]'::jsonb) end)
                                  order by q.asked_at)
                                 from public.recruitment_clarifications q where q.application_id = v_app.id), '[]'::jsonb),
    -- What the team produced.
    'pipeline', (select jsonb_build_object('stage', pl.stage, 'changed_at', pl.stage_changed_at,
                                           'changed_by_name', case when pl.stage_changed_by is null then null else private.person_name(pl.stage_changed_by) end)
                   from public.application_pipeline pl where pl.application_id = v_app.id),
    'rubrics', coalesce((select jsonb_object_agg(v.id, jsonb_build_object('number', v.number, 'kind', v.kind, 'status', v.status,
                                                                          'criteria', v.criteria))
                           from public.recruitment_rubric_versions v
                          where v.campaign_id = v_app.campaign_id
                            and (v.status = 'published'
                                 or v.id in (select r.rubric_version_id from public.recruitment_reviews r where r.application_id = v_app.id))), '{}'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', r.id, 'kind', r.kind, 'interview_id', r.interview_id, 'mine', r.reviewer_id = v_actor,
                           'reviewer_name', private.person_name(r.reviewer_id), 'status', r.status,
                           'rubric_version_id', r.rubric_version_id, 'scores', r.scores, 'recommendation', r.recommendation,
                           'note', r.note, 'version', r.version, 'revision_count', r.revision_count,
                           'submitted_at', r.submitted_at, 'amended_at', r.amended_at, 'updated_at', r.updated_at,
                           'total', private.review_total((select v.criteria from public.recruitment_rubric_versions v where v.id = r.rubric_version_id), r.scores),
                           'conflicted', exists (select 1 from public.recruitment_conflicts x where x.application_id = r.application_id
                                                    and x.user_id = r.reviewer_id and x.status in ('open', 'reassigned')))
                           order by r.kind, r.submitted_at nulls last, r.created_at)
                          from public.recruitment_reviews r
                         where r.application_id = v_app.id
                           and (r.reviewer_id = v_actor or (v_team and r.status = 'submitted'))), '[]'::jsonb),
    'summary', jsonb_build_object(
      'counted', private.counted_reviews(v_app.id), 'required', v_campaign.required_reviews,
      'average', case when v_team then (
                   select round(avg((private.review_total(v.criteria, r.scores) ->> 'percent')::numeric), 1)
                     from public.recruitment_reviews r join public.recruitment_rubric_versions v on v.id = r.rubric_version_id
                    where r.application_id = v_app.id and r.kind = 'application' and r.status = 'submitted') end,
      'recommendations', case when v_team then (
                   select jsonb_object_agg(x.recommendation, x.n) from (
                     select r.recommendation, count(*) as n from public.recruitment_reviews r
                      where r.application_id = v_app.id and r.kind = 'application' and r.status = 'submitted'
                      group by r.recommendation) x) end),
    'assignments', case when v_team or v_committee then coalesce((select jsonb_agg(jsonb_build_object(
                       'id', ra.id, 'member_id', ra.member_id, 'name', private.person_name(cm.user_id), 'assigned_at', ra.assigned_at,
                       'review', (select r.status from public.recruitment_reviews r
                                   where r.application_id = v_app.id and r.reviewer_id = cm.user_id and r.kind = 'application'))
                       order by ra.assigned_at)
                      from public.recruitment_review_assignments ra
                      join public.recruitment_committee_members cm on cm.id = ra.member_id
                     where ra.application_id = v_app.id and ra.removed_at is null), '[]'::jsonb) end,
    'conflicts', case when v_committee then coalesce((select jsonb_agg(jsonb_build_object(
                     'id', x.id, 'name', private.person_name(x.user_id), 'status', x.status, 'note', x.note,
                     'declared_at', x.declared_at, 'resolution', x.resolution, 'resolved_at', x.resolved_at)
                     order by x.declared_at)
                    from public.recruitment_conflicts x where x.application_id = v_app.id), '[]'::jsonb) end,
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'on',
                                                          exists (select 1 from public.application_tags at where at.application_id = v_app.id and at.tag_id = t.id))
                                       order by t.label)
                        from public.recruitment_tags t where t.campaign_id = v_app.campaign_id), '[]'::jsonb),
    'comments', case when v_team then coalesce((select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'author_name', private.person_name(c.author_id), 'mine', c.author_id = v_actor,
                    'body', case when c.retracted_at is null then c.body end, 'retracted', c.retracted_at is not null,
                    'created_at', c.created_at,
                    'mentions', coalesce((select jsonb_agg(private.person_name(m)) from unnest(c.mentions) m), '[]'::jsonb))
                    order by c.created_at)
                   from public.application_comments c where c.application_id = v_app.id), '[]'::jsonb) end,
    'mentionable', case when v_team then coalesce((select jsonb_agg(jsonb_build_object('id', u, 'name', private.person_name(u))
                                                            order by private.person_name(u))
                                                     from private.application_users_with(v_app, 'view_team') u where u <> v_actor), '[]'::jsonb) end,
    'interviews', coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id, 'status', i.status, 'invited_at', i.invited_at, 'respond_by', i.respond_by, 'message', i.message,
                     'invited_by_name', case when i.invited_by is null then null else private.person_name(i.invited_by) end,
                     'cancel_reason', i.cancel_reason, 'completed_at', i.completed_at,
                     'can_assess', private.can_assess_interview(v_actor, i),
                     'slot', case when s.id is null then null else jsonb_build_object(
                               'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mode', s.mode, 'location', s.location,
                               'meeting_link', case when v_interviews or private.can_assess_interview(v_actor, i) then s.meeting_link end,
                               'instructions', s.instructions,
                               'interviewers', coalesce((select jsonb_agg(private.person_name(cm.user_id))
                                                           from public.recruitment_slot_interviewers si
                                                           join public.recruitment_committee_members cm on cm.id = si.member_id
                                                          where si.slot_id = s.id), '[]'::jsonb)) end)
                     order by i.invited_at)
                    from public.recruitment_interviews i
                    left join public.recruitment_interview_slots s on s.id = i.slot_id
                   where i.application_id = v_app.id), '[]'::jsonb),
    'free_slots', case when v_interviews and v_open then coalesce((select jsonb_agg(jsonb_build_object(
                      'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mode', s.mode, 'location', s.location)
                      order by s.starts_at)
                     from public.recruitment_interview_slots s
                    where s.campaign_id = v_app.campaign_id and s.cancelled_at is null and s.starts_at > now()
                      and (s.position_id is null or s.position_id = v_app.position_id)
                      and not exists (select 1 from public.recruitment_interviews i
                                       where i.slot_id = s.id and i.status in ('scheduled', 'completed', 'no_show'))), '[]'::jsonb) end,
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', d.id, 'outcome', d.outcome, 'status', d.status,
                    'rationale', case when v_decide then d.rationale end, 'message', case when v_decide then d.message end,
                    'proposed_by_name', case when d.proposed_by is null then null else private.person_name(d.proposed_by) end,
                    'mine', d.proposed_by = v_actor, 'proposed_at', d.proposed_at, 'finalized_at', d.finalized_at,
                    'reviews_override_reason', case when v_decide then d.reviews_override_reason end,
                    'capacity_override_reason', case when v_decide then d.capacity_override_reason end,
                    'returned_at', d.returned_at, 'return_reason', case when v_decide then d.return_reason end,
                    'cancelled_at', d.cancelled_at, 'cancel_reason', case when v_decide then d.cancel_reason end,
                    'release_scheduled_at', d.release_scheduled_at, 'released_at', d.released_at,
                    'released_by_name', case when d.released_by is null then null else private.person_name(d.released_by) end,
                    'offer_expires_at', d.offer_expires_at, 'waitlist_rank', d.waitlist_rank,
                    'approved_by_me', exists (select 1 from public.recruitment_decision_approvals x where x.decision_id = d.id and x.approver_id = v_actor),
                    'approvals', coalesce((select jsonb_agg(jsonb_build_object('name', private.person_name(x.approver_id),
                                                                               'as_president', x.as_president, 'at', x.approved_at)
                                                            order by x.approved_at)
                                             from public.recruitment_decision_approvals x where x.decision_id = d.id), '[]'::jsonb),
                    'offer', (select jsonb_build_object('id', o.id, 'status', o.status, 'expires_at', o.expires_at,
                                                        'responded_at', o.responded_at, 'response_note', o.response_note,
                                                        'withdraw_reason', o.withdraw_reason,
                                                        'onboarding', case when o.onboarding_invitation_id is null then null else
                                                          (select jsonb_build_object('status', inv.status, 'at', o.onboarding_at,
                                                                                     'by_name', case when o.onboarding_by is null then null
                                                                                                     else private.person_name(o.onboarding_by) end)
                                                             from public.organization_invitations inv where inv.id = o.onboarding_invitation_id) end)
                                from public.recruitment_offers o where o.decision_id = d.id))
                    order by d.created_at)
                   from public.recruitment_decisions d where d.application_id = v_app.id), '[]'::jsonb),
    'team_positions', case when (v_can ->> 'invite_members')::boolean then coalesce((
                        select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) order by p.sort_order, p.title)
                          from public.positions p
                         where p.organization_id = v_campaign.organization_id and p.office is null and p.archived_at is null), '[]'::jsonb) end,
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
                    'action', x.action, 'at', x.occurred_at,
                    'actor_name', case when x.actor_id is null then null when x.actor_id = v_app.candidate_id then 'La personne candidate'
                                       else private.person_name(x.actor_id) end,
                    'details', x.details - case when v_decide then '{}'::text[] else array['outcome', 'reason'] end)
                    order by x.occurred_at desc)
                   from (select * from public.application_activity where application_id = v_app.id order by occurred_at desc limit 100) x), '[]'::jsonb),
    'access', case when v_committee then coalesce((select jsonb_agg(jsonb_build_object(
                  'actor_name', private.person_name(l.actor_id), 'action', l.action, 'at', l.occurred_at,
                  'file_name', (select d.file_name from public.application_documents d where d.id = l.document_id))
                  order by l.occurred_at desc)
                 from (select * from public.application_access_log where application_id = v_app.id order by occurred_at desc limit 50) l), '[]'::jsonb) end);
end;
$$;

-- Every submitted state of one review (one's own, or with the team's view).
create or replace function public.recruitment_review_history(p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_review public.recruitment_reviews%rowtype;
begin
  select * into v_review from public.recruitment_reviews where id = p_review_id;
  if not found or not (v_review.reviewer_id = v_actor
                       or (v_review.status = 'submitted'
                           and private.application_can(v_actor, (select a from public.applications a where a.id = v_review.application_id), 'view_team'))) then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('number', h.number, 'scores', h.scores, 'recommendation', h.recommendation,
                                                       'note', h.note, 'reason', h.reason, 'at', h.submitted_at,
                                                       'total', private.review_total((select v.criteria from public.recruitment_rubric_versions v
                                                                                       where v.id = h.rubric_version_id), h.scores))
                                    order by h.number)
                     from public.recruitment_review_revisions h where h.review_id = p_review_id), '[]'::jsonb);
end;
$$;

-- ---- A file, for a reviewer ---------------------------------------------------------------------------

-- The checks, then the record of who opened it, in the database: the route
-- streams the file only after this answered (reviewers have no Storage
-- policy of their own, so there is no way around the record).
create or replace function public.recruitment_document(p_document_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc public.application_documents%rowtype;
  v_app public.applications%rowtype;
begin
  select * into v_doc from public.application_documents where id = p_document_id and status = 'ready';
  if not found then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  select * into v_app from public.applications where id = v_doc.application_id;
  if v_app.status <> 'submitted' or not private.application_can(v_actor, v_app, 'documents') then
    raise exception 'document_not_found' using errcode = 'P0001';
  end if;
  insert into public.application_access_log (application_id, campaign_id, actor_id, action, document_id)
  values (v_app.id, v_app.campaign_id, v_actor, 'document_opened', v_doc.id);
  return jsonb_build_object('object_path', v_doc.object_path, 'file_name', v_doc.file_name, 'mime_type', v_doc.mime_type,
                            'size_bytes', v_doc.size_bytes);
end;
$$;

-- ---- The committee page ------------------------------------------------------------------------

create or replace function public.recruitment_committee(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_manage boolean;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'view');
  v_manage := private.campaign_can(v_actor, v_campaign, 'committee');
  return jsonb_build_object(
    'campaign', private.campaign_summary(v_campaign) || jsonb_build_object(
                  'required_reviews', v_campaign.required_reviews, 'approval_policy', v_campaign.approval_policy,
                  'sealed', private.campaign_sealed_at(v_campaign) is not null and now() >= private.campaign_sealed_at(v_campaign),
                  'sealed_at', private.campaign_sealed_at(v_campaign)),
    'organization', private.organization_card(v_campaign.organization_id),
    'president_name', (select private.person_name(u) from private.organization_president(v_campaign.organization_id) u where u is not null),
    'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k))),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'openings', p.openings) order by p.display_order, p.id)
                             from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', cm.id, 'user_id', cm.user_id, 'membership_id', cm.membership_id, 'name', private.person_name(cm.user_id),
                  'me', cm.user_id = v_actor, 'role', cm.role, 'powers', to_jsonb(cm.powers), 'scope', cm.scope,
                  'positions', coalesce((select jsonb_agg(cp.position_id) from public.recruitment_committee_positions cp where cp.member_id = cm.id), '[]'::jsonb),
                  'starts_at', cm.starts_at, 'ends_at', cm.ends_at, 'purpose', case when v_manage then cm.purpose end,
                  'live', cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id),
                  'candidate', private.candidate_in_campaign(cm.user_id, p_campaign_id),
                  'appointed_by_name', case when cm.appointed_by is null then null else private.person_name(cm.appointed_by) end,
                  'revoked_at', cm.revoked_at, 'revoke_reason', case when v_manage then cm.revoke_reason end,
                  'assigned', (select count(*) from public.recruitment_review_assignments ra where ra.member_id = cm.id and ra.removed_at is null),
                  'reviewed', (select count(*) from public.recruitment_reviews r
                                where r.campaign_id = p_campaign_id and r.reviewer_id = cm.user_id and r.kind = 'application' and r.status = 'submitted'))
                  order by cm.revoked_at nulls first, private.person_name(cm.user_id))
                 from public.recruitment_committee_members cm
                where cm.campaign_id = p_campaign_id and (cm.revoked_at is null or v_manage)), '[]'::jsonb),
    -- Who reads these applications through a position of the organization (the key route), for the record.
    'by_position', coalesce((select jsonb_agg(x.j order by x.name) from (
                    select private.person_name(m.user_id) as name,
                           jsonb_build_object('name', private.person_name(m.user_id),
                                              'positions', coalesce((select jsonb_agg(distinct p.title)
                                                                       from public.position_assignments a join public.positions p on p.id = a.position_id
                                                                      where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at), '[]'::jsonb),
                                              'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k
                                                                        where private.recruitment_key_route(m.user_id, v_campaign, k))),
                                              'candidate', private.candidate_in_campaign(m.user_id, p_campaign_id)) as j
                      from public.memberships m
                     where m.organization_id = v_campaign.organization_id and m.status = 'active'
                       and private.recruitment_key_route(m.user_id, v_campaign, 'view')) x), '[]'::jsonb),
    'eligible', case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
                    'membership_id', m.id, 'name', private.person_name(m.user_id),
                    'candidate', private.candidate_in_campaign(m.user_id, p_campaign_id),
                    'positions', coalesce((select jsonb_agg(distinct p.title)
                                             from public.position_assignments a join public.positions p on p.id = a.position_id
                                            where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at), '[]'::jsonb))
                    order by private.person_name(m.user_id))
                   from public.memberships m
                  where m.organization_id = v_campaign.organization_id and m.status = 'active'
                    and not exists (select 1 from public.recruitment_committee_members cm
                                     where cm.campaign_id = p_campaign_id and cm.user_id = m.user_id and cm.revoked_at is null and cm.ends_at > now())), '[]'::jsonb) end,
    'rubrics', jsonb_build_object(
      'application', jsonb_build_object(
        'live', (select jsonb_build_object('id', v.id, 'number', v.number, 'criteria', v.criteria, 'published_at', v.published_at,
                                           'reviews', (select count(*) from public.recruitment_reviews r where r.rubric_version_id = v.id))
                   from public.recruitment_rubric_versions v where v.campaign_id = p_campaign_id and v.kind = 'application' and v.status = 'published'),
        'draft', (select jsonb_build_object('id', v.id, 'number', v.number, 'criteria', v.criteria, 'edit_version', v.edit_version)
                    from public.recruitment_rubric_versions v where v.campaign_id = p_campaign_id and v.kind = 'application' and v.status = 'draft')),
      'interview', jsonb_build_object(
        'live', (select jsonb_build_object('id', v.id, 'number', v.number, 'criteria', v.criteria, 'published_at', v.published_at,
                                           'reviews', (select count(*) from public.recruitment_reviews r where r.rubric_version_id = v.id))
                   from public.recruitment_rubric_versions v where v.campaign_id = p_campaign_id and v.kind = 'interview' and v.status = 'published'),
        'draft', (select jsonb_build_object('id', v.id, 'number', v.number, 'criteria', v.criteria, 'edit_version', v.edit_version)
                    from public.recruitment_rubric_versions v where v.campaign_id = p_campaign_id and v.kind = 'interview' and v.status = 'draft'))),
    'templates', coalesce((select jsonb_object_agg(t.kind, t.body) from public.recruitment_message_templates t where t.campaign_id = p_campaign_id), '{}'::jsonb),
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label,
                                                          'used', (select count(*) from public.application_tags at where at.tag_id = t.id))
                                       order by t.label)
                        from public.recruitment_tags t where t.campaign_id = p_campaign_id), '[]'::jsonb),
    'conflicts', case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
                     'id', x.id, 'name', private.person_name(x.user_id), 'application_id', x.application_id,
                     'reference', (select a.reference from public.applications a where a.id = x.application_id),
                     'status', x.status, 'note', x.note, 'declared_at', x.declared_at, 'resolution', x.resolution)
                     order by x.status = 'open' desc, x.declared_at desc)
                    from public.recruitment_conflicts x where x.campaign_id = p_campaign_id), '[]'::jsonb) end,
    'access', case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
                  'actor_name', private.person_name(l.actor_id), 'action', l.action, 'at', l.occurred_at,
                  'application_id', l.application_id,
                  'reference', (select a.reference from public.applications a where a.id = l.application_id),
                  'file_name', (select d.file_name from public.application_documents d where d.id = l.document_id))
                  order by l.occurred_at desc)
                 from (select * from public.application_access_log where campaign_id = p_campaign_id order by occurred_at desc limit 100) l), '[]'::jsonb) end);
end;
$$;

-- ---- Interviews: the team's calendar ----------------------------------------------------------------

-- Slots and who is booked on them, within the caller's scope: an organizer
-- sees the campaign's slots; an interviewer sees theirs. A booked candidate's
-- name shows only to someone who may open the application.
create or replace function public.recruitment_interview_board(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_manage boolean;
  v_member uuid;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'view');
  v_manage := private.campaign_can(v_actor, v_campaign, 'interviews');
  v_member := private.live_committee_member_id(v_actor, p_campaign_id);
  return jsonb_build_object(
    'can', jsonb_build_object('manage', v_manage),
    'timezone', v_campaign.timezone,
    'positions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) order by p.display_order, p.id)
                             from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
    'interviewers', case when v_manage then coalesce((select jsonb_agg(jsonb_build_object('id', cm.id, 'name', private.person_name(cm.user_id))
                                                                         order by private.person_name(cm.user_id))
                                                        from public.recruitment_committee_members cm
                                                       where cm.campaign_id = p_campaign_id
                                                         and cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id)), '[]'::jsonb) end,
    'slots', coalesce((select jsonb_agg(jsonb_build_object(
                'id', s.id, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'mode', s.mode, 'location', s.location,
                'meeting_link', s.meeting_link, 'instructions', s.instructions, 'cancelled_at', s.cancelled_at,
                'position', (select jsonb_build_object('id', p.id, 'title', p.title) from public.recruitment_positions p where p.id = s.position_id),
                'interviewers', coalesce((select jsonb_agg(jsonb_build_object('id', cm.id, 'name', private.person_name(cm.user_id)))
                                            from public.recruitment_slot_interviewers si
                                            join public.recruitment_committee_members cm on cm.id = si.member_id
                                           where si.slot_id = s.id), '[]'::jsonb),
                'mine', exists (select 1 from public.recruitment_slot_interviewers si where si.slot_id = s.id and si.member_id = v_member),
                'booking', (select jsonb_build_object(
                               'interview_id', i.id, 'status', i.status, 'application_id', a.id, 'reference', a.reference,
                               'name', case when private.application_can(v_actor, a, 'view') then private.candidate_name(a) end,
                               'position', (select p.title from public.recruitment_positions p where p.id = a.position_id))
                              from public.recruitment_interviews i join public.applications a on a.id = i.application_id
                             where i.slot_id = s.id and i.status in ('scheduled', 'completed', 'no_show')))
                order by s.starts_at)
               from public.recruitment_interview_slots s
              where s.campaign_id = p_campaign_id and s.ends_at > now() - interval '30 days'
                and (v_manage or exists (select 1 from public.recruitment_slot_interviewers si where si.slot_id = s.id and si.member_id = v_member))), '[]'::jsonb),
    -- Invited, no slot chosen yet (organizers only).
    'waiting', case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
                   'interview_id', i.id, 'application_id', a.id, 'reference', a.reference, 'name', private.candidate_name(a),
                   'position', (select p.title from public.recruitment_positions p where p.id = a.position_id),
                   'invited_at', i.invited_at, 'respond_by', i.respond_by)
                   order by i.invited_at)
                  from public.recruitment_interviews i join public.applications a on a.id = i.application_id
                 where i.campaign_id = p_campaign_id and i.status = 'invited' and private.application_can(v_actor, a, 'view')), '[]'::jsonb) end);
end;
$$;

-- ---- Decisions board ---------------------------------------------------------------------------

create or replace function public.recruitment_decision_board(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'view');
  return jsonb_build_object(
    'campaign', jsonb_build_object('id', v_campaign.id, 'title', v_campaign.title, 'required_reviews', v_campaign.required_reviews,
                                   'approval_policy', v_campaign.approval_policy, 'timezone', v_campaign.timezone),
    'president_name', (select private.person_name(u) from private.organization_president(v_campaign.organization_id) u where u is not null),
    'powers', to_jsonb(array(select k from unnest(private.recruitment_powers()) k where private.campaign_can(v_actor, v_campaign, k))),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'openings', p.openings,
                                                               'offers', private.position_offers(p.id, null),
                                                               'accepted', (select count(*) from public.recruitment_offers o
                                                                             join public.recruitment_decisions d on d.id = o.decision_id
                                                                            where d.position_id = p.id and o.status = 'accepted'))
                                            order by p.display_order, p.id)
                             from public.recruitment_positions p where p.campaign_id = p_campaign_id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', d.id, 'application_id', a.id, 'reference', a.reference, 'name', private.candidate_name(a),
                    'application_status', a.status,
                    'position', (select jsonb_build_object('id', p.id, 'title', p.title) from public.recruitment_positions p where p.id = d.position_id),
                    'outcome', d.outcome, 'status', d.status, 'proposed_at', d.proposed_at,
                    'proposed_by_name', case when d.proposed_by is null then null else private.person_name(d.proposed_by) end,
                    'finalized_at', d.finalized_at, 'release_scheduled_at', d.release_scheduled_at, 'released_at', d.released_at,
                    'waitlist_rank', d.waitlist_rank, 'reviews', private.counted_reviews(a.id),
                    'approvals', (select count(*) from public.recruitment_decision_approvals x where x.decision_id = d.id),
                    'approved_by_me', exists (select 1 from public.recruitment_decision_approvals x where x.decision_id = d.id and x.approver_id = v_actor),
                    'can_approve', private.application_can(v_actor, a, 'approve'),
                    'can_release', private.application_can(v_actor, a, 'release'),
                    'offer', (select jsonb_build_object('id', o.id, 'status', o.status, 'expires_at', o.expires_at, 'responded_at', o.responded_at,
                                                        'onboarding', o.onboarding_invitation_id is not null)
                                from public.recruitment_offers o where o.decision_id = d.id))
                    order by case d.status when 'proposed' then 0 when 'finalized' then 1 when 'released' then 2 else 3 end,
                             d.waitlist_rank nulls last, d.updated_at desc)
                   from public.recruitment_decisions d join public.applications a on a.id = d.application_id
                  where d.campaign_id = p_campaign_id and d.status in ('proposed', 'finalized', 'released')
                    and private.application_can(v_actor, a, 'view')), '[]'::jsonb),
    -- Reviewed enough, still without a decision (for those who may propose one).
    'ready', case when private.campaign_can(v_actor, v_campaign, 'propose') then coalesce((select jsonb_agg(jsonb_build_object(
                 'application_id', a.id, 'reference', a.reference, 'name', private.candidate_name(a),
                 'position', (select p.title from public.recruitment_positions p where p.id = a.position_id),
                 'reviews', private.counted_reviews(a.id))
                 order by a.submitted_at)
                from public.applications a
               where a.campaign_id = p_campaign_id and a.status = 'submitted'
                 and private.counted_reviews(a.id) >= greatest(v_campaign.required_reviews, 1)
                 and not exists (select 1 from public.recruitment_decisions d where d.application_id = a.id
                                                                             and d.status in ('proposed', 'finalized', 'released'))
                 and private.application_can(v_actor, a, 'propose')), '[]'::jsonb) end);
end;
$$;

-- ---- Export ----------------------------------------------------------------------------------------

-- The rows of the export (the route turns them into a CSV safe for
-- spreadsheets). Essential fields only, never an answer, a note or a file.
-- Each export is in the audit.
create or replace function public.recruitment_export(p_campaign_id uuid, p_position_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_rows jsonb;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'export');
  select coalesce(jsonb_agg(jsonb_build_object(
           'reference', a.reference, 'last_name', a.candidate_snapshot ->> 'last_name', 'first_name', a.candidate_snapshot ->> 'first_name',
           'program', a.candidate_snapshot ->> 'program', 'study_year', a.candidate_snapshot ->> 'study_year',
           'position', p.title, 'submitted_at', a.submitted_at, 'status', a.status, 'stage', pl.stage,
           'reviews', private.counted_reviews(a.id),
           'average', (select round(avg((private.review_total(v.criteria, r.scores) ->> 'percent')::numeric), 1)
                         from public.recruitment_reviews r join public.recruitment_rubric_versions v on v.id = r.rubric_version_id
                        where r.application_id = a.id and r.kind = 'application' and r.status = 'submitted'),
           'decision', (select d.status || ':' || d.outcome from public.recruitment_decisions d
                         where d.application_id = a.id and d.status in ('proposed', 'finalized', 'released') order by d.created_at desc limit 1),
           'offer', (select o.status from public.recruitment_offers o where o.application_id = a.id order by o.created_at desc limit 1))
           order by p.display_order, a.submitted_at), '[]'::jsonb)
    into v_rows
    from public.applications a
    join public.recruitment_positions p on p.id = a.position_id
    join public.application_pipeline pl on pl.application_id = a.id
   where a.campaign_id = p_campaign_id and a.status <> 'draft'
     and (p_position_id is null or a.position_id = p_position_id)
     and private.application_can(v_actor, a, 'export');
  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'export'), 'recruitment_applications_exported', 'recruitment',
    v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
    jsonb_build_object('rows', jsonb_array_length(v_rows), 'position_id', p_position_id));
  return jsonb_build_object('campaign', v_campaign.title, 'rows', v_rows);
end;
$$;

-- ---- Data-rights requests (the privacy officer) ---------------------------------------------------

-- Everything the platform holds about one candidate's applications, internal
-- assessments included, for the privacy officer to assess an access request
-- (what is disclosed is their decision under the operator's policy). On a
-- written request only: a reason, the second factor, an audit line naming the
-- person it concerns.
create or replace function public.privacy_candidate_report(p_email text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_user uuid;
  v_report jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.privacy.requests');
  perform private.require_aal2();
  v_user := private.user_id_by_email(p_email);
  if v_user is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'generated_at', now(), 'person', jsonb_build_object('name', private.person_name(v_user)),
    'applications', coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'reference', a.reference, 'status', a.status, 'created_at', a.created_at, 'submitted_at', a.submitted_at,
      'withdrawn_at', a.withdrawn_at, 'withdrawal_reason', a.withdrawal_reason,
      'organization', (select o.name from public.organizations o join public.recruitment_campaigns c on c.organization_id = o.id where c.id = a.campaign_id),
      'campaign', (select c.title from public.recruitment_campaigns c where c.id = a.campaign_id),
      'position', (select p.title from public.recruitment_positions p where p.id = a.position_id),
      'candidate_snapshot', a.candidate_snapshot,
      'form', private.form_for_position((select f.schema from public.recruitment_form_versions f where f.id = a.form_version_id), a.position_id),
      'answers', a.answers,
      'documents', coalesce((select jsonb_agg(jsonb_build_object('file_name', d.file_name, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes,
                                                                 'status', d.status, 'created_at', d.created_at))
                               from public.application_documents d where d.application_id = a.id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.occurred_at) order by e.occurred_at)
                             from public.application_events e where e.application_id = a.id), '[]'::jsonb),
      'stage', (select pl.stage from public.application_pipeline pl where pl.application_id = a.id),
      'reviews', coalesce((select jsonb_agg(jsonb_build_object(
                    'kind', r.kind, 'reviewer', private.person_name(r.reviewer_id), 'status', r.status, 'scores', r.scores,
                    'recommendation', r.recommendation, 'note', r.note, 'submitted_at', r.submitted_at,
                    'revisions', coalesce((select jsonb_agg(jsonb_build_object('number', h.number, 'scores', h.scores,
                                                                              'recommendation', h.recommendation, 'note', h.note,
                                                                              'reason', h.reason, 'at', h.submitted_at) order by h.number)
                                             from public.recruitment_review_revisions h where h.review_id = r.id), '[]'::jsonb)))
                   from public.recruitment_reviews r where r.application_id = a.id), '[]'::jsonb),
      'comments', coalesce((select jsonb_agg(jsonb_build_object('author', private.person_name(c.author_id), 'body', c.body,
                                                                'at', c.created_at, 'retracted_at', c.retracted_at) order by c.created_at)
                              from public.application_comments c where c.application_id = a.id), '[]'::jsonb),
      'tags', coalesce((select jsonb_agg(t.label) from public.application_tags at join public.recruitment_tags t on t.id = at.tag_id
                         where at.application_id = a.id), '[]'::jsonb),
      'interviews', coalesce((select jsonb_agg(jsonb_build_object('status', i.status, 'invited_at', i.invited_at,
                                                                  'starts_at', (select s.starts_at from public.recruitment_interview_slots s where s.id = i.slot_id),
                                                                  'cancel_reason', i.cancel_reason))
                                from public.recruitment_interviews i where i.application_id = a.id), '[]'::jsonb),
      'clarifications', coalesce((select jsonb_agg(jsonb_build_object('question', q.question, 'asked_at', q.asked_at, 'due_at', q.due_at,
                                                                      'status', q.status, 'answer', q.answer, 'answered_at', q.answered_at))
                                    from public.recruitment_clarifications q where q.application_id = a.id), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(jsonb_build_object('outcome', d.outcome, 'status', d.status, 'rationale', d.rationale,
                                                                 'message', d.message, 'proposed_at', d.proposed_at, 'finalized_at', d.finalized_at,
                                                                 'released_at', d.released_at,
                                                                 'decided_by', coalesce((select jsonb_agg(private.person_name(x.approver_id))
                                                                                           from public.recruitment_decision_approvals x
                                                                                          where x.decision_id = d.id), '[]'::jsonb)))
                               from public.recruitment_decisions d where d.application_id = a.id), '[]'::jsonb),
      'offers', coalesce((select jsonb_agg(jsonb_build_object('status', o.status, 'expires_at', o.expires_at, 'responded_at', o.responded_at))
                            from public.recruitment_offers o where o.application_id = a.id), '[]'::jsonb),
      'accesses', coalesce((select jsonb_agg(jsonb_build_object('by', private.person_name(l.actor_id), 'action', l.action, 'at', l.occurred_at)
                                             order by l.occurred_at)
                              from public.application_access_log l where l.application_id = a.id), '[]'::jsonb))
      order by a.created_at), '[]'::jsonb))
    into v_report
    from public.applications a where a.candidate_id = v_user;
  perform private.log_governance_event(
    v_actor, 'self', 'privacy_report_generated', 'recruitment', null, v_user, null, null,
    jsonb_build_object('applications', jsonb_array_length(v_report -> 'applications')), v_reason);
  return v_report;
end;
$$;

-- Erase one application and everything about it (files queued for deletion),
-- when the privacy officer grants an erasure request.
create or replace function public.privacy_erase_application(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_app public.applications%rowtype;
  v_org uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.privacy.requests');
  perform private.require_aal2();
  select * into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0001';
  end if;
  select organization_id into v_org from public.recruitment_campaigns where id = v_app.campaign_id;
  delete from public.applications where id = p_application_id;
  perform private.log_governance_event(
    v_actor, 'self', 'privacy_application_erased', 'recruitment', v_org, v_app.candidate_id, 'application', p_application_id,
    jsonb_build_object('campaign_id', v_app.campaign_id, 'status', v_app.status), v_reason);
end;
$$;

-- ---- The recruitment desk admits committee members ---------------------------------------------

create or replace function public.recruitment_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_can_manage boolean;
  v_can_questions boolean;
  v_can_publish boolean;
  v_editor boolean;
begin
  v_can_manage := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.campaigns.manage', now());
  v_can_questions := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.questions.manage', now());
  v_can_publish := private.user_has_organization_permission(v_actor, p_organization_id, 'recruitment.campaigns.publish', now());
  v_editor := v_can_manage or v_can_questions or v_can_publish;
  if not v_editor and not exists (select 1 from public.recruitment_campaigns c
                                   where c.organization_id = p_organization_id and private.campaign_can(v_actor, c, 'view')) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                         'accent', o.accent, 'kind', o.kind, 'status', o.status,
                                         'page_public', private.association_page_is_public(o.id)),
      'can', jsonb_build_object('manage', v_can_manage, 'questions', v_can_questions, 'publish', v_can_publish),
      'campaigns', coalesce((select jsonb_agg(
                                private.campaign_summary(c)
                                || jsonb_build_object('review', case when private.campaign_can(v_actor, c, 'view') then jsonb_build_object(
                                     'to_review', (select count(*) from public.recruitment_review_assignments ra
                                                    join public.applications a on a.id = ra.application_id
                                                   where ra.member_id = private.live_committee_member_id(v_actor, c.id) and ra.removed_at is null
                                                     and a.status = 'submitted'
                                                     and not exists (select 1 from public.recruitment_reviews r
                                                                      where r.application_id = a.id and r.reviewer_id = v_actor
                                                                        and r.kind = 'application' and r.status = 'submitted'))) end)
                                order by c.archived_at nulls first, c.created_at desc)
                               from public.recruitment_campaigns c
                              where c.organization_id = o.id and (v_editor or private.campaign_can(v_actor, c, 'view'))), '[]'::jsonb))
      from public.organizations o where o.id = p_organization_id);
end;
$$;

-- ---- my_access: whether the person sits on a committee of each organization ---------------------

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
                   ), '[]'::jsonb),
                   -- Phase 9: a live appointment to one of its recruitment committees.
                   'recruitment_committee', exists (
                     select 1 from public.recruitment_committee_members cm
                      where cm.organization_id = o.id and cm.user_id = v_user
                        and cm.id = private.live_committee_member_id(v_user, cm.campaign_id))
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

-- ---- Grants ------------------------------------------------------------------------------------

revoke all on function private.candidate_name(public.applications) from public, anon, authenticated, service_role;
revoke all on function private.candidate_status(public.applications) from public, anon, authenticated, service_role;

revoke all on function public.recruitment_campaign_access(uuid) from public, anon;
revoke all on function public.my_recruitment_work() from public, anon;
revoke all on function public.recruitment_campaign_board(uuid) from public, anon;
revoke all on function public.recruitment_application_list(uuid, jsonb, integer, integer) from public, anon;
revoke all on function public.recruitment_application(uuid) from public, anon;
revoke all on function public.recruitment_review_history(uuid) from public, anon;
revoke all on function public.recruitment_document(uuid) from public, anon;
revoke all on function public.recruitment_committee(uuid) from public, anon;
revoke all on function public.recruitment_interview_board(uuid) from public, anon;
revoke all on function public.recruitment_decision_board(uuid) from public, anon;
revoke all on function public.recruitment_export(uuid, uuid) from public, anon;
revoke all on function public.privacy_candidate_report(text, text) from public, anon;
revoke all on function public.privacy_erase_application(uuid, text) from public, anon;

grant execute on function public.recruitment_campaign_access(uuid) to authenticated;
grant execute on function public.my_recruitment_work() to authenticated;
grant execute on function public.recruitment_campaign_board(uuid) to authenticated;
grant execute on function public.recruitment_application_list(uuid, jsonb, integer, integer) to authenticated;
grant execute on function public.recruitment_application(uuid) to authenticated;
grant execute on function public.recruitment_review_history(uuid) to authenticated;
grant execute on function public.recruitment_document(uuid) to authenticated;
grant execute on function public.recruitment_committee(uuid) to authenticated;
grant execute on function public.recruitment_interview_board(uuid) to authenticated;
grant execute on function public.recruitment_decision_board(uuid) to authenticated;
grant execute on function public.recruitment_export(uuid, uuid) to authenticated;
grant execute on function public.privacy_candidate_report(text, text) to authenticated;
grant execute on function public.privacy_erase_application(uuid, text) to authenticated;
