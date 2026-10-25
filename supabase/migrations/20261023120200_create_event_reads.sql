-- Phase 7 · Reading events: the public read model (visitors), a student's
-- own registrations, the event team's desk and participant list, and the
-- BDE's platform list. Visitors only ever get public fields of published,
-- visible events; nobody but the student and the team holding
-- events.attendees.view ever sees who registered.

-- ---- Visitors ----------------------------------------------------------------------------------

-- Events overlapping [p_from, p_to) (default: everything not over yet),
-- in start order with keyset pages (p_after_at, p_after_id: the last item
-- seen), or newest first for the archive (p_order = 'desc'). Filters:
-- category, association, location type, availability, search (French full
-- text with accents folded, plus the association's name).
create or replace function public.public_events(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_category text default null,
  p_organization_slug text default null,
  p_location_type text default null,
  p_availability text default null,
  p_q text default null,
  p_after_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 30,
  p_order text default 'asc'
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
  ), chosen as (
    select e as ev, e.starts_at, e.id
      from public.events e
      join public.organizations o on o.id = e.organization_id
      left join public.event_categories c on c.id = e.category_id
      cross join q
     where e.publication = 'published' and e.hidden_at is null
       and private.association_page_is_public(e.organization_id)
       and e.ends_at > coalesce(p_from, case when p_order = 'desc' then '-infinity'::timestamptz else now() end)
       and (p_to is null or e.starts_at < p_to)
       -- The archive (newest first) lists only what is over.
       and (p_order <> 'desc' or e.ends_at <= coalesce(p_to, now()))
       and (p_category is null or c.slug = p_category)
       and (p_organization_slug is null or o.slug = p_organization_slug)
       and (p_location_type is null or e.location_type = p_location_type)
       and (p_availability is null
            or (p_availability = 'registration_open' and private.event_registration_state(e) in ('open', 'waitlist'))
            or (p_availability = 'no_registration' and private.event_registration_state(e) = 'none'))
       and (q.tsq is null or e.search @@ q.tsq or private.fold_accents(o.name) like '%' || q.raw || '%'
            or private.fold_accents(coalesce(o.short_name, '')) like '%' || q.raw || '%')
       and (p_after_at is null
            or (p_order = 'desc' and (e.starts_at, e.id) < (p_after_at, p_after_id))
            or (p_order <> 'desc' and (e.starts_at, e.id) > (p_after_at, p_after_id)))
     order by case when p_order = 'desc' then e.starts_at end desc,
              case when p_order = 'desc' then e.id end desc,
              case when p_order <> 'desc' then e.starts_at end asc,
              case when p_order <> 'desc' then e.id end asc
     limit least(greatest(coalesce(p_limit, 30), 1), 200)
  )
  select coalesce(jsonb_agg(private.event_card(chosen.ev) order by
           case when p_order = 'desc' then chosen.starts_at end desc,
           case when p_order = 'desc' then chosen.id end desc,
           case when p_order <> 'desc' then chosen.starts_at end asc,
           case when p_order <> 'desc' then chosen.id end asc), '[]'::jsonb)
    from chosen;
$$;

-- One event page: ok (with its description), moved (a former address), or not_found.
create or replace function public.public_event(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_moved text;
begin
  select * into v_event from public.events where slug = p_slug;
  if not found then
    select e.slug into v_moved
      from public.event_slug_history h join public.events e on e.id = h.event_id
     where h.slug = p_slug and private.event_is_public(e);
    if v_moved is not null then
      return jsonb_build_object('state', 'moved', 'slug', v_moved);
    end if;
    return jsonb_build_object('state', 'not_found');
  end if;
  if not private.event_is_public(v_event) then
    return jsonb_build_object('state', 'not_found');
  end if;
  return jsonb_build_object('state', 'ok', 'event', private.event_card(v_event) || jsonb_build_object('description', v_event.description));
end;
$$;

-- What the filters offer: upcoming counts by category, association and place.
create or replace function public.public_event_facets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with upcoming as (
    select e.* from public.events e
     where e.publication = 'published' and e.hidden_at is null and e.ends_at > now()
       and private.association_page_is_public(e.organization_id)
  )
  select jsonb_build_object(
    'total', (select count(*) from upcoming),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', c.slug, 'label', c.label, 'count', x.n) order by c.sort_order, c.label)
        from (select category_id, count(*) as n from upcoming where category_id is not null group by category_id) as x
        join public.event_categories c on c.id = x.category_id), '[]'::jsonb),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'accent', o.accent, 'count', x.n)
                       order by o.name)
        from (select organization_id, count(*) as n from upcoming group by organization_id) as x
        join public.organizations o on o.id = x.organization_id), '[]'::jsonb),
    'location_types', coalesce((select jsonb_object_agg(x.location_type, x.n)
                                  from (select location_type, count(*) as n from upcoming group by location_type) as x), '{}'::jsonb),
    'categories_all', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'label', c.label) order by c.sort_order, c.label)
                                  from public.event_categories c where c.archived_at is null), '[]'::jsonb));
