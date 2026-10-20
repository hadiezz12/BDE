-- Phase 5 · Association pages: categories, draft and published profiles,
-- media, gallery, public team presentation, slug history.
--
-- One model for both stages. Every piece of an association's public page
-- exists as a DRAFT row (what its team edits and previews) and, once
-- published, as a PUBLISHED row (what visitors see), in the same tables,
-- told apart by `stage`. Publishing copies the draft over the published rows
-- in one transaction (public.publish_association_page, next migration).
-- Visitors never read these tables: they go through public read functions
-- that return only published, public fields of visible pages.
--
-- The organization's identity stays where Phase 4 put it: organizations.name,
-- short_name and accent are the PUBLISHED identity (used by governance, the
-- workspace and the public page alike). The draft row carries the proposed
-- name, short name and accent; publishing writes them to organizations.
-- organizations.tagline and .description move into the profile; the fixed
-- category column becomes a catalog the BDE manages.

-- ---- Categories (catalog managed by BDE leadership) -----------------------

create table public.association_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint association_categories_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  label text not null
    constraint association_categories_label_check
    check (label ~ '^[^[:cntrl:]]{2,40}$' and btrim(label) = label),
  sort_order smallint not null default 100
    constraint association_categories_sort_order_check check (sort_order between 0 and 999),
  archived_at timestamptz,
  created_by uuid
    constraint association_categories_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint association_categories_slug_key unique (slug),
  constraint association_categories_label_key unique (label)
);

comment on table public.association_categories is
  'Directory categories, chosen by each association (1 to 3). Maintained by BDE leadership through functions; never deleted, archived instead.';

create trigger set_updated_at
  before update on public.association_categories
  for each row execute function private.set_updated_at();

