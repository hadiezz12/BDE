-- Phase 12 · Campus search, saved items, spotlights and interests: the
-- security matrix of the brief (§94) and its scenarios — search accuracy
-- (§95), visibility through drafts, publication, unpublication and
-- moderation (§96), event discovery (§97), recruitment discovery (§98),
-- saved items (§99) — straight against the database, as a visitor (anon)
-- and as students. Runs on top of supabase/seed.sql (Alice leads the BDE
-- and holds platform.content.feature; Julie presides Finance, Lucas writes
-- for it; Emma presides Sports; Nina, Paul and Marc are students; Hugo's
-- treasurer mandate ended). Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(187);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert, update on fx to anon, authenticated, service_role;

insert into fx (k, id) values
  ('bde', (select id from public.organizations where kind = 'bde')),
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('alice', 'a0000000-0000-4000-8000-000000000001'),
  ('marc', 'a0000000-0000-4000-8000-000000000002'),
  ('julie', 'a0000000-0000-4000-8000-000000000004'),
  ('lucas', 'a0000000-0000-4000-8000-000000000005'),
  ('emma', 'a0000000-0000-4000-8000-000000000006'),
  ('nina', 'a0000000-0000-4000-8000-000000000007'),
  ('hugo', 'a0000000-0000-4000-8000-000000000008'),
  ('paul', 'a0000000-0000-4000-8000-00000000000a');
insert into fx (k, id) values
  ('p_rentree', (select id from public.posts where slug is not null and organization_id = (select id from fx where k = 'finance')
                    and publication = 'published' order by first_published_at limit 1)),
  ('p_draft', (select p.id from public.posts p join public.post_revisions r on r.id = p.working_revision_id
                where r.title = 'Brouillon de Lucas (exemple)')),
  ('p_review', (select p.id from public.posts p join public.post_revisions r on r.id = p.working_revision_id
                 where r.title = 'Soirée networking (exemple)')),
  ('p_scheduled', (select p.id from public.posts p join public.post_revisions r on r.id = p.working_revision_id
                    where r.title = 'Atelier marchés (exemple)')),
  ('e_atelier', (select id from public.events where title = 'Atelier finance (exemple)')),
  ('e_cancelled', (select id from public.events where title = 'Conférence annulée (exemple)')),
  ('e_draft', (select id from public.events where title = 'Brouillon de Lucas (événement exemple)')),
  ('c_finance', (select id from public.recruitment_campaigns where organization_id = (select id from fx where k = 'finance')
                    and title = 'Recrutement 2027 (exemple)')),
  ('c_finance_draft', (select id from public.recruitment_campaigns where title = 'Pôle partenariats 2027 (exemple)')),
  ('c_sports', (select id from public.recruitment_campaigns where organization_id = (select id from fx where k = 'sports')
                   and title = 'Recrutement 2027 (exemple)')),
  ('pos_treso', (select id from public.recruitment_positions where title = 'Trésorerie (exemple)')),
  ('pos_events', (select ps.id from public.recruitment_positions ps join public.recruitment_campaigns c on c.id = ps.campaign_id
                   where ps.title = 'Événements (exemple)' and c.organization_id = (select id from fx where k = 'sports'))),
  ('app_nina', (select a.id from public.applications a where a.candidate_id = 'a0000000-0000-4000-8000-000000000007' and a.status = 'submitted'));

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;

create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;
grant execute on function pg_temp.fid(text) to anon, authenticated, service_role;

-- Whether a search (as whoever calls it) returns this item.
create function pg_temp.found(p_q text, p_type text, p_id uuid) returns boolean language sql stable as $f$
  select exists (select 1 from jsonb_array_elements(public.search_campus(p_q, p_type, p_limit => 24) -> 'results') r
                  where (r ->> 'id')::uuid = p_id)
$f$;
grant execute on function pg_temp.found(text, text, uuid) to anon, authenticated, service_role;

-- The card a search returns for this item (null when not returned).
create function pg_temp.card(p_q text, p_type text, p_id uuid) returns jsonb language sql stable as $f$
  select r -> 'card' from jsonb_array_elements(public.search_campus(p_q, p_type, p_limit => 24) -> 'results') r
   where (r ->> 'id')::uuid = p_id
$f$;
grant execute on function pg_temp.card(text, text, uuid) to anon, authenticated, service_role;

create function pg_temp.total(p_q text, p_type text default null) returns integer language sql stable as $f$
  select (public.search_campus(p_q, p_type) ->> 'total')::integer
$f$;
grant execute on function pg_temp.total(text, text) to anon, authenticated, service_role;

-- A count as the database sees it (the test's own eyes, not a user's).
create function pg_temp.n(p_sql text) returns integer language plpgsql security definer as $f$
declare v integer;
begin
  execute p_sql into v;
  return v;
end $f$;
grant execute on function pg_temp.n(text) to anon, authenticated, service_role;

-- =============================================================================
-- 1. A visitor searches what is public (§94, §95)
-- =============================================================================

