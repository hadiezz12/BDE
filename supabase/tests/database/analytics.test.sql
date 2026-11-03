-- Phase 13 · Analytics: who may read which figures (§106, §109, §81), whether
-- every figure means what it says (§107 events, §110 capacity, §112
-- articles, §111 recruitment funnel), small groups (§108), the daily counts
-- (§114: refresh twice, failure, reconciliation), exports and settings
-- (§115), straight against the database. Runs on top of supabase/seed.sql
-- (Julie presides Finance, Lucas writes and runs events for it; Emma
-- presides Sports; Alice and Marc lead the BDE; Garance is the guardian;
-- Hugo's Finance treasurer mandate ended; Nina is a student). Seventy-seven
-- fictional students are made here. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(152);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert, update on fx to anon, authenticated, service_role;

insert into fx (k, id) values
  ('bde', (select id from public.organizations where kind = 'bde')),
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('alice', 'a0000000-0000-4000-8000-000000000001'),
  ('marc', 'a0000000-0000-4000-8000-000000000002'),
  ('garance', 'a0000000-0000-4000-8000-000000000003'),
  ('julie', 'a0000000-0000-4000-8000-000000000004'),
  ('lucas', 'a0000000-0000-4000-8000-000000000005'),
  ('emma', 'a0000000-0000-4000-8000-000000000006'),
  ('nina', 'a0000000-0000-4000-8000-000000000007'),
  ('hugo', 'a0000000-0000-4000-8000-000000000008');
insert into fx (k, id) values
  ('c_sports', (select c.id from public.recruitment_campaigns c where c.organization_id = (select id from fx where k = 'sports')
                   and c.title = 'Recrutement 2027 (exemple)')),
  ('pos_events', (select ps.id from public.recruitment_positions ps join public.recruitment_campaigns c on c.id = ps.campaign_id
                   where c.organization_id = (select id from fx where k = 'sports') and c.title = 'Recrutement 2027 (exemple)'
                     and ps.title = 'Événements (exemple)'));

-- Seventy-seven fictional students (onboarded), for registrations and applications.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'analytique-' || lpad(n::text, 3, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 77) as n;
update public.profiles p set first_name = 'Analytique', last_name = 'Test', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'analytique-%@student.example.test';

create function pg_temp.student(p_n integer) returns uuid language sql stable as $f$
  select id from auth.users where email = 'analytique-' || lpad(p_n::text, 3, '0') || '@student.example.test'
$f$;
grant execute on function pg_temp.student(integer) to anon, authenticated, service_role;

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;

create function pg_temp.as_id(p_id uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end $f$;
grant execute on function pg_temp.as_id(uuid) to anon, authenticated, service_role;

create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;
grant execute on function pg_temp.fid(text) to anon, authenticated, service_role;

create function pg_temp.today() returns date language sql stable as $f$ select (now() at time zone 'Europe/Paris')::date $f$;
grant execute on function pg_temp.today() to anon, authenticated, service_role;

-- The analytics of an association over a window around today, as the current role.
create function pg_temp.oa(p_org text, p_back integer default 30, p_ahead integer default 60) returns jsonb language sql as $f$
  select public.organization_analytics(pg_temp.fid(p_org), pg_temp.today() - p_back, pg_temp.today() + p_ahead)
$f$;
grant execute on function pg_temp.oa(text, integer, integer) to anon, authenticated, service_role;

-- A period total ("posts.published:article") of an answer, 0 when absent.
create function pg_temp.t(p_answer jsonb, p_key text) returns integer language sql immutable as $f$
  select coalesce((p_answer -> 'totals' ->> p_key)::integer, 0)
$f$;
grant execute on function pg_temp.t(jsonb, text) to anon, authenticated, service_role;

-- One event of an association answer's list.
create function pg_temp.ev(p_answer jsonb, p_event uuid) returns jsonb language sql immutable as $f$
  select e from jsonb_array_elements(p_answer -> 'sections' -> 'events' -> 'list') e where (e ->> 'id')::uuid = p_event
$f$;
grant execute on function pg_temp.ev(jsonb, uuid) to anon, authenticated, service_role;

-- One campaign of an answer's recruitment section.
create function pg_temp.cp(p_answer jsonb, p_campaign uuid) returns jsonb language sql immutable as $f$
  select c from jsonb_array_elements(p_answer -> 'sections' -> 'recruitment' -> 'campaigns') c where (c ->> 'id')::uuid = p_campaign
$f$;
grant execute on function pg_temp.cp(jsonb, uuid) to anon, authenticated, service_role;

-- The daily counts brought up to date, as the hourly job would.
create function pg_temp.refresh() returns void language sql security definer as $f$
  select private.refresh_analytics(pg_temp.today() - 40, pg_temp.today()) $f$;
grant execute on function pg_temp.refresh() to anon, authenticated, service_role;

select pg_temp.refresh();

-- =============================================================================
-- 1. Who may read what (§106, §109)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select ok((pg_temp.oa('finance') -> 'rights' ->> 'recruitment')::boolean and (pg_temp.oa('finance') -> 'rights' ->> 'export')::boolean,
  'the Finance president reads every Finance section, export included');
select ok(pg_temp.oa('finance') -> 'sections' ? 'recruitment' and pg_temp.oa('finance') -> 'sections' ? 'team',
  'and receives them');
select throws_ok($$ select pg_temp.oa('sports') $$, 'P0001', 'insufficient_permission',
  'the Finance president is refused Sports analytics');
select throws_ok($$ select public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) $$, 'P0001', 'insufficient_permission',
  'and the platform analytics');

select pg_temp.as_user('emma');
select ok(pg_temp.oa('sports') -> 'sections' ? 'recruitment', 'the Sports president reads Sports analytics');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission', 'never Finance''s');

select pg_temp.as_user('lucas', 'aal1');
select ok(pg_temp.oa('finance') -> 'sections' ? 'content' and pg_temp.oa('finance') -> 'sections' ? 'events',
  'Finance communication and events read the articles and events sections');
select ok(not (pg_temp.oa('finance') -> 'sections' ? 'recruitment') and not (pg_temp.oa('finance') -> 'sections' ? 'workflow'),
  'but no recruitment figure (§9: communication is not recruitment)');
select ok(not exists (select 1 from jsonb_object_keys(pg_temp.oa('finance') -> 'totals') k where k like 'applications.%'),
  'not even in the period totals');
select is((pg_temp.oa('finance') -> 'rights' ->> 'export')::boolean, false, 'and no export');

select pg_temp.as_user('nina', 'aal1');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission', 'an ordinary student is refused');
select throws_ok($$ select public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) $$, 'P0001', 'insufficient_permission',
  'and the platform');

