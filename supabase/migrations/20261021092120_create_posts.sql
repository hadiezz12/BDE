-- Phase 6 · The publishing CMS: posts, revisions, reviews, categories,
-- editorial settings, reports. Functions are in the next migration.
--
-- State model (docs/backend/publishing.md), three separate concerns:
--   - a REVISION's review status: draft → submitted → approved, or
--     changes_requested; a draft or submission replaced before publication
--     becomes superseded. Only a draft can change; from submission on, the
--     content of a revision is frozen (trigger below), so an approval always
--     applies to exactly what was reviewed.
--   - the POST's publication: unpublished (never, or taken down), published,
--     archived (off the feeds, still readable at its address). Which revision
--     is live is published_revision_id; a pending schedule names its own
--     revision and instant.
--   - MODERATION by the BDE: hidden_at, independent of both. A hidden post is
--     never public, whatever its publication says.
-- Every write goes through the security-definer functions; the API roles can
-- only read, through the policies at the end.

-- ---- Text helpers ---------------------------------------------------------------

-- Lower-case, without the usual French accents: search and slugs.
create or replace function private.fold_accents(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(translate(lower(coalesce(p_text, '')),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), 'œ', 'oe'), 'æ', 'ae');
$$;

-- The text of a rich-text document (every "text" leaf), for search and
-- reading time.
create or replace function private.post_document_text(p_body jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(t #>> '{}', ' '), '')
    from jsonb_path_query(coalesce(p_body, '{}'::jsonb), 'strict $.**.text') as t
   where jsonb_typeof(t) = 'string';
$$;

-- A rich-text document the site can render safely: a "doc" built only from
-- the node and mark types the renderer knows, links only to http(s), mailto
-- or a site path, images only as references to the association's library,
-- headings only of level 2 or 3, and a bounded size. The renderer checks
-- again (src/lib/posts/document.ts); nothing is ever stored or printed as HTML.
create or replace function private.valid_post_body(p_body jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_body) = 'object'
     and p_body ->> 'type' = 'doc'
     and pg_column_size(p_body) <= 200000
     and not jsonb_path_exists(p_body,
       'strict $.**.type ? (!(@ == "doc" || @ == "paragraph" || @ == "heading" || @ == "text" || @ == "bulletList"
                            || @ == "orderedList" || @ == "listItem" || @ == "blockquote" || @ == "horizontalRule"
                            || @ == "hardBreak" || @ == "image" || @ == "bold" || @ == "italic" || @ == "link"))')
     and not jsonb_path_exists(p_body,
       'strict $.**.marks[*] ? (@.type == "link") ? (!(@.attrs.href like_regex "^(https?://[^[:space:]]+|mailto:[^[:space:]]+|/[a-z0-9][^[:space:]]*)$"))')
     and not jsonb_path_exists(p_body,
       'strict $.** ? (@.type == "image") ? (!(@.attrs.mediaId like_regex "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))')
     and not jsonb_path_exists(p_body,
       'strict $.** ? (@.type == "heading") ? (!(@.attrs.level == 2 || @.attrs.level == 3))');
$$;

-- Tags: 0 to 8, lower-case words joined by dashes, 30 characters at most.
create or replace function private.valid_post_tags(p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_tags) <= 8
     and coalesce((select bool_and(t ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(t) <= 30) from unnest(p_tags) as t), true)
     and cardinality(p_tags) = (select count(distinct t) from unnest(p_tags) as t);
$$;

-- What search reads, weighted: title, then introduction, then body and tags.
create or replace function private.post_search_vector(p_title text, p_intro text, p_body jsonb, p_tags text[])
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select setweight(to_tsvector('french'::regconfig, private.fold_accents(p_title)), 'A')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(p_intro)), 'B')
      || setweight(to_tsvector('french'::regconfig,
           private.fold_accents(private.post_document_text(p_body) || ' ' || coalesce(array_to_string(p_tags, ' '), ''))), 'C');
$$;

