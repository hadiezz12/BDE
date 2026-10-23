-- Phase 6 · Moderation, the category catalog and reading functions (the
-- content desk, the editor, previews, the public read model), plus images
-- used by posts and the scheduled worker's pg_cron job. Same rules as the
-- previous migration: every function identifies the caller and checks the
-- right itself; visitors only read published, visible posts of public pages.

-- ---- Reports and moderation -------------------------------------------------------------

-- A signed-in student reports a public post. One open report per person and
-- post; at most 5 an hour and 20 a day. The association is not told who.
create or replace function public.report_post(p_post_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_report_id uuid;
begin
  if not private.post_is_public(p_post_id) then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.content_reports where post_id = p_post_id and reporter_id = v_actor and status = 'open') then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if (select count(*) from public.content_reports where reporter_id = v_actor and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.content_reports where reporter_id = v_actor and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_rate_limited' using errcode = 'P0001';
  end if;
  begin
    insert into public.content_reports (post_id, reporter_id, reason, details)
    values (p_post_id, v_actor, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
    returning id into v_report_id;
  exception
    when check_violation then
      raise exception 'report_invalid' using errcode = 'P0001';
    when unique_violation then
      raise exception 'already_reported' using errcode = 'P0001';
  end;
  -- No actor and no organization on this line: the reporter stays private,
  -- and the association's own history never shows that it was reported.
  perform private.log_governance_event(
    null, 'self', 'content_reported', 'moderation', null, null, 'content_report', v_report_id,
    jsonb_build_object('post', p_post_id, 'reason', p_reason)
  );
end;
$$;

-- Closes a report without action.
create or replace function public.dismiss_report(p_report_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_report public.content_reports%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  select * into v_report from public.content_reports where id = p_report_id for update;
  if not found or v_report.status <> 'open' then
    raise exception 'report_not_open' using errcode = 'P0001';
  end if;
  update public.content_reports
     set status = 'dismissed', resolved_at = now(), resolved_by = v_actor,
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_report_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'report_dismissed', 'moderation', null, null, 'content_report', p_report_id,
    jsonb_build_object('post', v_report.post_id, 'reason', v_report.reason), nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$$;

-- Hides a post from the site (moderation, second factor, reason). Nothing the
-- association does can show it again: publishing, scheduling, restoring a
-- version and unarchiving all refuse a hidden post. Its open reports are
-- closed as acted on.
create or replace function public.hide_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_post public.posts%rowtype;
  v_reports integer;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.published_revision_id is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if v_post.hidden_at is not null then
    raise exception 'post_hidden' using errcode = 'P0001';
  end if;
  update public.posts
     set hidden_at = now(), hidden_by = v_actor, hidden_reason = v_reason,
         pinned_at = null, pinned_by = null, prominence = 'normal', prominence_until = null, prominence_by = null
   where id = p_post_id;
  update public.content_reports
     set status = 'actioned', resolved_at = now(), resolved_by = v_actor, resolution_note = v_reason
   where post_id = p_post_id and status = 'open';
  get diagnostics v_reports = row_count;
  perform private.log_governance_event(
    v_actor, 'bde', 'post_hidden', 'moderation', v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('reports', v_reports), v_reason
  );
end;
$$;

-- Lifts a moderation hide (second factor, reason). The post comes back as the
-- association left it: online if it is still published.
create or replace function public.restore_post_visibility(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_post public.posts%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.hidden_at is null then
    raise exception 'post_not_hidden' using errcode = 'P0001';
  end if;
  update public.posts set hidden_at = null, hidden_by = null, hidden_reason = null where id = p_post_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'post_restored', 'moderation', v_post.organization_id, null, 'post', p_post_id, '{}'::jsonb, v_reason
  );
end;
$$;

-- ---- The category catalog (BDE leadership) -------------------------------------------------

create or replace function public.create_post_category(p_slug text, p_label text, p_sort_order integer default 100)
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
    insert into public.post_categories (slug, label, sort_order, created_by)
    values (lower(btrim(coalesce(p_slug, ''))), btrim(coalesce(p_label, '')), coalesce(p_sort_order, 100), v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde', 'post_category_created', 'catalog', null, null, 'post_category', v_id,
    jsonb_build_object('slug', lower(btrim(p_slug)), 'label', btrim(p_label))
  );
  return v_id;
end;
$$;

create or replace function public.update_post_category(p_category_id uuid, p_label text, p_sort_order integer, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  begin
    update public.post_categories
       set label = btrim(coalesce(p_label, '')), sort_order = coalesce(p_sort_order, sort_order),
           archived_at = case when p_archived then coalesce(archived_at, now()) else null end
     where id = p_category_id;
    if not found then
      raise exception 'category_invalid' using errcode = 'P0001';
    end if;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde', 'post_category_updated', 'catalog', null, null, 'post_category', p_category_id,
    jsonb_build_object('label', btrim(p_label), 'archived', p_archived)
  );
end;
$$;

-- ---- Reading: the content team ------------------------------------------------------------

-- A revision as the editor and the history show it.
create or replace function private.revision_json(p_revision public.post_revisions, p_with_content boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_revision.id, 'number', p_revision.number, 'status', p_revision.status, 'version', p_revision.version,
    'kind', p_revision.kind, 'title', p_revision.title,
    'created_by_name', private.person_name(p_revision.created_by), 'created_at', p_revision.created_at,
    'updated_by_name', private.person_name(p_revision.updated_by), 'updated_at', p_revision.updated_at,
    'contributors', (select coalesce(jsonb_agg(private.person_name(u)), '[]'::jsonb) from unnest(p_revision.contributors) as u),
    'submitted_at', p_revision.submitted_at,
    'submitted_by_name', case when p_revision.submitted_by is null then null else private.person_name(p_revision.submitted_by) end,
    'reviewed_at', p_revision.reviewed_at,
    'reviewed_by_name', case when p_revision.reviewed_by is null then null else private.person_name(p_revision.reviewed_by) end,
    'review_mode', p_revision.review_mode,
    'review_note', (select v.note from public.post_reviews v where v.revision_id = p_revision.id
                     order by v.created_at desc limit 1),
    'published_at', p_revision.published_at,
    'restored_from', (select s.number from public.post_revisions s where s.id = p_revision.restored_from))
  || case when p_with_content then jsonb_build_object(
       'intro', p_revision.intro, 'body', p_revision.body, 'cover_media_id', p_revision.cover_media_id,
       'category_id', p_revision.category_id, 'tags', to_jsonb(p_revision.tags))
     else '{}'::jsonb end;
$$;

-- What the content team needs to steer a post (no body).
create or replace function private.post_summary(p_post public.posts, p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_post.id, 'slug', p_post.slug, 'created_by_name', private.person_name(p_post.created_by),
    'created_by_you', p_post.created_by = p_actor, 'created_at', p_post.created_at, 'updated_at', p_post.updated_at,
    'kind', w.kind, 'title', w.title, 'cover', private.media_json(w.cover_media_id), 'tags', to_jsonb(w.tags),
    'category', (select c.label from public.post_categories c where c.id = w.category_id),
    'working', jsonb_build_object('id', w.id, 'number', w.number, 'status', w.status, 'version', w.version,
                                  'updated_at', w.updated_at, 'updated_by_name', private.person_name(w.updated_by),
                                  'contributors', to_jsonb(w.contributors), 'submitted_by', w.submitted_by),
    'published', case when pub.id is null then null
                      else jsonb_build_object('id', pub.id, 'number', pub.number, 'title', pub.title) end,
    'publication', p_post.publication, 'first_published_at', p_post.first_published_at,
    'published_at', p_post.published_at, 'archived_at', p_post.archived_at, 'unpublished_at', p_post.unpublished_at,
    'schedule', case when p_post.scheduled_at is null then null
                     else jsonb_build_object('at', p_post.scheduled_at, 'status', p_post.schedule_status,
                                             'error', p_post.schedule_error, 'attempts', p_post.schedule_attempts,
                                             'revision', (select s.number from public.post_revisions s
                                                           where s.id = p_post.scheduled_revision_id)) end,
    'hidden', case when p_post.hidden_at is null then null
                   else jsonb_build_object('at', p_post.hidden_at, 'reason', p_post.hidden_reason) end,
    'pinned', p_post.pinned_at is not null,
    'prominence', p_post.prominence, 'prominence_until', p_post.prominence_until,
    'is_public', private.post_is_public(p_post.id))
    from public.post_revisions w
    left join public.post_revisions pub on pub.id = p_post.published_revision_id
   where w.id = p_post.working_revision_id;
$$;

-- The association's content desk: its posts as the caller may see them
-- (everything for editors, approvers and publishers; one's own for an author
-- who only holds posts.create), the policy and what the caller may do.
create or replace function public.content_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_create boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'posts.create', now());
  v_edit boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'posts.edit', now());
  v_approve boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'posts.approve', now());
  v_publish boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'posts.publish', now());
  v_settings boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'posts.settings', now());
  v_all boolean := v_edit or v_approve or v_publish;
