-- Phase 14 · Privacy engineering: data-subject requests (access, portability,
-- rectification, erasure, restriction, objection, withdrawal of consent),
-- the personal-data export, coordinated erasure with a minimal ledger that a
-- restore cannot defeat, retention holds and the remaining retention
-- policies, approved versions of the privacy notice, personal-data breach
-- assessment with its 72-hour clock, and the hourly privacy housekeeping.
--
-- Who handles requests: the privacy officer (platform.privacy.requests,
-- provisioned by the project owner only, Phase 9) — never the guardian, never
-- the BDE offices by default. Every handler action needs the second factor
-- and leaves a trace in the request's own history. Nothing here sends a
-- notification to an authority or a person outside the site: decisions are
-- recorded, external reporting stays with the controller.

-- ---- Vocabulary --------------------------------------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events', 'recruitment', 'communications',
                      'continuity', 'analytics', 'privacy'));

alter table public.scheduled_jobs drop constraint scheduled_jobs_area_check;
alter table public.scheduled_jobs add constraint scheduled_jobs_area_check
  check (area in ('publishing', 'notifications', 'events', 'recruitment', 'governance', 'retention', 'storage', 'reports', 'privacy'));

alter table public.notifications drop constraint notifications_resource_type_check;
alter table public.notifications add constraint notifications_resource_type_check
  check (resource_type in ('event', 'application', 'recruitment_campaign', 'post', 'organization', 'transition', 'invitation',
                           'assignment', 'platform_assignment', 'broadcast', 'account', 'governance_issue',
                           'privacy_request', 'incident'));

insert into public.notification_types (key, topic, importance, email, confidential, description) values
  ('privacy_request_received', 'governance_actions', 'important', true, true,
   'Une demande sur les données personnelles à traiter (responsable des demandes).'),
  ('privacy_request_due', 'governance_actions', 'important', true, true,
   'Une demande sur les données personnelles arrive à son délai de réponse.'),
  ('privacy_breach_deadline', 'governance_actions', 'important', true, true,
   'Un incident de données personnelles dont la décision de notification reste à prendre.'),
  ('privacy_request_updated', 'account_security', 'important', true, true,
   'Ta demande sur tes données personnelles : reçue, prolongée, décidée, prête ou terminée.');

-- The profile of an erased account (names replaced, nothing else kept).
alter table public.profiles add column erased_at timestamptz;
comment on column public.profiles.erased_at is
  'Set when the person''s data was erased (Phase 14): the row stays only as "Compte supprimé" for the history it is part of.';

-- ---- Who handles requests ------------------------------------------------------------------------------------

create or replace function private.privacy_handlers()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.user_id from public.platform_assignments a
   where a.role = 'privacy_officer' and a.status = 'active' and a.starts_at <= now() and a.ends_at > now()
     and private.user_has_platform_permission(a.user_id, 'platform.privacy.requests', now());
$$;

create or replace function private.require_privacy_handler(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_permission(p_actor, 'platform.privacy.requests');
  perform private.require_aal2();
end;
$$;

-- A stable, non-reversible key for a person (the erasure ledger stores only this).
create or replace function private.person_key(p_user uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('vpc-erasure:' || p_user::text, 'UTF8')), 'hex');
$$;

-- ---- Retention holds -------------------------------------------------------------------------------------------

-- A narrow exception to deletion (a dispute, a legal claim), decided by a
-- named authority, with a purpose, a basis and a review date at most a year
-- away: past that date it no longer applies unless it is renewed. Never a
-- global switch.
create table public.retention_holds (
  id uuid primary key default gen_random_uuid(),
  scope text not null
    constraint retention_holds_scope_check check (scope in ('person', 'application', 'campaign', 'event', 'organization')),
  subject_id uuid not null,
  purpose text not null
    constraint retention_holds_purpose_check check (char_length(btrim(purpose)) between 10 and 500),
  legal_basis text not null
    constraint retention_holds_legal_basis_check check (char_length(btrim(legal_basis)) between 3 and 500),
  decided_by text not null
    constraint retention_holds_decided_by_check check (char_length(btrim(decided_by)) between 3 and 200),
  review_on date not null,
  created_by uuid
    constraint retention_holds_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid
    constraint retention_holds_released_by_fkey references auth.users (id) on delete set null,
  release_reason text
    constraint retention_holds_release_reason_check check (char_length(release_reason) between 3 and 500),
  constraint retention_holds_review_check check (review_on <= ((created_at at time zone 'Europe/Paris')::date + 366)),
  constraint retention_holds_released_check check ((released_at is null) = (release_reason is null))
);
create index retention_holds_subject_idx on public.retention_holds (scope, subject_id) where released_at is null;
create index retention_holds_created_by_idx on public.retention_holds (created_by);
create index retention_holds_released_by_idx on public.retention_holds (released_by);
alter table public.retention_holds enable row level security;
revoke all on public.retention_holds from anon, authenticated;

create or replace function private.is_held(p_scope text, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_subject is not null and exists (
    select 1 from public.retention_holds h
     where h.scope = p_scope and h.subject_id = p_subject and h.released_at is null
       and h.review_on >= (now() at time zone 'Europe/Paris')::date);
$$;

create or replace function private.application_held(p_app public.applications)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_held('application', p_app.id) or private.is_held('person', p_app.candidate_id)
      or private.is_held('campaign', p_app.campaign_id)
      or private.is_held('organization', (select c.organization_id from public.recruitment_campaigns c where c.id = p_app.campaign_id));
$$;

create or replace function private.registration_held(p_reg public.event_registrations)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_held('event', p_reg.event_id) or private.is_held('person', p_reg.user_id)
      or private.is_held('organization', (select e.organization_id from public.events e where e.id = p_reg.event_id));
$$;

-- ---- Privacy notice versions -----------------------------------------------------------------------------------

-- The approved texts of the privacy notice. The draft lives in the site's
-- code (src/lib/privacy/notice.ts); when the controller approves it, the
-- approval is recorded here with the exact text (sections) and its hash.
-- Acknowledging a notice is not consent: nothing here records consent.
create table public.privacy_notice_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null
    constraint privacy_notice_versions_version_check check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  language text not null default 'fr'
    constraint privacy_notice_versions_language_check check (language in ('fr', 'en')),
  sections jsonb not null
    constraint privacy_notice_versions_sections_check check (jsonb_typeof(sections) = 'array'),
  content_hash text not null,
  approved_by text not null
    constraint privacy_notice_versions_approved_by_check check (char_length(btrim(approved_by)) between 3 and 200),
  approval_reference text
    constraint privacy_notice_versions_reference_check check (char_length(approval_reference) <= 300),
  approved_on date not null,
  effective_at timestamptz not null,
  recorded_by uuid
    constraint privacy_notice_versions_recorded_by_fkey references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint privacy_notice_versions_version_key unique (version, language)
);
create index privacy_notice_versions_effective_idx on public.privacy_notice_versions (language, effective_at desc);
create index privacy_notice_versions_recorded_by_idx on public.privacy_notice_versions (recorded_by);
alter table public.privacy_notice_versions enable row level security;
revoke all on public.privacy_notice_versions from anon, authenticated;

