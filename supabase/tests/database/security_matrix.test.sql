-- Phase 15 — the cross-user attack matrix (brief §109, §25–§30, §42), at the
-- database, where the site's requests end up: every row is attempted
-- directly (RPC or table), as the person, with a second-factor session so a
-- denial never depends on a missing factor. Each refusal must be an
-- authorization refusal (or "not found", which is how the functions avoid
-- telling whether something exists); anything else fails and shows the actual
-- error. Positive controls prove the fixtures work, so a denial cannot pass
-- because the data is missing. Fictional people only.
begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

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
  ('hugo', 'a0000000-0000-4000-8000-000000000008');
insert into fx (k, id)
select 'fin', c.id from public.recruitment_campaigns c
 where c.title = 'Recrutement 2027 (exemple)' and c.organization_id = (select id from fx where k = 'finance');
insert into fx (k, id) select 'treso', p.id from public.recruitment_positions p
 where p.title = 'Trésorerie (exemple)' and p.campaign_id = (select id from fx where k = 'fin');
insert into fx (k, id) select 'draft_post', p.id from public.posts p
 where p.organization_id = (select id from fx where k = 'finance') and p.publication = 'unpublished' order by p.created_at limit 1;
insert into fx (k, id) select 'sports_post', p.id from public.posts p
 where p.organization_id = (select id from fx where k = 'sports') and p.publication = 'published' order by p.created_at limit 1;
insert into fx (k, id) select 'workshop', e.id from public.events e where e.title = 'Atelier finance (exemple)';
insert into fx (k, id) select 'presidence_fin', p.id from public.positions p
 where p.organization_id = (select id from fx where k = 'finance') and p.office = 'association_president';

-- Four fictional students: m1 applies to Finance with a CV, m2 is any student,
-- m3 a plain Finance member, m4 a Finance member appointed reviewer then revoked.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'matrice' || n || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 4) as n;
update public.profiles set first_name = 'Matrice', last_name = 'Fictive ' || right(id::text, 1), onboarding_completed_at = now()
 where id::text like 'e0000000-0000-4000-8000-00000000000%';
insert into fx (k, id) select 'm' || n, ('e0000000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1, 4) as n;
insert into public.memberships (organization_id, user_id, status)
select (select id from fx where k = 'finance'), id, 'active' from fx where k in ('m3', 'm4');

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;

-- Does the statement give back anything (a row whose first column is not null)? Errors count as nothing.
create function pg_temp.reads(p_sql text) returns boolean language plpgsql as $f$
declare
  v_n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') as x (v) where x.v is not null' into v_n;
  return v_n > 0;
exception when others then
  return false;
end $f$;

-- 'denied' when the statement is refused as an authorization matter; otherwise what happened.
create function pg_temp.attempt(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ALLOWED';
exception when others then
  if sqlstate = '42501'
     or sqlerrm ~ '^(insufficient_permission|not_authenticated|mfa_required|[a-z_]+_not_found)$' then
    return 'denied';
  end if;
  return sqlstate || ' ' || sqlerrm;
end $f$;
grant execute on function pg_temp.as_user(text, text), pg_temp.fid(text), pg_temp.reads(text), pg_temp.attempt(text)
  to anon, authenticated, service_role;

-- m1 applies to Trésorerie with a fictional CV (the Finance form asks for one).
set local role authenticated;
select pg_temp.as_user('m1', 'aal1');
do $d$
declare
  v uuid;
  v_doc jsonb;
begin
  v := (public.start_application(pg_temp.fid('treso')) ->> 'application_id')::uuid;
  perform public.save_application_answers(v, 1, '{"motivation": "Motivation fictive (matrice).", "hours": 4, "budget": true}');
  v_doc := public.reserve_application_document(v, 'cv', 'CV fictif.pdf', 'application/pdf', 2000);
  insert into storage.objects (bucket_id, name) values ('recruitment-documents', v_doc ->> 'object_path');
  perform public.confirm_application_document((v_doc ->> 'document_id')::uuid);
  perform public.submit_application(v, (select version from public.applications where id = v), true);
  insert into fx (k, id, v) values ('app', v, null), ('cv', (v_doc ->> 'document_id')::uuid, v_doc ->> 'object_path');
  perform public.submit_privacy_request('access', '');
end $d$;
reset role;
insert into fx (k, id) select 'privacy_req', id from public.privacy_requests where requester_id = pg_temp.fid('m1');
insert into fx (k, id) select 'notif', null::uuid;
update fx set v = (select n.id::text from public.notifications n where n.recipient_id = pg_temp.fid('m1') order by n.id limit 1) where k = 'notif';
insert into public.saved_items (user_id, kind, organization_id) values (pg_temp.fid('m1'), 'association', pg_temp.fid('finance'));

-- Julie (Finance president) appoints m4 as a reviewer of Trésorerie, with document access.
set local role authenticated;
select pg_temp.as_user('julie', 'aal2');
insert into fx (k, id) values ('m4_seat', public.appoint_recruitment_member(pg_temp.fid('fin'),
  (select id from public.memberships where organization_id = pg_temp.fid('finance') and user_id = pg_temp.fid('m4')),
  'reviewer', array['view', 'review', 'documents'], 'positions', array[pg_temp.fid('treso')], now() + interval '3 months'));

-- =============================================================================
-- Positive controls: the fixtures work (otherwise every denial below is void)
-- =============================================================================
select ok(pg_temp.fid('app') is not null and pg_temp.fid('cv') is not null and pg_temp.fid('draft_post') is not null
      and pg_temp.fid('sports_post') is not null and pg_temp.fid('workshop') is not null and pg_temp.fid('privacy_req') is not null,
  'fixtures: an application with a CV, a draft, a post, an event, a privacy request');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'ALLOWED',
  'control: the Finance president reads the Finance application');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'ALLOWED', 'control: and opens its CV');
