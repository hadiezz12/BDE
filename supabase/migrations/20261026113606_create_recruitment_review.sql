-- Phase 9 · Recruitment review and selection: the tables.
--
-- On top of Phase 8 (campaigns, positions, frozen forms, applications, private
-- documents), the association reads, evaluates, interviews, decides and
-- announces. Access to an application comes from two routes only (Phase 4
-- organization keys, or a campaign committee appointment), answered by one
-- function (private.application_can, next migration).
--
-- No API role has any privilege on the tables created here: row level
-- security is on with no policy, and every read and write goes through the
-- scoped functions, which check the actor and log what matters. The
-- candidate's own rows (applications, application_events, application_documents)
-- keep their Phase 8 policies; the pipeline lives in its own table so the
-- candidate's row never shows it.

-- ---- Composite keys: every Phase 9 row stays inside its campaign ------------------------------

alter table public.recruitment_positions
  add constraint recruitment_positions_id_campaign_key unique (id, campaign_id);
alter table public.applications
  add constraint applications_id_campaign_key unique (id, campaign_id);

-- ---- Campaign review settings -------------------------------------------------------------------

alter table public.recruitment_campaigns
  -- How many submitted reviews an application needs before a decision (0: none).
  -- An approver may go below it with a written reason (audited).
  add column required_reviews smallint not null default 1
    constraint recruitment_campaigns_required_reviews_check check (required_reviews between 0 and 5),
  -- Who finalizes a decision: one approver, two different approvers, or an
  -- approver plus the organization's president (two different people).
  add column approval_policy text not null default 'single'
    constraint recruitment_campaigns_approval_policy_check check (approval_policy in ('single', 'two', 'president'));

-- Applications that ended with an accepted offer can be kept on a different period.
alter table public.recruitment_settings
  add column selected_retention_months smallint
    constraint recruitment_settings_selected_retention_check check (selected_retention_months between 1 and 60);

-- ---- The committee ------------------------------------------------------------------------------

-- One appointment per person and campaign. The person must be an active member
-- of the organization; the appointment grants only its powers, only within its
-- scope, only until it ends or is revoked (checked at every request).
create table public.recruitment_committee_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_committee_members_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  organization_id uuid not null
    constraint recruitment_committee_members_organization_id_fkey references public.organizations (id) on delete cascade,
  membership_id uuid not null
    constraint recruitment_committee_members_membership_id_fkey references public.memberships (id) on delete cascade,
  user_id uuid not null
    constraint recruitment_committee_members_user_id_fkey references auth.users (id) on delete cascade,
  -- The preset it was made from (shown); the powers are what counts.
  role text not null
    constraint recruitment_committee_members_role_check check (role in ('manager', 'reviewer', 'interviewer', 'reader')),
  powers text[] not null
    constraint recruitment_committee_members_powers_check
    check (cardinality(powers) between 1 and 11
           and powers <@ array['view', 'documents', 'review', 'view_team', 'committee', 'shortlist', 'interviews',
                               'propose', 'approve', 'release', 'export']::text[]
           and 'view' = any (powers)),
  scope text not null
    constraint recruitment_committee_members_scope_check check (scope in ('campaign', 'positions', 'assigned')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Why someone is given access to a sealed (archived or old) campaign.
  purpose text
    constraint recruitment_committee_members_purpose_check check (char_length(purpose) between 3 and 500),
  appointed_by uuid
    constraint recruitment_committee_members_appointed_by_fkey references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid
    constraint recruitment_committee_members_revoked_by_fkey references auth.users (id) on delete set null,
  revoke_reason text
    constraint recruitment_committee_members_revoke_reason_check check (char_length(revoke_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recruitment_committee_members_id_campaign_key unique (id, campaign_id),
  constraint recruitment_committee_members_period_check check (ends_at > starts_at and ends_at <= starts_at + interval '18 months')
);
create unique index recruitment_committee_members_one_live on public.recruitment_committee_members (campaign_id, user_id)
  where revoked_at is null;
create index recruitment_committee_members_user_idx on public.recruitment_committee_members (user_id) where revoked_at is null;
create index recruitment_committee_members_membership_idx on public.recruitment_committee_members (membership_id);
create index recruitment_committee_members_organization_idx on public.recruitment_committee_members (organization_id);
create index recruitment_committee_members_appointed_by_idx on public.recruitment_committee_members (appointed_by);
create index recruitment_committee_members_revoked_by_idx on public.recruitment_committee_members (revoked_by);

create trigger recruitment_committee_members_set_updated_at
  before update on public.recruitment_committee_members
  for each row execute function private.set_updated_at();

-- Scope "positions": the positions this appointment covers.
create table public.recruitment_committee_positions (
  member_id uuid not null,
  campaign_id uuid not null,
  position_id uuid not null,
  primary key (member_id, position_id),
  constraint recruitment_committee_positions_member_fkey
    foreign key (member_id, campaign_id) references public.recruitment_committee_members (id, campaign_id) on delete cascade,
  constraint recruitment_committee_positions_position_fkey
    foreign key (position_id, campaign_id) references public.recruitment_positions (id, campaign_id) on delete cascade
);
create index recruitment_committee_positions_position_idx on public.recruitment_committee_positions (position_id, campaign_id);
create index recruitment_committee_positions_member_campaign_idx on public.recruitment_committee_positions (member_id, campaign_id);

-- Work lists: who should review which application ("assigned to me"). For an
-- appointment of scope "assigned", it is also what that person may open.
create table public.recruitment_review_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  member_id uuid not null,
  assigned_by uuid
    constraint recruitment_review_assignments_assigned_by_fkey references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
    constraint recruitment_review_assignments_removed_by_fkey references auth.users (id) on delete set null,
  constraint recruitment_review_assignments_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_review_assignments_member_fkey
    foreign key (member_id, campaign_id) references public.recruitment_committee_members (id, campaign_id) on delete cascade
);
create unique index recruitment_review_assignments_one_live on public.recruitment_review_assignments (application_id, member_id)
  where removed_at is null;
create index recruitment_review_assignments_member_idx on public.recruitment_review_assignments (member_id, campaign_id) where removed_at is null;
create index recruitment_review_assignments_application_campaign_idx on public.recruitment_review_assignments (application_id, campaign_id);
create index recruitment_review_assignments_member_campaign_idx on public.recruitment_review_assignments (member_id, campaign_id);
create index recruitment_review_assignments_assigned_by_idx on public.recruitment_review_assignments (assigned_by);
create index recruitment_review_assignments_removed_by_idx on public.recruitment_review_assignments (removed_by);

-- ---- The internal pipeline ----------------------------------------------------------------------

-- Where a submitted application stands inside the team (never shown to the
-- candidate as such). Decisions live in their own table.
create table public.application_pipeline (
  application_id uuid primary key,
  campaign_id uuid not null,
  position_id uuid not null,
  stage text not null default 'new'
    constraint application_pipeline_stage_check check (stage in ('new', 'under_review', 'shortlisted', 'interview')),
  stage_changed_at timestamptz not null default now(),
  stage_changed_by uuid
    constraint application_pipeline_stage_changed_by_fkey references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_pipeline_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint application_pipeline_position_fkey
    foreign key (position_id, campaign_id) references public.recruitment_positions (id, campaign_id) on delete restrict
);
create index application_pipeline_campaign_idx on public.application_pipeline (campaign_id, stage);
create index application_pipeline_application_campaign_idx on public.application_pipeline (application_id, campaign_id);
create index application_pipeline_position_idx on public.application_pipeline (position_id, campaign_id);
create index application_pipeline_stage_changed_by_idx on public.application_pipeline (stage_changed_by);

create trigger application_pipeline_set_updated_at
  before update on public.application_pipeline
  for each row execute function private.set_updated_at();

-- Every application enters the pipeline when it is submitted.
create or replace function private.enter_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status = 'draft') then
    insert into public.application_pipeline (application_id, campaign_id, position_id)
    values (new.id, new.campaign_id, new.position_id)
    on conflict (application_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.enter_pipeline() from public, anon, authenticated, service_role;

create trigger applications_enter_pipeline
  after insert or update of status on public.applications
  for each row execute function private.enter_pipeline();

insert into public.application_pipeline (application_id, campaign_id, position_id, stage_changed_at, created_at)
select a.id, a.campaign_id, a.position_id, a.submitted_at, a.submitted_at
  from public.applications a
 where a.status <> 'draft'
on conflict (application_id) do nothing;

-- ---- Evaluation rubrics: versioned, frozen once published ---------------------------------------

-- The criteria of a campaign, one JSON array per version (validated by
-- private.validate_rubric): [{id, label, description, max, weight, required}].
-- Scores are integers from 1 to max. A published version never changes: a
-- review keeps the version it was written against.
create table public.recruitment_rubric_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_rubric_versions_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  kind text not null
    constraint recruitment_rubric_versions_kind_check check (kind in ('application', 'interview')),
  number integer not null
    constraint recruitment_rubric_versions_number_check check (number >= 1),
  status text not null default 'draft'
    constraint recruitment_rubric_versions_status_check check (status in ('draft', 'published', 'superseded')),
  criteria jsonb not null default '[]'::jsonb
    constraint recruitment_rubric_versions_criteria_check check (jsonb_typeof(criteria) = 'array' and pg_column_size(criteria) <= 20000),
  edit_version integer not null default 1
    constraint recruitment_rubric_versions_edit_version_check check (edit_version >= 1),
  created_by uuid
    constraint recruitment_rubric_versions_created_by_fkey references auth.users (id) on delete set null,
  updated_by uuid
    constraint recruitment_rubric_versions_updated_by_fkey references auth.users (id) on delete set null,
  published_by uuid
    constraint recruitment_rubric_versions_published_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  superseded_at timestamptz,
  constraint recruitment_rubric_versions_campaign_number_key unique (campaign_id, kind, number),
  constraint recruitment_rubric_versions_id_campaign_key unique (id, campaign_id),
  constraint recruitment_rubric_versions_published_check check (status = 'draft' or published_at is not null)
);
create unique index recruitment_rubric_versions_one_draft on public.recruitment_rubric_versions (campaign_id, kind) where status = 'draft';
create unique index recruitment_rubric_versions_one_live on public.recruitment_rubric_versions (campaign_id, kind) where status = 'published';
create index recruitment_rubric_versions_created_by_idx on public.recruitment_rubric_versions (created_by);
create index recruitment_rubric_versions_updated_by_idx on public.recruitment_rubric_versions (updated_by);
create index recruitment_rubric_versions_published_by_idx on public.recruitment_rubric_versions (published_by);

