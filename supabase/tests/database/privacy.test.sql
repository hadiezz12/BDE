-- Phase 14 · Privacy: who reads and handles data-subject requests (§103,
-- §109), a full access request (§105), the self-service export, erasure
-- across modules with Storage, holds and responsibilities (§106), restore
-- reconciliation (§111), retention with approval notes, holds and the
-- append-only logs (§107), a personal-data breach simulation (§110), the
-- privacy notice versions, and the security posture of the whole schema
-- (RLS on every table, no table write for API roles, definer functions
-- pinned, private functions closed, buckets private). Runs on top of
-- supabase/seed.sql: Julie presides Finance, Emma Sports, Alice and Marc
-- lead the BDE, Garance is the guardian, Léa is made privacy officer here,
-- Nina is a student. Six fictional students are created. Everything is
-- rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(171);

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
  ('emma', 'a0000000-0000-4000-8000-000000000006'),
  ('nina', 'a0000000-0000-4000-8000-000000000007'),
  ('lea', 'a0000000-0000-4000-8000-00000000000b');
insert into fx (k, id) values
  ('pos_events', (select ps.id from public.recruitment_positions ps join public.recruitment_campaigns c on c.id = ps.campaign_id
                   where c.organization_id = (select id from fx where k = 'sports') and c.title = 'Recrutement 2027 (exemple)'
                     and ps.title = 'Événements (exemple)'));

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'vieprivee-' || n || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 6) as n;
update public.profiles p set first_name = 'Étudiant' || substr(u.email, 11, 1), last_name = 'Fictif', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'vieprivee-%@student.example.test';
insert into fx (k, id) select 's' || n, (select id from auth.users where email = 'vieprivee-' || n || '@student.example.test')
  from generate_series(1, 6) as n;

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;
create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;
grant execute on function pg_temp.fid(text) to anon, authenticated, service_role;

-- Léa becomes the privacy officer (as the project owner would).
select private.provision_privacy_officer(pg_temp.fid('lea'), now() + interval '1 year', 'Désignation fictive (test).');

-- =============================================================================
-- 1. Nobody reads the privacy tables directly (§109)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('nina');
select throws_ok($$ select * from public.privacy_requests $$, '42501', null, 'no direct read of requests');
select throws_ok($$ select * from public.privacy_request_artifacts $$, '42501', null, 'nor of exports');
select throws_ok($$ select * from public.retention_holds $$, '42501', null, 'nor of holds');
select throws_ok($$ select * from private.erasure_ledger $$, '42501', null, 'nor of the erasure ledger');
select throws_ok($$ insert into public.privacy_requests (kind, identity_status, due_at) values ('access', 'verified', now()) $$, '42501', null,
  'and no direct insert (a forged request)');
select throws_ok($$ select private.erase_person(pg_temp.fid('s1'), null, null, true) $$, '42501', null,
  'a student cannot run an erasure helper');
select throws_ok($$ select private.run_retention() $$, '42501', null, 'nor the global retention cleanup');
select throws_ok($$ select private.personal_data(pg_temp.fid('s1')) $$, '42501', null, 'nor read another person''s data through the helper');
set local role anon;
select throws_ok($$ select public.submit_privacy_request('access', null) $$, '42501', null, 'a visitor cannot file a request');
select lives_ok($$ select public.public_privacy_notice('fr') $$, 'but reads the privacy notice');
set local role authenticated;

-- =============================================================================
-- 2. An access request, from receipt to completion (§105)
-- =============================================================================

select pg_temp.as_user('s1', 'aal1');
select lives_ok($$ insert into fx (k, v) values ('r1', public.submit_privacy_request('access', null)::text) $$,
  'a student asks for their data from their account');
reset role;
update fx set id = (v::jsonb ->> 'id')::uuid where k = 'r1';
set local role authenticated;
select ok((select v::jsonb ->> 'reference' from fx where k = 'r1') ~ '^PR-[0-9]{6}$', 'the request has a reference');
select pg_temp.as_user('s1', 'aal1');
select throws_ok($$ select public.submit_privacy_request('access', null) $$, 'P0001', 'privacy_request_limit',
  'a second open request of the same kind waits for the first');
select throws_ok($$ select public.submit_privacy_request('objection', 'court') $$, 'P0001', 'privacy_request_invalid',
  'an objection says what it is about');
select is(jsonb_array_length(public.my_privacy_overview() -> 'requests'), 1, 'the requester sees their request');
select is(public.my_privacy_overview() -> 'requests' -> 0 -> 'events' -> 0 ->> 'action', 'received', 'with its history');

reset role;
select is((select identity_status from public.privacy_requests where id = pg_temp.fid('r1')), 'session',
  'identity: the signed-in session, recorded as such');
select ok((select due_at = private.paris_start_of(((received_at at time zone 'Europe/Paris')::date + interval '1 month')::date + 1)
             from public.privacy_requests where id = pg_temp.fid('r1')), 'due one calendar month after receipt');
select is(private.privacy_due_at('2027-01-31 10:00:00+01'), '2027-03-01 00:00:00+01'::timestamptz,
  'received 31 January: due by the end of 28 February (no 31 February)');
