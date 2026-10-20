-- Phase 5 · Association pages: the functions.
--
-- Same pattern as Phase 4: every write is a security definer function that
-- checks the caller's rights itself (Phase 4 keys, evaluated now), writes in
-- one transaction and records an audit event. Visitors read through
-- public_associations / public_association / public_association_categories,
-- which return only published, public fields of visible pages.
--
-- Keys used:
--   organization.settings.update   prepare the draft (texts, colour, images, gallery, team shown)
--   organization.page.publish      publish, unpublish, change the address (aal2 to publish)
--   media.manage                   upload images, remove unused ones
--   platform.content.moderate      BDE: withhold a page, release it (aal2, reason)
--   platform.organizations.manage  BDE: the category catalog (aal2)

-- ---- Internals ----------------------------------------------------------------

-- A page is public when its organization is active, it is published and the
-- BDE has not withheld it.
create or replace function private.association_page_is_public(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organizations o
      join public.association_pages pg on pg.organization_id = o.id
     where o.id = p_organization_id
       and o.status = 'active'
       and pg.status = 'published'
       and pg.withheld_at is null
  );
$$;

create or replace function private.media_json(p_media_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when m.id is null then null else jsonb_build_object(
    'id', m.id, 'path', m.object_path, 'width', m.width, 'height', m.height, 'alt', m.alt_text) end
    from (select 1) as one
    left join public.association_media m on m.id = p_media_id and m.removed_at is null;
$$;

-- The team as visitors see it, for one stage of the arrangement. Eligible:
-- active members holding a current position (the bureau). Shown unless the
-- member hid themselves or the arrangement hides them. Ordered by the
-- arrangement, then offices, then position order. Photo and bio only with
-- the member's own consent. Never an e-mail, never a status.
create or replace function private.team_payload(p_organization_id uuid, p_stage text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select m.id as membership_id,
           private.person_name(m.user_id) as name,
           (select string_agg(p.title, ' · ' order by a.office is null, p.sort_order, p.title)
              from public.position_assignments a
              join public.positions p on p.id = a.position_id
             where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at) as titles,
           exists (select 1 from public.position_assignments a
                    where a.membership_id = m.id and a.office is not null and a.status = 'active'
                      and a.starts_at <= now() and now() < a.ends_at) as is_office,
           (select min(p.sort_order)
              from public.position_assignments a
              join public.positions p on p.id = a.position_id
             where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at) as rank,
           coalesce(c.hidden, false) as member_hidden,
           coalesce(c.show_photo, false) and pr.avatar_path is not null as photo,
           c.bio
      from public.memberships m
      left join public.membership_public_profiles c on c.membership_id = m.id
      left join public.profiles pr on pr.id = m.user_id
     where m.organization_id = p_organization_id
       and m.status = 'active'
       and exists (select 1 from public.position_assignments a
                    where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'membership_id', e.membership_id,
           'name', e.name,
           'title', coalesce(t.display_title, e.titles),
           'bio', e.bio,
           'photo', e.photo)
         order by t.position is null, t.position, not e.is_office, e.rank, e.name), '[]'::jsonb)
    from eligible e
    left join public.association_team_entries t
      on t.organization_id = p_organization_id and t.stage = p_stage and t.membership_id = e.membership_id
   where not e.member_hidden
     and not coalesce(t.hidden, false);
$$;

-- An association's page in the public shape, from the draft (preview) or
-- the published rows. Identity: the draft's proposal, or organizations.
create or replace function private.association_payload(p_organization_id uuid, p_stage text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'slug', o.slug,
    'kind', o.kind,
    'name', case when p_stage = 'draft' then p.name else o.name end,
    'short_name', case when p_stage = 'draft' then p.short_name else o.short_name end,
    'accent', case when p_stage = 'draft' then p.accent else o.accent end,
    'kind_label', p.kind_label,
    'tagline', p.tagline,
    'description', p.description,
    'meeting_info', p.meeting_info,
    'pillars', p.pillars,
    'contact_email', p.contact_email,
    'social_links', p.social_links,
    'founded_year', p.founded_year,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', k.slug, 'label', k.label) order by array_position(p.category_ids, k.id))
        from public.association_categories k where k.id = any (p.category_ids)), '[]'::jsonb),
    'logo', private.media_json(p.logo_media_id),
    'cover', private.media_json(p.cover_media_id),
    'cover_focal', p.cover_focal,
    'gallery', coalesce((
      select jsonb_agg(jsonb_build_object('media', private.media_json(g.media_id), 'caption', g.caption) order by g.position)
        from public.association_gallery_items g
       where g.organization_id = o.id and g.stage = p_stage), '[]'::jsonb),
    'team', private.team_payload(o.id, p_stage),
    'first_published_at', pg.first_published_at,
    'published_at', pg.published_at
  )
    from public.organizations o
    join public.association_profiles p on p.organization_id = o.id and p.stage = p_stage
    join public.association_pages pg on pg.organization_id = o.id
   where o.id = p_organization_id;
$$;