create trigger recruitment_rubric_versions_set_updated_at
  before update on public.recruitment_rubric_versions
  for each row execute function private.set_updated_at();

create or replace function private.freeze_published_rubric()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() = 1 then
      raise exception 'rubric_locked' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'draft'
     and (new.criteria is distinct from old.criteria or new.campaign_id <> old.campaign_id or new.kind <> old.kind
          or new.number <> old.number
          or not (new.status = old.status or (old.status = 'published' and new.status = 'superseded'))) then
    raise exception 'rubric_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.freeze_published_rubric() from public, anon, authenticated, service_role;

create trigger recruitment_rubric_versions_freeze
  before update or delete on public.recruitment_rubric_versions
  for each row execute function private.freeze_published_rubric();

-- ---- Interviews (declared before the reviews that assess them) ----------------------------------

-- A time a candidate can book. One candidate per slot (the unique index on
-- recruitment_interviews below). The meeting link and the room are given to
-- the candidate only once their interview is scheduled on this slot.
create table public.recruitment_interview_slots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_interview_slots_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  -- Null: open to candidates of every position.
  position_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null
    constraint recruitment_interview_slots_mode_check check (mode in ('in_person', 'online', 'phone')),
  location text
    constraint recruitment_interview_slots_location_check check (char_length(location) between 2 and 200),
  meeting_link text
    constraint recruitment_interview_slots_meeting_link_check
    check (char_length(meeting_link) <= 500 and meeting_link ~* '^https://[^[:space:]/?#@]+\.[^[:space:]/?#@]+([/?#][^[:space:]]*)?$'),
  instructions text
    constraint recruitment_interview_slots_instructions_check check (char_length(instructions) between 1 and 1000),
  created_by uuid
    constraint recruitment_interview_slots_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint recruitment_interview_slots_cancelled_by_fkey references auth.users (id) on delete set null,
  cancel_reason text
    constraint recruitment_interview_slots_cancel_reason_check check (char_length(cancel_reason) between 1 and 500),
  constraint recruitment_interview_slots_id_campaign_key unique (id, campaign_id),
  constraint recruitment_interview_slots_position_fkey
    foreign key (position_id, campaign_id) references public.recruitment_positions (id, campaign_id) on delete cascade,
  constraint recruitment_interview_slots_period_check check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours'),
  constraint recruitment_interview_slots_mode_details_check
    check ((mode <> 'in_person' or location is not null) and (mode = 'online' or meeting_link is null))
);
create index recruitment_interview_slots_campaign_idx on public.recruitment_interview_slots (campaign_id, starts_at);
create index recruitment_interview_slots_position_idx on public.recruitment_interview_slots (position_id, campaign_id);
create index recruitment_interview_slots_created_by_idx on public.recruitment_interview_slots (created_by);
create index recruitment_interview_slots_cancelled_by_idx on public.recruitment_interview_slots (cancelled_by);

create trigger recruitment_interview_slots_set_updated_at
  before update on public.recruitment_interview_slots
  for each row execute function private.set_updated_at();

