-- Phase 11 · Academic years: a calendar and administrative frame the BDE
-- configures from the site (never in source code). A year carries its
-- dates, the mandate dates it recommends, a handover period, reference dates
-- for recruitment and the reminder offsets of mandate expiry. It grants
-- nothing: every right still comes from an active assignment inside its
-- dates (private.user_has_organization_permission). The rollover only makes
-- the next year current, after the BDE has reviewed the preparation
-- checklist: it changes no mandate, membership, post, event or application.

-- ---- Audit vocabulary ----------------------------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events', 'recruitment', 'communications',
                      'continuity'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category',
                           'event', 'event_registration', 'event_category',
                           'recruitment_campaign', 'recruitment_position', 'recruitment_form', 'recruitment_settings',
                           'application', 'recruitment_committee_member', 'recruitment_rubric', 'recruitment_interview_slot',
                           'recruitment_decision', 'recruitment_offer',
                           'notification_broadcast', 'notification_delivery', 'notification_config',
                           'academic_year', 'scheduled_job', 'governance_issue', 'handover_checklist', 'operational_incident',
                           'institutional_record', 'backup_verification', 'retention_policy'));

-- ---- Tables -----------------------------------------------------------------------------------------------

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  label text not null
    constraint academic_years_label_check check (label ~ '^[0-9]{4}[–-][0-9]{4}$'),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned'
    constraint academic_years_status_check check (status in ('planned', 'current', 'closed')),
  -- What the forms suggest for mandates of that year (the BDE may decide
  -- otherwise for any mandate: these are defaults, not rules).
  mandate_starts_at timestamptz not null,
  mandate_ends_at timestamptz not null,
  -- From when the handover is expected to be prepared.
  handover_starts_on date,
  recruitment_opens_on date,
  recruitment_closes_on date,
  -- Days before a mandate ends when its holder is reminded (Phase 10 notifications).
  reminder_offsets integer[] not null default '{60,30,14,7}'
    constraint academic_years_reminder_offsets_check
    check (cardinality(reminder_offsets) between 1 and 6 and 0 < all (reminder_offsets) and 120 >= all (reminder_offsets)),
  notes text
    constraint academic_years_notes_check check (char_length(notes) <= 2000),
  created_by uuid
    constraint academic_years_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rolled_over_at timestamptz,
  rolled_over_by uuid
    constraint academic_years_rolled_over_by_fkey references auth.users (id) on delete set null,
  constraint academic_years_label_key unique (label),
  constraint academic_years_period_check check (ends_on > starts_on and ends_on <= starts_on + 400),
  constraint academic_years_mandate_check
    check (mandate_ends_at > mandate_starts_at and mandate_ends_at <= mandate_starts_at + interval '13 months'),
  constraint academic_years_recruitment_check
    check (recruitment_closes_on is null or recruitment_opens_on is null or recruitment_closes_on >= recruitment_opens_on),
  constraint academic_years_no_overlap exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
comment on table public.academic_years is
  'Academic years (calendar and administrative defaults). Grant no right: permissions come from assignments only.';
create unique index academic_years_one_current on public.academic_years (status) where status = 'current';
create index academic_years_created_by_idx on public.academic_years (created_by);
create index academic_years_rolled_over_by_idx on public.academic_years (rolled_over_by);
create trigger academic_years_set_updated_at
  before update on public.academic_years
  for each row execute function private.set_updated_at();

-- The human confirmations of the preparation checklist (the automatic
-- checks are computed live, never stored as "done").
create table public.academic_year_checks (
  academic_year_id uuid not null
    constraint academic_year_checks_academic_year_id_fkey references public.academic_years (id) on delete cascade,
  check_key text not null
    constraint academic_year_checks_check_key_check check (check_key ~ '^[a-z_]{3,60}$'),
  done boolean not null default false,
  note text
    constraint academic_year_checks_note_check check (char_length(note) <= 500),
  confirmed_by uuid
    constraint academic_year_checks_confirmed_by_fkey references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  constraint academic_year_checks_pkey primary key (academic_year_id, check_key)
);
create index academic_year_checks_confirmed_by_idx on public.academic_year_checks (confirmed_by);