$$;

-- Featured on the site by the BDE, upcoming and visible, soonest first.
create or replace function public.public_featured_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.event_card(e) order by e.starts_at, e.id), '[]'::jsonb)
    from public.events e
   where e.prominence = 'featured' and (e.prominence_until is null or e.prominence_until > now())
     and e.publication = 'published' and e.hidden_at is null and e.status = 'scheduled' and e.ends_at > now()
     and private.association_page_is_public(e.organization_id);
$$;

-- An association's events for its page: upcoming (its pinned ones first, then
-- the soonest), or past (newest first). An event counts as upcoming until it ends.
create or replace function public.public_association_events(p_slug text, p_when text default 'upcoming', p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.event_card(x.ev) order by
           case when p_when = 'past' then null else x.pinned_at end desc nulls last,
           case when p_when = 'past' then x.starts_at end desc,
           case when p_when = 'past' then null else x.starts_at end asc, x.id), '[]'::jsonb)
    from (select e as ev, e.pinned_at, e.starts_at, e.id
            from public.events e
            join public.organizations o on o.id = e.organization_id
           where o.slug = p_slug and e.publication = 'published' and e.hidden_at is null
             and private.association_page_is_public(e.organization_id)
             and (case when p_when = 'past' then e.ends_at <= now() else e.ends_at > now() end)
           order by case when p_when = 'past' then null else e.pinned_at end desc nulls last,
                    case when p_when = 'past' then e.starts_at end desc,
                    case when p_when = 'past' then null else e.starts_at end asc, e.id
           limit least(greatest(coalesce(p_limit, 6), 1), 50)) as x;
$$;

-- Dated editions of one of the BDE's events of the year.
create or replace function public.public_series_events(p_series_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.event_card(x.ev) order by x.starts_at desc, x.id), '[]'::jsonb)
    from (select e as ev, e.starts_at, e.id from public.events e
           where e.series_key = p_series_key and e.publication = 'published' and e.hidden_at is null
             and private.association_page_is_public(e.organization_id)
           order by e.starts_at desc limit 20) as x;
$$;

create or replace function public.public_event_sitemap()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', e.slug, 'updated_at', e.updated_at) order by e.starts_at desc), '[]'::jsonb)
    from (select * from public.events e
           where e.publication = 'published' and e.hidden_at is null
             and private.association_page_is_public(e.organization_id)
           order by e.starts_at desc limit 5000) as e;
$$;

-- ---- A student's own registrations ----------------------------------------------------------------