set local role anon;

select ok(pg_temp.found('finance', 'association', pg_temp.fid('finance')), 'a visitor finds the Finance association');
select ok(pg_temp.found('finance', 'post', pg_temp.fid('p_rentree')), 'a visitor finds the published Finance article');
select ok(pg_temp.found('finance', 'event', pg_temp.fid('e_atelier')), 'a visitor finds the Finance workshop');
select ok(pg_temp.found('finance', 'campaign', pg_temp.fid('c_finance')), 'a visitor finds the Finance recruitment');
select ok(pg_temp.found('tresorerie', 'position', pg_temp.fid('pos_treso')), 'a visitor finds the Trésorerie position (accents ignored)');
select ok(pg_temp.found('trésorerie', 'position', pg_temp.fid('pos_treso')), 'and with the accent typed');
select ok(pg_temp.found('financ', 'association', pg_temp.fid('finance')), 'a word typed halfway finds it (prefix)');
select ok(pg_temp.found('FINANCE', null, pg_temp.fid('finance')), 'case does not matter');

-- "finance" across every type: the association first, every type represented.
select is((public.search_campus('finance') -> 'results' -> 0 ->> 'type'), 'association',
  'the association named Finance comes first');
select ok((select bool_and((public.search_campus('finance') -> 'counts' ->> t)::integer > 0)
             from unnest(array['association', 'post', 'event', 'campaign', 'position']) t),
  'finance finds an association, an article, events, a campaign and positions');
select ok((select bool_and(r ->> 'type' in ('association', 'post', 'event', 'campaign', 'position') and r -> 'card' is not null)
             from jsonb_array_elements(public.search_campus('finance', p_limit => 24) -> 'results') r),
  'every result has a known type and a card');
select ok((select bool_and(coalesce(r -> 'card' ->> 'slug', r -> 'card' -> 'campaign' ->> 'slug') ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
             from jsonb_array_elements(public.search_campus('finance', p_limit => 24) -> 'results') r),
  'results carry slugs only (the site builds its own links): no URL to send anyone elsewhere');
select ok(not exists (select 1 from jsonb_array_elements(public.search_campus('finance', p_limit => 24) -> 'results') r
                       where r::text ~* '"(url|href|email|access_details|answers?|notes?)"'),
  'no result carries a link, an e-mail, private event details, answers or notes');
select is((pg_temp.card('finance', 'campaign', pg_temp.fid('c_finance')) -> 'organization' ->> 'slug'), 'exemple-finance',
  'the campaign card names its association by slug');
select is((pg_temp.card('finance', 'event', pg_temp.fid('e_atelier')) -> 'category' ->> 'slug'), 'carriere',
  'the event card carries its real category');

-- Other words of the brief (§95).
select ok(pg_temp.found('sports', 'association', pg_temp.fid('sports')), '"sports" finds the Sports association');
select ok(pg_temp.total('recrutement', 'campaign') >= 2, '"recrutement" finds the recruitment campaigns');
select is(pg_temp.total('financesoccer'), 0, 'a word nobody wrote finds nothing (no fuzzy false friends)');

-- =============================================================================
-- 2. Nothing private is ever found (§94)
-- =============================================================================

select ok(not pg_temp.found('brouillon', null, pg_temp.fid('p_draft')), 'an unpublished draft is not found');
select ok(not pg_temp.found('networking', null, pg_temp.fid('p_review')), 'an article waiting for review is not found');
select ok(not pg_temp.found('marches', null, pg_temp.fid('p_scheduled')), 'a scheduled article is not found before it goes out');
select is(pg_temp.total('corrigee'), 0, 'the edit of a published article waiting for review is not searchable (§94: unapproved revision)');
select is((pg_temp.card('rentree', 'post', pg_temp.fid('p_rentree')) ->> 'title'), 'Rentrée de l''asso Finance (exemple)',
  'the published article is found under its published title, not the pending one');
select ok(not pg_temp.found('brouillon', null, pg_temp.fid('e_draft')), 'a draft event is not found');
select ok(not pg_temp.found('partenariats', null, pg_temp.fid('c_finance_draft')), 'an unpublished campaign is not found');
select is(pg_temp.total('candidature fictive'), 0, 'submitted answers are not searchable');
select is(pg_temp.total('basket'), 0, 'not even one word of them');
select is(pg_temp.total('brouillon fictif tom'), 0, 'a draft application is not searchable');
select is(pg_temp.total('nina@comptes.example.test'), 0, 'an e-mail address finds nobody');

reset role;
-- What the search reads: content tables only, never applications, answers,
-- documents, reviews, interviews, notifications, audit or personal profiles.
select ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (('public', 'search_campus'), ('private', 'public_card'), ('private', 'search_association_card'),
                                      ('private', 'search_tsquery'), ('private', 'search_name_matches'), ('private', 'search_title_bonus'))
       and p.prosrc ~* '(application|answer|document|review|interview|notification|governance_audit|public\.profiles\M|storage\.|saved_items|student_interests)'),
  'the search functions never read applications, answers, documents, reviews, interviews, notifications, audit, profiles or saved items');