revoke all on function private.association_page_is_public(uuid) from public, anon, authenticated, service_role;
revoke all on function private.media_json(uuid) from public, anon, authenticated, service_role;
revoke all on function private.team_payload(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.association_payload(uuid, text) from public, anon, authenticated, service_role;

-- Storage policies call these as the visitor (anon or authenticated): an
-- association image is readable when a public page uses it in its published
-- version; a portrait when its owner agreed and appears in a public page's
-- published team. Nothing else in "private" is open to anon.
create or replace function private.association_media_object_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.association_media m
     where m.object_path = p_name
       and m.removed_at is null
       and private.association_page_is_public(m.organization_id)
       and (
         exists (select 1 from public.association_profiles p
                  where p.organization_id = m.organization_id and p.stage = 'published'
                    and m.id in (p.logo_media_id, p.cover_media_id))
         or exists (select 1 from public.association_gallery_items g
                     where g.organization_id = m.organization_id and g.stage = 'published' and g.media_id = m.id)
       )
  );
$$;

create or replace function private.portrait_object_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles pr
      join public.memberships m on m.user_id = pr.id and m.status = 'active'
      join public.membership_public_profiles c on c.membership_id = m.id and c.show_photo and not c.hidden
     where pr.avatar_path = p_name
       and private.association_page_is_public(m.organization_id)
       and exists (select 1 from jsonb_array_elements(private.team_payload(m.organization_id, 'published')) as t
                    where (t ->> 'membership_id')::uuid = m.id and (t ->> 'photo')::boolean)
  );
$$;

revoke all on function private.association_media_object_is_public(text) from public, anon, authenticated, service_role;
revoke all on function private.portrait_object_is_public(text) from public, anon, authenticated, service_role;
grant usage on schema private to anon;
grant execute on function private.association_media_object_is_public(text) to anon, authenticated;
grant execute on function private.portrait_object_is_public(text) to anon, authenticated;

-- ---- Organizations: creation and the platform list, without the moved columns ----

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_category text default 'autre',
  p_accent text default 'rose',
  p_short_name text default null,
  p_tagline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_organization_id uuid;
  v_position_id uuid;
  v_category uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  -- An address that once belonged to another association keeps redirecting there.
  if exists (select 1 from public.organization_slug_history where slug = v_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  if p_category is not null then
    select id into v_category from public.association_categories where slug = p_category and archived_at is null;
    if v_category is null then
      raise exception 'category_invalid' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.organizations (slug, name, short_name, kind, accent, status, created_by)
    values (v_slug, btrim(p_name), nullif(btrim(p_short_name), ''), 'association', coalesce(p_accent, 'rose'), 'setup', v_actor)
    returning id into v_organization_id;
  exception
    when unique_violation then
      raise exception 'slug_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'organization_invalid' using errcode = 'P0001';
  end;

  -- The page and its draft were created by the trigger; prefill what the BDE gave.
  begin
    update public.association_profiles
       set category_ids = case when v_category is null then '{}' else array[v_category] end,
           tagline = nullif(btrim(p_tagline), '')
     where organization_id = v_organization_id and stage = 'draft';
  exception
    when check_violation then
      raise exception 'organization_invalid' using errcode = 'P0001';
  end;

  insert into public.positions (organization_id, title, office, template_key, sort_order, created_by)
  select v_organization_id, t.label, t.office, t.key, t.sort_order, v_actor
    from public.position_templates t
   where t.key = 'association_president'
  returning id into v_position_id;

  insert into public.position_permissions (position_id, permission_key)
  select v_position_id, tp.permission_key
    from public.position_template_permissions tp
   where tp.template_key = 'association_president';

  perform private.log_governance_event(
    v_actor, 'bde', 'organization_created', 'organization', v_organization_id, null, 'organization', v_organization_id,
    jsonb_build_object('name', btrim(p_name), 'slug', v_slug)
  );
  return v_organization_id;
end;
$$;

create or replace function public.platform_organizations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.governance.view');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'kind', o.kind,
             'accent', o.accent, 'status', o.status, 'status_reason', o.status_reason,
             'created_at', o.created_at, 'archived_at', o.archived_at,
             'page', jsonb_build_object(
               'status', pg.status, 'published_at', pg.published_at, 'withheld_at', pg.withheld_at,
               'withheld_reason', pg.withheld_reason, 'is_public', private.association_page_is_public(o.id)),
             'president', (
               select jsonb_build_object('name', private.person_name(a.user_id), 'ends_at', a.ends_at, 'assignment_id', a.id)
                 from public.position_assignments a
                 join public.memberships m on m.id = a.membership_id
                where a.organization_id = o.id and a.office = 'association_president' and a.status = 'active'
                  and a.starts_at <= now() and now() < a.ends_at and m.status = 'active'
                limit 1),
             'members', (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
             'open_transition', (
               select t.kind from public.leadership_transitions t
                where t.organization_id = o.id and t.status = 'open' and t.expires_at > now() limit 1))
           order by o.kind = 'bde' desc, o.status = 'archived', o.name)
      from public.organizations o
      join public.association_pages pg on pg.organization_id = o.id
  ), '[]'::jsonb);
end;
$$;

-- ---- The draft ------------------------------------------------------------------

