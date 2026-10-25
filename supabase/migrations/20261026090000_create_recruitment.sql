-- Phase 8 · Recruitment: campaigns owned by one organization, the positions
-- they advertise, application forms as immutable versions, students'
-- applications (draft → submitted → withdrawn) and their private documents.
--
-- Three concerns are kept apart on a campaign, as for events:
--   publication  draft / published / unpublished        (the team, recruitment.campaigns.publish)
--   status       scheduled / paused / closed / cancelled (the team; "open", "upcoming" and
--                "closed by date" are derived from opens_at / closes_at, never stored)
--   moderation   hidden_at                               (the BDE, platform.content.moderate)
--
-- Nothing here gives an applicant any right in the association: an
-- application is not a membership, a position or a mandate (Phase 4 stays the
-- only way in). Nobody in the association reads an application in Phase 8:
-- the team sees counts; reviewer access is Phase 9's, scoped per campaign.

-- ---- Search ----------------------------------------------------------------------------------

create or replace function private.recruitment_search_vector(p_title text, p_summary text, p_description text)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select setweight(to_tsvector('french'::regconfig, private.fold_accents(p_title)), 'A')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(p_summary)), 'B')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(left(coalesce(p_description, ''), 4000))), 'C');
$$;
revoke all on function private.recruitment_search_vector(text, text, text) from public, anon, authenticated, service_role;

-- ---- Campaigns -------------------------------------------------------------------------------

create table public.recruitment_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint recruitment_campaigns_organization_id_fkey references public.organizations (id) on delete cascade,
  -- Given at the first publication, from the title; former ones redirect.
  slug text
    constraint recruitment_campaigns_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  title text not null default ''
    constraint recruitment_campaigns_title_check check (char_length(title) <= 120 and title !~ '[[:cntrl:]]'),
  summary text
    constraint recruitment_campaigns_summary_check check (char_length(summary) between 1 and 300 and summary !~ '[[:cntrl:]]'),
  description text
    constraint recruitment_campaigns_description_check check (char_length(description) between 1 and 8000),
  cover_media_id uuid
    constraint recruitment_campaigns_cover_media_id_fkey references public.association_media (id) on delete set null,
  -- "2026-2027": the school year the recruitment is for.
  academic_year text
    constraint recruitment_campaigns_academic_year_check
    check (academic_year ~ '^20[0-9]{2}-20[0-9]{2}$'
           and split_part(academic_year, '-', 2)::integer = split_part(academic_year, '-', 1)::integer + 1),
  opens_at timestamptz,
  closes_at timestamptz,
  timezone text not null default 'Europe/Paris'
    constraint recruitment_campaigns_timezone_check check (timezone = 'Europe/Paris'),
  -- How many positions of this campaign a student may apply to (active applications).
  max_applications smallint not null default 1
    constraint recruitment_campaigns_max_applications_check check (max_applications between 1 and 10),
  -- Self-declared study years (profiles.study_year) allowed to apply; null = every student.
  eligible_years smallint[]
    constraint recruitment_campaigns_eligible_years_check
    check (cardinality(eligible_years) between 1 and 8 and eligible_years <@ array[1, 2, 3, 4, 5, 6, 7, 8]::smallint[]),
  eligibility_note text
    constraint recruitment_campaigns_eligibility_note_check check (char_length(eligibility_note) between 1 and 300),
  contact_name text
    constraint recruitment_campaigns_contact_name_check check (char_length(contact_name) between 1 and 80 and contact_name !~ '[[:cntrl:]]'),
  contact_role text
    constraint recruitment_campaigns_contact_role_check check (char_length(contact_role) between 1 and 80 and contact_role !~ '[[:cntrl:]]'),
  contact_email text
    constraint recruitment_campaigns_contact_email_check
    check (char_length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- [{label, detail, date?}] and [{question, answer}]: plain text, validated by save_recruitment_campaign.
  process jsonb not null default '[]'::jsonb
    constraint recruitment_campaigns_process_check check (jsonb_typeof(process) = 'array' and jsonb_array_length(process) <= 6),
  faq jsonb not null default '[]'::jsonb
    constraint recruitment_campaigns_faq_check check (jsonb_typeof(faq) = 'array' and jsonb_array_length(faq) <= 10),
  publication text not null default 'draft'
    constraint recruitment_campaigns_publication_check check (publication in ('draft', 'published', 'unpublished')),
  first_published_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  status text not null default 'scheduled'
    constraint recruitment_campaigns_status_check check (status in ('scheduled', 'paused', 'closed', 'cancelled')),
  paused_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint recruitment_campaigns_cancelled_by_fkey references auth.users (id) on delete set null,
  cancellation_reason text
    constraint recruitment_campaigns_cancellation_reason_check check (char_length(cancellation_reason) between 3 and 500),
  archived_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid
    constraint recruitment_campaigns_hidden_by_fkey references auth.users (id) on delete set null,
  hidden_reason text
    constraint recruitment_campaigns_hidden_reason_check check (char_length(hidden_reason) between 3 and 500),
  active_form_version_id uuid,
  duplicated_from uuid
    constraint recruitment_campaigns_duplicated_from_fkey references public.recruitment_campaigns (id) on delete set null,
  version integer not null default 1
    constraint recruitment_campaigns_version_check check (version >= 1),
  created_by uuid
    constraint recruitment_campaigns_created_by_fkey references auth.users (id) on delete set null,
  updated_by uuid
    constraint recruitment_campaigns_updated_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (private.recruitment_search_vector(title, summary, description)) stored,

  constraint recruitment_campaigns_slug_key unique (slug),
  constraint recruitment_campaigns_window_check check (closes_at > opens_at),
  constraint recruitment_campaigns_published_slug_check check (publication = 'draft' or slug is not null),
  constraint recruitment_campaigns_cancelled_check
    check ((status = 'cancelled') = (cancelled_at is not null) and (status <> 'cancelled' or cancellation_reason is not null)),
  constraint recruitment_campaigns_hidden_check check ((hidden_at is null) = (hidden_reason is null))
);

