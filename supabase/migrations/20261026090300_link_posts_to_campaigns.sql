-- Phase 8 · Articles can point to a recruitment campaign ("Finance recrute !").
-- The article stores only the campaign's id: its dates, positions and whether
-- it still takes applications are always read live, never copied.

alter table public.posts
  add column recruitment_campaign_id uuid
    constraint posts_recruitment_campaign_id_fkey references public.recruitment_campaigns (id) on delete set null;

comment on column public.posts.recruitment_campaign_id is
  'The recruitment campaign the article is about, if any. Shown live from the campaign (never copied into the article).';

create index posts_recruitment_campaign_idx on public.posts (recruitment_campaign_id);

-- Links (or unlinks) a campaign: its own association's (drafts included, so an
-- article can be prepared with its campaign) or any campaign visitors can see.
-- On an article that is online, changing the link needs posts.publish.
create or replace function public.set_post_campaign(p_post_id uuid, p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_post public.posts%rowtype;
  v_campaign public.recruitment_campaigns%rowtype;
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
  if p_campaign_id is not null then
    select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id;
    if not found or not (v_campaign.organization_id = v_post.organization_id or private.campaign_is_public(v_campaign)) then
      raise exception 'campaign_not_found' using errcode = 'P0001';
    end if;
  end if;
  update public.posts set recruitment_campaign_id = p_campaign_id, updated_at = now() where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id,
                                   case when v_post.publication <> 'unpublished' then 'posts.publish'
                                        when v_post.created_by = v_actor then 'posts.create' else 'posts.edit' end),
    case when p_campaign_id is null then 'post_campaign_unlinked' else 'post_campaign_linked' end, 'content',
    v_post.organization_id, null, 'post', p_post_id, jsonb_build_object('campaign', p_campaign_id)
  );
end;
$$;

-- The campaigns an article may point to: the association's own (not archived,
-- drafts included) and every public current campaign of the site.
create or replace function public.post_campaign_options(p_post_id uuid)
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
    'current', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'state', private.campaign_state(c),
                                          'is_public', private.campaign_is_public(c),
                                          'organization', private.organization_card(c.organization_id))
                  from public.recruitment_campaigns c where c.id = v_post.recruitment_campaign_id),
    'can_change', private.can_edit_post(v_actor, v_post)
                  and (v_post.publication = 'unpublished'
                       or private.user_has_organization_permission(v_actor, v_post.organization_id, 'posts.publish', now())),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'state', private.campaign_state(c),
                                          'own', c.organization_id = v_post.organization_id,
                                          'organization', private.organization_card(c.organization_id))
                       order by (c.organization_id = v_post.organization_id) desc, c.created_at desc)
        from (select * from public.recruitment_campaigns c
               where c.archived_at is null and c.status <> 'cancelled'
                 and ((c.organization_id = v_post.organization_id
                       and v_post.organization_id in (select private.my_recruitment_organization_ids()))
                      or (c.organization_id = v_post.organization_id and c.publication = 'published')
                      or (private.campaign_is_public(c) and private.campaign_state(c) in ('open', 'upcoming', 'paused')))
               order by c.created_at desc limit 60) as c), '[]'::jsonb));
end;
$$;

-- A published post as lists and pages show it, now with its event and its
-- recruitment campaign (live, public fields only; nothing when not visible).
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
    'event', (select private.event_card(e) from public.events e where e.id = p.event_id and private.event_is_public(e)),
    'campaign', (select private.campaign_card(rc) from public.recruitment_campaigns rc
                  where rc.id = p.recruitment_campaign_id and private.campaign_is_public(rc)))
    from public.posts p
    join public.post_revisions r on r.id = p.published_revision_id
    left join public.post_categories c on c.id = r.category_id
   where p.id = p_post_id;
$$;

revoke all on function public.set_post_campaign(uuid, uuid) from public, anon;
revoke all on function public.post_campaign_options(uuid) from public, anon;
grant execute on function public.set_post_campaign(uuid, uuid) to authenticated;
grant execute on function public.post_campaign_options(uuid) to authenticated;
