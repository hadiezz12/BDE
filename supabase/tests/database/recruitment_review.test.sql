-- Phase 9 · Recruitment review and selection: the security matrix of the brief
-- (§116) and its workflows (§117 reviewers, §118 several reviewers, §119
-- interviews, §120 questions, §121 decisions, §122 refusal, §123 two
-- associations), straight against the database. Runs on top of
-- supabase/seed.sql:
--   Finance (Julie presides; Lucas and Hugo are members without recruitment
--   keys) runs "Recrutement 2027 (exemple)": Trésorerie (1 place),
--   Communication (2), Sponsoring; Tom's draft for Communication.
--   Sports (Emma presides; Julie is a plain member there) runs its own, with
--   Nina's application. Alice and Marc lead the BDE; Garance is the guardian.
-- Six fictional students (c1…c6) take part. Simultaneous bookings, decisions
-- and offer answers are tested by supabase/tests/concurrency/review.sh.
-- Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(244);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert, update on fx to anon, authenticated, service_role;

insert into fx (k, id) values
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('alice', 'a0000000-0000-4000-8000-000000000001'),
  ('marc', 'a0000000-0000-4000-8000-000000000002'),
  ('garance', 'a0000000-0000-4000-8000-000000000003'),
  ('julie', 'a0000000-0000-4000-8000-000000000004'),
  ('lucas', 'a0000000-0000-4000-8000-000000000005'),
  ('emma', 'a0000000-0000-4000-8000-000000000006'),
  ('nina', 'a0000000-0000-4000-8000-000000000007'),
  ('hugo', 'a0000000-0000-4000-8000-000000000008'),
  ('paul', 'a0000000-0000-4000-8000-00000000000a'),
  ('lea', 'a0000000-0000-4000-8000-00000000000b');

insert into fx (k, id)
select x.k, (select c.id from public.recruitment_campaigns c join public.organizations o on o.id = c.organization_id
              where c.title = 'Recrutement 2027 (exemple)' and o.slug = x.org)
  from (values ('fin', 'exemple-finance'), ('spo', 'exemple-sports')) as x (k, org);
insert into fx (k, id)
select x.k, (select p.id from public.recruitment_positions p where p.title = x.title)
  from (values ('treso', 'Trésorerie (exemple)'), ('com', 'Communication (exemple)'), ('events', 'Événements (exemple)')) as x (k, title);
insert into fx (k, id)
select 'app_' || x.who, a.id
  from (values ('tom', 'Communication (exemple)'), ('nina', 'Événements (exemple)')) as x (who, title)
  join public.recruitment_positions p on p.title = x.title
  join public.applications a on a.position_id = p.id
  join auth.users u on u.id = a.candidate_id and split_part(u.email, '@', 1) = x.who;
insert into fx (k, id)
select 'presidence_fin', p.id from public.positions p where p.organization_id = (select id from fx where k = 'finance') and p.office is not null;

-- Six fictional students, onboarded.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('d0000000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'revue' || n || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 6) as n;
update public.profiles set first_name = 'Personne', last_name = 'Fictive ' || right(id::text, 1), onboarding_completed_at = now()
 where id::text like 'd0000000-0000-4000-8000-00000000000%';
insert into fx (k, id) select 'c' || n, ('d0000000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1, 6) as n;

-- Members for the committees (fixtures): c4, c5, c6 and Marc join Finance; Paul joins Sports.
insert into public.memberships (organization_id, user_id, status)
select (select id from fx where k = 'finance'), id, 'active' from fx where k in ('c4', 'c5', 'c6', 'marc');
insert into public.memberships (organization_id, user_id, status)
values ((select id from fx where k = 'sports'), (select id from fx where k = 'paul'), 'active');

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

create function pg_temp.membership(p_org text, p_user text) returns uuid language sql stable security definer
  as $f$ select id from public.memberships where organization_id = (select id from fx where k = p_org) and user_id = (select id from fx where k = p_user) $f$;
grant execute on function pg_temp.membership(text, text) to anon, authenticated, service_role;

-- A count as the database sees it (the test's own eyes, not a user's).
create function pg_temp.n(p_sql text) returns integer language plpgsql security definer as $f$
declare v integer;
begin
  execute p_sql into v;
  return v;
end $f$;
grant execute on function pg_temp.n(text) to anon, authenticated, service_role;

create function pg_temp.review_id(p_app text, p_user text) returns uuid language sql stable security definer
  as $f$ select id from public.recruitment_reviews where application_id = (select id from fx where k = p_app)
           and reviewer_id = (select id from fx where k = p_user) and kind = 'application' $f$;
grant execute on function pg_temp.review_id(text, text) to anon, authenticated, service_role;

create function pg_temp.assessment_id(p_app text, p_user text) returns uuid language sql stable security definer
  as $f$ select id from public.recruitment_reviews where application_id = (select id from fx where k = p_app)
           and reviewer_id = (select id from fx where k = p_user) and kind = 'interview' $f$;
grant execute on function pg_temp.assessment_id(text, text) to anon, authenticated, service_role;

create function pg_temp.review_version(p_id uuid) returns integer language sql stable security definer
  as $f$ select version from public.recruitment_reviews where id = p_id $f$;
grant execute on function pg_temp.review_version(uuid) to anon, authenticated, service_role;

create function pg_temp.decision(p_app text) returns public.recruitment_decisions language sql stable security definer
  as $f$ select * from public.recruitment_decisions where application_id = (select id from fx where k = p_app) order by created_at desc limit 1 $f$;
grant execute on function pg_temp.decision(text) to anon, authenticated, service_role;

create function pg_temp.offer(p_app text) returns public.recruitment_offers language sql stable security definer
  as $f$ select * from public.recruitment_offers where application_id = (select id from fx where k = p_app) order by created_at desc limit 1 $f$;
grant execute on function pg_temp.offer(text) to anon, authenticated, service_role;

create function pg_temp.interview(p_app text) returns public.recruitment_interviews language sql stable security definer
  as $f$ select * from public.recruitment_interviews where application_id = (select id from fx where k = p_app) order by created_at desc limit 1 $f$;
grant execute on function pg_temp.interview(text) to anon, authenticated, service_role;

-- Applies as the current user, CV included (the Finance form asks for one), and remembers it.
create function pg_temp.apply(p_key text, p_position text, p_answers jsonb) returns uuid language plpgsql as $f$
declare
  v uuid;
  v_doc jsonb;
begin
  v := (public.start_application((select id from fx where k = p_position)) ->> 'application_id')::uuid;
  perform public.save_application_answers(v, 1, p_answers);
  v_doc := public.reserve_application_document(v, 'cv', 'CV fictif.pdf', 'application/pdf', 2000);
  insert into storage.objects (bucket_id, name) values ('recruitment-documents', v_doc ->> 'object_path');
  perform public.confirm_application_document((v_doc ->> 'document_id')::uuid);
  perform public.submit_application(v, (select version from public.applications where id = v), true);
  insert into fx (k, id) values (p_key, v), (p_key || '_cv', (v_doc ->> 'document_id')::uuid);
  return v;
end $f$;
grant execute on function pg_temp.apply(text, text, jsonb) to authenticated;

set local role authenticated;

select pg_temp.as_user('c1', 'aal1');
do $d$ begin perform pg_temp.apply('app_c1', 'treso', '{"motivation": "Motivation fictive de c1.", "hours": 4, "budget": true}'); end $d$;
select pg_temp.as_user('c2', 'aal1');
do $d$ begin perform pg_temp.apply('app_c2', 'treso', '{"motivation": "Motivation fictive de c2.", "hours": 6, "budget": false}'); end $d$;
select pg_temp.as_user('c3', 'aal1');
do $d$ begin perform pg_temp.apply('app_c3', 'com', '{"motivation": "Motivation fictive de c3.", "hours": 3}'); end $d$;
select pg_temp.as_user('c5', 'aal1');
do $d$ begin perform pg_temp.apply('app_c5', 'com', '{"motivation": "Motivation fictive de c5.", "hours": 2}'); end $d$;

-- =============================================================================
-- 1. Before any appointment: the association's leadership only (§116, D59)
-- =============================================================================

select pg_temp.as_user('julie');
select is(public.recruitment_application(pg_temp.fid('app_c1')) -> 'answers' ->> 'motivation', 'Motivation fictive de c1.',
  'the association''s president reads an application to her association');
select is(public.recruitment_application(pg_temp.fid('app_c1')) ->> 'form' is not null, true, 'with the form it was answered on');
select is((public.recruitment_application(pg_temp.fid('app_c1')) -> 'application' ->> 'form_version')::integer, 1,
  'and the number of that form version');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_tom')) $$, 'P0001', 'application_not_found',
  'a draft is nobody''s business but its candidate''s');
select is((public.recruitment_application_list(pg_temp.fid('fin')) ->> 'total')::integer, 4, 'her list has the four sent applications');
select ok(public.recruitment_campaign_access(pg_temp.fid('fin')) -> 'powers' ? 'approve', 'her office carries every recruitment power');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_nina')) $$, 'P0001', 'application_not_found',
  'a member of Sports reads nothing of Sports'' applications');

