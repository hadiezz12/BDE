-- Phase 8 · Recruitment: the security matrix of the brief (§109), the form
-- version test (§112), deadlines (§113), cross-association privacy (§114),
-- documents and moderation, straight against the database. Runs on top of
-- supabase/seed.sql (Phase 8 block):
--   Julie presides Finance ("Recrutement 2027 (exemple)", open, CV required,
--   max 2 positions; Tom's draft for Communication). Emma presides Sports
--   ("Recrutement 2027 (exemple)", open, CV optional, max 1; Nina submitted
--   to Événements, Léa withdrew from Réseaux sociaux; "Tournoi de printemps",
--   upcoming). Alice leads the BDE ("Équipe soirées 2026", closed, Hugo's
--   draft never sent; "Bénévoles gala", paused). Garance is the guardian.
-- Simultaneous submissions and starts are tested by
-- supabase/tests/concurrency/applications.sh. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(161);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert, update on fx to anon, authenticated, service_role;

insert into fx (k, id) values
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('bde', (select id from public.organizations where kind = 'bde')),
  ('alice', 'a0000000-0000-4000-8000-000000000001'),
  ('marc', 'a0000000-0000-4000-8000-000000000002'),
  ('garance', 'a0000000-0000-4000-8000-000000000003'),
  ('julie', 'a0000000-0000-4000-8000-000000000004'),
  ('lucas', 'a0000000-0000-4000-8000-000000000005'),
  ('emma', 'a0000000-0000-4000-8000-000000000006'),
  ('nina', 'a0000000-0000-4000-8000-000000000007'),
  ('hugo', 'a0000000-0000-4000-8000-000000000008'),
  ('lea', 'a0000000-0000-4000-8000-00000000000b'),
  ('tom', 'a0000000-0000-4000-8000-00000000000c');

insert into fx (k, id)
select x.k, (select c.id from public.recruitment_campaigns c
              join public.organizations o on o.id = c.organization_id
             where c.title = x.title and o.slug = x.org)
  from (values ('fin', 'Recrutement 2027 (exemple)', 'exemple-finance'),
               ('fin_draft', 'Pôle partenariats 2027 (exemple)', 'exemple-finance'),
               ('spo', 'Recrutement 2027 (exemple)', 'exemple-sports'),
               ('spring', 'Tournoi de printemps (exemple)', 'exemple-sports'),
               ('soirees', 'Équipe soirées 2026 (exemple)', 'very-pink-club'),
               ('gala', 'Bénévoles gala (exemple)', 'very-pink-club')) as x (k, title, org);

insert into fx (k, id)
select x.k, (select p.id from public.recruitment_positions p where p.title = x.title)
  from (values ('treso', 'Trésorerie (exemple)'), ('com', 'Communication (exemple)'), ('sponso', 'Sponsoring (exemple)'),
               ('events', 'Événements (exemple)'), ('social', 'Réseaux sociaux (exemple)'), ('tournois', 'Tournois (exemple)'),
               ('arbitrage', 'Arbitrage (exemple)'), ('benevole', 'Bénévole soirées (exemple)'), ('accueil', 'Accueil (exemple)'))
       as x (k, title);

insert into fx (k, id)
select 'app_' || x.who, a.id
  from (values ('tom', 'Communication (exemple)'), ('nina', 'Événements (exemple)'), ('lea', 'Réseaux sociaux (exemple)'),
               ('hugo', 'Bénévole soirées (exemple)')) as x (who, title)
  join public.recruitment_positions p on p.title = x.title
  join public.applications a on a.position_id = p.id
  join auth.users u on u.id = a.candidate_id and split_part(u.email, '@', 1) = case x.who when 'hugo' then 'hugo.finance' else x.who end;

-- Six more fictional students (onboarded), for the scenarios below.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('c0000000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'candidat' || n || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 6) as n;
update public.profiles set first_name = 'Candidat', last_name = 'Test ' || right(id::text, 1), onboarding_completed_at = now()
 where id::text like 'c0000000-0000-4000-8000-00000000000%' and id::text not like '%6';
insert into fx (k, id) select 'c' || n, ('c0000000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1, 6) as n;

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;

create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;
grant execute on function pg_temp.fid(text) to anon, authenticated, service_role;

create function pg_temp.app(p_key text) returns public.applications language sql stable security definer
  as $f$ select * from public.applications where id = (select id from fx where k = p_key) $f$;
grant execute on function pg_temp.app(text) to anon, authenticated, service_role;

create function pg_temp.campaign(p_key text) returns public.recruitment_campaigns language sql stable security definer
  as $f$ select * from public.recruitment_campaigns where id = (select id from fx where k = p_key) $f$;
grant execute on function pg_temp.campaign(text) to anon, authenticated, service_role;

-- Counts as the database sees them (team members read no application).
create function pg_temp.applications_of(p_key text, p_status text default null) returns integer language sql stable security definer
  as $f$ select count(*)::integer from public.applications
          where (position_id = (select id from fx where k = p_key) or campaign_id = (select id from fx where k = p_key))
            and (p_status is null or status = p_status) $f$;
grant execute on function pg_temp.applications_of(text, text) to anon, authenticated, service_role;

create function pg_temp.outbox(p_key text, p_kind text) returns integer language sql stable security definer
  as $f$ select count(*)::integer from public.notifications where application_id = (select id from fx where k = p_key) and kind = p_kind $f$;
grant execute on function pg_temp.outbox(text, text) to anon, authenticated, service_role;

-- Starts an application as the current user and remembers it.
create function pg_temp.start(p_key text, p_position text) returns uuid language plpgsql as $f$
declare v uuid;
begin
  v := (public.start_application((select id from fx where k = p_position)) ->> 'application_id')::uuid;
  insert into fx (k, id) values (p_key, v) on conflict (k) do update set id = excluded.id;
  return v;
end $f$;
grant execute on function pg_temp.start(text, text) to authenticated;

-- =============================================================================
-- 1. Visitors: published campaigns only, never a candidate
-- =============================================================================

set local role anon;
select is(
  (select array_agg(c ->> 'title' || ' · ' || (c -> 'organization' ->> 'slug') order by c ->> 'title' collate "C", c -> 'organization' ->> 'slug' collate "C")
     from jsonb_array_elements(public.public_recruitment_campaigns()) as c),
  array['Bénévoles gala (exemple) · very-pink-club', 'Recrutement 2027 (exemple) · exemple-finance',
        'Recrutement 2027 (exemple) · exemple-sports', 'Tournoi de printemps (exemple) · exemple-sports'],
  'the directory lists current published campaigns (no draft, no closed one)');
select is(jsonb_array_length(public.public_recruitment_campaigns(p_view => 'closed')), 1, 'the closed ones are listed apart');
select is(jsonb_array_length(public.public_recruitment_campaigns(p_view => 'open')), 2, 'filter: open');
select is(jsonb_array_length(public.public_recruitment_campaigns(p_view => 'upcoming')), 1, 'filter: opening later');
select is(jsonb_array_length(public.public_recruitment_campaigns(p_q => 'tresorerie')), 1, 'search finds a position title, accents folded');
select is(jsonb_array_length(public.public_recruitment_campaigns(p_q => 'partenariats')), 0, 'search never finds a draft');
select is(public.public_recruitment_campaign('recrutement-2027-exemple') ->> 'state', 'ok', 'a published campaign has its page');
select is(jsonb_array_length(public.public_recruitment_campaign('recrutement-2027-exemple') -> 'campaign' -> 'positions'), 3,
  'with its positions');
select is((select d ->> 'required' from jsonb_array_elements(
            (select p -> 'form' -> 'documents' from jsonb_array_elements(public.public_recruitment_campaign('recrutement-2027-exemple') -> 'campaign' -> 'positions') p
              where p ->> 'title' = 'Trésorerie (exemple)')) d), 'true',
  'the page says a CV is required, before anyone starts');
select is(public.public_recruitment_position('recrutement-2027-exemple', 'tresorerie-exemple') -> 'position' ->> 'title', 'Trésorerie (exemple)',
  'a position has its own page');
select ok(public.public_recruitment_campaigns(p_view => 'all')::text !~ '(Nina|Candidature fictive|Brouillon fictif|candidat)',
  'public reads never carry a candidate, an answer or a draft');
select ok(public.public_recruitment_campaign('recrutement-2027-exemple-2')::text !~ '(Nina|Candidature fictive|reference)',
  'nor does a campaign page');
select throws_ok($$ select count(*) from public.applications $$, '42501', null, 'visitors cannot read applications');
select throws_ok($$ select count(*) from public.recruitment_campaigns $$, '42501', null, 'nor the campaigns table');
select throws_ok($$ select public.start_application(pg_temp.fid('treso')) $$, '42501', null, 'nor start an application');
set local role authenticated;

-- =============================================================================
-- 2. Who configures a campaign (organization-scoped)
-- =============================================================================

select pg_temp.as_user('tom', 'aal1');
select throws_ok($$ select public.create_recruitment_campaign(pg_temp.fid('finance'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'an ordinary student creates no campaign');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.create_recruitment_campaign(pg_temp.fid('finance'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'an officer without a recruitment right creates none either');
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('new', public.create_recruitment_campaign(pg_temp.fid('finance'), 'Recrutement de test')) $$,
  'the Finance president creates a Finance campaign');
select is((select count(*)::integer from public.recruitment_form_versions where campaign_id = pg_temp.fid('new') and status = 'draft'), 1,
  'it starts with an empty draft form');
select throws_ok($$ select public.save_recruitment_campaign(pg_temp.fid('spo'), (pg_temp.campaign('spo')).version, '{"title": "Pirate"}'::jsonb) $$,
  'P0001', 'insufficient_permission', 'Finance cannot edit a Sports campaign');
select throws_ok($$ select public.add_recruitment_position(pg_temp.fid('spo'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'nor add a position to it');
select throws_ok($$ select public.save_recruitment_form(pg_temp.fid('spo'), 0, '{"sections": [{"id": "s1", "title": "x"}], "questions": []}'::jsonb) $$,
  'P0001', 'insufficient_permission', 'nor change its form');
select pg_temp.as_user('emma');
select throws_ok($$ select public.set_recruitment_status(pg_temp.fid('fin'), 'paused') $$,
  'P0001', 'insufficient_permission', 'and Sports cannot pause Finance');
select is((select count(*)::integer from public.recruitment_campaigns where organization_id = pg_temp.fid('finance')), 0,
  'Sports does not even read Finance''s campaigns');
select pg_temp.as_user('julie');
select throws_ok($$ select public.save_recruitment_campaign(pg_temp.fid('new'), 99, '{"title": "x"}'::jsonb) $$,
  'P0001', 'draft_conflict', 'an older version never overwrites a newer save');
select throws_ok($$ select public.save_recruitment_campaign(pg_temp.fid('new'), 1, '{"organization_id": "00000000-0000-0000-0000-000000000000"}'::jsonb) $$,
  'P0001', 'campaign_invalid', 'only whitelisted fields are written (the owner never changes)');
select throws_ok($$ select public.publish_recruitment_campaign(pg_temp.fid('new')) $$,
  'P0001', 'campaign_incomplete', 'publishing needs the essentials');
select pg_temp.as_user('julie', 'aal1');
select throws_ok($$ select public.publish_recruitment_campaign(pg_temp.fid('fin')) $$,
  'P0001', 'mfa_required', 'publishing needs the second factor');

-- An expired manager: a recruitment position given to Lucas, then ended.
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('pos_rec', public.create_position(pg_temp.fid('finance'), 'Recrutement (test)',
                    array['recruitment.campaigns.manage', 'recruitment.campaigns.publish'])) $$,
  'Julie creates a recruitment position');
select lives_ok($$ insert into fx (k, id) values ('asg_rec', public.assign_position(
                    (select id from public.memberships where organization_id = pg_temp.fid('finance') and user_id = pg_temp.fid('lucas')),
                    pg_temp.fid('pos_rec'), now() + interval '30 days')) $$,
  'and gives it to Lucas');
select pg_temp.as_user('lucas');
select lives_ok($$ insert into fx (k, id) values ('lucas_c', public.create_recruitment_campaign(pg_temp.fid('finance'), 'Campagne de Lucas')) $$,
  'Lucas manages Finance recruitment');
select pg_temp.as_user('julie');
select lives_ok($$ select public.end_assignment(pg_temp.fid('asg_rec'), 'Fin de mandat (test).') $$, 'his mandate ends');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.save_recruitment_campaign(pg_temp.fid('lucas_c'), 1, '{"title": "x"}'::jsonb) $$,
  'P0001', 'insufficient_permission', 'an expired manager edits nothing, in the same session');
select throws_ok($$ select public.publish_recruitment_campaign(pg_temp.fid('fin')) $$,
  'P0001', 'insufficient_permission', 'nor publishes');

-- =============================================================================
-- 3. Starting an application
-- =============================================================================

select pg_temp.as_user('c1', 'aal1');
select is((public.start_application(pg_temp.fid('treso')) ->> 'already'), 'false', 'a student starts an eligible application');
select is((public.start_application(pg_temp.fid('treso')) ->> 'already'), 'true', 'clicking again finds the same draft');
select is((select count(*)::integer from public.applications where candidate_id = pg_temp.fid('c1')), 1, 'never two drafts');
select throws_ok($$ select public.start_application(pg_temp.fid('arbitrage')) $$, 'P0001', 'campaign_not_open',
  'not before the opening');
select throws_ok($$ select public.start_application(pg_temp.fid('accueil')) $$, 'P0001', 'campaign_paused', 'not while paused');
select throws_ok($$ select public.start_application(pg_temp.fid('benevole')) $$, 'P0001', 'campaign_closed', 'not after closing');
select throws_ok($$ select public.start_application(pg_temp.fid('sponso')) $$, 'P0001', 'not_eligible',
  'not when the (self-declared) study year is not allowed');
select lives_ok($$ select pg_temp.start('c1_com', 'com') $$, 'a second position, within the limit of two');
reset role;
update public.profiles set study_year = 3 where id = pg_temp.fid('c1');
set local role authenticated;
select pg_temp.as_user('c1', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('sponso')) $$, 'P0001', 'application_limit',
  'a third one exceeds the campaign''s limit');
select pg_temp.as_user('nina', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('tournois')) $$, 'P0001', 'application_limit',
  'Sports allows one position: Nina already applied');
select pg_temp.as_user('c6', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('treso')) $$, 'P0001', 'profile_incomplete',
  'a student must finish their profile first');

-- =============================================================================
-- 4. Ownership: own drafts only, through the functions only
-- =============================================================================

select pg_temp.as_user('tom', 'aal1');
select is((public.my_application(pg_temp.fid('app_tom')) -> 'application' ->> 'status'), 'draft', 'a student reads their own draft');
select is((public.my_application(pg_temp.fid('app_tom')) -> 'candidate' ->> 'first_name'), 'Tom', 'prefilled from their profile');
select pg_temp.as_user('nina', 'aal1');
select throws_ok($$ select public.my_application(pg_temp.fid('app_tom')) $$, 'P0001', 'application_not_found',
  'another student''s draft does not exist for them');
select is((select count(*)::integer from public.applications where candidate_id <> pg_temp.fid('nina')), 0,
  'the table shows a student their rows only');
select throws_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), 1, '{"motivation": "pirate"}'::jsonb) $$,
  'P0001', 'application_not_found', 'nor can they write another''s answers');