create or replace function private.valid_notice_sections(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) between 1 and 40
     and not exists (
       select 1 from jsonb_array_elements(p) s
        where jsonb_typeof(s) is distinct from 'object'
           or jsonb_typeof(s -> 'heading') is distinct from 'string'
           or coalesce(char_length(s ->> 'heading'), 0) not between 1 and 120
           or jsonb_typeof(s -> 'paragraphs') is distinct from 'array'
           or (jsonb_typeof(s -> 'paragraphs') = 'array' and jsonb_array_length(s -> 'paragraphs') not between 1 and 30)
           or (jsonb_typeof(s -> 'paragraphs') = 'array'
               and exists (select 1 from jsonb_array_elements(s -> 'paragraphs') x
                            where jsonb_typeof(x) is distinct from 'string'
                               or coalesce(char_length(x #>> '{}'), 0) not between 1 and 3000)));
$$;

create or replace function public.record_privacy_notice_version(
  p_version text,
  p_language text,
  p_sections jsonb,
  p_approved_by text,
  p_reference text,
  p_approved_on date,
  p_effective_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
  v_hash text;
begin
  if not (private.user_has_platform_permission(v_actor, 'platform.privacy.requests', now())
          or private.user_has_platform_permission(v_actor, 'platform.organizations.manage', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.require_aal2();
  if not private.valid_notice_sections(p_sections) or p_approved_on is null or p_effective_at is null
     or p_approved_on > (now() at time zone 'Europe/Paris')::date or char_length(btrim(coalesce(p_approved_by, ''))) < 3 then
    raise exception 'privacy_notice_invalid' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(p_sections::text, 'UTF8')), 'hex');
  insert into public.privacy_notice_versions
    (version, language, sections, content_hash, approved_by, approval_reference, approved_on, effective_at, recorded_by)
  values (p_version, coalesce(p_language, 'fr'), p_sections, v_hash, btrim(p_approved_by), nullif(btrim(coalesce(p_reference, '')), ''),
          p_approved_on, p_effective_at, v_actor)
  returning id into v_id;
  perform private.log_governance_event(
    v_actor, 'self', 'privacy_notice_recorded', 'privacy', null, null, null, null,
    jsonb_build_object('version', p_version, 'language', coalesce(p_language, 'fr'), 'hash', v_hash, 'effective_at', p_effective_at));
  return jsonb_build_object('id', v_id, 'hash', v_hash);
exception when unique_violation then
  raise exception 'privacy_notice_version_exists' using errcode = 'P0001';
end;
$$;

-- The notice in force (for everyone, signed in or not), and the list of versions.
create or replace function public.public_privacy_notice(p_language text default 'fr')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'current', (select jsonb_build_object('version', v.version, 'language', v.language, 'sections', v.sections, 'hash', v.content_hash,
                                          'approved_by', v.approved_by, 'approved_on', v.approved_on, 'effective_at', v.effective_at)
                  from public.privacy_notice_versions v
                 where v.language = coalesce(p_language, 'fr') and v.effective_at <= now()
                 order by v.effective_at desc limit 1),
    'upcoming', (select jsonb_build_object('version', v.version, 'effective_at', v.effective_at)
                   from public.privacy_notice_versions v
                  where v.language = coalesce(p_language, 'fr') and v.effective_at > now()
                  order by v.effective_at limit 1),
    'history', coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'approved_on', v.approved_on,
                                                             'effective_at', v.effective_at, 'approved_by', v.approved_by, 'hash', v.content_hash)
                                          order by v.effective_at desc)
                           from public.privacy_notice_versions v where v.language = coalesce(p_language, 'fr')), '[]'::jsonb));
$$;

-- ---- Requests ------------------------------------------------------------------------------------------------

create sequence public.privacy_request_number_seq;
revoke all on sequence public.privacy_request_number_seq from public, anon, authenticated;

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null default ('PR-' || lpad(nextval('public.privacy_request_number_seq')::text, 6, '0'))
    constraint privacy_requests_reference_key unique,
  -- Kept as the (pseudonymous) account id after an erasure, so the request
  -- itself stays accountable; null only if an account row disappears.
  requester_id uuid
    constraint privacy_requests_requester_id_fkey references auth.users (id) on delete set null,
  kind text not null
    constraint privacy_requests_kind_check
    check (kind in ('access', 'portability', 'rectification', 'erasure', 'restriction', 'objection', 'consent_withdrawal', 'other')),
  details text
    constraint privacy_requests_details_check check (char_length(details) <= 2000),
  source text not null default 'site'
    constraint privacy_requests_source_check check (source in ('site', 'offline')),
  identity_status text not null
    constraint privacy_requests_identity_status_check check (identity_status in ('session', 'session_mfa', 'pending', 'verified', 'failed')),
  identity_note text
    constraint privacy_requests_identity_note_check check (char_length(identity_note) <= 500),
  status text not null default 'received'
    constraint privacy_requests_status_check
    check (status in ('received', 'under_review', 'approved', 'partially_approved', 'refused', 'in_progress', 'completed', 'withdrawn')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null,
  extended_until timestamptz,
  extension_reason text
    constraint privacy_requests_extension_reason_check check (char_length(extension_reason) between 3 and 1000),
  extension_notified_at timestamptz,
  handler_id uuid
    constraint privacy_requests_handler_id_fkey references auth.users (id) on delete set null,
  decision_reason text
    constraint privacy_requests_decision_reason_check check (char_length(decision_reason) <= 2000),
  decided_at timestamptz,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_requests_extension_check
    check ((extended_until is null) = (extension_reason is null)
           and (extended_until is null or (extended_until > due_at and extended_until <= due_at + interval '2 months 1 day'))),
  constraint privacy_requests_completed_check check ((status = 'completed') = (completed_at is not null)),
  constraint privacy_requests_withdrawn_check check ((status = 'withdrawn') = (withdrawn_at is not null)),
  constraint privacy_requests_decided_check
    check (status not in ('approved', 'partially_approved', 'refused', 'in_progress', 'completed') or decided_at is not null)
);
comment on table public.privacy_requests is
  'Data-subject requests (Phase 14). Read and written only through the privacy functions: the requester and the privacy officer.';
create index privacy_requests_requester_idx on public.privacy_requests (requester_id, received_at desc);
create index privacy_requests_open_idx on public.privacy_requests (due_at) where status not in ('completed', 'refused', 'withdrawn');
create index privacy_requests_handler_idx on public.privacy_requests (handler_id);
create trigger privacy_requests_set_updated_at before update on public.privacy_requests
  for each row execute function private.set_updated_at();
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from anon, authenticated;

-- The request's history: what happened, by whom, and what the requester sees.
create table public.privacy_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null
    constraint privacy_request_events_request_id_fkey references public.privacy_requests (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_id uuid
    constraint privacy_request_events_actor_id_fkey references auth.users (id) on delete set null,
  action text not null
    constraint privacy_request_events_action_check
    check (action in ('received', 'identity_checked', 'decided', 'extended', 'note', 'export_prepared', 'export_downloaded',
                      'erasure_executed', 'completed', 'withdrawn', 'reminder_sent')),
  note text
    constraint privacy_request_events_note_check check (char_length(note) <= 2000),
  visible_to_requester boolean not null default false
);
create index privacy_request_events_request_idx on public.privacy_request_events (request_id, occurred_at);
create index privacy_request_events_actor_idx on public.privacy_request_events (actor_id);
alter table public.privacy_request_events enable row level security;
revoke all on public.privacy_request_events from anon, authenticated;

-- What is handed to the requester (an export), held in the database (never
-- in Storage, never behind a URL that works alone), for 14 days at most.
create table public.privacy_request_artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    constraint privacy_request_artifacts_request_id_fkey references public.privacy_requests (id) on delete cascade,
  kind text not null default 'export'
    constraint privacy_request_artifacts_kind_check check (kind = 'export'),
  payload jsonb,
  size_bytes integer not null,
  created_by uuid
    constraint privacy_request_artifacts_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  download_count integer not null default 0,
  purged_at timestamptz,
  constraint privacy_request_artifacts_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint privacy_request_artifacts_purged_check check ((purged_at is null) = (payload is not null))
);
create index privacy_request_artifacts_request_idx on public.privacy_request_artifacts (request_id);
create index privacy_request_artifacts_expiry_idx on public.privacy_request_artifacts (expires_at) where purged_at is null;
create index privacy_request_artifacts_created_by_idx on public.privacy_request_artifacts (created_by);
alter table public.privacy_request_artifacts enable row level security;
revoke all on public.privacy_request_artifacts from anon, authenticated;