alter table public.academic_years enable row level security;
alter table public.academic_year_checks enable row level security;
revoke all on public.academic_years, public.academic_year_checks from anon, authenticated;

-- The year in progress, from the platform's existing convention (1 September
-- to 31 August, Paris; see src/lib/governance/labels.ts). The BDE edits it.
insert into public.academic_years (label, starts_on, ends_on, status, mandate_starts_at, mandate_ends_at, handover_starts_on, notes)
select format('%s–%s', y, y + 1), make_date(y, 9, 1), make_date(y + 1, 8, 31), 'current',
       make_date(y, 9, 1)::timestamp at time zone 'Europe/Paris',
       (make_date(y + 1, 8, 31) + time '23:59')::timestamp at time zone 'Europe/Paris',
       make_date(y + 1, 6, 1),
       'Créée automatiquement d''après la convention du site (1er septembre – 31 août). À vérifier par le BDE.'
  from (select case when extract(month from now() at time zone 'Europe/Paris') >= 9
                    then extract(year from now() at time zone 'Europe/Paris')::int
                    else extract(year from now() at time zone 'Europe/Paris')::int - 1 end as y) s;

-- ---- Helpers ----------------------------------------------------------------------------------------------

-- Midnight in Paris at the start of a date, as an instant (daylight saving included).
create or replace function private.paris_start_of(p_day date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_day::timestamp at time zone 'Europe/Paris';
$$;

create or replace function private.current_academic_year()
returns public.academic_years
language sql
stable
security definer
set search_path = ''
as $$
  select y from public.academic_years y where y.status = 'current';
$$;

-- The year being prepared: the first planned year after the current one.
create or replace function private.next_academic_year()
returns public.academic_years
language sql
stable
security definer
set search_path = ''
as $$
  select y from public.academic_years y
   where y.status = 'planned'
     and y.starts_on > coalesce((select c.ends_on from public.academic_years c where c.status = 'current'), '-infinity'::date)
   order by y.starts_on limit 1;
$$;

create or replace function private.academic_year_json(p_year public.academic_years)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_year.id is null then null else jsonb_build_object(
    'id', p_year.id, 'label', p_year.label, 'starts_on', p_year.starts_on, 'ends_on', p_year.ends_on, 'status', p_year.status,
    'mandate_starts_at', p_year.mandate_starts_at, 'mandate_ends_at', p_year.mandate_ends_at,
    'handover_starts_on', p_year.handover_starts_on, 'recruitment_opens_on', p_year.recruitment_opens_on,
    'recruitment_closes_on', p_year.recruitment_closes_on, 'reminder_offsets', to_jsonb(p_year.reminder_offsets),
    'notes', p_year.notes, 'created_at', p_year.created_at, 'rolled_over_at', p_year.rolled_over_at,
    'rolled_over_by_name', case when p_year.rolled_over_by is null then null else private.person_name(p_year.rolled_over_by) end) end;
$$;

-- ---- Reads --------------------------------------------------------------------------------------------------

-- The year in progress and the next one (labels and dates only): any signed-in person.
create or replace function public.current_academic_year()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'current', (select jsonb_build_object('id', y.id, 'label', y.label, 'starts_on', y.starts_on, 'ends_on', y.ends_on,
                                          'mandate_starts_at', y.mandate_starts_at, 'mandate_ends_at', y.mandate_ends_at)
                  from public.academic_years y where y.status = 'current'),
    'next', (select jsonb_build_object('id', y.id, 'label', y.label, 'starts_on', y.starts_on, 'ends_on', y.ends_on,
                                       'mandate_starts_at', y.mandate_starts_at, 'mandate_ends_at', y.mandate_ends_at)
               from private.next_academic_year() y where y.id is not null))
   where (select auth.uid()) is not null;
$$;

-- Every year with its configuration (BDE leadership).
create or replace function public.academic_years()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  return coalesce((select jsonb_agg(private.academic_year_json(y) order by y.starts_on desc) from public.academic_years y), '[]'::jsonb);
end;
$$;

-- ---- Configuration ------------------------------------------------------------------------------------------