begin
  if not (v_create or v_all or v_settings) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                         'accent', o.accent, 'kind', o.kind, 'status', o.status,
                                         'page_public', private.association_page_is_public(o.id)),
      'settings', jsonb_build_object('review_mode', s.review_mode, 'show_authors', s.show_authors,
                                     'updated_at', s.updated_at,
                                     'updated_by_name', case when s.updated_by is null then null
                                                             else private.person_name(s.updated_by) end),
      'can', jsonb_build_object('create', v_create or v_edit, 'edit', v_edit, 'approve', v_approve,
                                'publish', v_publish, 'settings', v_settings, 'all', v_all),
      'posts', coalesce((
        select jsonb_agg(private.post_summary(p, v_actor) order by p.updated_at desc)
          from public.posts p
         where p.organization_id = o.id
           and (v_all or (v_create and p.created_by = v_actor))), '[]'::jsonb))
      from public.organizations o
      join public.organization_editorial_settings s on s.organization_id = o.id
     where o.id = p_organization_id
  );
end;
$$;

-- One post for its editor: the working revision with its content, the live
-- one, the history, the decisions, the library and what the caller may do.
create or replace function public.post_editor(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_working public.post_revisions%rowtype;
  v_approve boolean;
begin
  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_read_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_working from public.post_revisions where id = v_post.working_revision_id;
  v_approve := private.user_has_organization_permission(v_actor, v_post.organization_id, 'posts.approve', now());
  return jsonb_build_object(
    'post', private.post_summary(v_post, v_actor),
    'organization', private.organization_card(v_post.organization_id)
                    || jsonb_build_object('status', (select status from public.organizations where id = v_post.organization_id),
                                          'page_public', private.association_page_is_public(v_post.organization_id)),
    'settings', (select jsonb_build_object('review_mode', s.review_mode, 'show_authors', s.show_authors)
                   from public.organization_editorial_settings s where s.organization_id = v_post.organization_id),
    'working', private.revision_json(v_working, true),
    'history', (select coalesce(jsonb_agg(private.revision_json(r, false) order by r.number desc), '[]'::jsonb)
                  from public.post_revisions r where r.post_id = v_post.id),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
                    'revision', r.number, 'decision', v.decision, 'reviewer_name', private.person_name(v.reviewer_id),
                    'note', v.note, 'created_at', v.created_at) order by v.created_at desc), '[]'::jsonb)
                  from public.post_reviews v join public.post_revisions r on r.id = v.revision_id
                 where v.post_id = v_post.id),
    'media', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'path', m.object_path, 'kind', m.kind, 'width', m.width, 'height', m.height,
                  'alt', m.alt_text) order by m.created_at desc), '[]'::jsonb)
                from public.association_media m
               where m.organization_id = v_post.organization_id and m.removed_at is null),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'label', c.label,
                                                                'archived', c.archived_at is not null)
                                             order by c.sort_order, c.label), '[]'::jsonb)
                     from public.post_categories c
                    where c.archived_at is null or c.id = v_working.category_id),
    'can', jsonb_build_object(
      'edit', private.can_edit_post(v_actor, v_post),
      'approve', v_approve,
      'review_this', v_approve and v_working.status = 'submitted'
                     and not (v_actor = any (v_working.contributors)) and v_actor is distinct from v_working.submitted_by,
      'publish', private.user_has_organization_permission(v_actor, v_post.organization_id, 'posts.publish', now()),
      'upload', private.can_upload_media(v_actor, v_post.organization_id),
      'delete', private.can_edit_post(v_actor, v_post) and v_post.first_published_at is null and v_post.scheduled_at is null)
  );