select throws_ok($$ update public.applications set status = 'submitted' where id = pg_temp.fid('app_nina') $$,
  '42501', null, 'nobody sets "submitted" by a table update');
select throws_ok($$ insert into public.applications (candidate_id, campaign_id, position_id, form_version_id)
                   values (pg_temp.fid('nina'), pg_temp.fid('fin'), pg_temp.fid('treso'), (pg_temp.campaign('fin')).active_form_version_id) $$,
  '42501', null, 'nor inserts an application directly');
select throws_ok($$ insert into public.application_documents (application_id, question_id, object_path, file_name, mime_type, size_bytes)
                   values (pg_temp.fid('app_tom'), 'cv', 'applications/' || pg_temp.fid('app_tom') || '/' || gen_random_uuid(), 'x.pdf', 'application/pdf', 10) $$,
  '42501', null, 'nor attaches a document to someone''s application');

-- =============================================================================
-- 5. Answers and documents
-- =============================================================================

select pg_temp.as_user('tom', 'aal1');
select throws_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version,
                    '{"skills": ["pirate"]}'::jsonb) $$, 'P0001', 'answer_invalid', 'an option that does not exist is refused');
select throws_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version,
                    '{"hours": "quatre"}'::jsonb) $$, 'P0001', 'answer_invalid', 'a number must be a number');
