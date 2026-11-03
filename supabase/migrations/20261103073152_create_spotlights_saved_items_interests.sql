-- Phase 12 · Discovery around the search: spotlights on the campus front
-- page (the same "à la une" as articles and events, now for recruitment and
-- associations), saved items (one private list for associations, articles,
-- events, recruitment and positions, replacing the events-only bookmarks),
-- optional interests (association categories the student picks, nothing
-- inferred) and articles related by real links.

-- ---- A featured item whose curator deleted their account stays featured ------------------------------------
--
-- prominence_by is "on delete set null", but the check required it whenever
-- the item was featured: deleting the account of a BDE member who featured
-- something would fail. Normal still means no curator; featured may outlive
-- the curator's account (the audit keeps who did it).

alter table public.posts drop constraint posts_prominence_set_check;
alter table public.posts add constraint posts_prominence_set_check
  check (prominence <> 'normal' or prominence_by is null);
alter table public.events drop constraint events_prominence_set_check;
alter table public.events add constraint events_prominence_set_check
  check (prominence <> 'normal' or prominence_by is null);

-- ---- Spotlights: recruitment and associations on the campus front page -------------------------------------
--
-- Same mechanism as events: platform.content.feature, the second factor, a
-- limit, an optional end date (60 days at most), audited; shown only while
-- the item is public (a moderation, an unpublication or a close takes it off
-- at once, the read checks it every time). Featuring on one's own page stays
-- the association's own pinning; this is the school's front page.

alter table public.recruitment_campaigns
  add column prominence text not null default 'normal'
    constraint recruitment_campaigns_prominence_check check (prominence in ('normal', 'featured')),
  add column prominence_until timestamptz,
  add column prominence_by uuid
    constraint recruitment_campaigns_prominence_by_fkey references auth.users (id) on delete set null,
  add constraint recruitment_campaigns_prominence_set_check
    check (prominence <> 'normal' or prominence_by is null);
create index recruitment_campaigns_prominence_by_idx on public.recruitment_campaigns (prominence_by);
create index recruitment_campaigns_prominence_idx on public.recruitment_campaigns (prominence) where prominence <> 'normal';

alter table public.association_pages
  add column prominence text not null default 'normal'
    constraint association_pages_prominence_check check (prominence in ('normal', 'featured')),
  add column prominence_until timestamptz,
  add column prominence_by uuid
    constraint association_pages_prominence_by_fkey references auth.users (id) on delete set null,
  add constraint association_pages_prominence_set_check
    check (prominence <> 'normal' or prominence_by is null);
create index association_pages_prominence_by_idx on public.association_pages (prominence_by);

-- Recruitment on the front page: open or about to open, up to three.
create or replace function public.set_campaign_prominence(p_campaign_id uuid, p_prominence text, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.feature');
  perform private.require_aal2();
  select * into v_campaign from public.recruitment_campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if p_prominence not in ('normal', 'featured') then
    raise exception 'prominence_invalid' using errcode = 'P0001';
  end if;
  if p_prominence = 'featured' then
    if not private.campaign_is_public(v_campaign) or private.campaign_state(v_campaign) not in ('open', 'upcoming') then
      raise exception 'campaign_not_open' using errcode = 'P0001';
    end if;
    if p_until is not null and (p_until <= now() or p_until > now() + interval '60 days') then
      raise exception 'prominence_period' using errcode = 'P0001';
    end if;
    if (select count(*) from public.recruitment_campaigns c
         where c.prominence = 'featured' and c.id <> p_campaign_id
           and (c.prominence_until is null or c.prominence_until > now())
           and private.campaign_is_public(c) and private.campaign_state(c) in ('open', 'upcoming')) >= 3 then
      raise exception 'prominence_limit' using errcode = 'P0001';
    end if;
    update public.recruitment_campaigns set prominence = 'featured', prominence_until = p_until, prominence_by = v_actor
     where id = p_campaign_id;
  else
    update public.recruitment_campaigns set prominence = 'normal', prominence_until = null, prominence_by = null
     where id = p_campaign_id;
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'campaign_prominence_changed', 'recruitment', v_campaign.organization_id, null,
    'recruitment_campaign', p_campaign_id, jsonb_build_object('prominence', p_prominence, 'until', p_until)
  );
