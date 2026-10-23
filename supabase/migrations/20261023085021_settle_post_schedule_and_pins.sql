-- Phase 6 fix forward · taking a post off the site settles what was planned
-- for it, and a hidden post cannot be pinned.
--
-- Before: unpublishing or archiving left a pending schedule in place, so at
-- its time the worker put the scheduled version online again (and out of the
-- archive) — the opposite of what the association had just decided. And
-- set_post_pin accepted a post hidden by moderation (invisible, but holding
-- one of the association's three pins).
-- After: unpublish_post and archive_post also cancel a pending or failed
-- schedule (recorded in their audit line), and set_post_pin refuses a hidden
-- post (post_hidden). Unpinning stays always possible.

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
         prominence = 'normal', prominence_until = null, prominence_by = null,
         scheduled_revision_id = null, scheduled_at = null, scheduled_by = null,
         schedule_status = null, schedule_error = null, schedule_attempted_at = null
   where id = p_post_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_post.organization_id, 'posts.publish'), 'post_unpublished', 'content',
    v_post.organization_id, null, 'post', p_post_id,
    jsonb_build_object('prominence_released', v_post.prominence <> 'normal',
                       'schedule_cancelled', v_post.scheduled_at is not null),
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
           prominence = 'normal', prominence_until = null, prominence_by = null,
           scheduled_revision_id = null, scheduled_at = null, scheduled_by = null,
           schedule_status = null, schedule_error = null, schedule_attempted_at = null
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
    case when p_archive
         then jsonb_build_object('prominence_released', v_post.prominence <> 'normal',
                                 'schedule_cancelled', v_post.scheduled_at is not null)
         else '{}'::jsonb end
  );
end;
$$;

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
    if v_post.hidden_at is not null then
      raise exception 'post_hidden' using errcode = 'P0001';
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