select is(private.privacy_due_at('2028-01-31 10:00:00+01'), '2028-03-01 00:00:00+01'::timestamptz, 'leap year: end of 29 February');
select is(private.privacy_due_at('2026-10-24 23:30:00+02'), '2026-11-25 00:00:00+01'::timestamptz,
  'across the change to winter time, still the end of the same date');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('lea') and kind = 'privacy_request_received'),
  'the privacy officer is told');
select ok(not exists (select 1 from public.notifications where kind = 'privacy_request_received'
                       and recipient_id in (pg_temp.fid('alice'), pg_temp.fid('marc'), pg_temp.fid('garance'), pg_temp.fid('julie'))),
  'nobody else: not the BDE, not the guardian, not an association');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('s1') and kind = 'privacy_request_updated'),
  'the requester gets an acknowledgment');
select is((select payload ->> 'reference' from public.notifications where recipient_id = pg_temp.fid('s1') and kind = 'privacy_request_updated'),
  (select reference from public.privacy_requests where id = pg_temp.fid('r1')), 'naming only the reference');

set local role authenticated;
select pg_temp.as_user('nina', 'aal2');
select is(jsonb_array_length(public.my_privacy_overview() -> 'requests'), 0, 'another student sees none of it');
select throws_ok($$ select public.privacy_requests_queue() $$, 'P0001', 'insufficient_permission', 'and has no queue');
select throws_ok($$ select public.withdraw_privacy_request(pg_temp.fid('r1')) $$, 'P0001', 'privacy_request_not_found',
  'nor can withdraw it');
select pg_temp.as_user('alice', 'aal2');
select throws_ok($$ select public.privacy_request_detail(pg_temp.fid('r1')) $$, 'P0001', 'insufficient_permission',
  'the BDE president is no privacy officer');
select pg_temp.as_user('garance', 'aal2');
select throws_ok($$ select public.privacy_requests_queue() $$, 'P0001', 'insufficient_permission', 'nor is the guardian');
select pg_temp.as_user('lea', 'aal1');
select throws_ok($$ select public.privacy_requests_queue() $$, 'P0001', 'mfa_required', 'the officer needs the second factor');
select pg_temp.as_user('lea', 'aal2');
select ok((select bool_or((r ->> 'id')::uuid = pg_temp.fid('r1')) from jsonb_array_elements(public.privacy_requests_queue() -> 'requests') r),
  'and then sees the request');
select is(public.privacy_request_detail(pg_temp.fid('r1')) -> 'requester' ->> 'email', 'vieprivee-1@student.example.test',
  'with the address needed to answer');
select throws_ok($$ select public.complete_privacy_request(pg_temp.fid('r1'), 'Terminé.') $$, 'P0001', 'privacy_request_closed',
  'nothing is completed before a decision');
select throws_ok($$ select public.prepare_privacy_export(pg_temp.fid('r1'), false) $$, 'P0001', 'privacy_request_invalid',
  'nor exported');
select throws_ok($$ select public.decide_privacy_request(pg_temp.fid('r1'), 'refused', 'non') $$, 'P0001', 'privacy_request_invalid',
  'a refusal is explained');
select lives_ok($$ select public.decide_privacy_request(pg_temp.fid('r1'), 'approved', null) $$, 'the officer approves');
select throws_ok($$ select public.complete_privacy_request(pg_temp.fid('r1'), 'Terminé.') $$, 'P0001', 'privacy_export_missing',
  'an access request is not complete without its export');
select lives_ok($$ insert into fx (k, v) values ('a1', public.prepare_privacy_export(pg_temp.fid('r1'), true)::text) $$,
  'the export is prepared, evaluations included without names');
reset role;
update fx set id = (v::jsonb ->> 'id')::uuid where k = 'a1';
select ok((select expires_at <= created_at + interval '14 days' and payload is not null from public.privacy_request_artifacts
            where id = pg_temp.fid('a1')), 'held 14 days, in the database (never a Storage link)');
set local role authenticated;

select pg_temp.as_user('nina', 'aal2');
select throws_ok($$ select public.privacy_artifact_payload(pg_temp.fid('a1')) $$, 'P0001', 'privacy_request_not_found',
  'another student cannot download it, even with its id');
select pg_temp.as_user('s1', 'aal1');
select is(public.privacy_artifact_payload(pg_temp.fid('a1')) -> 'profile' ->> 'first_name', 'Étudiant1', 'the requester downloads their data');
select ok(public.privacy_artifact_payload(pg_temp.fid('a1'))::text not like '%Étudiant2%', 'and nobody else''s');
select ok(public.privacy_artifact_payload(pg_temp.fid('a1')) ? 'assessments', 'with the assessments the officer decided to include');
reset role;
select is((select download_count from public.privacy_request_artifacts where id = pg_temp.fid('a1')), 3, 'every download is counted');
select ok(exists (select 1 from public.privacy_request_events where request_id = pg_temp.fid('r1') and action = 'export_downloaded'),
  'and recorded in the request''s history');
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select lives_ok($$ select public.complete_privacy_request(pg_temp.fid('r1'), 'Export remis.') $$, 'then the request is completed');
reset role;
select is((select status from public.privacy_requests where id = pg_temp.fid('r1')), 'completed', 'completed');
select ok(exists (select 1 from public.governance_audit_events where action = 'privacy_export_prepared' and subject_user_id = pg_temp.fid('s1')),
  'the export is in the audit (never its content)');
