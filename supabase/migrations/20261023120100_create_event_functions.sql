-- Phase 7 · Event operations: editing, publication, cancellation, the
-- registration engine and its waiting list, moderation, bookmarks, and the
-- notification outbox. Every function identifies the caller itself
-- (auth.uid()), checks the right in the event's own organization, writes in
-- one transaction and audits organizer actions.
--
-- Concurrency: every operation that touches seats locks the event row first
-- (select … for update), then registrations. One lock order everywhere, so no
-- deadlock; one event lock, so two requests can never both take the last seat.

-- ---- Internals ----------------------------------------------------------------------------

-- Words the site uses under /events, and the BDE's events of the year.
create or replace function private.event_reserved_slugs()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['apercu', 'calendrier', 'calendar', 'rss', 'flux', 'nouveau', 'new', 'recherche', 'ics',
               'wei', 'boo-party', 'well', 'rose-rain', 'desintegration', 'apero-attack', 'barathons',
               'campagne-des-listes'];
$$;

create or replace function private.unique_event_slug(p_title text, p_event_id uuid)
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
  if char_length(v_base) < 3 or v_base = any (private.event_reserved_slugs()) then
    v_base := 'evenement-' || coalesce(nullif(v_base, ''), 'campus');
  end if;
  v_slug := v_base;
  while exists (select 1 from public.events where slug = v_slug and id <> p_event_id)
     or exists (select 1 from public.event_slug_history where slug = v_slug and event_id <> p_event_id) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

-- What visitors may see: published, not hidden, on a public association page.
-- (Cancelled events stay visible, with their cancellation notice.)
create or replace function private.event_is_public(p_event public.events)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_event.publication = 'published' and p_event.hidden_at is null
     and private.association_page_is_public(p_event.organization_id);
$$;

-- Registration closes at registration_closes_at, and at the latest when the event starts.
create or replace function private.event_registration_closes(p_event public.events)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select least(coalesce(p_event.registration_closes_at, p_event.starts_at), p_event.starts_at);
$$;

-- Where registration stands, for everyone (no personal data):
-- none | external | upcoming | open | waitlist | full | closed | cancelled | past.
create or replace function private.event_registration_state(p_event public.events)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_event.status = 'cancelled' then 'cancelled'
    when p_event.ends_at <= now() then 'past'
    when p_event.registration_mode = 'none' then 'none'
    when p_event.registration_mode = 'external' then 'external'
    when p_event.registration_opens_at is not null and now() < p_event.registration_opens_at then 'upcoming'
    when now() >= private.event_registration_closes(p_event) then 'closed'
    when p_event.capacity is not null and p_event.confirmed_count >= p_event.capacity
      then case when p_event.waitlist_enabled then 'waitlist' else 'full' end
    else 'open'
  end;
$$;

-- An event as visitors see it: public fields only, never access_details, never a person.
create or replace function private.event_card(p_event public.events)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_event.id, 'slug', p_event.slug, 'series_key', p_event.series_key,
    'title', p_event.title, 'summary', p_event.summary,
    'category', (select jsonb_build_object('slug', c.slug, 'label', c.label) from public.event_categories c
                  where c.id = p_event.category_id),
    'cover', private.media_json(p_event.cover_media_id),
    'organization', private.organization_card(p_event.organization_id),
    'coorganizers', (select coalesce(jsonb_agg(private.organization_card(co.organization_id) order by co.position), '[]'::jsonb)
                       from public.event_coorganizers co where co.event_id = p_event.id),
    'starts_at', p_event.starts_at, 'ends_at', p_event.ends_at, 'timezone', p_event.timezone,
    'location', jsonb_build_object('type', p_event.location_type, 'venue', p_event.venue_name,
                                   'address', p_event.address_line, 'city', p_event.city,
                                   'latitude', p_event.latitude, 'longitude', p_event.longitude,
                                   'online_url', p_event.online_url,
                                   'has_private_details', p_event.access_details is not null),
    'status', case when p_event.status = 'cancelled' then 'cancelled'
                   when p_event.ends_at <= now() then 'completed' else 'scheduled' end,
    'cancelled_at', p_event.cancelled_at, 'cancellation_reason', p_event.cancellation_reason,
    'registration', jsonb_build_object(
      'mode', p_event.registration_mode, 'state', private.event_registration_state(p_event),
      'external_url', p_event.external_url,
      'opens_at', p_event.registration_opens_at, 'closes_at', private.event_registration_closes(p_event),
      'capacity', p_event.capacity, 'confirmed', p_event.confirmed_count,
      'waitlist_enabled', p_event.waitlist_enabled, 'waitlist', p_event.waitlist_count,
      'cancellation_cutoff_minutes', p_event.cancellation_cutoff_minutes),
    'prominence', case when p_event.prominence <> 'normal' and (p_event.prominence_until is null or p_event.prominence_until > now())
                       then p_event.prominence else 'normal' end,
    'pinned', p_event.pinned_at is not null,
    'first_published_at', p_event.first_published_at, 'published_at', p_event.published_at);
$$;

-- What a message about the event says (a snapshot: later edits never rewrite it).
create or replace function private.event_message_payload(p_event public.events)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', p_event.title, 'slug', p_event.slug,
    'organization', (select coalesce(o.short_name, o.name) from public.organizations o where o.id = p_event.organization_id),
    'starts_at', p_event.starts_at, 'ends_at', p_event.ends_at, 'timezone', p_event.timezone,
    'location_type', p_event.location_type, 'venue', p_event.venue_name, 'city', p_event.city);