select pg_temp.as_user('lucas');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'an ordinary association member reads no application');
select throws_ok($$ select public.recruitment_document(pg_temp.fid('app_c1_cv')) $$, 'P0001', 'document_not_found',
  'nor opens a CV');
select throws_ok($$ select public.recruitment_application_list(pg_temp.fid('fin')) $$, 'P0001', 'insufficient_permission',
  'nor lists them');
select throws_ok($$ select public.recruitment_campaign_access(pg_temp.fid('fin')) $$, 'P0001', 'campaign_not_found',
  'and is shown no review tab at all');

select pg_temp.as_user('emma');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'another association''s president reads nothing of Finance');
select pg_temp.as_user('alice');
select throws_ok($$ select public.recruitment_document(pg_temp.fid('app_c1_cv')) $$, 'P0001', 'document_not_found',
  'the BDE''s president opens no association''s CV');
select throws_ok($$ select public.recruitment_campaign_board(pg_temp.fid('fin')) $$, 'P0001', 'insufficient_permission',
  'nor sees its review');
select pg_temp.as_user('garance');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'the guardian reads no application');

select pg_temp.as_user('c2', 'aal1');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'a student reads no other student''s application');
select is((select count(*)::integer from public.applications where id = pg_temp.fid('app_c1')), 0, 'not even its row');
select is(public.my_application(pg_temp.fid('app_c2')) -> 'application' ->> 'status', 'submitted', 'but reads their own');
select pg_temp.as_user('c1', 'aal1');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'and never through the reviewers'' door');

select pg_temp.as_user('julie');
select throws_ok($$ select count(*) from public.recruitment_reviews $$, '42501', null, 'no API role reads the review tables directly');
select throws_ok($$ select count(*) from public.application_pipeline $$, '42501', null, 'nor the pipeline');
select throws_ok($$ update public.applications set answers = '{}'::jsonb where id = pg_temp.fid('app_c1') $$, '42501', null,
  'nobody edits a candidate''s answers');
select throws_ok($$ insert into public.recruitment_decisions (application_id, campaign_id, position_id, outcome)
                   values (pg_temp.fid('app_c1'), pg_temp.fid('fin'), pg_temp.fid('treso'), 'offer') $$, '42501', null,
  'nor writes a decision by hand');

-- =============================================================================
-- 2. The committee (§117)
-- =============================================================================

select pg_temp.as_user('julie', 'aal1');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'lucas'), 'reviewer',
                     array['view', 'review', 'documents'], 'positions', array[pg_temp.fid('treso')], now() + interval '3 months') $$,
  'P0001', 'mfa_required', 'appointing a reviewer needs the second factor');
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('m_lucas', public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'lucas'),
                     'reviewer', array['view', 'review', 'documents'], 'positions', array[pg_temp.fid('treso')], now() + interval '3 months')) $$,
  'Julie appoints Lucas to the Trésorerie applications, CVs included');
select lives_ok($$ insert into fx (k, id) values ('m_hugo', public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'hugo'),
                     'reviewer', array['view', 'review'], 'positions', array[pg_temp.fid('com')], now() + interval '3 months')) $$,
  'and Hugo to the Communication applications, without the files');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'hugo'),
                     'reviewer', array['view'], 'campaign', null, now() + interval '3 months') $$,
  'P0001', 'already_on_committee', 'one appointment per person and campaign');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('sports', 'paul'),
                     'reviewer', array['view'], 'campaign', null, now() + interval '3 months') $$,
  'P0001', 'member_not_active', 'only an active member of the association');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'),
                     'reviewer', array['review'], 'campaign', null, now() + interval '3 months') $$,
  'P0001', 'powers_invalid', 'reading is part of every appointment');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c5'),
                     'reviewer', array['view'], 'campaign', null, now() + interval '3 months') $$,
  'P0001', 'candidate_in_campaign', 'never someone who applied to the same campaign');
select is((select count(*)::integer from public.governance_audit_events where action = 'recruitment_reviewer_assigned'
            and subject_user_id = pg_temp.fid('lucas')), 1, 'the appointment is in the audit, about Lucas');

select pg_temp.as_user('lucas');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'),
                     'reviewer', array['view'], 'campaign', null, now() + interval '3 months') $$,
  'P0001', 'insufficient_permission', 'a reviewer appoints nobody');
select is((select (o ->> 'recruitment_committee')::boolean from jsonb_array_elements(public.my_access() -> 'organizations') o
            where o ->> 'slug' = 'exemple-finance'), true, 'Lucas''s workspace knows he sits on a committee');
select is((select count(*)::integer from jsonb_array_elements(public.my_recruitment_work()) w), 1, 'his work page lists the campaign');
select is((public.recruitment_application_list(pg_temp.fid('fin')) ->> 'total')::integer, 2,
  'he sees the two Trésorerie applications');
select ok(public.recruitment_application_list(pg_temp.fid('fin'))::text !~ 'Fictive [35]',
  'and nothing of Communication');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c3')) $$, 'P0001', 'application_not_found',
  'a reviewer cannot open another position''s application');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_nina')) $$, 'P0001', 'application_not_found',
  'nor another association''s');
select is(public.recruitment_application(pg_temp.fid('app_c1')) -> 'answers' ->> 'motivation', 'Motivation fictive de c1.',
  'he reads an assigned application''s answers');
