-- Phase 7 · Fixes to the event reads found while building the pages
-- (fix forward; the functions keep their signatures and grants):
--  1. platform_events ?vue=passes listed the 100 *oldest* past events: the
--     archive now takes the 100 most recent, newest first.
--  2. post_event_options: the current event carries its address (slug), so
--     the article editor can link to its public page.
--  3. event_attendees: "cancelled" counted the old rows of people who
--     registered again; it now counts people whose registration is cancelled.

create or replace function public.platform_events(p_q text default null, p_view text default 'upcoming')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_raw text := private.fold_accents(btrim(coalesce(p_q, '')));
begin
  if not (private.user_has_platform_permission(v_actor, 'platform.content.moderate', now())
          or private.user_has_platform_permission(v_actor, 'platform.content.feature', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(private.event_card(x.ev) || jsonb_build_object(
             'hidden', case when (x.ev).hidden_at is null then null
                            else jsonb_build_object('at', (x.ev).hidden_at, 'reason', (x.ev).hidden_reason,
                                                    'by_name', case when (x.ev).hidden_by is null then null
                                                                    else private.person_name((x.ev).hidden_by) end) end,
             'publication', (x.ev).publication, 'is_public', private.event_is_public(x.ev))
             order by case when p_view = 'past' then null else x.starts_at end asc,
                      case when p_view = 'past' then x.starts_at end desc)
      from (select e as ev, e.starts_at from public.events e
              join public.organizations o on o.id = e.organization_id
             where e.first_published_at is not null
               and (case p_view when 'hidden' then e.hidden_at is not null
                                when 'past' then e.ends_at <= now()
                                else e.ends_at > now() end)
               and (v_raw = '' or private.fold_accents(e.title) like '%' || v_raw || '%'
                    or private.fold_accents(o.name) like '%' || v_raw || '%')
             -- The archive keeps the most recent; the other views the soonest.
             order by case when p_view = 'past' then e.starts_at end desc,
                      case when p_view = 'past' then null else e.starts_at end asc
             limit 100) as x), '[]'::jsonb);
end;
$$;

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
    'current', (select jsonb_build_object('id', e.id, 'slug', e.slug, 'title', e.title, 'starts_at', e.starts_at,
                                          'publication', e.publication, 'status', e.status,
                                          'is_public', private.event_is_public(e),
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

create or replace function public.event_attendees(
  p_event_id uuid, p_status text default null, p_q text default null, p_offset integer default 0, p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_raw text := private.fold_accents(btrim(coalesce(p_q, '')));
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.attendees.view');
  return (
    with current_rows as (
      -- One row per person: the active registration, else the latest cancelled one.
      select distinct on (r.user_id) r.*
        from public.event_registrations r
       where r.event_id = p_event_id
       order by r.user_id, (r.status in ('confirmed', 'waitlisted')) desc, r.created_at desc
    ), rows as (
      select r.*, private.person_name(r.user_id) as name,
             case when r.status = 'waitlisted' then
               (select count(*) from public.event_registrations w
                 where w.event_id = r.event_id and w.status = 'waitlisted' and w.queue_position <= r.queue_position) end as position
        from current_rows r
       where p_status is null or r.status = p_status
    ), filtered as (
      select * from rows where v_raw = '' or private.fold_accents(name) like '%' || v_raw || '%' or lower(reference) = v_raw
    )
    select jsonb_build_object(
      'event', private.event_summary(v_event, v_actor),
      'total', (select count(*) from filtered),
      'counts', (select jsonb_build_object(
                   'confirmed', count(*) filter (where status = 'confirmed'),
                   'waitlisted', count(*) filter (where status = 'waitlisted'),
                   'cancelled', count(*) filter (where status = 'cancelled'))
                   from current_rows),
      'can_manage', private.user_has_organization_permission(v_actor, v_event.organization_id, 'events.attendees.manage', now()),
      'can_export', private.user_has_organization_permission(v_actor, v_event.organization_id, 'events.attendees.export', now()),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', f.id, 'name', f.name, 'status', f.status, 'reference', f.reference, 'position', f.position,
                 'created_at', f.created_at, 'confirmed_at', f.confirmed_at, 'promoted_at', f.promoted_at,
                 'cancelled_at', f.cancelled_at, 'cancel_source', f.cancel_source, 'cancel_reason', f.cancel_reason)
                 order by case f.status when 'confirmed' then 0 when 'waitlisted' then 1 else 2 end,
                          f.queue_position nulls last, f.created_at)
          from (select * from filtered
                 order by case status when 'confirmed' then 0 when 'waitlisted' then 1 else 2 end,
                          queue_position nulls last, created_at
                 offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 50), 1), 200)) as f), '[]'::jsonb)
    )
  );
end;
$$;