comment on table public.recruitment_campaigns is
  'A recruitment run of one organization (Phase 8). Written only by the recruitment functions; visitors read it through public_recruitment*.';

create index recruitment_campaigns_organization_idx on public.recruitment_campaigns (organization_id, created_at desc);
create index recruitment_campaigns_public_idx on public.recruitment_campaigns (closes_at)
  where publication = 'published' and hidden_at is null;
create index recruitment_campaigns_search_idx on public.recruitment_campaigns using gin (search);
create index recruitment_campaigns_cover_idx on public.recruitment_campaigns (cover_media_id);
create index recruitment_campaigns_duplicated_from_idx on public.recruitment_campaigns (duplicated_from);

create trigger recruitment_campaigns_set_updated_at
  before update on public.recruitment_campaigns
  for each row execute function private.set_updated_at();

-- A campaign never changes owner, whoever runs the update.
create or replace function private.keep_campaign_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'campaign_owner_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_campaign_organization() from public, anon, authenticated, service_role;

create trigger recruitment_campaigns_keep_organization
  before update of organization_id on public.recruitment_campaigns
  for each row execute function private.keep_campaign_organization();

create table public.recruitment_campaign_slug_history (
  slug text primary key
    constraint recruitment_campaign_slug_history_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  campaign_id uuid not null
    constraint recruitment_campaign_slug_history_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  replaced_at timestamptz not null default now()
);
create index recruitment_campaign_slug_history_campaign_idx on public.recruitment_campaign_slug_history (campaign_id);

-- ---- Positions -------------------------------------------------------------------------------

create table public.recruitment_positions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_positions_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  slug text not null
    constraint recruitment_positions_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  title text not null
    constraint recruitment_positions_title_check check (char_length(title) between 1 and 80 and title !~ '[[:cntrl:]]'),
  team text
    constraint recruitment_positions_team_check check (char_length(team) between 1 and 60 and team !~ '[[:cntrl:]]'),
  summary text
    constraint recruitment_positions_summary_check check (char_length(summary) between 1 and 300 and summary !~ '[[:cntrl:]]'),
  description text
    constraint recruitment_positions_description_check check (char_length(description) between 1 and 4000),
  -- One mission / one expectation per line.
  missions text
    constraint recruitment_positions_missions_check check (char_length(missions) between 1 and 2000),
  expectations text
    constraint recruitment_positions_expectations_check check (char_length(expectations) between 1 and 2000),
  commitment text
    constraint recruitment_positions_commitment_check check (char_length(commitment) between 1 and 120 and commitment !~ '[[:cntrl:]]'),
  openings smallint
    constraint recruitment_positions_openings_check check (openings between 1 and 99),
  -- Earlier than the campaign's closing only (checked by save_recruitment_position).
  closes_at timestamptz,
  -- Overrides the campaign's study years for this position; null = the campaign's rule.
  eligible_years smallint[]
    constraint recruitment_positions_eligible_years_check
    check (cardinality(eligible_years) between 1 and 8 and eligible_years <@ array[1, 2, 3, 4, 5, 6, 7, 8]::smallint[]),
  -- The kind of governance position this role would become (information only: applying grants nothing).
  template_key text
    constraint recruitment_positions_template_key_fkey references public.position_templates (key) on delete set null,
  display_order integer not null default 0,
  -- A position that received applications is retired, never deleted: closed to new
  -- applications, off the public pages, kept for its applications.
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recruitment_positions_campaign_slug_key unique (campaign_id, slug)
);