-- My registration for one event, my waiting place, and the private
-- instructions once my seat is confirmed (never otherwise).
create or replace function public.my_event_status(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  select * into v_reg from public.event_registrations
   where event_id = p_event_id and user_id = v_actor
   order by (status in ('confirmed', 'waitlisted')) desc, created_at desc
   limit 1;
  return jsonb_build_object(
    'bookmarked', exists (select 1 from public.event_bookmarks where user_id = v_actor and event_id = p_event_id),
    'profile_complete', exists (select 1 from public.profiles where id = v_actor and onboarding_completed_at is not null),
    'registration', case when v_reg.id is null then null else private.registration_result(v_reg, true) || jsonb_build_object(
        'created_at', v_reg.created_at, 'confirmed_at', v_reg.confirmed_at, 'promoted_at', v_reg.promoted_at,
        'cancelled_at', v_reg.cancelled_at, 'cancel_source', v_reg.cancel_source,
        'cancel_reason', case when v_reg.cancel_source = 'organizer' then v_reg.cancel_reason end,
        'can_cancel', v_reg.status in ('confirmed', 'waitlisted') and v_event.status = 'scheduled' and now() < v_event.starts_at
                      and (v_reg.status = 'waitlisted' or v_event.cancellation_cutoff_minutes = 0
                           or now() <= v_event.starts_at - make_interval(mins => v_event.cancellation_cutoff_minutes)),
        'access_details', case when v_reg.status = 'confirmed' and v_event.status = 'scheduled' then v_event.access_details end)
      end);
end;
$$;

-- Everything I signed up for or saved, with each event's public card (an
-- event hidden by moderation or taken off the site shows its title and dates
-- only, so the student still knows what they registered for).
create or replace function public.my_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  return jsonb_build_object(
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'registration', private.registration_result(r.reg, true) || jsonb_build_object(
                  'created_at', r.created_at, 'confirmed_at', r.confirmed_at, 'promoted_at', r.promoted_at,
                  'cancelled_at', r.cancelled_at, 'cancel_source', r.cancel_source,
                  'cancel_reason', case when r.cancel_source = 'organizer' then r.cancel_reason end,
                  'can_cancel', r.status in ('confirmed', 'waitlisted') and e.status = 'scheduled' and now() < e.starts_at
                                and (r.status = 'waitlisted' or e.cancellation_cutoff_minutes = 0
                                     or now() <= e.starts_at - make_interval(mins => e.cancellation_cutoff_minutes)),
                  'access_details', case when r.status = 'confirmed' and e.status = 'scheduled' and e.ends_at > now()
                                         then e.access_details end),
               'event', case when private.event_is_public(e) then private.event_card(e)
                             else jsonb_build_object('id', e.id, 'slug', null, 'title', e.title, 'starts_at', e.starts_at,
                                                     'ends_at', e.ends_at, 'timezone', e.timezone,
                                                     'organization', private.organization_card(e.organization_id),
                                                     'status', case when e.status = 'cancelled' then 'cancelled'
                                                                    when e.ends_at <= now() then 'completed' else 'scheduled' end,
                                                     'cancellation_reason', e.cancellation_reason, 'unavailable', true) end)
             order by e.starts_at desc, r.created_at desc)
        from (select distinct on (x.event_id) x as reg, x.event_id, x.status, x.created_at, x.confirmed_at, x.promoted_at,
                     x.cancelled_at, x.cancel_source, x.cancel_reason
                from public.event_registrations x
               where x.user_id = v_actor
               order by x.event_id, (x.status in ('confirmed', 'waitlisted')) desc, x.created_at desc) as r
        join public.events e on e.id = r.event_id), '[]'::jsonb),
    'bookmarks', coalesce((
      select jsonb_agg(private.event_card(e) order by e.starts_at)
        from public.event_bookmarks b
        join public.events e on e.id = b.event_id
       where b.user_id = v_actor and private.event_is_public(e)), '[]'::jsonb));
end;
$$;

-- ---- The event team ---------------------------------------------------------------------------------

