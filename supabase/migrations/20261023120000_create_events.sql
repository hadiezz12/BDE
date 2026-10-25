-- Phase 7 · Events: the catalog, the events themselves, registrations and the
-- waiting list, the notification outbox, bookmarks; their permissions, row
-- level security and media rules. Functions come in the next migrations.
--
-- Three concerns, never mixed:
--   publication   draft → published ⇄ unpublished          (who can see it)
--   status        scheduled → cancelled                     (will it happen;
--                 "completed" is derived: it has ended)
--   moderation    hidden_at (BDE)                           (public visibility)
-- and, for each student, a registration: confirmed | waitlisted | cancelled.
--
-- Capacity is a counter on the event row (confirmed_count), changed only by
-- the registration functions while they hold the event's row lock, and
-- bounded by a CHECK: no code path can confirm a seat beyond the capacity.

-- ---- Categories (platform catalog, maintained by BDE leadership) ----------------------

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint event_categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  label text not null
    constraint event_categories_label_check check (label ~ '^[^[:cntrl:]]{2,40}$' and btrim(label) = label),
  sort_order smallint not null default 100
    constraint event_categories_sort_order_check check (sort_order between 0 and 999),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
    constraint event_categories_created_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint event_categories_slug_key unique (slug),
  constraint event_categories_label_key unique (label)
);

comment on table public.event_categories is
  'Kinds of event offered to every association (Soirées, Sport…). Written only by public.create_event_category / update_event_category.';

create trigger set_updated_at before update on public.event_categories
  for each row execute function private.set_updated_at();

-- The Phase 1 design's categories: a taxonomy, not content.
insert into public.event_categories (slug, label, sort_order) values
  ('soiree', 'Soirées', 10),
  ('sport', 'Sport', 20),
  ('carriere', 'Carrière', 30),
  ('academique', 'Académique', 40),
  ('culture', 'Culture', 50),
  ('solidarite', 'Solidarité', 60),
  ('week-end', 'Week-ends', 70);

-- ---- Search text (accents folded, French) ------------------------------------------

create or replace function private.event_search_vector(
  p_title text, p_summary text, p_description text, p_venue text, p_city text
)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select setweight(to_tsvector('french'::regconfig, private.fold_accents(p_title)), 'A')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(p_summary)), 'B')
      || setweight(to_tsvector('french'::regconfig,
           private.fold_accents(coalesce(p_description, '') || ' ' || coalesce(p_venue, '') || ' ' || coalesce(p_city, ''))), 'C');
$$;

revoke all on function private.event_search_vector(text, text, text, text, text) from public, anon, authenticated, service_role;