-- Who interviews on a slot (committee members of the same campaign).
create table public.recruitment_slot_interviewers (
  slot_id uuid not null,
  member_id uuid not null,
  campaign_id uuid not null,
  primary key (slot_id, member_id),
  constraint recruitment_slot_interviewers_slot_fkey
    foreign key (slot_id, campaign_id) references public.recruitment_interview_slots (id, campaign_id) on delete cascade,
  constraint recruitment_slot_interviewers_member_fkey
    foreign key (member_id, campaign_id) references public.recruitment_committee_members (id, campaign_id) on delete cascade
);
create index recruitment_slot_interviewers_member_idx on public.recruitment_slot_interviewers (member_id, campaign_id);
create index recruitment_slot_interviewers_slot_campaign_idx on public.recruitment_slot_interviewers (slot_id, campaign_id);

-- One interview of one application: invited (the candidate chooses a slot),
-- scheduled, then completed, no show or cancelled. Rescheduling moves the same
-- interview to another slot (the history keeps both times).
create table public.recruitment_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  status text not null default 'invited'
    constraint recruitment_interviews_status_check check (status in ('invited', 'scheduled', 'completed', 'no_show', 'cancelled')),
  slot_id uuid,
  -- Shown to the candidate with the invitation.
  message text
    constraint recruitment_interviews_message_check check (char_length(message) between 1 and 2000),
  -- The candidate should choose a slot before this (shown; slots in the past are never offered).
  respond_by timestamptz,
  invited_by uuid
    constraint recruitment_interviews_invited_by_fkey references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  scheduled_at timestamptz,
  completed_at timestamptz,
  completed_by uuid
    constraint recruitment_interviews_completed_by_fkey references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint recruitment_interviews_cancelled_by_fkey references auth.users (id) on delete set null,
  cancel_reason text
    constraint recruitment_interviews_cancel_reason_check check (char_length(cancel_reason) between 1 and 500),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_interviews_id_campaign_key unique (id, campaign_id),
  constraint recruitment_interviews_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_interviews_slot_fkey
    foreign key (slot_id, campaign_id) references public.recruitment_interview_slots (id, campaign_id) on delete restrict,
  constraint recruitment_interviews_slot_check
    check ((status in ('scheduled', 'completed', 'no_show')) <= (slot_id is not null) and (status <> 'invited' or slot_id is null)),
  constraint recruitment_interviews_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null))
);
-- One live interview per application, one candidate per slot.
create unique index recruitment_interviews_one_live on public.recruitment_interviews (application_id) where status in ('invited', 'scheduled');
create unique index recruitment_interviews_slot_taken on public.recruitment_interviews (slot_id) where status in ('scheduled', 'completed', 'no_show');
create index recruitment_interviews_campaign_idx on public.recruitment_interviews (campaign_id, status);
create index recruitment_interviews_application_campaign_idx on public.recruitment_interviews (application_id, campaign_id);
create index recruitment_interviews_slot_campaign_idx on public.recruitment_interviews (slot_id, campaign_id);
create index recruitment_interviews_invited_by_idx on public.recruitment_interviews (invited_by);
create index recruitment_interviews_completed_by_idx on public.recruitment_interviews (completed_by);
create index recruitment_interviews_cancelled_by_idx on public.recruitment_interviews (cancelled_by);

create trigger recruitment_interviews_set_updated_at
  before update on public.recruitment_interviews
  for each row execute function private.set_updated_at();

-- ---- Reviews and interview assessments -----------------------------------------------------------

-- One review per reviewer and application (kind "application"), or per
-- interviewer and interview (kind "interview"). A draft is the reviewer's
-- alone; submitting freezes it, and every later change is an amendment with a
-- reason, kept in recruitment_review_revisions.
create table public.recruitment_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  reviewer_id uuid not null
    constraint recruitment_reviews_reviewer_id_fkey references auth.users (id) on delete cascade,
  kind text not null
    constraint recruitment_reviews_kind_check check (kind in ('application', 'interview')),
  interview_id uuid,
  rubric_version_id uuid,
  status text not null default 'draft'
    constraint recruitment_reviews_status_check check (status in ('draft', 'submitted')),
  -- {criterion_id: integer score}, checked against the rubric version.
  scores jsonb not null default '{}'::jsonb
    constraint recruitment_reviews_scores_check check (jsonb_typeof(scores) = 'object' and pg_column_size(scores) <= 4000),
  recommendation text
    constraint recruitment_reviews_recommendation_check
    check (recommendation in ('shortlist', 'interview', 'offer', 'waitlist', 'reject', 'undecided')),
  -- The reviewer's private note (internal; never in a candidate message).
  note text
    constraint recruitment_reviews_note_check check (char_length(note) between 1 and 4000),
  version integer not null default 1,
  revision_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  amended_at timestamptz,
  constraint recruitment_reviews_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_reviews_interview_fkey
    foreign key (interview_id, campaign_id) references public.recruitment_interviews (id, campaign_id) on delete cascade,
  constraint recruitment_reviews_rubric_fkey
    foreign key (rubric_version_id, campaign_id) references public.recruitment_rubric_versions (id, campaign_id) on delete restrict,
  constraint recruitment_reviews_kind_interview_check check ((kind = 'interview') = (interview_id is not null)),
  constraint recruitment_reviews_submitted_check check ((status = 'submitted') = (submitted_at is not null))
);
create unique index recruitment_reviews_one_per_reviewer on public.recruitment_reviews (application_id, reviewer_id) where kind = 'application';
create unique index recruitment_reviews_one_per_interviewer on public.recruitment_reviews (interview_id, reviewer_id) where kind = 'interview';
create index recruitment_reviews_application_idx on public.recruitment_reviews (application_id, status);
create index recruitment_reviews_campaign_idx on public.recruitment_reviews (campaign_id, reviewer_id);
create index recruitment_reviews_application_campaign_idx on public.recruitment_reviews (application_id, campaign_id);
create index recruitment_reviews_interview_campaign_idx on public.recruitment_reviews (interview_id, campaign_id);
create index recruitment_reviews_rubric_campaign_idx on public.recruitment_reviews (rubric_version_id, campaign_id);
create index recruitment_reviews_reviewer_idx on public.recruitment_reviews (reviewer_id);

create trigger recruitment_reviews_set_updated_at
  before update on public.recruitment_reviews
  for each row execute function private.set_updated_at();