-- Saves some fields of the draft. p_patch: the new values; p_base: the values
-- the editor loaded. A field is refused only if someone else changed it in
-- the meantime (and to something else): two people editing different parts
-- never overwrite each other. Returns the new draft revision.
create or replace function public.save_association_draft(p_organization_id uuid, p_base jsonb, p_patch jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_allowed constant text[] := array['name', 'short_name', 'accent', 'kind_label', 'tagline', 'description',
    'meeting_info', 'pillars', 'contact_email', 'social_links', 'founded_year', 'category_ids',
    'logo_media_id', 'cover_media_id', 'cover_focal'];
  v_draft public.association_profiles%rowtype;
  v_new public.association_profiles%rowtype;
  v_current jsonb;
  v_key text;
  v_changed text[] := '{}';
  v_conflicts text[] := '{}';
  v_constraint text;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'organization.settings.update');
  if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(coalesce(p_base, '{}'::jsonb)) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) as k where k <> all (v_allowed)) then
    raise exception 'profile_invalid' using errcode = 'P0001';
  end if;

  select * into v_draft
    from public.association_profiles
   where organization_id = p_organization_id and stage = 'draft'
   for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;

  v_current := to_jsonb(v_draft);
  for v_key in select jsonb_object_keys(p_patch) loop
    if (v_current -> v_key) is distinct from (p_patch -> v_key) then
      if (v_current -> v_key) is distinct from coalesce(p_base -> v_key, 'null'::jsonb) then
        v_conflicts := v_conflicts || v_key;
      else
        v_changed := v_changed || v_key;
      end if;
    end if;
  end loop;
  if cardinality(v_conflicts) > 0 then
    raise exception 'draft_conflict' using errcode = 'P0001', detail = array_to_string(v_conflicts, ',');
  end if;
  if cardinality(v_changed) = 0 then
    return v_draft.revision;
  end if;

  begin
    v_new := jsonb_populate_record(v_draft, p_patch);
    update public.association_profiles
       set name = v_new.name,
           short_name = v_new.short_name,
           accent = v_new.accent,
           kind_label = v_new.kind_label,
           tagline = v_new.tagline,
           description = v_new.description,
           meeting_info = v_new.meeting_info,
           pillars = coalesce(v_new.pillars, '[]'::jsonb),
           contact_email = v_new.contact_email,
           social_links = coalesce(v_new.social_links, '[]'::jsonb),
           founded_year = v_new.founded_year,
           category_ids = coalesce(v_new.category_ids, '{}'),
           logo_media_id = v_new.logo_media_id,
           cover_media_id = v_new.cover_media_id,
           cover_focal = v_new.cover_focal,
           revision = v_draft.revision + 1,
           updated_at = now(),
           updated_by = v_actor
     where organization_id = p_organization_id and stage = 'draft';
  exception
    when check_violation or not_null_violation or foreign_key_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'profile_invalid' using errcode = 'P0001', detail = coalesce(v_constraint, '');
    when invalid_text_representation or numeric_value_out_of_range or datatype_mismatch
         or invalid_parameter_value or string_data_right_truncation then
      raise exception 'profile_invalid' using errcode = 'P0001';
  end;

  -- Images must be this association's, still in its library.
  if exists (
    select 1 from unnest(array[v_new.logo_media_id, v_new.cover_media_id]) as x(id)
     where x.id is not null
       and not exists (select 1 from public.association_media m
                        where m.id = x.id and m.organization_id = p_organization_id and m.removed_at is null)
  ) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'organization.settings.update'),
    'association_profile_updated', 'profile', p_organization_id, null, 'association_profile', p_organization_id,
    jsonb_build_object('fields', to_jsonb(v_changed), 'revision', v_draft.revision + 1)
  );
  return v_draft.revision + 1;
end;
$$;

-- The gallery of the draft, replaced as a whole (order = array order).
-- p_items / p_base: [{ "media_id": uuid, "caption": text|null }].
create or replace function public.set_association_gallery(p_organization_id uuid, p_items jsonb, p_base jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_current jsonb;
  v_revision integer;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'organization.settings.update');
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 24 then
    raise exception 'gallery_invalid' using errcode = 'P0001';
  end if;
  select revision into v_revision from public.association_profiles
   where organization_id = p_organization_id and stage = 'draft' for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;

  v_current := coalesce((
    select jsonb_agg(jsonb_build_object('media_id', g.media_id, 'caption', g.caption) order by g.position)
      from public.association_gallery_items g
     where g.organization_id = p_organization_id and g.stage = 'draft'), '[]'::jsonb);
  if v_current = p_items then
    return v_revision;
  end if;
  if v_current is distinct from coalesce(p_base, '[]'::jsonb) then
    raise exception 'draft_conflict' using errcode = 'P0001', detail = 'gallery';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e
     where jsonb_typeof(e) <> 'object'
        or not exists (select 1 from public.association_media m
                        where m.id::text = e ->> 'media_id' and m.organization_id = p_organization_id and m.removed_at is null)
  ) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;

  delete from public.association_gallery_items where organization_id = p_organization_id and stage = 'draft';
  begin
    insert into public.association_gallery_items (organization_id, stage, position, media_id, caption)
    select p_organization_id, 'draft', (e.ordinality - 1)::smallint, (e.value ->> 'media_id')::uuid,
           nullif(btrim(e.value ->> 'caption'), '')
      from jsonb_array_elements(p_items) with ordinality as e;
  exception
    when unique_violation or check_violation then
      raise exception 'gallery_invalid' using errcode = 'P0001';
  end;
  update public.association_profiles
     set revision = revision + 1, updated_at = now(), updated_by = v_actor
   where organization_id = p_organization_id and stage = 'draft';

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'organization.settings.update'),
    'association_gallery_updated', 'profile', p_organization_id, null, 'association_profile', p_organization_id,
    jsonb_build_object('images', jsonb_array_length(p_items), 'revision', v_revision + 1)
  );
  return v_revision + 1;
end;
$$;