end;
$$;

-- One association "à l'honneur" at a time (never the BDE itself: the front
-- page is already its own).
create or replace function public.set_association_prominence(p_organization_id uuid, p_prominence text, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_page public.association_pages%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.content.feature');
  perform private.require_aal2();
  select * into v_page from public.association_pages where organization_id = p_organization_id for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  if p_prominence not in ('normal', 'featured') then
    raise exception 'prominence_invalid' using errcode = 'P0001';
  end if;
  if p_prominence = 'featured' then
    if not private.association_page_is_public(p_organization_id)
       or exists (select 1 from public.organizations o where o.id = p_organization_id and o.kind <> 'association') then
      raise exception 'association_page_not_public' using errcode = 'P0001';
    end if;
    if p_until is not null and (p_until <= now() or p_until > now() + interval '60 days') then
      raise exception 'prominence_period' using errcode = 'P0001';
    end if;
    if (select count(*) from public.association_pages ap
         where ap.prominence = 'featured' and ap.organization_id <> p_organization_id
           and (ap.prominence_until is null or ap.prominence_until > now())
           and private.association_page_is_public(ap.organization_id)) >= 1 then
      raise exception 'prominence_limit' using errcode = 'P0001';
    end if;
    update public.association_pages set prominence = 'featured', prominence_until = p_until, prominence_by = v_actor
     where organization_id = p_organization_id;
  else
    update public.association_pages set prominence = 'normal', prominence_until = null, prominence_by = null
     where organization_id = p_organization_id;
  end if;
  perform private.log_governance_event(
    v_actor, 'bde', 'association_prominence_changed', 'content', p_organization_id, null,
    'association_page', p_organization_id, jsonb_build_object('prominence', p_prominence, 'until', p_until)
  );
end;
$$;

-- Featured recruitment, public and open or about to open, closing soonest first.
create or replace function public.public_featured_campaigns()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.campaign_card(c) || jsonb_build_object('prominence_until', c.prominence_until)
                            order by c.closes_at, c.id), '[]'::jsonb)
    from public.recruitment_campaigns c
   where c.prominence = 'featured' and (c.prominence_until is null or c.prominence_until > now())
     and private.campaign_is_public(c) and private.campaign_state(c) in ('open', 'upcoming');
$$;

-- The association "à l'honneur", while its page is public.
create or replace function public.public_featured_associations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.search_association_card(ap.organization_id) || jsonb_build_object('prominence_until', ap.prominence_until)
                            order by ap.organization_id), '[]'::jsonb)
    from public.association_pages ap
    join public.organizations o on o.id = ap.organization_id and o.kind = 'association'
   where ap.prominence = 'featured' and (ap.prominence_until is null or ap.prominence_until > now())
     and private.association_page_is_public(ap.organization_id);
$$;

-- ---- Saved items ---------------------------------------------------------------------------------------------
--
-- One private list per student. One typed column per kind, each a real
-- foreign key (a deleted item leaves the list with it); exactly the one of
-- the kind is set; target_id is that id, so an item is saved once. Read own
-- rows only (nobody else: not the association, not the BDE); written only
-- through public.save_item, which saves only what is public right now.
-- Saving is not registering, applying or joining: nothing reads this list
-- but its owner.

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    constraint saved_items_user_id_fkey references auth.users (id) on delete cascade,
  kind text not null
    constraint saved_items_kind_check check (kind in ('association', 'post', 'event', 'campaign', 'position')),
  organization_id uuid
    constraint saved_items_organization_id_fkey references public.organizations (id) on delete cascade,
  post_id uuid
    constraint saved_items_post_id_fkey references public.posts (id) on delete cascade,
  event_id uuid
    constraint saved_items_event_id_fkey references public.events (id) on delete cascade,
  campaign_id uuid
    constraint saved_items_campaign_id_fkey references public.recruitment_campaigns (id) on delete cascade,
  position_id uuid
    constraint saved_items_position_id_fkey references public.recruitment_positions (id) on delete cascade,
  target_id uuid generated always as (coalesce(organization_id, post_id, event_id, campaign_id, position_id)) stored,
  created_at timestamptz not null default now(),
  constraint saved_items_target_check check (
    (kind = 'association') = (organization_id is not null)
    and (kind = 'post') = (post_id is not null)
    and (kind = 'event') = (event_id is not null)
    and (kind = 'campaign') = (campaign_id is not null)
    and (kind = 'position') = (position_id is not null)),
  constraint saved_items_user_target_key unique (user_id, kind, target_id)
);