select is((public.save_application_answers(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version,
           '{"motivation": "Brouillon fictif de Tom.", "hours": 99, "skills": ["design"], "unknown": "x", "budget": true}'::jsonb) -> 'errors' ->> 'hours'),
  'out_of_range', 'a bound is reported while drafting');
select ok(not ((pg_temp.app('app_tom')).answers ? 'unknown') and not ((pg_temp.app('app_tom')).answers ? 'budget'),
  'answers to questions not asked (another position''s) are dropped');
select throws_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), 1, '{}'::jsonb) $$,
  'P0001', 'draft_conflict', 'a stale tab never overwrites newer work');
select throws_ok($$ select public.submit_application(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version, true) $$,
  'P0001', 'application_incomplete', 'submission refuses an out-of-range answer and a missing required CV');
select lives_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version,
                   '{"motivation": "<script>alert(1)</script> Motivation fictive.", "hours": 4, "skills": ["design"]}'::jsonb) $$,
  'answers are stored as plain text');
select is((pg_temp.app('app_tom')).answers ->> 'motivation', '<script>alert(1)</script> Motivation fictive.',
  'verbatim, never interpreted (the site renders text, never HTML)');

select throws_ok($$ select public.reserve_application_document(pg_temp.fid('app_tom'), 'cv', 'cv.html', 'text/html', 1000) $$,
  'P0001', 'document_type_refused', 'an unsupported document is refused');
