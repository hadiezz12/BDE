-- Phase 6 · Publishing functions.
--
-- Each public function identifies the caller (private.require_actor), checks
-- the caller's right in the post's own organization right now (never a flag
-- from the client), writes in one transaction and audits. Keys:
--   posts.create    start an article; edit, submit and delete one's own drafts
--   posts.edit      the same on every article of the association, restore versions
--   posts.approve   approve a submitted revision or request changes (never one's own)
--   posts.publish   publish, schedule, unpublish, archive, pin (second factor to put online)
--   posts.settings  the association's editorial policy (second factor)
--   platform.content.moderate  BDE: reports, hide and restore (second factor)
--   platform.content.feature   BDE: featured stories, important BDE announcements (second factor)
-- Audit actions double as the events the notification phase will listen to
-- (post_submitted, post_approved, post_changes_requested, post_published,
-- post_schedule_failed, post_hidden…).

-- ---- Internals ----------------------------------------------------------------------

-- A post's content as a comparable value (for hashes and copies).
create or replace function private.post_content(p_revision public.post_revisions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_revision.kind, 'title', p_revision.title, 'intro', p_revision.intro, 'body', p_revision.body,
    'cover_media_id', p_revision.cover_media_id, 'category_id', p_revision.category_id, 'tags', to_jsonb(p_revision.tags));
$$;

create or replace function private.post_content_hash(p_revision public.post_revisions)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(private.post_content(p_revision)::text);
$$;

-- Inline image references of a document.
create or replace function private.post_inline_media_ids(p_body jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct (m #>> '{}')::uuid), '{}')
    from jsonb_path_query(coalesce(p_body, '{}'::jsonb), 'strict $.** ? (@.type == "image").attrs.mediaId') as m;
$$;

-- About 200 words a minute, at least one.
create or replace function private.reading_minutes(p_intro text, p_body jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, round(coalesce(array_length(regexp_split_to_array(
    btrim(coalesce(p_intro, '') || ' ' || private.post_document_text(p_body)), '\s+'), 1), 0) / 200.0)::integer);
$$;

-- Organizations as visitors see them on a post (published identity only).
create or replace function private.organization_card(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'accent', o.accent, 'kind', o.kind,
    'logo', (select private.media_json(p.logo_media_id) from public.association_profiles p
              where p.organization_id = o.id and p.stage = 'published'))
    from public.organizations o
   where o.id = p_organization_id;
$$;

-- Readable by visitors at its address: published or archived, not hidden, on
-- a public association page.
create or replace function private.post_is_public(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and p.publication in ('published', 'archived')
       and p.hidden_at is null
       and p.published_revision_id is not null
       and private.association_page_is_public(p.organization_id)
  );
$$;

-- "Par <name>": only where the association shows authors, and only if the
-- author has not hidden themselves from its public team.
create or replace function private.post_author_name(p_post public.posts)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.show_authors
                and exists (select 1 from public.memberships m
                             where m.user_id = p_post.created_by and m.organization_id = p_post.organization_id
                               and m.status = 'active')
                and not exists (select 1 from public.memberships m
                                  join public.membership_public_profiles c on c.membership_id = m.id
                                 where m.user_id = p_post.created_by and m.organization_id = p_post.organization_id
                                   and c.hidden)
              then private.person_name(p_post.created_by) end
    from public.organization_editorial_settings s
   where s.organization_id = p_post.organization_id;
$$;

-- A post as a list item (no body): feeds, association pages, search.
create or replace function private.post_card(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'kind', r.kind, 'title', r.title, 'intro', r.intro,
    'cover', private.media_json(r.cover_media_id),
    'category', case when c.id is null then null else jsonb_build_object('slug', c.slug, 'label', c.label) end,
    'tags', to_jsonb(r.tags),
    'organization', private.organization_card(p.organization_id),
    'first_published_at', p.first_published_at, 'published_at', p.published_at,
    'reading_minutes', private.reading_minutes(r.intro, r.body),
    'prominence', case when p.prominence <> 'normal' and (p.prominence_until is null or p.prominence_until > now())
                       then p.prominence else 'normal' end,
    'pinned', p.pinned_at is not null,
    'archived', p.publication = 'archived',
    'author_name', private.post_author_name(p))
    from public.posts p
    join public.post_revisions r on r.id = p.published_revision_id
    left join public.post_categories c on c.id = r.category_id
   where p.id = p_post_id;
$$;

-- The images of a revision, by id (for rendering the body).
create or replace function private.revision_media_map(p_revision_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(rm.media_id::text, private.media_json(rm.media_id)), '{}'::jsonb)
    from (select distinct media_id from public.post_revision_media where revision_id = p_revision_id) as rm;
$$;

-- Records which images a revision uses.
create or replace function private.sync_revision_media(p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.post_revisions%rowtype;
begin
  select * into v_revision from public.post_revisions where id = p_revision_id;
  delete from public.post_revision_media where revision_id = p_revision_id;
  if v_revision.cover_media_id is not null then
    insert into public.post_revision_media (revision_id, media_id, role) values (p_revision_id, v_revision.cover_media_id, 'cover');
  end if;
  insert into public.post_revision_media (revision_id, media_id, role)
  select p_revision_id, m, 'inline' from unnest(private.post_inline_media_ids(v_revision.body)) as m;
end;
$$;

-- An address from a title: accents folded, words joined by dashes, unique
-- among posts and former addresses.
create or replace function private.unique_post_slug(p_title text, p_post_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := left(btrim(regexp_replace(private.fold_accents(p_title), '[^a-z0-9]+', '-', 'g'), '-'), 80);
  v_slug text;
  v_n integer := 1;
begin
  v_base := btrim(v_base, '-');
  if char_length(v_base) < 3 or v_base in ('rss', 'flux', 'feed', 'apercu', 'nouveau', 'recherche') then
    v_base := 'article-' || left(p_post_id::text, 8);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.posts where slug = v_slug and id <> p_post_id)
        or exists (select 1 from public.post_slug_history where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- May this person change this post's content? posts.edit on its
-- organization, or posts.create and having started it.
create or replace function private.can_edit_post(p_actor uuid, p_post public.posts)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission(p_actor, p_post.organization_id, 'posts.edit', now())
      or (p_post.created_by = p_actor
          and private.user_has_organization_permission(p_actor, p_post.organization_id, 'posts.create', now()));
$$;

create or replace function private.can_read_post(p_actor uuid, p_post public.posts)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_post(p_actor, p_post)
      or private.user_has_organization_permission(p_actor, p_post.organization_id, 'posts.approve', now())
      or private.user_has_organization_permission(p_actor, p_post.organization_id, 'posts.publish', now());
$$;

-- Why this revision cannot go live (null when it can). p_at_execution adds
-- what must hold when it actually goes online: an active association whose
-- page is public. Used by publish, schedule and the scheduled worker.
create or replace function private.publication_blocker(p_post public.posts, p_revision public.post_revisions, p_at_execution boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_post.hidden_at is not null then
    return 'post_hidden';
  end if;
  if p_revision.id is null or p_revision.post_id <> p_post.id then
    return 'revision_not_found';
  end if;
  if p_at_execution then
    if (select status from public.organizations where id = p_post.organization_id) <> 'active' then
      return 'organization_inactive';
    end if;
    if not private.association_page_is_public(p_post.organization_id) then
      return 'page_not_public';
    end if;
  end if;
  if char_length(btrim(p_revision.title)) < 3
     or (p_revision.intro is null and btrim(private.post_document_text(p_revision.body)) = '') then
    return 'post_incomplete';
  end if;
  if exists (
    select 1
      from unnest(array_append(private.post_inline_media_ids(p_revision.body), p_revision.cover_media_id)) as x (id)
     where x.id is not null
       and not exists (select 1 from public.association_media m
                        where m.id = x.id and m.organization_id = p_post.organization_id and m.removed_at is null)
  ) then
    return 'media_not_found';
  end if;
  return null;
end;
$$;

-- The revision is allowed to go live: already approved, or (direct
-- publishing) the current draft, approved here by the publisher. A
-- submission or a revision sent back for changes can never be published
-- directly, whatever the policy says now.
create or replace function private.authorize_revision(p_post public.posts, p_revision public.post_revisions, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_revision.status = 'approved' then
    return;
  end if;
  if p_revision.status = 'draft'
     and p_revision.id = p_post.working_revision_id
     and (select review_mode from public.organization_editorial_settings where organization_id = p_post.organization_id) = 'direct' then
    update public.post_revisions
       set status = 'approved', review_mode = 'direct', reviewed_at = now(), reviewed_by = p_actor
     where id = p_revision.id;
    insert into public.post_reviews (post_id, revision_id, decision, reviewer_id, content_hash)
    values (p_post.id, p_revision.id, 'published_directly', p_actor, private.post_content_hash(p_revision));
    return;
  end if;
  raise exception 'approval_required' using errcode = 'P0001';
end;
$$;

-- Puts a revision online (callers have checked everything).
create or replace function private.publish_revision(p_post_id uuid, p_revision_id uuid, p_actor uuid, p_authority text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_slug text;
begin
  select * into v_post from public.posts where id = p_post_id;
  select * into v_revision from public.post_revisions where id = p_revision_id;
  v_slug := coalesce(v_post.slug, private.unique_post_slug(v_revision.title, v_post.id));
  update public.post_revisions set published_at = now() where id = p_revision_id;
  update public.posts
     set slug = v_slug,
         published_revision_id = p_revision_id,
         publication = 'published',
         first_published_at = coalesce(first_published_at, now()),
         published_at = now(),
         published_by = p_actor,
         unpublished_at = null,
         archived_at = null,
         scheduled_revision_id = null, scheduled_at = null, scheduled_by = null,
         schedule_status = null, schedule_error = null, schedule_attempted_at = null
   where id = p_post_id;
  perform private.log_governance_event(
    p_actor, p_authority, 'post_published', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('revision', v_revision.number, 'first', v_post.first_published_at is null,
                       'scheduled', p_authority = 'scheduler')
  );
  return v_slug;
end;
$$;

-- Validates a content object from the editor and returns it in the column
-- types (raises post_invalid, media_not_found or category_invalid).
create or replace function private.check_post_content(p_post public.posts, p_content jsonb, p_current public.post_revisions)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category uuid;
  v_media uuid;
begin
  if jsonb_typeof(p_content) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_content) as k
                 where k not in ('kind', 'title', 'intro', 'body', 'cover_media_id', 'category_id', 'tags')) then
    raise exception 'post_invalid' using errcode = 'P0001';
  end if;
  v_category := nullif(p_content ->> 'category_id', '')::uuid;
  if v_category is not null
     and not exists (select 1 from public.post_categories where id = v_category and archived_at is null)
     and v_category is distinct from p_current.category_id then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  for v_media in
    select x.id from unnest(array_append(private.post_inline_media_ids(p_content -> 'body'),
                                         nullif(p_content ->> 'cover_media_id', '')::uuid)) as x (id)
     where x.id is not null
  loop
    if not exists (select 1 from public.association_media m
                    where m.id = v_media and m.organization_id = p_post.organization_id and m.removed_at is null) then
      raise exception 'media_not_found' using errcode = 'P0001';
    end if;
  end loop;
exception
  when invalid_text_representation then
    raise exception 'post_invalid' using errcode = 'P0001';
end;
$$;

-- ---- Writing --------------------------------------------------------------------------

-- Starts an article: a post of this organization, with an empty first draft.
create or replace function public.create_post(p_organization_id uuid, p_kind text, p_title text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post_id uuid := gen_random_uuid();
  v_revision_id uuid := gen_random_uuid();
begin
  if not (private.user_has_organization_permission(v_actor, p_organization_id, 'posts.create', now())
          or private.user_has_organization_permission(v_actor, p_organization_id, 'posts.edit', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  begin
    insert into public.posts (id, organization_id, created_by, working_revision_id)
    values (v_post_id, p_organization_id, v_actor, v_revision_id);
    insert into public.post_revisions (id, post_id, number, kind, title, created_by, updated_by, contributors)
    values (v_revision_id, v_post_id, 1, coalesce(p_kind, 'article'), btrim(coalesce(p_title, '')), v_actor, v_actor, array[v_actor]);
  exception
    when check_violation or not_null_violation then
      raise exception 'post_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'posts.create'), 'post_created', 'content',
    p_organization_id, null, 'post', v_post_id, jsonb_build_object('kind', coalesce(p_kind, 'article'))
  );
  return v_post_id;
end;
$$;

-- Saves the editor's content. p_revision_id and p_version are what the
-- editor loaded: a draft saved by someone else since is refused
-- (draft_conflict), never overwritten. A frozen revision (submitted,
-- approved, sent back, live) is never changed: the save opens a new draft
-- revision, which goes through review and publication again.
create or replace function public.save_post_revision(p_post_id uuid, p_revision_id uuid, p_version integer, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_current public.post_revisions%rowtype;
  v_id uuid;
  v_number integer;
  v_version integer;
  v_new boolean := false;
  v_constraint text;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_current from public.post_revisions where id = v_post.working_revision_id for update;
  if v_current.id is distinct from p_revision_id
     or (v_current.status = 'draft' and v_current.version is distinct from p_version) then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  perform private.check_post_content(v_post, p_content, v_current);

  begin
    if v_current.status = 'draft' then
      update public.post_revisions
         set kind = coalesce(p_content ->> 'kind', kind),
             title = btrim(coalesce(p_content ->> 'title', '')),
             intro = nullif(btrim(coalesce(p_content ->> 'intro', '')), ''),
             body = coalesce(p_content -> 'body', '{"type": "doc", "content": []}'::jsonb),
             cover_media_id = nullif(p_content ->> 'cover_media_id', '')::uuid,
             category_id = nullif(p_content ->> 'category_id', '')::uuid,
             tags = coalesce(array(select jsonb_array_elements_text(p_content -> 'tags')), '{}'),
             version = version + 1,
             updated_by = v_actor,
             updated_at = now(),
             contributors = case when v_actor = any (contributors) then contributors else contributors || v_actor end
       where id = v_current.id
      returning id, number, version into v_id, v_number, v_version;
    else
      v_new := true;
      insert into public.post_revisions (post_id, number, kind, title, intro, body, cover_media_id, category_id, tags,
                                         created_by, updated_by, contributors)
      values (p_post_id, (select max(number) + 1 from public.post_revisions where post_id = p_post_id),
              coalesce(p_content ->> 'kind', v_current.kind),
              btrim(coalesce(p_content ->> 'title', '')),
              nullif(btrim(coalesce(p_content ->> 'intro', '')), ''),
              coalesce(p_content -> 'body', '{"type": "doc", "content": []}'::jsonb),
              nullif(p_content ->> 'cover_media_id', '')::uuid,
              nullif(p_content ->> 'category_id', '')::uuid,
              coalesce(array(select jsonb_array_elements_text(p_content -> 'tags')), '{}'),
              v_actor, v_actor, array[v_actor])
      returning id, number, version into v_id, v_number, v_version;
      -- A submission replaced by a new version leaves the review queue.
      if v_current.status = 'submitted' then
        update public.post_revisions set status = 'superseded' where id = v_current.id;
      end if;
      update public.posts set working_revision_id = v_id where id = p_post_id;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or datatype_mismatch
         or invalid_parameter_value then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'post_invalid' using errcode = 'P0001', detail = coalesce(v_constraint, '');
  end;
  perform private.sync_revision_media(v_id);
  update public.posts set updated_at = now() where id = p_post_id;
  if v_new then
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_post.organization_id,
                                     case when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
      'post_revision_started', 'content', v_post.organization_id, null, 'post', p_post_id,
      jsonb_build_object('revision', v_number, 'from', v_current.number)
    );
  end if;
  return jsonb_build_object('revision_id', v_id, 'number', v_number, 'version', v_version, 'status', 'draft', 'new', v_new);
end;
$$;

-- Sends the current draft for review. From now on it is frozen.
create or replace function public.submit_post_revision(p_post_id uuid, p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_blocker text;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id for update;
  if v_revision.id is null or v_revision.id <> v_post.working_revision_id or v_revision.status <> 'draft' then
    raise exception 'revision_not_editable' using errcode = 'P0001';
  end if;
  v_blocker := private.publication_blocker(v_post, v_revision, false);
  if v_blocker in ('post_incomplete', 'media_not_found') then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  update public.post_revisions
     set status = 'submitted', submitted_at = now(), submitted_by = v_actor
   where id = p_revision_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    'post_submitted', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('revision', v_revision.number)
  );
end;
$$;

-- Takes a submission back to draft (before anyone decided).
create or replace function public.withdraw_post_revision(p_post_id uuid, p_revision_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id for update;
  if v_revision.id is null or v_revision.status <> 'submitted' or v_revision.id <> v_post.working_revision_id then
    raise exception 'revision_not_editable' using errcode = 'P0001';
  end if;
  update public.post_revisions set status = 'draft', submitted_at = null, submitted_by = null where id = p_revision_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    'post_withdrawn', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('revision', v_revision.number)
  );
end;
$$;

-- Approves exactly this submitted revision, or sends it back with a note.
-- The reviewer must hold posts.approve now and must not have written it.
create or replace function public.review_post_revision(p_post_id uuid, p_revision_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.approve');
  perform private.require_aal2();
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id for update;
  if v_revision.id is null or v_revision.status <> 'submitted' then
    raise exception 'revision_not_submitted' using errcode = 'P0001';
  end if;
  if v_actor = any (v_revision.contributors) or v_actor = v_revision.submitted_by then
    raise exception 'self_review' using errcode = 'P0001';
  end if;
  if p_decision = 'approve' then
    update public.post_revisions
       set status = 'approved', review_mode = 'review', reviewed_at = now(), reviewed_by = v_actor
     where id = p_revision_id;
  elsif p_decision = 'request_changes' then
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.post_revisions set status = 'changes_requested', reviewed_at = now(), reviewed_by = v_actor
     where id = p_revision_id;
  else
    raise exception 'post_invalid' using errcode = 'P0001';
  end if;
  begin
    insert into public.post_reviews (post_id, revision_id, decision, reviewer_id, note, content_hash)
    values (p_post_id, p_revision_id, case p_decision when 'approve' then 'approved' else 'changes_requested' end,
            v_actor, v_note, private.post_content_hash(v_revision));
  exception
    when check_violation then
      raise exception 'post_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.approve'),
    case p_decision when 'approve' then 'post_approved' else 'post_changes_requested' end, 'content',
    v_post.organization_id, v_revision.submitted_by, 'post', p_post_id,
    jsonb_build_object('revision', v_revision.number), v_note
  );
end;
$$;

-- Starts a new draft from an earlier revision (history is never rewritten;
-- the restored content goes through review and publication again).
create or replace function public.restore_post_revision(p_post_id uuid, p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_source public.post_revisions%rowtype;
  v_current public.post_revisions%rowtype;
  v_id uuid;
  v_number integer;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_source from public.post_revisions where id = p_revision_id and post_id = p_post_id;
  if v_source.id is null then
    raise exception 'revision_not_found' using errcode = 'P0001';
  end if;
  select * into v_current from public.post_revisions where id = v_post.working_revision_id for update;
  perform private.check_post_content(v_post, private.post_content(v_source) - 'category_id', v_source);
  insert into public.post_revisions (post_id, number, kind, title, intro, body, cover_media_id, category_id, tags,
                                     restored_from, created_by, updated_by, contributors)
  values (p_post_id, (select max(number) + 1 from public.post_revisions where post_id = p_post_id),
          v_source.kind, v_source.title, v_source.intro, v_source.body, v_source.cover_media_id,
          (select id from public.post_categories where id = v_source.category_id and archived_at is null),
          v_source.tags, v_source.id, v_actor, v_actor, array[v_actor])
  returning id, number into v_id, v_number;
  if v_current.status in ('draft', 'submitted') then
    update public.post_revisions set status = 'superseded' where id = v_current.id;
  end if;
  update public.posts set working_revision_id = v_id where id = p_post_id;
  perform private.sync_revision_media(v_id);
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    'post_revision_restored', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('revision', v_number, 'from', v_source.number)
  );
  return jsonb_build_object('revision_id', v_id, 'number', v_number);
end;
$$;

-- Deletes an article that never went online (its history goes with it; the
-- audit log keeps the decision).
create or replace function public.delete_post_draft(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_title text;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if v_post.first_published_at is not null or v_post.scheduled_at is not null then
    raise exception 'post_was_published' using errcode = 'P0001';
  end if;
  select title into v_title from public.post_revisions where id = v_post.working_revision_id;
  delete from public.posts where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    'post_draft_deleted', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('title', left(coalesce(nullif(v_title, ''), '(sans titre)'), 140))
  );
end;
$$;

-- ---- Publishing --------------------------------------------------------------------

-- Puts a revision online now (posts.publish, second factor).
create or replace function public.publish_post(p_post_id uuid, p_revision_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_blocker text;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  perform private.require_aal2();
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id for update;
  v_blocker := private.publication_blocker(v_post, v_revision, true);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  perform private.authorize_revision(v_post, v_revision, v_actor);
  return private.publish_revision(p_post_id, p_revision_id, v_actor,
                                  private.authority_for(v_actor, v_post.organization_id, 'posts.publish'));
end;
$$;

-- Schedules a revision for an exact instant (stored as timestamptz; the
-- site converts Paris wall-clock times, daylight saving included).
create or replace function public.schedule_post(p_post_id uuid, p_revision_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_blocker text;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  perform private.require_aal2();
  if p_at is null or p_at < now() + interval '2 minutes' or p_at > now() + interval '366 days' then
    raise exception 'invalid_schedule' using errcode = 'P0001';
  end if;
  select * into v_revision from public.post_revisions where id = p_revision_id and post_id = p_post_id for update;
  v_blocker := private.publication_blocker(v_post, v_revision, false);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  perform private.authorize_revision(v_post, v_revision, v_actor);
  update public.posts
     set scheduled_revision_id = p_revision_id, scheduled_at = p_at, scheduled_by = v_actor,
         schedule_status = 'pending', schedule_error = null, schedule_attempts = 0, schedule_attempted_at = null
   where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_scheduled', 'content',
    v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('revision', v_revision.number, 'at', p_at, 'previous', v_post.scheduled_at)
  );
end;
$$;

create or replace function public.cancel_post_schedule(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  if v_post.scheduled_at is null then
    raise exception 'not_scheduled' using errcode = 'P0001';
  end if;
  update public.posts
     set scheduled_revision_id = null, scheduled_at = null, scheduled_by = null,
         schedule_status = null, schedule_error = null, schedule_attempted_at = null
   where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_schedule_cancelled', 'content',
    v_post.organization_id, null, 'post', p_post_id, jsonb_build_object('at', v_post.scheduled_at)
  );
end;
$$;

-- The publishing worker, run every minute by pg_cron (never by a browser).
-- Claims due schedules with FOR UPDATE SKIP LOCKED (two runs never take the
-- same post), checks again everything publication needs at that moment, and
-- publishes or records why not. A published or failed schedule is no longer
-- pending, so a second run does nothing: no duplicate publication. Overdue
-- schedules (after downtime) are simply due and go out on the next run.
-- The approval stays valid for its exact, frozen revision even if the person
-- who scheduled it has since lost their position; cancellation, moderation,
-- a suspended association or an unpublished page stop it.
create or replace function private.run_scheduled_publications(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
  v_blocker text;
  v_done integer := 0;
begin
  for v_post in
    select * from public.posts
     where schedule_status = 'pending' and scheduled_at <= now()
     order by scheduled_at, id
     limit greatest(coalesce(p_limit, 50), 1)
     for update skip locked
  loop
    select * into v_revision from public.post_revisions where id = v_post.scheduled_revision_id;
    v_blocker := private.publication_blocker(v_post, v_revision, true);
    if v_blocker is null and v_revision.status <> 'approved' then
      v_blocker := 'approval_missing';
    end if;
    if v_blocker is null then
      begin
        perform private.publish_revision(v_post.id, v_revision.id, v_post.scheduled_by, 'scheduler');
        v_done := v_done + 1;
      exception
        when others then
          v_blocker := 'unexpected';
      end;
    end if;
    if v_blocker is not null then
      update public.posts
         set schedule_status = 'failed', schedule_error = v_blocker,
             schedule_attempts = schedule_attempts + 1, schedule_attempted_at = now()
       where id = v_post.id;
      perform private.log_governance_event(
        v_post.scheduled_by, 'scheduler', 'post_schedule_failed', 'content', v_post.organization_id, null, 'post', v_post.id,
        jsonb_build_object('error', v_blocker, 'revision', v_revision.number, 'at', v_post.scheduled_at)
      );
    end if;
  end loop;
  return v_done;
end;
$$;

-- Takes a post off the site (it stays editable, and can be published again).
create or replace function public.unpublish_post(p_post_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  if v_post.publication = 'unpublished' then
    raise exception 'post_not_published' using errcode = 'P0001';
  end if;
  update public.posts
     set publication = 'unpublished', unpublished_at = now(), archived_at = null, pinned_at = null, pinned_by = null
   where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_unpublished', 'content',
    v_post.organization_id, null, 'post', p_post_id, '{}'::jsonb, nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

-- Archives a published post (p_archive true): off the feeds and the
-- association page, still readable at its address, marked as archived. With
-- p_archive false, brings an archived post back onto the feeds.
create or replace function public.archive_post(p_post_id uuid, p_archive boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  if p_archive then
    if v_post.publication <> 'published' then
      raise exception 'post_not_published' using errcode = 'P0001';
    end if;
    update public.posts set publication = 'archived', archived_at = now(), pinned_at = null, pinned_by = null
     where id = p_post_id;
  else
    if v_post.publication <> 'archived' then
      raise exception 'post_not_archived' using errcode = 'P0001';
    end if;
    if v_post.hidden_at is not null then
      raise exception 'post_hidden' using errcode = 'P0001';
    end if;
    update public.posts set publication = 'published', archived_at = null where id = p_post_id;
  end if;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'),
    case when p_archive then 'post_archived' else 'post_unarchived' end, 'content',
    v_post.organization_id, null, 'post', p_post_id, '{}'::jsonb
  );
end;
$$;

-- Pins a published post on its association's page (three at most), or unpins it.
create or replace function public.set_post_pin(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  if p_pinned then
    if v_post.publication <> 'published' then
      raise exception 'post_not_published' using errcode = 'P0001';
    end if;
    if v_post.pinned_at is null
       and (select count(*) from public.posts where organization_id = v_post.organization_id and pinned_at is not null) >= 3 then
      raise exception 'pin_limit' using errcode = 'P0001';
    end if;
    update public.posts set pinned_at = coalesce(pinned_at, now()), pinned_by = v_actor where id = p_post_id;
  else
    update public.posts set pinned_at = null, pinned_by = null where id = p_post_id;
  end if;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'),
    case when p_pinned then 'post_pinned' else 'post_unpinned' end, 'content',
    v_post.organization_id, null, 'post', p_post_id, '{}'::jsonb
  );
end;
$$;

-- Site-wide prominence, BDE leadership only: a featured story (any
-- association, three at a time) or an important announcement (BDE posts only,
-- two at a time), with an optional end. 'normal' removes it.
create or replace function public.set_post_prominence(p_post_id uuid, p_prominence text, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.feature');
  perform private.require_aal2();
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if p_prominence not in ('normal', 'featured', 'important') then
    raise exception 'prominence_invalid' using errcode = 'P0001';
  end if;
  if p_prominence <> 'normal' then
    if v_post.publication <> 'published' or v_post.hidden_at is not null then
      raise exception 'post_not_published' using errcode = 'P0001';
    end if;
    if p_prominence = 'important' and v_post.organization_id is distinct from private.bde_organization_id() then
      raise exception 'prominence_invalid' using errcode = 'P0001';
    end if;
    if p_until is not null and (p_until <= now() or p_until > now() + interval '60 days') then
      raise exception 'invalid_period' using errcode = 'P0001';
    end if;
    if (select count(*) from public.posts
         where prominence = p_prominence and id <> p_post_id
           and (prominence_until is null or prominence_until > now())) >= (case p_prominence when 'featured' then 3 else 2 end) then
      raise exception 'prominence_limit' using errcode = 'P0001';
    end if;
    update public.posts set prominence = p_prominence, prominence_until = p_until, prominence_by = v_actor where id = p_post_id;
  else
    update public.posts set prominence = 'normal', prominence_until = null, prominence_by = null where id = p_post_id;
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'post_prominence_changed', 'content', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('prominence', p_prominence, 'until', p_until)
  );
end;
$$;

-- A new address for a published post; the former one keeps redirecting.
create or replace function public.change_post_slug(p_post_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  perform private.require_aal2();
  if v_post.slug is null then
    raise exception 'post_not_published' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 100
     or v_slug in ('rss', 'flux', 'feed', 'apercu', 'nouveau', 'recherche') then
    raise exception 'slug_invalid' using errcode = 'P0001';
  end if;
  if v_slug = v_post.slug then
    return v_slug;
  end if;
  if exists (select 1 from public.posts where slug = v_slug)
     or exists (select 1 from public.post_slug_history where slug = v_slug and post_id <> p_post_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  delete from public.post_slug_history where slug = v_slug;
  insert into public.post_slug_history (slug, post_id, replaced_by) values (v_post.slug, p_post_id, v_actor);
  update public.posts set slug = v_slug where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_slug_changed', 'content',
    v_post.organization_id, null, 'post', p_post_id, jsonb_build_object('from', v_post.slug, 'to', v_slug)
  );
  return v_slug;
end;
$$;

-- The association's editorial policy (posts.settings, second factor).
create or replace function public.set_editorial_settings(p_organization_id uuid, p_review_mode text, p_show_authors boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_before public.organization_editorial_settings%rowtype;
begin
  perform private.require_organization_permission(v_actor, p_organization_id, 'posts.settings');
  perform private.require_aal2();
  if p_review_mode not in ('direct', 'approval') or p_show_authors is null then
    raise exception 'post_invalid' using errcode = 'P0001';
  end if;
  select * into v_before from public.organization_editorial_settings where organization_id = p_organization_id for update;
  update public.organization_editorial_settings
     set review_mode = p_review_mode, show_authors = p_show_authors, updated_at = now(), updated_by = v_actor
   where organization_id = p_organization_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, 'posts.settings'), 'editorial_settings_updated', 'content',
    p_organization_id, null, 'organization', p_organization_id,
    jsonb_build_object('review_mode', p_review_mode, 'show_authors', p_show_authors,
                       'was', jsonb_build_object('review_mode', v_before.review_mode, 'show_authors', v_before.show_authors))
  );
end;
$$;

-- ---- Privileges ------------------------------------------------------------------------------

revoke all on function private.post_content(public.post_revisions) from public, anon, authenticated, service_role;
revoke all on function private.post_content_hash(public.post_revisions) from public, anon, authenticated, service_role;
revoke all on function private.post_inline_media_ids(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.reading_minutes(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.organization_card(uuid) from public, anon, authenticated, service_role;
revoke all on function private.post_is_public(uuid) from public, anon, authenticated, service_role;
revoke all on function private.post_author_name(public.posts) from public, anon, authenticated, service_role;
revoke all on function private.post_card(uuid) from public, anon, authenticated, service_role;
revoke all on function private.revision_media_map(uuid) from public, anon, authenticated, service_role;
revoke all on function private.sync_revision_media(uuid) from public, anon, authenticated, service_role;
revoke all on function private.unique_post_slug(text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_edit_post(uuid, public.posts) from public, anon, authenticated, service_role;
revoke all on function private.can_read_post(uuid, public.posts) from public, anon, authenticated, service_role;
revoke all on function private.publication_blocker(public.posts, public.post_revisions, boolean) from public, anon, authenticated, service_role;
revoke all on function private.authorize_revision(public.posts, public.post_revisions, uuid) from public, anon, authenticated, service_role;
revoke all on function private.publish_revision(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.check_post_content(public.posts, jsonb, public.post_revisions) from public, anon, authenticated, service_role;
revoke all on function private.run_scheduled_publications(integer) from public, anon, authenticated, service_role;
revoke all on function public.create_post(uuid, text, text) from public, anon;
revoke all on function public.save_post_revision(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.submit_post_revision(uuid, uuid) from public, anon;
revoke all on function public.withdraw_post_revision(uuid, uuid) from public, anon;
revoke all on function public.review_post_revision(uuid, uuid, text, text) from public, anon;
revoke all on function public.restore_post_revision(uuid, uuid) from public, anon;
revoke all on function public.delete_post_draft(uuid) from public, anon;
revoke all on function public.publish_post(uuid, uuid) from public, anon;
revoke all on function public.schedule_post(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.cancel_post_schedule(uuid) from public, anon;
revoke all on function public.unpublish_post(uuid, text) from public, anon;
revoke all on function public.archive_post(uuid, boolean) from public, anon;
revoke all on function public.set_post_pin(uuid, boolean) from public, anon;
revoke all on function public.set_post_prominence(uuid, text, timestamptz) from public, anon;
revoke all on function public.change_post_slug(uuid, text) from public, anon;
revoke all on function public.set_editorial_settings(uuid, text, boolean) from public, anon;

grant execute on function public.create_post(uuid, text, text) to authenticated;
grant execute on function public.save_post_revision(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.submit_post_revision(uuid, uuid) to authenticated;
grant execute on function public.withdraw_post_revision(uuid, uuid) to authenticated;
grant execute on function public.review_post_revision(uuid, uuid, text, text) to authenticated;
grant execute on function public.restore_post_revision(uuid, uuid) to authenticated;
grant execute on function public.delete_post_draft(uuid) to authenticated;
grant execute on function public.publish_post(uuid, uuid) to authenticated;
grant execute on function public.schedule_post(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.cancel_post_schedule(uuid) to authenticated;
grant execute on function public.unpublish_post(uuid, text) to authenticated;
grant execute on function public.archive_post(uuid, boolean) to authenticated;
grant execute on function public.set_post_pin(uuid, boolean) to authenticated;
grant execute on function public.set_post_prominence(uuid, text, timestamptz) to authenticated;
grant execute on function public.change_post_slug(uuid, text) to authenticated;
grant execute on function public.set_editorial_settings(uuid, text, boolean) to authenticated;
