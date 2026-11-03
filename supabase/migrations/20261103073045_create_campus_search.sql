-- Phase 12 · One public search across the campus: association pages,
-- articles, events, recruitment campaigns and their positions.
--
-- It queries the source tables directly (no copy of any content, so nothing
-- to keep in sync and nothing that lags behind a moderation): each branch
-- applies the very predicates the public pages use
-- (private.association_page_is_public, the published-revision join of
-- public_posts, private.event_is_public, private.campaign_is_public), and
-- matches the stored, generated search vectors (French stemming, accents
-- folded, weighted: titles A, short texts B, long texts C). Only what a
-- visitor may already read can match, and only from the version a visitor
-- reads: the published revision of an article, the published profile of an
-- association. Results carry the same public cards as the public pages.
--
-- Like every public read of this schema it is SECURITY DEFINER, because the
-- API roles have no grant at all on the content tables (a security_invoker
-- view would return nothing to a visitor); it touches no private table and
-- returns only public cards.

-- ---- Search vectors the earlier phases did not have ---------------------------------------------------------

create or replace function private.association_search_vector(
  p_name text, p_short_name text, p_kind_label text, p_tagline text, p_description text
)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select setweight(to_tsvector('french'::regconfig, private.fold_accents(coalesce(p_name, '') || ' ' || coalesce(p_short_name, ''))), 'A')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(coalesce(p_tagline, '') || ' ' || coalesce(p_kind_label, ''))), 'B')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(left(coalesce(p_description, ''), 4000))), 'C');
$$;

create or replace function private.position_search_vector(
  p_title text, p_team text, p_summary text, p_description text, p_missions text, p_expectations text
)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select setweight(to_tsvector('french'::regconfig, private.fold_accents(coalesce(p_title, '') || ' ' || coalesce(p_team, ''))), 'A')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(coalesce(p_summary, ''))), 'B')
      || setweight(to_tsvector('french'::regconfig, private.fold_accents(
           left(coalesce(p_description, '') || ' ' || coalesce(p_missions, '') || ' ' || coalesce(p_expectations, ''), 4000))), 'C');
$$;

alter table public.association_profiles
  add column search tsvector generated always as
    (private.association_search_vector(name, short_name, kind_label, tagline, description)) stored;
create index association_profiles_search_idx on public.association_profiles using gin (search);

alter table public.recruitment_positions
  add column search tsvector generated always as
    (private.position_search_vector(title, team, summary, description, missions, expectations)) stored;
create index recruitment_positions_search_idx on public.recruitment_positions using gin (search);

-- ---- The query --------------------------------------------------------------------------------------------

-- What a person typed, as a text-search query: the words as written
-- (websearch syntax: "phrases", -excluded, or) OR each word as a prefix, so
-- "financ" finds "Finance" and "barathon" finds "Barathons". Built only from
-- the lexemes Postgres itself extracted (never by pasting the text into a
-- query string). Null under two characters.
create or replace function private.search_tsquery(p_q text)
returns tsquery
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_folded text := private.fold_accents(left(btrim(coalesce(p_q, '')), 80));
  v_web tsquery;
  v_terms text;
begin
  if char_length(regexp_replace(v_folded, '\s', '', 'g')) < 2 then
    return null;
  end if;
  v_web := websearch_to_tsquery('french'::regconfig, v_folded);
  -- Exclusions and phrases are meant exactly: no prefix widening then.
  if position('!' in v_web::text) > 0 or position('<->' in v_web::text) > 0 then
    return v_web;
  end if;
  select string_agg(quote_literal(l) || ':*', ' & ' order by l) into v_terms
    from unnest(tsvector_to_array(to_tsvector('french'::regconfig, v_folded))) l
   where l ~ '^[a-z0-9]+$';
  if v_terms is null then
    return case when v_web is null or numnode(v_web) = 0 then null else v_web end;
  end if;
  if v_web is null or numnode(v_web) = 0 then
    return to_tsquery('simple'::regconfig, v_terms);
  end if;
  return v_web || to_tsquery('simple'::regconfig, v_terms);