select is(pg_temp.attempt($$ select * from public.event_attendees(pg_temp.fid('workshop'), null, null, 0, 50) $$), 'ALLOWED',
  'control: and the workshop participants');
select pg_temp.as_user('m4', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'ALLOWED', 'control: the assigned reviewer reads it');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'ALLOWED', 'control: and opens the CV');
select pg_temp.as_user('m1', 'aal1');
select is(pg_temp.attempt($$ select public.my_application(pg_temp.fid('app')) $$), 'ALLOWED', 'control: the candidate reads their own application');
select is(pg_temp.attempt($$ select public.my_application_document(pg_temp.fid('cv')) $$), 'ALLOWED', 'control: and their own CV');
select ok(pg_temp.reads($$ select id from public.saved_items $$), 'control: and their own saved items');

-- =============================================================================
-- Anonymous visitor
-- =============================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'anonymous → an application: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'anonymous → a CV: denied');
select is(pg_temp.attempt($$ select public.post_preview(pg_temp.fid('draft_post'), null) $$), 'denied', 'anonymous → a draft article: denied');
select ok(not pg_temp.reads($$ select id from public.applications $$), 'anonymous → the applications table: nothing');
select ok(not pg_temp.reads($$ select id from public.posts $$), 'anonymous → the posts table (drafts included): nothing');
select ok(not pg_temp.reads($$ select id from storage.objects where bucket_id = 'recruitment-documents' $$),
  'anonymous → private Storage objects: nothing listed');