select ok((select details::text not like '%Étudiant1%' from public.governance_audit_events
            where action = 'privacy_export_prepared' and subject_user_id = pg_temp.fid('s1')), 'the audit line holds no name');

-- The export expires and is purged; a download after that is refused.
update public.privacy_request_artifacts set created_at = now() - interval '15 days', expires_at = now() - interval '1 day'
 where id = pg_temp.fid('a1');
select is((private.run_privacy_housekeeping() ->> 'exports_purged')::integer, 1, 'the housekeeping purges the expired export');
select ok((select payload is null and purged_at is not null from public.privacy_request_artifacts where id = pg_temp.fid('a1')),
  'its content is gone');
set local role authenticated;
select pg_temp.as_user('s1', 'aal1');
select throws_ok($$ select public.privacy_artifact_payload(pg_temp.fid('a1')) $$, 'P0001', 'privacy_export_expired', 'no download after expiry');

-- Extension: once, one or two months, within the first month, told to the requester.
select lives_ok($$ insert into fx (k, v) values ('r2', public.submit_privacy_request('rectification', 'Mon nom est mal écrit sur une candidature.')::text) $$,
  'a rectification request');
reset role;
update fx set id = (v::jsonb ->> 'id')::uuid where k = 'r2';
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.extend_privacy_request(pg_temp.fid('r2'), 3, 'Demande complexe à examiner.') $$, 'P0001',
  'privacy_request_invalid', 'never more than two more months');
select lives_ok($$ select public.extend_privacy_request(pg_temp.fid('r2'), 2, 'Plusieurs modules à vérifier avec l''asso.') $$,
  'extended by two months');
select throws_ok($$ select public.extend_privacy_request(pg_temp.fid('r2'), 1, 'Encore une fois, pour voir.') $$, 'P0001',
  'privacy_extension_unavailable', 'and only once');
reset role;
select ok((select extended_until > due_at + interval '58 days' and extended_until <= due_at + interval '2 months 1 day'
             and extension_notified_at is not null from public.privacy_requests where id = pg_temp.fid('r2')),
  'the new deadline and the date the requester was told');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('s1') and dedupe_key = 'privacy-request:' || pg_temp.fid('r2') || ':extended'),
  'the requester is told of the extension');
set local role authenticated;
select pg_temp.as_user('s1', 'aal1');
select lives_ok($$ select public.withdraw_privacy_request(pg_temp.fid('r2')) $$, 'the requester can still withdraw it');

-- =============================================================================
-- 3. The self-service export
-- =============================================================================

select pg_temp.as_user('s2', 'aal1');
select lives_ok($$ select public.save_item('association', pg_temp.fid('finance'), true) $$, 's2 saves an association');
select is(jsonb_array_length(public.my_personal_data() -> 'saved_items'), 1, 'and finds it in their own export');
select is(public.my_personal_data() -> 'profile' ->> 'first_name', 'Étudiant2', 'with their profile');
select ok(public.my_personal_data() ? 'not_included', 'saying what it does not contain, and how to ask for it');
select ok(public.my_personal_data()::text not like '%Étudiant1%', 'never another student''s data');
reset role;
select ok(exists (select 1 from public.governance_audit_events where action = 'personal_data_exported' and actor_user_id = pg_temp.fid('s2')),
  'each self-service export is recorded');
set local role authenticated;
select pg_temp.as_user('s2', 'aal1');
do $$ begin for i in 1 .. 6 loop perform public.my_personal_data(); end loop; end $$;
select throws_ok($$ select public.my_personal_data() $$, 'P0001', 'privacy_export_limit', 'ten a day at most');

-- =============================================================================
-- 4. Erasure across modules (§106, §46–§53)
-- =============================================================================

-- s2 also has a seat at a capped event (s3 waits behind), a draft application with a file, a photo, a follow.
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('ev', public.create_event(pg_temp.fid('finance'), 'Atelier vie privée (test)')) $$,
  'Finance creates an event with one seat');
select lives_ok($$ select public.save_event(pg_temp.fid('ev'), 1, jsonb_build_object(
    'summary', 'Événement fictif.', 'location_type', 'campus', 'venue_name', 'Salle fictive (test)',
    'starts_at', date_trunc('hour', now()) + interval '9 days', 'ends_at', date_trunc('hour', now()) + interval '9 days 2 hours',
    'registration_mode', 'internal', 'capacity', 1, 'waitlist_enabled', true)) $$, 'one seat, a waiting list');