-- A review never changes hands, and a submitted one changes only as an
-- amendment (the function that amends counts it and keeps the revision).
create or replace function private.lock_submitted_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reviewer_id <> old.reviewer_id or new.application_id <> old.application_id or new.kind <> old.kind
     or new.interview_id is distinct from old.interview_id or new.campaign_id <> old.campaign_id then
    raise exception 'review_locked' using errcode = 'P0001';
  end if;
  if old.status = 'submitted' then
    if new.status <> 'submitted' or new.submitted_at <> old.submitted_at then
      raise exception 'review_locked' using errcode = 'P0001';
    end if;
    if (new.scores is distinct from old.scores or new.recommendation is distinct from old.recommendation
        or new.note is distinct from old.note or new.rubric_version_id is distinct from old.rubric_version_id)
       and new.revision_count <> old.revision_count + 1 then
      raise exception 'review_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.lock_submitted_review() from public, anon, authenticated, service_role;

create trigger recruitment_reviews_lock_submitted
  before update on public.recruitment_reviews
  for each row execute function private.lock_submitted_review();

-- Every submitted state of a review: the original (number 1, no reason) and
-- each amendment (with its reason). Append-only.
create table public.recruitment_review_revisions (
  id bigint generated always as identity primary key,
  review_id uuid not null
    constraint recruitment_review_revisions_review_id_fkey references public.recruitment_reviews (id) on delete cascade,
  number integer not null
    constraint recruitment_review_revisions_number_check check (number >= 1),
  rubric_version_id uuid,
  scores jsonb not null,
  recommendation text,
  note text,
  reason text
    constraint recruitment_review_revisions_reason_check check (char_length(reason) between 3 and 500),
  submitted_at timestamptz not null default now(),
  constraint recruitment_review_revisions_review_number_key unique (review_id, number),
  constraint recruitment_review_revisions_reason_needed_check check ((number = 1) = (reason is null))
);

-- Append-only records: nothing rewrites them; they leave only with their
-- application (a cascade, never a direct delete).
create or replace function private.forbid_record_rewrite()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() = 1 then
    raise exception 'records_are_append_only' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function private.forbid_record_rewrite() from public, anon, authenticated, service_role;

create trigger recruitment_review_revisions_append_only
  before update or delete on public.recruitment_review_revisions
  for each row execute function private.forbid_record_rewrite();

-- ---- Conflicts of interest ---------------------------------------------------------------------

-- Declared by the person concerned. Open or "reassigned": that person can no
-- longer open, evaluate or decide on the application; "cleared" (a manager's
-- written resolution) gives the access back. The note is seen only by the
-- declarant and the people who manage the committee.
create table public.recruitment_conflicts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  user_id uuid not null
    constraint recruitment_conflicts_user_id_fkey references auth.users (id) on delete cascade,
  note text
    constraint recruitment_conflicts_note_check check (char_length(note) between 1 and 500),
  status text not null default 'open'
    constraint recruitment_conflicts_status_check check (status in ('open', 'reassigned', 'cleared')),
  declared_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
    constraint recruitment_conflicts_resolved_by_fkey references auth.users (id) on delete set null,
  resolution text
    constraint recruitment_conflicts_resolution_check check (char_length(resolution) between 3 and 500),
  constraint recruitment_conflicts_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_conflicts_resolved_check check ((status = 'open') = (resolved_at is null))
);
create unique index recruitment_conflicts_one_blocking on public.recruitment_conflicts (application_id, user_id)
  where status in ('open', 'reassigned');
create index recruitment_conflicts_campaign_idx on public.recruitment_conflicts (campaign_id, status);
create index recruitment_conflicts_application_campaign_idx on public.recruitment_conflicts (application_id, campaign_id);
create index recruitment_conflicts_user_idx on public.recruitment_conflicts (user_id);
create index recruitment_conflicts_resolved_by_idx on public.recruitment_conflicts (resolved_by);

-- ---- Tags and the internal discussion -----------------------------------------------------------

create table public.recruitment_tags (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    constraint recruitment_tags_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  label text not null
    constraint recruitment_tags_label_check check (char_length(label) between 2 and 40 and label !~ '[[:cntrl:]]'),
  created_by uuid
    constraint recruitment_tags_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recruitment_tags_id_campaign_key unique (id, campaign_id)
);
create unique index recruitment_tags_label_key on public.recruitment_tags (campaign_id, lower(label));
create index recruitment_tags_created_by_idx on public.recruitment_tags (created_by);

create table public.application_tags (
  application_id uuid not null,
  tag_id uuid not null,
  campaign_id uuid not null,
  added_by uuid
    constraint application_tags_added_by_fkey references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (application_id, tag_id),
  constraint application_tags_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint application_tags_tag_fkey
    foreign key (tag_id, campaign_id) references public.recruitment_tags (id, campaign_id) on delete cascade
);
create index application_tags_tag_idx on public.application_tags (tag_id, campaign_id);
create index application_tags_application_campaign_idx on public.application_tags (application_id, campaign_id);
create index application_tags_added_by_idx on public.application_tags (added_by);

-- A short message between committee members about one application. Never
-- edited; its author can retract it (kept for the record, no longer shown).
create table public.application_comments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  author_id uuid not null
    constraint application_comments_author_id_fkey references auth.users (id) on delete cascade,
  body text not null
    constraint application_comments_body_check check (char_length(btrim(body)) between 1 and 2000),
  mentions uuid[] not null default '{}'::uuid[]
    constraint application_comments_mentions_check check (cardinality(mentions) <= 10),
  created_at timestamptz not null default now(),
  retracted_at timestamptz,
  constraint application_comments_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade
);
create index application_comments_application_idx on public.application_comments (application_id, created_at);
create index application_comments_application_campaign_idx on public.application_comments (application_id, campaign_id);
create index application_comments_author_idx on public.application_comments (author_id);

create or replace function private.lock_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body <> old.body or new.author_id <> old.author_id or new.application_id <> old.application_id
     or new.mentions <> old.mentions or new.created_at <> old.created_at
     or (old.retracted_at is not null and new.retracted_at is distinct from old.retracted_at) then
    raise exception 'comment_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_comment() from public, anon, authenticated, service_role;

create trigger application_comments_lock
  before update on public.application_comments
  for each row execute function private.lock_comment();

-- ---- Clarifications (questions to the candidate) -----------------------------------------------