comment on table public.recruitment_positions is
  'A role a campaign advertises. Not a governance position: applying to it grants no membership or permission.';

create index recruitment_positions_campaign_idx on public.recruitment_positions (campaign_id, display_order);
create index recruitment_positions_template_idx on public.recruitment_positions (template_key);

create trigger recruitment_positions_set_updated_at
  before update on public.recruitment_positions
  for each row execute function private.set_updated_at();

-- ---- Application forms: immutable published versions -----------------------------------------

-- The whole form of a campaign is one JSON document (sections, questions with
-- stable ids, options with stable ids, per-position scope), validated by
-- private.validate_form_schema. A published version never changes again
-- (freeze_published_form); a change is a new draft version, published
-- deliberately. Applications point to the version they answered.
create table public.recruitment_form_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_form_versions_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  number integer not null
    constraint recruitment_form_versions_number_check check (number >= 1),
  status text not null default 'draft'
    constraint recruitment_form_versions_status_check check (status in ('draft', 'published', 'superseded')),
  schema jsonb not null default '{"sections": [{"id": "s1", "title": "Ta candidature"}], "questions": []}'::jsonb
    constraint recruitment_form_versions_schema_check
    check (jsonb_typeof(schema) = 'object' and pg_column_size(schema) <= 200000),
  -- Optimistic lock of the draft (the builder sends the one it loaded).
  edit_version integer not null default 1
    constraint recruitment_form_versions_edit_version_check check (edit_version >= 1),
  created_by uuid
    constraint recruitment_form_versions_created_by_fkey references auth.users (id) on delete set null,
  updated_by uuid
    constraint recruitment_form_versions_updated_by_fkey references auth.users (id) on delete set null,
  published_by uuid
    constraint recruitment_form_versions_published_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  superseded_at timestamptz,

  constraint recruitment_form_versions_campaign_number_key unique (campaign_id, number),
  constraint recruitment_form_versions_published_check check (status = 'draft' or published_at is not null)
);

create unique index recruitment_form_versions_one_draft on public.recruitment_form_versions (campaign_id) where status = 'draft';
create unique index recruitment_form_versions_one_live on public.recruitment_form_versions (campaign_id) where status = 'published';

create trigger recruitment_form_versions_set_updated_at
  before update on public.recruitment_form_versions
  for each row execute function private.set_updated_at();

-- A published or superseded version keeps its questions for ever (the meaning of
-- every answer given to it). Only published → superseded is allowed afterwards.
create or replace function private.freeze_published_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    if new.schema is distinct from old.schema or new.campaign_id <> old.campaign_id or new.number <> old.number
       or not (new.status = old.status or (old.status = 'published' and new.status = 'superseded')) then
      raise exception 'form_version_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.freeze_published_form() from public, anon, authenticated, service_role;

create trigger recruitment_form_versions_freeze
  before update on public.recruitment_form_versions
  for each row execute function private.freeze_published_form();

-- A version that applications answered is never deleted.
create or replace function private.keep_answered_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'form_version_locked' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function private.keep_answered_form() from public, anon, authenticated, service_role;

create trigger recruitment_form_versions_keep
  before delete on public.recruitment_form_versions
  for each row
  when (pg_trigger_depth() = 0)
  execute function private.keep_answered_form();

alter table public.recruitment_campaigns
  add constraint recruitment_campaigns_active_form_version_id_fkey
  foreign key (active_form_version_id) references public.recruitment_form_versions (id) on delete set null;