select is(pg_temp.attempt($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', 'applications/' || pg_temp.fid('app') || '/' || gen_random_uuid()) $$),
  'denied', 'anonymous → upload into the CV bucket: denied');
select is(pg_temp.attempt($$ select public.claim_storage_cleanup(100) $$), 'denied', 'anonymous → a maintenance worker function: denied');

-- =============================================================================
-- Another student (m2)
-- =============================================================================
reset role;
set local role authenticated;
select pg_temp.as_user('m2', 'aal2');
select is(pg_temp.attempt($$ select public.my_application(pg_temp.fid('app')) $$), 'denied', 'student → another student''s application: denied');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'student → the reviewer view of it: denied');
select is(pg_temp.attempt($$ select public.my_application_document(pg_temp.fid('cv')) $$), 'denied', 'student → another candidate''s CV: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'student → the CV through the reviewer route: denied');
select ok(not pg_temp.reads($$ select id from storage.objects where bucket_id = 'recruitment-documents' $$), 'student → CV objects in Storage: nothing listed');
select is(pg_temp.attempt(format($$ insert into storage.objects (bucket_id, name) values ('recruitment-documents', 'applications/%s/%s') $$,
                                  pg_temp.fid('app'), gen_random_uuid())),
  'denied', 'student → a file into someone else''s application folder: denied');
select ok(not pg_temp.reads($$ select id from public.recruitment_reviews $$), 'student → reviewer scores and notes: nothing');
select ok(not pg_temp.reads($$ select id from public.application_comments $$), 'student → reviewer comments: nothing');
select ok(not pg_temp.reads(format($$ select id from public.notifications where recipient_id = %L $$, pg_temp.fid('m1'))),
  'student → another user''s notifications: nothing');
select is(pg_temp.attempt(format($$ select public.open_notification(%s) $$, (select v from fx where k = 'notif'))), 'denied',
  'student → opening another user''s notification: denied');
select ok(not pg_temp.reads(format($$ select id from public.saved_items where user_id = %L $$, pg_temp.fid('m1'))),
  'student → another user''s saved items: nothing');
select is(pg_temp.attempt($$ select public.privacy_request_detail(pg_temp.fid('privacy_req')) $$), 'denied',
  'student → someone''s privacy request: denied');
select ok(not pg_temp.reads($$ select id from public.privacy_requests $$), 'student → the privacy requests table: nothing');
select is(pg_temp.attempt($$ select public.create_organization('Asso pirate (exemple)', 'asso-pirate', 'culture', 'rose', null, null) $$), 'denied',
  'student → creating an association: denied');
select is(pg_temp.attempt($$ select public.claim_storage_cleanup(100) $$), 'denied', 'student → a maintenance worker function: denied');

-- An ordinary member cannot give themself an office (and nothing is written).
select pg_temp.as_user('m3', 'aal2');
select is(pg_temp.attempt(format($$ select public.assign_position(%L, %L, now() + interval '1 year', null) $$,
                                  (select id from public.memberships where organization_id = pg_temp.fid('finance') and user_id = pg_temp.fid('m3')),
                                  pg_temp.fid('presidence_fin'))),
  'denied', 'member → appointing themself president: denied');
reset role;
select is((select count(*)::integer from public.position_assignments pa join public.memberships m on m.id = pa.membership_id
            where m.user_id = pg_temp.fid('m3')), 0, 'and no partial assignment was written');
set local role authenticated;
select pg_temp.as_user('m3', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied',
  'unassigned Finance member → the Finance application: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'unassigned Finance member → the CV: denied');

-- =============================================================================
-- Another association: Sports president, Finance communications officer
-- =============================================================================
select pg_temp.as_user('emma', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'Sports president → a Finance application: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'Sports president → a Finance CV: denied');
select is(pg_temp.attempt($$ select * from public.recruitment_application_list(pg_temp.fid('fin'), '{}'::jsonb, 50, 0) $$), 'denied',
  'Sports president → the Finance applicant list: denied');
select is(pg_temp.attempt($$ select public.post_preview(pg_temp.fid('draft_post'), null) $$), 'denied', 'Sports president → a Finance draft: denied');
select is(pg_temp.attempt($$ select * from public.event_attendees(pg_temp.fid('workshop'), null, null, 0, 50) $$), 'denied',
  'Sports president → Finance event participants: denied');
select pg_temp.as_user('lucas', 'aal2');
select is(pg_temp.attempt(format($$ select public.review_post_revision(%L, %L, 'approve', null) $$, pg_temp.fid('sports_post'),
                                  (select working_revision_id from public.posts where id = pg_temp.fid('sports_post')))),
  'denied', 'Finance communications → approving a Sports post: denied');
select is(pg_temp.attempt($$ select public.notification_broadcast_options(pg_temp.fid('sports')) $$), 'denied',
  'Finance communications → messaging Sports members: denied');
select is(pg_temp.attempt($$ select public.notification_broadcast_options(pg_temp.fid('bde')) $$), 'denied',
  'Finance communications → a campus-wide message: denied');

-- =============================================================================
-- BDE president and vice-president: no routine access to association recruitment
-- =============================================================================
select pg_temp.as_user('alice', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'BDE president → applicant answers: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'BDE president → an association''s CV: denied');
select is(pg_temp.attempt($$ select * from public.recruitment_application_list(pg_temp.fid('fin'), '{}'::jsonb, 50, 0) $$), 'denied',
  'BDE president → an association''s applicant list: denied');
select is(pg_temp.attempt($$ select * from public.event_attendees(pg_temp.fid('workshop'), null, null, 0, 50) $$), 'denied',
  'BDE president → an association''s event participants: denied');
select is(pg_temp.attempt($$ select public.privacy_requests_queue() $$), 'denied', 'BDE president → the privacy requests: denied');
select pg_temp.as_user('marc', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_interview_board(pg_temp.fid('fin')) $$), 'denied',
  'BDE vice-president → an association''s interviews and notes: denied');
select is(pg_temp.attempt($$ select public.recruitment_export(pg_temp.fid('fin'), null) $$), 'denied',
  'BDE vice-president → an association''s applicant export: denied');

-- =============================================================================
-- The guardian (School Responsible): continuity only
-- =============================================================================
select pg_temp.as_user('garance', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'guardian → applicant answers: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'guardian → a CV: denied');
select is(pg_temp.attempt($$ select public.recruitment_export(pg_temp.fid('fin'), null) $$), 'denied', 'guardian → a raw applicant export: denied');
select is(pg_temp.attempt($$ select * from public.event_attendees(pg_temp.fid('workshop'), null, null, 0, 50) $$), 'denied',
  'guardian → private event participants: denied');
select is(pg_temp.attempt(format($$ select public.review_post_revision(%L, %L, 'approve', null) $$, pg_temp.fid('sports_post'),
                                  (select working_revision_id from public.posts where id = pg_temp.fid('sports_post')))),
  'denied', 'guardian → publishing association content: denied');
select is(pg_temp.attempt($$ select public.privacy_requests_queue() $$), 'denied', 'guardian → the privacy requests: denied');
select throws_ok($$ select public.propose_bde_recovery('bde_president', 'garance.garante@comptes.example.test', 'Essai d''auto-désignation (test).', now() + interval '1 year') $$,
  'P0001', 'office_occupied', 'guardian → recovery while the BDE presidency is held: refused (vacant offices: governance.test.sql, candidate_not_allowed)');

-- =============================================================================
-- Expired officer, revoked reviewer: the date and the revocation count now
-- =============================================================================
select pg_temp.as_user('hugo', 'aal2');
select is(pg_temp.attempt($$ select public.create_position(pg_temp.fid('finance'), 'Poste pirate (exemple)', array['members.invite'], null, null) $$),
  'denied', 'officer whose mandate ended → changing the association: denied');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied', 'officer whose mandate ended → applications: denied');
select pg_temp.as_user('julie', 'aal2');
select is(pg_temp.attempt($$ select public.revoke_recruitment_member(pg_temp.fid('m4_seat'), 'Fin de mission (test).') $$), 'ALLOWED',
  'the Finance president revokes the reviewer');
select pg_temp.as_user('m4', 'aal2');
select is(pg_temp.attempt($$ select public.recruitment_application(pg_temp.fid('app')) $$), 'denied',
  'revoked reviewer, same session → the application again: denied');
select is(pg_temp.attempt($$ select public.recruitment_document(pg_temp.fid('cv')) $$), 'denied', 'revoked reviewer → the CV again: denied');

-- =============================================================================
-- Statistics hold no candidate; workers and buckets stay closed
-- =============================================================================
select pg_temp.as_user('julie', 'aal2');
select ok(coalesce(public.organization_analytics(pg_temp.fid('finance'), current_date - 30, current_date, null, null)::text, '') !~* 'matrice|e0000000-0000-4000-8000-000000000001',
  'Finance statistics → no candidate name, address or id in them');
reset role;
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('claim_storage_cleanup', 'complete_storage_cleanup')
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 0,
  'the Storage worker functions are closed to visitors and students');
select is((select count(*)::integer from storage.buckets where public), 0, 'no Storage bucket is public');

select * from finish();
rollback;