-- One question to the candidate of one application, answered once. The
-- deadline is enforced by the database; extending it keeps the history.
create table public.recruitment_clarifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  question text not null
    constraint recruitment_clarifications_question_check check (char_length(btrim(question)) between 3 and 2000),
  allows_documents boolean not null default false,
  asked_by uuid
    constraint recruitment_clarifications_asked_by_fkey references auth.users (id) on delete set null,
  asked_at timestamptz not null default now(),
  due_at timestamptz,
  original_due_at timestamptz,
  -- [{from, to, at, by_name, reason}]: every extension, oldest first.
  extensions jsonb not null default '[]'::jsonb
    constraint recruitment_clarifications_extensions_check check (jsonb_typeof(extensions) = 'array' and pg_column_size(extensions) <= 8000),
  status text not null default 'open'
    constraint recruitment_clarifications_status_check check (status in ('open', 'answered', 'cancelled')),
  answer text
    constraint recruitment_clarifications_answer_check check (char_length(btrim(answer)) between 1 and 4000),
  answered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint recruitment_clarifications_cancelled_by_fkey references auth.users (id) on delete set null,
  cancel_reason text
    constraint recruitment_clarifications_cancel_reason_check check (char_length(cancel_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_clarifications_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_clarifications_answered_check
    check ((status = 'answered') = (answered_at is not null) and (status = 'answered') = (answer is not null)),
  constraint recruitment_clarifications_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null))
);
create index recruitment_clarifications_application_idx on public.recruitment_clarifications (application_id, asked_at);
create index recruitment_clarifications_application_campaign_idx on public.recruitment_clarifications (application_id, campaign_id);
create index recruitment_clarifications_open_idx on public.recruitment_clarifications (due_at) where status = 'open';
create index recruitment_clarifications_asked_by_idx on public.recruitment_clarifications (asked_by);
create index recruitment_clarifications_cancelled_by_idx on public.recruitment_clarifications (cancelled_by);

create trigger recruitment_clarifications_set_updated_at
  before update on public.recruitment_clarifications
  for each row execute function private.set_updated_at();

-- The question never changes; the answer, once given, never changes.
create or replace function private.lock_clarification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.question <> old.question or new.application_id <> old.application_id or new.asked_at <> old.asked_at
     or new.allows_documents <> old.allows_documents then
    raise exception 'clarification_locked' using errcode = 'P0001';
  end if;
  if old.status <> 'open' and (new.status <> old.status or new.answer is distinct from old.answer
                               or new.answered_at is distinct from old.answered_at or new.due_at is distinct from old.due_at) then
    raise exception 'clarification_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_clarification() from public, anon, authenticated, service_role;

create trigger recruitment_clarifications_lock
  before update on public.recruitment_clarifications
  for each row execute function private.lock_clarification();

-- Files given with an answer reuse the private documents (their own lifecycle:
-- they leave with the application, like the CV).
alter table public.application_documents
  add column clarification_id uuid
    constraint application_documents_clarification_id_fkey references public.recruitment_clarifications (id) on delete cascade;
create index application_documents_clarification_idx on public.application_documents (clarification_id) where clarification_id is not null;

-- A document of a submitted application is frozen, except the files of a
-- question still open (the candidate is answering it).
create or replace function private.lock_submitted_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and (select a.status from public.applications a where a.id = old.application_id) <> 'draft'
     and not (old.clarification_id is not null
              and exists (select 1 from public.recruitment_clarifications q where q.id = old.clarification_id and q.status = 'open')) then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  if new.clarification_id is distinct from old.clarification_id then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---- Decisions and offers ---------------------------------------------------------------------

-- Proposed by a recruiter, finalized when the approvals the campaign requires
-- are in, released (only then does the candidate learn it). Returned or
-- cancelled proposals stay on record; a released waiting-list decision is
-- superseded when a later decision on the same application is released.
create table public.recruitment_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  campaign_id uuid not null,
  position_id uuid not null,
  outcome text not null
    constraint recruitment_decisions_outcome_check check (outcome in ('offer', 'reject', 'waitlist')),
  status text not null default 'proposed'
    constraint recruitment_decisions_status_check
    check (status in ('proposed', 'finalized', 'released', 'returned', 'cancelled', 'superseded')),
  -- Internal: why (never sent).
  rationale text
    constraint recruitment_decisions_rationale_check check (char_length(rationale) between 1 and 1000),
  -- To the candidate, with the outcome (from the campaign's template if empty).
  message text
    constraint recruitment_decisions_message_check check (char_length(message) between 1 and 2000),
  -- Manual order of the waiting list (1 first).
  waitlist_rank smallint
    constraint recruitment_decisions_waitlist_rank_check check (waitlist_rank between 1 and 999),
  proposed_by uuid
    constraint recruitment_decisions_proposed_by_fkey references auth.users (id) on delete set null,
  proposed_at timestamptz not null default now(),
  finalized_at timestamptz,
  reviews_override_reason text
    constraint recruitment_decisions_reviews_override_check check (char_length(reviews_override_reason) between 3 and 500),
  capacity_override_reason text
    constraint recruitment_decisions_capacity_override_check check (char_length(capacity_override_reason) between 3 and 500),
  returned_at timestamptz,
  returned_by uuid
    constraint recruitment_decisions_returned_by_fkey references auth.users (id) on delete set null,
  return_reason text
    constraint recruitment_decisions_return_reason_check check (char_length(return_reason) between 3 and 500),
  release_scheduled_at timestamptz,
  release_scheduled_by uuid
    constraint recruitment_decisions_release_scheduled_by_fkey references auth.users (id) on delete set null,
  offer_expires_at timestamptz,
  released_at timestamptz,
  released_by uuid
    constraint recruitment_decisions_released_by_fkey references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint recruitment_decisions_cancelled_by_fkey references auth.users (id) on delete set null,
  cancel_reason text
    constraint recruitment_decisions_cancel_reason_check check (char_length(cancel_reason) between 3 and 500),
  superseded_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_decisions_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_decisions_position_fkey
    foreign key (position_id, campaign_id) references public.recruitment_positions (id, campaign_id) on delete restrict,
  constraint recruitment_decisions_finalized_check
    check ((status in ('finalized', 'released', 'superseded')) <= (finalized_at is not null)),
  constraint recruitment_decisions_released_check check ((status in ('released', 'superseded')) = (released_at is not null)),
  constraint recruitment_decisions_schedule_check check (release_scheduled_at is null or status = 'finalized')
);
-- At most one pending decision per application, and nothing after a released
-- offer or refusal (the two final outcomes).
create unique index recruitment_decisions_one_pending on public.recruitment_decisions (application_id) where status in ('proposed', 'finalized');
create unique index recruitment_decisions_one_final on public.recruitment_decisions (application_id)
  where status = 'released' and outcome in ('offer', 'reject');
create index recruitment_decisions_campaign_idx on public.recruitment_decisions (campaign_id, status);
create index recruitment_decisions_position_idx on public.recruitment_decisions (position_id, campaign_id);
create index recruitment_decisions_application_campaign_idx on public.recruitment_decisions (application_id, campaign_id);
create index recruitment_decisions_release_due_idx on public.recruitment_decisions (release_scheduled_at) where release_scheduled_at is not null;
create index recruitment_decisions_proposed_by_idx on public.recruitment_decisions (proposed_by);
create index recruitment_decisions_returned_by_idx on public.recruitment_decisions (returned_by);
create index recruitment_decisions_release_scheduled_by_idx on public.recruitment_decisions (release_scheduled_by);
create index recruitment_decisions_released_by_idx on public.recruitment_decisions (released_by);
create index recruitment_decisions_cancelled_by_idx on public.recruitment_decisions (cancelled_by);

