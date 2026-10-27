-- Phase 11 · Governance continuity: the hourly checker, its issues, the
-- mandate reminders, handover checklists and the transfer of a reviewer's
-- work. The checker only observes and tells people: it never appoints,
-- approves, extends or ends a mandate. Rights keep expiring by their dates
-- (private.user_has_organization_permission), whether it runs or not.

-- ---- Notifications --------------------------------------------------------------------------------------------

insert into public.notification_types (key, topic, importance, email, confidential, description) values
  ('governance_issue_alert', 'governance_actions', 'important', true, false,
   'Un point de continuité à régler : présidence vacante, passation bloquée, accès qui expirent.'),
  ('platform_health_report', 'governance_updates', 'normal', true, false, 'Le point hebdomadaire sur la continuité du site (bureau du BDE).');
update public.notification_topics
   set description = 'La réponse à une invitation que tu as envoyée, une passation terminée ou arrêtée, un mandat qui finit bientôt, le point de continuité du BDE.'
 where key = 'governance_updates';

alter table public.notifications drop constraint notifications_resource_type_check;
alter table public.notifications add constraint notifications_resource_type_check
  check (resource_type in ('event', 'application', 'recruitment_campaign', 'post', 'organization', 'transition',
                           'invitation', 'assignment', 'platform_assignment', 'broadcast', 'account', 'governance_issue'));

-- ---- Issues ---------------------------------------------------------------------------------------------------