$$;

create or replace function private.enqueue_notification(
  p_recipient uuid, p_kind text, p_event public.events, p_dedupe_key text, p_extra jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_outbox (recipient_id, kind, event_id, payload, dedupe_key)
  values (p_recipient, p_kind, p_event.id, private.event_message_payload(p_event) || coalesce(p_extra, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) do nothing;
$$;

-- Everyone holding a seat or a waiting place hears about a change.
create or replace function private.notify_event_participants(
  p_event public.events, p_kind text, p_key text, p_extra jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg record;
  v_count integer := 0;
begin
  for v_reg in
    select r.id, r.user_id, r.status from public.event_registrations r
     where r.event_id = p_event.id and r.status in ('confirmed', 'waitlisted')
  loop
    perform private.enqueue_notification(v_reg.user_id, p_kind, p_event, 'event:' || p_event.id || ':' || p_key || ':' || v_reg.user_id,
                                         p_extra || jsonb_build_object('registration_status', v_reg.status));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Promotion is automatic while registrations are open: after closing time (or
-- once the event has started) a freed seat stays free and the list is frozen.
create or replace function private.event_promotion_open(p_event public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event.status = 'scheduled' and p_event.publication = 'published' and p_event.registration_mode = 'internal'
     and p_event.waitlist_enabled and now() < private.event_registration_closes(p_event);
$$;

-- Confirms waiting students in queue order while seats are free. The caller
-- holds the event's row lock: no other operation can take a seat meanwhile.
create or replace function private.promote_from_waitlist(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
  v_count integer := 0;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found or not private.event_promotion_open(v_event) then
    return 0;
  end if;
  loop
    exit when v_event.capacity is not null and v_event.confirmed_count >= v_event.capacity;
    select * into v_reg from public.event_registrations
     where event_id = p_event_id and status = 'waitlisted'
     order by queue_position
     limit 1
     for update;
    exit when not found;
    update public.event_registrations
       set status = 'confirmed', confirmed_at = now(), promoted_at = now()
     where id = v_reg.id;
    update public.events set confirmed_count = confirmed_count + 1, waitlist_count = waitlist_count - 1
     where id = p_event_id
    returning * into v_event;
    perform private.enqueue_notification(v_reg.user_id, 'event_promoted', v_event, 'reg:' || v_reg.id || ':promoted');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.registration_result(p_reg public.event_registrations, p_already boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_id', p_reg.id, 'status', p_reg.status, 'reference', p_reg.reference, 'already', p_already,
    'position', case when p_reg.status = 'waitlisted' then
                  (select count(*) from public.event_registrations r
                    where r.event_id = p_reg.event_id and r.status = 'waitlisted' and r.queue_position <= p_reg.queue_position)
                end);
$$;

-- May edit this event: events.edit, or its author's own draft with events.create.
create or replace function private.can_edit_event(p_actor uuid, p_event public.events)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_organization_permission(p_actor, p_event.organization_id, 'events.edit', now())
      or (p_event.created_by = p_actor and p_event.first_published_at is null
          and private.user_has_organization_permission(p_actor, p_event.organization_id, 'events.create', now()));
$$;

-- What a published event still lacks, or null when it can go online.
create or replace function private.event_blocker(p_event public.events)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := (select status from public.organizations where id = p_event.organization_id);
begin
  if p_event.hidden_at is not null then
    return 'event_hidden';
  end if;
  if p_event.status = 'cancelled' then
    return 'event_cancelled';
  end if;
  if v_status <> 'active' then
    return 'organization_inactive';
  end if;
  if not private.association_page_is_public(p_event.organization_id) then
    return 'page_not_public';
  end if;
  if char_length(p_event.title) < 3 or p_event.summary is null or p_event.starts_at is null or p_event.ends_at is null
     or (p_event.location_type in ('campus', 'external') and p_event.venue_name is null)
     or (p_event.registration_mode = 'external' and p_event.external_url is null) then
    return 'event_incomplete';
  end if;
  if p_event.ends_at <= now() then
    return 'event_past';
  end if;
  if p_event.cover_media_id is not null and not exists (
       select 1 from public.association_media m
        where m.id = p_event.cover_media_id and m.organization_id = p_event.organization_id and m.removed_at is null) then
    return 'media_not_found';
  end if;
  return null;
end;
$$;

-- ---- Writing an event -----------------------------------------------------------------------

create or replace function public.create_event(p_organization_id uuid, p_title text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_status text;
  v_id uuid;
begin
  if not (private.user_has_organization_permission(v_actor, p_organization_id, 'events.create', now())
          or private.user_has_organization_permission(v_actor, p_organization_id, 'events.edit', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select status into v_status from public.organizations where id = p_organization_id;
  if v_status not in ('active', 'setup') then
    raise exception 'organization_inactive' using errcode = 'P0001';
  end if;
  begin
    insert into public.events (organization_id, created_by, title, updated_by)
    values (p_organization_id, v_actor, btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), v_actor)
    returning id into v_id;
  exception
    when check_violation then
      raise exception 'event_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id,
                                   case when private.user_has_organization_permission(v_actor, p_organization_id, 'events.create', now())
                                        then 'events.create' else 'events.edit' end),
    'event_created', 'events', p_organization_id, null, 'event', v_id, '{}'::jsonb
  );
  return v_id;
end;
$$;

-- Saves part of an event (only the keys sent). The version guards against a
-- teammate's newer save. On an event that has been online, changing its date,
-- place or registration ("material" changes) needs events.publish, is audited
-- with the old and new values, and tells every participant; registrations are
-- never changed silently (capacity never below the confirmed seats, the mode
-- never switched away while someone is registered, the waiting list never
-- closed while someone waits).
create or replace function public.save_event(p_event_id uuid, p_version integer, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.events%rowtype;
  v_new public.events%rowtype;
  v_key text;
  v_coorganizers uuid[];
  v_version integer;
  v_dates boolean;
  v_place boolean;
  v_registration boolean;
  v_constraint text;
  v_promoted integer := 0;
  v_notified integer := 0;
  v_allowed constant text[] := array[
    'title', 'summary', 'description', 'category_id', 'cover_media_id', 'series_key',
    'location_type', 'venue_name', 'address_line', 'city', 'latitude', 'longitude', 'online_url', 'access_details',
    'starts_at', 'ends_at', 'registration_mode', 'external_url', 'capacity', 'waitlist_enabled',
    'registration_opens_at', 'registration_closes_at', 'cancellation_cutoff_minutes', 'coorganizer_ids'];
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'event_invalid' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not v_key = any (v_allowed) then
      raise exception 'event_invalid' using errcode = 'P0001', detail = v_key;
    end if;
  end loop;

  select * into v_old from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_event(v_actor, v_old) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if not private.organization_status_allows((select status from public.organizations where id = v_old.organization_id), 'events.edit') then
    raise exception 'organization_inactive' using errcode = 'P0001';
  end if;
  if v_old.version is distinct from p_version then
    raise exception 'draft_conflict' using errcode = 'P0001';
  end if;
  if v_old.status = 'cancelled' then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;

  begin
    v_new := jsonb_populate_record(v_old, p_patch - 'coorganizer_ids');
  exception
    when invalid_text_representation or datatype_mismatch or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'event_invalid' using errcode = 'P0001';
  end;

  -- Referenced rows must be usable by this organization.
  if v_new.category_id is distinct from v_old.category_id and v_new.category_id is not null
     and not exists (select 1 from public.event_categories where id = v_new.category_id and archived_at is null) then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  if v_new.cover_media_id is not null and not exists (
       select 1 from public.association_media m
        where m.id = v_new.cover_media_id and m.organization_id = v_old.organization_id and m.removed_at is null) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  if v_new.series_key is not null and v_old.organization_id is distinct from private.bde_organization_id() then
    raise exception 'event_invalid' using errcode = 'P0001', detail = 'series_key';
  end if;

  v_dates := v_new.starts_at is distinct from v_old.starts_at or v_new.ends_at is distinct from v_old.ends_at;
  v_place := v_new.location_type is distinct from v_old.location_type or v_new.venue_name is distinct from v_old.venue_name
          or v_new.address_line is distinct from v_old.address_line or v_new.city is distinct from v_old.city
          or v_new.latitude is distinct from v_old.latitude or v_new.longitude is distinct from v_old.longitude
          or v_new.online_url is distinct from v_old.online_url or v_new.access_details is distinct from v_old.access_details;
  v_registration := v_new.registration_mode is distinct from v_old.registration_mode
          or v_new.capacity is distinct from v_old.capacity or v_new.waitlist_enabled is distinct from v_old.waitlist_enabled
          or v_new.registration_opens_at is distinct from v_old.registration_opens_at
          or v_new.registration_closes_at is distinct from v_old.registration_closes_at
          or v_new.cancellation_cutoff_minutes is distinct from v_old.cancellation_cutoff_minutes
          or v_new.external_url is distinct from v_old.external_url;

  if v_old.first_published_at is not null and (v_dates or v_place or v_registration) then
    perform private.require_organization_permission(v_actor, v_old.organization_id, 'events.publish');
    if v_dates and v_old.publication = 'published' and v_new.ends_at <= now() then
      raise exception 'event_past' using errcode = 'P0001';
    end if;
  end if;
  if v_old.confirmed_count + v_old.waitlist_count > 0 then
    if v_new.registration_mode <> 'internal' then
      raise exception 'registration_mode_locked' using errcode = 'P0001';
    end if;
    if v_new.capacity is not null and v_new.capacity < v_old.confirmed_count then
      raise exception 'capacity_below_confirmed' using errcode = 'P0001';
    end if;
    if not v_new.waitlist_enabled and v_old.waitlist_count > 0 then
      raise exception 'waitlist_not_empty' using errcode = 'P0001';
    end if;
  end if;

  begin
    update public.events
       set title = btrim(regexp_replace(coalesce(v_new.title, ''), '\s+', ' ', 'g')),
           summary = nullif(btrim(v_new.summary), ''),
           description = nullif(btrim(v_new.description), ''),
           category_id = v_new.category_id,
           cover_media_id = v_new.cover_media_id,
           series_key = v_new.series_key,
           location_type = v_new.location_type,
           venue_name = nullif(btrim(v_new.venue_name), ''),
           address_line = nullif(btrim(v_new.address_line), ''),
           city = nullif(btrim(v_new.city), ''),
           latitude = v_new.latitude,
           longitude = v_new.longitude,
           online_url = nullif(btrim(v_new.online_url), ''),
           access_details = nullif(btrim(v_new.access_details), ''),
           starts_at = v_new.starts_at,
           ends_at = v_new.ends_at,
           registration_mode = v_new.registration_mode,
           external_url = nullif(btrim(v_new.external_url), ''),
           capacity = v_new.capacity,
           waitlist_enabled = v_new.waitlist_enabled,
           registration_opens_at = v_new.registration_opens_at,
           registration_closes_at = v_new.registration_closes_at,
           cancellation_cutoff_minutes = v_new.cancellation_cutoff_minutes,
           version = version + 1,
           updated_by = v_actor
     where id = p_event_id
    returning * into v_new;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'event_invalid' using errcode = 'P0001', detail = coalesce(v_constraint, '');
  end;

  if p_patch ? 'coorganizer_ids' then
    begin
      v_coorganizers := array(select distinct (x)::uuid from jsonb_array_elements_text(coalesce(p_patch -> 'coorganizer_ids', '[]'::jsonb)) as x);
    exception
      when invalid_text_representation then
        raise exception 'event_invalid' using errcode = 'P0001', detail = 'coorganizer_ids';
    end;
    if cardinality(v_coorganizers) > 3 or v_old.organization_id = any (v_coorganizers)
       or exists (select 1 from unnest(v_coorganizers) as c (id)
                   where not exists (select 1 from public.organizations o where o.id = c.id and o.status in ('active', 'setup'))) then
      raise exception 'event_invalid' using errcode = 'P0001', detail = 'coorganizer_ids';
    end if;
    delete from public.event_coorganizers where event_id = p_event_id;
    insert into public.event_coorganizers (event_id, organization_id, position)
    select p_event_id, c.id, (c.n - 1)::smallint from unnest(v_coorganizers) with ordinality as c (id, n);
  end if;

  -- More seats, no limit any more, or registration open longer: the waiting
  -- list goes first (a newcomer never jumps ahead of it).
  if v_registration and v_new.waitlist_count > 0 then
    v_promoted := private.promote_from_waitlist(p_event_id);
    select * into v_new from public.events where id = p_event_id;
  end if;

  if v_old.first_published_at is not null then
    if v_dates or v_place then
      v_notified := private.notify_event_participants(v_new, 'event_changed', 'changed:' || v_new.version,
        jsonb_build_object('dates_changed', v_dates, 'place_changed', v_place,
                           'previous_starts_at', v_old.starts_at, 'previous_ends_at', v_old.ends_at,
                           'previous_venue', v_old.venue_name, 'previous_city', v_old.city));
    end if;
    perform private.log_governance_event(
      v_actor, private.authority_for(v_actor, v_old.organization_id,
                                     case when v_dates or v_place or v_registration then 'events.publish' else 'events.edit' end),
      case when v_dates then 'event_rescheduled' when v_place then 'event_location_changed'
           when v_registration then 'event_registration_changed' else 'event_updated' end,
      'events', v_old.organization_id, null, 'event', p_event_id,
      jsonb_strip_nulls(jsonb_build_object(
        'before', case when v_dates or v_place or v_registration then jsonb_build_object(
                    'starts_at', v_old.starts_at, 'ends_at', v_old.ends_at, 'venue', v_old.venue_name, 'city', v_old.city,
                    'location_type', v_old.location_type, 'capacity', v_old.capacity, 'mode', v_old.registration_mode,
                    'opens_at', v_old.registration_opens_at, 'closes_at', v_old.registration_closes_at,
                    'waitlist', v_old.waitlist_enabled) end,
        'after', case when v_dates or v_place or v_registration then jsonb_build_object(
                    'starts_at', v_new.starts_at, 'ends_at', v_new.ends_at, 'venue', v_new.venue_name, 'city', v_new.city,
                    'location_type', v_new.location_type, 'capacity', v_new.capacity, 'mode', v_new.registration_mode,
                    'opens_at', v_new.registration_opens_at, 'closes_at', v_new.registration_closes_at,
                    'waitlist', v_new.waitlist_enabled) end,
        'promoted', nullif(v_promoted, 0), 'notified', nullif(v_notified, 0)))
    );
  end if;

  return jsonb_build_object('version', v_new.version, 'promoted', v_promoted, 'notified', v_notified);
end;
$$;

create or replace function public.publish_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_blocker text;
  v_slug text;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.publish');
  perform private.require_aal2();
  v_blocker := private.event_blocker(v_event);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'P0001';
  end if;
  v_slug := coalesce(v_event.slug, private.unique_event_slug(v_event.title, v_event.id));
  update public.events
     set publication = 'published', slug = v_slug, published_at = now(),
         first_published_at = coalesce(first_published_at, now()), unpublished_at = null,
         version = version + 1, updated_by = v_actor
   where id = p_event_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.publish'), 'event_published', 'events',
    v_event.organization_id, null, 'event', p_event_id, jsonb_build_object('slug', v_slug, 'first', v_event.first_published_at is null)
  );
  return v_slug;
end;
$$;

-- Off the site. Refused while someone holds a seat or waits: cancel instead
-- (participants are told, the page explains it).
create or replace function public.unpublish_event(p_event_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.publish');
  if v_event.publication <> 'published' then
    raise exception 'event_not_published' using errcode = 'P0001';
  end if;
  if v_event.confirmed_count + v_event.waitlist_count > 0 then
    raise exception 'event_has_registrations' using errcode = 'P0001';
  end if;
  update public.events
     set publication = 'unpublished', unpublished_at = now(), pinned_at = null, pinned_by = null,
         prominence = 'normal', prominence_until = null, prominence_by = null, version = version + 1, updated_by = v_actor
   where id = p_event_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.publish'), 'event_unpublished', 'events',
    v_event.organization_id, null, 'event', p_event_id, '{}'::jsonb, nullif(btrim(coalesce(p_reason, '')), '')
  );
end;
$$;

-- Final: the event will not take place. Its page stays, with the reason;
-- registration closes; everyone holding a seat or waiting is told.
-- Registrations are kept as they were (history), never deleted.
create or replace function public.cancel_event(p_event_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_event public.events%rowtype;
  v_notified integer;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.publish');
  perform private.require_aal2();
  if v_event.status = 'cancelled' then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if v_event.first_published_at is null then
    raise exception 'event_not_published' using errcode = 'P0001';
  end if;
  update public.events
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancellation_reason = v_reason,
         pinned_at = null, pinned_by = null, prominence = 'normal', prominence_until = null, prominence_by = null,
         version = version + 1, updated_by = v_actor
   where id = p_event_id
  returning * into v_event;
  v_notified := private.notify_event_participants(v_event, 'event_cancelled', 'cancelled', jsonb_build_object('reason', v_reason));
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.publish'), 'event_cancelled', 'events',
    v_event.organization_id, null, 'event', p_event_id,
    jsonb_build_object('confirmed', v_event.confirmed_count, 'waitlist', v_event.waitlist_count, 'notified', v_notified), v_reason
  );
  return v_notified;
end;
$$;

-- Only an event that was never online can be deleted.
create or replace function public.delete_event_draft(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if not private.can_edit_event(v_actor, v_event) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if v_event.first_published_at is not null then
    raise exception 'event_was_published' using errcode = 'P0001';
  end if;
  delete from public.events where id = p_event_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id,
                                   case when v_event.created_by = v_actor then 'events.create' else 'events.edit' end),
    'event_draft_deleted', 'events', v_event.organization_id, null, 'event', p_event_id,
    jsonb_build_object('title', left(v_event.title, 120))
  );
end;
$$;

-- Featured on the association's own page: three at most, upcoming and online.
create or replace function public.set_event_pin(p_event_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.publish');
  if p_pinned then
    if v_event.publication <> 'published' or v_event.status <> 'scheduled' or v_event.ends_at <= now() then
      raise exception 'event_not_published' using errcode = 'P0001';
    end if;
    if v_event.hidden_at is not null then
      raise exception 'event_hidden' using errcode = 'P0001';
    end if;
    if v_event.pinned_at is null
       and (select count(*) from public.events
             where organization_id = v_event.organization_id and pinned_at is not null and ends_at > now()) >= 3 then
      raise exception 'pin_limit' using errcode = 'P0001';
    end if;
    update public.events set pinned_at = coalesce(pinned_at, now()), pinned_by = v_actor where id = p_event_id;
  else
    update public.events set pinned_at = null, pinned_by = null where id = p_event_id;
  end if;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.publish'),
    case when p_pinned then 'event_pinned' else 'event_unpinned' end, 'events',
    v_event.organization_id, null, 'event', p_event_id, '{}'::jsonb
  );
end;
$$;

-- A new address; the old one keeps redirecting and is never given to another event.
create or replace function public.change_event_slug(p_event_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.publish');
  if v_event.slug is null then
    raise exception 'event_not_published' using errcode = 'P0001';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 100
     or v_slug = any (private.event_reserved_slugs()) then
    raise exception 'slug_invalid' using errcode = 'P0001';
  end if;
  if v_slug = v_event.slug then
    return v_slug;
  end if;
  if exists (select 1 from public.events where slug = v_slug)
     or exists (select 1 from public.event_slug_history where slug = v_slug and event_id <> p_event_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;
  delete from public.event_slug_history where slug = v_slug and event_id = p_event_id;
  insert into public.event_slug_history (slug, event_id) values (v_event.slug, p_event_id) on conflict (slug) do nothing;
  update public.events set slug = v_slug, version = version + 1, updated_by = v_actor where id = p_event_id;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.publish'), 'event_slug_changed', 'events',
    v_event.organization_id, null, 'event', p_event_id, jsonb_build_object('from', v_event.slug, 'to', v_slug)
  );
  return v_slug;
end;
$$;

-- ---- The registration engine ----------------------------------------------------------------

-- A signed-in, onboarded student takes a seat, or a waiting place, or is
-- told why not. Idempotent: an existing active registration is returned as
-- it is (a double click or a retried request never takes a second seat).
-- The event row is locked for the whole decision: two students can never
-- both get the last seat.
create or replace function public.register_for_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
  v_reference text;
begin
  if not private.mfa_requirement_met() then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = v_actor and onboarding_completed_at is not null) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or not private.event_is_public(v_event) then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  select * into v_reg from public.event_registrations
   where event_id = p_event_id and user_id = v_actor and status in ('confirmed', 'waitlisted');
  if found then
    return private.registration_result(v_reg, true);
  end if;

  if v_event.status = 'cancelled' then
    raise exception 'event_cancelled' using errcode = 'P0001';
  end if;
  if v_event.registration_mode <> 'internal' then
    raise exception 'registration_not_available' using errcode = 'P0001';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at then
    raise exception 'registration_not_open' using errcode = 'P0001';
  end if;
  if now() >= private.event_registration_closes(v_event) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  -- Against scripts and queue games: 30 registrations in 10 minutes overall,
  -- 5 a day for the same event (register, cancel, register again…).
  if (select count(*) from public.event_registrations where user_id = v_actor and created_at > now() - interval '10 minutes') >= 30
     or (select count(*) from public.event_registrations
          where user_id = v_actor and event_id = p_event_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'registration_rate_limited' using errcode = 'P0001';
  end if;

  loop
    v_reference := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.event_registrations where reference = v_reference);
  end loop;

  if v_event.capacity is null or v_event.confirmed_count < v_event.capacity then
    insert into public.event_registrations (event_id, user_id, status, reference, confirmed_at)
    values (p_event_id, v_actor, 'confirmed', v_reference, now())
    returning * into v_reg;
    update public.events set confirmed_count = confirmed_count + 1 where id = p_event_id returning * into v_event;
    perform private.enqueue_notification(v_actor, 'event_registration_confirmed', v_event, 'reg:' || v_reg.id || ':confirmed');
  elsif v_event.waitlist_enabled then
    insert into public.event_registrations (event_id, user_id, status, reference, waitlisted_at, queue_position)
    values (p_event_id, v_actor, 'waitlisted', v_reference, now(), nextval('public.event_queue_seq'))
    returning * into v_reg;
    update public.events set waitlist_count = waitlist_count + 1 where id = p_event_id returning * into v_event;
    perform private.enqueue_notification(v_actor, 'event_waitlisted', v_event, 'reg:' || v_reg.id || ':waitlisted');
  else
    raise exception 'event_full' using errcode = 'P0001';
  end if;
  return private.registration_result(v_reg, false);
end;
$$;

-- The student gives back their seat (until the cancellation cutoff) or leaves
-- the waiting list (until the start). A freed seat goes to the waiting list.
create or replace function public.cancel_my_registration(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
  v_promoted integer := 0;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  select * into v_reg from public.event_registrations
   where event_id = p_event_id and user_id = v_actor and status in ('confirmed', 'waitlisted')
   for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  if v_event.status = 'cancelled' or now() >= v_event.starts_at
     or (v_reg.status = 'confirmed' and v_event.cancellation_cutoff_minutes > 0
         and now() > v_event.starts_at - make_interval(mins => v_event.cancellation_cutoff_minutes)) then
    raise exception 'cancellation_closed' using errcode = 'P0001';
  end if;
  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_source = 'self'
   where id = v_reg.id;
  if v_reg.status = 'confirmed' then
    update public.events set confirmed_count = confirmed_count - 1 where id = p_event_id returning * into v_event;
    v_promoted := private.promote_from_waitlist(p_event_id);
  else
    update public.events set waitlist_count = waitlist_count - 1 where id = p_event_id returning * into v_event;
  end if;
  perform private.enqueue_notification(v_actor, 'event_registration_cancelled', v_event, 'reg:' || v_reg.id || ':cancelled',
                                       jsonb_build_object('was', v_reg.status));
  return jsonb_build_object('status', 'cancelled', 'was', v_reg.status, 'promoted', v_promoted);
end;
$$;

-- The team removes a registration (a duplicate account, a rule broken…):
-- events.attendees.manage and a reason; the student is told why; the freed
-- seat follows the waiting list. Audited without naming the student (the
-- registration row keeps who and why for the team that may see participants).
create or replace function public.remove_event_registration(p_registration_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_event_id uuid;
  v_event public.events%rowtype;
  v_reg public.event_registrations%rowtype;
begin
  select event_id into v_event_id from public.event_registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  select * into v_event from public.events where id = v_event_id for update;
  perform private.require_organization_permission(v_actor, v_event.organization_id, 'events.attendees.manage');
  select * into v_reg from public.event_registrations
   where id = p_registration_id and status in ('confirmed', 'waitlisted')
   for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0001';
  end if;
  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor, cancel_source = 'organizer', cancel_reason = v_reason
   where id = v_reg.id;
  if v_reg.status = 'confirmed' then
    update public.events set confirmed_count = confirmed_count - 1 where id = v_event.id returning * into v_event;
    perform private.promote_from_waitlist(v_event.id);
  else
    update public.events set waitlist_count = waitlist_count - 1 where id = v_event.id returning * into v_event;
  end if;
  perform private.enqueue_notification(v_reg.user_id, 'event_registration_removed', v_event, 'reg:' || v_reg.id || ':removed',
                                       jsonb_build_object('reason', v_reason, 'was', v_reg.status));
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, v_event.organization_id, 'events.attendees.manage'), 'event_registration_removed', 'events',
    v_event.organization_id, null, 'event_registration', v_reg.id, jsonb_build_object('event', v_event.id, 'was', v_reg.status), v_reason
  );
end;
$$;

-- ---- Bookmarks and messages ----------------------------------------------------------------------

create or replace function public.set_event_bookmark(p_event_id uuid, p_saved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  if p_saved then
    select * into v_event from public.events where id = p_event_id;
    if not found or not private.event_is_public(v_event) then
      raise exception 'event_not_found' using errcode = 'P0001';
    end if;
    insert into public.event_bookmarks (user_id, event_id) values (v_actor, p_event_id) on conflict do nothing;
  else
    delete from public.event_bookmarks where user_id = v_actor and event_id = p_event_id;
  end if;
end;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_count integer;
begin
  update public.notification_outbox
     set read_at = now()
   where recipient_id = v_actor and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---- Moderation and the site's front page (BDE) ------------------------------------------------

-- Hides an event from the public (second factor, reason). Nothing else
-- changes: it is not cancelled, registrations stay as they are, its team
-- sees the reason; nothing the association does can publish it again.
create or replace function public.hide_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_event public.events%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.first_published_at is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if v_event.hidden_at is not null then
    raise exception 'event_hidden' using errcode = 'P0001';
  end if;
  update public.events
     set hidden_at = now(), hidden_by = v_actor, hidden_reason = v_reason,
         pinned_at = null, pinned_by = null, prominence = 'normal', prominence_until = null, prominence_by = null
   where id = p_event_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'event_hidden', 'moderation', v_event.organization_id, null, 'event', p_event_id,
    jsonb_build_object('confirmed', v_event.confirmed_count, 'waitlist', v_event.waitlist_count), v_reason
  );
end;
$$;

create or replace function public.restore_event_visibility(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_reason text := private.require_reason(p_reason);
  v_event public.events%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.moderate');
  perform private.require_aal2();
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.hidden_at is null then
    raise exception 'event_not_hidden' using errcode = 'P0001';
  end if;
  update public.events set hidden_at = null, hidden_by = null, hidden_reason = null where id = p_event_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'event_restored', 'moderation', v_event.organization_id, null, 'event', p_event_id, '{}'::jsonb, v_reason
  );
end;
$$;

-- Featured on the site (BDE leadership): three upcoming events at most, for
-- 60 days at most; only events visitors can see take a slot.
create or replace function public.set_event_prominence(p_event_id uuid, p_prominence text, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_event public.events%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.feature');
  perform private.require_aal2();
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if p_prominence not in ('normal', 'featured') then
    raise exception 'prominence_invalid' using errcode = 'P0001';
  end if;
  if p_prominence = 'featured' then
    if not private.event_is_public(v_event) or v_event.status <> 'scheduled' or v_event.ends_at <= now() then
      raise exception 'event_not_published' using errcode = 'P0001';
    end if;
    if p_until is not null and (p_until <= now() or p_until > now() + interval '60 days') then
      raise exception 'prominence_period' using errcode = 'P0001';
    end if;
    if (select count(*) from public.events e
         where e.prominence = 'featured' and e.id <> p_event_id
           and (e.prominence_until is null or e.prominence_until > now())
           and e.publication = 'published' and e.hidden_at is null and e.status = 'scheduled' and e.ends_at > now()
           and private.association_page_is_public(e.organization_id)) >= 3 then
      raise exception 'prominence_limit' using errcode = 'P0001';
    end if;
    update public.events set prominence = 'featured', prominence_until = p_until, prominence_by = v_actor where id = p_event_id;
  else
    update public.events set prominence = 'normal', prominence_until = null, prominence_by = null where id = p_event_id;
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'event_prominence_changed', 'events', v_event.organization_id, null, 'event', p_event_id,
    jsonb_build_object('prominence', p_prominence, 'until', p_until)
  );
end;
$$;

-- ---- The category catalog (BDE leadership) -------------------------------------------------------

create or replace function public.create_event_category(p_slug text, p_label text, p_sort_order integer default 100)
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
  begin
    insert into public.event_categories (slug, label, sort_order, created_by)
    values (lower(btrim(p_slug)), btrim(p_label), coalesce(p_sort_order, 100), v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, 'bde', 'event_category_created', 'catalog', null, null, 'event_category', v_id, jsonb_build_object('slug', p_slug)
  );
  return v_id;
end;
$$;

create or replace function public.update_event_category(p_category_id uuid, p_label text, p_sort_order integer, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  begin
    update public.event_categories
       set label = btrim(p_label), sort_order = coalesce(p_sort_order, sort_order),
           archived_at = case when p_archived then coalesce(archived_at, now()) else null end
     where id = p_category_id;
  exception
    when unique_violation then
      raise exception 'category_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then
      raise exception 'category_invalid' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'category_invalid' using errcode = 'P0001';
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'event_category_updated', 'catalog', null, null, 'event_category', p_category_id,
    jsonb_build_object('archived', p_archived)
  );
end;
$$;

-- ---- E-mail delivery (the worker, with the service role only) --------------------------------------
--
-- The worker claims a batch (rows locked with skip locked, so two workers
-- never take the same message), sends, then reports each outcome. A claim is
-- a 10-minute lease: a crashed worker's messages come back by themselves.
-- Failures back off (2, 4, 8, 16 minutes) and stop after 5 attempts.

create or replace function public.claim_notification_emails(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with batch as (
    select o.id
      from public.notification_outbox o
     where o.email_status in ('pending', 'sending') and o.email_next_attempt_at <= now()
     order by o.email_next_attempt_at, o.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked
  ), claimed as (
    update public.notification_outbox o
       set email_status = 'sending', email_attempts = o.email_attempts + 1,
           email_next_attempt_at = now() + interval '10 minutes'
      from batch
     where o.id = batch.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'kind', c.kind, 'payload', c.payload, 'attempt', c.email_attempts,
           'email', u.email, 'name', private.person_name(c.recipient_id))
           order by c.id), '[]'::jsonb)
    into v_rows
    from claimed c
    join auth.users u on u.id = c.recipient_id;
  return v_rows;
end;
$$;

create or replace function public.complete_notification_email(p_id bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
     set email_status = case when p_ok then 'sent'
                             when p_error = 'no_address' then 'skipped'
                             when email_attempts >= 5 then 'failed' else 'pending' end,
         email_sent_at = case when p_ok then now() else email_sent_at end,
         email_last_error = case when p_ok then null
                                 else coalesce(nullif(regexp_replace(lower(coalesce(p_error, '')), '[^a-z_]', '', 'g'), ''), 'unknown') end,
         email_next_attempt_at = case when p_ok then email_next_attempt_at
                                      else now() + make_interval(mins => power(2, email_attempts)::integer) end
   where id = p_id and email_status = 'sending';
end;
$$;

-- ---- Reminders: confirmed participants, the day before -------------------------------------------

-- Every 15 minutes: one reminder per confirmed participant of an event
-- starting within 24 hours, for those registered more than 24 hours before
-- it (the others just had their confirmation). Idempotent (dedupe key: the
-- event, its start, the person): a rescheduled event reminds again.
create or replace function private.enqueue_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reg record;
  v_count integer := 0;
begin
  for v_event in
    select * from public.events e
     where e.publication = 'published' and e.status = 'scheduled' and e.hidden_at is null
       and e.registration_mode = 'internal' and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    for v_reg in
      select r.id, r.user_id from public.event_registrations r
       where r.event_id = v_event.id and r.status = 'confirmed' and r.confirmed_at <= v_event.starts_at - interval '24 hours'
    loop
      perform private.enqueue_notification(v_reg.user_id, 'event_reminder', v_event,
        'event:' || v_event.id || ':reminder:' || extract(epoch from v_event.starts_at)::bigint || ':' || v_reg.user_id);
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('enqueue-event-reminders', '*/15 * * * *', 'select private.enqueue_event_reminders()');
  end if;
end;
$cron$;

-- ---- Privileges -------------------------------------------------------------------------------------

revoke all on function private.event_reserved_slugs() from public, anon, authenticated, service_role;
revoke all on function private.unique_event_slug(text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.event_is_public(public.events) from public, anon, authenticated, service_role;
revoke all on function private.event_registration_closes(public.events) from public, anon, authenticated, service_role;
revoke all on function private.event_registration_state(public.events) from public, anon, authenticated, service_role;
revoke all on function private.event_card(public.events) from public, anon, authenticated, service_role;
revoke all on function private.event_message_payload(public.events) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_notification(uuid, text, public.events, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.notify_event_participants(public.events, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.event_promotion_open(public.events) from public, anon, authenticated, service_role;
revoke all on function private.promote_from_waitlist(uuid) from public, anon, authenticated, service_role;
revoke all on function private.registration_result(public.event_registrations, boolean) from public, anon, authenticated, service_role;
revoke all on function private.can_edit_event(uuid, public.events) from public, anon, authenticated, service_role;
revoke all on function private.event_blocker(public.events) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_event_reminders() from public, anon, authenticated, service_role;

revoke all on function public.create_event(uuid, text) from public, anon;
revoke all on function public.save_event(uuid, integer, jsonb) from public, anon;
revoke all on function public.publish_event(uuid) from public, anon;
revoke all on function public.unpublish_event(uuid, text) from public, anon;
revoke all on function public.cancel_event(uuid, text) from public, anon;
revoke all on function public.delete_event_draft(uuid) from public, anon;
revoke all on function public.set_event_pin(uuid, boolean) from public, anon;
revoke all on function public.change_event_slug(uuid, text) from public, anon;
revoke all on function public.register_for_event(uuid) from public, anon;
revoke all on function public.cancel_my_registration(uuid) from public, anon;
revoke all on function public.remove_event_registration(uuid, text) from public, anon;
revoke all on function public.set_event_bookmark(uuid, boolean) from public, anon;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
revoke all on function public.hide_event(uuid, text) from public, anon;
revoke all on function public.restore_event_visibility(uuid, text) from public, anon;
revoke all on function public.set_event_prominence(uuid, text, timestamptz) from public, anon;
revoke all on function public.create_event_category(text, text, integer) from public, anon;
revoke all on function public.update_event_category(uuid, text, integer, boolean) from public, anon;
grant execute on function public.create_event(uuid, text) to authenticated;
grant execute on function public.save_event(uuid, integer, jsonb) to authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
grant execute on function public.unpublish_event(uuid, text) to authenticated;
grant execute on function public.cancel_event(uuid, text) to authenticated;
grant execute on function public.delete_event_draft(uuid) to authenticated;
grant execute on function public.set_event_pin(uuid, boolean) to authenticated;
grant execute on function public.change_event_slug(uuid, text) to authenticated;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.cancel_my_registration(uuid) to authenticated;
grant execute on function public.remove_event_registration(uuid, text) to authenticated;
grant execute on function public.set_event_bookmark(uuid, boolean) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.hide_event(uuid, text) to authenticated;
grant execute on function public.restore_event_visibility(uuid, text) to authenticated;
grant execute on function public.set_event_prominence(uuid, text, timestamptz) to authenticated;
grant execute on function public.create_event_category(text, text, integer) to authenticated;
grant execute on function public.update_event_category(uuid, text, integer, boolean) to authenticated;

-- The e-mail worker runs with the service role only (server-side secret).
revoke all on function public.claim_notification_emails(integer) from public, anon, authenticated;
revoke all on function public.complete_notification_email(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(integer) to service_role;
grant execute on function public.complete_notification_email(bigint, boolean, text) to service_role;