select pg_temp.as_user('hugo');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission',
  'the treasurer whose mandate ended is refused (same session, any token)');

select pg_temp.as_user('garance');
select is((select array_agg(k order by k) from jsonb_object_keys(public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections') k),
  array['governance'], 'the guardian receives the continuity section only (§55)');
select is((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'rights' ->> 'view')::boolean, false,
  'no platform activity figure, and no recruitment');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission', 'nor an association''s');

select pg_temp.as_user('alice');
select ok((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'rights' ->> 'view')::boolean,
  'the BDE president reads the platform totals');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission',
  'but not Finance''s own analytics (platform oversight is not access to an association)');
select ok(pg_temp.oa('bde') -> 'sections' ? 'events', 'the BDE reads its own association analytics');

reset role;
set local role anon;
select throws_ok($$ select public.organization_analytics(pg_temp.fid('finance'), pg_temp.today() - 30, pg_temp.today()) $$,
  '42501', null, 'a visitor cannot call the association analytics');
select throws_ok($$ select public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) $$, '42501', null,
  'nor the platform analytics');

reset role;
select ok(not has_schema_privilege('authenticated', 'private', 'usage') or not has_table_privilege('authenticated', 'private.analytics_daily', 'select'),
  'the daily counts table is not readable from the API');
select ok(not has_function_privilege('authenticated', 'private.refresh_analytics(date, date)', 'execute')
          and not has_function_privilege('authenticated', 'private.analytics_source_counts(date, date)', 'execute')
          and not has_function_privilege('authenticated', 'private.analytics_campaign_funnel(uuid, integer)', 'execute')
          and not has_function_privilege('anon', 'private.analytics_suppress(jsonb, integer, boolean)', 'execute'),
  'nor any helper behind the analytics');
select ok(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.proname in ('organization_analytics', 'platform_analytics',
                         'analytics_campaign_funnel', 'analytics_campaign_workflow', 'analytics_source_counts')
       and p.prosrc ~* '(\.answers|candidate_snapshot|application_documents|\.note\b|\.scores|rationale|response_note|access_details|\.email|first_name|last_name)'),
  'the analytics never read answers, CVs, notes, scores, rationales, private details or names');

-- Malformed periods.
set local role authenticated;
select pg_temp.as_user('julie');
select throws_ok($$ select public.organization_analytics(pg_temp.fid('finance'), pg_temp.today(), pg_temp.today() - 1) $$,
  'P0001', 'analytics_period_invalid', 'a period that ends before it starts is refused');
select throws_ok($$ select public.organization_analytics(pg_temp.fid('finance'), pg_temp.today() - 800, pg_temp.today()) $$,
  'P0001', 'analytics_period_invalid', 'two years at most');
select throws_ok($$ select public.organization_analytics(pg_temp.fid('finance'), null, pg_temp.today()) $$,
  'P0001', 'analytics_period_invalid', 'no open-ended period');