end;
$$;

-- A revision in the public shape, for the private preview (the working one
-- by default, or any revision of the history).
create or replace function public.post_preview(p_post_id uuid, p_revision_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_revision public.post_revisions%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_read_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select * into v_revision from public.post_revisions
   where id = coalesce(p_revision_id, v_post.working_revision_id) and post_id = p_post_id;
  if not found then
    raise exception 'revision_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v_post.id, 'slug', v_post.slug, 'kind', v_revision.kind, 'title', v_revision.title, 'intro', v_revision.intro,
    'body', v_revision.body, 'cover', private.media_json(v_revision.cover_media_id),
    'category', (select jsonb_build_object('slug', c.slug, 'label', c.label) from public.post_categories c
                  where c.id = v_revision.category_id),
    'tags', to_jsonb(v_revision.tags),
    'organization', private.organization_card(v_post.organization_id),
    'first_published_at', v_post.first_published_at, 'published_at', v_post.published_at,
    'reading_minutes', private.reading_minutes(v_revision.intro, v_revision.body),
    'author_name', private.post_author_name(v_post),
    'media', private.revision_media_map(v_revision.id),
    'revision', jsonb_build_object('id', v_revision.id, 'number', v_revision.number, 'status', v_revision.status,
                                   'live', v_revision.id = v_post.published_revision_id and private.post_is_public(v_post.id))
  );