create trigger recruitment_decisions_set_updated_at
  before update on public.recruitment_decisions
  for each row execute function private.set_updated_at();

-- A decision's outcome and history never change; its status moves forward only.
create or replace function private.lock_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.outcome <> old.outcome or new.application_id <> old.application_id or new.proposed_at <> old.proposed_at
     or (old.finalized_at is not null and new.finalized_at is distinct from old.finalized_at)
     or (old.released_at is not null and new.released_at is distinct from old.released_at) then
    raise exception 'decision_locked' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'proposed' and new.status in ('finalized', 'returned', 'cancelled'))
    or (old.status = 'finalized' and new.status in ('released', 'cancelled'))
    or (old.status = 'released' and new.status = 'superseded' and old.outcome = 'waitlist')) then
    raise exception 'decision_locked' using errcode = 'P0001';
  end if;
  if old.status in ('released', 'returned', 'cancelled', 'superseded')
     and (new.rationale is distinct from old.rationale or new.message is distinct from old.message) then
    raise exception 'decision_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_decision() from public, anon, authenticated, service_role;

create trigger recruitment_decisions_lock
  before update on public.recruitment_decisions
  for each row execute function private.lock_decision();

create table public.recruitment_decision_approvals (
  decision_id uuid not null
    constraint recruitment_decision_approvals_decision_id_fkey references public.recruitment_decisions (id) on delete cascade,
  approver_id uuid not null
    constraint recruitment_decision_approvals_approver_id_fkey references auth.users (id) on delete cascade,
  -- The approver held the organization's presidency when approving.
  as_president boolean not null default false,
  approved_at timestamptz not null default now(),
  primary key (decision_id, approver_id)
);
create index recruitment_decision_approvals_approver_idx on public.recruitment_decision_approvals (approver_id);

-- What the candidate is offered once an "offer" decision is released, and
-- their answer. Accepting gives no membership and no permission (onboarding is
-- a separate Phase 4 invitation an officer chooses to send).
create table public.recruitment_offers (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null
    constraint recruitment_offers_decision_id_fkey references public.recruitment_decisions (id) on delete cascade,
  application_id uuid not null,
  campaign_id uuid not null,
  candidate_id uuid not null
    constraint recruitment_offers_candidate_id_fkey references auth.users (id) on delete cascade,
  status text not null default 'pending'
    constraint recruitment_offers_status_check check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at timestamptz,
  responded_at timestamptz,
  response_note text
    constraint recruitment_offers_response_note_check check (char_length(response_note) between 1 and 500),
  withdrawn_at timestamptz,
  withdrawn_by uuid
    constraint recruitment_offers_withdrawn_by_fkey references auth.users (id) on delete set null,
  withdraw_reason text
    constraint recruitment_offers_withdraw_reason_check check (char_length(withdraw_reason) between 3 and 500),
  onboarding_invitation_id uuid
    constraint recruitment_offers_onboarding_invitation_id_fkey references public.organization_invitations (id) on delete set null,
  onboarding_at timestamptz,
  onboarding_by uuid
    constraint recruitment_offers_onboarding_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_offers_decision_key unique (decision_id),
  constraint recruitment_offers_application_fkey
    foreign key (application_id, campaign_id) references public.applications (id, campaign_id) on delete cascade,
  constraint recruitment_offers_responded_check check ((status in ('accepted', 'declined')) = (responded_at is not null))
);
create index recruitment_offers_application_idx on public.recruitment_offers (application_id, campaign_id);
create index recruitment_offers_candidate_idx on public.recruitment_offers (candidate_id);
create index recruitment_offers_pending_idx on public.recruitment_offers (expires_at) where status = 'pending';
create index recruitment_offers_withdrawn_by_idx on public.recruitment_offers (withdrawn_by);
create index recruitment_offers_onboarding_invitation_idx on public.recruitment_offers (onboarding_invitation_id);
create index recruitment_offers_onboarding_by_idx on public.recruitment_offers (onboarding_by);

create trigger recruitment_offers_set_updated_at
  before update on public.recruitment_offers
  for each row execute function private.set_updated_at();

-- An answer is given once.
create or replace function private.lock_offer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.decision_id <> old.decision_id or new.candidate_id <> old.candidate_id or new.application_id <> old.application_id then
    raise exception 'offer_locked' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (old.status = 'pending' and new.status in ('accepted', 'declined', 'expired', 'withdrawn')) then
    raise exception 'offer_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.lock_offer() from public, anon, authenticated, service_role;

create trigger recruitment_offers_lock
  before update on public.recruitment_offers
  for each row execute function private.lock_offer();

-- The personal words a campaign puts in its candidate messages (an allowlist
-- of placeholders, replaced as text: never code).
create table public.recruitment_message_templates (
  campaign_id uuid not null
    constraint recruitment_message_templates_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  kind text not null
    constraint recruitment_message_templates_kind_check
    check (kind in ('interview_invitation', 'clarification', 'offer', 'rejection', 'waitlist')),
  body text not null
    constraint recruitment_message_templates_body_check check (char_length(btrim(body)) between 1 and 2000),
  updated_by uuid
    constraint recruitment_message_templates_updated_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, kind)
);
create index recruitment_message_templates_updated_by_idx on public.recruitment_message_templates (updated_by);

-- ---- Records: the team's history of an application, and who opened what ----------------------

create table public.application_activity (
  id bigint generated always as identity primary key,
  application_id uuid not null
    constraint application_activity_application_id_fkey references public.applications (id) on delete cascade,
  campaign_id uuid not null,
  actor_id uuid
    constraint application_activity_actor_id_fkey references auth.users (id) on delete set null,
  action text not null
    constraint application_activity_action_check check (action ~ '^[a-z_]{3,60}$'),
  details jsonb not null default '{}'::jsonb
    constraint application_activity_details_check check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 3000),
  occurred_at timestamptz not null default now()
);
create index application_activity_application_idx on public.application_activity (application_id, occurred_at);
create index application_activity_actor_idx on public.application_activity (actor_id);

create trigger application_activity_append_only
  before update or delete on public.application_activity
  for each row execute function private.forbid_record_rewrite();

-- Who opened an application or one of its files, and when. Written by the
-- functions that serve them (the file route cannot be bypassed: no reviewer
-- reads the bucket directly). Never the content.
create table public.application_access_log (
  id bigint generated always as identity primary key,
  application_id uuid not null
    constraint application_access_log_application_id_fkey references public.applications (id) on delete cascade,
  campaign_id uuid not null,
  actor_id uuid not null
    constraint application_access_log_actor_id_fkey references auth.users (id) on delete cascade,
  action text not null
    constraint application_access_log_action_check check (action in ('application_opened', 'document_opened')),
  document_id uuid,
  occurred_at timestamptz not null default now()
);
create index application_access_log_application_idx on public.application_access_log (application_id, occurred_at desc);
create index application_access_log_actor_idx on public.application_access_log (actor_id, occurred_at desc);
create index application_access_log_campaign_idx on public.application_access_log (campaign_id, occurred_at desc);