select lives_ok($$ select public.publish_event(pg_temp.fid('ev')) $$, 'published');
select pg_temp.as_user('s2', 'aal1');
select lives_ok($$ select public.register_for_event(pg_temp.fid('ev')) $$, 's2 takes the seat');
select lives_ok($$ insert into fx (k, id) values ('app2', (public.start_application(pg_temp.fid('pos_events')) ->> 'application_id')::uuid) $$,
  's2 starts an application');
select lives_ok($$ select public.follow_organization(pg_temp.fid('sports'), true, null) $$, 'and follows Sports');
select pg_temp.as_user('s3', 'aal1');
select lives_ok($$ select public.register_for_event(pg_temp.fid('ev')) $$, 's3 waits for the seat');
reset role;
insert into fx (k, v) values ('doc_path', 'applications/' || pg_temp.fid('app2') || '/' || gen_random_uuid());
insert into public.application_documents (application_id, question_id, object_path, file_name, mime_type, size_bytes, status, confirmed_at)
values (pg_temp.fid('app2'), 'cv', (select v from fx where k = 'doc_path'), 'cv-fictif.pdf', 'application/pdf', 1000, 'ready', now());
update public.profiles set avatar_path = pg_temp.fid('s2') || '/' || gen_random_uuid() || '.webp' where id = pg_temp.fid('s2');
insert into fx (k, v) values ('avatar', (select avatar_path from public.profiles where id = pg_temp.fid('s2')));
insert into fx (k, v) values ('nina_apps', (select count(*)::text from public.applications where candidate_id = pg_temp.fid('nina')));
set local role authenticated;

select pg_temp.as_user('s2', 'aal1');
select lives_ok($$ insert into fx (k, v) values ('r3', public.submit_privacy_request('erasure', null)::text) $$, 's2 asks for erasure');
reset role;
update fx set id = (v::jsonb ->> 'id')::uuid, v = v::jsonb ->> 'reference' where k = 'r3';
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.execute_privacy_erasure(pg_temp.fid('r3'), false, null) $$, 'P0001', 'privacy_request_invalid',
  'nothing is erased before a decision');
select lives_ok($$ select public.decide_privacy_request(pg_temp.fid('r3'), 'approved', null) $$, 'approved');
select is((public.privacy_request_detail(pg_temp.fid('r3')) -> 'requester' -> 'counts' ->> 'applications')::integer, 1,
  'the plan shows what the person has');
select throws_ok($$ select public.execute_privacy_erasure(pg_temp.fid('r3'), false, 'PR-000000') $$, 'P0001',
  'privacy_confirmation_required', 'the officer confirms by typing the reference');
select lives_ok($$ insert into fx (k, v) values ('erase', public.execute_privacy_erasure(pg_temp.fid('r3'), false,
    (select v from fx where k = 'r3'))::text) $$, 'the erasure runs');
reset role;
select is((select count(*)::integer from public.applications where candidate_id = pg_temp.fid('s2')), 0, 'applications are gone');
select is((select count(*)::integer from public.application_documents where application_id = pg_temp.fid('app2')), 0, 'with their files');
select ok(exists (select 1 from private.storage_cleanup_queue where object_path = (select v from fx where k = 'doc_path')
                    and reason = 'privacy_erasure:' || pg_temp.fid('r3') and done_at is null), 'the file is queued for deletion from Storage');
select ok(exists (select 1 from private.storage_cleanup_queue where bucket_id = 'avatars' and object_path = (select v from fx where k = 'avatar')
                    and reason = 'privacy_erasure:' || pg_temp.fid('r3')), 'so is the photo');
select is((select count(*)::integer from public.event_registrations where user_id = pg_temp.fid('s2')), 0, 'registrations are gone');
select is((select status from public.event_registrations where user_id = pg_temp.fid('s3') and event_id = pg_temp.fid('ev')), 'confirmed',
  'and the freed seat went to the waiting list');
select is((select count(*)::integer from public.saved_items where user_id = pg_temp.fid('s2'))
          + (select count(*)::integer from public.notification_follows where user_id = pg_temp.fid('s2'))
          + (select count(*)::integer from public.notifications where recipient_id = pg_temp.fid('s2')), 0,
  'saved items, follows and notifications are gone');
select ok((select display_name = 'Compte supprimé' and avatar_path is null and erased_at is not null from public.profiles
            where id = pg_temp.fid('s2')), 'the profile is "Compte supprimé"');
select ok((select email is null and raw_user_meta_data = '{}'::jsonb and (raw_app_meta_data ->> 'erased')::boolean from auth.users
            where id = pg_temp.fid('s2')), 'the account keeps no e-mail and no metadata');
select is((select count(*)::integer from auth.identities where user_id = pg_temp.fid('s2'))
          + (select count(*)::integer from auth.mfa_factors where user_id = pg_temp.fid('s2')), 0, 'and no way to sign in');
select ok(exists (select 1 from private.erasure_ledger where person_key = private.person_key(pg_temp.fid('s2'))),
  'the ledger keeps a one-way key');
select ok(not exists (select 1 from private.erasure_ledger l where l.person_key like '%' || pg_temp.fid('s2')::text || '%'
                        or l.request_reference like '%@%'), 'and nothing that names the person');