revoke all on function private.fold_accents(text) from public, anon, authenticated, service_role;
revoke all on function private.post_document_text(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.valid_post_body(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.valid_post_tags(text[]) from public, anon, authenticated, service_role;
revoke all on function private.post_search_vector(text, text, jsonb, text[]) from public, anon, authenticated, service_role;

-- ---- Categories (platform catalog, maintained by BDE leadership) ---------------------

create table public.post_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint post_categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  label text not null
    constraint post_categories_label_check check (label ~ '^[^[:cntrl:]]{2,40}$' and btrim(label) = label),
  sort_order smallint not null default 100
    constraint post_categories_sort_order_check check (sort_order between 0 and 999),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
    constraint post_categories_created_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint post_categories_slug_key unique (slug),
  constraint post_categories_label_key unique (label)
);

comment on table public.post_categories is
  'The rubriques of the campus feed. One list for the whole site, kept short by the BDE; never hard-coded in the app.';

create trigger set_updated_at
  before update on public.post_categories
  for each row execute function private.set_updated_at();

create index post_categories_created_by_idx on public.post_categories (created_by);

insert into public.post_categories (slug, label, sort_order) values
  ('vie-de-campus', 'Vie de campus', 10),
  ('vie-associative', 'Vie associative', 20),
  ('infos-pratiques', 'Infos pratiques', 30),
  ('sport', 'Sport', 40),
  ('culture', 'Culture', 50),
  ('carriere', 'Carrière', 60),
  ('solidarite', 'Solidarité', 70),
  ('international', 'International', 80);

-- ---- Editorial settings of each organization ------------------------------------------

create table public.organization_editorial_settings (
  organization_id uuid primary key
    constraint organization_editorial_settings_organization_id_fkey references public.organizations (id) on delete restrict,
  -- direct: holders of posts.publish publish without a second person.
  -- approval: every publication needs an approval by someone who did not write it.
  review_mode text not null default 'direct'
    constraint organization_editorial_settings_review_mode_check check (review_mode in ('direct', 'approval')),
  -- Print "Par <prénom nom>" on articles (each author can still opt out by
  -- hiding themselves from the public team).
  show_authors boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
    constraint organization_editorial_settings_updated_by_fkey references auth.users (id) on delete set null
);

create index organization_editorial_settings_updated_by_idx on public.organization_editorial_settings (updated_by);

insert into public.organization_editorial_settings (organization_id) select id from public.organizations;

create or replace function private.create_editorial_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_editorial_settings (organization_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.create_editorial_settings() from public, anon, authenticated, service_role;

create trigger create_editorial_settings
  after insert on public.organizations
  for each row execute function private.create_editorial_settings();

-- ---- Posts and their revisions ---------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint posts_organization_id_fkey references public.organizations (id) on delete restrict,
  -- Given at the first publication (a draft has no public address).
  slug text
    constraint posts_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  created_by uuid not null
    constraint posts_created_by_fkey references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The revision the editors work on (the latest one).
  working_revision_id uuid not null,
  -- The revision visitors read, once published.
  published_revision_id uuid,
  publication text not null default 'unpublished'
    constraint posts_publication_check check (publication in ('unpublished', 'published', 'archived')),
  -- Feed order: set once, by the server, at the first publication. Republishing
  -- an edit never moves a post up the feed.
  first_published_at timestamptz,
  published_at timestamptz,
  published_by uuid
    constraint posts_published_by_fkey references auth.users (id) on delete set null,
  unpublished_at timestamptz,
  archived_at timestamptz,
  -- At most one pending schedule: this exact revision, at this instant.
  scheduled_revision_id uuid,
  scheduled_at timestamptz,
  scheduled_by uuid
    constraint posts_scheduled_by_fkey references auth.users (id) on delete set null,
  schedule_status text
    constraint posts_schedule_status_check check (schedule_status in ('pending', 'failed')),
  schedule_error text
    constraint posts_schedule_error_check check (schedule_error ~ '^[a-z_]{3,60}$'),
  schedule_attempts smallint not null default 0
    constraint posts_schedule_attempts_check check (schedule_attempts between 0 and 1000),
  schedule_attempted_at timestamptz,
  -- BDE moderation (independent of publication).
  hidden_at timestamptz,
  hidden_by uuid
    constraint posts_hidden_by_fkey references auth.users (id) on delete set null,
  hidden_reason text
    constraint posts_hidden_reason_check check (char_length(hidden_reason) between 3 and 500),
  -- Pinned on the association's own page (its publishers).
  pinned_at timestamptz,
  pinned_by uuid
    constraint posts_pinned_by_fkey references auth.users (id) on delete set null,
  -- Site-wide prominence (BDE leadership): featured story, or an important
  -- BDE announcement. Optional end date.
  prominence text not null default 'normal'
    constraint posts_prominence_check check (prominence in ('normal', 'featured', 'important')),
  prominence_until timestamptz,
  prominence_by uuid
    constraint posts_prominence_by_fkey references auth.users (id) on delete set null,
  constraint posts_slug_key unique (slug),
  constraint posts_published_has_revision_check
    check (publication = 'unpublished' or (published_revision_id is not null and slug is not null and first_published_at is not null)),
  constraint posts_archived_check check ((publication = 'archived') = (archived_at is not null)),
  constraint posts_schedule_check
    check ((scheduled_revision_id is null) = (scheduled_at is null)
           and (scheduled_at is null) = (schedule_status is null)
           and (schedule_status = 'failed') = (schedule_error is not null)),
  constraint posts_hidden_check check ((hidden_at is null) = (hidden_reason is null)),
  constraint posts_pinned_check check (pinned_at is null or publication = 'published'),
  constraint posts_prominence_set_check check ((prominence = 'normal') = (prominence_by is null))
);

comment on table public.posts is
  'A post''s identity (organization, address, publication, schedule, moderation). Its content lives in post_revisions.';

create trigger set_updated_at
  before update on public.posts
  for each row execute function private.set_updated_at();

create index posts_organization_id_updated_at_idx on public.posts (organization_id, updated_at desc);
create index posts_feed_idx on public.posts (first_published_at desc, id desc) where publication = 'published' and hidden_at is null;
create index posts_due_schedule_idx on public.posts (scheduled_at) where schedule_status = 'pending';
create index posts_created_by_idx on public.posts (created_by);
create index posts_published_by_idx on public.posts (published_by);
create index posts_scheduled_by_idx on public.posts (scheduled_by);
create index posts_hidden_by_idx on public.posts (hidden_by);
create index posts_pinned_by_idx on public.posts (pinned_by);
create index posts_prominence_by_idx on public.posts (prominence_by);
create index posts_prominence_idx on public.posts (prominence) where prominence <> 'normal';

create table public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    constraint post_revisions_post_id_fkey references public.posts (id) on delete cascade,
  number integer not null
    constraint post_revisions_number_check check (number between 1 and 100000),
  kind text not null
    constraint post_revisions_kind_check check (kind in ('article', 'annonce', 'recap', 'breve')),
  title text not null default ''
    constraint post_revisions_title_check check (char_length(title) <= 140 and title !~ '[[:cntrl:]]'),
  intro text
    constraint post_revisions_intro_check
    check (char_length(intro) between 1 and 400 and intro !~ '[[:cntrl:]]' and btrim(intro) = intro),
  body jsonb not null default '{"type": "doc", "content": []}'::jsonb
    constraint post_revisions_body_check check (private.valid_post_body(body)),
  cover_media_id uuid
    constraint post_revisions_cover_media_id_fkey references public.association_media (id) on delete restrict,
  category_id uuid
    constraint post_revisions_category_id_fkey references public.post_categories (id) on delete restrict,
  tags text[] not null default '{}'
    constraint post_revisions_tags_check check (private.valid_post_tags(tags)),
  status text not null default 'draft'
    constraint post_revisions_status_check
    check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'superseded')),
  -- Bumped by every save of a draft: a save names the version it started
  -- from, and a stale one is refused instead of overwriting someone's work.
  version integer not null default 1
    constraint post_revisions_version_check check (version >= 1),
  restored_from uuid
    constraint post_revisions_restored_from_fkey references public.post_revisions (id) on delete set null,
  -- Who opened this revision, and everyone who saved it since.
  created_by uuid not null
    constraint post_revisions_created_by_fkey references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null
    constraint post_revisions_updated_by_fkey references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  contributors uuid[] not null
    constraint post_revisions_contributors_check check (cardinality(contributors) between 1 and 50),
  submitted_at timestamptz,
  submitted_by uuid
    constraint post_revisions_submitted_by_fkey references auth.users (id) on delete set null,
  -- The approval (review or direct publication) or the request for changes.
  reviewed_at timestamptz,
  reviewed_by uuid
    constraint post_revisions_reviewed_by_fkey references auth.users (id) on delete set null,
  review_mode text
    constraint post_revisions_review_mode_check check (review_mode in ('review', 'direct')),
  -- Set when this revision went live (history).
  published_at timestamptz,
  search tsvector generated always as (private.post_search_vector(title, intro, body, tags)) stored,
  constraint post_revisions_post_id_number_key unique (post_id, number),
  constraint post_revisions_id_post_id_key unique (id, post_id),
  constraint post_revisions_approved_check check ((status = 'approved') = (review_mode is not null and reviewed_at is not null))
);

