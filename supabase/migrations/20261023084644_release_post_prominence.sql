-- Phase 6 fix forward · a featured or important post that leaves the site
-- no longer holds its campus-wide slot.
--
-- Before: unpublish_post and archive_post released the association pin but
-- not the BDE's prominence, and set_post_prominence counted every post with
-- an unexpired prominence, shown or not. A featured post its association
-- unpublished (or whose page went offline) kept a slot nobody could see, and
-- the BDE got prominence_limit with fewer posts on the front page than the
-- limit — with no way to free the slot.
-- After: leaving the site (unpublish, archive) releases the prominence too,
-- and the limit counts only posts actually on display (published, not
-- hidden, on a public page), the same rule as public_featured_posts. A bad
-- end date gets its own refusal instead of the mandate wording.

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
     set publication = 'unpublished', unpublished_at = now(), archived_at = null, pinned_at = null, pinned_by = null,
         prominence = 'normal', prominence_until = null, prominence_by = null
   where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_unpublished', 'content',
    v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('prominence_released', v_post.prominence <> 'normal'),
    nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

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
    update public.posts
       set publication = 'archived', archived_at = now(), pinned_at = null, pinned_by = null,
           prominence = 'normal', prominence_until = null, prominence_by = null
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
    v_post.organization_id, null, 'post', p_post_id,
    case when p_archive then jsonb_build_object('prominence_released', v_post.prominence <> 'normal') else '{}'::jsonb end
  );
end;
$$;

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
      raise exception 'prominence_period' using errcode = 'P0001';
    end if;
    -- Only what the site shows takes a slot (same rule as public_featured_posts).
    if (select count(*) from public.posts p
         where p.prominence = p_prominence and p.id <> p_post_id
           and (p.prominence_until is null or p.prominence_until > now())
           and p.publication = 'published' and p.hidden_at is null
           and private.association_page_is_public(p.organization_id))
       >= (case p_prominence when 'featured' then 3 else 2 end) then
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

-- Posts that already hold a slot without being on the site give it back.
update public.posts
   set prominence = 'normal', prominence_until = null, prominence_by = null
 where prominence <> 'normal' and publication <> 'published';