create trigger application_access_log_append_only
  before update or delete on public.application_access_log
  for each row execute function private.forbid_record_rewrite();

-- ---- The candidate's own history learns the steps that concern them --------------------------

alter table public.application_events drop constraint application_events_action_check;
alter table public.application_events add constraint application_events_action_check check (action in (
  'started', 'submitted', 'withdrawn', 'document_added', 'document_replaced', 'document_removed', 'form_updated',
  'review_started', 'interview_invited', 'interview_scheduled', 'interview_rescheduled', 'interview_cancelled',
  'interview_completed', 'clarification_requested', 'clarification_extended', 'clarification_answered',
  'clarification_cancelled', 'decision_released', 'offer_accepted', 'offer_declined', 'offer_expired', 'offer_withdrawn'));

-- ---- Messages ------------------------------------------------------------------------------------

alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'event_registration_confirmed', 'event_waitlisted', 'event_promoted', 'event_registration_cancelled',
  'event_registration_removed', 'event_changed', 'event_cancelled', 'event_reminder',
  'application_submitted', 'application_withdrawn', 'application_deadline_reminder', 'application_form_updated',
  'recruitment_cancelled',
  -- Phase 9, to the candidate:
  'recruitment_interview_invited', 'recruitment_interview_scheduled', 'recruitment_interview_rescheduled',
  'recruitment_interview_cancelled', 'recruitment_clarification_requested', 'recruitment_clarification_extended',
  'recruitment_clarification_reminder', 'recruitment_offer', 'recruitment_offer_reminder', 'recruitment_offer_expired',
  'recruitment_offer_withdrawn', 'recruitment_rejected', 'recruitment_waitlisted',
  -- Phase 9, to the team:
  'recruitment_review_assigned', 'recruitment_mention', 'recruitment_clarification_answered', 'recruitment_interview_booked',
  'recruitment_decision_to_approve', 'recruitment_offer_accepted', 'recruitment_offer_declined', 'recruitment_candidate_withdrew'));

-- ---- Permissions ---------------------------------------------------------------------------------

update public.permissions set sort_order = 99 where key = 'analytics.view';
update public.permissions set sort_order = 78 where key = 'recruitment.campaigns.manage';
update public.permissions set sort_order = 80 where key = 'recruitment.questions.manage';

update public.permissions
   set label = 'Lire les candidatures', sort_order = 83, module_ready = true,
       description = 'Lire les candidatures envoyées aux recrutements de l''asso (réponses, telles qu''envoyées). Jamais celles d''une autre asso.'
 where key = 'recruitment.applications.view';
update public.permissions
   set label = 'Évaluer les candidatures', sort_order = 85, module_ready = true,
       description = 'Écrire sa propre évaluation (notes, avis, note privée), la soumettre, la corriger avec une raison.'
 where key = 'recruitment.applications.review';
update public.permissions
   set label = 'Exporter les candidatures', sort_order = 92, module_ready = true,
       description = 'Télécharger la liste des candidatures d''un recrutement (champs essentiels, jamais les CV). Chaque export est tracé.'
 where key = 'recruitment.applications.export';

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('recruitment.committee.manage', 'organization', 'recruitment', 'Composer le comité de recrutement',
   'Nommer et retirer les membres du comité d''un recrutement, répartir les candidatures, régler la grille et les règles de décision.',
   true, false, true, true, 82),
  ('recruitment.documents.view', 'organization', 'recruitment', 'Ouvrir les CV et documents',
   'Télécharger les CV et documents des candidatures qu''on peut lire. Chaque ouverture est tracée.',
   true, false, true, true, 84),
  ('recruitment.reviews.view_team', 'organization', 'recruitment', 'Voir les évaluations de l''équipe',
   'Lire les évaluations soumises par les autres et la discussion interne d''une candidature.',
   true, false, true, true, 86),
  ('recruitment.applications.shortlist', 'organization', 'recruitment', 'Faire avancer les candidatures',
   'Passer une candidature en examen, la présélectionner, poser une question complémentaire au candidat.',
   true, false, true, true, 87),
  ('recruitment.interviews.manage', 'organization', 'recruitment', 'Organiser les entretiens',
   'Créer les créneaux, inviter, déplacer ou annuler un entretien, noter qu''il a eu lieu.',
   true, false, true, true, 88),
  ('recruitment.decisions.propose', 'organization', 'recruitment', 'Proposer des décisions',
   'Proposer de retenir, refuser ou mettre en liste d''attente une candidature. Une proposition n''est pas une décision.',
   true, false, true, true, 89),
  ('recruitment.decisions.approve', 'organization', 'recruitment', 'Valider les décisions',
   'Valider (ou renvoyer) une décision proposée, selon les règles du recrutement.',
   true, false, true, true, 90),
  ('recruitment.decisions.release', 'organization', 'recruitment', 'Annoncer les décisions',
   'Envoyer aux candidats les décisions validées, maintenant ou à une date choisie.',
   true, false, true, true, 91),
  ('platform.privacy.requests', 'platform', 'platform', 'Traiter les demandes RGPD',
   'Répondre aux demandes d''accès ou d''effacement des candidats (sur demande écrite, avec une raison, tracé).',
   false, false, true, true, 108);

-- Offices carry every organization key.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
 cross join (values ('recruitment.committee.manage'), ('recruitment.documents.view'), ('recruitment.reviews.view_team'),
                    ('recruitment.applications.shortlist'), ('recruitment.interviews.manage'), ('recruitment.decisions.propose'),
                    ('recruitment.decisions.approve'), ('recruitment.decisions.release')) as k (key)
 where t.office is not null
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
 cross join (values ('recruitment.committee.manage'), ('recruitment.documents.view'), ('recruitment.reviews.view_team'),
                    ('recruitment.applications.shortlist'), ('recruitment.interviews.manage'), ('recruitment.decisions.propose'),
                    ('recruitment.decisions.approve'), ('recruitment.decisions.release')) as k (key)
 where p.office is not null
on conflict do nothing;