end;
$$;

-- ---- Reading: visitors ---------------------------------------------------------------------

-- The feed: published, visible posts of public association pages, newest
-- first publication first (a stable order: (first_published_at, id), which
-- republishing never changes). Keyset pagination: pass the last item's
-- first_published_at and id to get the next page. Filters: association,
-- category, kind, search (French full text, accents ignored, plus the
-- association's name).
create or replace function public.public_posts(
  p_organization_slug text default null,
  p_category text default null,
  p_kind text default null,
  p_q text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select case when char_length(btrim(coalesce(p_q, ''))) < 2 then null
                else websearch_to_tsquery('french'::regconfig, private.fold_accents(left(p_q, 80))) end as tsq,
           private.fold_accents(btrim(coalesce(p_q, ''))) as raw
  ),
  page as (
    select p.id, p.first_published_at
      from public.posts p
      join public.post_revisions r on r.id = p.published_revision_id
      join public.organizations o on o.id = p.organization_id
      left join public.post_categories c on c.id = r.category_id
      cross join q
     where p.publication = 'published'
       and p.hidden_at is null
       and private.association_page_is_public(p.organization_id)
       and (p_organization_slug is null or o.slug = p_organization_slug)
       and (p_category is null or c.slug = p_category)
       and (p_kind is null or r.kind = p_kind)
       and (q.tsq is null or r.search @@ q.tsq
            or (char_length(q.raw) >= 2 and private.fold_accents(o.name || ' ' || coalesce(o.short_name, '')) like '%' || q.raw || '%'))
       and (p_before_at is null or (p.first_published_at, p.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     order by p.first_published_at desc, p.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select coalesce(jsonb_agg(private.post_card(page.id) order by page.first_published_at desc, page.id desc), '[]'::jsonb)
    from page;
$$;

-- One post at its address. Archived posts stay readable (marked); a former
-- address answers "moved"; anything else (draft, unpublished, hidden,
-- association not public, unknown) is not found, without saying why.
create or replace function public.public_post(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_new text;
begin
  select * into v_post from public.posts where slug = p_slug;
  if not found then
    select p.slug into v_new
      from public.post_slug_history h join public.posts p on p.id = h.post_id
     where h.slug = p_slug and private.post_is_public(p.id);
    if v_new is not null then
      return jsonb_build_object('state', 'moved', 'slug', v_new);
    end if;
    return jsonb_build_object('state', 'not_found');
  end if;
  if not private.post_is_public(v_post.id) then
    return jsonb_build_object('state', 'not_found');
  end if;
  return jsonb_build_object(
    'state', 'ok',
    'post', private.post_card(v_post.id) || (
      select jsonb_build_object('body', r.body, 'media', private.revision_media_map(r.id))
        from public.post_revisions r where r.id = v_post.published_revision_id));
end;
$$;

-- What the filters offer: categories, associations and kinds that have
-- listed posts, with counts.
create or replace function public.public_post_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with listed as (
    select p.id, p.organization_id, r.kind, r.category_id
      from public.posts p join public.post_revisions r on r.id = p.published_revision_id
     where p.publication = 'published' and p.hidden_at is null and private.association_page_is_public(p.organization_id)
  )
  select jsonb_build_object(
    'total', (select count(*) from listed),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'label', c.label, 'count', n) order by c.sort_order, c.label)
                              from (select category_id, count(*) as n from listed where category_id is not null group by category_id) as x
                              join public.post_categories c on c.id = x.category_id and c.archived_at is null), '[]'::jsonb),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                                                   'accent', o.accent, 'count', n)
                                                order by o.kind = 'bde' desc, o.name)
                                 from (select organization_id, count(*) as n from listed group by organization_id) as x
                                 join public.organizations o on o.id = x.organization_id), '[]'::jsonb),
    'kinds', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) as n from listed group by kind) as x), '{}'::jsonb));