-- ---- Events ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  -- The owner. Never changes (trigger below): no ownership transfer by edit.
  organization_id uuid not null
    constraint events_organization_id_fkey references public.organizations (id) on delete restrict,
  created_by uuid not null
    constraint events_created_by_fkey references auth.users (id) on delete restrict,
  -- Given at the first publication, stable afterwards (former ones redirect).
  slug text
    constraint events_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  -- One of the BDE's events of the year (src/data/mock/event-series.ts); BDE events only.
  series_key text
    constraint events_series_key_check check (series_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(series_key) <= 40),

  title text not null default ''
    constraint events_title_check check (char_length(title) <= 120 and title !~ '[[:cntrl:]]' and btrim(title) = title),
  summary text
    constraint events_summary_check check (char_length(summary) between 1 and 300 and summary !~ '[[:cntrl:]]' and btrim(summary) = summary),
  -- Plain text; paragraphs separated by blank lines. Rendered as text, never HTML.
  description text
    constraint events_description_check check (char_length(description) between 1 and 8000 and btrim(description) = description),
  category_id uuid
    constraint events_category_id_fkey references public.event_categories (id) on delete restrict,
  cover_media_id uuid
    constraint events_cover_media_id_fkey references public.association_media (id) on delete restrict,

  -- Where. Public fields only; private instructions live in access_details.
  location_type text not null default 'campus'
    constraint events_location_type_check check (location_type in ('campus', 'external', 'online')),
  venue_name text
    constraint events_venue_name_check check (char_length(venue_name) between 1 and 120 and venue_name !~ '[[:cntrl:]]' and btrim(venue_name) = venue_name),
  address_line text
    constraint events_address_line_check check (char_length(address_line) between 1 and 200 and address_line !~ '[[:cntrl:]]' and btrim(address_line) = address_line),
  city text
    constraint events_city_check check (char_length(city) between 1 and 80 and city !~ '[[:cntrl:]]' and btrim(city) = city),
  -- Only coordinates the organizer typed; never inferred from an address.
  latitude numeric(8, 6)
    constraint events_latitude_check check (latitude between -90 and 90),
  longitude numeric(9, 6)
    constraint events_longitude_check check (longitude between -180 and 180),
  -- A public link to follow an online event (https only).
  online_url text
    constraint events_online_url_check check (online_url ~ '^https://[^[:space:]]+$' and char_length(online_url) <= 500),
  -- Private instructions (meeting link, door code, exact meeting point): shown
  -- only to confirmed participants and the event team, never in public reads.
  access_details text
    constraint events_access_details_check check (char_length(access_details) between 1 and 1000 and btrim(access_details) = access_details),

  -- When: exact instants; the intended zone is kept for display and exports.
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Europe/Paris'
    constraint events_timezone_check check (timezone = 'Europe/Paris'),

  -- Registration.
  registration_mode text not null default 'none'
    constraint events_registration_mode_check check (registration_mode in ('none', 'internal', 'external')),
  external_url text
    constraint events_external_url_check check (external_url ~ '^https://[^[:space:]]+$' and char_length(external_url) <= 500),
  -- Null: no fixed capacity (an explicit choice, never a big number).
  capacity integer
    constraint events_capacity_check check (capacity between 1 and 100000),
  waitlist_enabled boolean not null default false,
  -- Null: open as soon as the event is published.
  registration_opens_at timestamptz,
  -- Null: open until the event starts.
  registration_closes_at timestamptz,
  -- Self-service cancellation of a confirmed seat stops this long before the start.
  cancellation_cutoff_minutes integer not null default 0
    constraint events_cancellation_cutoff_check check (cancellation_cutoff_minutes between 0 and 10080),

  publication text not null default 'draft'
    constraint events_publication_check check (publication in ('draft', 'published', 'unpublished')),
  first_published_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  status text not null default 'scheduled'
    constraint events_status_check check (status in ('scheduled', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint events_cancelled_by_fkey references auth.users (id) on delete set null,
  cancellation_reason text
    constraint events_cancellation_reason_check check (char_length(cancellation_reason) between 3 and 500),

  -- Moderation (BDE): hidden from the public, nothing else changes.
  hidden_at timestamptz,
  hidden_by uuid
    constraint events_hidden_by_fkey references auth.users (id) on delete set null,
  hidden_reason text
    constraint events_hidden_reason_check check (char_length(hidden_reason) between 3 and 500),

  -- Featured on the association's own page (its team) / on the site (BDE).
  pinned_at timestamptz,
  pinned_by uuid
    constraint events_pinned_by_fkey references auth.users (id) on delete set null,
  prominence text not null default 'normal'
    constraint events_prominence_check check (prominence in ('normal', 'featured')),
  prominence_until timestamptz,
  prominence_by uuid
    constraint events_prominence_by_fkey references auth.users (id) on delete set null,

  -- Maintained only by the registration functions, under the event's row lock.
  confirmed_count integer not null default 0
    constraint events_confirmed_count_check check (confirmed_count >= 0),
  waitlist_count integer not null default 0
    constraint events_waitlist_count_check check (waitlist_count >= 0),

  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
    constraint events_updated_by_fkey references auth.users (id) on delete set null,
  search tsvector generated always as (private.event_search_vector(title, summary, description, venue_name, city)) stored,

  constraint events_slug_key unique (slug),
  -- The invariant of the registration engine.
  constraint events_capacity_respected_check check (capacity is null or confirmed_count <= capacity),
  constraint events_dates_check check (ends_at > starts_at and ends_at - starts_at <= interval '14 days'),
  constraint events_window_check check (registration_closes_at > registration_opens_at),
  constraint events_coordinates_check check ((latitude is null) = (longitude is null)),
  constraint events_online_url_location_check check (online_url is null or location_type = 'online'),
  constraint events_external_url_mode_check check (external_url is null or registration_mode = 'external'),
  constraint events_capacity_mode_check check (capacity is null or registration_mode = 'internal'),
  constraint events_waitlist_mode_check check (not waitlist_enabled or registration_mode = 'internal'),
  constraint events_access_details_mode_check check (access_details is null or registration_mode = 'internal'),
  constraint events_counts_mode_check check (registration_mode = 'internal' or (confirmed_count = 0 and waitlist_count = 0)),
  constraint events_published_check
    check (publication = 'draft' or (slug is not null and first_published_at is not null and starts_at is not null)),
  constraint events_cancelled_check
    check ((status = 'cancelled') = (cancelled_at is not null) and (cancelled_at is null) = (cancellation_reason is null)),
  constraint events_hidden_check check ((hidden_at is null) = (hidden_reason is null)),
  constraint events_pinned_check check (pinned_at is null or publication = 'published'),
  constraint events_prominence_set_check check ((prominence = 'normal') = (prominence_by is null))
);

comment on table public.events is
  'Events of an organization. Read by the team through RLS, by visitors only through public_event* functions; written only by the event functions.';
comment on column public.events.capacity is 'Null: no fixed capacity. Otherwise confirmed_count never exceeds it (CHECK).';
comment on column public.events.access_details is 'Private instructions for confirmed participants (and the team); never in public reads or exports.';

create index events_organization_idx on public.events (organization_id, starts_at);
create index events_public_starts_idx on public.events (starts_at, id) where publication = 'published' and hidden_at is null;
create index events_public_ends_idx on public.events (ends_at) where publication = 'published' and hidden_at is null;
create index events_category_idx on public.events (category_id);
create index events_cover_media_idx on public.events (cover_media_id);
create index events_created_by_idx on public.events (created_by);
create index events_cancelled_by_idx on public.events (cancelled_by);
create index events_hidden_by_idx on public.events (hidden_by);
create index events_pinned_by_idx on public.events (pinned_by);
create index events_prominence_by_idx on public.events (prominence_by);
create index events_updated_by_idx on public.events (updated_by);
create index events_prominence_idx on public.events (prominence) where prominence <> 'normal';
create index events_search_idx on public.events using gin (search);

create trigger set_updated_at before update on public.events
  for each row execute function private.set_updated_at();

-- An event stays with the organization that created it.
create or replace function private.keep_event_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id or new.created_by is distinct from old.created_by then
    raise exception 'event_owner_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger keep_event_organization before update on public.events
  for each row execute function private.keep_event_organization();

revoke all on function private.keep_event_organization() from public, anon, authenticated, service_role;

-- Co-organizers: credited publicly, no right of any kind on the event.
create table public.event_coorganizers (
  event_id uuid not null
    constraint event_coorganizers_event_id_fkey references public.events (id) on delete cascade,
  organization_id uuid not null
    constraint event_coorganizers_organization_id_fkey references public.organizations (id) on delete restrict,
  position smallint not null default 0
    constraint event_coorganizers_position_check check (position between 0 and 2),
  constraint event_coorganizers_pkey primary key (event_id, organization_id)
);

comment on table public.event_coorganizers is
  'Associations credited as co-organizers of an event (public credit only: they get no right on it).';

create index event_coorganizers_organization_idx on public.event_coorganizers (organization_id);

-- Former addresses of an event (they redirect; never given to another event).
create table public.event_slug_history (
  slug text primary key
    constraint event_slug_history_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  event_id uuid not null
    constraint event_slug_history_event_id_fkey references public.events (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index event_slug_history_event_idx on public.event_slug_history (event_id);

-- ---- Registrations and the waiting list ------------------------------------------------

-- Waiting-list order: a database sequence, never a client clock.
create sequence public.event_queue_seq;

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    constraint event_registrations_event_id_fkey references public.events (id) on delete cascade,
  -- Account deletion removes the person's registrations (counters follow, trigger below).
  user_id uuid not null
    constraint event_registrations_user_id_fkey references auth.users (id) on delete cascade,
  status text not null
    constraint event_registrations_status_check check (status in ('confirmed', 'waitlisted', 'cancelled')),
  -- Kept for later kinds (guests, tickets); Phase 7 has free standard places only.
  kind text not null default 'standard'
    constraint event_registrations_kind_check check (kind in ('standard')),
  -- Place in the waiting list (lower = earlier), from event_queue_seq.
  queue_position bigint,
  -- A short reference the student can quote to the organizers.
  reference text not null
    constraint event_registrations_reference_check check (reference ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  waitlisted_at timestamptz,
  promoted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid
    constraint event_registrations_cancelled_by_fkey references auth.users (id) on delete set null,
  cancel_source text
    constraint event_registrations_cancel_source_check check (cancel_source in ('self', 'organizer')),
  cancel_reason text
    constraint event_registrations_cancel_reason_check check (char_length(cancel_reason) between 3 and 500),
  updated_at timestamptz not null default now(),
  constraint event_registrations_reference_key unique (reference),
  constraint event_registrations_cancelled_check
    check ((status = 'cancelled') = (cancelled_at is not null) and (cancelled_at is null) = (cancel_source is null)),
  constraint event_registrations_confirmed_check check (status <> 'confirmed' or confirmed_at is not null),
  constraint event_registrations_waitlisted_check check (status <> 'waitlisted' or (waitlisted_at is not null and queue_position is not null))
);

comment on table public.event_registrations is
  'One row per registration attempt that succeeded. A student reads their own; teams read through event_attendees (events.attendees.view). Written only by the registration functions.';

-- One active registration (confirmed or waiting) per student and event.
create unique index event_registrations_active_key on public.event_registrations (event_id, user_id)
  where status in ('confirmed', 'waitlisted');
create index event_registrations_queue_idx on public.event_registrations (event_id, queue_position) where status = 'waitlisted';
create index event_registrations_event_status_idx on public.event_registrations (event_id, status, created_at);
create index event_registrations_user_idx on public.event_registrations (user_id, created_at);
create index event_registrations_cancelled_by_idx on public.event_registrations (cancelled_by);

create trigger set_updated_at before update on public.event_registrations
  for each row execute function private.set_updated_at();

-- An account deleted with an active registration: the counters follow (no
-- promotion here; the next registration or cancellation goes on normally).
create or replace function private.release_deleted_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'confirmed' then
    update public.events set confirmed_count = confirmed_count - 1 where id = old.event_id;
  elsif old.status = 'waitlisted' then
    update public.events set waitlist_count = waitlist_count - 1 where id = old.event_id;
  end if;
  return old;
end;
$$;

create trigger release_deleted_registration after delete on public.event_registrations
  for each row execute function private.release_deleted_registration();

revoke all on function private.release_deleted_registration() from public, anon, authenticated, service_role;

-- A student's saved events ("Enregistrer"): private to them.
create table public.event_bookmarks (
  user_id uuid not null
    constraint event_bookmarks_user_id_fkey references auth.users (id) on delete cascade,
  event_id uuid not null
    constraint event_bookmarks_event_id_fkey references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_bookmarks_pkey primary key (user_id, event_id)
);

create index event_bookmarks_event_idx on public.event_bookmarks (event_id);

-- ---- Notifications: an outbox -----------------------------------------------------------
--
-- Written in the same transaction as the change it reports (never before it
-- commits). In-app: the row itself is the message (the student reads their
-- own). E-mail: a worker claims pending rows, sends, records the outcome;
-- retries back off; a failure never touches registrations. One row per
-- recipient and logical message (dedupe_key): retries never duplicate.

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null
    constraint notification_outbox_recipient_id_fkey references auth.users (id) on delete cascade,
  kind text not null
    constraint notification_outbox_kind_check check (kind in (
      'event_registration_confirmed', 'event_waitlisted', 'event_promoted', 'event_registration_cancelled',
      'event_registration_removed', 'event_changed', 'event_cancelled', 'event_reminder')),
  event_id uuid
    constraint notification_outbox_event_id_fkey references public.events (id) on delete cascade,
  -- A snapshot of what the message says (title, dates, place, change), so a
  -- later edit never rewrites a message already sent.
  payload jsonb not null default '{}'::jsonb
    constraint notification_outbox_payload_check check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4000),
  dedupe_key text not null
    constraint notification_outbox_dedupe_key_check check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status text not null default 'pending'
    constraint notification_outbox_email_status_check check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_attempts smallint not null default 0
    constraint notification_outbox_email_attempts_check check (email_attempts between 0 and 20),
  email_next_attempt_at timestamptz not null default now(),
  email_last_error text
    constraint notification_outbox_email_last_error_check check (email_last_error ~ '^[a-z_]{3,60}$'),
  email_sent_at timestamptz,
  constraint notification_outbox_dedupe_key_key unique (dedupe_key)
);

comment on table public.notification_outbox is
  'Operational messages to students (Phase 7: events). The recipient reads their own in the site; an e-mail worker delivers pending rows.';

create index notification_outbox_recipient_idx on public.notification_outbox (recipient_id, created_at desc);
create index notification_outbox_event_idx on public.notification_outbox (event_id);
create index notification_outbox_email_queue_idx on public.notification_outbox (email_next_attempt_at)
  where email_status in ('pending', 'sending');

-- ---- Permissions ----------------------------------------------------------------------

update public.permissions
   set label = 'Préparer des événements',
       description = 'Créer des brouillons d''événements, les modifier tant qu''ils sont à soi et pas en ligne, envoyer leurs images.',
       module_ready = true
 where key = 'events.create';

update public.permissions
   set label = 'Modifier les événements',
       description = 'Modifier n''importe quel événement de l''asso (les changements de date, de lieu ou d''inscription d''un événement en ligne demandent « Publier les événements »).',
       module_ready = true
 where key = 'events.edit';

update public.permissions
   set label = 'Publier les événements',
       description = 'Mettre en ligne, retirer, annuler, reprogrammer, changer la capacité et les inscriptions, épingler.',
       module_ready = true
 where key = 'events.publish';

-- Participants are personal data: explicit grant only, never delegated.
insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('events.attendees.view', 'organization', 'events', 'Voir les participant·es',
   'La liste des inscrit·es et de la liste d''attente des événements de l''asso (noms, dates, statuts).', true, false, true, true, 63),
  ('events.attendees.manage', 'organization', 'events', 'Gérer les participant·es',
   'Retirer une inscription ou une place en liste d''attente, avec une raison (la place libérée suit la liste d''attente).', true, false, true, true, 64),
  ('events.attendees.export', 'organization', 'events', 'Exporter les participant·es',
   'Télécharger la liste des participant·es d''un événement (CSV).', true, false, true, true, 65);

-- Offices carry every organization key: add the new ones to their templates
-- and existing office positions. The "Événements" template sees and manages
-- participants (never exports); existing positions keep what they had.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
  cross join (values ('events.attendees.view'), ('events.attendees.manage'), ('events.attendees.export')) as k (key)
 where t.office is not null;

insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
  cross join (values ('events.attendees.view'), ('events.attendees.manage'), ('events.attendees.export')) as k (key)
 where p.office is not null
on conflict do nothing;

insert into public.position_template_permissions (template_key, permission_key) values
  ('events', 'events.attendees.view'),
  ('events', 'events.attendees.manage');

-- ---- Audit: event actions ----------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_authority_check;
alter table public.governance_audit_events add constraint governance_audit_events_authority_check
  check (authority in ('position', 'delegation', 'bde', 'guardian', 'provisioning', 'self', 'scheduler', 'system'));
alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category',
                           'event', 'event_registration', 'event_category'));