create or replace function private.event_summary(p_event public.events, p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_event.id, 'slug', p_event.slug, 'title', p_event.title, 'series_key', p_event.series_key,
    'starts_at', p_event.starts_at, 'ends_at', p_event.ends_at, 'timezone', p_event.timezone,
    'location', jsonb_build_object('type', p_event.location_type, 'venue', p_event.venue_name, 'city', p_event.city),
    'cover', private.media_json(p_event.cover_media_id),
    'category', (select c.label from public.event_categories c where c.id = p_event.category_id),
    'publication', p_event.publication, 'status', p_event.status,
    'first_published_at', p_event.first_published_at, 'cancelled_at', p_event.cancelled_at,
    'hidden', case when p_event.hidden_at is null then null
                   else jsonb_build_object('at', p_event.hidden_at, 'reason', p_event.hidden_reason) end,
    'registration', jsonb_build_object(
      'mode', p_event.registration_mode, 'state', private.event_registration_state(p_event),
      'opens_at', p_event.registration_opens_at, 'closes_at', private.event_registration_closes(p_event),
      'capacity', p_event.capacity, 'confirmed', p_event.confirmed_count,
      'waitlist_enabled', p_event.waitlist_enabled, 'waitlist', p_event.waitlist_count),
    'pinned', p_event.pinned_at is not null,
    'prominence', p_event.prominence,
    'created_by_name', private.person_name(p_event.created_by), 'created_by_you', p_event.created_by = p_actor,
    'updated_at', p_event.updated_at,
    'updated_by_name', case when p_event.updated_by is null then null else private.person_name(p_event.updated_by) end,
    -- Operational health: messages to participants not delivered by e-mail yet.
    'emails', (select jsonb_build_object(
                 'pending', count(*) filter (where o.email_status in ('pending', 'sending')),
                 'failed', count(*) filter (where o.email_status = 'failed'))
                 from public.notification_outbox o where o.event_id = p_event.id),
    'is_public', private.event_is_public(p_event),
    'blocker', private.event_blocker(p_event));
$$;

-- The association's event desk: its events as the caller may see them
-- (everything for editors and publishers, one's own drafts for an author who
-- only holds events.create) and what the caller may do. Counts only: no person.
create or replace function public.event_dashboard(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_create boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.create', now());
  v_edit boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.edit', now());
  v_publish boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.publish', now());
  v_view boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.attendees.view', now());
  v_manage boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.attendees.manage', now());
  v_export boolean := private.user_has_organization_permission(v_actor, p_organization_id, 'events.attendees.export', now());
  v_all boolean := v_edit or v_publish or v_view;
begin
  if not (v_create or v_all) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return (
    select jsonb_build_object(
      'organization', jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                         'accent', o.accent, 'kind', o.kind, 'status', o.status,
                                         'page_public', private.association_page_is_public(o.id)),
      'can', jsonb_build_object('create', v_create or v_edit, 'edit', v_edit, 'publish', v_publish,
                                'attendees_view', v_view, 'attendees_manage', v_manage, 'attendees_export', v_export,
                                'all', v_all),
      'events', coalesce((
        select jsonb_agg(private.event_summary(e, v_actor) order by e.starts_at nulls first, e.created_at desc)
          from public.events e
         where e.organization_id = o.id
           and (v_all or (v_create and e.created_by = v_actor))), '[]'::jsonb))
      from public.organizations o
     where o.id = p_organization_id
  );
end;
$$;