$$;

-- Featured stories and important BDE announcements, while they last.
create or replace function public.public_featured_posts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'featured', coalesce((select jsonb_agg(private.post_card(p.id) order by p.first_published_at desc)
                            from public.posts p
                           where p.prominence = 'featured' and (p.prominence_until is null or p.prominence_until > now())
                             and p.publication = 'published' and p.hidden_at is null
                             and private.association_page_is_public(p.organization_id)), '[]'::jsonb),
    'important', coalesce((select jsonb_agg(private.post_card(p.id) order by p.first_published_at desc)
                             from public.posts p
                            where p.prominence = 'important' and (p.prominence_until is null or p.prominence_until > now())
                              and p.publication = 'published' and p.hidden_at is null
                              and private.association_page_is_public(p.organization_id)), '[]'::jsonb));
$$;

-- An association's own posts for its page: pinned first, then the newest.
create or replace function public.public_association_posts(p_slug text, p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.post_card(x.id) order by x.pinned_at desc nulls last, x.first_published_at desc, x.id desc), '[]'::jsonb)
    from (select p.id, p.pinned_at, p.first_published_at
            from public.posts p join public.organizations o on o.id = p.organization_id
           where o.slug = p_slug and p.publication = 'published' and p.hidden_at is null
             and private.association_page_is_public(p.organization_id)
           order by p.pinned_at desc nulls last, p.first_published_at desc, p.id desc
           limit least(greatest(coalesce(p_limit, 6), 1), 24)) as x;
$$;

-- Addresses for the sitemap (listed posts only).
create or replace function public.public_post_sitemap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', p.slug, 'published_at', p.published_at)
                            order by p.first_published_at desc), '[]'::jsonb)
    from (select * from public.posts p
           where p.publication = 'published' and p.hidden_at is null
             and private.association_page_is_public(p.organization_id)
           order by p.first_published_at desc
           limit 5000) as p;