comment on table public.post_revisions is
  'Content snapshots of a post. Only a draft changes; from submission on, a revision is frozen (approvals bind to it).';

create index post_revisions_cover_media_id_idx on public.post_revisions (cover_media_id);
create index post_revisions_category_id_idx on public.post_revisions (category_id);
create index post_revisions_restored_from_idx on public.post_revisions (restored_from);
create index post_revisions_created_by_idx on public.post_revisions (created_by);
create index post_revisions_updated_by_idx on public.post_revisions (updated_by);
create index post_revisions_submitted_by_idx on public.post_revisions (submitted_by);
create index post_revisions_reviewed_by_idx on public.post_revisions (reviewed_by);
create index post_revisions_status_idx on public.post_revisions (status) where status = 'submitted';
create index post_revisions_search_idx on public.post_revisions using gin (search);
create index post_revisions_tags_idx on public.post_revisions using gin (tags);

-- The post points to its own revisions only (composite keys), checked at commit.
alter table public.posts
  add constraint posts_working_revision_fkey foreign key (working_revision_id, id)
    references public.post_revisions (id, post_id) deferrable initially deferred,
  add constraint posts_published_revision_fkey foreign key (published_revision_id, id)
    references public.post_revisions (id, post_id) deferrable initially deferred,
  add constraint posts_scheduled_revision_fkey foreign key (scheduled_revision_id, id)
    references public.post_revisions (id, post_id) deferrable initially deferred;