select is(jsonb_array_length(public.recruitment_application(pg_temp.fid('app_c1')) -> 'documents'), 1, 'and sees its CV');
select is(public.recruitment_document(pg_temp.fid('app_c1_cv')) ->> 'file_name', 'CV fictif.pdf', 'he opens the CV (document power)');
select is(pg_temp.n($$ select count(*)::integer from public.application_access_log
                       where action = 'document_opened' and document_id = (select id from fx where k = 'app_c1_cv') $$), 1,
  'the opening is recorded');
select is(pg_temp.n($$ select count(*)::integer from public.application_access_log
                       where action = 'document_opened' and actor_id = (select id from fx where k = 'lucas') $$), 1,
  'under the session''s own identity (never one the browser names)');
select is(pg_temp.n($$ select count(*)::integer from public.application_access_log
                       where action = 'application_opened' and actor_id = (select id from fx where k = 'lucas')
                         and application_id = (select id from fx where k = 'app_c1') $$), 1,
  'opening the application is recorded once per half hour');

select pg_temp.as_user('hugo');
select is(public.recruitment_application(pg_temp.fid('app_c3')) -> 'answers' ->> 'motivation', 'Motivation fictive de c3.',
  'Hugo reads his position''s application');
select ok(public.recruitment_application(pg_temp.fid('app_c3')) -> 'documents' = 'null'::jsonb, 'but no file list without the document power');
select throws_ok($$ select public.recruitment_document(pg_temp.fid('app_c3_cv')) $$, 'P0001', 'document_not_found',
  'and cannot open the CV');

-- =============================================================================
-- 3. Rubric, a review, its lock and its amendment (§117)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ select public.save_recruitment_rubric(pg_temp.fid('fin'), 'application', null,
  '[{"id": "motivation", "label": "Motivation", "max": 5, "weight": 2},
    {"id": "experience", "label": "Expérience utile", "max": 5},
    {"id": "availability", "label": "Disponibilité", "max": 5, "required": false}]'::jsonb) $$,
  'the president drafts a grid');
select throws_ok($$ select public.save_recruitment_rubric(pg_temp.fid('fin'), 'application', 1,
  '[{"id": "motivation", "label": "Motivation", "max": 50}]'::jsonb) $$, 'P0001', 'rubric_invalid', 'a scale stays between 2 and 10');
select throws_ok($$ select public.save_recruitment_rubric(pg_temp.fid('fin'), 'application', 1,
  '[{"id": "motivation", "label": "Motivation", "formula": "1+1"}]'::jsonb) $$, 'P0001', 'rubric_invalid', 'a grid holds data, never a formula');
select is((public.publish_recruitment_rubric(pg_temp.fid('fin'), 'application') ->> 'number')::integer, 1, 'and publishes version 1');

select pg_temp.as_user('lucas');
select throws_ok($$ select public.save_recruitment_rubric(pg_temp.fid('fin'), 'application', null, '[]'::jsonb) $$,
  'P0001', 'insufficient_permission', 'a reviewer does not change the grid');
select throws_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c1'), null, '{"motivation": 9}'::jsonb) $$,
  'P0001', 'score_invalid', 'a score stays within its scale');
select lives_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c1'), null, '{"motivation": 4, "experience": 3}'::jsonb,
                     'interview', 'Note privée fictive de Lucas.') $$, 'Lucas scores c1 in a draft');
select is(pg_temp.n($$ select count(*)::integer from public.application_pipeline where application_id = (select id from fx where k = 'app_c1')
                        and stage = 'under_review' $$), 1, 'the application is now under review');
select pg_temp.as_user('julie');
select is(jsonb_array_length(public.recruitment_application(pg_temp.fid('app_c1')) -> 'reviews'), 0,
  'a draft stays its author''s, even for the president');
select pg_temp.as_user('lucas');
select is((public.submit_recruitment_review(pg_temp.review_id('app_c1', 'lucas'), pg_temp.review_version(pg_temp.review_id('app_c1', 'lucas'))) ->> 'status'),
  'submitted', 'he submits it');
select throws_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c1'), null, '{"motivation": 1, "experience": 1}'::jsonb, 'reject') $$,
  'P0001', 'review_submitted', 'a submitted review is locked');
select throws_ok($$ select public.amend_recruitment_review(pg_temp.review_id('app_c1', 'lucas'), '{"motivation": 5, "experience": 3}'::jsonb,
                     'interview', 'Note privée fictive de Lucas.', '') $$,
  'P0001', 'reason_required', 'changing it needs a reason');
select lives_ok($$ select public.amend_recruitment_review(pg_temp.review_id('app_c1', 'lucas'), '{"motivation": 5, "experience": 3}'::jsonb,
                     'interview', 'Note privée fictive de Lucas.', 'Relu le CV (test).') $$, 'and is then recorded');
select is(jsonb_array_length(public.recruitment_review_history(pg_temp.review_id('app_c1', 'lucas'))), 2,
  'both states are kept, the original first');
select is((public.recruitment_review_history(pg_temp.review_id('app_c1', 'lucas')) -> 0 -> 'scores' ->> 'motivation')::integer, 4,
  'the original score is still there');
select throws_ok($$ update public.recruitment_review_revisions set note = 'x' $$, '42501', null, 'nobody rewrites the history');

select pg_temp.as_user('hugo');
select throws_ok($$ select public.amend_recruitment_review(pg_temp.review_id('app_c1', 'lucas'), '{"motivation": 1, "experience": 1}'::jsonb,
                     'reject', null, 'Je change la note (test).') $$, 'P0001', 'review_not_found',
  'no reviewer edits another''s submitted review');

select pg_temp.as_user('julie');
select is((select count(*)::integer from jsonb_array_elements(public.recruitment_application(pg_temp.fid('app_c1')) -> 'reviews') r
            where r ->> 'reviewer_name' is not null and not (r ->> 'mine')::boolean), 1, 'the team''s view shows Lucas''s submitted review');
select is((public.recruitment_application(pg_temp.fid('app_c1')) -> 'reviews' -> 0 -> 'total' ->> 'percent')::numeric, 86.7,
  'with its weighted result and basis: (5×2 + 3×1) / (5×2 + 5×1)');

select pg_temp.as_user('c1', 'aal1');
select ok(public.my_application(pg_temp.fid('app_c1'))::text !~ '(Note privée|86\.7|"scores"|reviewer)',
  'the candidate sees no score, no note, no reviewer');
select is(public.my_application(pg_temp.fid('app_c1')) -> 'application' -> 'stage' ->> 'key', 'under_review',
  'only that it is being examined');

-- Revocation (§117.16-17, §104).
select pg_temp.as_user('julie');
select lives_ok($$ select public.revoke_recruitment_member(pg_temp.fid('m_lucas'), 'Fin de mission (test).') $$, 'Julie removes Lucas');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'his next read is refused, same session');
select throws_ok($$ select public.recruitment_document(pg_temp.fid('app_c1_cv')) $$, 'P0001', 'document_not_found',
  'and so is the CV');
select is((select (o ->> 'recruitment_committee')::boolean from jsonb_array_elements(public.my_access() -> 'organizations') o
            where o ->> 'slug' = 'exemple-finance'), false, 'and his workspace no longer shows it');

-- =============================================================================
-- 4. Two independent reviews and a completion rule (§118)
-- =============================================================================

select pg_temp.as_user('lucas');
select throws_ok($$ select public.set_recruitment_review_policy(pg_temp.fid('fin'), 2, 'president') $$, 'P0001', 'insufficient_permission',
  'a former reviewer sets no rule');