comment on table public.saved_items is
  'A student''s saved items (private to them): written only through public.save_item, read through my_saved_items.';

create index saved_items_user_created_idx on public.saved_items (user_id, created_at desc);
create index saved_items_organization_idx on public.saved_items (organization_id) where organization_id is not null;
create index saved_items_post_idx on public.saved_items (post_id) where post_id is not null;
create index saved_items_event_idx on public.saved_items (event_id) where event_id is not null;
create index saved_items_campaign_idx on public.saved_items (campaign_id) where campaign_id is not null;
create index saved_items_position_idx on public.saved_items (position_id) where position_id is not null;

alter table public.saved_items enable row level security;
revoke all on public.saved_items from anon, authenticated;

create policy saved_items_read_own
  on public.saved_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_items_require_mfa_when_enrolled on public.saved_items
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.saved_items to authenticated;

-- The events-only bookmarks become saved events (same people, same dates).
insert into public.saved_items (user_id, kind, event_id, created_at)
select b.user_id, 'event', b.event_id, b.created_at from public.event_bookmarks b
on conflict do nothing;

-- Save or unsave. Saving needs the item public right now (nothing private
-- can be "probed" through it: an unknown and a private item answer the
-- same); unsaving always works. Returns the state after the call.
create or replace function public.save_item(p_kind text, p_id uuid, p_saved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if p_kind is null or p_kind not in ('association', 'post', 'event', 'campaign', 'position') or p_id is null then
    raise exception 'item_invalid' using errcode = 'P0001';
  end if;
  if not coalesce(p_saved, false) then
    delete from public.saved_items where user_id = v_actor and kind = p_kind and target_id = p_id;
    return false;
  end if;
  if exists (select 1 from public.saved_items where user_id = v_actor and kind = p_kind and target_id = p_id) then
    return true;
  end if;
  if private.public_card(p_kind, p_id) is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.saved_items where user_id = v_actor) >= 500 then
    raise exception 'saved_limit' using errcode = 'P0001';
  end if;
  insert into public.saved_items (user_id, kind, organization_id, post_id, event_id, campaign_id, position_id)
  values (v_actor, p_kind,
          case when p_kind = 'association' then p_id end,
          case when p_kind = 'post' then p_id end,
          case when p_kind = 'event' then p_id end,
          case when p_kind = 'campaign' then p_id end,
          case when p_kind = 'position' then p_id end)
  on conflict on constraint saved_items_user_target_key do nothing;
  return true;
end;
$$;

-- My saved items, newest first, each with its live public card and status
-- (a cancelled event says so, a closed recruitment says so). An item no
-- longer public keeps only its kind and the date it was saved: no title,
-- nothing it said while it was public, just a way to remove it.
create or replace function public.my_saved_items(p_kind text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if p_kind is not null and p_kind not in ('association', 'post', 'event', 'campaign', 'position') then
    raise exception 'item_invalid' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.target_id, 'saved_at', x.created_at,
                                        'available', x.card is not null, 'card', x.card)
                     order by x.created_at desc, x.id)
      from (select s.id, s.kind, s.target_id, s.created_at, private.public_card(s.kind, s.target_id) as card
              from public.saved_items s
             where s.user_id = v_actor and (p_kind is null or s.kind = p_kind)) as x), '[]'::jsonb);
end;
$$;

-- Which items I saved, as ids per kind, for the "Enregistrer / Enregistré"
-- buttons of a list (cheap: no card).
create or replace function public.my_saved_keys()
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
    'association', coalesce((select jsonb_agg(target_id) from public.saved_items where user_id = v_actor and kind = 'association'), '[]'::jsonb),
    'post', coalesce((select jsonb_agg(target_id) from public.saved_items where user_id = v_actor and kind = 'post'), '[]'::jsonb),
    'event', coalesce((select jsonb_agg(target_id) from public.saved_items where user_id = v_actor and kind = 'event'), '[]'::jsonb),
    'campaign', coalesce((select jsonb_agg(target_id) from public.saved_items where user_id = v_actor and kind = 'campaign'), '[]'::jsonb),
    'position', coalesce((select jsonb_agg(target_id) from public.saved_items where user_id = v_actor and kind = 'position'), '[]'::jsonb));