select is((select count(*)::text from public.applications where candidate_id = pg_temp.fid('nina')), (select v from fx where k = 'nina_apps'),
  'another student''s records are untouched');
select is((private.erase_person(pg_temp.fid('s2'), null, null, false) ->> 'applications')::integer, 0, 'running it again changes nothing');
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.complete_privacy_request(pg_temp.fid('r3'), 'Effacé.') $$, 'P0001', 'privacy_erasure_pending',
  'not complete while files remain in Storage');
reset role;
update private.storage_cleanup_queue set done_at = now() where reason = 'privacy_erasure:' || pg_temp.fid('r3');
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select lives_ok($$ select public.complete_privacy_request(pg_temp.fid('r3'), 'Effacement vérifié, fichiers supprimés.') $$,
  'complete once the worker deleted them');
reset role;
select ok(not exists (select 1 from public.notifications where recipient_id = pg_temp.fid('s2')), 'an erased account receives nothing more');

-- A president's erasure ends the presidency (the governance checker takes over), never silently.
set local role authenticated;
select pg_temp.as_user('julie', 'aal1');
select lives_ok($$ insert into fx (k, v) values ('r4', public.submit_privacy_request('erasure', null)::text) $$, 'Julie asks for erasure');
reset role;
update fx set id = (v::jsonb ->> 'id')::uuid, v = v::jsonb ->> 'reference' where k = 'r4';
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select ok(jsonb_array_length(public.privacy_request_detail(pg_temp.fid('r4')) -> 'requester' -> 'responsibilities') > 0,
  'the plan lists her active responsibilities');
select lives_ok($$ select public.decide_privacy_request(pg_temp.fid('r4'), 'approved', null) $$, 'approved');
select throws_ok($$ select public.execute_privacy_erasure(pg_temp.fid('r4'), false, (select v from fx where k = 'r4')) $$,
  'P0001', 'erasure_responsibilities_active', 'not erased while she presides, unless the officer ends it explicitly');
select lives_ok($$ select public.execute_privacy_erasure(pg_temp.fid('r4'), true, (select v from fx where k = 'r4')) $$,
  'with that confirmation, it runs');
reset role;
select is(private.office_holder(pg_temp.fid('finance'), 'association_president', now()), null, 'Finance has no president any more');
select ok(exists (select 1 from public.position_assignments where user_id = pg_temp.fid('julie') and status = 'ended'
                    and end_reason like 'Effacement%'), 'her mandate ended, with the reason, the history kept');
select is(private.person_name(pg_temp.fid('julie')), 'Compte supprimé', 'the history she is part of now reads "Compte supprimé"');

-- Holds: a person held is not erased; a held application stays while the rest goes.
insert into fx (k, id) values ('app5', null);
set local role authenticated;
select pg_temp.as_user('s5', 'aal1');
select lives_ok($$ update fx set id = (public.start_application(pg_temp.fid('pos_events')) ->> 'application_id')::uuid where k = 'app5' $$,
  's5 starts an application');
select lives_ok($$ select public.save_item('association', pg_temp.fid('sports'), true) $$, 'and saves Sports');
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.place_retention_hold('application', pg_temp.fid('app5'), 'Litige', 'Défense', 'Bureau', current_date + 30) $$,
  'P0001', 'retention_hold_invalid', 'a hold states a real purpose');
select throws_ok($$ select public.place_retention_hold('application', pg_temp.fid('app5'), 'Litige en cours sur cette candidature.',
    'Défense d''un droit en justice', 'Bureau du BDE (exemple)', current_date + 400) $$,
  'P0001', 'retention_hold_invalid', 'and is reviewed within a year');
select lives_ok($$ insert into fx (k, id) values ('hold', public.place_retention_hold('application', pg_temp.fid('app5'),
    'Litige en cours sur cette candidature.', 'Défense d''un droit en justice', 'Bureau du BDE (exemple)', current_date + 90)) $$,
  'the officer places a hold on one application');
reset role;
select ok(private.application_held((select a from public.applications a where a.id = pg_temp.fid('app5'))), 'it is held');
select private.erase_person(pg_temp.fid('s5'), pg_temp.fid('lea'), null, false);
select is((select count(*)::integer from public.applications where id = pg_temp.fid('app5')), 1, 'the held application stays');
select is((select count(*)::integer from public.saved_items where user_id = pg_temp.fid('s5')), 0, 'the rest of s5''s data is gone');
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.release_retention_hold(pg_temp.fid('hold'), '') $$, 'P0001', 'reason_required', 'releasing says why');
select lives_ok($$ select public.place_retention_hold('person', pg_temp.fid('s6'), 'Réclamation en cours concernant ce compte.',
    'Défense d''un droit en justice', 'Bureau du BDE (exemple)', current_date + 60) $$, 'a hold on a whole person');
reset role;
select throws_ok($$ select private.erase_person(pg_temp.fid('s6'), null, null, false) $$, 'P0001', 'erasure_on_hold',
  'blocks their erasure until it is released or lapses');
update public.retention_holds set review_on = current_date - 1, created_at = now() - interval '61 days' where scope = 'person' and subject_id = pg_temp.fid('s6');
select ok(not private.is_held('person', pg_temp.fid('s6')), 'past its review date, a hold no longer applies');