select pg_temp.as_user('julie');
select lives_ok($$ select public.set_recruitment_review_policy(pg_temp.fid('fin'), 2, 'president') $$,
  'two reviews per application, decisions by an approver and the president');
select lives_ok($$ insert into fx (k, id) values ('m_lucas2', public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'lucas'),
                     'reviewer', array['view', 'review', 'documents'], 'assigned', null, now() + interval '3 months')) $$,
  'Lucas is appointed again, for assigned applications only');
select lives_ok($$ select public.update_recruitment_member(pg_temp.fid('m_hugo'), 'reviewer', array['view', 'review'], 'positions',
                     array[pg_temp.fid('treso'), pg_temp.fid('com')], now() + interval '3 months') $$,
  'Hugo now covers both positions');
select is((public.assign_recruitment_reviews(pg_temp.fid('fin'), array[pg_temp.fid('app_c2')],
             array[pg_temp.fid('m_lucas2'), pg_temp.fid('m_hugo')], 'each') ->> 'assigned')::integer, 2,
  'c2 is assigned to both');

select pg_temp.as_user('lucas');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'scope "assigned": only what was assigned');
select lives_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c2'), null, '{"motivation": 4, "experience": 4}'::jsonb, 'offer', 'Avis fictif de Lucas.') $$,
  'Lucas scores c2');
select lives_ok($$ select public.submit_recruitment_review(pg_temp.review_id('app_c2', 'lucas'), pg_temp.review_version(pg_temp.review_id('app_c2', 'lucas'))) $$,
  'and submits');
select pg_temp.as_user('hugo');
select is(jsonb_array_length(public.recruitment_application(pg_temp.fid('app_c2')) -> 'reviews'), 0,
  'Hugo, without the team view, does not see Lucas''s review');
select lives_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c2'), null, '{"motivation": 3, "experience": 5, "availability": 2}'::jsonb, 'waitlist') $$,
  'Hugo scores c2 on his own');
select lives_ok($$ select public.submit_recruitment_review(pg_temp.review_id('app_c2', 'hugo'), pg_temp.review_version(pg_temp.review_id('app_c2', 'hugo'))) $$,
  'and submits');
select pg_temp.as_user('julie');
select is((public.recruitment_application(pg_temp.fid('app_c2')) -> 'summary' ->> 'counted')::integer, 2, 'both reviews count');
select is(public.recruitment_application(pg_temp.fid('app_c2')) -> 'summary' -> 'recommendations',
  '{"offer": 1, "waitlist": 1}'::jsonb, 'disagreeing recommendations are both kept');
select is((select (p ->> 'complete')::integer from jsonb_array_elements(public.recruitment_campaign_board(pg_temp.fid('fin')) -> 'positions') p
            where p ->> 'title' = 'Trésorerie (exemple)'), 1, 'the progress board counts c2 as fully reviewed');
select is((select (p ->> 'partial')::integer from jsonb_array_elements(public.recruitment_campaign_board(pg_temp.fid('fin')) -> 'positions') p
            where p ->> 'title' = 'Trésorerie (exemple)'), 1, 'and c1 as partly reviewed');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.propose_recruitment_decision(pg_temp.fid('app_c2'), 'offer') $$, 'P0001', 'application_not_found',
  'submitting a score gives no decision power');

-- =============================================================================
-- 5. Conflicts and a committee member who applies (§33-34)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('m_c4', public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c4'),
                     'reviewer', array['view', 'review'], 'campaign', null, now() + interval '3 months')) $$, 'c4 joins the committee');
select pg_temp.as_user('c4');
select lives_ok($$ insert into fx (k, id) values ('conflict', public.declare_recruitment_conflict(pg_temp.fid('app_c3'), 'Je connais la personne (test).')) $$,
  'c4 declares a conflict on c3');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c3')) $$, 'P0001', 'application_not_found',
  'and can no longer open it');
select throws_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c3'), null, '{}'::jsonb) $$, 'P0001', 'application_not_found',
  'nor evaluate it');
select throws_ok($$ select public.resolve_recruitment_conflict(pg_temp.fid('conflict'), 'cleared', 'Je me débloque (test).') $$,
  'P0001', 'insufficient_permission', 'nor lift it alone');
select pg_temp.as_user('julie');
select ok(public.recruitment_committee(pg_temp.fid('fin'))::text ~ 'Je connais la personne', 'the manager sees the declaration');
select pg_temp.as_user('hugo');
select ok(public.recruitment_committee(pg_temp.fid('fin'))::text !~ 'Je connais la personne', 'other reviewers do not');
select pg_temp.as_user('julie');
select lives_ok($$ select public.resolve_recruitment_conflict(pg_temp.fid('conflict'), 'cleared', 'Lien sans incidence (test).') $$,
  'Julie clears it, in writing');
select pg_temp.as_user('c4');
select is(public.recruitment_application(pg_temp.fid('app_c3')) -> 'application' ->> 'reference', (pg_temp.app('app_c3')).reference,
  'c4 can work on it again');
select pg_temp.as_user('c4', 'aal1');
do $d$ begin perform pg_temp.apply('app_c4', 'treso', '{"motivation": "Motivation fictive de c4.", "hours": 5, "budget": true}'); end $d$;
select pg_temp.as_user('c4');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c3')) $$, 'P0001', 'application_not_found',
  'once c4 applies to the same campaign, c4 reviews nothing in it');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c4')) $$, 'P0001', 'application_not_found',
  'and certainly not their own application');

-- =============================================================================
-- 6. Shortlist, tags, discussion
-- =============================================================================

select pg_temp.as_user('hugo');
select is((public.move_recruitment_applications(array[pg_temp.fid('app_c3')], 'shortlisted') ->> 'moved')::integer, 0,
  'a reviewer without that power shortlists nothing');
select pg_temp.as_user('julie');
select is((public.move_recruitment_applications(array[pg_temp.fid('app_c1'), pg_temp.fid('app_c3')], 'shortlisted') ->> 'moved')::integer, 2,
  'the president shortlists c1 and c3');
select is(pg_temp.n($$ select count(*)::integer from public.governance_audit_events where action = 'recruitment_application_shortlisted'
                        and resource_id = (select id from fx where k = 'app_c1') and subject_user_id is null
                        and details::text !~ 'Fictive|motivation' $$), 1,
  'the audit records who and when, never the candidate');
select lives_ok($$ insert into fx (k, id) values ('tag', public.create_recruitment_tag(pg_temp.fid('fin'), 'Entretien prioritaire')) $$,
  'a tag for the campaign');
select pg_temp.as_user('hugo');
select lives_ok($$ select public.set_application_tag(pg_temp.fid('app_c3'), pg_temp.fid('tag'), true) $$, 'a reviewer tags an application he reviews');
select pg_temp.as_user('julie');
select throws_ok($$ select public.post_application_comment(pg_temp.fid('app_c1'), 'Voir en entretien ?', array[pg_temp.fid('hugo')]) $$,
  'P0001', 'mention_not_allowed', 'nobody is mentioned who cannot read the discussion');
select throws_ok($$ select public.post_application_comment(pg_temp.fid('app_c1'), 'Voir en entretien ?', array[pg_temp.fid('emma')]) $$,
  'P0001', 'mention_not_allowed', 'least of all someone from another association');