-- The other templates (decision D59): the vice-presidency co-leads recruitment
-- without exporting; the recruitment manager runs it; a reviewer reads and
-- evaluates. Positions already made from these templates get the same keys.
with k (template_key, permission_key) as (
  values
    ('vice_president', 'recruitment.applications.view'), ('vice_president', 'recruitment.documents.view'),
    ('vice_president', 'recruitment.applications.review'), ('vice_president', 'recruitment.reviews.view_team'),
    ('vice_president', 'recruitment.committee.manage'), ('vice_president', 'recruitment.applications.shortlist'),
    ('vice_president', 'recruitment.interviews.manage'), ('vice_president', 'recruitment.decisions.propose'),
    ('vice_president', 'recruitment.decisions.approve'), ('vice_president', 'recruitment.decisions.release'),
    ('recruitment_manager', 'recruitment.documents.view'), ('recruitment_manager', 'recruitment.reviews.view_team'),
    ('recruitment_manager', 'recruitment.committee.manage'), ('recruitment_manager', 'recruitment.applications.shortlist'),
    ('recruitment_manager', 'recruitment.interviews.manage'), ('recruitment_manager', 'recruitment.decisions.propose'),
    ('recruitment_manager', 'recruitment.decisions.approve'), ('recruitment_manager', 'recruitment.decisions.release'),
    ('recruitment_reviewer', 'recruitment.documents.view'))
insert into public.position_template_permissions (template_key, permission_key)
select template_key, permission_key from k
on conflict do nothing;
with k (template_key, permission_key) as (
  values
    ('vice_president', 'recruitment.applications.view'), ('vice_president', 'recruitment.documents.view'),
    ('vice_president', 'recruitment.applications.review'), ('vice_president', 'recruitment.reviews.view_team'),
    ('vice_president', 'recruitment.committee.manage'), ('vice_president', 'recruitment.applications.shortlist'),
    ('vice_president', 'recruitment.interviews.manage'), ('vice_president', 'recruitment.decisions.propose'),
    ('vice_president', 'recruitment.decisions.approve'), ('vice_president', 'recruitment.decisions.release'),
    ('recruitment_manager', 'recruitment.documents.view'), ('recruitment_manager', 'recruitment.reviews.view_team'),
    ('recruitment_manager', 'recruitment.committee.manage'), ('recruitment_manager', 'recruitment.applications.shortlist'),
    ('recruitment_manager', 'recruitment.interviews.manage'), ('recruitment_manager', 'recruitment.decisions.propose'),
    ('recruitment_manager', 'recruitment.decisions.approve'), ('recruitment_manager', 'recruitment.decisions.release'),
    ('recruitment_reviewer', 'recruitment.documents.view'))
insert into public.position_permissions (position_id, permission_key)
select p.id, k.permission_key
  from public.positions p join k on k.template_key = p.template_key
 where p.office is null and p.archived_at is null
on conflict do nothing;

-- ---- The privacy officer: a platform role the project owner provisions -------------------------

alter table public.platform_assignments drop constraint platform_assignments_role_check;
alter table public.platform_assignments add constraint platform_assignments_role_check check (role in ('guardian', 'privacy_officer'));
alter table public.platform_role_permissions drop constraint platform_role_permissions_role_check;
alter table public.platform_role_permissions add constraint platform_role_permissions_role_check check (role in ('guardian', 'privacy_officer'));
insert into public.platform_role_permissions (role, permission_key) values ('privacy_officer', 'platform.privacy.requests')
on conflict do nothing;

-- Like the guardian, appointed outside the app by the project owner (nobody in
-- the app has authority over who may answer data-rights requests).
create or replace function private.provision_privacy_officer(p_user uuid, p_ends_at timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := private.require_reason(p_reason);
begin
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  update public.platform_assignments
     set status = case when starts_at >= now() then 'cancelled' else 'ended' end,
         ends_at = case when starts_at >= now() then ends_at else now() end,
         end_reason = v_reason
   where role = 'privacy_officer' and status = 'active' and ends_at > now();
  insert into public.platform_assignments (user_id, role, starts_at, ends_at, source, reason)
  values (p_user, 'privacy_officer', now(), p_ends_at, 'provisioning', v_reason);
  perform private.log_governance_event(
    null, 'provisioning', 'privacy_officer_provisioned', 'bootstrap', null, p_user, 'platform_assignment', null,
    jsonb_build_object('ends_at', p_ends_at), v_reason);
end;
$$;
revoke all on function private.provision_privacy_officer(uuid, timestamptz, text) from public, anon, authenticated, service_role;

-- ---- Audit vocabulary and reserved workspace words -----------------------------------------------

-- "committee": the actor acted through a campaign committee appointment (not a position).
alter table public.governance_audit_events drop constraint governance_audit_events_authority_check;
alter table public.governance_audit_events add constraint governance_audit_events_authority_check
  check (authority in ('position', 'delegation', 'bde', 'guardian', 'provisioning', 'self', 'scheduler', 'system', 'committee'));

alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category',
                           'event', 'event_registration', 'event_category',
                           'recruitment_campaign', 'recruitment_position', 'recruitment_form', 'recruitment_settings',
                           'application', 'recruitment_committee_member', 'recruitment_rubric', 'recruitment_interview_slot',
                           'recruitment_decision', 'recruitment_offer'));

-- /manage/evaluations (a reviewer's own work) and /manage/donnees (data-rights requests).
alter table public.organizations drop constraint organizations_slug_reserved_check;
alter table public.organizations add constraint organizations_slug_reserved_check
  check (slug not in ('plateforme', 'continuite', 'evaluations', 'donnees'));

-- ---- Row level security: no API role reads or writes these tables directly ---------------------

alter table public.recruitment_committee_members enable row level security;
alter table public.recruitment_committee_positions enable row level security;
alter table public.recruitment_review_assignments enable row level security;
alter table public.application_pipeline enable row level security;
alter table public.recruitment_rubric_versions enable row level security;
alter table public.recruitment_interview_slots enable row level security;
alter table public.recruitment_slot_interviewers enable row level security;
alter table public.recruitment_interviews enable row level security;
alter table public.recruitment_reviews enable row level security;
alter table public.recruitment_review_revisions enable row level security;
alter table public.recruitment_conflicts enable row level security;
alter table public.recruitment_tags enable row level security;
alter table public.application_tags enable row level security;
alter table public.application_comments enable row level security;
alter table public.recruitment_clarifications enable row level security;
alter table public.recruitment_decisions enable row level security;
alter table public.recruitment_decision_approvals enable row level security;
alter table public.recruitment_offers enable row level security;
alter table public.recruitment_message_templates enable row level security;
alter table public.application_activity enable row level security;
alter table public.application_access_log enable row level security;

revoke all on public.recruitment_committee_members, public.recruitment_committee_positions, public.recruitment_review_assignments,
  public.application_pipeline, public.recruitment_rubric_versions, public.recruitment_interview_slots,
  public.recruitment_slot_interviewers, public.recruitment_interviews, public.recruitment_reviews,
  public.recruitment_review_revisions, public.recruitment_conflicts, public.recruitment_tags, public.application_tags,
  public.application_comments, public.recruitment_clarifications, public.recruitment_decisions,
  public.recruitment_decision_approvals, public.recruitment_offers, public.recruitment_message_templates,
  public.application_activity, public.application_access_log
  from anon, authenticated;