-- The public team arrangement of the draft, replaced as a whole.
-- p_entries / p_base: [{ "membership_id": uuid, "display_title": text|null, "hidden": bool }].
-- It decides what visitors read, never who may do what.
create or replace function public.set_association_team_presentation(p_organization_id uuid, p_entries jsonb, p_base jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_current jsonb;
  v_revision integer;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'organization.settings.update');
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) > 200 then
    raise exception 'team_invalid' using errcode = 'P0001';
  end if;
  select revision into v_revision from public.association_profiles
   where organization_id = p_organization_id and stage = 'draft' for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;

  v_current := coalesce((
    select jsonb_agg(jsonb_build_object('membership_id', t.membership_id, 'display_title', t.display_title, 'hidden', t.hidden)
                     order by t.position)
      from public.association_team_entries t
     where t.organization_id = p_organization_id and t.stage = 'draft'), '[]'::jsonb);
  if v_current = p_entries then
    return v_revision;
  end if;
  if v_current is distinct from coalesce(p_base, '[]'::jsonb) then
    raise exception 'draft_conflict' using errcode = 'P0001', detail = 'team';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as e
     where jsonb_typeof(e) <> 'object'
        or not exists (select 1 from public.memberships m
                        where m.id::text = e ->> 'membership_id' and m.organization_id = p_organization_id
                          and m.status <> 'ended')
  ) then
    raise exception 'membership_not_found' using errcode = 'P0001';
  end if;

  delete from public.association_team_entries where organization_id = p_organization_id and stage = 'draft';
  begin
    insert into public.association_team_entries (organization_id, stage, membership_id, position, display_title, hidden)
    select p_organization_id, 'draft', (e.value ->> 'membership_id')::uuid, (e.ordinality - 1)::smallint,
           nullif(btrim(e.value ->> 'display_title'), ''), coalesce((e.value ->> 'hidden')::boolean, false)
      from jsonb_array_elements(p_entries) with ordinality as e;
  exception
    when unique_violation or check_violation or invalid_text_representation then
      raise exception 'team_invalid' using errcode = 'P0001';
  end;
  update public.association_profiles
     set revision = revision + 1, updated_at = now(), updated_by = v_actor
   where organization_id = p_organization_id and stage = 'draft';

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'organization.settings.update'),
    'association_public_team_updated', 'profile', p_organization_id, null, 'association_profile', p_organization_id,
    jsonb_build_object('entries', jsonb_array_length(p_entries), 'revision', v_revision + 1)
  );
  return v_revision + 1;
end;
$$;

-- ---- Publishing ------------------------------------------------------------------

-- Publishes the draft as it was previewed (p_expected_revision), all of it
-- in one transaction: identity, texts, images, gallery, team arrangement.
create or replace function public.publish_association_page(p_organization_id uuid, p_expected_revision integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_page public.association_pages%rowtype;
  v_draft public.association_profiles%rowtype;
  v_missing text[];
  v_first boolean;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'organization.page.publish');
  perform private.require_aal2();
  select * into v_org from public.organizations where id = p_organization_id;
  select * into v_page from public.association_pages where organization_id = p_organization_id for update;
  if v_page.withheld_at is not null then
    raise exception 'page_withheld' using errcode = 'P0001';
  end if;
  select * into v_draft from public.association_profiles
   where organization_id = p_organization_id and stage = 'draft' for update;
  if v_draft.revision is distinct from p_expected_revision then
    raise exception 'draft_changed' using errcode = 'P0001';
  end if;

  -- Required to publish: a line and a presentation; for an association, a category.
  v_missing := array_remove(array[
    case when v_draft.tagline is null then 'tagline' end,
    case when v_draft.description is null then 'description' end,
    case when v_org.kind = 'association' and cardinality(v_draft.category_ids) = 0 then 'category_ids' end
  ], null);
  if cardinality(v_missing) > 0 then
    raise exception 'page_incomplete' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
  end if;
  if exists (
    select 1 from public.association_media m
     where m.organization_id = p_organization_id and m.removed_at is not null
       and (m.id in (v_draft.logo_media_id, v_draft.cover_media_id)
            or m.id in (select g.media_id from public.association_gallery_items g
                         where g.organization_id = p_organization_id and g.stage = 'draft'))
  ) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;

  update public.organizations
     set name = v_draft.name, short_name = v_draft.short_name, accent = v_draft.accent
   where id = p_organization_id;

  insert into public.association_profiles as p (
    organization_id, stage, kind_label, tagline, description, meeting_info, pillars, contact_email, social_links,
    founded_year, category_ids, logo_media_id, cover_media_id, cover_focal, revision, updated_at, updated_by)
  values (
    p_organization_id, 'published', v_draft.kind_label, v_draft.tagline, v_draft.description, v_draft.meeting_info,
    v_draft.pillars, v_draft.contact_email, v_draft.social_links, v_draft.founded_year, v_draft.category_ids,
    v_draft.logo_media_id, v_draft.cover_media_id, v_draft.cover_focal, v_draft.revision, now(), v_actor)
  on conflict (organization_id, stage) do update
    set kind_label = excluded.kind_label, tagline = excluded.tagline, description = excluded.description,
        meeting_info = excluded.meeting_info, pillars = excluded.pillars, contact_email = excluded.contact_email,
        social_links = excluded.social_links, founded_year = excluded.founded_year, category_ids = excluded.category_ids,
        logo_media_id = excluded.logo_media_id, cover_media_id = excluded.cover_media_id,
        cover_focal = excluded.cover_focal, revision = excluded.revision, updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  delete from public.association_gallery_items where organization_id = p_organization_id and stage = 'published';
  insert into public.association_gallery_items (organization_id, stage, position, media_id, caption)
  select organization_id, 'published', position, media_id, caption
    from public.association_gallery_items where organization_id = p_organization_id and stage = 'draft';

  delete from public.association_team_entries where organization_id = p_organization_id and stage = 'published';
  insert into public.association_team_entries (organization_id, stage, membership_id, position, display_title, hidden)
  select organization_id, 'published', membership_id, position, display_title, hidden
    from public.association_team_entries where organization_id = p_organization_id and stage = 'draft';

  v_first := v_page.first_published_at is null;
  update public.association_pages
     set status = 'published', published_revision = v_draft.revision,
         first_published_at = coalesce(first_published_at, now()), published_at = now(), published_by = v_actor,
         unpublished_at = null
   where organization_id = p_organization_id;

  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'organization.page.publish'),
    'association_page_published', 'profile', p_organization_id, null, 'association_page', p_organization_id,
    jsonb_build_object('revision', v_draft.revision, 'first', v_first)
  );
  return 'published';