select throws_ok($$ select public.reserve_application_document(pg_temp.fid('app_tom'), 'cv', 'cv.png', 'image/png', 1000) $$,
  'P0001', 'document_type_refused', 'a CV question takes PDF or DOCX only');
select throws_ok($$ select public.reserve_application_document(pg_temp.fid('app_tom'), 'cv', 'cv.pdf', 'application/pdf', 6 * 1048576) $$,
  'P0001', 'document_too_large', 'and no more than the question allows');
select throws_ok($$ select public.reserve_application_document(pg_temp.fid('app_tom'), 'motivation', 'cv.pdf', 'application/pdf', 1000) $$,
  'P0001', 'question_not_found', 'a document answers a document question only');
select lives_ok($$ insert into fx (k, v) select 'doc_tom', public.reserve_application_document(pg_temp.fid('app_tom'), 'cv', 'Mon CV.pdf', 'application/pdf', 2000)::text $$,
  'the candidate reserves a path for their CV');
select ok((select v::jsonb ->> 'object_path' from fx where k = 'doc_tom') ~ '^applications/[0-9a-f-]{36}/[0-9a-f-]{36}$',
  'a path with no name, no e-mail, no file name');
select pg_temp.as_user('nina', 'aal1');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', (select v::jsonb ->> 'object_path' from fx where k = 'doc_tom')) $$,
  '42501', null, 'another student cannot upload to it');