-- Creates a planned year (p_id null) or updates one. A planned year may be
-- changed freely; the current year keeps its dates (its notes, handover,
-- recruitment dates and reminder offsets stay editable); a closed year is history.
create or replace function public.save_academic_year(
  p_id uuid,
  p_label text,
  p_starts_on date,
  p_ends_on date,
  p_mandate_starts_at timestamptz,
  p_mandate_ends_at timestamptz,
  p_handover_starts_on date default null,
  p_recruitment_opens_on date default null,
  p_recruitment_closes_on date default null,
  p_reminder_offsets integer[] default '{60,30,14,7}',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_year public.academic_years%rowtype;
  v_label text := replace(btrim(coalesce(p_label, '')), '-', '–');
  v_offsets integer[];
  v_id uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  select array_agg(distinct o order by o desc) into v_offsets from unnest(coalesce(p_reminder_offsets, '{60,30,14,7}')) o;
  if v_label !~ '^[0-9]{4}–[0-9]{4}$' or p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on
     or p_ends_on > p_starts_on + 400 or p_mandate_starts_at is null or p_mandate_ends_at is null
     or p_mandate_ends_at <= p_mandate_starts_at or p_mandate_ends_at > p_mandate_starts_at + interval '13 months'
     or (p_mandate_starts_at at time zone 'Europe/Paris')::date not between p_starts_on - 62 and p_starts_on + 62
     or (p_recruitment_closes_on is not null and p_recruitment_opens_on is not null and p_recruitment_closes_on < p_recruitment_opens_on)
     or cardinality(v_offsets) not between 1 and 6 or 0 >= any (v_offsets) or 120 < any (v_offsets) then
    raise exception 'academic_year_invalid' using errcode = 'P0001';
  end if;

  if p_id is null then
    begin
      insert into public.academic_years (label, starts_on, ends_on, status, mandate_starts_at, mandate_ends_at, handover_starts_on,
                                         recruitment_opens_on, recruitment_closes_on, reminder_offsets, notes, created_by)
      values (v_label, p_starts_on, p_ends_on, 'planned', p_mandate_starts_at, p_mandate_ends_at, p_handover_starts_on,
              p_recruitment_opens_on, p_recruitment_closes_on, v_offsets, nullif(btrim(coalesce(p_notes, '')), ''), v_actor)
      returning id into v_id;
    exception
      when unique_violation or exclusion_violation then
        raise exception 'academic_year_overlap' using errcode = 'P0001';
    end;
    if (select status from public.academic_years where id = v_id) = 'planned'
       and p_starts_on <= coalesce((select ends_on from public.academic_years where status = 'current'), '-infinity'::date) then
      raise exception 'academic_year_overlap' using errcode = 'P0001';
    end if;
    perform private.log_governance_event(
      v_actor, 'bde', 'academic_year_created', 'continuity', null, null, 'academic_year', v_id,
      jsonb_build_object('label', v_label, 'starts_on', p_starts_on, 'ends_on', p_ends_on));
    return v_id;
  end if;

  select * into v_year from public.academic_years where id = p_id for update;
  if not found then
    raise exception 'academic_year_not_found' using errcode = 'P0001';
  end if;
  if v_year.status = 'closed' then
    raise exception 'academic_year_closed' using errcode = 'P0001';
  end if;
  if v_year.status = 'current' and (v_label <> v_year.label or p_starts_on <> v_year.starts_on or p_ends_on <> v_year.ends_on
                                     or p_mandate_starts_at <> v_year.mandate_starts_at or p_mandate_ends_at <> v_year.mandate_ends_at) then
    raise exception 'academic_year_current_dates' using errcode = 'P0001';
  end if;
  begin
    update public.academic_years
       set label = v_label, starts_on = p_starts_on, ends_on = p_ends_on, mandate_starts_at = p_mandate_starts_at,
           mandate_ends_at = p_mandate_ends_at, handover_starts_on = p_handover_starts_on, recruitment_opens_on = p_recruitment_opens_on,
           recruitment_closes_on = p_recruitment_closes_on, reminder_offsets = v_offsets, notes = nullif(btrim(coalesce(p_notes, '')), '')
     where id = p_id;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'academic_year_overlap' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde', 'academic_year_updated', 'continuity', null, null, 'academic_year', p_id,
    jsonb_build_object('label', v_label, 'starts_on', p_starts_on, 'ends_on', p_ends_on, 'status', v_year.status));
  return p_id;