end;
$$;

-- Takes the page offline (its team). The published version is kept and comes
-- back with the next publication.
create or replace function public.unpublish_association_page(p_organization_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_status text;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'organization.page.publish');
  select status into v_status from public.association_pages where organization_id = p_organization_id for update;
  if v_status is distinct from 'published' then
    raise exception 'page_not_published' using errcode = 'P0001';
  end if;
  update public.association_pages set status = 'unpublished', unpublished_at = now()
   where organization_id = p_organization_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'organization.page.publish'),
    'association_page_unpublished', 'profile', p_organization_id, null, 'association_page', p_organization_id,
    '{}'::jsonb, nullif(btrim(p_reason), '')
  );
end;
$$;

-- BDE moderation: hides a page that breaks the rules, with a reason, until
-- released. Gives no access to the association's drafts or private data.
create or replace function public.withhold_association_page(p_organization_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  if not exists (select 1 from public.organizations where id = p_organization_id and kind = 'association') then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  update public.association_pages
     set withheld_at = now(), withheld_by = v_actor, withheld_reason = v_reason
   where organization_id = p_organization_id and withheld_at is null;
  if not found then
    raise exception 'page_withheld' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'association_page_withheld', 'profile', p_organization_id, null, 'association_page',
    p_organization_id, '{}'::jsonb, v_reason
  );
end;
$$;

create or replace function public.release_association_page(p_organization_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  update public.association_pages
     set withheld_at = null, withheld_by = null, withheld_reason = null
   where organization_id = p_organization_id and withheld_at is not null;
  if not found then
    raise exception 'page_not_withheld' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'association_page_released', 'profile', p_organization_id, null, 'association_page',
    p_organization_id, '{}'::jsonb, v_reason
  );
end;
$$;