select lives_ok($$ select public.post_application_comment(pg_temp.fid('app_c1'), 'Commentaire interne fictif.') $$, 'the president writes to the committee');
select pg_temp.as_user('hugo');
select ok(public.recruitment_application(pg_temp.fid('app_c1')) -> 'comments' = 'null'::jsonb,
  'a reviewer without the team view does not read the discussion');

-- =============================================================================
-- 7. Interviews (§119)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('m_marc', public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'marc'),
                     'interviewer', array['view'], 'assigned', null, now() + interval '3 months')) $$,
  'Marc is appointed to conduct interviews only');
select lives_ok($$ insert into fx (k, v) values ('slots', public.create_interview_slots(pg_temp.fid('fin'), null,
                     array[date_trunc('hour', now()) + interval '3 days 14 hours'],
                     45, 'in_person', 'Salle fictive B12', null, 'Arrive cinq minutes avant (test).', array[pg_temp.fid('m_marc')])::text) $$,
  'a slot of 45 minutes, Marc interviewing');
select lives_ok($$ insert into fx (k, v) values ('slots2', public.create_interview_slots(pg_temp.fid('fin'), null,
                     array[date_trunc('hour', now()) + interval '3 days 15 hours'],
                     45, 'in_person', 'Salle fictive B12', null, null, null)::text) $$,
  'and another one, without him');
insert into fx (k, id) select 'slot1', (v::jsonb -> 'created' ->> 0)::uuid from fx where k = 'slots';
insert into fx (k, id) select 'slot2', (v::jsonb -> 'created' ->> 0)::uuid from fx where k = 'slots2';
select is((public.create_interview_slots(pg_temp.fid('fin'), null, array[date_trunc('hour', now()) + interval '3 days 14 hours 30 minutes'],
             30, 'online', null, 'https://visio.example.test/salle', null, array[pg_temp.fid('m_marc')]) -> 'skipped' -> 0 ->> 'reason'),
  'interviewer_busy', 'Marc is never booked twice at once');
select throws_ok($$ select public.create_interview_slots(pg_temp.fid('fin'), null, array[now() + interval '2 days'], 30, 'online', null,
                     'javascript:alert(1)', null, null) $$, 'P0001', 'slot_invalid', 'a meeting link is an https address');
select is((public.invite_to_interview(array[pg_temp.fid('app_c1'), pg_temp.fid('app_c2')], 'Invitation fictive.', now() + interval '2 days') ->> 'invited')::integer, 2,
  'c1 and c2 are invited');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where kind = 'recruitment_interview_invited'
                        and application_id in (select id from fx where k in ('app_c1', 'app_c2')) $$), 2, 'each gets a message');

select pg_temp.as_user('marc');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'an interviewer sees no application before an interview is booked on their slot');

select pg_temp.as_user('c1', 'aal1');
select is(jsonb_array_length(public.my_application(pg_temp.fid('app_c1')) -> 'interview' -> 'slots'), 2, 'c1 sees two free slots');
select ok(public.my_application(pg_temp.fid('app_c1')) -> 'interview' ->> 'slots' !~ 'Arrive cinq', 'instructions only once booked');
select pg_temp.as_user('c2', 'aal1');
select throws_ok($$ select public.book_interview_slot((pg_temp.interview('app_c1')).id, pg_temp.fid('slot1')) $$, 'P0001', 'interview_not_found',
  'nobody books another candidate''s interview');
select pg_temp.as_user('c1', 'aal1');
select is(public.book_interview_slot((pg_temp.interview('app_c1')).id, pg_temp.fid('slot1')) ->> 'status', 'scheduled', 'c1 takes the first slot');
select is(public.book_interview_slot((pg_temp.interview('app_c1')).id, pg_temp.fid('slot1')) ->> 'already', 'true', 'asking again changes nothing');
select is(public.my_application(pg_temp.fid('app_c1')) -> 'interview' -> 'slot' ->> 'location', 'Salle fictive B12', 'and sees where and when');
select is(public.my_application(pg_temp.fid('app_c1')) -> 'application' -> 'stage' ->> 'key', 'interview_scheduled', 'the status says so');
select pg_temp.as_user('c2', 'aal1');
select throws_ok($$ select public.book_interview_slot((pg_temp.interview('app_c2')).id, pg_temp.fid('slot1')) $$, 'P0001', 'slot_taken',
  'another candidate cannot take an occupied slot');
select is(public.book_interview_slot((pg_temp.interview('app_c2')).id, pg_temp.fid('slot2')) ->> 'status', 'scheduled', 'c2 takes the other');

select pg_temp.as_user('marc');
select is(public.recruitment_application(pg_temp.fid('app_c1')) -> 'answers' ->> 'motivation', 'Motivation fictive de c1.',
  'the interviewer now reads the application he will interview');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c2')) $$, 'P0001', 'application_not_found',
  'and nothing else (c2 is booked on a slot he does not hold)');
select is(jsonb_array_length(public.recruitment_application(pg_temp.fid('app_c1')) -> 'reviews'), 0,
  'an interviewer does not read the reviewers'' notes');
select throws_ok($$ select public.complete_interview((pg_temp.interview('app_c1')).id, 'completed') $$, 'P0001', 'interview_not_started',
  'an interview is recorded as done only once it started');

reset role;
update public.recruitment_interview_slots set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour 15 minutes'
 where id = pg_temp.fid('slot1');
set local role authenticated;
select lives_ok($$ select public.complete_interview((pg_temp.interview('app_c1')).id, 'completed') $$, 'Marc records it took place');
select lives_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c1'), (pg_temp.interview('app_c1')).id, '{}'::jsonb, 'offer',
                     'Évaluation d''entretien fictive.') $$, 'and writes his assessment');
select lives_ok($$ select public.submit_recruitment_review(pg_temp.assessment_id('app_c1', 'marc'), 1) $$, 'and submits it');
select pg_temp.as_user('c1', 'aal1');
select ok(public.my_application(pg_temp.fid('app_c1'))::text !~ 'Évaluation d''entretien', 'the candidate never sees it');

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, v) values ('slots3', public.create_interview_slots(pg_temp.fid('fin'), pg_temp.fid('treso'),
                     array[date_trunc('hour', now()) + interval '4 days 10 hours'], 30, 'online', null, 'https://visio.example.test/b', null, null)::text) $$,
  'a third slot, online');
insert into fx (k, id) select 'slot3', (v::jsonb -> 'created' ->> 0)::uuid from fx where k = 'slots3';
select lives_ok($$ select public.reschedule_interview((pg_temp.interview('app_c2')).id, pg_temp.fid('slot3'), 'Salle indisponible (test).') $$,
  'the manager moves c2''s interview');
select is(pg_temp.n($$ select count(*)::integer from public.application_events where application_id = (select id from fx where k = 'app_c2')
                        and action = 'interview_rescheduled' and details ? 'from' and details ? 'to' $$), 1,
  'the old and the new time are kept');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c2')
                        and kind = 'recruitment_interview_rescheduled' $$), 1, 'and c2 is told');

-- =============================================================================
-- 8. Questions to the candidate (§120)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('q1', public.request_clarification(pg_temp.fid('app_c3'), 'Question fictive : un exemple d''événement ?',
                     now() + interval '2 days', true)) $$, 'the president asks c3 a question');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c3')
                        and kind = 'recruitment_clarification_requested' $$), 1, 'c3 is told');