-- One row per problem while it lasts. issue_key is its stable identity (one
-- open row per key); once resolved, a reappearance is a new issue.
create table public.governance_issues (
  id uuid primary key default gen_random_uuid(),
  issue_key text not null
    constraint governance_issues_issue_key_check check (char_length(issue_key) between 3 and 200),
  kind text not null
    constraint governance_issues_kind_check
    check (kind in ('bde_office_vacant', 'association_president_vacant', 'succession_missing', 'transition_pending',
                    'approver_missing', 'reviewer_access_expiring', 'guardian_missing', 'guardian_mfa_missing',
                    'officer_mfa_missing', 'suspended_with_pending', 'job_unhealthy', 'renewal_due')),
  -- info: dashboards only · warning: told, then reminded · critical: told, reminded sooner, escalated at once.
  severity text not null
    constraint governance_issues_severity_check check (severity in ('info', 'warning', 'critical')),
  -- Who is told first (escalation: association → BDE, BDE → guardian).
  audience text not null
    constraint governance_issues_audience_check
    check (audience in ('association', 'recruitment', 'bde', 'guardian', 'operations', 'self')),
  organization_id uuid
    constraint governance_issues_organization_id_fkey references public.organizations (id) on delete cascade,
  subject_user_id uuid
    constraint governance_issues_subject_user_id_fkey references auth.users (id) on delete cascade,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    constraint governance_issues_status_check check (status in ('open', 'resolved')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  reminders smallint not null default 0,
  escalated_at timestamptz,
  constraint governance_issues_resolved_check check ((status = 'resolved') = (resolved_at is not null))
);
comment on table public.governance_issues is
  'Continuity problems found by private.check_governance_health (observations, never a right).';
create unique index governance_issues_one_open on public.governance_issues (issue_key) where status = 'open';
create index governance_issues_open_idx on public.governance_issues (status, severity);
create index governance_issues_organization_id_idx on public.governance_issues (organization_id);
create index governance_issues_subject_user_id_idx on public.governance_issues (subject_user_id);
alter table public.governance_issues enable row level security;
revoke all on public.governance_issues from anon, authenticated;

-- ---- Detection -------------------------------------------------------------------------------------------------

-- Everything wrong at p_now, from the governance tables themselves. p_now is
-- given only by the checker (now()) and by the database tests; no API role
-- can call this, so nobody chooses the time of an authorization.
create or replace function private.detect_governance_issues(p_now timestamptz default now())
returns table (issue_key text, kind text, severity text, audience text, organization_id uuid, subject_user_id uuid,
               subject_id uuid, details jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with bde as (select private.bde_organization_id() as id),
  offices as (
    select o.office, o.other, private.office_holder(b.id, o.office, p_now) as holder,
           private.office_holder(b.id, o.other, p_now) as other_holder, b.id as bde_id
      from bde b
     cross join (values ('bde_president', 'bde_vice_president'), ('bde_vice_president', 'bde_president')) as o (office, other)
     where b.id is not null
  ),
  open_transitions as (
    select t.* from public.leadership_transitions t where t.status = 'open' and t.expires_at > p_now
  ),
  holders as (
    -- Current office holders and the instant their mandate ends.
    select a.id, a.organization_id, a.user_id, a.office, a.ends_at, o.name, o.slug, o.kind as org_kind
      from public.position_assignments a
      join public.organizations o on o.id = a.organization_id
     where a.status = 'active' and a.office is not null and a.starts_at <= p_now and p_now < a.ends_at
       and o.status = 'active'
  )
  -- A BDE office nobody holds. Told to the other office holder; to the guardian when both are empty.
  select 'bde_office_vacant:' || f.office, 'bde_office_vacant', 'critical',
         case when f.other_holder is not null then 'bde' else 'guardian' end,
         f.bde_id, null::uuid, null::uuid,
         jsonb_build_object('office', f.office,
                            'transition_open', exists (select 1 from open_transitions t where t.organization_id = f.bde_id))
    from offices f where f.holder is null

  union all
  -- An active association without a president: the BDE may appoint one (Phase 4 workflow).
  select 'association_president_vacant:' || o.id, 'association_president_vacant', 'warning', 'bde', o.id, null, null,
         jsonb_build_object('organization', o.name, 'slug', o.slug,
                            'transition_open', exists (select 1 from open_transitions t where t.organization_id = o.id))
    from public.organizations o
   where o.kind = 'association' and o.status = 'active'
     and private.office_holder(o.id, 'association_president', p_now) is null

  union all
  -- An office whose mandate ends within 30 days with nobody arranged after it
  -- (no renewal, no successor, no transition under way).
  select 'succession_missing:' || h.id, 'succession_missing',
         case when h.ends_at <= p_now + interval '7 days' then 'critical' else 'warning' end,
         case when h.org_kind = 'bde' then 'bde' else 'association' end,
         h.organization_id, h.user_id, h.id,
         jsonb_build_object('organization', h.name, 'slug', h.slug, 'office', h.office, 'ends_at', h.ends_at,
                            'days', greatest(0, ceil(extract(epoch from h.ends_at - p_now) / 86400))::integer)
    from holders h
   where h.ends_at <= p_now + interval '30 days'
     and private.office_holder(h.organization_id, h.office, h.ends_at) is null
     and not exists (select 1 from open_transitions t where t.organization_id = h.organization_id)

  union all
  -- A transition under way that waits on someone: open for three days, or
  -- close to its start or its deadline. Says exactly what is missing.
  select 'transition_pending:' || t.id, 'transition_pending',
         case when t.expires_at <= p_now + interval '3 days' or t.effective_at <= p_now + interval '3 days' then 'critical' else 'warning' end,
         case when t.kind in ('bde_succession', 'bde_recovery') then 'bde'
              when t.kind = 'association_appointment' then 'bde' else 'association' end,
         t.organization_id, null, t.id,
         jsonb_build_object(
           'organization', o.name, 'slug', o.slug, 'transition_kind', t.kind, 'effective_at', t.effective_at, 'expires_at', t.expires_at,
           'candidates_pending', (select count(*) from public.leadership_transition_candidates c where c.transition_id = t.id and c.accepted is null),
           'candidates_declined', (select count(*) from public.leadership_transition_candidates c where c.transition_id = t.id and c.accepted is false),
           'missing_approvals', case when t.kind = 'bde_succession' then (
               select coalesce(jsonb_agg(x.capacity), '[]'::jsonb) from (
                 select f.office as capacity from offices f
                  where f.holder is not null
                    and not exists (select 1 from public.leadership_transition_approvals a
                                     where a.transition_id = t.id and a.capacity = f.office and a.approver_user_id = f.holder)
                 union all
                 select 'guardian' where (select count(*) from offices f where f.holder is null) = 1
                    and not exists (select 1 from public.leadership_transition_approvals a where a.transition_id = t.id and a.capacity = 'guardian')
               ) x)
             else '[]'::jsonb end)
    from open_transitions t
    join public.organizations o on o.id = t.organization_id
   where t.created_at <= p_now - interval '3 days' or t.effective_at <= p_now + interval '7 days' or t.expires_at <= p_now + interval '3 days'

  union all
  -- Articles waiting over two days that nobody but their author may approve.
  select 'approver_missing:' || o.id, 'approver_missing', 'warning',
         case when private.office_holder(o.id, 'association_president', p_now) is null then 'bde' else 'association' end,
         o.id, null, null, jsonb_build_object('organization', o.name, 'slug', o.slug, 'count', count(*))
    from public.post_revisions r
    join public.posts p on p.id = r.post_id
    join public.organizations o on o.id = p.organization_id
   where r.status = 'submitted' and r.submitted_at <= p_now - interval '48 hours' and o.status = 'active'
     and not exists (select 1 from public.memberships m
                      where m.organization_id = o.id and m.status = 'active' and m.user_id is distinct from r.submitted_by
                        and private.user_has_organization_permission(m.user_id, o.id, 'posts.approve', p_now))
   group by o.id, o.name, o.slug

  union all
  -- Committee access ending within seven days while applications still wait for a decision.
  select 'reviewer_access_expiring:' || c.id, 'reviewer_access_expiring', 'warning', 'recruitment', c.organization_id, null, c.id,
         jsonb_build_object('organization', o.name, 'slug', o.slug, 'campaign', c.title, 'count', count(distinct cm.id),
                            'ends_at', min(cm.ends_at))
    from public.recruitment_campaigns c
    join public.organizations o on o.id = c.organization_id
    join public.recruitment_committee_members cm on cm.campaign_id = c.id
   where c.status <> 'cancelled' and c.archived_at is null
     and cm.revoked_at is null and cm.starts_at <= p_now and cm.ends_at > p_now and cm.ends_at <= p_now + interval '7 days'
     and exists (select 1 from public.applications a where a.campaign_id = c.id and a.status = 'submitted'
                                                        and not private.application_decided(a.id))
   group by c.id, c.organization_id, o.name, o.slug, c.title

  union all
  -- Nobody can restore the BDE presidency if it falls vacant.
  select 'guardian_missing', 'guardian_missing', 'warning', 'bde', (select id from bde), null, null, '{}'::jsonb
   where private.guardian_user(p_now) is null and (select id from bde) is not null

  union all
  -- The guardian has no second factor (the recovery needs it).
  select 'guardian_mfa_missing:' || g, 'guardian_mfa_missing', 'warning', 'self', null, g, null, '{}'::jsonb
    from (select private.guardian_user(p_now) as g) x
   where g is not null and not exists (select 1 from auth.mfa_factors f where f.user_id = g and f.status = 'verified')

  union all
  -- Someone holding sensitive rights without a second factor (told to them only).
  select distinct on (a.user_id) 'officer_mfa_missing:' || a.user_id, 'officer_mfa_missing', 'warning', 'self', null, a.user_id, null, '{}'::jsonb
    from public.position_assignments a
    join public.organizations o on o.id = a.organization_id and o.status = 'active'
   where a.status = 'active' and a.starts_at <= p_now and p_now < a.ends_at
     and (a.office is not null or private.position_is_sensitive(a.position_id))
     and not exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified')

  union all
  -- A suspended organization that still has work scheduled (BDE dashboard only).
  select 'suspended_with_pending:' || o.id, 'suspended_with_pending', 'info', 'bde', o.id, null, null,
         jsonb_build_object('organization', o.name, 'slug', o.slug,
                            'transitions', (select count(*) from open_transitions t where t.organization_id = o.id),
                            'scheduled_posts', (select count(*) from public.posts p where p.organization_id = o.id and p.schedule_status = 'pending'))
    from public.organizations o
   where o.status = 'suspended'
     and (exists (select 1 from open_transitions t where t.organization_id = o.id)
          or exists (select 1 from public.posts p where p.organization_id = o.id and p.schedule_status = 'pending'))

  union all
  -- A recurring job that is late, failing, never ran or is not scheduled
  -- (nothing when pg_cron is absent: that is shown as "unverifiable").
  select 'job_unhealthy:' || j.job_key, 'job_unhealthy', case when j.critical then 'critical' else 'warning' end, 'operations',
         null, null, null, jsonb_build_object('job', j.job_key, 'health', h.health, 'last_succeeded_at', j.last_succeeded_at)
    from public.scheduled_jobs j
   cross join lateral (select private.job_health(j, private.cron_status()) as health) h
   where h.health in ('late', 'failing', 'never_run', 'not_scheduled')

  union all
  -- A renewal written in the institutional register (domain, hosting, billing)
  -- within 30 days, or already past and not updated.
  select 'renewal_due:' || r.record_key || ':' || r.renewal_on, 'renewal_due',
         case when r.renewal_on <= (p_now at time zone 'Europe/Paris')::date + 7 then 'critical' else 'warning' end,
         'operations', null, null, null, jsonb_build_object('record', r.record_key, 'renewal_on', r.renewal_on)
    from public.institutional_records r
   where r.renewal_on is not null and r.renewal_on <= (p_now at time zone 'Europe/Paris')::date + 30;
$$;

-- Who is told about an issue, now (rights are read at the moment of sending).
create or replace function private.issue_recipients(p_audience text, p_organization_id uuid, p_subject_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.memberships m
   where p_audience = 'association' and m.organization_id = p_organization_id and m.status = 'active'
     and private.user_has_organization_permission(m.user_id, p_organization_id, 'governance.succession', now())
  union
  select m.user_id from public.memberships m
   where p_audience = 'recruitment' and m.organization_id = p_organization_id and m.status = 'active'
     and private.user_has_organization_permission(m.user_id, p_organization_id, 'recruitment.committee.manage', now())
  union
  select x.u from (select private.office_holder(private.bde_organization_id(), o, now()) as u
                     from unnest(array['bde_president', 'bde_vice_president']) o) x
   where x.u is not null
     and ((p_audience = 'bde' and private.user_has_platform_permission(x.u, 'platform.organizations.manage', now()))
          or (p_audience = 'operations' and private.user_has_platform_permission(x.u, 'platform.operations.monitor', now())))
  union
  select g from (select private.guardian_user(now()) as g) y where p_audience = 'guardian' and g is not null
  union
  select p_subject_user where p_audience = 'self' and p_subject_user is not null;
$$;

-- Where a told issue goes next if nobody fixes it.
create or replace function private.issue_escalation(p_audience text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_audience when 'association' then 'bde' when 'recruitment' then 'bde' when 'bde' then 'guardian'
                         when 'guardian' then 'bde' end;
$$;

-- Sends one round about an issue to an audience. The page it leads to
-- depends on who reads it (target), never on a link stored in the payload.
create or replace function private.notify_governance_issue(p_issue public.governance_issues, p_audience text, p_round text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer := 0;
  v_kind text := 'governance_issue_alert';
  v_target text := case p_audience when 'association' then 'association' when 'recruitment' then 'association'
                                   when 'guardian' then 'guardian' when 'self' then 'self'
                                   when 'operations' then 'operations' else 'platform' end;
begin
  -- The guardian keeps the Phase 10 message for a BDE without presidency.
  if p_audience = 'guardian' and p_issue.kind = 'bde_office_vacant' and p_issue.details ->> 'office' = 'bde_president' then
    v_kind := 'governance_bde_vacancy';
  end if;
  for v_user in select r from private.issue_recipients(p_audience, p_issue.organization_id, p_issue.subject_user_id) r loop
    perform private.notify(
      v_user, v_kind, 'gissue:' || p_issue.id || ':' || p_round || ':' || v_user,
      p_issue.details || jsonb_build_object('issue', p_issue.kind, 'severity', p_issue.severity, 'target', v_target,
                                            'escalated', p_audience is distinct from p_issue.audience,
                                            'organization_slug', p_issue.details ->> 'slug'),
      p_issue.organization_id, 'governance_issue', p_issue.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Mandate reminders at the current academic year's offsets (60, 30, 14, 7
-- days by default). One reminder per offset and per mandate end (stable key,
-- the same as Phase 10's 30/7-day reminders), only the closest offset (a
-- mandate seen 10 days before its end gets the 14-day one, not three at
-- once), and none when the mandate is renewed, a successor is in place or
-- (for a presidency) a transition is under way.
create or replace function private.enqueue_mandate_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offsets integer[] := coalesce((select reminder_offsets from public.academic_years where status = 'current'), '{60,30,14,7}');
  v_max integer := (select max(o) from unnest(v_offsets) o);
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select a.id, a.user_id, a.organization_id, a.ends_at, a.office, p.title, o.slug, coalesce(o.short_name, o.name) as org,
           (select min(d) from unnest(v_offsets) d where a.ends_at <= p_now + make_interval(days => d)) as days
      from public.position_assignments a
      join public.positions p on p.id = a.position_id
      join public.organizations o on o.id = a.organization_id
     where a.status = 'active' and a.starts_at <= p_now and a.ends_at > p_now and a.ends_at <= p_now + make_interval(days => v_max)
       and not exists (select 1 from public.position_assignments b
                        where b.membership_id = a.membership_id and b.position_id = a.position_id and b.id <> a.id
                          and b.status = 'active' and b.starts_at >= a.ends_at - interval '1 day')
       and (a.office is null or (private.office_holder(a.organization_id, a.office, a.ends_at) is null
                                 and not exists (select 1 from public.leadership_transitions t
                                                  where t.organization_id = a.organization_id and t.status = 'open'
                                                    and t.expires_at > p_now)))
  loop
    perform private.notify(v_row.user_id, 'governance_mandate_expiring',
      'mandate:' || v_row.id || ':' || v_row.days || ':' || extract(epoch from v_row.ends_at)::bigint,
      jsonb_build_object('assignment_id', v_row.id, 'position', v_row.title, 'organization', v_row.org, 'slug', v_row.slug,
                         'ends_at', v_row.ends_at, 'office', v_row.office, 'days', v_row.days),
      v_row.organization_id, 'assignment', v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- The hourly checker (job governance-health). Records what it finds, tells
-- the people who can act, reminds them (warning: every 7 days, critical:
-- every 3 days, three reminders at most), escalates once (critical at once,
-- otherwise after 7 days open), and closes what was fixed (unread alerts of
-- a fixed issue leave the notification centre).
create or replace function private.check_governance_health(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found text[] := '{}';
  v_issue record;
  v_row public.governance_issues%rowtype;
  v_id uuid;
  v_inserted boolean;
  v_new integer := 0;
  v_resolved integer := 0;
  v_told integer := 0;
  v_mandates integer;
  v_expired integer := 0;
  v_org uuid;
  v_every interval;
  v_up text;
begin
  -- Transitions past their deadline were already powerless; mark them expired everywhere.
  for v_org in select distinct t.organization_id from public.leadership_transitions t where t.status = 'open' and t.expires_at <= now() loop
    perform private.expire_lapsed_transitions(v_org);
    v_expired := v_expired + 1;
  end loop;

  for v_issue in select * from private.detect_governance_issues(p_now) loop
    v_found := v_found || v_issue.issue_key;
    insert into public.governance_issues as g
      (issue_key, kind, severity, audience, organization_id, subject_user_id, subject_id, details, first_detected_at, last_detected_at)
    values (v_issue.issue_key, v_issue.kind, v_issue.severity, v_issue.audience, v_issue.organization_id, v_issue.subject_user_id,
            v_issue.subject_id, v_issue.details, p_now, p_now)
    on conflict (issue_key) where status = 'open'
    do update set severity = excluded.severity, audience = excluded.audience, details = excluded.details, last_detected_at = p_now
    returning g.id, (g.xmax = 0) into v_id, v_inserted;
    if v_inserted then
      v_new := v_new + 1;
      perform private.log_governance_event(
        null, 'system', 'governance_issue_detected', 'continuity', v_issue.organization_id, v_issue.subject_user_id,
        'governance_issue', v_id, jsonb_build_object('kind', v_issue.kind, 'severity', v_issue.severity));
    end if;
  end loop;

  for v_row in
    update public.governance_issues g set status = 'resolved', resolved_at = p_now
     where g.status = 'open' and not g.issue_key = any (v_found)
    returning g.*
  loop
    v_resolved := v_resolved + 1;
    perform private.log_governance_event(
      null, 'system', 'governance_issue_resolved', 'continuity', v_row.organization_id, v_row.subject_user_id,
      'governance_issue', v_row.id, jsonb_build_object('kind', v_row.kind, 'open_since', v_row.first_detected_at));
    update public.notifications n set archived_at = now(), read_at = coalesce(n.read_at, now())
     where n.resource_type = 'governance_issue' and n.resource_id = v_row.id and n.archived_at is null and n.read_at is null;
  end loop;

  for v_row in
    select * from public.governance_issues g where g.status = 'open' and g.severity <> 'info'
     order by g.first_detected_at for update skip locked
  loop
    v_every := case when v_row.severity = 'critical' then interval '3 days' else interval '7 days' end;
    if v_row.notified_at is null then
      v_told := v_told + private.notify_governance_issue(v_row, v_row.audience, '0');
      update public.governance_issues set notified_at = p_now where id = v_row.id;
    elsif v_row.audience <> 'self' and v_row.reminders < 3 and p_now >= v_row.notified_at + v_every * (v_row.reminders + 1) then
      v_told := v_told + private.notify_governance_issue(v_row, v_row.audience, 'r' || (v_row.reminders + 1));
      update public.governance_issues set reminders = reminders + 1 where id = v_row.id;
    end if;
    v_up := private.issue_escalation(v_row.audience);
    if v_up is not null and v_row.escalated_at is null
       and (v_row.severity = 'critical' or p_now >= v_row.first_detected_at + interval '7 days') then
      v_told := v_told + private.notify_governance_issue(v_row, v_up, 'e');
      update public.governance_issues set escalated_at = p_now where id = v_row.id;
    end if;
  end loop;

  v_mandates := private.enqueue_mandate_reminders(p_now);
  return jsonb_build_object('open', cardinality(v_found), 'new', v_new, 'resolved', v_resolved, 'notified', v_told,
                            'mandate_reminders', v_mandates, 'transitions_expired', v_expired);
end;
$$;

-- ---- Phase 10 reminders: mandates and the BDE vacancy now come from the checker ----------------------------------

create or replace function private.enqueue_due_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_app public.applications%rowtype;
  v_events integer := 0;
  v_interviews integer := 0;
  v_posts integer := 0;
  v_swept integer := 0;
begin
  -- Events: confirmed participants, the day before (registered more than a day ahead).
  for v_row in
    select e.id as event_id, r.user_id, e.starts_at
      from public.events e
      join public.event_registrations r on r.event_id = e.id and r.status = 'confirmed'
     where e.publication = 'published' and e.status = 'scheduled' and e.hidden_at is null and e.registration_mode = 'internal'
       and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
       and r.confirmed_at <= e.starts_at - interval '24 hours'
  loop
    perform private.enqueue_notification(v_row.user_id, 'event_reminder', e,
      'event:' || v_row.event_id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || v_row.user_id)
      from public.events e where e.id = v_row.event_id;
    v_events := v_events + 1;
  end loop;

  -- Interviews within 24 hours: the candidate and the interviewers.
  for v_row in
    select i.id, i.application_id, s.starts_at, s.ends_at, s.mode, s.location, s.id as slot_id
      from public.recruitment_interviews i
      join public.recruitment_interview_slots s on s.id = i.slot_id
     where i.status = 'scheduled' and s.cancelled_at is null
       and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
       and coalesce(i.scheduled_at, i.invited_at) <= s.starts_at - interval '24 hours'
  loop
    select * into v_app from public.applications where id = v_row.application_id;
    if v_app.status = 'submitted' then
      perform private.enqueue_application_message(v_app, 'recruitment_interview_reminder',
        'interview:' || v_row.id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || v_app.candidate_id,
        jsonb_build_object('interview_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
                           'mode', v_row.mode, 'location', case when v_row.mode = 'in_person' then v_row.location end));
      perform private.enqueue_team_message(cm.user_id, v_app, 'recruitment_team_interview_reminder',
        'interview:' || v_row.id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || cm.user_id,
        jsonb_build_object('interview_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at, 'mode', v_row.mode))
        from public.recruitment_slot_interviewers si
        join public.recruitment_committee_members cm on cm.id = si.member_id
       where si.slot_id = v_row.slot_id;
      v_interviews := v_interviews + 1;
    end if;
  end loop;

  -- Articles waiting two days for a review: the people who may approve them.
  for v_row in
    select r.id as revision_id, r.post_id, r.title, r.submitted_by, p.organization_id, coalesce(o.short_name, o.name) as org, o.slug
      from public.post_revisions r
      join public.posts p on p.id = r.post_id
      join public.organizations o on o.id = p.organization_id
     where r.status = 'submitted' and r.submitted_at <= now() - interval '48 hours'
  loop
    perform private.notify(m.user_id, 'content_approval_pending', 'post_pending:' || v_row.revision_id || ':' || m.user_id,
      jsonb_build_object('title', v_row.title, 'post_id', v_row.post_id, 'organization', v_row.org, 'slug', v_row.slug),
      v_row.organization_id, 'post', v_row.revision_id)
      from public.memberships m
     where m.organization_id = v_row.organization_id and m.status = 'active'
       and m.user_id is distinct from v_row.submitted_by
       and private.user_has_organization_permission(m.user_id, v_row.organization_id, 'posts.approve', now());
    v_posts := v_posts + 1;
  end loop;

  -- Unread reminders that no longer apply leave the notification centre.
  update public.notifications n set archived_at = now(), read_at = coalesce(n.read_at, now())
   where n.archived_at is null and n.read_at is null
     and n.kind in ('event_reminder', 'recruitment_interview_reminder', 'recruitment_team_interview_reminder',
                    'application_deadline_reminder', 'recruitment_offer_reminder', 'recruitment_clarification_reminder',
                    'governance_mandate_expiring', 'content_approval_pending')
     and n.created_at > now() - interval '30 days'
     and private.notification_obsolete(n.id);
  get diagnostics v_swept = row_count;

  return jsonb_build_object('events', v_events, 'interviews', v_interviews, 'posts', v_posts, 'swept', v_swept);
end;
$$;

-- ---- Handover checklists --------------------------------------------------------------------------------------

-- The reusable items, by area. Each area is ticked by the people who hold
-- its key; a metric is counted live next to the item (never stored as done).
create table public.handover_template_items (
  item_key text primary key
    constraint handover_template_items_item_key_check check (item_key ~ '^[a-z_]{3,60}$'),
  area text not null
    constraint handover_template_items_area_check check (area in ('presidence', 'communication', 'evenements', 'recrutement')),
  label text not null
    constraint handover_template_items_label_check check (char_length(label) between 3 and 120),
  help text
    constraint handover_template_items_help_check check (char_length(help) <= 300),
  metric text
    constraint handover_template_items_metric_check
    check (metric in ('succession', 'officers_expiring', 'delegations', 'pending_posts', 'scheduled_posts', 'upcoming_events',
                      'events_with_registrations', 'active_campaigns', 'committee_live', 'committee_expiring',
                      'upcoming_interviews', 'decisions_unreleased')),
  sort_order smallint not null
);

insert into public.handover_template_items (item_key, area, label, help, metric, sort_order) values
  ('successor_proposed', 'presidence', 'Succession proposée et acceptée',
   'Depuis Gouvernance : la personne choisie accepte elle-même, avec son propre compte.', 'succession', 10),
  ('team_reviewed', 'presidence', 'Postes et mandats de l''équipe revus',
   'Les mandats qui finissent, ceux à renouveler, les postes à pourvoir.', 'officers_expiring', 20),
  ('delegations_reviewed', 'presidence', 'Délégations en cours revues', 'Les délégations finissent seules à leur date.', 'delegations', 30),
  ('settings_reviewed', 'presidence', 'Page de l''asso et contacts officiels vérifiés', null, null, 40),
  ('no_shared_password', 'presidence', 'Aucun mot de passe partagé',
   'Chaque personne se connecte avec son compte ; les droits passent par les postes, jamais par un mot de passe.', null, 50),
  ('pending_posts_reviewed', 'communication', 'Articles en attente de relecture traités', null, 'pending_posts', 110),
  ('scheduled_posts_reviewed', 'communication', 'Publications programmées vérifiées',
   'Une publication approuvée part à son heure même si la personne qui l''a programmée a quitté l''équipe.', 'scheduled_posts', 120),
  ('media_reviewed', 'communication', 'Médiathèque revue', null, null, 130),
  ('approvals_reassigned', 'communication', 'Relectures confiées à l''équipe qui arrive', null, null, 140),
  ('upcoming_events_reviewed', 'evenements', 'Événements à venir revus', null, 'upcoming_events', 210),
  ('registrations_assigned', 'evenements', 'Gestion des inscriptions confiée', null, 'events_with_registrations', 220),
  ('event_reminders_checked', 'evenements', 'Rappels d''événements vérifiés', null, null, 230),
  ('cancellations_assigned', 'evenements', 'Qui annule ou prévient en cas d''imprévu : décidé', null, null, 240),
  ('campaigns_reviewed', 'recrutement', 'Recrutements en cours revus', null, 'active_campaigns', 310),
  ('committee_checked', 'recrutement', 'Accès du comité vérifiés',
   'Les accès finissent à leur date ; la nouvelle équipe ne voit pas les candidatures d''avant sans nomination.', 'committee_live', 320),
  ('interviews_assigned', 'recrutement', 'Entretiens à venir confiés', null, 'upcoming_interviews', 330),
  ('releases_assigned', 'recrutement', 'Annonce des décisions confiée', null, 'decisions_unreleased', 340),
  ('expiring_access_reviewed', 'recrutement', 'Accès qui expirent revus', null, 'committee_expiring', 350);

create table public.handover_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint handover_checklist_items_organization_id_fkey references public.organizations (id) on delete cascade,
  academic_year_id uuid not null
    constraint handover_checklist_items_academic_year_id_fkey references public.academic_years (id) on delete restrict,
  item_key text not null
    constraint handover_checklist_items_item_key_fkey references public.handover_template_items (item_key) on delete restrict,
  done boolean not null default false,
  note text
    constraint handover_checklist_items_note_check check (char_length(note) <= 500),
  -- Who takes it on (an active member of the organization), optional.
  assignee_user_id uuid
    constraint handover_checklist_items_assignee_user_id_fkey references auth.users (id) on delete set null,
  updated_by uuid
    constraint handover_checklist_items_updated_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint handover_checklist_items_key unique (organization_id, academic_year_id, item_key)
);
create index handover_checklist_items_academic_year_id_idx on public.handover_checklist_items (academic_year_id);
create index handover_checklist_items_item_key_idx on public.handover_checklist_items (item_key);
create index handover_checklist_items_assignee_user_id_idx on public.handover_checklist_items (assignee_user_id);
create index handover_checklist_items_updated_by_idx on public.handover_checklist_items (updated_by);
alter table public.handover_template_items enable row level security;
alter table public.handover_checklist_items enable row level security;
revoke all on public.handover_template_items, public.handover_checklist_items from anon, authenticated;

-- The key that ticks an area.
create or replace function private.handover_area_key(p_area text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_area when 'presidence' then 'governance.succession' when 'communication' then 'posts.approve'
                     when 'evenements' then 'events.edit' when 'recrutement' then 'recruitment.committee.manage' end;
$$;

-- A live count for an item (counts only: no applicant, no participant, no content).
create or replace function private.handover_metric(p_organization_id uuid, p_metric text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_president public.position_assignments%rowtype;
  v_transition public.leadership_transitions%rowtype;
begin
  case p_metric
    when 'succession' then
      select * into v_president from public.position_assignments a
       where a.organization_id = p_organization_id and a.office is not null and a.status = 'active'
         and a.starts_at <= now() and now() < a.ends_at
       order by a.ends_at limit 1;
      select * into v_transition from public.leadership_transitions t
       where t.organization_id = p_organization_id and t.status = 'open' and t.expires_at > now() limit 1;
      return jsonb_build_object(
        'state', case when v_president.id is null then 'vacant'
                      when private.office_holder(p_organization_id, v_president.office, v_president.ends_at) is not null then 'arranged'
                      when v_transition.id is null then 'none'
                      when exists (select 1 from public.leadership_transition_candidates c
                                    where c.transition_id = v_transition.id and c.accepted is null) then 'awaiting_acceptance'
                      else 'awaiting_approval' end,
        'ends_at', v_president.ends_at);
    when 'officers_expiring' then
      return to_jsonb((select count(*) from public.position_assignments a
                        where a.organization_id = p_organization_id and a.status = 'active' and a.starts_at <= now()
                          and now() < a.ends_at and a.ends_at <= now() + interval '30 days'));
    when 'delegations' then
      return to_jsonb((select count(*) from public.delegations d
                        where d.organization_id = p_organization_id and d.status = 'active' and d.ends_at > now()));
    when 'pending_posts' then
      return to_jsonb((select count(*) from public.post_revisions r join public.posts p on p.id = r.post_id
                        where p.organization_id = p_organization_id and r.status = 'submitted'));
    when 'scheduled_posts' then
      return to_jsonb((select count(*) from public.posts p where p.organization_id = p_organization_id and p.schedule_status = 'pending'));
    when 'upcoming_events' then
      return to_jsonb((select count(*) from public.events e
                        where e.organization_id = p_organization_id and e.status = 'scheduled' and e.starts_at > now()));
    when 'events_with_registrations' then
      return to_jsonb((select count(*) from public.events e
                        where e.organization_id = p_organization_id and e.status = 'scheduled' and e.starts_at > now()
                          and exists (select 1 from public.event_registrations r where r.event_id = e.id and r.status <> 'cancelled')));
    when 'active_campaigns' then
      return to_jsonb((select count(*) from public.recruitment_campaigns c
                        where c.organization_id = p_organization_id and c.status <> 'cancelled' and c.archived_at is null
                          and coalesce(c.closes_at, 'infinity'::timestamptz) > now() - interval '60 days'));
    when 'committee_live' then
      return to_jsonb((select count(*) from public.recruitment_committee_members cm
                        where cm.organization_id = p_organization_id and cm.revoked_at is null and cm.starts_at <= now() and cm.ends_at > now()));
    when 'committee_expiring' then
      return to_jsonb((select count(*) from public.recruitment_committee_members cm
                        where cm.organization_id = p_organization_id and cm.revoked_at is null and cm.ends_at > now()
                          and cm.ends_at <= now() + interval '30 days'));
    when 'upcoming_interviews' then
      return to_jsonb((select count(*) from public.recruitment_interviews i
                        join public.recruitment_interview_slots s on s.id = i.slot_id
                        join public.recruitment_campaigns c on c.id = s.campaign_id
                        where c.organization_id = p_organization_id and i.status = 'scheduled' and s.starts_at > now()));
    when 'decisions_unreleased' then
      return to_jsonb((select count(*) from public.recruitment_decisions d
                        join public.applications a on a.id = d.application_id
                        join public.recruitment_campaigns c on c.id = a.campaign_id
                        where c.organization_id = p_organization_id and d.status = 'finalized'));
    else
      return null;
  end case;
end;
$$;

-- Ticks (or unticks) an item of the current year, with an optional note and
-- the member who takes it on. Needs the area's key; audited.
create or replace function public.set_handover_item(
  p_organization_id uuid, p_item_key text, p_done boolean, p_note text default null, p_assignee_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_item public.handover_template_items%rowtype;
  v_year uuid := (select id from public.academic_years where status = 'current');
  v_id uuid;
begin
  select * into v_item from public.handover_template_items where item_key = p_item_key;
  if not found then
    raise exception 'check_unknown' using errcode = 'P0001';
  end if;
  if not private.user_has_organization_permission(v_actor, p_organization_id, private.handover_area_key(v_item.area), now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if v_year is null then
    raise exception 'academic_year_not_found' using errcode = 'P0001';
  end if;
  if p_assignee_user_id is not null and not exists (
       select 1 from public.memberships m
        where m.organization_id = p_organization_id and m.user_id = p_assignee_user_id and m.status = 'active') then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  insert into public.handover_checklist_items (organization_id, academic_year_id, item_key, done, note, assignee_user_id, updated_by)
  values (p_organization_id, v_year, p_item_key, coalesce(p_done, false), left(nullif(btrim(coalesce(p_note, '')), ''), 500),
          p_assignee_user_id, v_actor)
  on conflict (organization_id, academic_year_id, item_key)
  do update set done = excluded.done, note = excluded.note, assignee_user_id = excluded.assignee_user_id,
                updated_by = excluded.updated_by, updated_at = now()
  returning id into v_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, private.handover_area_key(v_item.area)), 'handover_item_updated',
    'continuity', p_organization_id, p_assignee_user_id, 'handover_checklist', v_id,
    jsonb_build_object('item', p_item_key, 'done', coalesce(p_done, false)));
end;
$$;

-- ---- Responsibility transfer (recruitment) -----------------------------------------------------------------

-- Moves the applications a committee member still has to review (no
-- submitted review yet) to another live reviewer of the same campaign, and
-- their upcoming interviews when the actor manages interviews. Every check
-- of assign_recruitment_reviews and update_interview_slot applies (scope,
-- conflicts, own application, availability); what cannot move stays with
-- its reviewer and is reported. Nobody gains access beyond their appointment.
create or replace function public.transfer_review_assignments(
  p_campaign_id uuid, p_from_member_id uuid, p_to_member_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_from public.recruitment_committee_members%rowtype;
  v_to public.recruitment_committee_members%rowtype;
  v_reason text := private.require_reason(p_reason);
  v_apps uuid[];
  v_assigned jsonb;
  v_moved uuid[];
  v_app public.applications%rowtype;
  v_slot record;
  v_slots integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_state text;
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  select * into v_from from public.recruitment_committee_members where id = p_from_member_id and campaign_id = p_campaign_id;
  select * into v_to from public.recruitment_committee_members where id = p_to_member_id and campaign_id = p_campaign_id;
  if v_from.id is null or v_to.id is null or v_from.id = v_to.id then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;

  v_apps := array(
    select ra.application_id from public.recruitment_review_assignments ra
     where ra.member_id = v_from.id and ra.campaign_id = p_campaign_id and ra.removed_at is null
       and not exists (select 1 from public.recruitment_reviews rv
                        where rv.application_id = ra.application_id and rv.reviewer_id = v_from.user_id
                          and rv.kind = 'application' and rv.status = 'submitted'));
  if cardinality(v_apps) > 0 then
    v_assigned := public.assign_recruitment_reviews(p_campaign_id, v_apps, array[v_to.id], 'each');
    v_skipped := coalesce(v_assigned -> 'skipped', '[]'::jsonb);
    -- Moved: the incoming reviewer now holds a live assignment on it.
    v_moved := array(
      select a from unnest(v_apps) a
       where exists (select 1 from public.recruitment_review_assignments ra
                      where ra.application_id = a and ra.member_id = v_to.id and ra.removed_at is null));
    update public.recruitment_review_assignments set removed_at = now(), removed_by = v_actor
     where member_id = v_from.id and removed_at is null and application_id = any (v_moved);
    for v_app in select * from public.applications where id = any (v_moved) loop
      perform private.log_application_activity(v_actor, v_app, 'reviewer_unassigned',
        jsonb_build_object('reviewer_name', private.person_name(v_from.user_id)));
    end loop;
  end if;

  if private.campaign_can(v_actor, v_campaign, 'interviews') then
    for v_slot in
      select s.id, s.location, s.meeting_link, s.instructions,
             array(select si.member_id from public.recruitment_slot_interviewers si where si.slot_id = s.id and si.member_id <> v_from.id)
             || v_to.id as members
        from public.recruitment_interview_slots s
       where s.campaign_id = p_campaign_id and s.cancelled_at is null and s.starts_at > now()
         and exists (select 1 from public.recruitment_slot_interviewers si where si.slot_id = s.id and si.member_id = v_from.id)
    loop
      begin
        perform public.update_interview_slot(v_slot.id, v_slot.location, v_slot.meeting_link, v_slot.instructions,
                                             array(select distinct m from unnest(v_slot.members) m));
        v_slots := v_slots + 1;
      exception when others then
        get stacked diagnostics v_state = message_text;
        v_skipped := v_skipped || jsonb_build_object('slot_id', v_slot.id, 'reason', left(v_state, 60));
      end;
    end loop;
  end if;

  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'review_responsibilities_transferred', 'recruitment',
    v_campaign.organization_id, v_from.user_id, 'recruitment_committee_member', v_from.id,
    jsonb_build_object('to', private.person_name(v_to.user_id), 'applications', coalesce(cardinality(v_moved), 0), 'slots', v_slots,
                       'skipped', jsonb_array_length(v_skipped)),
    v_reason);
  return jsonb_build_object('applications', coalesce(cardinality(v_moved), 0), 'slots', v_slots, 'skipped', v_skipped);
end;
$$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.detect_governance_issues(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.issue_recipients(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.issue_escalation(text) from public, anon, authenticated, service_role;
revoke all on function private.notify_governance_issue(public.governance_issues, text, text) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_mandate_reminders(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.check_governance_health(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_due_reminders() from public, anon, authenticated, service_role;
revoke all on function private.handover_area_key(text) from public, anon, authenticated, service_role;
revoke all on function private.handover_metric(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.set_handover_item(uuid, text, boolean, text, uuid) from public, anon;
revoke all on function public.transfer_review_assignments(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_handover_item(uuid, text, boolean, text, uuid) to authenticated;
grant execute on function public.transfer_review_assignments(uuid, uuid, uuid, text) to authenticated;