create index recruitment_campaigns_active_form_idx on public.recruitment_campaigns (active_form_version_id);

-- ---- Applications ----------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  -- From the verified session (start_application), never from the browser.
  candidate_id uuid not null
    constraint applications_candidate_id_fkey references auth.users (id) on delete cascade,
  campaign_id uuid not null
    constraint applications_campaign_id_fkey references public.recruitment_campaigns (id) on delete restrict,
  position_id uuid not null
    constraint applications_position_id_fkey references public.recruitment_positions (id) on delete restrict,
  form_version_id uuid not null
    constraint applications_form_version_id_fkey references public.recruitment_form_versions (id) on delete restrict,
  status text not null default 'draft'
    constraint applications_status_check check (status in ('draft', 'submitted', 'withdrawn')),
  -- {question_id: value}, validated against the form version (private.application_answer_errors).
  answers jsonb not null default '{}'::jsonb
    constraint applications_answers_check check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 250000),
  -- Who applied, as the profile said at submission (self-declared programme and year).
  candidate_snapshot jsonb
    constraint applications_candidate_snapshot_check check (jsonb_typeof(candidate_snapshot) = 'object'),
  reference text not null default upper(substr(md5(gen_random_uuid()::text), 1, 8))
    constraint applications_reference_check check (reference ~ '^[A-Z0-9]{8}$'),
  version integer not null default 1
    constraint applications_version_check check (version >= 1),
  privacy_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text
    constraint applications_withdrawal_reason_check check (char_length(withdrawal_reason) between 1 and 500),

  constraint applications_reference_key unique (reference),
  constraint applications_submitted_check
    check ((status = 'draft') = (submitted_at is null)
           and (status <> 'draft' or (candidate_snapshot is null and privacy_acknowledged_at is null))
           and (status = 'draft' or (candidate_snapshot is not null and privacy_acknowledged_at is not null))),
  constraint applications_withdrawn_check check ((status = 'withdrawn') = (withdrawn_at is not null))
);

comment on table public.applications is
  'A student''s application to one recruitment position. Read by its candidate only in Phase 8; written only by the application functions.';

-- One active application (draft or submitted) per student and position: a second
-- click on "Candidater" finds the same one; a withdrawn one frees the place.
create unique index applications_one_active on public.applications (candidate_id, position_id) where status <> 'withdrawn';
create index applications_candidate_idx on public.applications (candidate_id, created_at desc);
create index applications_campaign_idx on public.applications (campaign_id, status);
create index applications_position_idx on public.applications (position_id, status);
create index applications_form_version_idx on public.applications (form_version_id);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function private.set_updated_at();

-- What was submitted stays what was submitted: once out of draft, an application's
-- answers, form version, position, campaign and candidate never change; status only
-- moves draft → submitted → withdrawn. (Writes come from the functions only; this
-- holds even for the database owner.)
create or replace function private.lock_submitted_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.candidate_id <> old.candidate_id or new.campaign_id <> old.campaign_id or new.position_id <> old.position_id then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  if old.status <> 'draft' then
    if new.answers is distinct from old.answers or new.form_version_id <> old.form_version_id
       or new.candidate_snapshot is distinct from old.candidate_snapshot or new.submitted_at is distinct from old.submitted_at
       or new.reference <> old.reference then
      raise exception 'application_locked' using errcode = 'P0001';
    end if;
  end if;
  if new.status <> old.status
     and not ((old.status = 'draft' and new.status = 'submitted') or (old.status = 'submitted' and new.status = 'withdrawn')) then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_submitted_application() from public, anon, authenticated, service_role;

create trigger applications_lock_submitted
  before update on public.applications
  for each row execute function private.lock_submitted_application();

-- The candidate's own history of an application (started, submitted, withdrawn,
-- documents replaced). Deliberately NOT the governance audit: that one is read by
-- an association's audit.view holders, and who applied is not theirs to see.
create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null
    constraint application_events_application_id_fkey references public.applications (id) on delete cascade,
  action text not null
    constraint application_events_action_check check (action in (
      'started', 'submitted', 'withdrawn', 'document_added', 'document_replaced', 'document_removed', 'form_updated')),
  details jsonb not null default '{}'::jsonb
    constraint application_events_details_check check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 2000),
  occurred_at timestamptz not null default now()
);
create index application_events_application_idx on public.application_events (application_id, occurred_at);