select throws_ok($$ select public.organization_analytics(pg_temp.fid('finance'), pg_temp.today() - 30, pg_temp.today(), pg_temp.today(), null) $$,
  'P0001', 'analytics_period_invalid', 'nor a half comparison period');
select throws_ok($$ select public.organization_analytics(gen_random_uuid(), pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'organization_not_found', 'an unknown association');

-- =============================================================================
-- 2. Events: registrations are not attendance (§107, §110)
-- =============================================================================

insert into fx (k, v) values ('before', pg_temp.oa('finance', 0, 60)::text);

select lives_ok($$ insert into fx (k, id) values ('e_gala', public.create_event(pg_temp.fid('finance'), 'Gala analytique (test)')) $$,
  'Finance creates a capped event');
select lives_ok($$ select public.save_event(pg_temp.fid('e_gala'), 1, jsonb_build_object(
    'summary', 'Événement fictif.', 'location_type', 'campus', 'venue_name', 'Salle fictive (test)',
    'starts_at', date_trunc('hour', now()) + interval '10 days', 'ends_at', date_trunc('hour', now()) + interval '10 days 3 hours',
    'registration_mode', 'internal', 'capacity', 50, 'waitlist_enabled', true)) $$, '50 places and a waiting list');
select lives_ok($$ select public.publish_event(pg_temp.fid('e_gala')) $$, 'published');
select lives_ok($$ insert into fx (k, id) values ('e_open', public.create_event(pg_temp.fid('finance'), 'Afterwork sans limite (test)')) $$,
  'and an event without a limit');
select lives_ok($$ select public.save_event(pg_temp.fid('e_open'), 1, jsonb_build_object(
    'summary', 'Événement fictif.', 'location_type', 'campus', 'venue_name', 'Salle fictive (test)',
    'starts_at', date_trunc('hour', now()) + interval '11 days', 'ends_at', date_trunc('hour', now()) + interval '11 days 2 hours',
    'registration_mode', 'internal')) $$, 'no capacity');
select lives_ok($$ select public.publish_event(pg_temp.fid('e_open')) $$, 'published');
select lives_ok($$ insert into fx (k, id) values ('e_off', public.create_event(pg_temp.fid('finance'), 'Soirée annulée analytique (test)')) $$,
  'and one that will be cancelled');
select lives_ok($$ select public.save_event(pg_temp.fid('e_off'), 1, jsonb_build_object(
    'summary', 'Événement fictif.', 'location_type', 'campus', 'venue_name', 'Salle fictive (test)',
    'starts_at', date_trunc('hour', now()) + interval '12 days', 'ends_at', date_trunc('hour', now()) + interval '12 days 2 hours',
    'registration_mode', 'internal', 'capacity', 20)) $$, 'twenty places');
select lives_ok($$ select public.publish_event(pg_temp.fid('e_off')) $$, 'published');

reset role;
-- 58 register (50 seats, 8 wait), 8 seated people cancel (the 8 waiting move up), 7 more join the list.
do $$
begin
  for i in 1 .. 58 loop
    perform pg_temp.as_id(pg_temp.student(i));
    perform public.register_for_event(pg_temp.fid('e_gala'));
  end loop;
  for i in 1 .. 8 loop
    perform pg_temp.as_id(pg_temp.student(i));
    perform public.cancel_my_registration(pg_temp.fid('e_gala'));
  end loop;
  for i in 59 .. 65 loop
    perform pg_temp.as_id(pg_temp.student(i));
    perform public.register_for_event(pg_temp.fid('e_gala'));
  end loop;
  for i in 66 .. 68 loop
    perform pg_temp.as_id(pg_temp.student(i));
    perform public.register_for_event(pg_temp.fid('e_open'));
  end loop;
  for i in 69 .. 70 loop
    perform pg_temp.as_id(pg_temp.student(i));
    perform public.register_for_event(pg_temp.fid('e_off'));
  end loop;
end $$;
select is((select count(*)::integer from public.event_registrations where event_id = pg_temp.fid('e_gala') and status = 'confirmed'), 50,
  'source: 50 confirmed seats');
select is((select count(*)::integer from public.event_registrations where event_id = pg_temp.fid('e_gala') and status = 'waitlisted'), 7,
  'source: 7 waiting');
select is((select count(*)::integer from public.event_registrations where event_id = pg_temp.fid('e_gala') and status = 'cancelled'), 8,
  'source: 8 cancelled');

set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.cancel_event(pg_temp.fid('e_off'), 'Annulation analytique (test).') $$, 'the third event is cancelled');
reset role;
select pg_temp.refresh();
set local role authenticated;
select pg_temp.as_user('julie');
insert into fx (k, v) values ('after', pg_temp.oa('finance', 0, 60)::text);