-- ---- Who works on events (caller only, for the read policies) --------------------------

-- Organizations where the caller sees every event: editors and publishers.
create or replace function private.my_event_team_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
   where (select auth.uid()) is not null
     and (private.user_has_organization_permission((select auth.uid()), o.id, 'events.edit', now())
       or private.user_has_organization_permission((select auth.uid()), o.id, 'events.publish', now()));
$$;

-- Events the caller may read as a team member: all of those organizations,
-- plus, for someone who only holds events.create, the events they started.
create or replace function private.my_readable_event_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
    from public.events e
   where (select auth.uid()) is not null
     and (e.organization_id in (select private.my_event_team_organization_ids())
          or (e.created_by = (select auth.uid())
              and private.user_has_organization_permission((select auth.uid()), e.organization_id, 'events.create', now())));
$$;

revoke all on function private.my_event_team_organization_ids() from public, anon, authenticated, service_role;
revoke all on function private.my_readable_event_ids() from public, anon, authenticated, service_role;
grant execute on function private.my_event_team_organization_ids() to authenticated;
grant execute on function private.my_readable_event_ids() to authenticated;

-- ---- Images: event teams use the association library too ----------------------------------

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
                           'events.create', 'events.edit', 'events.publish']) as k (key)
        where private.user_has_organization_permission((select auth.uid()), o.id, k.key, now())
     );