-- ---- Documents (private bucket) --------------------------------------------------------------

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    constraint application_documents_application_id_fkey references public.applications (id) on delete cascade,
  question_id text not null
    constraint application_documents_question_id_check check (question_id ~ '^[a-z0-9_]{1,40}$'),
  -- "applications/<application id>/<document id>": no name, no e-mail, no original file name.
  object_path text not null
    constraint application_documents_object_path_check
    check (object_path ~ '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- Shown back to the candidate only (sanitized by the upload route).
  file_name text not null
    constraint application_documents_file_name_check check (char_length(file_name) between 1 and 120 and file_name !~ '[[:cntrl:]/\\]'),
  mime_type text not null
    constraint application_documents_mime_type_check check (mime_type in (
      'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png')),
  size_bytes integer not null
    constraint application_documents_size_bytes_check check (size_bytes between 1 and 10485760),
  status text not null default 'pending'
    constraint application_documents_status_check check (status in ('pending', 'ready', 'removed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  removed_at timestamptz,

  constraint application_documents_object_path_key unique (object_path),
  constraint application_documents_ready_check check ((status = 'pending') = (confirmed_at is null and removed_at is null)
                                                       or status = 'removed'),
  constraint application_documents_removed_check check ((status = 'removed') = (removed_at is not null))
);
create index application_documents_application_idx on public.application_documents (application_id, question_id) where status <> 'removed';
create index application_documents_pending_idx on public.application_documents (created_at) where status = 'pending';

-- A document of a submitted application is frozen like its answers.
create or replace function private.lock_submitted_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select a.status from public.applications a where a.id = old.application_id) <> 'draft'
     and new.status is distinct from old.status then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_submitted_document() from public, anon, authenticated, service_role;

create trigger application_documents_lock_submitted
  before update on public.application_documents
  for each row execute function private.lock_submitted_document();

-- ---- Cleanup queue for private files --------------------------------------------------------

-- Files the database no longer needs (a replaced CV, a deleted draft, an
-- erased application, an upload never confirmed). The database cannot delete
-- Storage files itself: the maintenance worker (service role) empties this
-- queue through the Storage API.
create table private.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  reason text not null,
  queued_at timestamptz not null default now(),
  attempts smallint not null default 0,
  last_error text,
  done_at timestamptz,
  constraint storage_cleanup_queue_object_key unique (bucket_id, object_path)
);
alter table private.storage_cleanup_queue enable row level security;
revoke all on private.storage_cleanup_queue from public, anon, authenticated;

create or replace function private.queue_document_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status = 'removed' and old.status <> 'removed') then
    insert into private.storage_cleanup_queue (bucket_id, object_path, reason)
    values ('recruitment-documents', old.object_path, case when tg_op = 'DELETE' then 'document_deleted' else 'document_removed' end)
    on conflict (bucket_id, object_path) do nothing;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.queue_document_cleanup() from public, anon, authenticated, service_role;

create trigger application_documents_queue_cleanup
  after update or delete on public.application_documents
  for each row execute function private.queue_document_cleanup();

-- ---- Platform settings: applicant privacy notice and retention --------------------------------

-- One row. The BDE writes the applicant privacy information and the retention
-- periods the institution decided (null = not decided: nothing is erased
-- automatically, and the notice says the period is still to be set).
create table public.recruitment_settings (
  id boolean primary key default true
    constraint recruitment_settings_singleton_check check (id),
  privacy_notice text
    constraint recruitment_settings_privacy_notice_check check (char_length(privacy_notice) between 1 and 6000),
  privacy_contact text
    constraint recruitment_settings_privacy_contact_check check (char_length(privacy_contact) between 3 and 254),
  draft_retention_months smallint
    constraint recruitment_settings_draft_retention_check check (draft_retention_months between 1 and 60),
  withdrawn_retention_months smallint
    constraint recruitment_settings_withdrawn_retention_check check (withdrawn_retention_months between 1 and 60),
  submitted_retention_months smallint
    constraint recruitment_settings_submitted_retention_check check (submitted_retention_months between 1 and 60),
  updated_by uuid
    constraint recruitment_settings_updated_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.recruitment_settings (id) values (true);

-- ---- Messages: the outbox learns recruitment ------------------------------------------------

alter table public.notification_outbox
  add column application_id uuid
    constraint notification_outbox_application_id_fkey references public.applications (id) on delete cascade;
create index notification_outbox_application_idx on public.notification_outbox (application_id);
alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'event_registration_confirmed', 'event_waitlisted', 'event_promoted', 'event_registration_cancelled',
  'event_registration_removed', 'event_changed', 'event_cancelled', 'event_reminder',
  'application_submitted', 'application_withdrawn', 'application_deadline_reminder', 'application_form_updated',
  'recruitment_cancelled'));