create index posts_working_revision_id_idx on public.posts (working_revision_id);
create index posts_published_revision_id_idx on public.posts (published_revision_id);
create index posts_scheduled_revision_id_idx on public.posts (scheduled_revision_id);

-- From submission on, what was reviewed can no longer change.
create or replace function private.freeze_submitted_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.kind, new.title, new.intro, new.body, new.cover_media_id, new.category_id, new.tags)
         is distinct from (old.kind, old.title, old.intro, old.body, old.cover_media_id, old.category_id, old.tags) then
    raise exception 'revision_locked' using errcode = 'P0001';
  end if;
  if new.post_id <> old.post_id or new.number <> old.number or new.created_by <> old.created_by then
    raise exception 'revision_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_submitted_revision() from public, anon, authenticated, service_role;

create trigger freeze_submitted_revision
  before update on public.post_revisions
  for each row execute function private.freeze_submitted_revision();

-- A post never changes organization (moving it would need its own governed workflow).
create or replace function private.keep_post_organization()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.created_by <> old.created_by then
    raise exception 'post_owner_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.keep_post_organization() from public, anon, authenticated, service_role;

create trigger keep_post_organization
  before update on public.posts
  for each row execute function private.keep_post_organization();

-- Every decision on a revision, with the exact content it applied to.
create table public.post_reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    constraint post_reviews_post_id_fkey references public.posts (id) on delete cascade,
  revision_id uuid not null,
  decision text not null
    constraint post_reviews_decision_check check (decision in ('approved', 'changes_requested', 'published_directly')),
  reviewer_id uuid not null
    constraint post_reviews_reviewer_id_fkey references auth.users (id) on delete restrict,
  note text
    constraint post_reviews_note_check check (char_length(note) between 1 and 500),
  -- md5 of the revision's content when decided (the revision is frozen anyway).
  content_hash text not null
    constraint post_reviews_content_hash_check check (content_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  constraint post_reviews_revision_fkey foreign key (revision_id, post_id)
    references public.post_revisions (id, post_id) on delete cascade
);