end;
$$;

-- ---- The events' own reads, now on saved items -------------------------------------------------------------
-- (Phase 7, unchanged but for the saved state.)
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
    'bookmarked', exists (select 1 from public.saved_items where user_id = v_actor and event_id = p_event_id),
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
        from public.saved_items b
        join public.events e on e.id = b.event_id
       where b.user_id = v_actor and private.event_is_public(e)), '[]'::jsonb));
end;
$$;

drop function public.set_event_bookmark(uuid, boolean);
drop table public.event_bookmarks;

-- ---- Optional interests ------------------------------------------------------------------------------------
--
-- Broad interests a student may pick, from the association category catalog
-- the BDE keeps (no new taxonomy, nothing inferred from what they read,
-- register for or apply to). Their own, private like saved items, editable
-- and removable at any time; used only for the "Pour toi" block of their
-- own space, which says why each suggestion is there.

create table public.student_interests (
  user_id uuid not null
    constraint student_interests_user_id_fkey references auth.users (id) on delete cascade,
  category_id uuid not null
    constraint student_interests_category_id_fkey references public.association_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint student_interests_pkey primary key (user_id, category_id)
);

create index student_interests_category_idx on public.student_interests (category_id);

alter table public.student_interests enable row level security;
revoke all on public.student_interests from anon, authenticated;

create policy student_interests_read_own
  on public.student_interests for select to authenticated
  using (user_id = (select auth.uid()));
create policy student_interests_require_mfa_when_enrolled on public.student_interests
  as restrictive for select to authenticated using ((select private.mfa_requirement_met()));

grant select on public.student_interests to authenticated;

-- Replace my interests with these categories (empty: none). Current
-- categories only, eight at most.
create or replace function public.set_my_interests(p_category_slugs text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_slugs text[] := array(select distinct s from unnest(coalesce(p_category_slugs, '{}'::text[])) s where s is not null);
  v_ids uuid[];
begin
  if cardinality(v_slugs) > 8 then
    raise exception 'interests_limit' using errcode = 'P0001';
  end if;
  v_ids := array(select k.id from public.association_categories k where k.slug = any (v_slugs) and k.archived_at is null);
  if cardinality(v_ids) <> cardinality(v_slugs) then
    raise exception 'interest_invalid' using errcode = 'P0001';
  end if;
  delete from public.student_interests where user_id = v_actor and category_id <> all (v_ids);
  insert into public.student_interests (user_id, category_id)
  select v_actor, unnest(v_ids)
  on conflict do nothing;
  return cardinality(v_ids);
end;
$$;

-- My interests and what they suggest, with the reason shown: upcoming public
-- events and open (or about to open) recruitment of the associations whose
-- page lists one of my interests. Nothing else is used.
create or replace function public.my_campus_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_ids uuid[];
begin
  v_ids := array(select i.category_id from public.student_interests i
                   join public.association_categories k on k.id = i.category_id and k.archived_at is null
                  where i.user_id = v_actor);
  return jsonb_build_object(
    'interests', coalesce((select jsonb_agg(jsonb_build_object('slug', k.slug, 'label', k.label) order by k.sort_order, k.label)
                             from public.association_categories k where k.id = any (v_ids)), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(x.card || jsonb_build_object('because', x.because) order by x.starts_at, x.id)
        from (select e.id, e.starts_at, private.event_card(e) as card,
                     (select jsonb_agg(k.label order by k.sort_order, k.label) from public.association_categories k
                       where k.id = any (ap.category_ids) and k.id = any (v_ids)) as because
                from public.events e
                join public.association_profiles ap on ap.organization_id = e.organization_id and ap.stage = 'published'
               where cardinality(v_ids) > 0 and ap.category_ids && v_ids
                 and private.event_is_public(e) and e.status = 'scheduled' and e.ends_at > now()
               order by e.starts_at, e.id
               limit 6) as x), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(x.card || jsonb_build_object('because', x.because) order by x.state_order, x.closes_at, x.id)
        from (select c.id, c.closes_at, private.campaign_card(c) as card,
                     case private.campaign_state(c) when 'open' then 0 else 1 end as state_order,
                     (select jsonb_agg(k.label order by k.sort_order, k.label) from public.association_categories k
                       where k.id = any (ap.category_ids) and k.id = any (v_ids)) as because
                from public.recruitment_campaigns c
                join public.association_profiles ap on ap.organization_id = c.organization_id and ap.stage = 'published'
               where cardinality(v_ids) > 0 and ap.category_ids && v_ids
                 and private.campaign_is_public(c) and private.campaign_state(c) in ('open', 'upcoming')
               order by case private.campaign_state(c) when 'open' then 0 else 1 end, c.closes_at, c.id
               limit 4) as x), '[]'::jsonb));