select ok(not has_function_privilege('anon', 'private.public_card(text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.public_card(text, uuid)', 'execute')
          and not has_function_privilege('anon', 'private.search_tsquery(text)', 'execute')
          and not has_function_privilege('anon', 'private.search_association_card(uuid)', 'execute'),
  'the helpers behind the search cannot be called from the API');
select ok(has_function_privilege('anon', 'public.search_campus(text, text, text, text, text, text, text, text, integer, integer, integer)', 'execute'),
  'the search itself is public');
select ok(not has_table_privilege('anon', 'public.saved_items', 'select') and not has_table_privilege('anon', 'public.student_interests', 'select'),
  'a visitor reads no saved item and no interest');
select ok(not has_table_privilege('authenticated', 'public.saved_items', 'insert')
          and not has_table_privilege('authenticated', 'public.saved_items', 'update')
          and not has_table_privilege('authenticated', 'public.saved_items', 'delete')
          and not has_table_privilege('authenticated', 'public.student_interests', 'insert'),
  'nobody writes saved items or interests directly');
select is((select count(*)::integer from pg_class where relname = 'event_bookmarks' and relnamespace = 'public'::regnamespace), 0,
  'the events-only bookmarks are gone (one saved-items list)');

-- =============================================================================
-- 3. Malformed and malicious input (§28, §94)
-- =============================================================================

set local role anon;
select throws_ok($$ select public.search_campus('finance', 'post; drop table public.posts') $$,
  'P0001', 'search_invalid', 'an unknown type is refused (no SQL ever built from it)');
select throws_ok($$ select public.search_campus('finance', 'event', p_when => 'tomorrow''--') $$,
  'P0001', 'search_invalid', 'an unknown time window is refused');
select throws_ok($$ select public.search_campus('finance', 'campaign', p_status => 'open or 1=1') $$,
  'P0001', 'search_invalid', 'an unknown status is refused');
select throws_ok($$ select public.search_campus('finance', p_category => 'Sport'' or ''1''=''1') $$,
  'P0001', 'search_invalid', 'a category that is not a slug is refused');
select throws_ok($$ select public.search_campus('finance', p_organization => '../admin') $$,
  'P0001', 'search_invalid', 'an association that is not a slug is refused');