-- One event for its editor: every field (private instructions included),
-- co-organizers, the catalog, the image library, the history and what the
-- caller may do.
create or replace function public.event_editor(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_org uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  v_org := v_event.organization_id;
  if not (v_event.id in (select private.my_readable_event_ids())
          or private.user_has_organization_permission(v_actor, v_org, 'events.attendees.view', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'event', to_jsonb(v_event) - 'search' - 'created_by' - 'updated_by' - 'cancelled_by' - 'hidden_by' - 'pinned_by' - 'prominence_by',
    'summary', private.event_summary(v_event, v_actor),
    'organization', private.organization_card(v_org)
                    || jsonb_build_object('status', (select status from public.organizations where id = v_org),
                                          'page_public', private.association_page_is_public(v_org)),
    'coorganizers', (select coalesce(jsonb_agg(private.organization_card(co.organization_id) order by co.position), '[]'::jsonb)
                       from public.event_coorganizers co where co.event_id = p_event_id),
    'organizations', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'short_name', o.short_name)
                                                order by o.name), '[]'::jsonb)
                        from public.organizations o where o.status in ('active', 'setup') and o.id <> v_org),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'label', c.label,
                                                                'archived', c.archived_at is not null)
                                             order by c.sort_order, c.label), '[]'::jsonb)
                     from public.event_categories c where c.archived_at is null or c.id = v_event.category_id),
    'media', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'path', m.object_path, 'kind', m.kind,
                                                           'width', m.width, 'height', m.height, 'alt', m.alt_text)
                                        order by m.created_at desc), '[]'::jsonb)
                from public.association_media m where m.organization_id = v_org and m.removed_at is null),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                    'occurred_at', g.occurred_at, 'action', g.action,
                    'actor_name', case when g.actor_user_id is null then null else private.person_name(g.actor_user_id) end,
                    'details', g.details, 'reason', g.reason) order by g.occurred_at desc), '[]'::jsonb)
                  from (select * from public.governance_audit_events
                         where resource_type = 'event' and resource_id = p_event_id
                         order by occurred_at desc limit 50) as g),
    'creator_name', private.person_name(v_event.created_by),
    'can', jsonb_build_object(
      'edit', private.can_edit_event(v_actor, v_event),
      'publish', private.user_has_organization_permission(v_actor, v_org, 'events.publish', now()),
      'upload', private.can_upload_media(v_actor, v_org),
      'attendees_view', private.user_has_organization_permission(v_actor, v_org, 'events.attendees.view', now()),
      'attendees_manage', private.user_has_organization_permission(v_actor, v_org, 'events.attendees.manage', now()),
      'attendees_export', private.user_has_organization_permission(v_actor, v_org, 'events.attendees.export', now()),
      'delete', private.can_edit_event(v_actor, v_event) and v_event.first_published_at is null,
      'series', v_org = private.bde_organization_id())
  );
end;
$$;

-- The event as visitors will see it, for its team (drafts included).
create or replace function public.event_preview(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if not v_event.id in (select private.my_readable_event_ids()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return private.event_card(v_event) || jsonb_build_object(
    'description', v_event.description, 'publication', v_event.publication, 'is_public', private.event_is_public(v_event),
    'access_details', v_event.access_details, 'blocker', private.event_blocker(v_event));
end;
$$;

-- Who registered (events.attendees.view): name, status, dates, reference and
-- waiting place, nothing else from the profile (no e-mail, no programme).
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
    with rows as (
      select r.*, private.person_name(r.user_id) as name,
             case when r.status = 'waitlisted' then
               (select count(*) from public.event_registrations w
                 where w.event_id = r.event_id and w.status = 'waitlisted' and w.queue_position <= r.queue_position) end as position
        from public.event_registrations r
       where r.event_id = p_event_id
         and (p_status is null or r.status = p_status)
         -- A cancelled row is history; the person's current row wins.
         and (r.status <> 'cancelled' or not exists (
               select 1 from public.event_registrations a
                where a.event_id = r.event_id and a.user_id = r.user_id and a.status in ('confirmed', 'waitlisted')))
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
                   from public.event_registrations where event_id = p_event_id),
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

-- The participant list to download (events.attendees.export), audited.
-- Same fields as the screen; never stored anywhere by the site.
create or replace function public.export_event_attendees(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_rows jsonb;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.attendees.export');
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', private.person_name(r.user_id), 'status', r.status, 'reference', r.reference,
           'created_at', r.created_at, 'confirmed_at', r.confirmed_at,
           'position', case when r.status = 'waitlisted' then
             (select count(*) from public.event_registrations w
               where w.event_id = r.event_id and w.status = 'waitlisted' and w.queue_position <= r.queue_position) end)
           order by case r.status when 'confirmed' then 0 else 1 end, r.queue_position nulls last, r.created_at), '[]'::jsonb)
    into v_rows
    from public.event_registrations r
   where r.event_id = p_event_id and r.status in ('confirmed', 'waitlisted');
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.attendees.export'), 'event_attendees_exported', 'events',
    v_event.organization_id, null, 'event', p_event_id, jsonb_build_object('rows', jsonb_array_length(v_rows))
  );
  return jsonb_build_object('event', jsonb_build_object('title', v_event.title, 'starts_at', v_event.starts_at, 'slug', v_event.slug),
                            'rows', v_rows);