end;
$$;

-- An association as a search result: who it is, its line, its look.
create or replace function private.search_association_card(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'slug', o.slug, 'kind', o.kind, 'name', o.name, 'short_name', o.short_name, 'accent', o.accent,
    'kind_label', p.kind_label, 'tagline', p.tagline,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('slug', k.slug, 'label', k.label) order by array_position(p.category_ids, k.id))
        from public.association_categories k where k.id = any (p.category_ids)), '[]'::jsonb),
    'logo', private.media_json(p.logo_media_id),
    'cover', private.media_json(p.cover_media_id))
    from public.organizations o
    join public.association_profiles p on p.organization_id = o.id and p.stage = 'published'
   where o.id = p_organization_id;
$$;

-- Any public item as lists show it (association, post, event, campaign,
-- position), or null when a visitor may not see it right now: the same
-- predicates as its public page, checked at every read. Search results and
-- saved items both go through it.
create or replace function private.public_card(p_type text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'association' then
      (select private.search_association_card(p_id) where private.association_page_is_public(p_id))
    when 'post' then
      (select private.post_card(p_id) where private.post_is_public(p_id))
    when 'event' then
      (select private.event_card(e) from public.events e where e.id = p_id and private.event_is_public(e))
    when 'campaign' then
      (select private.campaign_card(c) from public.recruitment_campaigns c where c.id = p_id and private.campaign_is_public(c))
    when 'position' then
      (select private.position_card(ps, c) || jsonb_build_object(
                'campaign', jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title,
                                               'state', private.campaign_state(c),
                                               'cover', private.media_json(c.cover_media_id),
                                               'organization', private.organization_card(c.organization_id)))
         from public.recruitment_positions ps
         join public.recruitment_campaigns c on c.id = ps.campaign_id
        where ps.id = p_id and ps.retired_at is null and private.campaign_is_public(c))
  end;
$$;