select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'confirmed')::integer, 50,
  'confirmed registrations: 50 (the cancelled ones are not counted)');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'waitlisted')::integer, 7,
  'the waiting list stays its own figure: 7');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'cancelled')::integer, 8,
  'cancellations: 8');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'created')::integer, 65,
  'registrations ever made: 65');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'promoted')::integer, 8,
  'moved up from the waiting list: 8');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_gala')) ->> 'utilization')::numeric, 1.000,
  'capacity used: 50 / 50');
select is(pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_open')) -> 'utilization', 'null'::jsonb,
  'an event without a limit has no capacity figure (never a fake percentage)');
select is((pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_open')) ->> 'confirmed')::integer, 3,
  'its 3 confirmed registrations');
select is(pg_temp.ev((select v::jsonb from fx where k = 'after'), pg_temp.fid('e_off')) ->> 'state', 'cancelled',
  'the cancelled event says cancelled');
select ok(not ((select v::jsonb from fx where k = 'after')::text ~* 'attend|présen|check'),
  'no attendance figure anywhere: the platform has no check-in');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'registrations.created:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'registrations.created:'), 70,
  'the period counts 70 registrations made today (gross creations)');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'registrations.cancelled:self')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'registrations.cancelled:self'), 8,
  '8 cancelled by the students themselves');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'registrations.promoted:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'registrations.promoted:'), 8,
  '8 promotions');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'registrations.waitlisted:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'registrations.waitlisted:'), 15,
  '15 entries on a waiting list (8 promoted since, 7 still waiting)');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'events.published:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'events.published:'), 3,
  '3 events published');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'events.cancelled:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'events.cancelled:'), 1,
  '1 cancelled');
select is(pg_temp.t((select v::jsonb from fx where k = 'after'), 'events.held:')
          - pg_temp.t((select v::jsonb from fx where k = 'before'), 'events.held:'), 0,
  'none held yet: an event is counted held only once over, never cancelled');
select is(((select v::jsonb from fx where k = 'after') -> 'sections' -> 'overview' -> 'insights' ->> 'events_near_capacity')::integer
          - ((select v::jsonb from fx where k = 'before') -> 'sections' -> 'overview' -> 'insights' ->> 'events_near_capacity')::integer, 1,
  'the overview notes one more event nearly full');

-- Events cannot leak who registered.
select ok(not ((select v::jsonb from fx where k = 'after')::text ~ 'Analytique|@student'),
  'no name and no address of any student in the answer');

-- =============================================================================
-- 3. Articles: one post however many revisions (§112, §28)
-- =============================================================================

insert into fx (k, v) values ('c0', pg_temp.oa('finance', 0, 0)::text);
select pg_temp.as_user('lucas');
select lives_ok($$ insert into fx (k, id) values ('p_new', public.create_post(pg_temp.fid('finance'), 'article', 'Bilan analytique (test)')) $$,
  'Lucas starts an article');