end;
$$;

-- ---- BDE: the site's events (public information and counts only) ------------------------------------

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
             order by e.starts_at limit 100) as x), '[]'::jsonb);
end;
$$;

-- ---- Images: event covers are public while their event is ----------------------------------------

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
         or exists (select 1 from public.events e where e.cover_media_id = m.id and private.event_is_public(e))
       )
  );
$$;

-- An image an event uses is never removed (as for pages and articles).
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
     or exists (select 1 from public.post_revision_media rm where rm.media_id = v_media.id)
     or exists (select 1 from public.events e where e.cover_media_id = v_media.id) then
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

-- Event teams (events.create) may send images too.
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
  v_key := case when private.user_has_organization_permission(v_actor, p_organization_id, 'media.manage', now()) then 'media.manage'
                when private.user_has_organization_permission(v_actor, p_organization_id, 'posts.create', now()) then 'posts.create'
                else 'events.create' end;
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

-- ---- Privileges ---------------------------------------------------------------------------------

revoke all on function private.event_summary(public.events, uuid) from public, anon, authenticated, service_role;

revoke all on function public.public_events(timestamptz, timestamptz, text, text, text, text, text, timestamptz, uuid, integer, text) from public;
revoke all on function public.public_event(text) from public;
revoke all on function public.public_event_facets() from public;
revoke all on function public.public_featured_events() from public;
revoke all on function public.public_association_events(text, text, integer) from public;
revoke all on function public.public_series_events(text) from public;
revoke all on function public.public_event_sitemap() from public;
grant execute on function public.public_events(timestamptz, timestamptz, text, text, text, text, text, timestamptz, uuid, integer, text) to anon, authenticated;
grant execute on function public.public_event(text) to anon, authenticated;
grant execute on function public.public_event_facets() to anon, authenticated;
grant execute on function public.public_featured_events() to anon, authenticated;
grant execute on function public.public_association_events(text, text, integer) to anon, authenticated;
grant execute on function public.public_series_events(text) to anon, authenticated;
grant execute on function public.public_event_sitemap() to anon, authenticated;

revoke all on function public.my_event_status(uuid) from public, anon;
revoke all on function public.my_events() from public, anon;
revoke all on function public.event_dashboard(uuid) from public, anon;
revoke all on function public.event_editor(uuid) from public, anon;
revoke all on function public.event_preview(uuid) from public, anon;
revoke all on function public.event_attendees(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.export_event_attendees(uuid) from public, anon;
revoke all on function public.platform_events(text, text) from public, anon;
grant execute on function public.my_event_status(uuid) to authenticated;
grant execute on function public.my_events() to authenticated;
grant execute on function public.event_dashboard(uuid) to authenticated;
grant execute on function public.event_editor(uuid) to authenticated;
grant execute on function public.event_preview(uuid) to authenticated;
grant execute on function public.event_attendees(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.export_event_attendees(uuid) to authenticated;
grant execute on function public.platform_events(text, text) to authenticated;