-- =============================================================================
-- 5. A restore cannot bring an erased person back (§111, §53)
-- =============================================================================

-- As if yesterday's backup came back: s2's profile, a saved item and the e-mail reappear.
update public.profiles set first_name = 'Étudiant2', display_name = 'Étudiant2 Fictif', erased_at = null where id = pg_temp.fid('s2');
update auth.users set email = 'vieprivee-2@student.example.test', raw_app_meta_data = '{}'::jsonb where id = pg_temp.fid('s2');
insert into public.saved_items (user_id, kind, organization_id) values (pg_temp.fid('s2'), 'association', pg_temp.fid('finance'));
select ok((private.reconcile_erasures() ->> 'reapplied')::integer >= 1, 'the reconciliation finds what the restore brought back');
select ok((select erased_at is not null and display_name = 'Compte supprimé' from public.profiles where id = pg_temp.fid('s2')),
  'and erases it again');
select is((select count(*)::integer from public.saved_items where user_id = pg_temp.fid('s2')), 0, 'the restored saved item is gone');
select ok((select email is null from auth.users where id = pg_temp.fid('s2')), 'the restored e-mail too');
select is((private.reconcile_erasures() ->> 'reapplied')::integer, 0, 'a second pass finds nothing');
set local role authenticated;
select pg_temp.as_user('nina', 'aal2');
select throws_ok($$ select public.reconcile_privacy_erasures() $$, 'P0001', 'insufficient_permission', 'a student cannot trigger it');
reset role;

-- Files a Storage restore brings back with no row pointing to them are queued for deletion; referenced ones are not.
insert into fx (k, v) values ('orphan_doc', 'applications/' || gen_random_uuid() || '/' || gen_random_uuid()),
                             ('kept_doc', 'applications/' || pg_temp.fid('app5') || '/' || gen_random_uuid()),
                             ('orphan_avatar', gen_random_uuid() || '/' || gen_random_uuid() || '.webp'),
                             ('kept_avatar', pg_temp.fid('s3') || '/' || gen_random_uuid() || '.webp');
insert into public.application_documents (application_id, question_id, object_path, file_name, mime_type, size_bytes, status, confirmed_at)
values (pg_temp.fid('app5'), 'cv', (select v from fx where k = 'kept_doc'), 'cv-garde.pdf', 'application/pdf', 1000, 'ready', now());
update public.profiles set avatar_path = (select v from fx where k = 'kept_avatar') where id = pg_temp.fid('s3');
do $$
declare
  v_key text;
begin
  foreach v_key in array array['orphan_doc', 'kept_doc', 'orphan_avatar', 'kept_avatar'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'objects' and column_name = 'created_at') then
      execute 'insert into storage.objects (bucket_id, name, created_at) values ($1, $2, now() - interval ''2 days'')'
        using case when v_key like '%doc' then 'recruitment-documents' else 'avatars' end, (select v from fx where fx.k = v_key);
    else
      execute 'insert into storage.objects (bucket_id, name) values ($1, $2)'
        using case when v_key like '%doc' then 'recruitment-documents' else 'avatars' end, (select v from fx where fx.k = v_key);
    end if;
  end loop;
end $$;
select ok((private.queue_storage_orphans() ->> 'documents')::integer >= 1, 'the restored files nobody references are found');
select ok(exists (select 1 from private.storage_cleanup_queue where object_path = (select v from fx where k = 'orphan_doc') and reason = 'orphan_after_restore')
          and exists (select 1 from private.storage_cleanup_queue where object_path = (select v from fx where k = 'orphan_avatar')),
  'and queued for deletion (a CV and a photo)');
select ok(not exists (select 1 from private.storage_cleanup_queue where object_path in ((select v from fx where k = 'kept_doc'), (select v from fx where k = 'kept_avatar'))),
  'files still in use are left alone');

-- =============================================================================
-- 6. Retention: decisions with their reference, holds, append-only logs (§107, §60)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('alice', 'aal2');
select throws_ok($$ select public.set_retention_policy('privacy_requests_closed', 12, null, null) $$, 'P0001', 'retention_note_required',
  'a period needs the reference of the decision');
select throws_ok($$ select public.set_retention_policy('governance_audit_events', 6, 'Décision fictive du bureau (test).', null) $$, 'P0001',
  'retention_invalid', 'the audit log keeps at least a year');
reset role;
-- An old closed request and an old audit line (synthetic dates).
update public.privacy_requests set completed_at = now() - interval '3 years', received_at = now() - interval '3 years 1 month',
       decided_at = now() - interval '3 years 1 month', due_at = now() - interval '3 years' where id = pg_temp.fid('r1');