-- Changes the page's address. The old one keeps redirecting, forever, and can
-- never be taken by another association.
create or replace function public.change_organization_slug(p_organization_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_old text;
begin
  if not (private.user_has_organization_permission(v_actor, p_organization_id, 'organization.page.publish', now())
          or private.user_has_platform_permission(v_actor, 'platform.organizations.manage', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.require_aal2();
  select slug into v_old from public.organizations where id = p_organization_id and kind = 'association' for update;
  if v_old is null then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  if v_slug = v_old then
    return v_slug;
  end if;
  if exists (select 1 from public.organization_slug_history where slug = v_slug and organization_id <> p_organization_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  delete from public.organization_slug_history where slug = v_slug and organization_id = p_organization_id;
  begin
    update public.organizations set slug = v_slug where id = p_organization_id;
  exception
    when unique_violation then
      raise exception 'slug_taken' using errcode = 'P0001';
    when check_violation then
      raise exception 'slug_invalid' using errcode = 'P0001';
  end;
  insert into public.organization_slug_history (slug, organization_id, replaced_by) values (v_old, p_organization_id, v_actor);
  perform private.log_governance_event(
    v_actor, case when private.user_has_organization_permission(v_actor, p_organization_id, 'organization.page.publish', now())
                  then private.authority_for(v_actor, p_organization_id, 'organization.page.publish') else 'bde' end,
    'organization_slug_changed', 'profile', p_organization_id, null, 'organization', p_organization_id,
    jsonb_build_object('from', v_old, 'to', v_slug)
  );
  return v_slug;
end;
$$;

-- ---- Media ------------------------------------------------------------------------

-- Records an image the server just stored at "<organization>/<id>.webp" in
-- the private bucket (the Storage policy already checked media.manage).
create or replace function public.register_association_media(
  p_organization_id uuid,
  p_media_id uuid,
  p_kind text,
  p_width integer,
  p_height integer,
  p_bytes integer,
  p_alt_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_path text := p_organization_id::text || '/' || p_media_id::text || '.webp';
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'media.manage');
  if not exists (select 1 from storage.objects where bucket_id = 'association-media' and name = v_path) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.association_media where organization_id = p_organization_id and removed_at is null) >= 300 then
    raise exception 'media_quota' using errcode = 'P0001';
  end if;
  begin
    insert into public.association_media (id, organization_id, object_path, kind, width, height, bytes, alt_text, created_by)
    values (p_media_id, p_organization_id, v_path, p_kind, p_width, p_height, p_bytes, nullif(btrim(p_alt_text), ''), v_actor);
  exception
    when unique_violation then
      raise exception 'media_invalid' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'media_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'media.manage'), 'association_media_uploaded', 'media',
    p_organization_id, null, 'association_media', p_media_id,
    jsonb_build_object('kind', p_kind, 'width', p_width, 'height', p_height, 'bytes', p_bytes)
  );
  return p_media_id;
end;
$$;

create or replace function public.update_association_media(p_media_id uuid, p_alt_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.association_media where id = p_media_id and removed_at is null;
  if v_organization_id is null then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  if not (private.user_has_organization_permission(v_actor, v_organization_id, 'media.manage', now())
          or private.user_has_organization_permission(v_actor, v_organization_id, 'organization.settings.update', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  begin
    update public.association_media set alt_text = nullif(btrim(p_alt_text), '') where id = p_media_id;
  exception
    when check_violation then
      raise exception 'media_invalid' using errcode = 'P0001';
  end;
end;
$$;

-- Takes an image out of the library when nothing uses it (draft or published).
-- Returns the object path; the server then deletes the file.
create or replace function public.remove_association_media(p_media_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_media public.association_media%rowtype;
begin
  select * into v_media from public.association_media where id = p_media_id and removed_at is null for update;
  if not found then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_media.organization_id, 'media.manage');
  if exists (select 1 from public.association_profiles p
              where p.organization_id = v_media.organization_id and v_media.id in (p.logo_media_id, p.cover_media_id))
     or exists (select 1 from public.association_gallery_items g
                 where g.organization_id = v_media.organization_id and g.media_id = v_media.id) then
    raise exception 'media_in_use' using errcode = 'P0001';
  end if;
  update public.association_media set removed_at = now(), removed_by = v_actor where id = p_media_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_media.organization_id, 'media.manage'), 'association_media_removed', 'media',
    v_media.organization_id, null, 'association_media', p_media_id, jsonb_build_object('kind', v_media.kind)
  );
  return v_media.object_path;
end;
$$;

-- ---- Each member's public presentation (their own consent) --------------------------

create or replace function public.set_my_public_team_profile(
  p_membership_id uuid,
  p_hidden boolean,
  p_show_photo boolean,
  p_bio text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
    from public.memberships where id = p_membership_id and user_id = v_actor and status <> 'ended';
  if v_organization_id is null then
    raise exception 'membership_not_found' using errcode = 'P0001';
  end if;
  begin
    insert into public.membership_public_profiles (membership_id, hidden, show_photo, bio)
    values (p_membership_id, coalesce(p_hidden, false), coalesce(p_show_photo, false), nullif(btrim(p_bio), ''))
    on conflict (membership_id) do update
      set hidden = excluded.hidden, show_photo = excluded.show_photo, bio = excluded.bio;
  exception
    when check_violation then
      raise exception 'profile_invalid' using errcode = 'P0001', detail = 'membership_public_profiles_bio_check';
  end;
  perform private.log_governance_event(
    v_actor, 'self', 'public_team_profile_updated', 'profile', v_organization_id, v_actor, 'membership', p_membership_id,
    jsonb_build_object('hidden', coalesce(p_hidden, false), 'show_photo', coalesce(p_show_photo, false),
                       'bio', nullif(btrim(p_bio), '') is not null)
  );
end;
$$;

-- ---- Invitations: give a pending one 14 more days ------------------------------------

create or replace function public.renew_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_invitation public.organization_invitations%rowtype;
begin
  select * into v_invitation from public.organization_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_invitation.organization_id, 'members.invite');
  if v_invitation.status <> 'pending' then
    raise exception 'invitation_not_pending' using errcode = 'P0001';
  end if;
  if v_invitation.mandate_ends_at is not null and v_invitation.mandate_ends_at <= now() + interval '14 days' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  update public.organization_invitations set expires_at = now() + interval '14 days' where id = p_invitation_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_invitation.organization_id, 'members.invite'), 'invitation_renewed', 'team',
    v_invitation.organization_id, null, 'invitation', p_invitation_id, '{}'::jsonb
  );
end;
$$;

-- ---- The category catalog (BDE leadership) ---------------------------------------------

create or replace function public.create_association_category(p_slug text, p_label text, p_sort_order integer default 100)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  begin
    insert into public.association_categories (slug, label, sort_order, created_by)
    values (lower(btrim(p_slug)), btrim(p_label), coalesce(p_sort_order, 100), v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde', 'association_category_created', 'catalog', null, null, 'association_category', v_id,
    jsonb_build_object('slug', lower(btrim(p_slug)), 'label', btrim(p_label))
  );
  return v_id;
end;
$$;

create or replace function public.update_association_category(
  p_category_id uuid,
  p_label text,
  p_sort_order integer,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.association_categories%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  select * into v_old from public.association_categories where id = p_category_id for update;
  if not found then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  begin
    update public.association_categories
       set label = btrim(p_label),
           sort_order = coalesce(p_sort_order, sort_order),
           archived_at = case when p_archived then coalesce(archived_at, now()) else null end
     where id = p_category_id;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde',
    case when p_archived and v_old.archived_at is null then 'association_category_archived'
         when not p_archived and v_old.archived_at is not null then 'association_category_restored'
         else 'association_category_updated' end,
    'catalog', null, null, 'association_category', p_category_id,
    jsonb_build_object('label', btrim(p_label), 'previous_label', v_old.label)
  );
end;
$$;

-- ---- Reads: the editor -------------------------------------------------------------------

-- Everything the page editor needs, for those who work on the page.
create or replace function public.association_editor(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_edit boolean;
  v_publish boolean;
  v_media boolean;
begin
  v_edit := private.user_has_organization_permission(v_actor, p_organization_id, 'organization.settings.update', now());
  v_publish := private.user_has_organization_permission(v_actor, p_organization_id, 'organization.page.publish', now());
  v_media := private.user_has_organization_permission(v_actor, p_organization_id, 'media.manage', now());
  if not (v_edit or v_publish or v_media) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                         'kind', o.kind, 'status', o.status, 'accent', o.accent),
      'page', jsonb_build_object(
        'status', pg.status, 'published_revision', pg.published_revision, 'first_published_at', pg.first_published_at,
        'published_at', pg.published_at,
        'published_by_name', case when pg.published_by is null then null else private.person_name(pg.published_by) end,
        'unpublished_at', pg.unpublished_at, 'withheld_at', pg.withheld_at, 'withheld_reason', pg.withheld_reason,
        'is_public', private.association_page_is_public(o.id)),
      'draft', to_jsonb(d) - 'organization_id' - 'stage' || jsonb_build_object(
        'updated_by_name', case when d.updated_by is null then null else private.person_name(d.updated_by) end),
      'published', (select to_jsonb(p) - 'organization_id' - 'stage' from public.association_profiles p
                     where p.organization_id = o.id and p.stage = 'published'),
      'gallery', coalesce((
        select jsonb_agg(jsonb_build_object('media_id', g.media_id, 'caption', g.caption) order by g.position)
          from public.association_gallery_items g where g.organization_id = o.id and g.stage = 'draft'), '[]'::jsonb),
      'team_entries', coalesce((
        select jsonb_agg(jsonb_build_object('membership_id', t.membership_id, 'display_title', t.display_title,
                                            'hidden', t.hidden) order by t.position)
          from public.association_team_entries t where t.organization_id = o.id and t.stage = 'draft'), '[]'::jsonb),
      'team_members', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'membership_id', m.id,
                 'name', private.person_name(m.user_id),
                 'titles', (select string_agg(p.title, ' · ' order by a.office is null, p.sort_order, p.title)
                              from public.position_assignments a join public.positions p on p.id = a.position_id
                             where a.membership_id = m.id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at),
                 'is_office', exists (select 1 from public.position_assignments a
                                       where a.membership_id = m.id and a.office is not null and a.status = 'active'
                                         and a.starts_at <= now() and now() < a.ends_at),
                 'eligible', exists (select 1 from public.position_assignments a
                                      where a.membership_id = m.id and a.status = 'active'
                                        and a.starts_at <= now() and now() < a.ends_at),
                 'member_hidden', coalesce(c.hidden, false),
                 'show_photo', coalesce(c.show_photo, false),
                 'has_bio', c.bio is not null,
                 'is_you', m.user_id = v_actor)
               order by private.person_name(m.user_id))
          from public.memberships m
          left join public.membership_public_profiles c on c.membership_id = m.id
         where m.organization_id = o.id and m.status = 'active'), '[]'::jsonb),
      'media', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'path', m.object_path, 'kind', m.kind, 'width', m.width, 'height', m.height,
                 'bytes', m.bytes, 'alt', m.alt_text, 'created_at', m.created_at,
                 'uses', array_remove(array[
                   case when m.id = d.logo_media_id then 'logo_draft' end,
                   case when m.id = d.cover_media_id then 'cover_draft' end,
                   case when exists (select 1 from public.association_profiles p
                                      where p.organization_id = o.id and p.stage = 'published' and p.logo_media_id = m.id)
                        then 'logo_published' end,
                   case when exists (select 1 from public.association_profiles p
                                      where p.organization_id = o.id and p.stage = 'published' and p.cover_media_id = m.id)
                        then 'cover_published' end,
                   case when exists (select 1 from public.association_gallery_items g
                                      where g.organization_id = o.id and g.stage = 'draft' and g.media_id = m.id)
                        then 'gallery_draft' end,
                   case when exists (select 1 from public.association_gallery_items g
                                      where g.organization_id = o.id and g.stage = 'published' and g.media_id = m.id)
                        then 'gallery_published' end
                 ], null))
               order by m.created_at desc)
          from public.association_media m
         where m.organization_id = o.id and m.removed_at is null), '[]'::jsonb),
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'slug', k.slug, 'label', k.label, 'archived', k.archived_at is not null)
                         order by k.sort_order, k.label)
          from public.association_categories k
         where k.archived_at is null or k.id = any (d.category_ids)), '[]'::jsonb),
      'can', jsonb_build_object('edit', v_edit, 'publish', v_publish, 'media', v_media)
    )
      from public.organizations o
      join public.association_pages pg on pg.organization_id = o.id
      join public.association_profiles d on d.organization_id = o.id and d.stage = 'draft'
     where o.id = p_organization_id
  );