select pg_temp.as_user('c1', 'aal1');
select throws_ok($$ select public.answer_clarification(pg_temp.fid('q1'), 'Réponse usurpée.') $$, 'P0001', 'clarification_not_found',
  'another candidate cannot answer it');
select pg_temp.as_user('c3', 'aal1');
select is(public.my_application(pg_temp.fid('app_c3')) -> 'application' -> 'stage' ->> 'key', 'question', 'c3''s page asks for an answer');
select is(public.my_application(pg_temp.fid('app_c3')) -> 'clarifications' -> 0 ->> 'question', 'Question fictive : un exemple d''événement ?',
  'and shows the question');
select lives_ok($$ insert into fx (k, v) values ('q1doc', public.reserve_clarification_document(pg_temp.fid('q1'), 'Programme.pdf', 'application/pdf', 1500)::text) $$,
  'c3 reserves a file for the answer');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', (select v::jsonb ->> 'object_path' from fx where k = 'q1doc')) $$,
  'uploads it with their own session');
select is(public.confirm_clarification_document((select (v::jsonb ->> 'document_id')::uuid from fx where k = 'q1doc')) ->> 'status', 'ready', 'and it counts');
select is(public.answer_clarification(pg_temp.fid('q1'), 'Réponse fictive de c3.') ->> 'status', 'answered', 'c3 answers');
select is(public.answer_clarification(pg_temp.fid('q1'), 'Autre réponse.') ->> 'already', 'true', 'once');
select is((pg_temp.app('app_c3')).answers ->> 'motivation', 'Motivation fictive de c3.', 'the original application is unchanged');
select pg_temp.as_user('julie');
select is(public.recruitment_application(pg_temp.fid('app_c3')) -> 'clarifications' -> 0 ->> 'answer', 'Réponse fictive de c3.',
  'the team reads the answer');
select is(jsonb_array_length(public.recruitment_application(pg_temp.fid('app_c3')) -> 'clarifications' -> 0 -> 'documents'), 1, 'and its file');
select pg_temp.as_user('emma');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c3')) $$, 'P0001', 'application_not_found',
  'another association cannot read the exchange');

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('q2', public.request_clarification(pg_temp.fid('app_c3'), 'Seconde question fictive ?', now() + interval '1 day')) $$,
  'a second question, due tomorrow');
reset role;
update public.recruitment_clarifications set due_at = now() - interval '1 minute' where id = pg_temp.fid('q2');
set local role authenticated;
select pg_temp.as_user('c3', 'aal1');
select throws_ok($$ select public.answer_clarification(pg_temp.fid('q2'), 'Trop tard.') $$, 'P0001', 'clarification_closed',
  'a late answer is refused by the database');
select pg_temp.as_user('julie');
select lives_ok($$ select public.extend_clarification(pg_temp.fid('q2'), now() + interval '2 days', 'Délai accordé (test).') $$, 'the president gives more time');
select is(pg_temp.n($$ select jsonb_array_length(extensions) from public.recruitment_clarifications where id = (select id from fx where k = 'q2') $$), 1,
  'the extension is recorded next to the original deadline');
select pg_temp.as_user('c3', 'aal1');
select is(public.answer_clarification(pg_temp.fid('q2'), 'Réponse dans le nouveau délai.') ->> 'status', 'answered', 'then the answer goes through');

-- =============================================================================
-- 9. Decisions and the offer (§121)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('d_c2', public.propose_recruitment_decision(pg_temp.fid('app_c2'), 'offer',
                     'Justification interne fictive.')) $$, 'the president proposes to take c2');
select throws_ok($$ select public.propose_recruitment_decision(pg_temp.fid('app_c2'), 'reject') $$, 'P0001', 'decision_pending',
  'no second, contradictory decision while one is pending');
select pg_temp.as_user('c2', 'aal1');
select ok(public.my_application(pg_temp.fid('app_c2')) -> 'outcome' = 'null'::jsonb, 'a proposal never reaches the candidate');
select ok(public.my_application(pg_temp.fid('app_c2'))::text !~ 'Justification interne', 'nor its reasons');
select pg_temp.as_user('hugo');
select throws_ok($$ select public.approve_recruitment_decision(pg_temp.fid('d_c2')) $$, 'P0001', 'application_not_found',
  'a reviewer cannot approve');
select pg_temp.as_user('julie', 'aal1');
select throws_ok($$ select public.approve_recruitment_decision(pg_temp.fid('d_c2')) $$, 'P0001', 'mfa_required', 'approving needs the second factor');
select pg_temp.as_user('julie');
select is(public.approve_recruitment_decision(pg_temp.fid('d_c2')) ->> 'status', 'proposed',
  'the president''s approval alone is not enough under this rule');
select lives_ok($$ select public.update_recruitment_member(pg_temp.fid('m_lucas2'), 'manager',
                     array['view', 'documents', 'review', 'view_team', 'shortlist', 'interviews', 'propose', 'approve', 'release'],
                     'campaign', null, now() + interval '3 months') $$, 'Lucas becomes a campaign manager (within Julie''s own powers)');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'), 'reviewer',
                     array['view', 'export'], 'campaign', null, now() + interval '1 month') $$, 'P0001', 'insufficient_permission',
  'without the committee power, no appointment');
select is(public.approve_recruitment_decision(pg_temp.fid('d_c2')) ->> 'status', 'finalized', 'Lucas''s approval completes it: finalized');
select is((pg_temp.decision('app_c2')).status, 'finalized', 'the decision is final for the team');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c2')
                        and kind = 'recruitment_offer' $$), 0, 'and the candidate has not been told');
select is((public.release_recruitment_decisions(array[pg_temp.fid('d_c2')], now() + interval '7 days') ->> 'released')::integer, 1,
  'Lucas releases it');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c2')
                        and kind = 'recruitment_offer' $$), 1, 'the candidate gets the offer');
select pg_temp.as_user('c2', 'aal1');
select is(public.my_application(pg_temp.fid('app_c2')) -> 'application' -> 'stage' ->> 'key', 'offer', 'the page shows the offer');
select is(public.respond_to_recruitment_offer((pg_temp.offer('app_c2')).id, true) ->> 'status', 'accepted', 'c2 accepts');
select is(public.respond_to_recruitment_offer((pg_temp.offer('app_c2')).id, true) ->> 'already', 'true', 'accepting twice changes nothing');
select throws_ok($$ select public.respond_to_recruitment_offer((pg_temp.offer('app_c2')).id, false) $$, 'P0001', 'offer_not_pending',
  'nor can an answer be swapped afterwards');
select is(pg_temp.n($$ select count(*)::integer from public.memberships where user_id = (select id from fx where k = 'c2') $$), 0,
  'accepting made c2 a member of nothing');
select is(pg_temp.n($$ select count(*)::integer from public.position_assignments where user_id = (select id from fx where k = 'c2') $$), 0,
  'and gave no position, no permission');

select pg_temp.as_user('julie');
select throws_ok($$ select public.start_recruitment_onboarding((pg_temp.offer('app_c2')).id, pg_temp.fid('presidence_fin'), now() + interval '6 months') $$,
  'P0001', 'position_protected', 'onboarding never hands out a presidency');