select pg_temp.as_user('tom', 'aal1');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', 'applications/' || pg_temp.fid('app_tom') || '/' || gen_random_uuid()) $$,
  '42501', null, 'nor can the candidate upload to a path they did not reserve');
select throws_ok($$ select public.confirm_application_document((select (v::jsonb ->> 'document_id')::uuid from fx where k = 'doc_tom')) $$,
  'P0001', 'document_not_uploaded', 'a document counts only once its file is there');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', (select v::jsonb ->> 'object_path' from fx where k = 'doc_tom')) $$,
  'the candidate uploads to their reserved path');
select is((public.confirm_application_document((select (v::jsonb ->> 'document_id')::uuid from fx where k = 'doc_tom')) ->> 'status'), 'ready',
  'and confirms it');
select is((select count(*)::integer from storage.objects where bucket_id = 'recruitment-documents'), 1, 'the candidate reads their file');
select pg_temp.as_user('nina', 'aal1');
select is((select count(*)::integer from storage.objects where bucket_id = 'recruitment-documents'), 0, 'another student cannot read it');
select pg_temp.as_user('julie');
select is((select count(*)::integer from storage.objects where bucket_id = 'recruitment-documents'), 0,
  'nor the association''s president (Phase 9 decides who reviews)');
select is((select count(*)::integer from public.applications), 0, 'nor read the applications');
select is((select count(*)::integer from public.application_documents), 0, 'nor their documents');
select pg_temp.as_user('alice');
select is((select count(*)::integer from storage.objects where bucket_id = 'recruitment-documents'), 0, 'nor the BDE''s president');
select is((select count(*)::integer from public.applications), 0, 'who reads no application either');
select pg_temp.as_user('garance');
select is((select count(*)::integer from storage.objects where bucket_id = 'recruitment-documents'), 0, 'nor the continuity guardian');
select is((select count(*)::integer from public.applications), 0, 'who reads no application');
select throws_ok($$ select public.recruitment_dashboard(pg_temp.fid('finance')) $$, 'P0001', 'insufficient_permission',
  'and has no recruitment desk');

-- =============================================================================
-- 6. Submission: atomic, idempotent, then locked
-- =============================================================================

select pg_temp.as_user('tom', 'aal1');
select throws_ok($$ select public.submit_application(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version, false) $$,
  'P0001', 'privacy_not_acknowledged', 'the candidate acknowledges the privacy information first');
select is((public.submit_application(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version, true) ->> 'status'), 'submitted',
  'a complete application is submitted');
select is((public.submit_application(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version, true) ->> 'already'), 'true',
  'submitting again returns the same submission');
select is((select count(*)::integer from public.applications where candidate_id = pg_temp.fid('tom') and status = 'submitted'), 1,
  'never two');
select is((pg_temp.app('app_tom')).candidate_snapshot ->> 'last_name', 'Exemple', 'who applied is recorded as submitted');
select is((select count(*)::integer from public.notifications where application_id = pg_temp.fid('app_tom') and kind = 'application_submitted'), 1,
  'a confirmation is queued, once');
select ok((select payload::text from public.notifications where application_id = pg_temp.fid('app_tom') and kind = 'application_submitted')
          !~ '(Motivation|script)', 'with no answer in it');
select throws_ok($$ select public.save_application_answers(pg_temp.fid('app_tom'), (pg_temp.app('app_tom')).version, '{"hours": 5}'::jsonb) $$,
  'P0001', 'application_locked', 'submitted answers cannot be changed');
select throws_ok($$ select public.remove_application_document((select id from public.application_documents where application_id = pg_temp.fid('app_tom'))) $$,
  'P0001', 'application_locked', 'nor its documents removed');
reset role;
select throws_ok($$ update public.applications set answers = '{}'::jsonb where id = pg_temp.fid('app_tom') $$,
  'P0001', 'application_locked', 'not even by the database owner');
select throws_ok($$ update public.applications set status = 'draft', submitted_at = null where id = pg_temp.fid('app_tom') $$,
  'P0001', 'application_locked', 'and it never goes back to draft');
select is((select count(*)::integer from public.governance_audit_events where action like 'application%'), 0,
  'a candidate''s steps are not in the association''s audit');
select ok((select count(*) from public.application_events where application_id = pg_temp.fid('app_tom') and action = 'submitted') = 1,
  'they are in the application''s own history');
set local role authenticated;

-- =============================================================================
-- 7. Withdrawal, and applying again
-- =============================================================================

select pg_temp.as_user('nina', 'aal1');
select throws_ok($$ select public.withdraw_application(pg_temp.fid('app_tom'), null) $$, 'P0001', 'application_not_found',
  'a student cannot withdraw someone else''s application');