-- The answer is due one calendar month after receipt (GDPR art. 12(3)),
-- counted in Paris days: received on 31 January, due by the end of
-- 28 (or 29) February — the same date next month, or that month's last day.
create or replace function private.privacy_due_at(p_received timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select private.paris_start_of((((p_received at time zone 'Europe/Paris')::date + interval '1 month')::date) + 1);
$$;

create or replace function private.privacy_request_event(p_request uuid, p_actor uuid, p_action text, p_note text, p_visible boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.privacy_request_events (request_id, actor_id, action, note, visible_to_requester)
  values (p_request, p_actor, p_action, nullif(btrim(coalesce(p_note, '')), ''), p_visible);
$$;

-- Tells the requester that their request moved (reference and status only).
create or replace function private.notify_privacy_requester(p_request public.privacy_requests, p_step text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request.requester_id is null
     or exists (select 1 from public.profiles p where p.id = p_request.requester_id and p.erased_at is not null) then
    return;
  end if;
  perform private.notify(
    p_request.requester_id, 'privacy_request_updated', 'privacy-request:' || p_request.id || ':' || p_step,
    jsonb_build_object('reference', p_request.reference, 'kind', p_request.kind, 'step', p_step, 'status', p_request.status,
                       'due_at', coalesce(p_request.extended_until, p_request.due_at)),
    null, 'privacy_request', p_request.id);
end;
$$;

create or replace function private.notify_privacy_handlers(p_request public.privacy_requests, p_kind text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u uuid;
begin
  for v_u in select private.privacy_handlers() loop
    perform private.notify(
      v_u, p_kind, p_key || ':' || v_u,
      jsonb_build_object('reference', p_request.reference, 'kind', p_request.kind,
                         'due_at', coalesce(p_request.extended_until, p_request.due_at)),
      null, 'privacy_request', p_request.id);
  end loop;
end;
$$;

-- What a person has on the site, in counts (the privacy page, and the erasure plan).
create or replace function private.personal_data_counts(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'memberships', (select count(*) from public.memberships m where m.user_id = p_user),
    'positions', (select count(*) from public.position_assignments a where a.user_id = p_user),
    'registrations', (select count(*) from public.event_registrations r where r.user_id = p_user),
    'applications', (select count(*) from public.applications a where a.candidate_id = p_user),
    'documents', (select count(*) from public.application_documents d join public.applications a on a.id = d.application_id
                   where a.candidate_id = p_user and d.status <> 'removed'),
    'saved_items', (select count(*) from public.saved_items s where s.user_id = p_user),
    'interests', (select count(*) from public.student_interests i where i.user_id = p_user),
    'notifications', (select count(*) from public.notifications n where n.recipient_id = p_user),
    'follows', (select count(*) from public.notification_follows f where f.user_id = p_user),
    'public_team_profiles', (select count(*) from public.membership_public_profiles pp join public.memberships m on m.id = pp.membership_id
                              where m.user_id = p_user),
    'privacy_requests', (select count(*) from public.privacy_requests q where q.requester_id = p_user),
    'photo', exists (select 1 from public.profiles p where p.id = p_user and p.avatar_path is not null));
$$;

-- Responsibilities that an erasure would end now (offices, platform roles,
-- committee seats, delegations), in words the handler and the person read.
create or replace function private.active_responsibilities(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(x order by x ->> 'kind', x ->> 'organization')
      from (
        select jsonb_build_object('kind', 'position', 'organization', o.name, 'title', p.title, 'office', a.office, 'ends_at', a.ends_at) as x
          from public.position_assignments a
          join public.positions p on p.id = a.position_id
          join public.organizations o on o.id = a.organization_id
         where a.user_id = p_user and a.status = 'active' and a.ends_at > now()
        union all
        select jsonb_build_object('kind', 'platform_role', 'organization', null, 'title', pa.role, 'office', null, 'ends_at', pa.ends_at)
          from public.platform_assignments pa
         where pa.user_id = p_user and pa.status = 'active' and pa.ends_at > now()
        union all
        select jsonb_build_object('kind', 'committee', 'organization', o.name, 'title', c.title, 'office', null, 'ends_at', cm.ends_at)
          from public.recruitment_committee_members cm
          join public.recruitment_campaigns c on c.id = cm.campaign_id
          join public.organizations o on o.id = cm.organization_id
         where cm.user_id = p_user and cm.revoked_at is null and cm.ends_at > now()
        union all
        select jsonb_build_object('kind', 'delegation', 'organization', o.name, 'title', null, 'office', null, 'ends_at', d.ends_at)
          from public.delegations d join public.organizations o on o.id = d.organization_id
         where (d.delegate_user_id = p_user or d.delegator_user_id = p_user) and d.status = 'active' and d.ends_at > now()
      ) as r), '[]'::jsonb);
$$;

-- ---- The personal-data export ---------------------------------------------------------------------------------

-- Everything the site holds about one person that is theirs to receive
-- without anyone else's assessment: their account, profile, roles,
-- registrations, applications (their own answers and files' names, the
-- status they are shown), saved items, choices, notifications, reports and
-- requests. Never another person's data, never an internal evaluation (those
-- go through a formal access request, assessed by the privacy officer).
create or replace function private.personal_data(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'vpc-personal-data/1',
    'generated_at', now(),
    'account', (select jsonb_build_object('email', j ->> 'email', 'created_at', j ->> 'created_at',
                                          'last_sign_in_at', j ->> 'last_sign_in_at', 'email_confirmed_at', j ->> 'email_confirmed_at')
                  from (select to_jsonb(u) as j from auth.users u where u.id = p_user) as x),
    'second_factor', (select count(*) > 0 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified'),
    'profile', (select jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'display_name', p.display_name,
                                          'program', p.program, 'study_year', p.study_year, 'has_photo', p.avatar_path is not null,
                                          'onboarding_completed_at', p.onboarding_completed_at, 'created_at', p.created_at,
                                          'updated_at', p.updated_at)
                  from public.profiles p where p.id = p_user),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'status', m.status, 'joined_at', m.joined_at,
                                                                 'ended_at', m.ended_at, 'status_reason', m.status_reason) order by m.joined_at)
                               from public.memberships m join public.organizations o on o.id = m.organization_id
                              where m.user_id = p_user), '[]'::jsonb),
    'positions', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'position', p.title, 'office', a.office,
                                                               'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status,
                                                               'end_reason', a.end_reason) order by a.starts_at)
                             from public.position_assignments a
                             join public.positions p on p.id = a.position_id
                             join public.organizations o on o.id = a.organization_id
                            where a.user_id = p_user), '[]'::jsonb),
    'platform_roles', coalesce((select jsonb_agg(jsonb_build_object('role', pa.role, 'starts_at', pa.starts_at, 'ends_at', pa.ends_at,
                                                                    'status', pa.status) order by pa.starts_at)
                                  from public.platform_assignments pa where pa.user_id = p_user), '[]'::jsonb),
    'delegations_received', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'starts_at', d.starts_at,
                                                                          'ends_at', d.ends_at, 'status', d.status) order by d.starts_at)
                                        from public.delegations d join public.organizations o on o.id = d.organization_id
                                       where d.delegate_user_id = p_user), '[]'::jsonb),
    'committee_seats', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'campaign', c.title, 'role', cm.role,
                                                                     'starts_at', cm.starts_at, 'ends_at', cm.ends_at, 'revoked_at', cm.revoked_at)
                                                  order by cm.starts_at)
                                   from public.recruitment_committee_members cm
                                   join public.recruitment_campaigns c on c.id = cm.campaign_id
                                   join public.organizations o on o.id = cm.organization_id
                                  where cm.user_id = p_user), '[]'::jsonb),
    'public_team_profiles', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'hidden', pp.hidden,
                                                                          'show_photo', pp.show_photo, 'bio', pp.bio, 'updated_at', pp.updated_at))
                                        from public.membership_public_profiles pp
                                        join public.memberships m on m.id = pp.membership_id
                                        join public.organizations o on o.id = m.organization_id
                                       where m.user_id = p_user), '[]'::jsonb),
    'invitations_received', coalesce((select jsonb_agg(jsonb_build_object('organization', o.name, 'status', i.status,
                                                                          'created_at', i.created_at, 'expires_at', i.expires_at,
                                                                          'responded_at', i.responded_at) order by i.created_at)
                                        from public.organization_invitations i join public.organizations o on o.id = i.organization_id
                                       where i.email = (select lower(u.email) from auth.users u where u.id = p_user)
                                          or i.responded_by = p_user), '[]'::jsonb),
    'event_registrations', coalesce((select jsonb_agg(jsonb_build_object('event', e.title, 'organization', o.name, 'starts_at', e.starts_at,
                                                                         'status', r.status, 'reference', r.reference, 'created_at', r.created_at,
                                                                         'confirmed_at', r.confirmed_at, 'waitlisted_at', r.waitlisted_at,
                                                                         'promoted_at', r.promoted_at, 'cancelled_at', r.cancelled_at,
                                                                         'cancel_source', r.cancel_source) order by r.created_at)
                                       from public.event_registrations r
                                       join public.events e on e.id = r.event_id
                                       join public.organizations o on o.id = e.organization_id
                                      where r.user_id = p_user), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(jsonb_build_object(
                                 'organization', o.name, 'campaign', c.title, 'position', ps.title, 'reference', a.reference,
                                 'status', a.status, 'shown_status', private.candidate_status(a), 'created_at', a.created_at,
                                 'submitted_at', a.submitted_at, 'withdrawn_at', a.withdrawn_at, 'withdrawal_reason', a.withdrawal_reason,
                                 'privacy_acknowledged_at', a.privacy_acknowledged_at, 'candidate_snapshot', a.candidate_snapshot,
                                 'answers', a.answers,
                                 'documents', coalesce((select jsonb_agg(jsonb_build_object('file_name', d.file_name, 'mime_type', d.mime_type,
                                                                                            'size_bytes', d.size_bytes, 'status', d.status,
                                                                                            'created_at', d.created_at))
                                                          from public.application_documents d where d.application_id = a.id), '[]'::jsonb),
                                 'questions_asked', coalesce((select jsonb_agg(jsonb_build_object('question', q.question, 'asked_at', q.asked_at,
                                                                                                  'due_at', q.due_at, 'status', q.status,
                                                                                                  'answer', q.answer, 'answered_at', q.answered_at))
                                                                from public.recruitment_clarifications q
                                                               where q.application_id = a.id and q.status <> 'cancelled'), '[]'::jsonb),
                                 'interviews', coalesce((select jsonb_agg(jsonb_build_object('status', i.status, 'invited_at', i.invited_at,
                                                                                             'starts_at', s.starts_at, 'message', i.message))
                                                           from public.recruitment_interviews i
                                                           left join public.recruitment_interview_slots s on s.id = i.slot_id
                                                          where i.application_id = a.id), '[]'::jsonb),
                                 'offers', coalesce((select jsonb_agg(jsonb_build_object('status', f.status, 'expires_at', f.expires_at,
                                                                                         'responded_at', f.responded_at, 'response_note', f.response_note))
                                                       from public.recruitment_offers f where f.application_id = a.id), '[]'::jsonb),
                                 'history', coalesce((select jsonb_agg(jsonb_build_object('action', ev.action, 'at', ev.occurred_at) order by ev.occurred_at)
                                                        from public.application_events ev where ev.application_id = a.id), '[]'::jsonb))
                               order by a.created_at)
                                from public.applications a
                                join public.recruitment_campaigns c on c.id = a.campaign_id
                                join public.organizations o on o.id = c.organization_id
                                join public.recruitment_positions ps on ps.id = a.position_id
                               where a.candidate_id = p_user), '[]'::jsonb),
    'saved_items', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'created_at', s.created_at,
                                                                 'title', coalesce(e.title, c.title, ps.title, o.name,
                                                                                   (select r.title from public.posts po
                                                                                      join public.post_revisions r on r.id = po.published_revision_id
                                                                                     where po.id = s.post_id)))
                                              order by s.created_at)
                               from public.saved_items s
                               left join public.events e on e.id = s.event_id
                               left join public.recruitment_campaigns c on c.id = s.campaign_id
                               left join public.recruitment_positions ps on ps.id = s.position_id
                               left join public.organizations o on o.id = s.organization_id and s.kind = 'association'
                              where s.user_id = p_user), '[]'::jsonb),
    'interests', coalesce((select jsonb_agg(k.label order by k.label)
                             from public.student_interests i join public.association_categories k on k.id = i.category_id
                            where i.user_id = p_user), '[]'::jsonb),
    'notification_settings', (select to_jsonb(ns) - 'user_id' from public.notification_settings ns where ns.user_id = p_user),
    'notification_choices', coalesce((select jsonb_agg(jsonb_build_object('topic', np.topic, 'in_app', np.in_app, 'email', np.email))
                                        from public.notification_preferences np where np.user_id = p_user), '[]'::jsonb),
    'followed_associations', coalesce((select jsonb_agg(o.name order by o.name)
                                         from public.notification_follows f join public.organizations o on o.id = f.organization_id
                                        where f.user_id = p_user), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'created_at', n.created_at, 'read_at', n.read_at,
                                                                   'archived_at', n.archived_at) order by n.created_at)
                                 from public.notifications n where n.recipient_id = p_user), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'details', r.details, 'status', r.status,
                                                                   'created_at', r.created_at) order by r.created_at)
                                 from public.content_reports r where r.reporter_id = p_user), '[]'::jsonb),
    'privacy_requests', coalesce((select jsonb_agg(jsonb_build_object('reference', q.reference, 'kind', q.kind, 'status', q.status,
                                                                      'received_at', q.received_at, 'completed_at', q.completed_at)
                                                   order by q.received_at)
                                    from public.privacy_requests q where q.requester_id = p_user), '[]'::jsonb),
    'not_included', jsonb_build_array(
      'Les évaluations, notes et échanges internes des équipes de recrutement : ils se demandent par une demande d''accès, examinée par la personne chargée des données.',
      'Les données d''autres personnes (membres, évaluateur·rices, autres candidat·es).',
      'Les fichiers eux-mêmes : chaque document se télécharge depuis la page de la candidature.',
      'Les journaux de sécurité et l''historique de gouvernance, qui ne se consultent que par une demande d''accès.'));
$$;

-- The person's own export, on demand (nothing stored). Ten a day at most;
-- each one is recorded (who, when; never the content).
create or replace function public.my_personal_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if exists (select 1 from public.profiles p where p.id = v_actor and p.erased_at is not null) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if (select count(*) from public.governance_audit_events g
       where g.actor_user_id = v_actor and g.action = 'personal_data_exported' and g.occurred_at > now() - interval '1 day') >= 10 then
    raise exception 'privacy_export_limit' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(v_actor, 'self', 'personal_data_exported', 'privacy', null, v_actor, null, null,
                                       jsonb_build_object('channel', 'self_service'));
  return private.personal_data(v_actor);
end;
$$;

-- The privacy page: counts, responsibilities, requests (no export logged).
create or replace function public.my_privacy_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  return jsonb_build_object(
    'counts', private.personal_data_counts(v_actor),
    'responsibilities', private.active_responsibilities(v_actor),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'reference', q.reference, 'kind', q.kind, 'status', q.status, 'received_at', q.received_at,
               'due_at', coalesce(q.extended_until, q.due_at), 'extended', q.extended_until is not null,
               'extension_reason', q.extension_reason, 'decision_reason', case when q.status in ('refused', 'partially_approved', 'completed')
                                                                           then q.decision_reason end,
               'completed_at', q.completed_at, 'withdrawable', q.status in ('received', 'under_review'),
               'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.occurred_at, 'note', e.note)
                                                    order by e.occurred_at)
                                     from public.privacy_request_events e where e.request_id = q.id and e.visible_to_requester), '[]'::jsonb),
               'artifacts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'expires_at', a.expires_at, 'size_bytes', a.size_bytes,
                                                                          'downloaded_at', a.downloaded_at, 'available', a.purged_at is null
                                                                                                                         and a.expires_at > now()))
                                        from public.privacy_request_artifacts a where a.request_id = q.id), '[]'::jsonb))
             order by q.received_at desc)
        from public.privacy_requests q where q.requester_id = v_actor), '[]'::jsonb));