$$;

-- ---- Reading: moderation (BDE) ----------------------------------------------------------

-- Reports to handle, hidden posts and the moderation history. Only what was
-- public (the published revision), never a draft; reporters are never named.
create or replace function public.moderation_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  return jsonb_build_object(
    'open', coalesce((
      select jsonb_agg(x.item order by x.last_at desc)
        from (select max(cr.created_at) as last_at,
                     jsonb_build_object(
                       'post', private.post_card(cr.post_id) || jsonb_build_object(
                         'hidden', (select p.hidden_at is not null from public.posts p where p.id = cr.post_id),
                         'public', private.post_is_public(cr.post_id)),
                       'count', count(*),
                       'reasons', (select jsonb_object_agg(y.reason, y.n)
                                     from (select c2.reason, count(*) as n from public.content_reports c2
                                            where c2.post_id = cr.post_id and c2.status = 'open' group by c2.reason) as y),
                       'reports', jsonb_agg(jsonb_build_object('id', cr.id, 'reason', cr.reason, 'details', cr.details,
                                                               'created_at', cr.created_at) order by cr.created_at desc),
                       'first_at', min(cr.created_at)) as item
                from public.content_reports cr
               where cr.status = 'open'
               group by cr.post_id) as x), '[]'::jsonb),
    'hidden', coalesce((
      select jsonb_agg(private.post_card(p.id) || jsonb_build_object(
               'hidden_at', p.hidden_at, 'hidden_reason', p.hidden_reason,
               'hidden_by_name', case when p.hidden_by is null then null else private.person_name(p.hidden_by) end)
             order by p.hidden_at desc)
        from public.posts p where p.hidden_at is not null), '[]'::jsonb),
    'resolved', coalesce((
      select jsonb_agg(x.item order by x.resolved_at desc)
        from (select cr.resolved_at, jsonb_build_object(
                       'id', cr.id, 'reason', cr.reason, 'status', cr.status, 'resolved_at', cr.resolved_at,
                       'resolved_by_name', case when cr.resolved_by is null then null else private.person_name(cr.resolved_by) end,
                       'note', cr.resolution_note,
                       'post_title', (select r.title from public.posts p join public.post_revisions r on r.id = p.published_revision_id
                                       where p.id = cr.post_id),
                       'organization', (select o.name from public.posts p join public.organizations o on o.id = p.organization_id
                                         where p.id = cr.post_id)) as item
                from public.content_reports cr
               where cr.status <> 'open'
               order by cr.resolved_at desc
               limit 30) as x), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'occurred_at', g.occurred_at, 'action', g.action,
               'actor_name', case when g.actor_user_id is null then null else private.person_name(g.actor_user_id) end,
               'reason', g.reason,
               'post_title', (select r.title from public.posts p join public.post_revisions r on r.id = p.published_revision_id
                               where p.id = coalesce(nullif(g.details ->> 'post', '')::uuid,
                                                     case when g.resource_type = 'post' then g.resource_id end))
             ) order by g.occurred_at desc)
        from (select * from public.governance_audit_events
               where category = 'moderation' order by occurred_at desc limit 50) as g), '[]'::jsonb)
  );
end;
$$;

-- The published content of a reported or hidden post, for its moderator
-- (never a draft or an older revision).
create or replace function public.moderated_post(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  select * into v_post from public.posts where id = p_post_id;
  if not found or v_post.published_revision_id is null then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  return private.post_card(v_post.id) || (
    select jsonb_build_object('body', r.body, 'media', private.revision_media_map(r.id),
                              'hidden', v_post.hidden_at is not null, 'hidden_reason', v_post.hidden_reason,
                              'publication', v_post.publication)
      from public.post_revisions r where r.id = v_post.published_revision_id);
end;
$$;

-- ---- Images: posts use the association library too ------------------------------------------

-- Public while a public page (Phase 5) or a public post's live revision uses it.
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
       and (
         (private.association_page_is_public(m.organization_id)
          and (exists (select 1 from public.association_profiles p
                        where p.organization_id = m.organization_id and p.stage = 'published'
                          and m.id in (p.logo_media_id, p.cover_media_id))
               or exists (select 1 from public.association_gallery_items g
                           where g.organization_id = m.organization_id and g.stage = 'published' and g.media_id = m.id)))
         or exists (select 1
                      from public.post_revision_media rm
                      join public.posts p on p.published_revision_id = rm.revision_id
                     where rm.media_id = m.id and private.post_is_public(p.id))
       )
  );