select lives_ok($$ insert into fx (k, id) values ('inv_c2', public.start_recruitment_onboarding((pg_temp.offer('app_c2')).id)) $$,
  'the president sends the ordinary Phase 4 invitation');
select is(pg_temp.n($$ select count(*)::integer from public.organization_invitations where id = (select id from fx where k = 'inv_c2')
                        and status = 'pending' and position_id is null $$), 1, 'a pending invitation, no position');
select is(pg_temp.n($$ select count(*)::integer from public.memberships where user_id = (select id from fx where k = 'c2') $$), 0,
  'c2 still has to accept it');
select is(pg_temp.n($$ select count(*)::integer from public.governance_audit_events
                        where action in ('recruitment_decision_proposed', 'recruitment_decision_approved', 'recruitment_decision_finalized',
                                         'recruitment_decision_released', 'recruitment_offer_accepted', 'membership_onboarding_initiated')
                          and (resource_id = (select id from fx where k = 'app_c2') or details ->> 'application_id' = (select id::text from fx where k = 'app_c2')
                               or resource_id = (select id from fx where k = 'inv_c2'))
                          and details::text !~ 'offer"|Fictive' $$), 6, 'every material step is in the audit, without the outcome or the person');

-- Capacity and the review requirement: c1 for the same single Trésorerie place.
select lives_ok($$ insert into fx (k, id) values ('d_c1', public.propose_recruitment_decision(pg_temp.fid('app_c1'), 'offer')) $$,
  'an offer for c1 is proposed too');
select pg_temp.as_user('lucas');
select is(public.approve_recruitment_decision(pg_temp.fid('d_c1')) ->> 'status', 'proposed', 'Lucas approves');
select pg_temp.as_user('julie');
select throws_ok($$ select public.approve_recruitment_decision(pg_temp.fid('d_c1')) $$, 'P0001', 'reviews_incomplete',
  'c1 has one review of the two required: no silent decision');
select throws_ok($$ select public.approve_recruitment_decision(pg_temp.fid('d_c1'), 'Entretien très clair, avis suffisant (test).') $$,
  'P0001', 'capacity_reached', 'the only place is taken: no silent overflow');
select is(public.approve_recruitment_decision(pg_temp.fid('d_c1'), 'Entretien très clair, avis suffisant (test).',
            'Deuxième trésorier·e adjoint·e voté·e par le bureau (test).') ->> 'status', 'finalized',
  'with both written reasons, the president finalizes');
select is((pg_temp.decision('app_c1')).capacity_override_reason, 'Deuxième trésorier·e adjoint·e voté·e par le bureau (test).',
  'the exception is kept with the decision');
select is((public.release_recruitment_decisions(array[pg_temp.fid('d_c1')], now() + interval '3 hours') ->> 'released')::integer, 1,
  'and releases it with a deadline');
reset role;
update public.recruitment_offers set expires_at = now() - interval '1 minute' where id = (pg_temp.offer('app_c1')).id;
set local role authenticated;
select pg_temp.as_user('c1', 'aal1');
select throws_ok($$ select public.respond_to_recruitment_offer((pg_temp.offer('app_c1')).id, true) $$, 'P0001', 'offer_expired',
  'an expired offer cannot be accepted');
reset role;
select is((private.run_recruitment_review_jobs() ->> 'expired')::integer, 1, 'the job marks it expired');
select is((pg_temp.offer('app_c1')).status, 'expired', 'for good');
set local role authenticated;

-- =============================================================================
-- 10. Refusal, released deliberately (§122)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ select public.set_recruitment_review_policy(pg_temp.fid('fin'), 1, 'single') $$, 'one review, one approver now');
select pg_temp.as_user('hugo');
select lives_ok($$ select public.save_recruitment_review(pg_temp.fid('app_c3'), null, '{"motivation": 1, "experience": 2}'::jsonb, 'reject',
                     'Avis négatif fictif.') $$, 'Hugo recommends a refusal');
select lives_ok($$ select public.submit_recruitment_review(pg_temp.review_id('app_c3', 'hugo'), pg_temp.review_version(pg_temp.review_id('app_c3', 'hugo'))) $$,
  'and submits it');
select pg_temp.as_user('c3', 'aal1');
select isnt(public.my_application(pg_temp.fid('app_c3')) -> 'application' -> 'stage' ->> 'key', 'not_selected',
  'a low score is not a refusal');
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('d_c3', public.propose_recruitment_decision(pg_temp.fid('app_c3'), 'reject', 'Raison interne fictive.')) $$,
  'the president proposes to decline c3');
select is(public.approve_recruitment_decision(pg_temp.fid('d_c3')) ->> 'status', 'finalized', 'and finalizes it (one approver)');
select pg_temp.as_user('c3', 'aal1');
select isnt(public.my_application(pg_temp.fid('app_c3')) -> 'application' -> 'stage' ->> 'key', 'not_selected', 'still not visible');
select pg_temp.as_user('julie');
select lives_ok($$ select public.save_recruitment_template(pg_temp.fid('fin'), 'rejection', 'Bonjour {prenom}, merci pour ta candidature au poste {poste}.') $$,
  'a refusal message with allowed placeholders');
select throws_ok($$ select public.save_recruitment_template(pg_temp.fid('fin'), 'rejection', 'Bonjour {note_interne}') $$, 'P0001',
  'template_variable_unknown', 'an unknown placeholder is refused');
select is((public.release_recruitment_decisions(array[pg_temp.fid('d_c3')]) ->> 'released')::integer, 1, 'the refusal is released');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c3')
                        and kind = 'recruitment_rejected' and payload ->> 'message' = 'Bonjour Personne, merci pour ta candidature au poste Communication (exemple).'
                        and payload::text !~ 'Raison interne|Avis négatif' $$), 1,
  'the candidate gets the message, with nothing internal');
select pg_temp.as_user('c3', 'aal1');
select is(public.my_application(pg_temp.fid('app_c3')) -> 'application' -> 'stage' ->> 'key', 'not_selected', 'now the page says it');
select ok(public.my_application(pg_temp.fid('app_c3'))::text !~ 'Raison interne|Avis négatif|Commentaire interne', 'and nothing internal');

-- =============================================================================
-- 11. Withdrawal during the process (§108)
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ select public.invite_to_interview(array[pg_temp.fid('app_c5')]) $$, 'c5 is invited');
select lives_ok($$ select public.request_clarification(pg_temp.fid('app_c5'), 'Question fictive pour c5 ?') $$, 'and asked a question');
select lives_ok($$ select public.propose_recruitment_decision(pg_temp.fid('app_c5'), 'waitlist') $$, 'and proposed for the waiting list');
select lives_ok($$ select public.assign_recruitment_reviews(pg_temp.fid('fin'), array[pg_temp.fid('app_c5')], array[pg_temp.fid('m_hugo')]) $$,
  'Hugo is assigned to it');
select pg_temp.as_user('c5', 'aal1');
select is(public.withdraw_application(pg_temp.fid('app_c5'), 'Retrait fictif.') ->> 'status', 'withdrawn', 'c5 withdraws');
select is(pg_temp.n($$ select count(*)::integer from public.recruitment_interviews where application_id = (select id from fx where k = 'app_c5')
                        and status = 'cancelled' $$), 1, 'the interview is cancelled');
select is(pg_temp.n($$ select count(*)::integer from public.recruitment_clarifications where application_id = (select id from fx where k = 'app_c5')
                        and status = 'cancelled' $$), 1, 'the question too');