create index post_reviews_revision_id_idx on public.post_reviews (revision_id, post_id);
create index post_reviews_post_id_idx on public.post_reviews (post_id);
create index post_reviews_reviewer_id_idx on public.post_reviews (reviewer_id);

-- Which library images each revision uses (cover and inline): an image used
-- by any revision is never removed (an old version may be restored or still
-- be live).
create table public.post_revision_media (
  revision_id uuid not null
    constraint post_revision_media_revision_id_fkey references public.post_revisions (id) on delete cascade,
  media_id uuid not null
    constraint post_revision_media_media_id_fkey references public.association_media (id) on delete restrict,
  role text not null
    constraint post_revision_media_role_check check (role in ('cover', 'inline')),
  constraint post_revision_media_pkey primary key (revision_id, media_id, role)
);

create index post_revision_media_media_id_idx on public.post_revision_media (media_id);

-- Former addresses: they redirect, and no other post can take them.
create table public.post_slug_history (
  slug text primary key
    constraint post_slug_history_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  post_id uuid not null
    constraint post_slug_history_post_id_fkey references public.posts (id) on delete cascade,
  replaced_at timestamptz not null default now(),
  replaced_by uuid
    constraint post_slug_history_replaced_by_fkey references auth.users (id) on delete set null
);

create index post_slug_history_post_id_idx on public.post_slug_history (post_id);
create index post_slug_history_replaced_by_idx on public.post_slug_history (replaced_by);

-- ---- Reports (students) -------------------------------------------------------------

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    constraint content_reports_post_id_fkey references public.posts (id) on delete cascade,
  -- Kept for abuse handling only: never shown to the association, nor in the
  -- moderation screens.
  reporter_id uuid
    constraint content_reports_reporter_id_fkey references auth.users (id) on delete set null,
  reason text not null
    constraint content_reports_reason_check
    check (reason in ('harassment', 'discrimination', 'misleading', 'privacy', 'image_rights', 'spam', 'other')),
  details text
    constraint content_reports_details_check check (char_length(details) between 1 and 500 and btrim(details) = details),
  status text not null default 'open'
    constraint content_reports_status_check check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
    constraint content_reports_resolved_by_fkey references auth.users (id) on delete set null,
  resolution_note text
    constraint content_reports_resolution_note_check check (char_length(resolution_note) between 1 and 500),
  constraint content_reports_resolved_check check ((status = 'open') = (resolved_at is null))
);

create unique index content_reports_one_open_per_reporter_idx
  on public.content_reports (post_id, reporter_id) where status = 'open';
create index content_reports_status_created_at_idx on public.content_reports (status, created_at desc);
create index content_reports_reporter_id_created_at_idx on public.content_reports (reporter_id, created_at desc);
create index content_reports_resolved_by_idx on public.content_reports (resolved_by);

-- ---- Permissions ---------------------------------------------------------------------