end;
$$;

-- ---- Related articles, by real links -------------------------------------------------------------------------
--
-- The published articles that point to an event or a recruitment campaign
-- (their announcement), or, for an article: those about the same event or
-- campaign first, then the same association, then the same category. Ids
-- only, never a shared word; the feed's own predicates; newest first.
create or replace function public.public_related_posts(p_type text, p_id uuid, p_limit integer default 3)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select p.id, p.organization_id, p.event_id, p.recruitment_campaign_id, r.category_id
      from public.posts p
      join public.post_revisions r on r.id = p.published_revision_id
     where p_type = 'post' and p.id = p_id and private.post_is_public(p.id)
  )
  select coalesce(jsonb_agg(private.post_card(x.id) order by x.closeness, x.first_published_at desc, x.id), '[]'::jsonb)
    from (select p.id, p.first_published_at,
                 case
                   when p_type = 'event' then 0
                   when p_type = 'campaign' then 0
                   when (p.event_id is not null and p.event_id = o.event_id)
                     or (p.recruitment_campaign_id is not null and p.recruitment_campaign_id = o.recruitment_campaign_id) then 0
                   when p.organization_id = o.organization_id then 1
                   else 2 end as closeness
            from public.posts p
            join public.post_revisions r on r.id = p.published_revision_id
            left join origin o on true
           where p.publication = 'published' and p.hidden_at is null
             and private.association_page_is_public(p.organization_id)
             and case p_type
                   when 'event' then p.event_id = p_id
                   when 'campaign' then p.recruitment_campaign_id = p_id
                   when 'post' then o.id is not null and p.id <> o.id
                                    and ((p.event_id is not null and p.event_id = o.event_id)
                                         or (p.recruitment_campaign_id is not null and p.recruitment_campaign_id = o.recruitment_campaign_id)
                                         or p.organization_id = o.organization_id
                                         or (r.category_id is not null and r.category_id = o.category_id))
                   else false end
           order by closeness, p.first_published_at desc, p.id
           limit least(greatest(coalesce(p_limit, 3), 1), 6)) as x;
$$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function public.set_campaign_prominence(uuid, text, timestamptz) from public, anon;
revoke all on function public.set_association_prominence(uuid, text, timestamptz) from public, anon;
revoke all on function public.public_featured_campaigns() from public;
revoke all on function public.public_featured_associations() from public;
revoke all on function public.save_item(text, uuid, boolean) from public, anon;
revoke all on function public.my_saved_items(text) from public, anon;
revoke all on function public.my_saved_keys() from public, anon;
revoke all on function public.set_my_interests(text[]) from public, anon;
revoke all on function public.my_campus_suggestions() from public, anon;
revoke all on function public.public_related_posts(text, uuid, integer) from public;

grant execute on function public.set_campaign_prominence(uuid, text, timestamptz) to authenticated;
grant execute on function public.set_association_prominence(uuid, text, timestamptz) to authenticated;
grant execute on function public.public_featured_campaigns() to anon, authenticated;
grant execute on function public.public_featured_associations() to anon, authenticated;
grant execute on function public.save_item(text, uuid, boolean) to authenticated;
grant execute on function public.my_saved_items(text) to authenticated;
grant execute on function public.my_saved_keys() to authenticated;
grant execute on function public.set_my_interests(text[]) to authenticated;
grant execute on function public.my_campus_suggestions() to authenticated;
grant execute on function public.public_related_posts(text, uuid, integer) to anon, authenticated;