select lives_ok($$ insert into fx (k, v) values ('rev1', public.save_post_revision(pg_temp.fid('p_new'),
       (select working_revision_id from public.posts where id = pg_temp.fid('p_new')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Bilan analytique (test)', 'intro', 'Première version.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Un."}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) ->> 'revision_id') $$, 'version 1 saved');
reset role;
select pg_temp.refresh();
set local role authenticated;
select pg_temp.as_user('julie');
select is((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' ->> 'drafts')::integer,
          ((select v::jsonb from fx where k = 'c0') -> 'sections' -> 'content' ->> 'drafts')::integer + 1, 'a draft is a draft');
select is(pg_temp.t(pg_temp.oa('finance', 0, 0), 'posts.published:article'), pg_temp.t((select v::jsonb from fx where k = 'c0'), 'posts.published:article'),
  'a draft is not a publication');

select pg_temp.as_user('lucas');
select lives_ok($$ select public.submit_post_revision(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev1')) $$, 'submitted');
select pg_temp.as_user('julie');
select lives_ok($$ select public.review_post_revision(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev1'), 'approve', null) $$, 'approved');
select lives_ok($$ select public.publish_post(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev1')) $$, 'version 1 published');
reset role;
select pg_temp.refresh();
set local role authenticated;
select pg_temp.as_user('julie');
select is(pg_temp.t(pg_temp.oa('finance', 0, 0), 'posts.published:article'), pg_temp.t((select v::jsonb from fx where k = 'c0'), 'posts.published:article') + 1,
  'publishing V1 counts one article');
select is((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' ->> 'online')::integer,
          ((select v::jsonb from fx where k = 'c0') -> 'sections' -> 'content' ->> 'online')::integer + 1, 'one more online');

select pg_temp.as_user('lucas');
select lives_ok($$ insert into fx (k, v) values ('rev2', public.save_post_revision(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev1'), 0,
       jsonb_build_object('kind', 'article', 'title', 'Bilan analytique (test, v2)', 'intro', 'Seconde version.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Deux."}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) ->> 'revision_id') $$, 'version 2 drafted');
select lives_ok($$ select public.submit_post_revision(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev2')) $$, 'submitted');
select pg_temp.as_user('julie');
select lives_ok($$ select public.review_post_revision(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev2'), 'approve', null) $$, 'approved');
select lives_ok($$ select public.publish_post(pg_temp.fid('p_new'), (select v::uuid from fx where k = 'rev2')) $$, 'version 2 published');
reset role;
select pg_temp.refresh();
set local role authenticated;
select pg_temp.as_user('julie');
select is(pg_temp.t(pg_temp.oa('finance', 0, 0), 'posts.published:article'), pg_temp.t((select v::jsonb from fx where k = 'c0'), 'posts.published:article') + 1,
  'V2 is not a second article (revisions are never counted as posts)');
select is((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' -> 'reviews' ->> 'approved')::integer,
          ((select v::jsonb from fx where k = 'c0') -> 'sections' -> 'content' -> 'reviews' ->> 'approved')::integer + 2,
  'two approvals in the period (one per version reviewed)');
select ok((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' -> 'reviews' ->> 'median_hours') is not null,
  'a median approval time exists once approvals do');
select lives_ok($$ select public.unpublish_post(pg_temp.fid('p_new'), 'Retrait analytique (test).') $$, 'the article is taken offline');
reset role;
select pg_temp.refresh();
set local role authenticated;
select pg_temp.as_user('julie');
select is((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' ->> 'online')::integer,
          ((select v::jsonb from fx where k = 'c0') -> 'sections' -> 'content' ->> 'online')::integer, 'online now: back to what it was');
select is((pg_temp.oa('finance', 0, 0) -> 'sections' -> 'content' ->> 'offline')::integer,
          ((select v::jsonb from fx where k = 'c0') -> 'sections' -> 'content' ->> 'offline')::integer + 1, 'offline now: one more');
select is(pg_temp.t(pg_temp.oa('finance', 0, 0), 'posts.published:article'), pg_temp.t((select v::jsonb from fx where k = 'c0'), 'posts.published:article') + 1,
  'the first publication stays in the history (event-time: it did happen)');
select ok(not (pg_temp.oa('finance', 0, 0)::text ~* '"views"|"readers"|"likes"|"shares"'),
  'no views, readers, likes or shares: nothing like that is measured');

-- =============================================================================
-- 4. Recruitment: the funnel, applications vs candidates, small groups (§111, §108, §40)
-- =============================================================================

reset role;
-- Six students apply to Sports · Événements; a seventh starts and stops.
do $$
declare
  v_app jsonb;
  v_version integer;
begin
  for i in 71 .. 76 loop
    perform pg_temp.as_id(pg_temp.student(i));
    v_app := public.start_application(pg_temp.fid('pos_events'));
    v_version := (public.save_application_answers((v_app ->> 'application_id')::uuid, 1,
      '{"motivation": "Candidature fictive analytique.", "sport": "basket"}'::jsonb) ->> 'version')::integer;
    perform public.submit_application((v_app ->> 'application_id')::uuid, v_version, true);
  end loop;
  perform pg_temp.as_id(pg_temp.student(77));
  perform public.start_application(pg_temp.fid('pos_events'));
end $$;
select is((select count(*)::integer from public.applications where campaign_id = pg_temp.fid('c_sports') and submitted_at is not null), 8,
  'source: 8 applications sent to Sports (Nina, Léa who withdrew, six fictional students)');

set local role authenticated;
select pg_temp.as_user('emma');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'submitted')::integer, 8, 'sent: 8');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'withdrawn')::integer, 1, 'withdrawn after sending: 1');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'started')::integer, 9, 'started (drafts included): 9');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'candidates')::integer, 8, 'distinct candidates: 8');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'small_group')::boolean, false, 'a group of 8: stages shown');
select ok(not (pg_temp.oa('sports')::text ~ 'Candidature fictive|basket|Analytique|Nina|Léa'),
  'no answer, no name in the recruitment figures');

-- The pipeline beyond sending, as the review functions would leave it (fixture rows, counted as they are).
reset role;
insert into public.recruitment_reviews (application_id, campaign_id, reviewer_id, kind, status, submitted_at)
select a.id, a.campaign_id, pg_temp.fid('emma'), 'application', 'submitted', now()
  from public.applications a where a.campaign_id = pg_temp.fid('c_sports') and a.status = 'submitted'
 order by a.submitted_at limit 5;
update public.application_pipeline pl set stage = 'shortlisted', stage_changed_at = now()
  from public.applications a
 where a.id = pl.application_id and a.campaign_id = pg_temp.fid('c_sports') and a.status = 'submitted'
   and a.candidate_id in (select pg_temp.student(n) from generate_series(71, 74) n);
with s as (
  insert into public.recruitment_interview_slots (campaign_id, starts_at, ends_at, mode)
  select pg_temp.fid('c_sports'), now() + make_interval(days => 2, hours => n), now() + make_interval(days => 2, hours => n, mins => 30), 'online'
    from generate_series(1, 3) n
  returning id
), slots as (select id, row_number() over (order by id) as rn from s),
apps as (
  select a.id, a.campaign_id, row_number() over (order by a.id) as rn from public.applications a
   where a.campaign_id = pg_temp.fid('c_sports') and a.candidate_id in (pg_temp.student(71), pg_temp.student(72), pg_temp.student(73))
)
insert into public.recruitment_interviews (application_id, campaign_id, status, slot_id, scheduled_at)
select apps.id, apps.campaign_id, 'scheduled', slots.id, now() from apps join slots using (rn);
insert into public.recruitment_decisions (application_id, campaign_id, position_id, outcome, status, finalized_at, released_at)
select a.id, a.campaign_id, a.position_id,
       case when a.candidate_id in (pg_temp.student(71), pg_temp.student(72), pg_temp.student(73)) then 'offer' else 'reject' end,
       'released', now(), now()
  from public.applications a
 where a.campaign_id = pg_temp.fid('c_sports') and a.candidate_id in (select pg_temp.student(n) from generate_series(71, 75) n);
insert into public.recruitment_offers (decision_id, application_id, campaign_id, candidate_id, status, responded_at)
select d.id, d.application_id, d.campaign_id, a.candidate_id,
       case when a.candidate_id = pg_temp.student(73) then 'declined' else 'accepted' end, now()
  from public.recruitment_decisions d join public.applications a on a.id = d.application_id
 where d.campaign_id = pg_temp.fid('c_sports') and d.outcome = 'offer';
select pg_temp.refresh();

set local role authenticated;
select pg_temp.as_user('emma');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'reviewed')::integer, 5, 'reviewed (one review at least): 5');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'shortlisted')::integer, 4, 'shortlisted: 4');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'interviewed')::integer, 3, 'interviewed: 3');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'outcomes' ->> 'total')::integer, 5,
  'decisions released: 5 in all');
select is(pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'outcomes' -> 'cells' -> 'offer', 'null'::jsonb,
  'offers (3, under 5): hidden');
select is(pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'outcomes' -> 'cells' -> 'reject', 'null'::jsonb,
  'refusals (2, under 5): hidden');
select is(pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'offers' ->> 'reason', 'small_group',
  'offer answers (3 in all): the whole breakdown hidden, total included');
select is(pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'offers' -> 'total', 'null'::jsonb,
  'so no answer can be told by subtraction');
select ok(not (pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'offers')::text ~ '[1-9]',
  'not a single non-zero number left in it');

-- The workflow: work items, never per reviewer.
select is((select (c ->> 'interviews_scheduled')::integer from jsonb_array_elements(pg_temp.oa('sports') -> 'sections' -> 'workflow' -> 'campaigns') c
             where (c ->> 'id')::uuid = pg_temp.fid('c_sports')), 3,
  'the workflow counts 3 interviews scheduled');
select ok(not (pg_temp.oa('sports') -> 'sections' -> 'workflow')::text ~ 'reviewer|a0000000|Emma',
  'and names no reviewer');

-- A tiny group: the same campaign seen with k raised above it.
reset role;
update private.analytics_settings set min_group_size = 10;
set local role authenticated;
select pg_temp.as_user('emma');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'small_group')::boolean, true,
  'under k sent applications, the campaign is a small group');
select ok(pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'reviewed' = 'null'::jsonb
          and pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) -> 'outcomes' = 'null'::jsonb,
  'its stages and outcomes are not shown at all');
select is((pg_temp.cp(pg_temp.oa('sports'), pg_temp.fid('c_sports')) ->> 'submitted')::integer, 8, 'only how many applied');
reset role;
update private.analytics_settings set min_group_size = 5;

-- The platform sees totals only, suppressed.
set local role authenticated;
select pg_temp.as_user('alice');
select ok(not (public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' -> 'recruitment')::text ~ 'Événements \(exemple\)|Recrutement 2027|"title"|campaign_id',
  'no position or campaign breakdown at platform level');
select is((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' -> 'recruitment' -> 'by_association' -> 'cells' ->> 'Sports (exemple)')::integer,
  8, 'applications per association, when the group is large enough (8)');
select is(public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' -> 'recruitment' -> 'offers' ->> 'reason', 'small_group',
  'campus-wide offer answers (3): hidden');
select ok(not (public.platform_analytics(pg_temp.today() - 30, pg_temp.today())::text ~ 'candidates'),
  'no campus-wide distinct-candidate count');
select ok((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'totals' ->> 'applications.submitted:')::integer >= 5,
  'campus-wide applications sent: shown once at least k');
-- A narrow window: a day with a single application sent (as the daily counts would hold it) is not shown.
reset role;
insert into private.analytics_daily (day, organization_id, metric, dimension, value)
values (pg_temp.today() - 20, pg_temp.fid('sports'), 'applications.submitted', '', 1)
on conflict on constraint analytics_daily_key do update set value = 1;
set local role authenticated;
select pg_temp.as_user('alice');
select ok(not (public.platform_analytics(pg_temp.today() - 20, pg_temp.today() - 20) -> 'totals' ? 'applications.submitted:'),
  'a one-day window holding a single application shows no total');
select ok((public.platform_analytics(pg_temp.today() - 20, pg_temp.today() - 20) -> 'suppressed_totals') ? 'applications.submitted:',
  'it says the total is hidden, without the number');
select is((public.platform_analytics(pg_temp.today() - 20, pg_temp.today() - 20) -> 'sections' -> 'recruitment' -> 'submitted_by_month' -> 0 -> 1),
  'null'::jsonb, 'nor in the monthly series');

-- =============================================================================
-- 5. The daily counts: idempotent, failure-safe, reconciled (§114, §73)
-- =============================================================================

reset role;
-- (The day held by hand above goes back to what the sources say.)
select private.refresh_analytics(pg_temp.today() - 40, pg_temp.today());
insert into fx (k, v) values ('daily', (select md5(string_agg(concat_ws('|', day, organization_id, metric, dimension, value), ',' order by day, organization_id, metric, dimension))
                                           from private.analytics_daily));
select private.refresh_analytics(pg_temp.today() - 40, pg_temp.today());
select private.refresh_analytics(pg_temp.today() - 40, pg_temp.today());
insert into fx (k, v) values ('members', (select count(distinct m.user_id)::text from public.memberships m
                                            join public.organizations o on o.id = m.organization_id
                                           where m.status = 'active' and o.status = 'active'));
select is((select md5(string_agg(concat_ws('|', day, organization_id, metric, dimension, value), ',' order by day, organization_id, metric, dimension))
             from private.analytics_daily), (select v from fx where k = 'daily'),
  'running the refresh twice more changes nothing (recomputed, never added)');
select throws_ok($$ select private.refresh_analytics(pg_temp.today(), pg_temp.today() - 1) $$, 'P0001', 'analytics_period_invalid',
  'a failing refresh raises');
select is((select md5(string_agg(concat_ws('|', day, organization_id, metric, dimension, value), ',' order by day, organization_id, metric, dimension))
             from private.analytics_daily), (select v from fx where k = 'daily'),
  'and leaves the counts as they were');
select is((select count(*)::integer from public.event_registrations where event_id = pg_temp.fid('e_gala')), 65,
  'the source records are never touched by the analytics');
select is((private.reconcile_analytics(pg_temp.today() - 40, pg_temp.today()) ->> 'differences')::integer, 0,
  'stored counts match the sources');
update private.analytics_daily set value = value + 1
 where day = pg_temp.today() and organization_id = pg_temp.fid('finance') and metric = 'registrations.created';
select is((private.reconcile_analytics(pg_temp.today() - 40, pg_temp.today()) ->> 'differences')::integer, 1,
  'a wrong stored count is found');
select ok((private.reconcile_analytics(pg_temp.today() - 40, pg_temp.today()) -> 'days') ? pg_temp.today()::text,
  'with its day');
select private.refresh_analytics(pg_temp.today() - 1, pg_temp.today());
select is((private.reconcile_analytics(pg_temp.today() - 40, pg_temp.today()) ->> 'differences')::integer, 0,
  'recomputing the day corrects it');
select ok((private.run_analytics_refresh() -> 'refreshed' ->> 'written')::integer > 0, 'the job refreshes and reconciles');
select is((select count(*)::integer from public.scheduled_jobs where job_key = 'analytics-refresh' and area = 'reports'), 1,
  'the refresh is a job of the Phase 11 dispatcher');
select ok(private.execute_job('analytics-refresh') ? 'reconciled', 'run through the dispatcher''s fixed list');

-- Late corrections: a registration cancelled after the fact counts on the day it was cancelled.
select is((select count(*)::integer from private.analytics_daily where day = pg_temp.today() and metric = 'registrations.created'
                                                              and organization_id = pg_temp.fid('finance')),
          1, 'one row per day, metric and association');

-- =============================================================================
-- 6. Exports, settings, recompute (§115, §46)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'csv', array['events', 'content'],
                                                       pg_temp.today() - 30, pg_temp.today()) $$,
  'the Finance president exports');
reset role;
select is((select details ->> 'kind' from public.governance_audit_events where action = 'analytics_exported'
            order by occurred_at desc, id desc limit 1), 'csv', 'the export is in the history (scope, sections, period; no figure)');
select ok(not exists (select 1 from public.governance_audit_events where action = 'analytics_exported' and details ? 'totals'),
  'the history keeps no figure');
set local role authenticated;
select pg_temp.as_user('lucas', 'aal1');
select throws_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'csv', array['events'],
                                                        pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'insufficient_permission', 'without analytics.export, no export');
select pg_temp.as_user('emma');
select throws_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'report', array['overview'],
                                                        pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'insufficient_permission', 'another association cannot export Finance''s');