end;
$$;

-- ---- The requester's side ---------------------------------------------------------------------------------------

create or replace function public.submit_privacy_request(p_kind text, p_details text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_req public.privacy_requests%rowtype;
  v_aal text := coalesce((select auth.jwt() ->> 'aal'), 'aal1');
begin
  if p_kind is null or p_kind not in ('access', 'portability', 'rectification', 'erasure', 'restriction', 'objection',
                                      'consent_withdrawal', 'other')
     or char_length(coalesce(v_details, '')) > 2000
     or (p_kind in ('rectification', 'restriction', 'objection', 'other') and char_length(coalesce(v_details, '')) < 10) then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_actor and p.erased_at is not null) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  -- Enough for any real need, not enough to flood the officer (an open one of
  -- the same kind is answered first).
  if exists (select 1 from public.privacy_requests q where q.requester_id = v_actor and q.kind = p_kind
               and q.status in ('received', 'under_review', 'approved', 'partially_approved', 'in_progress'))
     or (select count(*) from public.privacy_requests q where q.requester_id = v_actor and q.received_at > now() - interval '30 days') >= 6 then
    raise exception 'privacy_request_limit' using errcode = 'P0001';
  end if;
  insert into public.privacy_requests (requester_id, kind, details, source, identity_status, identity_note, due_at)
  values (v_actor, p_kind, v_details, 'site', case when v_aal = 'aal2' then 'session_mfa' else 'session' end,
          'Demande faite depuis le compte, session ' || case when v_aal = 'aal2' then 'avec double authentification' else 'ouverte' end || '.',
          private.privacy_due_at(now()))
  returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'received', null, true);
  perform private.notify_privacy_requester(v_req, 'received');
  perform private.notify_privacy_handlers(v_req, 'privacy_request_received', 'privacy-request:' || v_req.id || ':received');
  return jsonb_build_object('id', v_req.id, 'reference', v_req.reference, 'due_at', v_req.due_at);
end;
$$;

create or replace function public.withdraw_privacy_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  select * into v_req from public.privacy_requests where id = p_request_id and requester_id = v_actor for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status not in ('received', 'under_review') then
    raise exception 'privacy_request_closed' using errcode = 'P0001';
  end if;
  update public.privacy_requests set status = 'withdrawn', withdrawn_at = now() where id = v_req.id returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'withdrawn', null, true);
end;
$$;

-- The requester downloads what the officer prepared: their own request
-- only, before its expiry, every download recorded.
create or replace function public.privacy_artifact_payload(p_artifact_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_art public.privacy_request_artifacts%rowtype;
  v_req public.privacy_requests%rowtype;
begin
  select a.* into v_art from public.privacy_request_artifacts a
    join public.privacy_requests q on q.id = a.request_id
   where a.id = p_artifact_id and q.requester_id = v_actor
   for update of a;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_art.purged_at is not null or v_art.expires_at <= now() then
    raise exception 'privacy_export_expired' using errcode = 'P0001';
  end if;
  update public.privacy_request_artifacts set downloaded_at = coalesce(downloaded_at, now()), download_count = download_count + 1
   where id = v_art.id;
  select * into v_req from public.privacy_requests where id = v_art.request_id;
  perform private.privacy_request_event(v_req.id, v_actor, 'export_downloaded', null, true);
  return v_art.payload;
end;
$$;

-- ---- The privacy officer's side --------------------------------------------------------------------------------

create or replace function public.privacy_requests_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_privacy_handler(v_actor);
  return jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'reference', q.reference, 'kind', q.kind, 'status', q.status, 'source', q.source,
               'identity_status', q.identity_status, 'received_at', q.received_at,
               'due_at', coalesce(q.extended_until, q.due_at), 'extended', q.extended_until is not null,
               'overdue', q.status not in ('completed', 'refused', 'withdrawn') and coalesce(q.extended_until, q.due_at) < now(),
               'requester', case when q.requester_id is null then null else private.person_name(q.requester_id) end,
               'handler', case when q.handler_id is null then null else private.person_name(q.handler_id) end)
             order by (q.status in ('completed', 'refused', 'withdrawn')), coalesce(q.extended_until, q.due_at))
        from public.privacy_requests q
       where q.status not in ('completed', 'refused', 'withdrawn') or q.updated_at > now() - interval '90 days'), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'title', i.title, 'kind', i.kind, 'severity', i.severity, 'status', i.status,
               'detected_at', i.detected_at, 'personal_data', i.personal_data, 'aware_at', i.aware_at,
               'authority_deadline', i.aware_at + interval '72 hours', 'risk', i.risk,
               'authority_decision', i.authority_decision, 'individuals_decision', i.individuals_decision,
               'pending_decision', i.personal_data <> 'no' and i.authority_decision = 'pending')
             order by i.detected_at desc)
        from public.operational_incidents i
       where i.status <> 'resolved' or i.updated_at > now() - interval '90 days'), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'scope', h.scope, 'subject_id', h.subject_id, 'purpose', h.purpose,
                                          'legal_basis', h.legal_basis, 'decided_by', h.decided_by, 'review_on', h.review_on,
                                          'created_at', h.created_at, 'lapsed', h.review_on < (now() at time zone 'Europe/Paris')::date)
                       order by h.review_on)
        from public.retention_holds h where h.released_at is null), '[]'::jsonb));
end;
$$;

create or replace function public.privacy_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  select * into v_req from public.privacy_requests where id = p_request_id;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'request', to_jsonb(v_req) - 'requester_id' - 'handler_id'
               || jsonb_build_object('effective_due_at', coalesce(v_req.extended_until, v_req.due_at),
                                     'extension_possible', v_req.extended_until is null and v_req.due_at > now()
                                                           and v_req.status not in ('completed', 'refused', 'withdrawn')),
    'requester', case when v_req.requester_id is null then null else jsonb_build_object(
                   'name', private.person_name(v_req.requester_id),
                   'email', (select u.email from auth.users u where u.id = v_req.requester_id),
                   'erased', exists (select 1 from public.profiles p where p.id = v_req.requester_id and p.erased_at is not null),
                   'counts', private.personal_data_counts(v_req.requester_id),
                   'responsibilities', private.active_responsibilities(v_req.requester_id),
                   'held', private.is_held('person', v_req.requester_id),
                   'held_applications', (select count(*) from public.applications a
                                          where a.candidate_id = v_req.requester_id and private.application_held(a))) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.occurred_at, 'note', e.note,
                                                            'visible', e.visible_to_requester,
                                                            'by', case when e.actor_id is null then null else private.person_name(e.actor_id) end)
                                         order by e.occurred_at)
                          from public.privacy_request_events e where e.request_id = v_req.id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'created_at', a.created_at, 'expires_at', a.expires_at,
                                                               'size_bytes', a.size_bytes, 'downloaded_at', a.downloaded_at,
                                                               'download_count', a.download_count, 'purged_at', a.purged_at))
                             from public.privacy_request_artifacts a where a.request_id = v_req.id), '[]'::jsonb),
    'pending_files', (select count(*) from private.storage_cleanup_queue s
                       where s.reason = 'privacy_erasure:' || v_req.id and s.done_at is null));
end;
$$;

-- A request received outside the site (the person lost access to their
-- account): recorded by the officer, identity to be verified by them.
create or replace function public.record_offline_privacy_request(
  p_email text,
  p_kind text,
  p_details text,
  p_received_at timestamptz,
  p_identity_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_user uuid;
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  if p_kind is null or p_kind not in ('access', 'portability', 'rectification', 'erasure', 'restriction', 'objection',
                                      'consent_withdrawal', 'other')
     or p_received_at is null or p_received_at > now() or p_received_at < now() - interval '1 month'
     or char_length(btrim(coalesce(p_identity_note, ''))) < 3 or char_length(coalesce(p_details, '')) > 2000 then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  v_user := private.user_id_by_email(p_email);
  if v_user is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  insert into public.privacy_requests (requester_id, kind, details, source, identity_status, identity_note, received_at, due_at, handler_id)
  values (v_user, p_kind, nullif(btrim(coalesce(p_details, '')), ''), 'offline', 'pending', left(btrim(p_identity_note), 500),
          p_received_at, private.privacy_due_at(p_received_at), v_actor)
  returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'received', 'Demande reçue hors du site.', true);
  return jsonb_build_object('id', v_req.id, 'reference', v_req.reference, 'due_at', v_req.due_at);
end;
$$;