select lives_ok($$ select public.search_campus('''); drop table public.posts; --') $$, 'SQL typed as text is only text');
select lives_ok($$ select public.search_campus('finance:* & !(x) <-> |') $$, 'text-search operators typed by hand do not break it');
select lives_ok($$ select public.search_campus('<script>alert(1)</script>') $$, 'markup typed as text is only text');
select lives_ok($$ select public.search_campus(repeat('finance ', 500)) $$, 'a very long query is cut, not an error');
select is((public.search_campus('x') ->> 'too_short')::boolean, true, 'one character: too short, says so');
select is((public.search_campus('  ') ->> 'total'), (public.search_campus(null) ->> 'total'), 'blank is no query: the listing, not an error');
select is((public.search_campus('le') ->> 'total')::integer, 0, 'only a common word: nothing, without an error');
select is((public.search_campus('le') ->> 'too_short')::boolean, false, 'and it does not claim it was too short');
select ok(jsonb_array_length(public.search_campus(null, p_limit => 1000) -> 'results') <= 24,
  'a page holds 24 results at most, whatever is asked');
select is(jsonb_array_length(public.search_campus('finance', p_offset => 100000) -> 'results'), 0,
  'a page far past the end is empty, not an error');

-- Pagination: two pages never overlap, and together they are the whole list.
select is(
  (select count(distinct r ->> 'id')::integer from (
     select jsonb_array_elements(public.search_campus('finance', p_limit => 4, p_offset => 0) -> 'results') r
     union all
     select jsonb_array_elements(public.search_campus('finance', p_limit => 4, p_offset => 4) -> 'results')
     union all
     select jsonb_array_elements(public.search_campus('finance', p_limit => 4, p_offset => 8) -> 'results')) x),
  least((public.search_campus('finance') ->> 'total')::integer, 12),
  'pages follow each other without repeating a result');
select is((public.search_campus('finance', p_limit => 4) ->> 'has_more')::boolean,
          (public.search_campus('finance') ->> 'total')::integer > 4, 'has_more says whether another page exists');
select ok((select bool_and(n <= 2) from (
    select count(*) as n from jsonb_array_elements(public.search_campus('finance', p_per_type => 2, p_limit => 24) -> 'results') r
     group by r ->> 'type') x),
  'the grouped view keeps two of each type: no type crowds out the others (§23)');

-- Filters.
select ok((select bool_and(r ->> 'type' = 'event')
             from jsonb_array_elements(public.search_campus('finance', 'event') -> 'results') r), 'the type filter keeps one type');
select ok((select bool_and(r -> 'card' -> 'organization' ->> 'slug' = 'exemple-sports')
             from jsonb_array_elements(public.search_campus(null, 'event', p_organization => 'exemple-sports') -> 'results') r)
          and (public.search_campus(null, 'event', p_organization => 'exemple-sports') ->> 'total')::integer > 0,
  'the association filter keeps that association''s events');
select ok((select bool_and((r -> 'card' ->> 'ends_at')::timestamptz > now())
             from jsonb_array_elements(public.search_campus(null, 'event') -> 'results') r),
  'listing events without a window shows the ones to come');
select ok((select bool_and((r -> 'card' ->> 'ends_at')::timestamptz <= now())
             from jsonb_array_elements(public.search_campus(null, 'event', p_when => 'past') -> 'results') r)
          and (public.search_campus(null, 'event', p_when => 'past') ->> 'total')::integer > 0,
  'the past window shows only events over');
select ok((select bool_and((r -> 'card' ->> 'starts_at')::timestamptz < private_end)
             from jsonb_array_elements(public.search_campus(null, 'event', p_when => 'week') -> 'results') r,
                  (select ((now() at time zone 'Europe/Paris')::date + (8 - extract(isodow from now() at time zone 'Europe/Paris')::integer))::timestamp
                          at time zone 'Europe/Paris' as private_end) w),
  'this week ends on Sunday night, Paris time');
select ok((select bool_and(r -> 'card' -> 'location' ->> 'type' = 'campus')
             from jsonb_array_elements(public.search_campus(null, 'event', p_place => 'campus') -> 'results') r),
  'the place filter keeps events on campus');
select ok((select bool_and(r -> 'card' ->> 'state' = 'open')
             from jsonb_array_elements(public.search_campus(null, 'campaign', p_status => 'open') -> 'results') r),
  'the open filter shows open recruitment only');

-- =============================================================================
-- 4. An article's life: draft, publication, edit, unpublication, moderation (§96)
-- =============================================================================

reset role;
set local role authenticated;
select pg_temp.as_user('lucas');
select lives_ok($$ insert into fx (k, id) values ('v_post', public.create_post(pg_temp.fid('finance'), 'article', 'Ornithorynque (test)')) $$,
  'Lucas writes an article');
select lives_ok($$ insert into fx (k, v) values ('v_rev1', public.save_post_revision(pg_temp.fid('v_post'),
       (select working_revision_id from public.posts where id = pg_temp.fid('v_post')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Ornithorynque (test)', 'intro', 'Première version zebrelune.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Texte de la version un."}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) ->> 'revision_id') $$, 'its first version is saved');
select lives_ok($$ select public.submit_post_revision(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev1')) $$, 'and submitted');

reset role;
set local role anon;
select is(pg_temp.total('zebrelune'), 0, 'V1 waiting for review: not searchable');

reset role;
set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.review_post_revision(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev1'), 'approve', null) $$,
  'the president approves V1');
select lives_ok($$ select public.publish_post(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev1')) $$, 'V1 is published');

reset role;
set local role anon;
select ok(pg_temp.found('zebrelune', 'post', pg_temp.fid('v_post')), 'V1 published: searchable at once (no index to rebuild)');
select ok(pg_temp.found('ornithorynque', 'post', pg_temp.fid('v_post')), 'by its title too');

reset role;
set local role authenticated;
select pg_temp.as_user('lucas');
select lives_ok($$ insert into fx (k, v) values ('v_rev2', public.save_post_revision(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev1'), 0,
       jsonb_build_object('kind', 'article', 'title', 'Ornithorynque (test, v2)', 'intro', 'Seconde version quokkasecret.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Texte de la version deux."}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) ->> 'revision_id') $$, 'Lucas drafts V2');

reset role;
set local role anon;
select is(pg_temp.total('quokkasecret'), 0, 'the draft V2 is not searchable');
select ok(pg_temp.found('zebrelune', 'post', pg_temp.fid('v_post')), 'V1 still is, as the public still reads it');

reset role;
set local role authenticated;
select pg_temp.as_user('lucas');
select lives_ok($$ select public.submit_post_revision(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev2')) $$, 'V2 is submitted');
select pg_temp.as_user('julie');
select lives_ok($$ select public.review_post_revision(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev2'), 'approve', null) $$, 'approved');
select lives_ok($$ select public.publish_post(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev2')) $$, 'and published');

reset role;
set local role anon;
select ok(pg_temp.found('quokkasecret', 'post', pg_temp.fid('v_post')), 'V2 published: its words are found');
select is(pg_temp.total('zebrelune'), 0, 'and V1''s words no longer are');
select is((pg_temp.card('quokkasecret', 'post', pg_temp.fid('v_post')) ->> 'title'), 'Ornithorynque (test, v2)', 'under V2''s title');
select ok(exists (select 1 from jsonb_array_elements(public.public_related_posts('post', pg_temp.fid('p_rentree'))) p
                   where (p ->> 'id')::uuid = pg_temp.fid('v_post')), 'it is related to the other Finance article (same association)');

-- Nina saves it before it goes away.
reset role;
set local role authenticated;
select pg_temp.as_user('nina', 'aal1');
select is(public.save_item('post', pg_temp.fid('v_post'), true), true, 'a student saves the published article');

select pg_temp.as_user('julie');
select lives_ok($$ select public.unpublish_post(pg_temp.fid('v_post'), 'Retrait de test.') $$, 'the association unpublishes it');

reset role;
set local role anon;
select is(pg_temp.total('quokkasecret'), 0, 'unpublished: gone from the search at once');

reset role;
set local role authenticated;
select pg_temp.as_user('nina', 'aal1');
select is((select x -> 'card' from jsonb_array_elements(public.my_saved_items('post')) x where (x ->> 'id')::uuid = pg_temp.fid('v_post')),
  'null'::jsonb, 'in the saved list it keeps no card: no title, nothing it said');
select is((select (x ->> 'available')::boolean from jsonb_array_elements(public.my_saved_items('post')) x
            where (x ->> 'id')::uuid = pg_temp.fid('v_post')), false, 'only that it is no longer available');

select pg_temp.as_user('julie');
select lives_ok($$ select public.publish_post(pg_temp.fid('v_post'), (select v::uuid from fx where k = 'v_rev2')) $$,
  'the association publishes it again');

reset role;
set local role anon;
select ok(pg_temp.found('quokkasecret', 'post', pg_temp.fid('v_post')), 'republished: found again');

reset role;
set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$ select public.hide_post(pg_temp.fid('v_post'), 'Masquage de test.') $$, 'the BDE hides it (moderation)');

reset role;
set local role anon;
select is(pg_temp.total('quokkasecret'), 0, 'a moderated article is never returned');
select is(pg_temp.total('ornithorynque'), 0, 'not by its title either');

-- =============================================================================
-- 5. An event's life: discovery, save, registration, reschedule, cancellation (§97)
-- =============================================================================

reset role;
set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('e_new', public.create_event(pg_temp.fid('finance'), 'Conférence licorne (test)')) $$,
  'Finance creates an event');
select lives_ok($$ select public.save_event(pg_temp.fid('e_new'), 1, jsonb_build_object(
    'summary', 'Conférence fictive.', 'location_type', 'campus', 'venue_name', 'Amphi de démonstration (test)',
    'starts_at', date_trunc('hour', now()) + interval '9 days', 'ends_at', date_trunc('hour', now()) + interval '9 days 2 hours',
    'registration_mode', 'internal', 'capacity', 30)) $$, 'with its details');

reset role;
set local role anon;
select is(pg_temp.total('licorne'), 0, 'a draft event is not searchable');

reset role;
set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.publish_event(pg_temp.fid('e_new')) $$, 'it is published');

reset role;
set local role anon;
select ok(pg_temp.found('licorne', 'event', pg_temp.fid('e_new')), 'published: found by search');
select ok(pg_temp.found(null, 'event', pg_temp.fid('e_new')), 'and in the upcoming listing');
select ok(exists (select 1 from jsonb_array_elements(public.public_association_events('exemple-finance')) e
                   where (e ->> 'id')::uuid = pg_temp.fid('e_new')), 'and on its association''s page');

reset role;
set local role authenticated;
select pg_temp.as_user('nina', 'aal1');
select is(public.save_item('event', pg_temp.fid('e_new'), true), true, 'Nina saves the event');
select is((public.my_event_status(pg_temp.fid('e_new')) ->> 'bookmarked')::boolean, true, 'the event page knows it is saved');
select is((public.my_event_status(pg_temp.fid('e_new')) -> 'registration'), 'null'::jsonb, 'saving is not registering');
select lives_ok($$ select public.register_for_event(pg_temp.fid('e_new')) $$, 'she registers, separately');
select is(public.save_item('event', pg_temp.fid('e_new'), false), false, 'she removes it from her saved items');
select is((public.my_event_status(pg_temp.fid('e_new')) -> 'registration' ->> 'status'), 'confirmed',
  'her registration stays: unsaving is not unregistering');
select is(public.save_item('event', pg_temp.fid('e_new'), true), true, 'she saves it again');
select ok(exists (select 1 from jsonb_array_elements(public.my_events() -> 'bookmarks') b where (b ->> 'id')::uuid = pg_temp.fid('e_new')),
  'her events list shows it as saved');

select pg_temp.as_user('julie');
select lives_ok($$ select public.save_event(pg_temp.fid('e_new'), (select version from public.events where id = pg_temp.fid('e_new')),
    jsonb_build_object('starts_at', date_trunc('hour', now()) + interval '12 days', 'ends_at', date_trunc('hour', now()) + interval '12 days 2 hours')) $$,
  'the event is moved three days later');
insert into fx (k, v) values ('e_new_start', (select starts_at::text from public.events where id = pg_temp.fid('e_new')));

reset role;
set local role anon;
select is((pg_temp.card('licorne', 'event', pg_temp.fid('e_new')) ->> 'starts_at')::timestamptz,
  (select v::timestamptz from fx where k = 'e_new_start'), 'the search shows the new date');

reset role;
set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.cancel_event(pg_temp.fid('e_new'), 'Annulation de test.') $$, 'the event is cancelled');

reset role;
set local role anon;
select is((pg_temp.card('licorne', 'event', pg_temp.fid('e_new')) ->> 'status'), 'cancelled', 'the search says it is cancelled');
select is((pg_temp.card('annulee', 'event', pg_temp.fid('e_cancelled')) ->> 'status'), 'cancelled',
  'a cancelled seed event is shown cancelled too');

reset role;
set local role authenticated;
select pg_temp.as_user('nina', 'aal1');
select is((select x -> 'card' ->> 'status' from jsonb_array_elements(public.my_saved_items('event')) x
            where (x ->> 'id')::uuid = pg_temp.fid('e_new')), 'cancelled', 'and so does her saved list');
reset role;
select is(pg_temp.n(format('select count(*) from public.event_registrations where event_id = %L and user_id = %L',
                           pg_temp.fid('e_new'), pg_temp.fid('nina'))), 1,
  'her registration is its own record, untouched by saving or unsaving');

-- =============================================================================
-- 6. Recruitment: find, save, apply, close (§98)
-- =============================================================================

set local role anon;
select ok(pg_temp.found('sports', 'association', pg_temp.fid('sports')), 'search finds Sports');
select ok(pg_temp.found('recrutement', 'campaign', pg_temp.fid('c_sports')), 'its campaign');
select ok(pg_temp.found('evenements', 'position', pg_temp.fid('pos_events')), 'and its Événements position');
select is((pg_temp.card('evenements', 'position', pg_temp.fid('pos_events')) ->> 'accepting')::boolean, true,
  'shown as taking applications');

reset role;
set local role authenticated;
select pg_temp.as_user('paul', 'aal1');
select is(public.save_item('position', pg_temp.fid('pos_events'), true), true, 'Paul saves the position');
select lives_ok($$ insert into fx (k, id) values ('app_paul', (public.start_application(pg_temp.fid('pos_events')) ->> 'application_id')::uuid) $$,
  'he starts an application');
select lives_ok($$ select public.submit_application(pg_temp.fid('app_paul'),
    (public.save_application_answers(pg_temp.fid('app_paul'), 1,
      '{"motivation": "Candidature fictive de Paul kangourouprive.", "sport": "foot"}'::jsonb) ->> 'version')::integer, true) $$,
  'and submits it');
select ok(exists (select 1 from jsonb_array_elements(public.my_applications()) a where (a -> 'application' ->> 'id')::uuid = pg_temp.fid('app_paul')),
  'his application is under his applications');
select is(jsonb_array_length(public.my_saved_items('position')), 1, 'the saved position stays a saved position');
select is(public.save_item('position', pg_temp.fid('pos_events'), false), false, 'he can unsave it');
reset role;
select is(pg_temp.n(format('select count(*) from public.applications where id = %L and status = %L', pg_temp.fid('app_paul'), 'submitted')), 1,
  'unsaving does not touch the application');
set local role anon;
select is(pg_temp.total('kangourouprive'), 0, 'his answers never reach the search');

reset role;
set local role authenticated;
select pg_temp.as_user('emma');
select lives_ok($$ select public.set_recruitment_status(pg_temp.fid('c_sports'), 'closed') $$, 'Sports closes its recruitment');

reset role;
set local role anon;
select is((pg_temp.card('recrutement', 'campaign', pg_temp.fid('c_sports')) ->> 'state'), 'closed', 'the search says closed');
select is((pg_temp.card('evenements', 'position', pg_temp.fid('pos_events')) ->> 'accepting')::boolean, false,
  'its positions stop taking applications');
select ok(not pg_temp.found(null, 'campaign', pg_temp.fid('c_sports')) or not exists (
            select 1 from jsonb_array_elements(public.search_campus(null, 'campaign', p_status => 'open') -> 'results') r
             where (r ->> 'id')::uuid = pg_temp.fid('c_sports')),
  'the open filter no longer offers it');
select ok(not exists (select 1 from jsonb_array_elements(public.public_featured_campaigns()) c where (c ->> 'id')::uuid = pg_temp.fid('c_sports')),
  'a closed campaign leaves the front page at once, though still marked featured');

-- =============================================================================
-- 7. Saved items are private (§57, §94, §99)
-- =============================================================================

reset role;
set local role authenticated;
select pg_temp.as_user('alice');
select is(public.save_item('association', pg_temp.fid('finance'), true), true, 'Alice saves Finance');
select is(public.save_item('event', pg_temp.fid('e_atelier'), true), true, 'the Finance workshop');
select is(public.save_item('post', pg_temp.fid('p_rentree'), true), true, 'a published article');
select is(public.save_item('position', pg_temp.fid('pos_treso'), true), true, 'and the Trésorerie position');
select is(public.save_item('post', pg_temp.fid('p_rentree'), true), true, 'saving twice answers saved');
reset role;
select is(pg_temp.n(format('select count(*) from public.saved_items where user_id = %L and post_id = %L', pg_temp.fid('alice'), pg_temp.fid('p_rentree'))), 1,
  'and keeps one record');
set local role authenticated;
select pg_temp.as_user('alice');
select is(jsonb_array_length(public.my_saved_items()), 4, 'all four are in her saved items');
select ok((select bool_and((x ->> 'available')::boolean and x -> 'card' is not null) from jsonb_array_elements(public.my_saved_items()) x),
  'each with its live public card');
select is((public.my_saved_keys() -> 'post' ->> 0)::uuid, pg_temp.fid('p_rentree'), 'the buttons know what she saved');
select is(public.save_item('post', pg_temp.fid('p_rentree'), false), false, 'she removes the article');
select is(jsonb_array_length(public.my_saved_items()), 3, 'it leaves her list');
select is(jsonb_array_length(public.my_saved_items('association')), 1, 'the list filters by kind');
select throws_ok($$ select public.my_saved_items('application') $$, 'P0001', 'item_invalid', 'there is no saved kind "application"');
select throws_ok($$ select public.save_item('application', pg_temp.fid('app_nina'), true) $$, 'P0001', 'item_invalid',
  'an application cannot be saved (§94: another student''s application)');
select throws_ok($$ select public.save_item('post', pg_temp.fid('p_draft'), true) $$, 'P0001', 'item_not_found',
  'a draft cannot be saved');
select throws_ok($$ select public.save_item('event', gen_random_uuid(), true) $$, 'P0001', 'item_not_found',
  'nor an unknown id (same answer as a private one: nothing to probe)');
select throws_ok($$ select public.save_item('event', pg_temp.fid('finance'), true) $$, 'P0001', 'item_not_found',
  'nor an id of another kind');

select pg_temp.as_user('marc');
select is((select count(*)::integer from public.saved_items where user_id = pg_temp.fid('alice')), 0,
  'Marc reads none of Alice''s saved items through the table');
select is(jsonb_array_length(public.my_saved_items()), 0, 'his own list is his own (empty)');
select is(public.save_item('association', pg_temp.fid('sports'), true), true, 'he saves Sports');
select pg_temp.as_user('alice');
select ok(not exists (select 1 from jsonb_array_elements(public.my_saved_items()) x where (x ->> 'id')::uuid = pg_temp.fid('sports')),
  'Alice does not see Marc''s');
select is((select count(*)::integer from public.saved_items where user_id <> pg_temp.fid('alice')), 0,
  'nor any row of anyone else');
select pg_temp.as_user('julie');
select is((select count(*)::integer from public.saved_items), 0,
  'the president of Finance does not see who saved Finance');

reset role;
set local role anon;
select throws_ok($$ select public.save_item('association', pg_temp.fid('finance'), true) $$, '42501', null,
  'a visitor cannot save (sign in first)');
select throws_ok($$ select public.my_saved_items() $$, '42501', null, 'nor read saved items');

-- An expired officer gains nothing from search (§94).
reset role;
set local role authenticated;
select pg_temp.as_user('hugo');
insert into fx (k, v) values ('hugo_finance', public.search_campus('finance', p_limit => 24)::text);
select ok(not pg_temp.found('brouillon', null, pg_temp.fid('p_draft')), 'a former officer finds no draft of the association he served');
reset role;
set local role anon;
select is(public.search_campus('finance', p_limit => 24)::text, (select v from fx where k = 'hugo_finance'),
  'he searches exactly like a visitor: search gives no management access');
reset role;
set local role authenticated;

-- =============================================================================
-- 8. Spotlights: the same featuring, BDE only (§42–44)
-- =============================================================================

select pg_temp.as_user('julie');
select throws_ok($$ select public.set_association_prominence(pg_temp.fid('finance'), 'featured', null) $$,
  'P0001', 'insufficient_permission', 'an association president cannot put their own association on the campus front page');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance'), 'featured', null) $$,
  'P0001', 'insufficient_permission', 'nor their recruitment');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance'), 'featured', null) $$,
  'P0001', 'mfa_required', 'the BDE needs the second factor');
select pg_temp.as_user('alice');
select lives_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance'), 'featured', now() + interval '10 days') $$,
  'the BDE features Finance''s open recruitment for ten days');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_sports'), 'featured', null) $$,
  'P0001', 'campaign_not_open', 'a closed campaign cannot be featured');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance_draft'), 'featured', null) $$,
  'P0001', 'campaign_not_open', 'nor an unpublished one');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance'), 'featured', now() + interval '90 days') $$,
  'P0001', 'prominence_period', 'sixty days at most');
select throws_ok($$ select public.set_association_prominence(pg_temp.fid('bde'), 'featured', null) $$,
  'P0001', 'association_page_not_public', 'the BDE does not put itself "à l''honneur"');
select throws_ok($$ select public.set_association_prominence(pg_temp.fid('sports'), 'featured', null) $$,
  'P0001', 'prominence_limit', 'one association at a time (Finance already is)');
select throws_ok($$ select public.set_campaign_prominence(pg_temp.fid('c_finance'), 'pinned', null) $$,
  'P0001', 'prominence_invalid', 'only normal or featured');

reset role;
set local role anon;
select ok(exists (select 1 from jsonb_array_elements(public.public_featured_campaigns()) c where (c ->> 'id')::uuid = pg_temp.fid('c_finance')),
  'the front page shows the featured recruitment');
select is((public.public_featured_associations() -> 0 ->> 'slug'), 'exemple-finance', 'and the association "à l''honneur"');
reset role;
select is(pg_temp.n($$ select count(*) from public.governance_audit_events where action = 'campaign_prominence_changed' and resource_id = pg_temp.fid('c_finance') $$),
  1, 'featuring is audited');

set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$ select public.hide_recruitment_campaign(pg_temp.fid('c_finance'), 'Masquage de test.') $$, 'the BDE hides the campaign (moderation)');
reset role;
set local role anon;
select ok(not exists (select 1 from jsonb_array_elements(public.public_featured_campaigns()) c where (c ->> 'id')::uuid = pg_temp.fid('c_finance')),
  'a moderated campaign leaves the front page at once');
select ok(not pg_temp.found('finance', 'campaign', pg_temp.fid('c_finance')), 'and the search');
select ok(not pg_temp.found('tresorerie', 'position', pg_temp.fid('pos_treso')), 'with its positions');

reset role;
select lives_ok($$ update public.association_pages set prominence_by = null where organization_id = pg_temp.fid('finance') $$,
  'a featured item outlives the account of who featured it (the account deletion sets it to null)');

-- =============================================================================
-- 9. Unpublishing an association page takes everything of it out (§18, §19)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('emma');
select lives_ok($$ select public.unpublish_association_page(pg_temp.fid('sports'), 'Retrait de test.') $$, 'Sports takes its page offline');
reset role;
set local role anon;
select is((public.search_campus('sports', p_organization => 'exemple-sports') ->> 'total')::integer, 0,
  'nothing of Sports is found any more: page, articles, events, recruitment');
select is(jsonb_array_length(public.public_featured_associations()), 1, 'Finance stays "à l''honneur"');

-- =============================================================================
-- 10. Interests: chosen, private, transparent (§62–65)
-- =============================================================================

reset role;
set local role authenticated;
select pg_temp.as_user('nina', 'aal1');
select is(public.set_my_interests(array['pro', 'sport']), 2, 'Nina picks two interests');
select throws_ok($$ select public.set_my_interests(array['astrologie']) $$, 'P0001', 'interest_invalid', 'only categories that exist');
select throws_ok($$ select public.set_my_interests(array['sport', 'culture', 'arts', 'pro', 'entrepreneuriat', 'solidarite', 'international', 'media', 'autre']) $$,
  'P0001', 'interests_limit', 'eight at most');
select ok((public.my_campus_suggestions() -> 'events' -> 0 -> 'because') is not null, 'each suggestion says which interest it comes from');
select ok((select bool_and((e ->> 'ends_at')::timestamptz > now() and e ->> 'status' = 'scheduled')
             from jsonb_array_elements(public.my_campus_suggestions() -> 'events') e), 'only events to come, not cancelled');
select pg_temp.as_user('marc');
select is((select count(*)::integer from public.student_interests), 0, 'nobody else reads her interests');
select is(jsonb_array_length(public.my_campus_suggestions() -> 'interests'), 0, 'Marc has none: no suggestion is made up');
select pg_temp.as_user('nina', 'aal1');
select is(public.set_my_interests(array[]::text[]), 0, 'she removes them all');
select is(jsonb_array_length(public.my_campus_suggestions() -> 'events'), 0, 'and nothing is suggested any more');

-- =============================================================================
-- 11. Related articles by real links (§46–48)
-- =============================================================================

reset role;
set local role anon;
select ok((select coalesce(bool_and(p -> 'organization' ->> 'slug' = 'exemple-finance' or p -> 'category' is not null), true)
             from jsonb_array_elements(public.public_related_posts('post', pg_temp.fid('p_rentree'))) p),
  'related articles share the association or the category, never only a word');
select ok(not exists (select 1 from jsonb_array_elements(public.public_related_posts('post', pg_temp.fid('p_rentree'))) p
                       where (p ->> 'id')::uuid = pg_temp.fid('p_rentree')), 'an article is not related to itself');
select is(public.public_related_posts('post', pg_temp.fid('p_draft')), '[]'::jsonb, 'a draft has no public relations');

select * from finish();
rollback;