select pg_temp.as_user('julie');
select throws_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'csv', array['applications'],
                                                        pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'analytics_export_invalid', 'only the sections of the catalog');
select throws_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'xlsx', array['events'],
                                                        pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'analytics_export_invalid', 'only CSV or the printed report');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.log_analytics_export('platform', null, 'csv', array['events'], pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'mfa_required', 'a platform export needs the second factor');
select pg_temp.as_user('alice');
select lives_ok($$ select public.log_analytics_export('platform', null, 'csv', array['events'], pg_temp.today() - 30, pg_temp.today()) $$,
  'with it, the BDE exports platform totals');
select pg_temp.as_user('garance');
select throws_ok($$ select public.log_analytics_export('platform', null, 'csv', array['governance'], pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'insufficient_permission', 'the guardian does not');

select pg_temp.as_user('julie');
select throws_ok($$ select public.set_analytics_min_group_size(3) $$, 'P0001', 'insufficient_permission',
  'an association cannot change the privacy threshold');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.set_analytics_min_group_size(7) $$, 'P0001', 'mfa_required', 'the BDE needs the second factor');
select pg_temp.as_user('alice');
select throws_ok($$ select public.set_analytics_min_group_size(2) $$, 'P0001', 'analytics_threshold_invalid', 'never under 3');
select lives_ok($$ select public.set_analytics_min_group_size(7) $$, 'the BDE sets it to 7');
select is((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) ->> 'min_group_size')::integer, 7, 'answers follow it');
select lives_ok($$ select public.set_analytics_min_group_size(5) $$, 'and back to 5');
reset role;
select is((select count(*)::integer from public.governance_audit_events where action = 'analytics_settings_changed'), 2,
  'each change is audited');