$$;

-- May send images to this organization's library: media.manage, writing articles or preparing events.
create or replace function private.can_upload_media(p_user uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission(p_user, p_organization_id, 'media.manage', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'posts.create', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'events.create', now());
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
    )
  );

-- ---- Row level security -----------------------------------------------------------------

alter table public.event_categories enable row level security;
alter table public.events enable row level security;
alter table public.event_coorganizers enable row level security;
alter table public.event_slug_history enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_bookmarks enable row level security;
alter table public.notification_outbox enable row level security;

revoke all on public.event_categories, public.events, public.event_coorganizers, public.event_slug_history,
  public.event_registrations, public.event_bookmarks, public.notification_outbox
  from anon, authenticated;
revoke all on sequence public.event_queue_seq from anon, authenticated;

create policy event_categories_read_active
  on public.event_categories for select to anon, authenticated
  using (archived_at is null);
create policy event_categories_read_platform
  on public.event_categories for select to authenticated
  using ((select private.has_platform_permission('platform.organizations.manage')));

-- The team reads its events (drafts included); visitors only through the public functions.
create policy events_read_team
  on public.events for select to authenticated
  using (id in (select private.my_readable_event_ids()));

create policy event_coorganizers_read_team
  on public.event_coorganizers for select to authenticated
  using (event_id in (select private.my_readable_event_ids()));

-- A student reads their own registrations only. Teams never read this table
-- directly: they go through event_attendees, which checks events.attendees.view.
create policy event_registrations_read_own
  on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()));

create policy event_bookmarks_read_own
  on public.event_bookmarks for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_outbox_read_own
  on public.notification_outbox for select to authenticated
  using (recipient_id = (select auth.uid()));

-- A half-finished sign-in (MFA enrolled, aal1) reads nothing here, as everywhere.
create policy events_require_mfa_when_enrolled on public.events
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy event_coorganizers_require_mfa_when_enrolled on public.event_coorganizers
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy event_registrations_require_mfa_when_enrolled on public.event_registrations
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy event_bookmarks_require_mfa_when_enrolled on public.event_bookmarks
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy notification_outbox_require_mfa_when_enrolled on public.notification_outbox
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.event_categories to anon, authenticated;
grant select on public.events, public.event_coorganizers, public.event_registrations, public.event_bookmarks,
  public.notification_outbox to authenticated;
-- event_slug_history: functions only. No table accepts writes from the API roles.