end;
$$;

-- ---- Preparation and rollover -------------------------------------------------------------------------------

-- The human confirmations a rollover needs (the automatic checks are listed by academic_year_preparation).
create or replace function private.academic_year_manual_checks()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['leadership_reviewed', 'mandates_reviewed', 'delegations_reviewed', 'recruitment_access_reviewed',
               'scheduled_content_reviewed', 'operational_contacts_reviewed', 'recovery_procedure_documented',
               'backup_health_reviewed', 'notification_test_done'];
$$;

-- Everything that can be verified from the database about the year being
-- prepared, plus the human confirmations. Counts only: no applicant, no
-- private content. status: ok · attention (should be looked at) · info.
create or replace function private.academic_year_auto_checks(p_year public.academic_years)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bde uuid := private.bde_organization_id();
  v_start timestamptz := greatest(p_year.mandate_starts_at, now());
  v_checks jsonb := '[]'::jsonb;
  v_office text;
  v_holder uuid;
  v_open public.leadership_transitions%rowtype;
  v_total integer;
  v_covered integer;
  v_missing jsonb;
  v_count integer;
  v_extra integer;
begin
  v_checks := v_checks || jsonb_build_object('key', 'year_configured', 'status', 'ok', 'value', p_year.label);

  select * into v_open from public.leadership_transitions t
   where t.organization_id = v_bde and t.kind = 'bde_succession' and t.status = 'open' and t.expires_at > now()
   order by t.created_at desc limit 1;
  foreach v_office in array array['bde_president', 'bde_vice_president'] loop
    v_holder := private.office_holder(v_bde, v_office, v_start);
    v_checks := v_checks || jsonb_build_object(
      'key', v_office || '_next',
      'status', case when v_holder is not null then 'ok' else 'attention' end,
      'value', case when v_holder is null then null else private.person_name(v_holder) end,
      'detail', case when v_holder is not null then 'covered'
                     when v_open.id is not null then 'transition_open' else 'none' end);
  end loop;
  if v_open.id is not null then
    v_checks := v_checks || jsonb_build_object(
      'key', 'bde_transition', 'status', 'attention', 'value', v_open.effective_at,
      'detail', jsonb_build_object(
        'approvals', (select coalesce(jsonb_agg(a.capacity), '[]'::jsonb) from public.leadership_transition_approvals a where a.transition_id = v_open.id),
        'accepted', (select count(*) from public.leadership_transition_candidates c where c.transition_id = v_open.id and c.accepted),
        'candidates', (select count(*) from public.leadership_transition_candidates c where c.transition_id = v_open.id),
        'expires_at', v_open.expires_at));
  end if;

  select count(*), count(*) filter (where private.office_holder(o.id, 'association_president', v_start) is not null),
         coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug) order by o.name)
                  filter (where private.office_holder(o.id, 'association_president', v_start) is null), '[]'::jsonb)
    into v_total, v_covered, v_missing
    from public.organizations o where o.kind = 'association' and o.status = 'active';
  v_checks := v_checks || jsonb_build_object(
    'key', 'association_presidents', 'status', case when v_covered = v_total then 'ok' else 'attention' end,
    'value', jsonb_build_object('covered', v_covered, 'total', v_total), 'detail', v_missing);

  select count(*) into v_count from public.position_assignments a
   where a.status = 'active' and a.office is null and a.starts_at <= now() and a.ends_at > now() and a.ends_at <= v_start + interval '1 day';
  v_checks := v_checks || jsonb_build_object('key', 'expiring_officers', 'status', case when v_count > 0 then 'attention' else 'ok' end, 'value', v_count);

  select count(*) into v_count from public.delegations d where d.status = 'active' and d.ends_at > now();
  v_checks := v_checks || jsonb_build_object('key', 'delegations', 'status', 'info', 'value', v_count);

  select count(*) into v_count from public.organization_invitations i where i.status = 'pending' and i.expires_at > now();
  v_checks := v_checks || jsonb_build_object('key', 'pending_invitations', 'status', case when v_count > 0 then 'attention' else 'ok' end, 'value', v_count);

  select count(*) into v_count from public.recruitment_campaigns c
   where c.status <> 'cancelled' and c.archived_at is null
     and (coalesce(c.closes_at, 'infinity'::timestamptz) > now() or exists (select 1 from public.applications a where a.campaign_id = c.id and a.status = 'submitted'
                                                                              and not private.application_decided(a.id)));
  select count(distinct cm.id) into v_extra from public.recruitment_committee_members cm
    join public.recruitment_campaigns c on c.id = cm.campaign_id
   where cm.revoked_at is null and cm.ends_at > now() and cm.ends_at <= v_start + interval '30 days'
     and c.status <> 'cancelled' and c.archived_at is null;
  v_checks := v_checks || jsonb_build_object('key', 'recruitment_campaigns', 'status', case when v_extra > 0 then 'attention' else 'info' end,
                                             'value', jsonb_build_object('campaigns', v_count, 'expiring_reviewers', v_extra));

  select count(*) into v_count from public.posts p where p.schedule_status = 'pending';
  v_checks := v_checks || jsonb_build_object('key', 'scheduled_posts', 'status', 'info', 'value', v_count);

  select count(*) into v_count from public.events e
   where e.publication = 'published' and e.status = 'scheduled' and e.starts_at > now();
  v_checks := v_checks || jsonb_build_object('key', 'upcoming_events', 'status', 'info', 'value', v_count);

  v_holder := private.guardian_user(v_start);
  v_checks := v_checks || jsonb_build_object('key', 'guardian', 'status', case when v_holder is null then 'attention' else 'ok' end,
                                             'value', case when v_holder is null then null else private.person_name(v_holder) end);
  return v_checks;