-- How strongly a title answers the query: exact, then starting with it,
-- then containing it as a word (folded, accents and case ignored).
create or replace function private.search_title_bonus(p_title text, p_folded_query text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_folded_query = '' then 0
    when private.fold_accents(p_title) = p_folded_query then 1.0
    when starts_with(private.fold_accents(p_title), p_folded_query) then 0.5
    when position(' ' || p_folded_query in private.fold_accents(p_title)) > 0 then 0.25
    else 0 end;
$$;

-- Whether a word of an association's name or short name starts with the
-- query ("finance" finds "Asso Finance", "in" does not find "Pink"):
-- what it publishes is then found by its name.
create or replace function private.search_name_matches(p_name text, p_short_name text, p_folded_query text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_folded_query <> ''
     and position(' ' || p_folded_query in ' ' || private.fold_accents(p_name || ' ' || coalesce(p_short_name, ''))) > 0;
$$;

-- The public search. Types: association, post, event, campaign, position
-- (null = all). Filters that only mean something for one type apply only
-- to it: category (each type's own catalog), when and place (events),
-- status (recruitment: open, upcoming, closing within 7 days, closed).
-- organization (slug) applies to every type. Without a query it lists
-- (newest articles, coming events, open recruitment first).
--
-- Order with a query: relevance = text rank (ts_rank_cd, normalized to
-- 0..1) + title bonus (exact 1, prefix 0.5, word 0.25) + 0.3 when the
-- association's name matches + a small date adjustment (event to come or
-- recruitment open: +0.15, over or closed: -0.15; article of the last 30
-- days: +0.1). An association's own page gets the name bonus too, so it
-- comes before what it published. Ties: the type's date, then id, so pages
-- never overlap.
-- p_per_type keeps the best n of each type (the "Tout" view).
create or replace function public.search_campus(
  p_q text default null,
  p_type text default null,
  p_category text default null,
  p_organization text default null,
  p_when text default null,
  p_status text default null,
  p_place text default null,
  p_sort text default null,
  p_limit integer default 12,
  p_offset integer default 0,
  p_per_type integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := left(btrim(regexp_replace(left(coalesce(p_q, ''), 400), '\s+', ' ', 'g')), 80);
  v_folded text;
  v_tsq tsquery;
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 24);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 480);
  v_per_type integer := case when p_per_type is null then null else least(greatest(p_per_type, 1), 8) end;
  v_relevance boolean;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_dow integer := extract(isodow from (now() at time zone 'Europe/Paris'))::integer;
  v_from timestamptz;
  v_to timestamptz;
  v_when text := p_when;
  v_counts jsonb;
  v_results jsonb;
  v_total integer;
begin
  if (p_type is not null and p_type not in ('association', 'post', 'event', 'campaign', 'position'))
     or (p_when is not null and p_when not in ('upcoming', 'today', 'week', 'weekend', 'past'))
     or (p_status is not null and p_status not in ('open', 'upcoming', 'closing', 'closed'))
     or (p_place is not null and p_place not in ('campus', 'external', 'online'))
     or (p_sort is not null and p_sort not in ('relevance', 'date'))
     or (p_category is not null and p_category !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
     or (p_organization is not null and p_organization !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
    raise exception 'search_invalid' using errcode = 'P0001';
  end if;
  v_folded := private.fold_accents(v_q);
  v_tsq := private.search_tsquery(v_q);
  -- Under two characters, or only words too common to search ("le", "de"):
  -- nothing, and the page says which.
  if v_q <> '' and v_tsq is null then
    return jsonb_build_object('results', '[]'::jsonb, 'total', 0, 'has_more', false,
                              'too_short', char_length(regexp_replace(v_folded, '\s', '', 'g')) < 2,
                              'counts', jsonb_build_object('association', 0, 'post', 0, 'event', 0, 'campaign', 0, 'position', 0));
  end if;
  v_relevance := v_tsq is not null and coalesce(p_sort, 'relevance') = 'relevance';
  -- Listing events without a query or a window: the ones to come.
  if v_tsq is null and v_when is null and p_type = 'event' then
    v_when := 'upcoming';
  end if;
  -- Event windows, in Paris days (daylight saving included by paris_start_of).
  case v_when
    when 'today' then
      v_from := now(); v_to := private.paris_start_of(v_today + 1);
    when 'week' then
      v_from := now(); v_to := private.paris_start_of(v_today + (8 - v_dow));
    when 'weekend' then
      v_from := greatest(now(), private.paris_start_of(v_today + (6 - v_dow)));
      v_to := private.paris_start_of(v_today + (8 - v_dow));
    when 'upcoming' then
      v_from := now(); v_to := null;
    when 'past' then
      v_from := null; v_to := now();
    else
      null;
  end case;

  -- One statement: the matching rows of every type (hits), their counts per
  -- type, then the requested page with its public cards.
  with hits (type, id, score, ord1, ord2, sort_name) as (
  -- Association pages (published profile, page public).
  select 'association'::text, o.id,
         case when v_tsq is null then 0 else
           ts_rank_cd(ap.search, v_tsq, 32)::numeric
           + private.search_title_bonus(o.name, v_folded)
           + greatest(private.search_title_bonus(coalesce(o.short_name, ''), v_folded) - 0.25, 0)
           + case when private.search_name_matches(o.name, o.short_name, v_folded)
                  then 0.3 else 0 end end,
         case when o.kind = 'bde' then 0 else 1 end, 0, o.name
    from public.organizations o
    join public.association_profiles ap on ap.organization_id = o.id and ap.stage = 'published'
   where (p_type is null or p_type = 'association')
     and private.association_page_is_public(o.id)
     and (p_organization is null or o.slug = p_organization)
     and (p_type is distinct from 'association' or p_category is null
          or exists (select 1 from public.association_categories k where k.slug = p_category and k.id = any (ap.category_ids)))
     and (v_tsq is null or ap.search @@ v_tsq
          or exists (select 1 from public.association_categories k
                      where k.id = any (ap.category_ids) and to_tsvector('french'::regconfig, private.fold_accents(k.label)) @@ v_tsq))
  union all
  -- Articles: the published revision only, never a draft.
  select 'post', p.id,
         case when v_tsq is null then 0 else
           ts_rank_cd(r.search, v_tsq, 32)::numeric
           + private.search_title_bonus(r.title, v_folded)
           + case when private.search_name_matches(o.name, o.short_name, v_folded)
                  then 0.3 else 0 end
           + case when p.first_published_at > now() - interval '30 days' then 0.1 else 0 end end,
         0, -extract(epoch from p.first_published_at)::numeric, r.title
    from public.posts p
    join public.post_revisions r on r.id = p.published_revision_id
    join public.organizations o on o.id = p.organization_id
   where (p_type is null or p_type = 'post')
     and p.publication = 'published' and p.hidden_at is null
     and private.association_page_is_public(p.organization_id)
     and (p_organization is null or o.slug = p_organization)
     and (p_type is distinct from 'post' or p_category is null
          or exists (select 1 from public.post_categories c where c.id = r.category_id and c.slug = p_category))
     and (v_tsq is null or r.search @@ v_tsq
          or (private.search_name_matches(o.name, o.short_name, v_folded)))
  union all
  -- Events (cancelled ones stay findable, shown as cancelled).
  select 'event', e.id,
         case when v_tsq is null then 0 else
           ts_rank_cd(e.search, v_tsq, 32)::numeric
           + private.search_title_bonus(e.title, v_folded)
           + case when private.search_name_matches(o.name, o.short_name, v_folded)
                  then 0.3 else 0 end
           + case when e.ends_at > now() then 0.15 else -0.15 end end,
         case when e.ends_at > now() then 0 else 1 end,
         case when e.ends_at > now() then extract(epoch from e.starts_at) else -extract(epoch from e.starts_at) end::numeric,
         e.title
    from public.events e
    join public.organizations o on o.id = e.organization_id
   where (p_type is null or p_type = 'event')
     and private.event_is_public(e)
     and (p_organization is null or o.slug = p_organization)
     and (p_type is distinct from 'event' or p_category is null
          or exists (select 1 from public.event_categories c where c.id = e.category_id and c.slug = p_category))
     and (p_type is distinct from 'event' or p_place is null or e.location_type = p_place)
     and (p_type is distinct from 'event' or v_when is null
          or ((v_from is null or e.ends_at > v_from) and (v_to is null or e.starts_at < v_to)
              and (v_when <> 'past' or e.ends_at <= now())))
     and (v_tsq is null or e.search @@ v_tsq
          or (private.search_name_matches(o.name, o.short_name, v_folded)))
  union all
  -- Recruitment campaigns, with their real state.
  select 'campaign', c.id,
         case when v_tsq is null then 0 else
           ts_rank_cd(c.search, v_tsq, 32)::numeric
           + private.search_title_bonus(c.title, v_folded)
           + case when private.search_name_matches(o.name, o.short_name, v_folded)
                  then 0.3 else 0 end
           + case when private.campaign_state(c) in ('open', 'upcoming') then 0.15 else -0.15 end end,
         case private.campaign_state(c) when 'open' then 0 when 'upcoming' then 1 when 'paused' then 2 when 'closed' then 3 else 4 end,
         case private.campaign_state(c)
           when 'open' then extract(epoch from c.closes_at)
           when 'upcoming' then extract(epoch from c.opens_at)
           else -extract(epoch from coalesce(c.closes_at, c.updated_at)) end::numeric,
         c.title
    from public.recruitment_campaigns c
    join public.organizations o on o.id = c.organization_id
   where (p_type is null or p_type = 'campaign')
     and private.campaign_is_public(c)
     and (p_organization is null or o.slug = p_organization)
     and (p_type is distinct from 'campaign' or p_status is null
          or (p_status = 'open' and private.campaign_state(c) = 'open')
          or (p_status = 'upcoming' and private.campaign_state(c) = 'upcoming')
          or (p_status = 'closing' and private.campaign_state(c) = 'open' and c.closes_at <= now() + interval '7 days')
          or (p_status = 'closed' and private.campaign_state(c) in ('closed', 'cancelled')))
     and (v_tsq is null or c.search @@ v_tsq
          or (private.search_name_matches(o.name, o.short_name, v_folded)))
  union all
  -- Positions of a public campaign (retired ones never).
  select 'position', ps.id,
         case when v_tsq is null then 0 else
           ts_rank_cd(ps.search, v_tsq, 32)::numeric
           + private.search_title_bonus(ps.title, v_folded)
           + case when private.search_name_matches(o.name, o.short_name, v_folded)
                  then 0.3 else 0 end
           + case when private.position_accepting(ps, c) then 0.15 else -0.15 end end,
         case when private.position_accepting(ps, c) then 0
              when private.campaign_state(c) = 'upcoming' then 1 else 3 end,
         case when private.position_accepting(ps, c) then extract(epoch from private.position_closes(ps, c))
              else -extract(epoch from coalesce(private.position_closes(ps, c), c.updated_at)) end::numeric,
         ps.title
    from public.recruitment_positions ps
    join public.recruitment_campaigns c on c.id = ps.campaign_id
    join public.organizations o on o.id = c.organization_id
   where (p_type is null or p_type = 'position')
     and ps.retired_at is null
     and private.campaign_is_public(c)
     and (p_organization is null or o.slug = p_organization)
     and (p_type is distinct from 'position' or p_status is null
          or (p_status = 'open' and private.position_accepting(ps, c))
          or (p_status = 'upcoming' and private.campaign_state(c) = 'upcoming')
          or (p_status = 'closing' and private.position_accepting(ps, c) and private.position_closes(ps, c) <= now() + interval '7 days')
          or (p_status = 'closed' and not private.position_accepting(ps, c) and private.campaign_state(c) <> 'upcoming'))
     and (v_tsq is null or ps.search @@ v_tsq
          or (private.search_name_matches(o.name, o.short_name, v_folded)))
  ),
  ranked as (
    select h.*,
           row_number() over (partition by h.type
                              order by case when v_relevance then -h.score else 0 end, h.ord1, h.ord2, h.sort_name, h.id) as type_rank
      from hits h
  ),
  kept as (
    select * from ranked where v_per_type is null or type_rank <= v_per_type
  ),
  page as (
    select k.*, count(*) over () as total,
           row_number() over (order by case when v_relevance then -k.score else 0 end, k.ord1, k.ord2, k.sort_name, k.id) as rn
      from kept k
  )
  select
    (select coalesce(jsonb_object_agg(t.type, (select count(*) from hits h where h.type = t.type)), '{}'::jsonb)
       from unnest(array['association', 'post', 'event', 'campaign', 'position']) as t (type)),
    coalesce((
      select jsonb_agg(jsonb_build_object('type', pg.type, 'id', pg.id, 'score', round(pg.score, 4),
                                          'card', private.public_card(pg.type, pg.id))
             order by pg.rn)
        from page pg
       where pg.rn > v_offset and pg.rn <= v_offset + v_limit), '[]'::jsonb),
    coalesce((select max(pg.total) from page pg), 0)
    into v_counts, v_results, v_total;

  return jsonb_build_object(
    'results', v_results,
    'counts', v_counts,
    'total', v_total,
    'has_more', v_total > v_offset + v_limit,
    'too_short', false);
end;
$$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.association_search_vector(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.position_search_vector(text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.search_tsquery(text) from public, anon, authenticated, service_role;
revoke all on function private.search_association_card(uuid) from public, anon, authenticated, service_role;
revoke all on function private.public_card(text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.search_title_bonus(text, text) from public, anon, authenticated, service_role;
revoke all on function private.search_name_matches(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.search_campus(text, text, text, text, text, text, text, text, integer, integer, integer) from public;
grant execute on function public.search_campus(text, text, text, text, text, text, text, text, integer, integer, integer) to anon, authenticated;