select pg_temp.as_user('tom', 'aal1');
select is((public.withdraw_application(pg_temp.fid('app_tom'), 'Changement de plan (test).') ->> 'status'), 'withdrawn',
  'a candidate withdraws their own');
select is((pg_temp.app('app_tom')).answers ->> 'hours', '4', 'withdrawn, still on record');
select is((public.start_application(pg_temp.fid('com')) ->> 'already'), 'false', 'a withdrawn application frees the position');

-- =============================================================================
-- 8. Deadlines (the server decides)
-- =============================================================================

select pg_temp.as_user('c2', 'aal1');
select lives_ok($$ select pg_temp.start('c2_a', 'events') $$, 'a student opens the form before the deadline');
select lives_ok($$ select public.save_application_answers(pg_temp.fid('c2_a'), 1, '{"motivation": "Test.", "sport": "foot"}'::jsonb) $$,
  'and fills it in');
reset role;
update public.recruitment_campaigns set closes_at = now() - interval '1 second' where id = pg_temp.fid('spo');
set local role authenticated;
select pg_temp.as_user('c2', 'aal1');
select throws_ok($$ select public.submit_application(pg_temp.fid('c2_a'), (pg_temp.app('c2_a')).version, true) $$,
  'P0001', 'campaign_closed', 'a submission arriving after the deadline is refused');
select is((pg_temp.app('c2_a')).status, 'draft', 'the draft stays a draft, never sent');
select is((public.my_application(pg_temp.fid('c2_a')) -> 'application' ->> 'refusal'), 'campaign_closed', 'and says why');
reset role;
update public.recruitment_campaigns set closes_at = now() + interval '1 hour' where id = pg_temp.fid('spo');
set local role authenticated;
select pg_temp.as_user('c2', 'aal1');
select is((public.submit_application(pg_temp.fid('c2_a'), (pg_temp.app('c2_a')).version, true) ->> 'status'), 'submitted',
  'within the window it goes through');
select pg_temp.as_user('emma');
select is(public.set_recruitment_status(pg_temp.fid('spo'), 'paused'), 'paused', 'Sports pauses its campaign');
select pg_temp.as_user('c3', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('tournois')) $$, 'P0001', 'campaign_paused',
  'nobody starts or submits meanwhile, whatever the dates say');
select pg_temp.as_user('emma');
select is(public.set_recruitment_status(pg_temp.fid('spo'), 'scheduled'), 'open', 'and resumes it');

-- =============================================================================
-- 9. Form versions (§112)
-- =============================================================================

select pg_temp.as_user('c3', 'aal1');
select lives_ok($$ select pg_temp.start('c3_a', 'tournois') $$, 'student C starts a draft on version 1');
select pg_temp.as_user('emma');
select throws_ok($$ select public.save_recruitment_form(pg_temp.fid('spo'), 0,
                    '{"sections": [{"id": "s1", "title": "x"}], "questions": [{"id": "q", "type": "short_text", "scope": "shared", "section": "s1", "label": "x", "required": true, "onclick": "alert(1)"}]}'::jsonb) $$,
  'P0001', 'form_invalid', 'a question is data: unknown keys (code, HTML, handlers) are refused');
select throws_ok($$ select public.save_recruitment_form(pg_temp.fid('spo'), 0,
                    '{"sections": [{"id": "s1", "title": "x"}], "questions": [{"id": "q", "type": "script", "scope": "shared", "section": "s1", "label": "x", "required": true}]}'::jsonb) $$,
  'P0001', 'form_invalid', 'only the known question types exist');
select throws_ok($$ select public.save_recruitment_form(pg_temp.fid('spo'), 0,
                    jsonb_build_object('sections', '[{"id": "s1", "title": "x"}]'::jsonb, 'questions', jsonb_build_array(
                      jsonb_build_object('id', 'q', 'type', 'yes_no', 'scope', pg_temp.fid('treso'), 'label', 'x', 'required', true)))) $$,
  'P0001', 'form_invalid', 'a question can only name a position of the same campaign');
select lives_ok($$ select public.save_recruitment_form(pg_temp.fid('spo'), 0,
  jsonb_build_object('sections', '[{"id": "s1", "title": "Ta candidature"}]'::jsonb, 'questions', jsonb_build_array(
    '{"id": "motivation", "type": "long_text", "scope": "shared", "section": "s1", "label": "Ta motivation (version 2)", "required": true}'::jsonb,
    '{"id": "sport", "type": "single_choice", "scope": "shared", "section": "s1", "label": "Ton sport préféré", "required": true, "options": [{"id": "foot", "label": "Foot"}, {"id": "basket", "label": "Basket-ball"}, {"id": "autre", "label": "Autre"}]}'::jsonb,
    '{"id": "level", "type": "short_text", "scope": "shared", "section": "s1", "label": "Ton niveau", "required": true, "max_length": 50}'::jsonb,
    jsonb_build_object('id', 'tournament', 'type', 'yes_no', 'scope', pg_temp.fid('tournois'), 'label', 'Déjà organisé un tournoi ?', 'required', true)))) $$,
  'the organizer drafts version 2 (a renamed option, a new question, no more CV)');