-- ---- Permissions ---------------------------------------------------------------------------

update public.permissions
   set label = 'Préparer les recrutements',
       description = 'Créer les campagnes, leurs postes, leurs dates et l''éligibilité ; les dupliquer d''une année sur l''autre.',
       module_ready = true
 where key = 'recruitment.campaigns.manage';
update public.permissions
   set label = 'Construire les formulaires',
       description = 'Écrire les questions des candidatures (en brouillon) et demander des documents.',
       module_ready = true
 where key = 'recruitment.questions.manage';

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('recruitment.campaigns.publish', 'organization', 'recruitment', 'Publier les recrutements',
   'Mettre en ligne, retirer, mettre en pause, clore, annuler ; publier une nouvelle version du formulaire ; changer les dates d''un recrutement publié.',
   true, true, false, true, 79);

-- Offices carry every organization key; the templates made to run recruitment get it too.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, 'recruitment.campaigns.publish'
  from public.position_templates t
 where t.office is not null or t.key in ('vice_president', 'recruitment_manager')
on conflict do nothing;

insert into public.position_permissions (position_id, permission_key)
select p.id, 'recruitment.campaigns.publish'
  from public.positions p
 where p.office is not null
on conflict do nothing;

-- ---- Audit vocabulary ------------------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events', 'recruitment'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category',
                           'event', 'event_registration', 'event_category',
                           'recruitment_campaign', 'recruitment_position', 'recruitment_form', 'recruitment_settings'));

-- ---- Who works on recruitment (caller only, for the read policies) -----------------------------

create or replace function private.my_recruitment_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
   where (select auth.uid()) is not null
     and exists (
       select 1
         from unnest(array['recruitment.campaigns.manage', 'recruitment.questions.manage', 'recruitment.campaigns.publish']) as k (key)
        where private.user_has_organization_permission((select auth.uid()), o.id, k.key, now()));
$$;
revoke all on function private.my_recruitment_organization_ids() from public, anon, authenticated, service_role;
grant execute on function private.my_recruitment_organization_ids() to authenticated;

-- The candidate of an application, for the Storage policies (caller only).
create or replace function private.my_application_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.applications a where a.candidate_id = (select auth.uid());
$$;
revoke all on function private.my_application_ids() from public, anon, authenticated, service_role;
grant execute on function private.my_application_ids() to authenticated;

-- ---- Images: recruitment teams use the association library -----------------------------------

create or replace function private.my_media_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
   where (select auth.uid()) is not null
     and exists (
       select 1
         from unnest(array['organization.settings.update', 'organization.page.publish', 'media.manage',
                           'posts.create', 'posts.edit', 'posts.approve', 'posts.publish',
                           'events.create', 'events.edit', 'events.publish',
                           'recruitment.campaigns.manage', 'recruitment.campaigns.publish']) as k (key)
        where private.user_has_organization_permission((select auth.uid()), o.id, k.key, now())
     );
$$;

create or replace function private.can_upload_media(p_user uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission(p_user, p_organization_id, 'media.manage', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'posts.create', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'events.create', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'recruitment.campaigns.manage', now());
$$;

drop policy association_media_insert on storage.objects;
create policy association_media_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'association-media'
    and private.association_media_organization(name) is not null
    and (
      (select private.has_organization_permission(private.association_media_organization(name), 'media.manage'))
      or (select private.has_organization_permission(private.association_media_organization(name), 'posts.create'))
      or (select private.has_organization_permission(private.association_media_organization(name), 'events.create'))
      or (select private.has_organization_permission(private.association_media_organization(name), 'recruitment.campaigns.manage'))
    )
  );

-- ---- Storage: the private documents bucket ---------------------------------------------------

-- PRIVATE. PDF, DOCX, JPEG, PNG, 10 MB at most (each question may ask for less).
-- The upload route checks the content itself (signatures, no macros) before it
-- reserves a document; Storage enforces type and size again.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruitment-documents', 'recruitment-documents', false, 10485760,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only to a path the candidate reserved for their own draft (reserve_application_document).
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
     where d.object_path = p_name and d.status = 'pending'
       and a.candidate_id = (select auth.uid()) and a.status = 'draft');
