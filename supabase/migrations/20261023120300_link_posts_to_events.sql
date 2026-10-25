-- Phase 7 · Articles can point to an event ("Why you should come to…"). The
-- article stores only the event's id: its title, date, place and whether it
-- is full or cancelled are always read live from the event, never copied.

alter table public.posts
  add column event_id uuid
    constraint posts_event_id_fkey references public.events (id) on delete set null;

comment on column public.posts.event_id is
  'The event the article is about, if any. Shown live from the event (never copied into the article).';

create index posts_event_idx on public.posts (event_id);

-- Links (or unlinks) an event: its own association's events (any state, so a
-- draft article can announce a draft event) or any event visitors can see.
-- On an article that is online, changing the link needs posts.publish.
create or replace function public.set_post_event(p_post_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_event public.events%rowtype;
begin
  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_post(v_actor, v_post) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if v_post.publication <> 'unpublished' then
    perform private.require_organization_permission(v_actor, v_post.organization_id, 'posts.publish');
  end if;
  if p_event_id is not null then
    select * into v_event from public.events where id = p_event_id;
    if not found or not (v_event.organization_id = v_post.organization_id or private.event_is_public(v_event)) then
      raise exception 'event_not_found' using errcode = 'P0001';
    end if;
  end if;
  update public.posts set event_id = p_event_id, updated_at = now() where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.publication <> 'unpublished' then 'posts.publish'
                                        when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    case when p_event_id is null then 'post_event_unlinked' else 'post_event_linked' end, 'content',
    v_post.organization_id, null, 'post', p_post_id, jsonb_build_object('event', p_event_id)
  );
end;
$$;

-- The events an article may point to, for its editor: the association's own
-- upcoming events (drafts included) and the site's upcoming public events.
create or replace function public.post_event_options(p_post_id uuid)
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
  select * into v_post from public.posts where id = p_post_id;
  if not found or not private.can_read_post(v_actor, v_post) then
    raise exception 'post_not_found' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'current', (select jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'publication', e.publication,
                                          'status', e.status, 'is_public', private.event_is_public(e),
                                          'organization', private.organization_card(e.organization_id))
                  from public.events e where e.id = v_post.event_id),
    'can_change', private.can_edit_post(v_actor, v_post)
                  and (v_post.publication = 'unpublished'
                       or private.user_has_organization_permission(v_actor, v_post.organization_id, 'posts.publish', now())),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'publication', e.publication,
                                          'own', e.organization_id = v_post.organization_id,
                                          'organization', private.organization_card(e.organization_id))
                       order by (e.organization_id = v_post.organization_id) desc, e.starts_at nulls last)
        from (select * from public.events e
               where (e.ends_at is null or e.ends_at > now()) and e.status = 'scheduled'
                 and ((e.organization_id = v_post.organization_id and e.id in (select private.my_readable_event_ids()))
                      or private.event_is_public(e))
               order by e.starts_at nulls last limit 60) as e), '[]'::jsonb));
end;
$$;

-- A published post as lists and pages show it, now with its event (live,
-- public fields only; nothing when the event is not visible).
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
    'author_name', private.post_author_name(p),
    'event', (select private.event_card(e) from public.events e where e.id = p.event_id and private.event_is_public(e)))
    from public.posts p
    join public.post_revisions r on r.id = p.published_revision_id
    left join public.post_categories c on c.id = r.category_id
   where p.id = p_post_id;
$$;

revoke all on function public.set_post_event(uuid, uuid) from public, anon;
revoke all on function public.post_event_options(uuid) from public, anon;
grant execute on function public.set_post_event(uuid, uuid) to authenticated;
grant execute on function public.post_event_options(uuid) to authenticated;