-- Starting catalog: the Phase 1 filters (development examples, not the
-- school's official list). BDE leadership renames, adds or archives them
-- from the site.
insert into public.association_categories (slug, label, sort_order) values
  ('sport', 'Sport', 10),
  ('culture', 'Culture', 20),
  ('arts', 'Arts', 30),
  ('pro', 'Pro', 40),
  ('entrepreneuriat', 'Entrepreneuriat', 50),
  ('solidarite', 'Solidarité', 60),
  ('international', 'International', 70),
  ('media', 'Médias', 80),
  ('autre', 'Autres', 900);

-- ---- Media (images of an association) -----------------------------------

-- An image uploaded by the association (logo, cover, gallery). The file lives
-- in the private Storage bucket "association-media" at
-- "<organization_id>/<id>.webp" (re-encoded by the server: no metadata). It is
-- served publicly only while a published, visible page uses it.
create table public.association_media (
  id uuid primary key,
  organization_id uuid not null
    constraint association_media_organization_id_fkey references public.organizations (id) on delete restrict,
  object_path text not null,
  -- What it was uploaded for (the library groups by it); usage is computed.
  kind text not null
    constraint association_media_kind_check check (kind in ('logo', 'cover', 'image')),
  width integer not null constraint association_media_width_check check (width between 1 and 10000),
  height integer not null constraint association_media_height_check check (height between 1 and 10000),
  bytes integer not null constraint association_media_bytes_check check (bytes between 1 and 10485760),
  alt_text text
    constraint association_media_alt_text_check
    check (alt_text ~ '^[^[:cntrl:]]{1,200}$' and btrim(alt_text) = alt_text),
  created_by uuid
    constraint association_media_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid
    constraint association_media_removed_by_fkey references auth.users (id) on delete set null,
  constraint association_media_object_path_check
    check (object_path = organization_id::text || '/' || id::text || '.webp'),
  constraint association_media_object_path_key unique (object_path),
  constraint association_media_organization_id_id_key unique (organization_id, id)
);

comment on table public.association_media is
  'Images of an association (private bucket association-media). Rows are never deleted: removed_at marks a file taken out of the library.';

create index association_media_organization_id_created_at_idx
  on public.association_media (organization_id, created_at desc) where removed_at is null;

-- ---- The page (one per organization) -----------------------------------------

-- The page's lifecycle, separate from the organization's (setup / active /
-- suspended / archived): an active association can have an unfinished page.
--   draft        never published
--   published    the published rows are shown (when the organization is active)
--   unpublished  taken offline by its team; published rows kept for history
-- withheld_*: BDE moderation (platform.content.moderate). A withheld page is
-- not shown and cannot be republished until BDE leadership releases it.
create table public.association_pages (
  organization_id uuid primary key
    constraint association_pages_organization_id_fkey references public.organizations (id) on delete restrict,
  status text not null default 'draft'
    constraint association_pages_status_check check (status in ('draft', 'published', 'unpublished')),
  published_revision integer,
  first_published_at timestamptz,
  published_at timestamptz,
  published_by uuid
    constraint association_pages_published_by_fkey references auth.users (id) on delete set null,
  unpublished_at timestamptz,
  withheld_at timestamptz,
  withheld_by uuid
    constraint association_pages_withheld_by_fkey references auth.users (id) on delete set null,
  withheld_reason text
    constraint association_pages_withheld_reason_check check (char_length(withheld_reason) between 3 and 500),
  updated_at timestamptz not null default now(),
  constraint association_pages_published_check
    check ((status = 'draft') = (first_published_at is null) and (status = 'draft') = (published_revision is null)),
  constraint association_pages_withheld_check
    check ((withheld_at is null) = (withheld_by is null) and (withheld_at is null) = (withheld_reason is null))
);

create trigger set_updated_at
  before update on public.association_pages
  for each row execute function private.set_updated_at();

-- ---- Profiles (draft and published) ------------------------------------------

create or replace function private.valid_pillars(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 3
     and not exists (
       select 1
         from jsonb_array_elements(p) as e
        where jsonb_typeof(e) <> 'object'
           or (select count(*) from jsonb_object_keys(e)) <> 2
           or jsonb_typeof(e -> 'title') <> 'string'
           or jsonb_typeof(e -> 'detail') <> 'string'
           or (e ->> 'title') !~ '^[^[:cntrl:]]{1,60}$'
           or btrim(e ->> 'title') <> (e ->> 'title')
           or char_length(e ->> 'detail') > 280
           or (e ->> 'detail') ~ '[[:cntrl:]]'
     );
$$;

-- Official accounts only: https, the platform's own host, no credentials,
-- no spaces. One link per platform; "website" is any https address.
create or replace function private.valid_social_links(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 8
     and (select count(distinct e ->> 'platform') from jsonb_array_elements(p) as e) = jsonb_array_length(p)
     and not exists (
       select 1
         from jsonb_array_elements(p) as e
        where jsonb_typeof(e) <> 'object'
           or (select count(*) from jsonb_object_keys(e)) <> 2
           or jsonb_typeof(e -> 'url') <> 'string'
           or char_length(e ->> 'url') > 300
           or (e ->> 'url') !~ '^https://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{1,5})?(/[^[:space:]]*)?$'
           or (e ->> 'url') ~* '^https://[^/]*@'
           or not (
                (e ->> 'platform' = 'instagram' and (e ->> 'url') ~* '^https://(www\.)?instagram\.com/')
             or (e ->> 'platform' = 'tiktok' and (e ->> 'url') ~* '^https://(www\.)?tiktok\.com/')
             or (e ->> 'platform' = 'linkedin' and (e ->> 'url') ~* '^https://([a-z]{2,3}\.)?linkedin\.com/')
             or (e ->> 'platform' = 'youtube' and (e ->> 'url') ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be)/')
             or (e ->> 'platform' = 'facebook' and (e ->> 'url') ~* '^https://((www|m)\.)?(facebook\.com|fb\.com)/')
             or (e ->> 'platform' = 'x' and (e ->> 'url') ~* '^https://(www\.)?(x\.com|twitter\.com)/')
             or (e ->> 'platform' = 'website')
           )
     );
$$;

revoke all on function private.valid_pillars(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.valid_social_links(jsonb) from public, anon, authenticated, service_role;

create table public.association_profiles (
  organization_id uuid not null
    constraint association_profiles_organization_id_fkey references public.organizations (id) on delete restrict,
  stage text not null
    constraint association_profiles_stage_check check (stage in ('draft', 'published')),
  -- Proposed identity (draft only): published to organizations.name/short_name/accent.
  name text
    constraint association_profiles_name_check
    check (name ~ '^[^[:cntrl:]]{2,80}$' and btrim(name) = name),
  short_name text
    constraint association_profiles_short_name_check
    check (short_name ~ '^[^[:cntrl:]]{1,20}$' and btrim(short_name) = short_name),
  accent text
    constraint association_profiles_accent_check
    check (accent in ('rose', 'cyan', 'violet', 'vert', 'or', 'bleu', 'orange', 'corail')),
  -- The official line under the name ("Bureau des étudiants", "Junior-Entreprise").
  kind_label text
    constraint association_profiles_kind_label_check
    check (kind_label ~ '^[^[:cntrl:]]{2,60}$' and btrim(kind_label) = kind_label),
  tagline text
    constraint association_profiles_tagline_check
    check (tagline ~ '^[^[:cntrl:]]{2,140}$' and btrim(tagline) = tagline),
  -- Plain text: paragraphs separated by blank lines. Never HTML: the site
  -- prints it as text, so markup shows literally and nothing runs.
  description text
    constraint association_profiles_description_check
    check (char_length(description) between 10 and 4000 and description !~ '[\x01-\x09\x0b\x0c\x0e-\x1f\x7f]'),
  meeting_info text
    constraint association_profiles_meeting_info_check
    check (char_length(meeting_info) between 2 and 300 and meeting_info !~ '[[:cntrl:]]' and btrim(meeting_info) = meeting_info),
  pillars jsonb not null default '[]'::jsonb
    constraint association_profiles_pillars_check check (private.valid_pillars(pillars)),
  -- An address of the association (never copied from a student's account).
  contact_email text
    constraint association_profiles_contact_email_check
    check (contact_email ~* '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' and char_length(contact_email) <= 254),
  social_links jsonb not null default '[]'::jsonb
    constraint association_profiles_social_links_check check (private.valid_social_links(social_links)),
  founded_year smallint
    constraint association_profiles_founded_year_check check (founded_year between 1850 and 2100),
  category_ids uuid[] not null default '{}'
    constraint association_profiles_category_ids_check
    check (cardinality(category_ids) <= 3 and array_position(category_ids, null) is null),
  logo_media_id uuid,
  cover_media_id uuid,
  -- Where the cover keeps its subject when cropped ("50% 30%"): never stretched.
  cover_focal text
    constraint association_profiles_cover_focal_check
    check (cover_focal ~ '^(100|[1-9]?[0-9])% (100|[1-9]?[0-9])%$'),
  -- Draft: bumped by every save (optimistic concurrency and "previewed what
  -- you publish"). Published: the draft revision it came from.
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
    constraint association_profiles_updated_by_fkey references auth.users (id) on delete set null,
  constraint association_profiles_pkey primary key (organization_id, stage),
  constraint association_profiles_logo_fkey foreign key (organization_id, logo_media_id)
    references public.association_media (organization_id, id) on delete restrict,
  constraint association_profiles_cover_fkey foreign key (organization_id, cover_media_id)
    references public.association_media (organization_id, id) on delete restrict,
  constraint association_profiles_identity_stage_check
    check (stage = 'draft' or (name is null and short_name is null and accent is null)),
  constraint association_profiles_draft_identity_check
    check (stage = 'published' or (name is not null and accent is not null))
);

comment on table public.association_profiles is
  'Public page content of an organization, as a draft and (once published) as published. Read by editors; visitors read published rows through public functions only.';

create index association_profiles_category_ids_idx on public.association_profiles using gin (category_ids);
create index association_profiles_logo_idx on public.association_profiles (organization_id, logo_media_id);
create index association_profiles_cover_idx on public.association_profiles (organization_id, cover_media_id);

-- Every chosen category exists (and, in a draft, is not archived), once.
create or replace function private.guard_profile_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(distinct c) from unnest(new.category_ids) as c) <> cardinality(new.category_ids) then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(new.category_ids) as c
     where not exists (
       select 1 from public.association_categories k
        where k.id = c and (new.stage = 'published' or k.archived_at is null)
     )
  ) then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_categories() from public, anon, authenticated, service_role;

create trigger guard_profile_categories
  before insert or update of category_ids on public.association_profiles
  for each row execute function private.guard_profile_categories();

-- ---- Gallery (draft and published) --------------------------------------------

create table public.association_gallery_items (
  organization_id uuid not null
    constraint association_gallery_items_organization_id_fkey references public.organizations (id) on delete restrict,
  stage text not null
    constraint association_gallery_items_stage_check check (stage in ('draft', 'published')),
  position smallint not null
    constraint association_gallery_items_position_check check (position between 0 and 23),
  media_id uuid not null,
  caption text
    constraint association_gallery_items_caption_check
    check (caption ~ '^[^[:cntrl:]]{1,140}$' and btrim(caption) = caption),
  constraint association_gallery_items_pkey primary key (organization_id, stage, position),
  constraint association_gallery_items_media_key unique (organization_id, stage, media_id),
  constraint association_gallery_items_media_fkey foreign key (organization_id, media_id)
    references public.association_media (organization_id, id) on delete restrict
);

create index association_gallery_items_media_idx on public.association_gallery_items (organization_id, media_id);

-- ---- Public team (draft and published arrangement + each member's consent) -----

-- Lets a membership be referenced together with its organization.
alter table public.memberships
  add constraint memberships_id_organization_id_key unique (id, organization_id);

-- How the team arranges its public presentation: order, the title shown,
-- people left out. It never changes anyone's rights: positions and mandates
-- (Phase 4) decide who may do what; this only decides what visitors read.
create table public.association_team_entries (
  organization_id uuid not null,
  stage text not null
    constraint association_team_entries_stage_check check (stage in ('draft', 'published')),
  membership_id uuid not null,
  position smallint not null
    constraint association_team_entries_position_check check (position between 0 and 199),
  display_title text
    constraint association_team_entries_display_title_check
    check (display_title ~ '^[^[:cntrl:]]{1,60}$' and btrim(display_title) = display_title),
  hidden boolean not null default false,
  constraint association_team_entries_pkey primary key (organization_id, stage, membership_id),
  constraint association_team_entries_position_key unique (organization_id, stage, position),
  constraint association_team_entries_membership_fkey foreign key (membership_id, organization_id)
    references public.memberships (id, organization_id) on delete restrict
);

create index association_team_entries_membership_idx on public.association_team_entries (membership_id, organization_id);

-- What each member agrees to show. Default: officers appear by name and title
-- (a bureau is public); photo and bio only if they turn them on; anyone can
-- ask not to appear at all. Owned by the member, never by the managers.
create table public.membership_public_profiles (
  membership_id uuid primary key
    constraint membership_public_profiles_membership_id_fkey references public.memberships (id) on delete restrict,
  hidden boolean not null default false,
  show_photo boolean not null default false,
  bio text
    constraint membership_public_profiles_bio_check
    check (char_length(bio) between 1 and 280 and bio !~ '[[:cntrl:]]' and btrim(bio) = bio),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.membership_public_profiles
  for each row execute function private.set_updated_at();

-- ---- Slug history (old addresses redirect) -----------------------------------

create table public.organization_slug_history (
  slug text primary key
    constraint organization_slug_history_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  organization_id uuid not null
    constraint organization_slug_history_organization_id_fkey references public.organizations (id) on delete restrict,
  replaced_at timestamptz not null default now(),
  replaced_by uuid
    constraint organization_slug_history_replaced_by_fkey references auth.users (id) on delete set null
);

create index organization_slug_history_organization_id_idx on public.organization_slug_history (organization_id);
create index organization_slug_history_replaced_by_idx on public.organization_slug_history (replaced_by);

-- ---- Organizations: category and texts move to the profile ------------------

-- Every organization gets its page and its draft, now and when created.
create or replace function private.create_association_page()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.association_pages (organization_id) values (new.id);
  insert into public.association_profiles (organization_id, stage, name, short_name, accent, kind_label)
  values (new.id, 'draft', new.name, new.short_name, new.accent,
          case new.kind when 'bde' then 'Bureau des étudiants' else 'Association étudiante' end);
  return new;
end;
$$;

revoke all on function private.create_association_page() from public, anon, authenticated, service_role;

create trigger create_association_page
  after insert on public.organizations
  for each row execute function private.create_association_page();

insert into public.association_pages (organization_id)
select id from public.organizations;

insert into public.association_profiles (organization_id, stage, name, short_name, accent, kind_label, tagline, description, category_ids)
select o.id, 'draft', o.name, o.short_name, o.accent,
       case o.kind when 'bde' then 'Bureau des étudiants' else 'Association étudiante' end,
       case when o.tagline ~ '^[^[:cntrl:]]{2,140}$' then o.tagline end,
       case when char_length(o.description) >= 10 then o.description end,
       coalesce((select array[k.id] from public.association_categories k where k.slug = o.category), '{}')
  from public.organizations o;

alter table public.organizations drop constraint organizations_bde_category_check;
alter table public.organizations drop column category;
alter table public.organizations drop column tagline;
alter table public.organizations drop column description;

-- ---- Permissions -----------------------------------------------------------

update public.permissions
   set label = 'Modifier la page de l''asso',
       description = 'Préparer le brouillon de la page publique : textes, couleur, logo, couverture, galerie, équipe présentée.',
       module_ready = true
 where key = 'organization.settings.update';

update public.permissions
   set label = 'Gérer les images',
       description = 'Ajouter des images à la médiathèque de l''asso, et retirer celles qui ne servent plus.',
       module_ready = true
 where key = 'media.manage';

update public.permissions
   set description = 'Retirer temporairement une page d''asso qui pose problème, avec une raison, puis la rétablir.',
       module_ready = true
 where key = 'platform.content.moderate';

-- Publishing is its own right: a team member can prepare the page without
-- putting it online. Not delegable; the offices hold it (below).
insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values ('organization.page.publish', 'organization', 'settings', 'Publier la page',
        'Mettre en ligne la page publique de l''asso, la mettre à jour, la retirer ou changer son adresse.',
        true, false, false, true, 41);

-- The offices carry every organization key: add the new one to their
-- templates and to the office positions that already exist. Ordinary
-- templates and positions get nothing new automatically.
insert into public.position_template_permissions (template_key, permission_key)
select key, 'organization.page.publish' from public.position_templates where office is not null;

insert into public.position_permissions (position_id, permission_key)
select id, 'organization.page.publish' from public.positions where office is not null;

-- ---- Audit: new categories -------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog'));
alter table public.governance_audit_events drop constraint governance_audit_events_resource_type_check;
alter table public.governance_audit_events add constraint governance_audit_events_resource_type_check
  check (resource_type in ('organization', 'membership', 'position', 'assignment', 'invitation', 'delegation', 'transition',
                           'platform_assignment', 'association_page', 'association_profile', 'association_media',
                           'association_category'));

-- ---- Row level security ----------------------------------------------------------

alter table public.association_categories enable row level security;
alter table public.association_media enable row level security;
alter table public.association_pages enable row level security;
alter table public.association_profiles enable row level security;
alter table public.association_gallery_items enable row level security;
alter table public.association_team_entries enable row level security;
alter table public.membership_public_profiles enable row level security;
alter table public.organization_slug_history enable row level security;

revoke all on public.association_categories, public.association_media, public.association_pages,
  public.association_profiles, public.association_gallery_items, public.association_team_entries,
  public.membership_public_profiles, public.organization_slug_history
  from anon, authenticated;

-- Organizations where the caller works on the page (prepare, publish or
-- manage images), now. Granted to authenticated like the Phase 4 helpers.
create or replace function private.my_page_organization_ids()
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
          private.user_has_organization_permission((select auth.uid()), o.id, 'organization.settings.update', now())
       or private.user_has_organization_permission((select auth.uid()), o.id, 'organization.page.publish', now())
       or private.user_has_organization_permission((select auth.uid()), o.id, 'media.manage', now())
     );
$$;

revoke all on function private.my_page_organization_ids() from public, anon, authenticated, service_role;
grant execute on function private.my_page_organization_ids() to authenticated;

-- The catalog is public (active categories); BDE leadership also sees archived ones.
create policy association_categories_read_active
  on public.association_categories for select to anon, authenticated
  using (archived_at is null);
create policy association_categories_read_platform
  on public.association_categories for select to authenticated
  using ((select private.has_platform_permission('platform.organizations.manage')));

create policy association_media_read_page_team
  on public.association_media for select to authenticated
  using (organization_id in (select private.my_page_organization_ids()));

create policy association_pages_read_page_team
  on public.association_pages for select to authenticated
  using (organization_id in (select private.my_page_organization_ids()));
create policy association_pages_read_platform_governance
  on public.association_pages for select to authenticated
  using ((select private.has_platform_permission('platform.governance.view')));

create policy association_profiles_read_page_team
  on public.association_profiles for select to authenticated
  using (organization_id in (select private.my_page_organization_ids()));

create policy association_gallery_items_read_page_team
  on public.association_gallery_items for select to authenticated
  using (organization_id in (select private.my_page_organization_ids()));

create policy association_team_entries_read_page_team
  on public.association_team_entries for select to authenticated
  using (organization_id in (select private.my_page_organization_ids()));

create policy membership_public_profiles_read_own
  on public.membership_public_profiles for select to authenticated
  using (membership_id in (select m.id from public.memberships m where m.user_id = (select auth.uid())));
create policy membership_public_profiles_read_page_team
  on public.membership_public_profiles for select to authenticated
  using (membership_id in (
    select m.id from public.memberships m where m.organization_id in (select private.my_page_organization_ids())
  ));

-- A half-finished sign-in (MFA enrolled, aal1) reads nothing here, as everywhere.
create policy association_media_require_mfa_when_enrolled on public.association_media
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy association_pages_require_mfa_when_enrolled on public.association_pages
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy association_profiles_require_mfa_when_enrolled on public.association_profiles
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy association_gallery_items_require_mfa_when_enrolled on public.association_gallery_items
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy association_team_entries_require_mfa_when_enrolled on public.association_team_entries
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));
create policy membership_public_profiles_require_mfa_when_enrolled on public.membership_public_profiles
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.association_categories to anon, authenticated;
grant select on public.association_media, public.association_pages, public.association_profiles,
  public.association_gallery_items, public.association_team_entries, public.membership_public_profiles
  to authenticated;
-- organization_slug_history: functions only.