$$;

-- Read: the candidate, for their own documents (Phase 9 adds assigned reviewers).
create or replace function private.can_read_application_document(p_name text)
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
     where d.object_path = p_name and d.status <> 'removed'
       and a.candidate_id = (select auth.uid()));
$$;

-- Delete: the candidate, a file their draft no longer uses (replaced, removed, never confirmed).
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
     where d.object_path = p_name and d.status in ('removed', 'pending')
       and a.candidate_id = (select auth.uid()) and a.status = 'draft');
$$;

revoke all on function private.can_upload_application_document(text) from public, anon, authenticated, service_role;
revoke all on function private.can_read_application_document(text) from public, anon, authenticated, service_role;
revoke all on function private.can_delete_application_document(text) from public, anon, authenticated, service_role;
grant execute on function private.can_upload_application_document(text) to authenticated;
grant execute on function private.can_read_application_document(text) to authenticated;
grant execute on function private.can_delete_application_document(text) to authenticated;

create policy recruitment_documents_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recruitment-documents' and (select private.can_upload_application_document(name)));
create policy recruitment_documents_select
  on storage.objects for select to authenticated
  using (bucket_id = 'recruitment-documents' and (select private.can_read_application_document(name)));
create policy recruitment_documents_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'recruitment-documents' and (select private.can_delete_application_document(name)));
create policy recruitment_documents_require_mfa_when_enrolled
  on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'recruitment-documents' or (select private.mfa_requirement_met()))
  with check (bucket_id <> 'recruitment-documents' or (select private.mfa_requirement_met()));

-- ---- Row level security ----------------------------------------------------------------------

alter table public.recruitment_campaigns enable row level security;
alter table public.recruitment_campaign_slug_history enable row level security;
alter table public.recruitment_positions enable row level security;
alter table public.recruitment_form_versions enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.application_documents enable row level security;
alter table public.recruitment_settings enable row level security;

revoke all on public.recruitment_campaigns, public.recruitment_campaign_slug_history, public.recruitment_positions,
  public.recruitment_form_versions, public.applications, public.application_events, public.application_documents,
  public.recruitment_settings
  from anon, authenticated;

-- The team reads its campaigns, positions and forms (drafts included). Visitors read
-- through public_recruitment* only. Nobody but the candidate reads an application.
create policy recruitment_campaigns_read_team
  on public.recruitment_campaigns for select to authenticated
  using (organization_id in (select private.my_recruitment_organization_ids()));
create policy recruitment_positions_read_team
  on public.recruitment_positions for select to authenticated
  using (campaign_id in (select c.id from public.recruitment_campaigns c
                          where c.organization_id in (select private.my_recruitment_organization_ids())));
create policy recruitment_form_versions_read_team
  on public.recruitment_form_versions for select to authenticated
  using (campaign_id in (select c.id from public.recruitment_campaigns c
                          where c.organization_id in (select private.my_recruitment_organization_ids())));

create policy applications_read_own
  on public.applications for select to authenticated
  using (candidate_id = (select auth.uid()));
create policy application_events_read_own
  on public.application_events for select to authenticated
  using (application_id in (select private.my_application_ids()));
create policy application_documents_read_own
  on public.application_documents for select to authenticated
  using (application_id in (select private.my_application_ids()));

create policy recruitment_settings_read
  on public.recruitment_settings for select to anon, authenticated
  using (true);

create policy recruitment_campaigns_require_mfa_when_enrolled on public.recruitment_campaigns
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy recruitment_positions_require_mfa_when_enrolled on public.recruitment_positions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy recruitment_form_versions_require_mfa_when_enrolled on public.recruitment_form_versions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy applications_require_mfa_when_enrolled on public.applications
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy application_events_require_mfa_when_enrolled on public.application_events
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy application_documents_require_mfa_when_enrolled on public.application_documents
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.recruitment_settings to anon, authenticated;
grant select on public.recruitment_campaigns, public.recruitment_positions, public.recruitment_form_versions,
  public.applications, public.application_events, public.application_documents to authenticated;
-- recruitment_campaign_slug_history: functions only. No table accepts writes from the API roles.