$$;

-- Authors (posts.create) may send images too, not only media.manage.
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
  v_key text;
begin
  if not private.can_upload_media(v_actor, p_organization_id) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  v_key := case when private.user_has_organization_permission(v_actor, p_organization_id, 'media.manage', now())
                then 'media.manage' else 'posts.create' end;
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
    when unique_violation or check_violation or not_null_violation then
      raise exception 'media_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, v_key), 'association_media_uploaded', 'media',
    p_organization_id, null, 'association_media', p_media_id,
    jsonb_build_object('kind', p_kind, 'width', p_width, 'height', p_height, 'bytes', p_bytes)
  );
  return p_media_id;
end;
$$;

-- An image any post revision uses (draft, live or old) is never removed.
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
                 where g.organization_id = v_media.organization_id and g.media_id = v_media.id)
     or exists (select 1 from public.post_revision_media rm where rm.media_id = v_media.id) then
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

-- ---- The scheduled worker: every minute, where pg_cron exists ----------------------------------

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('publish-scheduled-posts', '* * * * *', 'select private.run_scheduled_publications()');
  end if;
end
$cron$;

-- ---- Privileges ------------------------------------------------------------------------------

revoke all on function private.revision_json(public.post_revisions, boolean) from public, anon, authenticated, service_role;
revoke all on function private.post_summary(public.posts, uuid) from public, anon, authenticated, service_role;
revoke all on function public.report_post(uuid, text, text) from public, anon;
revoke all on function public.dismiss_report(uuid, text) from public, anon;
revoke all on function public.hide_post(uuid, text) from public, anon;
revoke all on function public.restore_post_visibility(uuid, text) from public, anon;
revoke all on function public.create_post_category(text, text, integer) from public, anon;
revoke all on function public.update_post_category(uuid, text, integer, boolean) from public, anon;
revoke all on function public.content_dashboard(uuid) from public, anon;
revoke all on function public.post_editor(uuid) from public, anon;
revoke all on function public.post_preview(uuid, uuid) from public, anon;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.moderated_post(uuid) from public, anon;
revoke all on function public.public_posts(text, text, text, text, timestamptz, uuid, integer) from public;
revoke all on function public.public_post(text) from public;
revoke all on function public.public_post_facets() from public;
revoke all on function public.public_featured_posts() from public;
revoke all on function public.public_association_posts(text, integer) from public;
revoke all on function public.public_post_sitemap() from public;

grant execute on function public.report_post(uuid, text, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;
grant execute on function public.hide_post(uuid, text) to authenticated;
grant execute on function public.restore_post_visibility(uuid, text) to authenticated;
grant execute on function public.create_post_category(text, text, integer) to authenticated;
grant execute on function public.update_post_category(uuid, text, integer, boolean) to authenticated;
grant execute on function public.content_dashboard(uuid) to authenticated;
grant execute on function public.post_editor(uuid) to authenticated;
grant execute on function public.post_preview(uuid, uuid) to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.moderated_post(uuid) to authenticated;
grant execute on function public.public_posts(text, text, text, text, timestamptz, uuid, integer) to anon, authenticated;
grant execute on function public.public_post(text) to anon, authenticated;
grant execute on function public.public_post_facets() to anon, authenticated;
grant execute on function public.public_featured_posts() to anon, authenticated;
grant execute on function public.public_association_posts(text, integer) to anon, authenticated;
grant execute on function public.public_post_sitemap() to anon, authenticated;