set local role authenticated;
select pg_temp.as_user('alice');
select ok((public.recompute_analytics(pg_temp.today() - 3, pg_temp.today()) ->> 'written')::integer >= 0, 'the BDE recomputes a period');
select throws_ok($$ select public.recompute_analytics(pg_temp.today() - 500, pg_temp.today()) $$, 'P0001', 'analytics_period_invalid',
  'within 400 days');
select pg_temp.as_user('emma');
select throws_ok($$ select public.recompute_analytics(pg_temp.today() - 3, pg_temp.today()) $$, 'P0001', 'insufficient_permission',
  'an association cannot');

-- =============================================================================
-- 7. Comparisons, freshness, the platform's other sections (§20–23, §51, §54)
-- =============================================================================

select pg_temp.as_user('julie');
select ok(public.organization_analytics(pg_temp.fid('finance'), pg_temp.today() - 6, pg_temp.today(),
                                        pg_temp.today() - 13, pg_temp.today() - 7) -> 'compare' is not null,
  'a comparison period returns its own totals');
select ok((pg_temp.oa('finance') -> 'freshness') ? 'data_through' and (pg_temp.oa('finance') -> 'freshness') ? 'stale',
  'every answer says when its counts were last brought up to date');
select pg_temp.as_user('alice');
select ok(public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' ? 'governance',
  'the BDE reads governance continuity');