create or replace function public.verify_privacy_request_identity(p_request_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  if p_status not in ('verified', 'failed', 'pending') or char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status in ('completed', 'refused', 'withdrawn') then
    raise exception 'privacy_request_closed' using errcode = 'P0001';
  end if;
  update public.privacy_requests
     set identity_status = p_status, identity_note = left(btrim(p_note), 500), handler_id = coalesce(handler_id, v_actor),
         status = case when status = 'received' then 'under_review' else status end
   where id = v_req.id;
  perform private.privacy_request_event(v_req.id, v_actor, 'identity_checked', p_status || ' — ' || btrim(p_note), false);
end;
$$;

-- The decision, with its reason (given to the requester when it is a
-- refusal or a partial answer, with the right to complain to the CNIL said
-- on the site). Identity must be established for anything but a refusal.
create or replace function public.decide_privacy_request(p_request_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  if p_decision not in ('approved', 'partially_approved', 'refused')
     or (p_decision <> 'approved' and char_length(btrim(coalesce(p_reason, ''))) < 10)
     or char_length(coalesce(p_reason, '')) > 2000 then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status not in ('received', 'under_review') then
    raise exception 'privacy_request_closed' using errcode = 'P0001';
  end if;
  if p_decision <> 'refused' and v_req.identity_status not in ('session', 'session_mfa', 'verified') then
    raise exception 'privacy_identity_unverified' using errcode = 'P0001';
  end if;
  update public.privacy_requests
     set status = p_decision, decision_reason = nullif(btrim(coalesce(p_reason, '')), ''), decided_at = now(),
         handler_id = coalesce(handler_id, v_actor)
   where id = v_req.id
  returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'decided', p_decision ||
    case when p_decision = 'approved' then '' else ' — ' || btrim(p_reason) end, true);
  perform private.notify_privacy_requester(v_req, 'decided');
  perform private.log_governance_event(v_actor, 'self', 'privacy_request_decided', 'privacy', null, v_req.requester_id,
                                       null, null, jsonb_build_object('reference', v_req.reference, 'kind', v_req.kind, 'decision', p_decision));
end;
$$;

-- One extension, of one or two months, decided and told to the requester
-- within the first month (art. 12(3)): never automatic.
create or replace function public.extend_privacy_request(p_request_id uuid, p_months integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  if p_months not in (1, 2) or char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status in ('completed', 'refused', 'withdrawn') then
    raise exception 'privacy_request_closed' using errcode = 'P0001';
  end if;
  if v_req.extended_until is not null or v_req.due_at <= now() then
    raise exception 'privacy_extension_unavailable' using errcode = 'P0001';
  end if;
  update public.privacy_requests
     set extended_until = private.paris_start_of(((((due_at at time zone 'Europe/Paris')::date - 1) + make_interval(months => p_months))::date) + 1),
         extension_reason = left(btrim(p_reason), 1000), extension_notified_at = now(), handler_id = coalesce(handler_id, v_actor)
   where id = v_req.id
  returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'extended', btrim(p_reason), true);
  perform private.notify_privacy_requester(v_req, 'extended');
end;
$$;

create or replace function public.add_privacy_request_note(p_request_id uuid, p_note text, p_visible boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  if char_length(btrim(coalesce(p_note, ''))) not between 3 and 2000 then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  select * into v_req from public.privacy_requests where id = p_request_id;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  perform private.privacy_request_event(v_req.id, v_actor, 'note', btrim(p_note), coalesce(p_visible, false));
  if coalesce(p_visible, false) then
    perform private.notify_privacy_requester(v_req, 'note-' || (select max(id) from public.privacy_request_events where request_id = v_req.id));
  end if;
end;
$$;

-- The export of an access or portability request, prepared for the
-- requester: their own data (as in the self-service download), and, when
-- the officer decides so for an access request, the evaluations of their
-- applications with every other person's name removed. Held 14 days.
create or replace function public.prepare_privacy_export(p_request_id uuid, p_include_assessments boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
  v_payload jsonb;
  v_id uuid;
begin
  perform private.require_privacy_handler(v_actor);
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.kind not in ('access', 'portability') or v_req.status not in ('approved', 'partially_approved', 'in_progress')
     or v_req.requester_id is null then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  v_payload := private.personal_data(v_req.requester_id) || jsonb_build_object('request', v_req.reference);
  if coalesce(p_include_assessments, false) and v_req.kind = 'access' then
    v_payload := v_payload || jsonb_build_object('assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'application', a.reference,
               'reviews', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'scores', r.scores, 'recommendation', r.recommendation,
                                                                        'note', r.note, 'submitted_at', r.submitted_at))
                                      from public.recruitment_reviews r where r.application_id = a.id and r.status = 'submitted'), '[]'::jsonb),
               'decisions', coalesce((select jsonb_agg(jsonb_build_object('outcome', d.outcome, 'status', d.status, 'rationale', d.rationale,
                                                                          'released_at', d.released_at))
                                        from public.recruitment_decisions d where d.application_id = a.id and d.status = 'released'), '[]'::jsonb),
               'stage', (select pl.stage from public.application_pipeline pl where pl.application_id = a.id)))
        from public.applications a where a.candidate_id = v_req.requester_id and a.status <> 'draft'), '[]'::jsonb),
      'assessments_note', 'Les noms des évaluateur·rices et des autres personnes sont retirés ; les commentaires d''équipe ne sont pas inclus.');
  end if;
  insert into public.privacy_request_artifacts (request_id, payload, size_bytes, created_by, expires_at)
  values (v_req.id, v_payload, octet_length(v_payload::text), v_actor, now() + interval '14 days')
  returning id into v_id;
  update public.privacy_requests set status = 'in_progress' where id = v_req.id returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'export_prepared',
    case when coalesce(p_include_assessments, false) then 'Export avec les évaluations (sans noms).' else 'Export des données du compte.' end, true);
  perform private.notify_privacy_requester(v_req, 'export-' || v_id);
  perform private.log_governance_event(v_actor, 'self', 'privacy_export_prepared', 'privacy', null, v_req.requester_id,
                                       null, null, jsonb_build_object('reference', v_req.reference,
                                                                      'assessments', coalesce(p_include_assessments, false),
                                                                      'size_bytes', octet_length(v_payload::text)));
  return jsonb_build_object('id', v_id, 'expires_at', now() + interval '14 days');
end;
$$;

-- ---- Erasure ---------------------------------------------------------------------------------------------------

create table private.erasure_ledger (
  person_key text primary key,
  erased_at timestamptz not null default now(),
  request_reference text,
  reapplied_at timestamptz,
  reapplied_count integer not null default 0
);
comment on table private.erasure_ledger is
  'One line per erased person: a one-way key of the account id, the date, the request reference. No name, e-mail or content. '
  'Used after a restore to erase again what the restore brought back (private.reconcile_erasures).';
alter table private.erasure_ledger enable row level security;
revoke all on private.erasure_ledger from public, anon, authenticated;

-- What an erasure would remove or keep, for the officer before confirming.
create or replace function private.erasure_plan(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'counts', private.personal_data_counts(p_user),
    'responsibilities', private.active_responsibilities(p_user),
    'held', private.is_held('person', p_user),
    'held_applications', (select count(*) from public.applications a where a.candidate_id = p_user and private.application_held(a)),
    'held_registrations', (select count(*) from public.event_registrations r where r.user_id = p_user and private.registration_held(r)),
    'files', (select count(*) from public.application_documents d join public.applications a on a.id = d.application_id
               where a.candidate_id = p_user and d.status <> 'removed' and not private.application_held(a))
             + (select count(*) from public.profiles p where p.id = p_user and p.avatar_path is not null),
    'kept', jsonb_build_array('governance_history_pseudonymous', 'audit_log_pseudonymous', 'reviews_written_for_others',
                              'association_content_authored', 'privacy_request_record'));
$$;

-- Erases one person: ends their responsibilities (when allowed), deletes
-- their own records, queues their files for deletion from Storage, turns the
-- account into a non-identifying stub that can never sign in (the history
-- they are part of says "Compte supprimé"), and records the ledger line.
-- Held records are left as they are. Running it again changes nothing.
create or replace function private.erase_person(p_user uuid, p_actor uuid, p_request_id uuid, p_end_responsibilities boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := 'privacy_erasure:' || coalesce(p_request_id::text, 'reconciliation');
  v_email text;
  v_apps uuid[];
  v_paths text[];
  v_events uuid[];
  v_avatar text;
  v_ref text;
  v_n integer;
  v_out jsonb := '{}'::jsonb;
  v_reason constant text := 'Effacement des données à la demande de la personne';
  v_ev uuid;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if private.is_held('person', p_user) then
    raise exception 'erasure_on_hold' using errcode = 'P0001';
  end if;
  if jsonb_array_length(private.active_responsibilities(p_user)) > 0 and not coalesce(p_end_responsibilities, false) then
    raise exception 'erasure_responsibilities_active' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;

  -- Responsibilities end now (the governance checker sees the vacancy and tells the right people).
  update public.position_assignments
     set status = case when starts_at > now() then 'cancelled' else 'ended' end,
         ends_at = case when starts_at > now() then ends_at else greatest(now(), starts_at + interval '1 second') end,
         ended_by = coalesce(p_actor, ended_by), end_reason = v_reason
   where user_id = p_user and status = 'active' and ends_at > now();
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('positions_ended', v_n);
  update public.platform_assignments
     set status = case when starts_at > now() then 'cancelled' else 'ended' end,
         ends_at = case when starts_at > now() then ends_at else greatest(now(), starts_at + interval '1 second') end,
         ended_by = coalesce(p_actor, ended_by), end_reason = v_reason
   where user_id = p_user and status = 'active' and ends_at > now();
  update public.delegations set status = 'revoked', revoked_at = now(), revoked_by = coalesce(p_actor, revoked_by)
   where (delegate_user_id = p_user or delegator_user_id = p_user) and status = 'active';
  update public.recruitment_committee_members
     set revoked_at = now(), revoked_by = coalesce(p_actor, revoked_by), revoke_reason = v_reason
   where user_id = p_user and revoked_at is null;
  update public.memberships set status = 'ended', ended_at = now(), status_reason = v_reason
   where user_id = p_user and status <> 'ended';

  -- Applications (with their answers, files, evaluations, interviews, decisions, offers), unless held.
  select coalesce(array_agg(a.id), '{}') into v_apps from public.applications a
   where a.candidate_id = p_user and not private.application_held(a);
  select coalesce(array_agg(d.object_path), '{}') into v_paths from public.application_documents d
   where d.application_id = any (v_apps) and d.status <> 'removed';
  delete from public.applications where id = any (v_apps);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('applications', v_n);
  update private.storage_cleanup_queue set reason = v_tag
   where bucket_id = 'recruitment-documents' and object_path = any (v_paths) and done_at is null;

  -- Registrations, unless held; a freed seat goes to the waiting list as usual.
  select coalesce(array_agg(distinct r.event_id), '{}') into v_events from public.event_registrations r
   where r.user_id = p_user and r.status = 'confirmed' and not private.registration_held(r);
  delete from public.event_registrations r where r.user_id = p_user and not private.registration_held(r);
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('registrations', v_n);
  foreach v_ev in array v_events loop
    if exists (select 1 from public.events e where e.id = v_ev and e.starts_at > now()) then
      perform private.promote_from_waitlist(v_ev);
    end if;
  end loop;

  delete from public.saved_items where user_id = p_user;
  delete from public.student_interests where user_id = p_user;
  delete from public.notification_follows where user_id = p_user;
  delete from public.notification_preferences where user_id = p_user;
  delete from public.notification_settings where user_id = p_user;
  delete from public.notification_preference_changes where user_id = p_user;
  delete from public.notification_suppressions where user_id = p_user;
  delete from public.notification_unsubscribe_tokens where user_id = p_user;
  delete from public.notification_broadcast_recipients where user_id = p_user;
  delete from public.notification_deliveries where recipient_id = p_user;
  delete from public.notifications where recipient_id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('notifications', v_n);
  delete from public.governance_issues where subject_user_id = p_user;
  delete from public.association_team_entries where membership_id in (select id from public.memberships where user_id = p_user);
  delete from public.membership_public_profiles where membership_id in (select id from public.memberships where user_id = p_user);
  update public.content_reports set reporter_id = null where reporter_id = p_user;
  delete from public.organization_invitations where email = v_email and status = 'pending';
  update public.organization_invitations set email = id::text || '@erased.invalid'
   where email = v_email;

  -- The profile becomes "Compte supprimé"; the photo leaves Storage.
  select avatar_path into v_avatar from public.profiles where id = p_user;
  if v_avatar is not null then
    insert into private.storage_cleanup_queue (bucket_id, object_path, reason) values ('avatars', v_avatar, v_tag)
    on conflict (bucket_id, object_path) do update set reason = excluded.reason, done_at = null, attempts = 0;
  end if;
  update public.profiles
     set first_name = 'Compte', last_name = 'supprimé', display_name = 'Compte supprimé', avatar_path = null,
         program = null, study_year = null, erased_at = coalesce(erased_at, now())
   where id = p_user;

  -- The account: no e-mail, no metadata, no way in. The row stays as the
  -- anchor of the pseudonymous history (memberships, mandates, audit).
  update auth.users
     set email = null, raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = jsonb_build_object('provider', 'erased', 'providers', '[]'::jsonb, 'erased', true),
         encrypted_password = '', confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''
   where id = p_user;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
    execute 'update auth.users set banned_until = ''infinity'' where id = $1' using p_user;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'deleted_at') then
    execute 'update auth.users set deleted_at = coalesce(deleted_at, now()) where id = $1' using p_user;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'phone') then
    execute 'update auth.users set phone = null where id = $1' using p_user;
  end if;
  delete from auth.identities where user_id = p_user;
  delete from auth.mfa_factors where user_id = p_user;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1' using p_user::text;
  end if;
  if to_regclass('auth.one_time_tokens') is not null then
    execute 'delete from auth.one_time_tokens where user_id = $1' using p_user;
  end if;

  select reference into v_ref from public.privacy_requests where id = p_request_id;
  insert into private.erasure_ledger (person_key, request_reference) values (private.person_key(p_user), v_ref)
  on conflict (person_key) do nothing;
  return v_out || jsonb_build_object('files_queued', cardinality(v_paths) + case when v_avatar is null then 0 else 1 end,
                                     'held_applications', (select count(*) from public.applications a where a.candidate_id = p_user),
                                     'held_registrations', (select count(*) from public.event_registrations r where r.user_id = p_user));