select is((select status from public.recruitment_form_versions where campaign_id = pg_temp.fid('spo') and number = 1), 'published',
  'version 1 stays live until version 2 is published');
select is((public.publish_recruitment_form(pg_temp.fid('spo')) ->> 'number'), '2', 'version 2 is published deliberately');
select is((select status from public.recruitment_form_versions where campaign_id = pg_temp.fid('spo') and number = 1), 'superseded',
  'version 1 is kept, superseded');
select is(pg_temp.outbox('c3_a', 'application_form_updated'), 1,
  'a candidate with a draft is told the form changed');
select pg_temp.as_user('c3', 'aal1');
select lives_ok($$ select public.save_application_answers(pg_temp.fid('c3_a'), (pg_temp.app('c3_a')).version,
                   '{"motivation": "Test.", "sport": "foot", "tournament": true}'::jsonb) $$, 'they keep drafting');
select throws_ok($$ select public.submit_application(pg_temp.fid('c3_a'), (pg_temp.app('c3_a')).version, true) $$,
  'P0001', 'form_version_changed', 'but cannot submit answers to a superseded version');
select is((public.refresh_application_form(pg_temp.fid('c3_a')) ->> 'changed'), 'true', 'the draft moves to version 2');
select is((pg_temp.app('c3_a')).answers ->> 'sport', 'foot', 'keeping the answers that still mean the same');
select throws_ok($$ select public.submit_application(pg_temp.fid('c3_a'), (pg_temp.app('c3_a')).version, true) $$,
  'P0001', 'application_incomplete', 'the new required question must be answered');
select lives_ok($$ select public.save_application_answers(pg_temp.fid('c3_a'), (pg_temp.app('c3_a')).version,
                   '{"motivation": "Test.", "sport": "foot", "tournament": true, "level": "Débutant"}'::jsonb) $$, 'once answered');
select is((public.submit_application(pg_temp.fid('c3_a'), (pg_temp.app('c3_a')).version, true) ->> 'status'), 'submitted',
  'student B''s application goes in on version 2');
reset role;
select is((select number from public.recruitment_form_versions where id = (pg_temp.app('app_nina')).form_version_id), 1,
  'student A''s application still points to version 1');
select is((select number from public.recruitment_form_versions where id = (pg_temp.app('c3_a')).form_version_id), 2,
  'student B''s to version 2');
select is((select o ->> 'label' from public.recruitment_form_versions f, jsonb_array_elements(f.schema -> 'questions') q,
                jsonb_array_elements(q -> 'options') o
            where f.id = (pg_temp.app('app_nina')).form_version_id and q ->> 'id' = 'sport' and o ->> 'id' = (pg_temp.app('app_nina')).answers ->> 'sport'),
  'Basket', 'student A''s answer still reads with the option as it was then');
select throws_ok($$ update public.recruitment_form_versions set schema = '{"sections": [], "questions": []}'::jsonb
                    where id = (pg_temp.app('app_nina')).form_version_id $$,
  'P0001', 'form_version_locked', 'a published version is never rewritten, even by the owner');
select throws_ok($$ delete from public.recruitment_form_versions where id = (pg_temp.app('app_nina')).form_version_id $$,
  'P0001', 'form_version_locked', 'nor deleted');
set local role authenticated;

-- =============================================================================
-- 10. Positions, publication rules, reuse
-- =============================================================================

select pg_temp.as_user('emma');
select is(public.remove_recruitment_position(pg_temp.fid('events')), 'retired', 'a position with applications is retired, not deleted');
select is(pg_temp.applications_of('events'), 2, 'its applications stay');
select throws_ok($$ select public.unpublish_recruitment_campaign(pg_temp.fid('spo'), null) $$, 'P0001', 'campaign_has_applications',
  'a campaign with submissions is paused, closed or cancelled, not unpublished');
select throws_ok($$ select public.archive_recruitment_campaign(pg_temp.fid('spo'), true) $$, 'P0001', 'campaign_still_open',
  'an open campaign is not archived');
select lives_ok($$ insert into fx (k, id) values ('dup', public.duplicate_recruitment_campaign(pg_temp.fid('spo'), 'Recrutement 2028 (test)')) $$,
  'next year''s campaign is duplicated from this one');
select is(pg_temp.applications_of('dup'), 0, 'with no application');
select is((select count(*)::integer from public.recruitment_positions where campaign_id = pg_temp.fid('dup')), 2,
  'with its current positions (the retired one stays behind)');
select ok((pg_temp.campaign('dup')).opens_at is null and (pg_temp.campaign('dup')).publication = 'draft', 'as a draft with no dates');
select is((select (q ->> 'scope') from public.recruitment_form_versions f, jsonb_array_elements(f.schema -> 'questions') q
            where f.campaign_id = pg_temp.fid('dup') and q ->> 'id' = 'tournament'),
          (select id::text from public.recruitment_positions where campaign_id = pg_temp.fid('dup') and title = 'Tournois (exemple)'),
  'position questions follow their new position');