insert into public.governance_audit_events (actor_user_id, authority, action, category, details, occurred_at)
values (null, 'system', 'fictional_old_event', 'privacy', '{}'::jsonb, now() - interval '5 years');
set local role authenticated;
select pg_temp.as_user('alice', 'aal2');
select is((public.preview_retention_policy('privacy_requests_closed', 24) ->> 'count')::integer, 1, 'the dry run counts the old request');
select is((public.preview_retention_policy('governance_audit_events', 48) ->> 'count')::integer, 1, 'and the old audit line');
select throws_ok($$ select public.set_retention_policy('privacy_requests_closed', 24, 'Décision fictive du bureau (test).', null) $$, 'P0001',
  'retention_confirmation_required', 'deleting needs the previewed count');
select lives_ok($$ select public.set_retention_policy('privacy_requests_closed', 24, 'Décision fictive du bureau (test).', 1) $$,
  'set with the count');
select lives_ok($$ select public.set_retention_policy('governance_audit_events', 48, 'Décision fictive du bureau (test).', 1) $$,
  'and for the audit log');
reset role;
select ok(private.run_retention() -> 'deleted' ? 'privacy_requests_closed', 'the nightly job deletes the old closed request');
select ok(not exists (select 1 from public.privacy_requests where id = pg_temp.fid('r1')), 'gone');
select ok(exists (select 1 from public.privacy_requests where id = pg_temp.fid('r3')), 'recent ones stay');
select ok(not exists (select 1 from public.governance_audit_events where action = 'fictional_old_event'), 'the old audit line is gone');
select throws_ok($$ delete from public.governance_audit_events where action = 'privacy_request_decided' $$, 'P0001',
  'audit_records_are_append_only', 'outside the job, the audit log stays append-only');

-- =============================================================================
-- 7. A personal-data breach, simulated (§110)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select lives_ok($$ insert into fx (k, id) values ('inc', public.open_privacy_incident('Document de candidature exposé (simulation)',
    'Un fichier fictif a été accessible par erreur.', now() - interval '70 hours')) $$, 'the officer opens a data incident');
reset role;
select is((select personal_data from public.operational_incidents where id = pg_temp.fid('inc')), 'yes', 'marked as personal data');
select ok((private.run_privacy_housekeeping() ->> 'breach_reminders')::integer >= 1, 'with the notification decision pending, reminders go out');
select ok(exists (select 1 from public.notifications where kind = 'privacy_breach_deadline' and recipient_id = pg_temp.fid('lea')),
  'to the officer');
select ok(exists (select 1 from public.notifications where kind = 'privacy_breach_deadline' and recipient_id in (pg_temp.fid('alice'), pg_temp.fid('marc'))),
  'and to the BDE office (operations)');
select ok(not exists (select 1 from public.notifications where kind = 'privacy_breach_deadline' and recipient_id = pg_temp.fid('garance')),
  'never to the guardian');
set local role authenticated;
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.assess_privacy_incident(pg_temp.fid('inc'), 'yes', now() - interval '70 hours', array['documents'], 1,
    array['confidentiality'], 'risk', 'notify', null, 'pending', null, 'court') $$, 'P0001', 'incident_invalid',
  'a notification decision is explained');
select throws_ok($$ select public.assess_privacy_incident(pg_temp.fid('inc'), 'yes', now() - interval '70 hours', array['documents'], 1,
    array['confidentiality'], 'risk', 'notify', now() + interval '1 day', 'pending', null, 'Notification décidée par le responsable (simulation).') $$,
  'P0001', 'incident_invalid', 'a notification cannot be dated in the future');
select lives_ok($$ select public.assess_privacy_incident(pg_temp.fid('inc'), 'yes', now() - interval '70 hours', array['documents'], 1,
    array['confidentiality'], 'risk', 'notify', now(), 'not_required', null, 'Simulation : notification enregistrée, risque non élevé pour la personne.') $$,
  'the decision and its date are recorded (the site sends nothing itself)');
select ok((select (r ->> 'pending_decision')::boolean is false from jsonb_array_elements(public.privacy_requests_queue() -> 'incidents') r
            where (r ->> 'id')::uuid = pg_temp.fid('inc')), 'no longer pending');
select pg_temp.as_user('nina', 'aal2');
select throws_ok($$ select public.assess_privacy_incident(pg_temp.fid('inc'), 'no', null, null, null, null, 'unlikely', 'pending', null, 'pending', null, null) $$,
  'P0001', 'insufficient_permission', 'a student cannot touch the breach register');

-- =============================================================================
-- 8. The privacy notice versions
-- =============================================================================

select pg_temp.as_user('nina', 'aal2');
select throws_ok($$ select public.record_privacy_notice_version('2026-11', 'fr', '[{"heading": "A", "paragraphs": ["B"]}]', 'Bureau', null,
    current_date, now()) $$, 'P0001', 'insufficient_permission', 'a student cannot record an approval');
select pg_temp.as_user('lea', 'aal2');
select throws_ok($$ select public.record_privacy_notice_version('2026-11', 'fr', '[{"heading": "A"}]', 'Bureau du BDE (exemple)', null,
    current_date, now()) $$, 'P0001', 'privacy_notice_invalid', 'the text must be well-formed sections');
select lives_ok($$ select public.record_privacy_notice_version('2026-11-test', 'fr',
    '[{"heading": "Qui traite tes données", "paragraphs": ["Texte fictif de test."]}]', 'Bureau du BDE (exemple)', 'AG fictive',
    current_date, now() - interval '1 minute') $$, 'an approved version is recorded');