update public.permissions
   set label = 'Écrire des articles',
       description = 'Rédiger des articles et les modifier tant qu''ils sont à soi, envoyer leurs images, les soumettre à relecture.',
       module_ready = true
 where key = 'posts.create';

update public.permissions
   set label = 'Modifier tous les articles',
       description = 'Modifier n''importe quel article de l''asso, restaurer une ancienne version, supprimer un brouillon.',
       module_ready = true
 where key = 'posts.edit';

update public.permissions
   set label = 'Publier les articles',
       description = 'Mettre en ligne, programmer, retirer, archiver et épingler les articles, selon la politique de relecture.',
       module_ready = true
 where key = 'posts.publish';

update public.permissions
   set description = 'Retirer une page ou un article qui pose problème (avec une raison), traiter les signalements, rétablir.'
 where key = 'platform.content.moderate';

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('posts.approve', 'organization', 'content', 'Approuver les articles',
   'Relire les articles soumis, les approuver ou demander des modifications (jamais les siens).', true, true, false, true, 53),
  ('posts.settings', 'organization', 'content', 'Régler la publication',
   'Choisir si les articles passent par une relecture avant publication, et l''affichage des auteurs.', true, false, false, true, 54),
  ('platform.content.feature', 'platform', 'platform', 'Mettre à la une',
   'Choisir les articles à la une du site et les annonces importantes du BDE.', false, false, false, true, 107);

-- The offices carry every organization key: add the new ones to their
-- templates and to the office positions that exist. Ordinary templates get
-- nothing new automatically, except the vice-presidency, which can approve.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
  cross join (values ('posts.approve'), ('posts.settings')) as k (key)
 where t.office is not null;

insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
  cross join (values ('posts.approve'), ('posts.settings')) as k (key)
 where p.office is not null
on conflict do nothing;

insert into public.position_template_permissions (template_key, permission_key)
values ('vice_president', 'posts.approve');

-- The BDE offices also carry the new platform key.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, 'platform.content.feature'
  from public.position_templates t
 where t.office in ('bde_president', 'bde_vice_president');

insert into public.position_permissions (position_id, permission_key)
select p.id, 'platform.content.feature'
  from public.positions p
 where p.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;

-- ---- Audit: content and moderation --------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_authority_check;
alter table public.governance_audit_events add constraint governance_audit_events_authority_check
  check (authority in ('position', 'delegation', 'bde', 'guardian', 'provisioning', 'self', 'scheduler'));
alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category', 'post', 'post_revision', 'content_report', 'post_category'));

-- ---- Who works on content (caller only, for the read policies) -----------------------------

-- Organizations where the caller may see every post: editors, approvers, publishers.
create or replace function private.my_post_editor_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.organizations o
   where (select auth.uid()) is not null
     and (
          private.user_has_organization_permission((select auth.uid()), o.id, 'posts.edit', now())
       or private.user_has_organization_permission((select auth.uid()), o.id, 'posts.approve', now())
       or private.user_has_organization_permission((select auth.uid()), o.id, 'posts.publish', now())
     );
$$;

-- Posts the caller may read: all of those organizations, plus, for an
-- author who only holds posts.create, the posts they started.
create or replace function private.my_readable_post_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.posts p
   where p.organization_id in (select private.my_post_editor_organization_ids())
      or (p.created_by = (select auth.uid())
          and private.user_has_organization_permission((select auth.uid()), p.organization_id, 'posts.create', now()));
$$;

-- Organizations whose image library the caller may look at (and draft images
-- preview): the page team (Phase 5) and anyone working on content.
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
                           'posts.create', 'posts.edit', 'posts.approve', 'posts.publish']) as k (key)
        where private.user_has_organization_permission((select auth.uid()), o.id, k.key, now())
     );
$$;