select throws_ok($$ select public.delete_recruitment_draft(pg_temp.fid('spo')) $$, 'P0001', 'campaign_was_published',
  'a campaign that went online is never deleted');
select pg_temp.as_user('julie');
select lives_ok($$ select public.delete_recruitment_draft(pg_temp.fid('fin_draft')) $$, 'a draft never online can be');

-- =============================================================================
-- 11. Moderation, cancellation, counts
-- =============================================================================

select pg_temp.as_user('julie');
select ok(public.recruitment_dashboard(pg_temp.fid('finance'))::text !~ '(Brouillon fictif|Motivation fictive|candidate)',
  'the desk shows counts, never an answer or a candidate');
select is((select (c ->> 'submitted')::integer from jsonb_array_elements(public.recruitment_dashboard(pg_temp.fid('finance')) -> 'campaigns') c
            where c ->> 'id' = pg_temp.fid('fin')::text), 0, 'submitted count (Tom withdrew; drafts are not counted)');
select throws_ok($$ select public.hide_recruitment_campaign(pg_temp.fid('spo'), 'Pirate') $$, 'P0001', 'insufficient_permission',
  'an association cannot use moderation');
select pg_temp.as_user('alice');
select lives_ok($$ select public.hide_recruitment_campaign(pg_temp.fid('fin'), 'Masquage de test.') $$, 'the BDE hides a campaign');
select ok(public.platform_recruitment(null, 'hidden')::text !~ '(Brouillon fictif|Motivation fictive)', 'its list shows no answer');
set local role anon;
select is(public.public_recruitment_campaign('recrutement-2027-exemple') ->> 'state', 'not_found', 'gone from the public site');
set local role authenticated;
select pg_temp.as_user('c4', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('treso')) $$, 'P0001', 'campaign_not_found', 'and closed to applications');
select pg_temp.as_user('julie');
select throws_ok($$ select public.restore_recruitment_campaign(pg_temp.fid('fin'), 'Je republie') $$, 'P0001', 'insufficient_permission',
  'the association cannot lift moderation itself');
select pg_temp.as_user('alice');
select lives_ok($$ select public.restore_recruitment_campaign(pg_temp.fid('fin'), 'Rétabli (test).') $$, 'the BDE restores it');

select pg_temp.as_user('emma');
select throws_ok($$ select public.cancel_recruitment_campaign(pg_temp.fid('spo'), '') $$, 'P0001', 'reason_required', 'cancelling needs a reason');
select is(public.cancel_recruitment_campaign(pg_temp.fid('spo'), 'Annulation de test.'), 3,
  'cancelling tells every candidate with a submitted application or a draft');
select is(pg_temp.applications_of('spo', 'submitted'), 3,
  'applications are kept, never deleted by a cancellation');
select pg_temp.as_user('c5', 'aal1');
select throws_ok($$ select public.start_application(pg_temp.fid('tournois')) $$, 'P0001', 'campaign_cancelled', 'nobody applies any more');
reset role;
select ok((select count(*) from public.governance_audit_events
            where action = 'recruitment_campaign_cancelled' and resource_id = pg_temp.fid('spo')) = 1, 'the cancellation is audited');
set local role authenticated;

-- =============================================================================
-- 12. Retention: nothing erased until the institution decides
-- =============================================================================

reset role;
select is((private.purge_recruitment_data() ->> 'withdrawn')::integer, 0, 'with no retention decided, nothing is erased');
update public.applications set withdrawn_at = now() - interval '3 months' where id in (pg_temp.fid('app_lea'), pg_temp.fid('app_tom'));
set local role authenticated;
select pg_temp.as_user('garance');
select throws_ok($$ select public.set_recruitment_settings(null, null, null, 1, null) $$, 'P0001', 'insufficient_permission',
  'the guardian does not set retention');
select pg_temp.as_user('alice');
select lives_ok($$ select public.set_recruitment_settings('Notice de test.', 'contact@bde.example.test', null, 2, null) $$,
  'the BDE records the institution''s decision');
reset role;
select is((private.purge_recruitment_data() ->> 'withdrawn')::integer, 2,
  'withdrawn applications past the period are erased');
select is((select count(*)::integer from public.applications where id = pg_temp.fid('app_lea')), 0, 'Léa''s is gone');
select ok(exists (select 1 from private.storage_cleanup_queue where object_path like 'applications/' || pg_temp.fid('app_tom') || '/%'),
  'and their files are queued for deletion from Storage');
select is((select count(*)::integer from public.governance_audit_events where action = 'recruitment_data_purged'
            and details::text ~ 'Tom|Léa'), 0, 'the purge records counts, not people');

select * from finish();

rollback;