end;
$$;

-- The draft in the public shape, for the preview (never public).
create or replace function public.association_preview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not (private.user_has_organization_permission(v_actor, p_organization_id, 'organization.settings.update', now())
          or private.user_has_organization_permission(v_actor, p_organization_id, 'organization.page.publish', now())
          or private.user_has_organization_permission(v_actor, p_organization_id, 'media.manage', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return private.association_payload(p_organization_id, 'draft')
      || jsonb_build_object('revision', (select revision from public.association_profiles
                                          where organization_id = p_organization_id and stage = 'draft'));
end;
$$;

-- ---- Reads: visitors -----------------------------------------------------------------------

-- Every public page, for the directory and search. Published fields only.
create or replace function public.public_associations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.association_payload(o.id, 'published') - 'team' - 'gallery'
                            order by o.kind = 'bde' desc, o.name), '[]'::jsonb)
    from public.organizations o
   where private.association_page_is_public(o.id);
$$;

-- One page by its address. States: ok, moved (old address), archived,
-- unavailable (exists but not public: nothing more is said), not_found.
create or replace function public.public_association(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
  v_new_slug text;
begin
  select * into v_org from public.organizations where slug = lower(p_slug);
  if not found then
    select o.slug into v_new_slug
      from public.organization_slug_history h join public.organizations o on o.id = h.organization_id
     where h.slug = lower(p_slug);
    if v_new_slug is not null then
      return jsonb_build_object('state', 'moved', 'slug', v_new_slug);
    end if;
    return jsonb_build_object('state', 'not_found');
  end if;
  if v_org.status = 'archived' then
    return jsonb_build_object('state', 'archived', 'name', v_org.name);
  end if;
  if not private.association_page_is_public(v_org.id) then
    return jsonb_build_object('state', 'unavailable');
  end if;
  return jsonb_build_object('state', 'ok', 'association', private.association_payload(v_org.id, 'published'));
end;
$$;

-- Active categories with how many public pages use each (for the filters).
create or replace function public.public_association_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', k.slug, 'label', k.label, 'count', (
           select count(*) from public.association_profiles p
            where p.stage = 'published' and k.id = any (p.category_ids)
              and private.association_page_is_public(p.organization_id)))
         order by k.sort_order, k.label), '[]'::jsonb)
    from public.association_categories k
   where k.archived_at is null;