select is((pg_temp.decision('app_c5')).status, 'cancelled', 'the pending decision is void');
select is(pg_temp.n($$ select count(*)::integer from public.notification_outbox where application_id = (select id from fx where k = 'app_c5')
                        and kind = 'recruitment_candidate_withdrew' and recipient_id = (select id from fx where k = 'hugo') $$), 1,
  'the assigned reviewer is told');
select pg_temp.as_user('julie');
select throws_ok($$ select public.propose_recruitment_decision(pg_temp.fid('app_c5'), 'offer') $$, 'P0001', 'application_withdrawn',
  'no decision on a withdrawn application');
select ok(public.recruitment_application(pg_temp.fid('app_c5')) -> 'answers' = 'null'::jsonb, 'its content is no longer shown to the team');

-- =============================================================================
-- 12. Two associations (§123) and the institution
-- =============================================================================

select pg_temp.as_user('emma');
select lives_ok($$ insert into fx (k, id) values ('m_paul', public.appoint_recruitment_member(pg_temp.fid('spo'), pg_temp.membership('sports', 'paul'),
                     'reviewer', array['view', 'review', 'documents'], 'campaign', null, now() + interval '2 months')) $$,
  'Emma appoints Paul to Sports'' committee');
select throws_ok($$ select public.approve_recruitment_decision(pg_temp.fid('d_c1')) $$, 'P0001', 'application_not_found',
  'Sports'' manager cannot approve a Finance decision');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'), 'reviewer',
                     array['view'], 'campaign', null, now() + interval '1 month') $$, 'P0001', 'insufficient_permission',
  'nor sit anyone on Finance''s committee');
select pg_temp.as_user('paul');
select is(public.recruitment_application(pg_temp.fid('app_nina')) -> 'answers' ->> 'motivation', 'Candidature fictive de Nina.',
  'Paul reads Sports'' application');
select throws_ok($$ select public.recruitment_document(pg_temp.fid('app_c1_cv')) $$, 'P0001', 'document_not_found', 'Sports'' reviewer cannot read Finance''s CVs');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c3')) $$, 'P0001', 'application_not_found', 'nor its answers');
select pg_temp.as_user('julie');
select throws_ok($$ select public.create_interview_slots(pg_temp.fid('spo'), null, array[now() + interval '5 days'], 30, 'phone') $$,
  'P0001', 'insufficient_permission', 'Finance''s president cannot schedule Sports interviews');
select is((public.invite_to_interview(array[pg_temp.fid('app_nina')]) ->> 'invited')::integer, 0, 'nor invite its candidates');

select pg_temp.as_user('garance');
select throws_ok($$ select public.recruitment_committee(pg_temp.fid('fin')) $$, 'P0001', 'insufficient_permission',
  'the guardian reads no assessment');
select throws_ok($$ select public.privacy_candidate_report('revue1@student.example.test', 'Demande écrite (test).') $$, 'P0001', 'insufficient_permission',
  'nor runs a data-rights report');
reset role;
set local role anon;
select ok(jsonb_array_length(public.public_recruitment_campaigns()) > 0, 'public recruitment pages are unchanged');
reset role;
set local role authenticated;

-- =============================================================================
-- 13. Export, next year's officers, data rights
-- =============================================================================

select pg_temp.as_user('hugo');
select throws_ok($$ select public.recruitment_export(pg_temp.fid('fin')) $$, 'P0001', 'insufficient_permission',
  'a reviewer without the export power exports nothing');
select pg_temp.as_user('julie');
select is(jsonb_array_length(public.recruitment_export(pg_temp.fid('fin')) -> 'rows'), 5, 'the president exports the five sent applications');
select ok(public.recruitment_export(pg_temp.fid('fin'))::text !~ '(Motivation fictive|Note privée|CV fictif|@student)',
  'with essential fields only: no answer, no note, no file, no address');
select is((select count(*)::integer from public.governance_audit_events where action = 'recruitment_applications_exported'), 2,
  'each export is in the audit');

-- Next year: the campaign is archived; a new officer holds the reading key from then on.
-- (Archived just before this transaction began: after Julie took office, before c6 does.)
reset role;
update public.recruitment_campaigns set archived_at = now() - interval '1 millisecond' where id = pg_temp.fid('fin');
set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('pos_next', public.create_position(pg_temp.fid('finance'), 'Bureau 2028 (test)',
                    array['recruitment.applications.view'])) $$, 'a position that reads applications is created');
select lives_ok($$ select public.assign_position(pg_temp.membership('finance', 'c6'), pg_temp.fid('pos_next'), now() + interval '1 year') $$,
  'and given to c6 after the campaign was archived');
select pg_temp.as_user('c6');
select throws_ok($$ select public.recruitment_application(pg_temp.fid('app_c1')) $$, 'P0001', 'application_not_found',
  'next year''s officer does not inherit last year''s candidates');
select pg_temp.as_user('julie');
select is(public.recruitment_application(pg_temp.fid('app_c1')) -> 'application' ->> 'reference', (pg_temp.app('app_c1')).reference,
  'the officers of that year still can');
select throws_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'), 'reader', array['view'],
                     'campaign', null, now() + interval '1 month') $$, 'P0001', 'purpose_required', 'historic access needs a written purpose');
select lives_ok($$ select public.appoint_recruitment_member(pg_temp.fid('fin'), pg_temp.membership('finance', 'c6'), 'reader', array['view'],
                     'campaign', null, now() + interval '1 month', 'Contestation d''un résultat (test).') $$, 'given one, it is granted');
select pg_temp.as_user('c6');
select is(public.recruitment_application(pg_temp.fid('app_c1')) -> 'application' ->> 'reference', (pg_temp.app('app_c1')).reference,
  'and works, for that campaign only');

reset role;
select lives_ok($$ select private.provision_privacy_officer(pg_temp.fid('lea'), now() + interval '1 year', 'Désignation fictive (test).') $$,
  'the project owner provisions a privacy officer');
set local role authenticated;
select pg_temp.as_user('lea', 'aal1');
select throws_ok($$ select public.privacy_candidate_report('revue1@student.example.test', 'Demande écrite (test).') $$, 'P0001', 'mfa_required',
  'a data-rights report needs the second factor');
select pg_temp.as_user('lea');
select ok(public.privacy_candidate_report('revue1@student.example.test', 'Demande d''accès écrite (test).')::text ~ 'Note privée fictive de Lucas',
  'the officer sees everything held, internal assessments included, to decide what to disclose');
select is((select count(*)::integer from public.governance_audit_events where action = 'privacy_report_generated' and subject_user_id = pg_temp.fid('c1')), 1,
  'the report is in the audit, about the person');
select lives_ok($$ select public.privacy_erase_application(pg_temp.fid('app_c5'), 'Demande d''effacement acceptée (test).') $$,
  'an erasure request granted');
select is(pg_temp.n($$ select count(*)::integer from public.recruitment_interviews where application_id = (select id from fx where k = 'app_c5') $$), 0,
  'erases the application with everything about it');
select ok(pg_temp.n($$ select count(*)::integer from private.storage_cleanup_queue q
                       where q.object_path like 'applications/' || (select id from fx where k = 'app_c5') || '/%' $$) > 0,
  'its files are queued for deletion');

select * from finish();

rollback;