-- May send images to this organization's library: media.manage, or writing articles.
create or replace function private.can_upload_media(p_user uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission(p_user, p_organization_id, 'media.manage', now())
      or private.user_has_organization_permission(p_user, p_organization_id, 'posts.create', now());
$$;

revoke all on function private.my_post_editor_organization_ids() from public, anon, authenticated, service_role;
revoke all on function private.my_readable_post_ids() from public, anon, authenticated, service_role;
revoke all on function private.my_media_organization_ids() from public, anon, authenticated, service_role;
revoke all on function private.can_upload_media(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.my_post_editor_organization_ids() to authenticated;
grant execute on function private.my_readable_post_ids() to authenticated;
grant execute on function private.my_media_organization_ids() to authenticated;

-- ---- Row level security -----------------------------------------------------------------

alter table public.post_categories enable row level security;
alter table public.organization_editorial_settings enable row level security;
alter table public.posts enable row level security;
alter table public.post_revisions enable row level security;
alter table public.post_reviews enable row level security;
alter table public.post_revision_media enable row level security;
alter table public.post_slug_history enable row level security;
alter table public.content_reports enable row level security;

revoke all on public.post_categories, public.organization_editorial_settings, public.posts, public.post_revisions,
  public.post_reviews, public.post_revision_media, public.post_slug_history, public.content_reports
  from anon, authenticated;

create policy post_categories_read_active
  on public.post_categories for select to anon, authenticated
  using (archived_at is null);
create policy post_categories_read_platform
  on public.post_categories for select to authenticated
  using ((select private.has_platform_permission('platform.organizations.manage')));

create policy organization_editorial_settings_read_content_team
  on public.organization_editorial_settings for select to authenticated
  using (organization_id in (select private.my_post_editor_organization_ids())
         or organization_id in (select private.my_organization_ids_with('posts.create')));

create policy posts_read_content_team
  on public.posts for select to authenticated
  using (id in (select private.my_readable_post_ids()));

create policy post_revisions_read_content_team
  on public.post_revisions for select to authenticated
  using (post_id in (select private.my_readable_post_ids()));

create policy post_reviews_read_content_team
  on public.post_reviews for select to authenticated
  using (post_id in (select private.my_readable_post_ids()));

create policy post_revision_media_read_content_team
  on public.post_revision_media for select to authenticated
  using (revision_id in (select r.id from public.post_revisions r where r.post_id in (select private.my_readable_post_ids())));

-- A student sees their own reports (and nobody else's).
create policy content_reports_read_own
  on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- A half-finished sign-in (MFA enrolled, aal1) reads nothing here, as everywhere.
create policy organization_editorial_settings_require_mfa_when_enrolled on public.organization_editorial_settings
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy posts_require_mfa_when_enrolled on public.posts
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy post_revisions_require_mfa_when_enrolled on public.post_revisions
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy post_reviews_require_mfa_when_enrolled on public.post_reviews
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy post_revision_media_require_mfa_when_enrolled on public.post_revision_media
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy content_reports_require_mfa_when_enrolled on public.content_reports
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.post_categories to anon, authenticated;
grant select on public.organization_editorial_settings, public.posts, public.post_revisions, public.post_reviews,
  public.post_revision_media, public.content_reports to authenticated;
-- post_slug_history: functions only.

-- ---- Images: authors can send them, the content team can look at them ------------------

drop policy association_media_read_page_team on public.association_media;
create policy association_media_read_content_team
  on public.association_media for select to authenticated
  using (organization_id in (select private.my_media_organization_ids()));

drop policy association_media_select_team on storage.objects;
create policy association_media_select_team
  on storage.objects for select to authenticated
  using (
    bucket_id = 'association-media'
    and private.association_media_organization(name) in (select private.my_media_organization_ids())
  );

drop policy association_media_insert on storage.objects;
create policy association_media_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'association-media'
    and private.association_media_organization(name) is not null
    and (
      (select private.has_organization_permission(private.association_media_organization(name), 'media.manage'))
      or (select private.has_organization_permission(private.association_media_organization(name), 'posts.create'))
    )
  );