$$;

-- The avatar file of a member shown with a photo on a public page, or null.
create or replace function public.public_portrait_path(p_membership_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.avatar_path
    from public.memberships m
    join public.profiles pr on pr.id = m.user_id
   where m.id = p_membership_id
     and pr.avatar_path is not null
     and private.portrait_object_is_public(pr.avatar_path);
$$;

-- ---- Privileges ----------------------------------------------------------------------------

revoke all on function public.create_organization(text, text, text, text, text, text) from public, anon;
revoke all on function public.platform_organizations() from public, anon;
revoke all on function public.save_association_draft(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.set_association_gallery(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.set_association_team_presentation(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.publish_association_page(uuid, integer) from public, anon;
revoke all on function public.unpublish_association_page(uuid, text) from public, anon;
revoke all on function public.withhold_association_page(uuid, text) from public, anon;
revoke all on function public.release_association_page(uuid, text) from public, anon;
revoke all on function public.change_organization_slug(uuid, text) from public, anon;
revoke all on function public.register_association_media(uuid, uuid, text, integer, integer, integer, text) from public, anon;
revoke all on function public.update_association_media(uuid, text) from public, anon;
revoke all on function public.remove_association_media(uuid) from public, anon;
revoke all on function public.set_my_public_team_profile(uuid, boolean, boolean, text) from public, anon;
revoke all on function public.renew_invitation(uuid) from public, anon;
revoke all on function public.create_association_category(text, text, integer) from public, anon;
revoke all on function public.update_association_category(uuid, text, integer, boolean) from public, anon;
revoke all on function public.association_editor(uuid) from public, anon;
revoke all on function public.association_preview(uuid) from public, anon;
revoke all on function public.public_associations() from public;
revoke all on function public.public_association(text) from public;
revoke all on function public.public_association_categories() from public;
revoke all on function public.public_portrait_path(uuid) from public;

grant execute on function public.create_organization(text, text, text, text, text, text) to authenticated;
grant execute on function public.platform_organizations() to authenticated;
grant execute on function public.save_association_draft(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.set_association_gallery(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.set_association_team_presentation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.publish_association_page(uuid, integer) to authenticated;
grant execute on function public.unpublish_association_page(uuid, text) to authenticated;
grant execute on function public.withhold_association_page(uuid, text) to authenticated;
grant execute on function public.release_association_page(uuid, text) to authenticated;
grant execute on function public.change_organization_slug(uuid, text) to authenticated;
grant execute on function public.register_association_media(uuid, uuid, text, integer, integer, integer, text) to authenticated;
grant execute on function public.update_association_media(uuid, text) to authenticated;
grant execute on function public.remove_association_media(uuid) to authenticated;
grant execute on function public.set_my_public_team_profile(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.renew_invitation(uuid) to authenticated;
grant execute on function public.create_association_category(text, text, integer) to authenticated;
grant execute on function public.update_association_category(uuid, text, integer, boolean) to authenticated;
grant execute on function public.association_editor(uuid) to authenticated;
grant execute on function public.association_preview(uuid) to authenticated;
grant execute on function public.public_associations() to anon, authenticated;
grant execute on function public.public_association(text) to anon, authenticated;
grant execute on function public.public_association_categories() to anon, authenticated;
grant execute on function public.public_portrait_path(uuid) to anon, authenticated;