end;
$$;

create or replace function public.execute_privacy_erasure(p_request_id uuid, p_end_responsibilities boolean, p_confirm_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
  v_result jsonb;
begin
  perform private.require_privacy_handler(v_actor);
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.kind <> 'erasure' or v_req.status not in ('approved', 'partially_approved', 'in_progress') or v_req.requester_id is null then
    raise exception 'privacy_request_invalid' using errcode = 'P0001';
  end if;
  if v_req.identity_status not in ('session', 'session_mfa', 'verified') then
    raise exception 'privacy_identity_unverified' using errcode = 'P0001';
  end if;
  if p_confirm_reference is distinct from v_req.reference then
    raise exception 'privacy_confirmation_required' using errcode = 'P0001';
  end if;
  if v_req.requester_id = v_actor then
    raise exception 'privacy_self_handling' using errcode = 'P0001';
  end if;
  v_result := private.erase_person(v_req.requester_id, v_actor, v_req.id, p_end_responsibilities);
  update public.privacy_requests set status = 'in_progress', handler_id = coalesce(handler_id, v_actor) where id = v_req.id;
  perform private.privacy_request_event(v_req.id, v_actor, 'erasure_executed',
    'Comptes : ' || v_result::text, false);
  perform private.log_governance_event(v_actor, 'self', 'privacy_erasure_executed', 'privacy', null, v_req.requester_id, null, null,
                                       v_result || jsonb_build_object('reference', v_req.reference));
  return v_result;
end;
$$;

-- Completion: only once what was decided is done (for an erasure, every
-- queued file actually deleted from Storage).
create or replace function public.complete_privacy_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_req public.privacy_requests%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  select * into v_req from public.privacy_requests where id = p_request_id for update;
  if not found then
    raise exception 'privacy_request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status not in ('approved', 'partially_approved', 'in_progress') then
    raise exception 'privacy_request_closed' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if v_req.kind = 'erasure' and (
       not exists (select 1 from public.privacy_request_events e where e.request_id = v_req.id and e.action = 'erasure_executed')
       or exists (select 1 from private.storage_cleanup_queue s where s.reason = 'privacy_erasure:' || v_req.id and s.done_at is null)) then
    raise exception 'privacy_erasure_pending' using errcode = 'P0001';
  end if;
  if v_req.kind in ('access', 'portability')
     and not exists (select 1 from public.privacy_request_artifacts a where a.request_id = v_req.id) then
    raise exception 'privacy_export_missing' using errcode = 'P0001';
  end if;
  update public.privacy_requests set status = 'completed', completed_at = now() where id = v_req.id returning * into v_req;
  perform private.privacy_request_event(v_req.id, v_actor, 'completed', btrim(p_note), true);
  perform private.notify_privacy_requester(v_req, 'completed');
end;
$$;

-- After a database restore, erase again anyone the ledger says was erased.
-- Run by the owner as the first step of the restore runbook, before the site
-- reopens; the officer may run it too. Storage restores are separate.
create or replace function private.reconcile_erasures()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n integer := 0;
begin
  for v_user in
    select u.id from auth.users u join private.erasure_ledger l on l.person_key = private.person_key(u.id)
     where not private.is_held('person', u.id)
       and (coalesce((u.raw_app_meta_data ->> 'erased')::boolean, false) is false
        or u.email is not null
        or exists (select 1 from public.profiles p where p.id = u.id and (p.erased_at is null or p.first_name <> 'Compte'))
        or exists (select 1 from public.saved_items s where s.user_id = u.id)
        or exists (select 1 from public.applications a where a.candidate_id = u.id and not private.application_held(a))
        or exists (select 1 from public.event_registrations r where r.user_id = u.id and not private.registration_held(r))
        or exists (select 1 from public.notifications n where n.recipient_id = u.id))
  loop
    perform private.erase_person(v_user, null, null, true);
    update private.erasure_ledger set reapplied_at = now(), reapplied_count = reapplied_count + 1
     where person_key = private.person_key(v_user);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    perform private.log_governance_event(null, 'system', 'privacy_erasures_reapplied', 'privacy', null, null, null, null,
                                         jsonb_build_object('people', v_n));
  end if;
  return jsonb_build_object('reapplied', v_n, 'ledger', (select count(*) from private.erasure_ledger));
end;
$$;

create or replace function public.reconcile_privacy_erasures()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_privacy_handler(v_actor);
  return private.reconcile_erasures();
end;
$$;

-- ---- Retention holds (the officer) ------------------------------------------------------------------------------

create or replace function public.place_retention_hold(
  p_scope text,
  p_subject_id uuid,
  p_purpose text,
  p_legal_basis text,
  p_decided_by text,
  p_review_on date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
  v_exists boolean;
begin
  perform private.require_privacy_handler(v_actor);
  if p_scope not in ('person', 'application', 'campaign', 'event', 'organization') or p_subject_id is null
     or p_review_on is null or p_review_on <= (now() at time zone 'Europe/Paris')::date
     or p_review_on > (now() at time zone 'Europe/Paris')::date + 366
     or char_length(btrim(coalesce(p_purpose, ''))) not between 10 and 500
     or char_length(btrim(coalesce(p_legal_basis, ''))) not between 3 and 500
     or char_length(btrim(coalesce(p_decided_by, ''))) not between 3 and 200 then
    raise exception 'retention_hold_invalid' using errcode = 'P0001';
  end if;
  v_exists := (p_scope = 'person' and exists (select 1 from auth.users where id = p_subject_id))
            or (p_scope = 'application' and exists (select 1 from public.applications where id = p_subject_id))
            or (p_scope = 'campaign' and exists (select 1 from public.recruitment_campaigns where id = p_subject_id))
            or (p_scope = 'event' and exists (select 1 from public.events where id = p_subject_id))
            or (p_scope = 'organization' and exists (select 1 from public.organizations where id = p_subject_id));
  if not v_exists then
    raise exception 'retention_hold_invalid' using errcode = 'P0001';
  end if;
  insert into public.retention_holds (scope, subject_id, purpose, legal_basis, decided_by, review_on, created_by)
  values (p_scope, p_subject_id, btrim(p_purpose), btrim(p_legal_basis), btrim(p_decided_by), p_review_on, v_actor)
  returning id into v_id;
  perform private.log_governance_event(v_actor, 'self', 'retention_hold_placed', 'privacy', null,
                                       case when p_scope = 'person' then p_subject_id end, null, null,
                                       jsonb_build_object('scope', p_scope, 'review_on', p_review_on), btrim(p_purpose));
  return v_id;
end;
$$;

create or replace function public.release_retention_hold(p_hold_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_h public.retention_holds%rowtype;
begin
  perform private.require_privacy_handler(v_actor);
  update public.retention_holds set released_at = now(), released_by = v_actor, release_reason = v_reason
   where id = p_hold_id and released_at is null
  returning * into v_h;
  if not found then
    raise exception 'retention_hold_invalid' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(v_actor, 'self', 'retention_hold_released', 'privacy', null,
                                       case when v_h.scope = 'person' then v_h.subject_id end, null, null,
                                       jsonb_build_object('scope', v_h.scope), v_reason);
end;
$$;

-- ---- Personal-data breaches -------------------------------------------------------------------------------------

alter table public.operational_incidents
  add column personal_data text not null default 'unknown'
    constraint operational_incidents_personal_data_check check (personal_data in ('unknown', 'no', 'yes')),
  add column aware_at timestamptz,
  add column data_categories text[] not null default '{}'
    constraint operational_incidents_data_categories_check
    check (data_categories <@ array['identity', 'contact', 'account', 'membership', 'events', 'applications', 'documents',
                                    'evaluations', 'notifications', 'other']::text[]),
  add column affected_estimate integer
    constraint operational_incidents_affected_estimate_check check (affected_estimate >= 0),
  add column impact_types text[] not null default '{}'
    constraint operational_incidents_impact_types_check check (impact_types <@ array['confidentiality', 'integrity', 'availability']::text[]),
  add column risk text not null default 'unassessed'
    constraint operational_incidents_risk_check check (risk in ('unassessed', 'unlikely', 'risk', 'high')),
  add column authority_decision text not null default 'pending'
    constraint operational_incidents_authority_decision_check check (authority_decision in ('pending', 'not_required', 'notify')),
  add column authority_notified_at timestamptz,
  add column individuals_decision text not null default 'pending'
    constraint operational_incidents_individuals_decision_check check (individuals_decision in ('pending', 'not_required', 'inform')),
  add column individuals_informed_at timestamptz,
  add column assessment_note text
    constraint operational_incidents_assessment_note_check check (char_length(assessment_note) <= 4000),
  add column assessed_by uuid
    constraint operational_incidents_assessed_by_fkey references auth.users (id) on delete set null,
  add column assessed_at timestamptz,
  add constraint operational_incidents_breach_check
    check (personal_data <> 'yes' or aware_at is not null);
create index operational_incidents_assessed_by_idx on public.operational_incidents (assessed_by);

-- The officer opens a personal-data incident (an exposed document, a lost
-- account): the 72-hour clock starts at awareness.
create or replace function public.open_privacy_incident(p_title text, p_impact text, p_aware_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
begin
  perform private.require_privacy_handler(v_actor);
  if char_length(btrim(coalesce(p_title, ''))) not between 3 and 140 or p_aware_at is null or p_aware_at > now()
     or char_length(coalesce(p_impact, '')) > 500 or private.looks_secret(coalesce(p_impact, '') || ' ' || p_title) then
    raise exception 'incident_invalid' using errcode = 'P0001';
  end if;
  insert into public.operational_incidents (title, kind, severity, status, impact, detected_at, opened_by, owner_user_id,
                                            personal_data, aware_at)
  values (btrim(p_title), 'data', 'high', 'investigating', nullif(btrim(coalesce(p_impact, '')), ''), p_aware_at, v_actor, v_actor,
          'yes', p_aware_at)
  returning id into v_id;
  perform private.log_governance_event(v_actor, 'self', 'privacy_incident_opened', 'privacy', null, null, null, null,
                                       jsonb_build_object('incident', v_id, 'aware_at', p_aware_at));
  return v_id;
end;
$$;

-- The assessment and the notification decisions, recorded by the officer.
-- The site never notifies the CNIL or the people concerned itself: the
-- controller does, and the dates are recorded here.
create or replace function public.assess_privacy_incident(
  p_incident_id uuid,
  p_personal_data text,
  p_aware_at timestamptz,
  p_categories text[],
  p_affected_estimate integer,
  p_impact text[],
  p_risk text,
  p_authority_decision text,
  p_authority_notified_at timestamptz,
  p_individuals_decision text,
  p_individuals_informed_at timestamptz,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_privacy_handler(v_actor);
  if p_personal_data not in ('unknown', 'no', 'yes') or p_risk not in ('unassessed', 'unlikely', 'risk', 'high')
     or p_authority_decision not in ('pending', 'not_required', 'notify')
     or p_individuals_decision not in ('pending', 'not_required', 'inform')
     or (p_personal_data = 'yes' and p_aware_at is null) or p_aware_at > now()
     or (p_authority_notified_at is not null and (p_authority_decision <> 'notify' or p_authority_notified_at > now()))
     or (p_individuals_informed_at is not null and (p_individuals_decision <> 'inform' or p_individuals_informed_at > now()))
     or (p_authority_decision <> 'pending' and char_length(btrim(coalesce(p_note, ''))) < 10)
     or char_length(coalesce(p_note, '')) > 4000 or private.looks_secret(coalesce(p_note, '')) then
    raise exception 'incident_invalid' using errcode = 'P0001';
  end if;
  update public.operational_incidents
     set personal_data = p_personal_data, aware_at = p_aware_at, data_categories = coalesce(p_categories, '{}'),
         affected_estimate = p_affected_estimate, impact_types = coalesce(p_impact, '{}'), risk = p_risk,
         authority_decision = p_authority_decision, authority_notified_at = p_authority_notified_at,
         individuals_decision = p_individuals_decision, individuals_informed_at = p_individuals_informed_at,
         assessment_note = nullif(btrim(coalesce(p_note, '')), ''), assessed_by = v_actor, assessed_at = now()
   where id = p_incident_id;
  if not found then
    raise exception 'incident_not_found' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(v_actor, 'self', 'privacy_incident_assessed', 'privacy', null, null, null, null,
                                       jsonb_build_object('incident', p_incident_id, 'personal_data', p_personal_data, 'risk', p_risk,
                                                          'authority_decision', p_authority_decision,
                                                          'individuals_decision', p_individuals_decision));
end;
$$;

-- ---- Retention: the remaining policies, holds, approval note -------------------------------------------------------

alter table public.retention_policies drop constraint retention_policies_policy_key_check;
alter table public.retention_policies add constraint retention_policies_policy_key_check
  check (policy_key in ('notifications_read', 'notifications_archived', 'notifications_any', 'notification_deliveries',
                        'notification_preference_changes', 'notification_suppressions_cleared', 'event_registrations_past',
                        'governance_issues_resolved', 'privacy_requests_closed', 'organization_invitations_closed',
                        'content_reports_resolved', 'application_access_log', 'governance_audit_events'));
insert into public.retention_policies (policy_key, sort_order) values
  ('privacy_requests_closed', 90),
  ('organization_invitations_closed', 100),
  ('content_reports_resolved', 110),
  ('application_access_log', 120),
  ('governance_audit_events', 130);

create or replace function private.retention_eligible(p_key text, p_months integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz;
  v_count bigint;
  v_oldest timestamptz;
begin
  if p_months is null then
    return null;
  end if;
  v_cut := now() - make_interval(months => p_months);
  case p_key
    when 'notifications_read' then
      select count(*), min(read_at) into v_count, v_oldest from public.notifications where read_at is not null and read_at < v_cut;
    when 'notifications_archived' then
      select count(*), min(archived_at) into v_count, v_oldest from public.notifications where archived_at is not null and archived_at < v_cut;
    when 'notifications_any' then
      select count(*), min(created_at) into v_count, v_oldest from public.notifications where created_at < v_cut;
    when 'notification_deliveries' then
      select count(*), min(finished_at) into v_count, v_oldest from public.notification_deliveries where finished_at is not null and finished_at < v_cut;
    when 'notification_preference_changes' then
      select count(*), min(created_at) into v_count, v_oldest from public.notification_preference_changes where created_at < v_cut;
    when 'notification_suppressions_cleared' then
      select count(*), min(cleared_at) into v_count, v_oldest from public.notification_suppressions where cleared_at is not null and cleared_at < v_cut;
    when 'event_registrations_past' then
      select count(*), min(coalesce(e.ends_at, e.starts_at)) into v_count, v_oldest
        from public.event_registrations r join public.events e on e.id = r.event_id
       where coalesce(e.ends_at, e.starts_at) < v_cut and not private.registration_held(r);
    when 'governance_issues_resolved' then
      select count(*), min(resolved_at) into v_count, v_oldest from public.governance_issues where status = 'resolved' and resolved_at < v_cut;
    when 'privacy_requests_closed' then
      select count(*), min(coalesce(completed_at, withdrawn_at, decided_at)) into v_count, v_oldest from public.privacy_requests
       where status in ('completed', 'refused', 'withdrawn') and coalesce(completed_at, withdrawn_at, decided_at) < v_cut;
    when 'organization_invitations_closed' then
      select count(*), min(coalesce(responded_at, expires_at)) into v_count, v_oldest from public.organization_invitations
       where (status <> 'pending' or expires_at < now()) and coalesce(responded_at, expires_at, updated_at) < v_cut;
    when 'content_reports_resolved' then
      select count(*), min(resolved_at) into v_count, v_oldest from public.content_reports where resolved_at is not null and resolved_at < v_cut;
    when 'application_access_log' then
      select count(*), min(occurred_at) into v_count, v_oldest from public.application_access_log where occurred_at < v_cut;
    when 'governance_audit_events' then
      select count(*), min(occurred_at) into v_count, v_oldest from public.governance_audit_events where occurred_at < v_cut;
    else
      raise exception 'policy_unknown' using errcode = 'P0001';
  end case;
  return jsonb_build_object('count', v_count, 'oldest', v_oldest);
end;
$$;

-- A period is a decision: it now needs its reference (who decided, when),
-- and the audit and access logs keep at least a year.
create or replace function public.set_retention_policy(p_key text, p_months integer, p_note text default null, p_confirm_count bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.retention_policies%rowtype;
  v_eligible jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  select * into v_old from public.retention_policies where policy_key = p_key for update;
  if not found then
    raise exception 'policy_unknown' using errcode = 'P0001';
  end if;
  if p_months is not null and (p_months not between 1 and 120
                               or (p_key in ('application_access_log', 'governance_audit_events') and p_months < 12)) then
    raise exception 'retention_invalid' using errcode = 'P0001';
  end if;
  if p_months is not null and char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'retention_note_required' using errcode = 'P0001';
  end if;
  v_eligible := private.retention_eligible(p_key, p_months);
  if coalesce((v_eligible ->> 'count')::bigint, 0) > 0 and p_confirm_count is distinct from (v_eligible ->> 'count')::bigint then
    raise exception 'retention_confirmation_required' using errcode = 'P0001';
  end if;
  update public.retention_policies
     set keep_months = p_months, note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), updated_by = v_actor, updated_at = now()
   where policy_key = p_key;
  perform private.log_governance_event(
    v_actor, 'bde', 'retention_policy_changed', 'continuity', null, null, 'retention_policy', null,
    jsonb_build_object('policy', p_key, 'from_months', v_old.keep_months, 'to_months', p_months,
                       'eligible', coalesce((v_eligible ->> 'count')::bigint, 0)));
  return coalesce(v_eligible, jsonb_build_object('count', 0, 'oldest', null));
end;
$$;

-- Append-only logs may lose their oldest lines only through the retention
-- job, under a period the BDE decided (the job sets a local flag that no
-- API role can set: they have no table rights anyway).
create or replace function private.forbid_audit_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('vpc.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_records_are_append_only' using errcode = 'P0001';
end;
$$;

create or replace function private.forbid_record_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('vpc.retention_purge', true) = 'on' then
    return old;
  end if;
  if tg_op = 'UPDATE' or pg_trigger_depth() = 1 then
    raise exception 'records_are_append_only' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create or replace function private.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.retention_policies%rowtype;
  v_cut timestamptz;
  v_n integer;
  v_done jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_cron integer := 0;
  c_batch constant integer := 5000;
begin
  for v_p in select * from public.retention_policies where keep_months is not null order by sort_order loop
    v_cut := now() - make_interval(months => v_p.keep_months);
    v_n := 0;
    case v_p.policy_key
      when 'notifications_read' then
        delete from public.notifications where id in (
          select id from public.notifications where read_at is not null and read_at < v_cut limit c_batch);
      when 'notifications_archived' then
        delete from public.notifications where id in (
          select id from public.notifications where archived_at is not null and archived_at < v_cut limit c_batch);
      when 'notifications_any' then
        delete from public.notifications where id in (select id from public.notifications where created_at < v_cut limit c_batch);
      when 'notification_deliveries' then
        delete from public.notification_deliveries where id in (
          select id from public.notification_deliveries where finished_at is not null and finished_at < v_cut limit c_batch);
      when 'notification_preference_changes' then
        delete from public.notification_preference_changes where id in (
          select id from public.notification_preference_changes where created_at < v_cut limit c_batch);
      when 'notification_suppressions_cleared' then
        delete from public.notification_suppressions where id in (
          select id from public.notification_suppressions where cleared_at is not null and cleared_at < v_cut limit c_batch);
      when 'event_registrations_past' then
        delete from public.event_registrations where id in (
          select r.id from public.event_registrations r join public.events e on e.id = r.event_id
           where coalesce(e.ends_at, e.starts_at) < v_cut and not private.registration_held(r) limit c_batch);
      when 'governance_issues_resolved' then
        delete from public.governance_issues where id in (
          select id from public.governance_issues where status = 'resolved' and resolved_at < v_cut limit c_batch);
      when 'privacy_requests_closed' then
        delete from public.privacy_requests where id in (
          select id from public.privacy_requests where status in ('completed', 'refused', 'withdrawn')
             and coalesce(completed_at, withdrawn_at, decided_at) < v_cut limit c_batch);
      when 'organization_invitations_closed' then
        delete from public.organization_invitations where id in (
          select id from public.organization_invitations where (status <> 'pending' or expires_at < now())
             and coalesce(responded_at, expires_at, updated_at) < v_cut limit c_batch);
      when 'content_reports_resolved' then
        delete from public.content_reports where id in (
          select id from public.content_reports where resolved_at is not null and resolved_at < v_cut limit c_batch);
      when 'application_access_log' then
        perform set_config('vpc.retention_purge', 'on', true);
        delete from public.application_access_log where id in (
          select id from public.application_access_log where occurred_at < v_cut limit c_batch);
        perform set_config('vpc.retention_purge', 'off', true);
      when 'governance_audit_events' then
        perform set_config('vpc.retention_purge', 'on', true);
        delete from public.governance_audit_events where id in (
          select id from public.governance_audit_events where occurred_at < v_cut limit c_batch);
        perform set_config('vpc.retention_purge', 'off', true);
      else
        null;
    end case;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_done := v_done || jsonb_build_object(v_p.policy_key, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Technical housekeeping (private.retention_housekeeping).
  delete from public.notification_delivery_attempts where started_at < now() - interval '30 days';
  delete from public.notification_provider_events where received_at < now() - interval '30 days';
  delete from public.notification_email_captures where captured_at < now() - interval '7 days';
  delete from public.notification_worker_runs where started_at < now() - interval '14 days';
  delete from public.notification_unsubscribe_tokens
   where (used_at is not null and used_at < now() - interval '7 days') or expires_at < now() - interval '7 days';
  delete from public.notification_broadcast_recipients br
   using public.notification_broadcasts b
   where b.id = br.broadcast_id and b.status in ('dispatched', 'cancelled')
     and coalesce(b.dispatched_at, b.cancelled_at) < now() - interval '30 days';
  delete from public.scheduled_job_runs where started_at < now() - interval '30 days';
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
    get diagnostics v_cron = row_count;
  end if;

  if v_total > 0 then
    perform private.log_governance_event(
      null, 'scheduler', 'retention_cleanup_executed', 'continuity', null, null, 'retention_policy', null, v_done);
  end if;
  return jsonb_build_object('deleted', v_done, 'total', v_total, 'cron_details', v_cron);
end;
$$;

-- The recruitment purge (Phase 8 settings) leaves held applications alone.
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
           < now() - make_interval(months => v_settings.draft_retention_months)
       and not private.application_held(a);
    get diagnostics v_drafts = row_count;
  end if;
  if v_settings.withdrawn_retention_months is not null then
    delete from public.applications a
     where a.status = 'withdrawn' and a.withdrawn_at < now() - make_interval(months => v_settings.withdrawn_retention_months)
       and not private.application_held(a);
    get diagnostics v_withdrawn = row_count;
  end if;
  -- Everything evaluated about an application (reviews, notes, interviews,
  -- questions, decisions, records, files) leaves with it.
  if v_settings.submitted_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c
     where a.campaign_id = c.id and a.status = 'submitted'
       and not exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
       and (c.status = 'cancelled' or c.status = 'closed' or c.closes_at <= now())
       and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_settings.submitted_retention_months)
       and not private.application_held(a);
    get diagnostics v_submitted = row_count;
  end if;
  if v_settings.selected_retention_months is not null then
    delete from public.applications a using public.recruitment_campaigns c
     where a.campaign_id = c.id and a.status = 'submitted'
       and exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
       and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_settings.selected_retention_months)
       and not private.application_held(a);
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

-- ---- The hourly privacy housekeeping ----------------------------------------------------------------------------

-- Purges expired exports, reminds the officer of answers due within seven
-- days (once a day) and of breach decisions still pending (every few hours
-- within the 72 hours). Never decides anything.
create or replace function private.run_privacy_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged integer;
  v_due integer := 0;
  v_breach integer := 0;
  v_req public.privacy_requests%rowtype;
  v_inc public.operational_incidents%rowtype;
  v_u uuid;
  v_day text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD');
begin
  update public.privacy_request_artifacts set payload = null, purged_at = now()
   where purged_at is null and expires_at <= now();
  get diagnostics v_purged = row_count;

  for v_req in select * from public.privacy_requests
                where status not in ('completed', 'refused', 'withdrawn')
                  and coalesce(extended_until, due_at) < now() + interval '7 days' loop
    perform private.notify_privacy_handlers(v_req, 'privacy_request_due', 'privacy-request:' || v_req.id || ':due:' || v_day);
    v_due := v_due + 1;
  end loop;

  for v_inc in select * from public.operational_incidents
                where personal_data <> 'no' and authority_decision = 'pending' and aware_at is not null and status <> 'resolved' loop
    for v_u in select private.privacy_handlers()
               union select * from private.issue_recipients('operations', null, null) loop
      perform private.notify(
        v_u, 'privacy_breach_deadline',
        'privacy-incident:' || v_inc.id || ':' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD-HH24') || ':' || v_u,
        jsonb_build_object('title', v_inc.title, 'aware_at', v_inc.aware_at, 'deadline', v_inc.aware_at + interval '72 hours',
                           'target', case when v_u in (select private.privacy_handlers()) then 'privacy' else 'operations' end),
        null, 'incident', v_inc.id);
    end loop;
    v_breach := v_breach + 1;
  end loop;
  return jsonb_build_object('exports_purged', v_purged, 'requests_due', v_due, 'breach_reminders', v_breach);
end;
$$;

insert into public.scheduled_jobs (job_key, area, schedule, expected_every, critical, retryable, sort_order) values
  ('privacy-housekeeping', 'privacy', '40 * * * *', interval '1 hour', true, true, 110);

create or replace function private.execute_job(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  case p_key
    when 'publish-scheduled-posts' then return jsonb_build_object('published', private.run_scheduled_publications());
    when 'notifications-dispatch' then return private.run_notification_dispatch();
    when 'notification-reminders' then return private.enqueue_due_reminders();
    when 'recruitment-review-jobs' then return private.run_recruitment_review_jobs();
    when 'enqueue-recruitment-reminders' then return jsonb_build_object('queued', private.enqueue_recruitment_reminders());
    when 'governance-health' then return private.check_governance_health();
    when 'storage-cleanup' then return private.kick_storage_cleanup();
    when 'purge-recruitment-data' then return private.purge_recruitment_data();
    when 'data-retention' then return private.run_retention();
    when 'platform-health-report' then return private.send_platform_health_report();
    when 'analytics-refresh' then return private.run_analytics_refresh();
    when 'privacy-housekeeping' then return private.run_privacy_housekeeping();
    else raise exception 'job_unknown' using errcode = 'P0001';
  end case;
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('privacy-housekeeping', '40 * * * *', 'select private.run_scheduled_job(''privacy-housekeeping'')');
  end if;
end;
$cron$;

-- ---- Grants -------------------------------------------------------------------------------------------------------

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'private.privacy_handlers()', 'private.require_privacy_handler(uuid)', 'private.person_key(uuid)',
    'private.is_held(text, uuid)', 'private.application_held(public.applications)', 'private.registration_held(public.event_registrations)',
    'private.valid_notice_sections(jsonb)', 'private.privacy_due_at(timestamptz)',
    'private.privacy_request_event(uuid, uuid, text, text, boolean)',
    'private.notify_privacy_requester(public.privacy_requests, text)',
    'private.notify_privacy_handlers(public.privacy_requests, text, text)',
    'private.personal_data_counts(uuid)', 'private.active_responsibilities(uuid)', 'private.personal_data(uuid)',
    'private.erasure_plan(uuid)', 'private.erase_person(uuid, uuid, uuid, boolean)', 'private.reconcile_erasures()',
    'private.run_privacy_housekeeping()', 'private.retention_eligible(text, integer)', 'private.run_retention()',
    'private.purge_recruitment_data()', 'private.execute_job(text)',
    'private.forbid_audit_rewrite()', 'private.forbid_record_rewrite()'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.record_privacy_notice_version(text, text, jsonb, text, text, date, timestamptz)',
    'public.my_personal_data()', 'public.my_privacy_overview()', 'public.submit_privacy_request(text, text)',
    'public.withdraw_privacy_request(uuid)', 'public.privacy_artifact_payload(uuid)', 'public.privacy_requests_queue()',
    'public.privacy_request_detail(uuid)', 'public.record_offline_privacy_request(text, text, text, timestamptz, text)',
    'public.verify_privacy_request_identity(uuid, text, text)', 'public.decide_privacy_request(uuid, text, text)',
    'public.extend_privacy_request(uuid, integer, text)', 'public.add_privacy_request_note(uuid, text, boolean)',
    'public.prepare_privacy_export(uuid, boolean)', 'public.execute_privacy_erasure(uuid, boolean, text)',
    'public.complete_privacy_request(uuid, text)', 'public.reconcile_privacy_erasures()',
    'public.place_retention_hold(text, uuid, text, text, text, date)', 'public.release_retention_hold(uuid, text)',
    'public.open_privacy_incident(text, text, timestamptz)',
    'public.assess_privacy_incident(uuid, text, timestamptz, text[], integer, text[], text, text, timestamptz, text, timestamptz, text)',
    'public.set_retention_policy(text, integer, text, bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$grants$;

revoke all on function public.public_privacy_notice(text) from public;
grant execute on function public.public_privacy_notice(text) to anon, authenticated;