end;
$$;

create or replace function public.academic_year_preparation(p_year_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_year public.academic_years%rowtype;
  v_checks jsonb;
  v_manual jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  if p_year_id is null then
    v_year := private.next_academic_year();
  else
    select * into v_year from public.academic_years where id = p_year_id;
  end if;
  if v_year.id is null then
    return jsonb_build_object('year', null, 'current', private.academic_year_json(private.current_academic_year()));
  end if;
  v_checks := private.academic_year_auto_checks(v_year) || coalesce(private.academic_year_platform_checks(), '[]'::jsonb);
  select jsonb_agg(jsonb_build_object(
           'key', k, 'done', coalesce(c.done, false), 'note', c.note, 'confirmed_at', c.confirmed_at,
           'confirmed_by_name', case when c.confirmed_by is null then null else private.person_name(c.confirmed_by) end)
           order by array_position(private.academic_year_manual_checks(), k))
    into v_manual
    from unnest(private.academic_year_manual_checks()) k
    left join public.academic_year_checks c on c.academic_year_id = v_year.id and c.check_key = k;
  return jsonb_build_object(
    'year', private.academic_year_json(v_year),
    'current', private.academic_year_json(private.current_academic_year()),
    'auto', v_checks,
    'manual', v_manual,
    'can_roll_over', v_year.status = 'planned'
                     and v_year.starts_on <= (now() at time zone 'Europe/Paris')::date + 30
                     and not exists (select 1 from unnest(private.academic_year_manual_checks()) k
                                      where not exists (select 1 from public.academic_year_checks c
                                                         where c.academic_year_id = v_year.id and c.check_key = k and c.done)));
end;
$$;

-- Platform checks (jobs, backups, notifications, ownership) are added by the
-- operations migration; until then this returns nothing.
create or replace function private.academic_year_platform_checks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select '[]'::jsonb;
$$;

create or replace function public.confirm_academic_year_check(p_year_id uuid, p_check text, p_done boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_year public.academic_years%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  select * into v_year from public.academic_years where id = p_year_id;
  if not found then
    raise exception 'academic_year_not_found' using errcode = 'P0001';
  end if;
  if v_year.status <> 'planned' then
    raise exception 'academic_year_closed' using errcode = 'P0001';
  end if;
  if not p_check = any (private.academic_year_manual_checks()) then
    raise exception 'check_unknown' using errcode = 'P0001';
  end if;
  insert into public.academic_year_checks (academic_year_id, check_key, done, note, confirmed_by, confirmed_at)
  values (p_year_id, p_check, coalesce(p_done, false), left(nullif(btrim(coalesce(p_note, '')), ''), 500), v_actor, now())
  on conflict (academic_year_id, check_key)
  do update set done = excluded.done, note = excluded.note, confirmed_by = excluded.confirmed_by, confirmed_at = now();
end;
$$;

-- Makes the prepared year current. Needs the BDE key, the second factor,
-- every human confirmation, and an explicit acknowledgement of the
-- automatic checks that ask for attention. No more than 30 days early.
-- It changes the current year only: mandates, memberships, posts, events,
-- applications and history stay exactly as they are.
create or replace function public.confirm_academic_year_rollover(p_year_id uuid, p_acknowledge_warnings boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_year public.academic_years%rowtype;
  v_current public.academic_years%rowtype;
  v_warnings integer;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  select * into v_year from public.academic_years where id = p_year_id for update;
  if not found then
    raise exception 'academic_year_not_found' using errcode = 'P0001';
  end if;
  if v_year.status = 'current' then
    return jsonb_build_object('status', 'current', 'already', true);
  end if;
  if v_year.status <> 'planned' then
    raise exception 'academic_year_closed' using errcode = 'P0001';
  end if;
  select * into v_current from public.academic_years where status = 'current' for update;
  if v_current.id is not null and v_year.starts_on <= v_current.starts_on then
    raise exception 'academic_year_invalid' using errcode = 'P0001';
  end if;
  if v_year.starts_on > (now() at time zone 'Europe/Paris')::date + 30 then
    raise exception 'rollover_too_early' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(private.academic_year_manual_checks()) k
              where not exists (select 1 from public.academic_year_checks c
                                 where c.academic_year_id = p_year_id and c.check_key = k and c.done)) then
    raise exception 'rollover_checks_incomplete' using errcode = 'P0001';
  end if;
  select count(*) into v_warnings
    from jsonb_array_elements(private.academic_year_auto_checks(v_year) || coalesce(private.academic_year_platform_checks(), '[]'::jsonb)) c
   where c ->> 'status' = 'attention';
  if v_warnings > 0 and not coalesce(p_acknowledge_warnings, false) then
    raise exception 'rollover_warnings_unacknowledged' using errcode = 'P0001';
  end if;

  update public.academic_years set status = 'closed' where id = v_current.id;
  update public.academic_years set status = 'current', rolled_over_at = now(), rolled_over_by = v_actor where id = p_year_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'rollover_confirmed', 'continuity', null, null, 'academic_year', p_year_id,
    jsonb_build_object('from', v_current.label, 'to', v_year.label, 'warnings_acknowledged', v_warnings));
  return jsonb_build_object('status', 'current', 'from', v_current.label, 'to', v_year.label, 'warnings', v_warnings);
end;
$$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.paris_start_of(date) from public, anon, authenticated, service_role;
revoke all on function private.current_academic_year() from public, anon, authenticated, service_role;
revoke all on function private.next_academic_year() from public, anon, authenticated, service_role;
revoke all on function private.academic_year_json(public.academic_years) from public, anon, authenticated, service_role;
revoke all on function private.academic_year_manual_checks() from public, anon, authenticated, service_role;
revoke all on function private.academic_year_auto_checks(public.academic_years) from public, anon, authenticated, service_role;
revoke all on function private.academic_year_platform_checks() from public, anon, authenticated, service_role;
revoke all on function public.current_academic_year() from public, anon;
revoke all on function public.academic_years() from public, anon;
revoke all on function public.save_academic_year(uuid, text, date, date, timestamptz, timestamptz, date, date, date, integer[], text) from public, anon;
revoke all on function public.academic_year_preparation(uuid) from public, anon;
revoke all on function public.confirm_academic_year_check(uuid, text, boolean, text) from public, anon;
revoke all on function public.confirm_academic_year_rollover(uuid, boolean) from public, anon;
grant execute on function public.current_academic_year() to authenticated;
grant execute on function public.academic_years() to authenticated;
grant execute on function public.save_academic_year(uuid, text, date, date, timestamptz, timestamptz, date, date, date, integer[], text) to authenticated;
grant execute on function public.academic_year_preparation(uuid) to authenticated;
grant execute on function public.confirm_academic_year_check(uuid, text, boolean, text) to authenticated;
grant execute on function public.confirm_academic_year_rollover(uuid, boolean) to authenticated;