select ok(public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' ? 'messages',
  'and message delivery health');
select ok(not (public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' -> 'messages')::text ~ '@|recipient|subject|payload',
  'delivery health names no recipient and shows no content');
select ok(not (public.platform_analytics(pg_temp.today() - 30, pg_temp.today())::text ~* 'open_rate|opened|clicked'),
  'no open or click rate: none is measured');
select is((public.platform_analytics(pg_temp.today() - 30, pg_temp.today()) -> 'sections' -> 'associations' ->> 'members_distinct')::integer,
  (select v::integer from fx where k = 'members'),
  'distinct members are people, not membership records');

-- =============================================================================
-- 8. A mandate that ends closes the analytics at once (§81, §113)
-- =============================================================================

reset role;
update public.position_assignments set ends_at = now() - interval '1 second'
 where user_id = pg_temp.fid('julie') and office = 'association_president' and status = 'active';
set local role authenticated;
select pg_temp.as_user('julie');
select throws_ok($$ select pg_temp.oa('finance') $$, 'P0001', 'insufficient_permission',
  'Julie''s mandate over: Finance analytics refused in the same session');
select throws_ok($$ select public.log_analytics_export('organization', pg_temp.fid('finance'), 'csv', array['events'],
                                                        pg_temp.today() - 30, pg_temp.today()) $$,
  'P0001', 'insufficient_permission', 'and its export');

select * from finish();
rollback;