set local role anon;
select is(public.public_privacy_notice('fr') -> 'current' ->> 'version', '2026-11-test', 'and is the notice in force for visitors');
select is(length(public.public_privacy_notice('fr') -> 'current' ->> 'hash'), 64, 'with the hash of its exact text');
set local role authenticated;

-- =============================================================================
-- 8b. The form builder flags sensitive questions; a justification unlocks publication (§13–§16)
-- =============================================================================

reset role;
select is(cardinality(private.form_sensitive_terms('{"questions": [{"label": "Ta motivation en quelques lignes"}, {"label": "Ton sport préféré"}]}')), 0,
  'an ordinary form flags nothing');
select ok(private.form_sensitive_terms('{"questions": [{"label": "Ta date de naissance"}, {"label": "As-tu un problème de santé ?"}, {"label": "Ton numéro de téléphone"}, {"label": "Ta religion"}]}')
          @> array['naissance', 'religion', 'sante', 'telephone'], 'date of birth, health, phone and religion are flagged');
select is((select count(*)::integer from public.recruitment_form_versions where status = 'published'
            and cardinality(private.form_sensitive_terms(schema)) > 0), 0, 'no live form of the seed asks anything sensitive');
insert into fx (k, id) values ('c_sports', (select campaign_id from public.recruitment_positions where id = pg_temp.fid('pos_events')));
insert into public.recruitment_form_versions (campaign_id, number, status, schema, edit_version, created_by)
select v.campaign_id, (select max(number) + 1 from public.recruitment_form_versions where campaign_id = v.campaign_id), 'draft',
       jsonb_set(v.schema, '{questions}', (v.schema -> 'questions') || jsonb_build_array(jsonb_build_object(
         'id', 'birth', 'type', 'long_text', 'label', 'Ta date de naissance (question fictive)', 'scope', 'shared',
         'section', 's1', 'required', false, 'max_length', 100))),
       1, pg_temp.fid('emma')
  from public.recruitment_form_versions v where v.campaign_id = pg_temp.fid('c_sports') and v.status = 'published';
set local role authenticated;
select pg_temp.as_user('emma', 'aal2');
select ok(public.recruitment_form_privacy_check(pg_temp.fid('c_sports')) -> 'flagged' ? 'naissance', 'the editor sees what is flagged');
select throws_ok($$ select public.publish_recruitment_form(pg_temp.fid('c_sports')) $$, 'P0001', 'form_privacy_review_required',
  'the version cannot go live without a justification');
select throws_ok($$ select public.record_form_privacy_review(pg_temp.fid('c_sports'), 'parce que') $$, 'P0001',
  'form_privacy_justification_invalid', 'a real explanation is needed');
select lives_ok($$ select public.record_form_privacy_review(pg_temp.fid('c_sports'),
    'Question fictive : vérifier la majorité pour un déplacement en tournoi, sans conserver la date ensuite.') $$, 'the president explains it');
select lives_ok($$ select public.publish_recruitment_form(pg_temp.fid('c_sports')) $$, 'then the version can be published');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('lea') and kind = 'privacy_form_flagged'),
  'and the privacy officer is told');
select ok(exists (select 1 from public.recruitment_form_privacy_reviews r join public.recruitment_form_versions v on v.id = r.form_version_id
                   where v.campaign_id = pg_temp.fid('c_sports') and v.status = 'published'), 'the justification stays with that exact version');
set local role authenticated;
select pg_temp.as_user('nina', 'aal2');
select throws_ok($$ select public.record_form_privacy_review(pg_temp.fid('c_sports'), 'Une justification assez longue pour passer.') $$,
  'P0001', 'insufficient_permission', 'a student cannot justify someone else''s form');

-- =============================================================================
-- 9. The security posture of the schema (§72, §109)
-- =============================================================================

reset role;
select is((select count(*)::integer from pg_tables where schemaname in ('public', 'private') and not rowsecurity), 0,
  'row level security is on for every table');
select is((select count(*)::integer from information_schema.role_table_grants
            where table_schema in ('public', 'private') and grantee in ('anon', 'authenticated')
              and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), 0,
  'no API role may write a table directly');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 0,
  'every security definer function pins its search path');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'private' and (has_function_privilege('anon', p.oid, 'execute')
                                              or has_function_privilege('authenticated', p.oid, 'execute'))
              and p.proname in ('erase_person', 'personal_data', 'reconcile_erasures', 'run_privacy_housekeeping',
                                'erasure_plan', 'privacy_handlers', 'notify_privacy_requester', 'run_retention',
                                'purge_recruitment_data')), 0,
  'the privacy and retention helpers are callable by no API role');
select is((select count(*)::integer from storage.buckets where public), 0, 'no Storage bucket is public');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
              and p.proname like any (array['privacy%', '%personal_data%', '%erasure%', '%retention%', 'submit_privacy%', 'assess_%'])), 0,
  'no privacy or retention function is open to visitors');

select * from finish();
rollback;
