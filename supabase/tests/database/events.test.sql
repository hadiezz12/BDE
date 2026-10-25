-- Phase 7 · Events: the security matrix of the brief (§99), participant
-- privacy (§86), the registration engine and its waiting list (§102),
-- cancellation (§103) and permissions with revocation (§104), straight
-- against the database. Runs on top of supabase/seed.sql:
--   Julie presides Finance (and is a plain member of Sports); Lucas holds
--   Communication + Événements in Finance (events.create/edit/publish,
--   participants view/manage, no export); Emma presides Sports; Alice and
--   Marc lead the BDE; Garance is the continuity guardian; Nina, Hugo, Paul,
--   Léa and Tom are students. Seeded events: see the Phase 7 block of seed.sql.
-- Concurrent requests (twenty students for one seat, two simultaneous
-- cancellations) are tested by supabase/tests/concurrency/registrations.sh.
-- Everything is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(128);

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
  ('paul', 'a0000000-0000-4000-8000-00000000000a'),
  ('lea', 'a0000000-0000-4000-8000-00000000000b'),
  ('tom', 'a0000000-0000-4000-8000-00000000000c');

insert into fx (k, id)
select x.k, (select e.id from public.events e where e.title = x.title)
  from (values ('atelier', 'Atelier finance (exemple)'),
               ('webinaire', 'Webinaire carrière (exemple)'),
               ('annulee', 'Conférence annulée (exemple)'),
               ('closes', 'Inscriptions closes (exemple)'),
               ('passee', 'Rencontre passée (exemple)'),
               ('tournoi', 'Tournoi (exemple)'),
               ('expo', 'Exposition photo (exemple)'),
               ('bientot', 'Inscriptions bientôt (exemple)'),
               ('escalade', 'Initiation escalade (exemple)'),
               ('soiree', 'Soirée de rentrée (exemple)'),
               ('ski', 'Week-end ski (exemple)'),
               ('draft_lucas', 'Brouillon de Lucas (événement exemple)')) as x (k, title);

insert into fx (k, id)
select 'lucas_events', a.id
  from public.position_assignments a
  join public.positions p on p.id = a.position_id
 where p.title = 'Événements' and p.organization_id = (select id from fx where k = 'finance')
   and a.user_id = 'a0000000-0000-4000-8000-000000000005' and a.status = 'active';

insert into fx (k, id)
select 'lea_tournoi_reg', r.id from public.event_registrations r
 where r.event_id = (select id from fx where k = 'tournoi') and r.user_id = (select id from fx where k = 'lea');

-- Six more fictional students (onboarded), for the waiting-list scenarios.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('b0000000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
       'etudiant' || n || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 6) as n;
update public.profiles set first_name = 'Étudiant', last_name = 'Test ' || right(id::text, 1), onboarding_completed_at = now()
 where id::text like 'b0000000-0000-4000-8000-00000000000%';
insert into fx (k, id) select 's' || n, ('b0000000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1, 6) as n;

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;

create function pg_temp.event(p_key text) returns public.events language sql stable security definer
  as $f$ select * from public.events where id = (select id from fx where k = p_key) $f$;
grant execute on function pg_temp.event(text) to anon, authenticated, service_role;

create function pg_temp.reg_status(p_event text, p_user text) returns text language sql stable security definer
  as $f$ select status from public.event_registrations
          where event_id = (select id from fx where k = p_event) and user_id = (select id from fx where k = p_user)
          order by (status in ('confirmed', 'waitlisted')) desc, created_at desc limit 1 $f$;
grant execute on function pg_temp.reg_status(text, text) to anon, authenticated, service_role;

create function pg_temp.outbox_count(p_event text, p_kind text) returns integer language sql stable security definer
  as $f$ select count(*)::integer from public.notification_outbox
          where event_id = (select id from fx where k = p_event) and kind = p_kind $f$;
grant execute on function pg_temp.outbox_count(text, text) to anon, authenticated, service_role;

-- A complete, publishable patch for new test events.
create function pg_temp.patch(p_hours_from_now integer, p_capacity integer, p_waitlist boolean) returns jsonb language sql stable as $f$
  select jsonb_build_object(
    'summary', 'Événement de test.', 'location_type', 'campus', 'venue_name', 'Salle de test',
    'starts_at', now() + make_interval(hours => p_hours_from_now),
    'ends_at', now() + make_interval(hours => p_hours_from_now + 2),
    'registration_mode', 'internal', 'capacity', p_capacity, 'waitlist_enabled', p_waitlist) $f$;
grant execute on function pg_temp.patch(integer, integer, boolean) to authenticated;

-- =============================================================================
-- 1. Visitors read published events only
-- =============================================================================

set local role anon;
select is(
  (select array_agg(e ->> 'title' order by e ->> 'title' collate "C") from jsonb_array_elements(public.public_events()) as e),
  array['Atelier finance (exemple)', 'Conférence annulée (exemple)', 'Exposition photo (exemple)', 'Initiation escalade (exemple)',
        'Inscriptions bientôt (exemple)', 'Inscriptions closes (exemple)', 'Soirée de rentrée (exemple)', 'Tournoi (exemple)',
        'Webinaire carrière (exemple)', 'Week-end ski (exemple)'],
  'the directory lists upcoming published events (no draft, no past event)'
);
select is(public.public_event('rencontre-passee-exemple') ->> 'state', 'ok', 'a past event keeps its page');
select is((public.public_event('conference-annulee-exemple') -> 'event' ->> 'status'), 'cancelled',
  'a cancelled event keeps its page, marked cancelled');
select is((public.public_event('conference-annulee-exemple') -> 'event' ->> 'cancellation_reason'), 'Annulation fictive de démonstration.',
  'with the organizer''s reason');
select ok(public.public_event('webinaire-carriere-exemple')::text not like '%visio.example.test%',
  'private joining details never appear in the public page');
select ok(public.public_events()::text not like '%visio.example.test%', 'nor in the directory');
select is((public.public_event('webinaire-carriere-exemple') -> 'event' -> 'location' ->> 'has_private_details'), 'true',
  'visitors only learn that details exist');
select is(jsonb_array_length(public.public_events(p_q => 'brouillon')), 0, 'search never finds a draft');
select is(jsonb_array_length(public.public_events(p_q => 'webinaire')), 1, 'search finds a published event');
select is(jsonb_array_length(public.public_events(p_organization_slug => 'exemple-sports')), 4, 'filter by association');
select is(jsonb_array_length(public.public_events(p_location_type => 'online')), 1, 'filter by place');
select is(jsonb_array_length(public.public_events(p_from => '-infinity', p_order => 'desc', p_to => now())), 1,
  'the archive lists what is over, newest first');
select throws_ok($$ select count(*) from public.events $$, '42501', null, 'visitors cannot read the events table');
select throws_ok($$ select count(*) from public.event_registrations $$, '42501', null, 'nor registrations');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'tournoi')) $$, '42501', null,
  'an anonymous visitor cannot register');

-- =============================================================================
-- 2. Who may create, edit and publish
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('nina');
select throws_ok($$ select public.create_event((select id from fx where k = 'finance'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'an ordinary student cannot create an association event');
select throws_ok($$ select public.event_dashboard((select id from fx where k = 'finance')) $$,
  'P0001', 'insufficient_permission', 'nor open its event desk');
select is((select count(*)::integer from public.events), 0, 'a student reads no event row directly');

select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('j_event', public.create_event((select id from fx where k = 'finance'), 'Événement de Julie')) $$,
  'the Finance president creates a Finance event');
select lives_ok($$ select public.save_event((select id from fx where k = 'j_event'), 1, pg_temp.patch(72, 2, true)) $$,
  'and fills it in');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), 1, '{"title": "Ancienne version"}'::jsonb) $$,
  'P0001', 'draft_conflict', 'a save based on an old version is refused');
select throws_ok($$ select public.save_event((select id from fx where k = 'tournoi'), (pg_temp.event('tournoi')).version, '{"title": "Pirate"}'::jsonb) $$,
  'P0001', 'insufficient_permission', 'a plain member of Sports cannot edit a Sports event');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version, '{"organization_id": "00000000-0000-0000-0000-000000000000"}'::jsonb) $$,
  'P0001', 'event_invalid', 'the owner is not a field one can send');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version, '{"series_key": "wei"}'::jsonb) $$,
  'P0001', 'event_invalid', 'only BDE events belong to the events of the year');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version,
                    '{"registration_mode": "external", "external_url": "javascript:alert(1)", "capacity": null, "waitlist_enabled": false}'::jsonb) $$,
  'P0001', 'event_invalid', 'a malicious external registration address is refused');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version,
                    '{"registration_mode": "external", "external_url": "http://example.test", "capacity": null, "waitlist_enabled": false}'::jsonb) $$,
  'P0001', 'event_invalid', 'external registration must be https');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version,
                    jsonb_build_object('ends_at', now() + interval '70 hours')) $$,
  'P0001', 'event_invalid', 'an event cannot end before it starts');
select pg_temp.as_user('emma');
select throws_ok($$ select public.publish_event((select id from fx where k = 'j_event')) $$,
  'P0001', 'insufficient_permission', 'the Sports president cannot publish a Finance event');
select pg_temp.as_user('julie', 'aal1');
select throws_ok($$ select public.publish_event((select id from fx where k = 'j_event')) $$,
  'P0001', 'mfa_required', 'publishing needs the second factor');
select pg_temp.as_user('julie');
select lives_ok($$ select public.publish_event((select id from fx where k = 'j_event')) $$, 'the Finance president publishes it');
select is((pg_temp.event('j_event')).slug, 'evenement-de-julie', 'it gets an address from its title, accents folded');
select is((select count(*)::integer from public.governance_audit_events
            where resource_type = 'event' and resource_id = (select id from fx where k = 'j_event')
              and action in ('event_created', 'event_published')), 2, 'creation and publication are audited');

-- =============================================================================
-- 3. Registration rules
-- =============================================================================

select pg_temp.as_user('tom', 'aal1');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'bientot')) $$,
  'P0001', 'registration_not_open', 'before opening time: refused');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'closes')) $$,
  'P0001', 'registration_closed', 'after closing time: refused');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'annulee')) $$,
  'P0001', 'event_cancelled', 'a cancelled event takes no registration');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'expo')) $$,
  'P0001', 'registration_not_available', 'an information-only event takes no registration');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'ski')) $$,
  'P0001', 'registration_not_available', 'nor one registered on an outside site');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'draft_lucas')) $$,
  'P0001', 'event_not_found', 'nor a draft');

select pg_temp.as_user('hugo', 'aal1');
select is((public.register_for_event((select id from fx where k = 'atelier')) ->> 'status'), 'confirmed',
  'a student registers for an open event');
select is((public.register_for_event((select id from fx where k = 'atelier')) ->> 'already'), 'true',
  'registering again returns the same registration (idempotent)');
select is((pg_temp.event('atelier')).confirmed_count, 3, 'and never takes a second seat');
select is((select count(*)::integer from public.event_registrations
            where event_id = (select id from fx where k = 'atelier') and user_id = (select id from fx where k = 'hugo')), 1,
  'one registration row for the student');
select is(pg_temp.outbox_count('atelier', 'event_registration_confirmed'), 4, 'each confirmation is queued once (Léa''s too, before she cancelled)');

-- The tournament is full (2 seats) and Léa waits first.
select is((public.register_for_event((select id from fx where k = 'tournoi')) ->> 'status'), 'waitlisted',
  'a full event with a waiting list: waitlisted');
select is((public.my_event_status((select id from fx where k = 'tournoi')) -> 'registration' ->> 'position'), '2',
  'the student sees their own waiting place');
select is((pg_temp.event('tournoi')).confirmed_count, 2, 'the capacity is never exceeded');

-- Without a waiting list.
select pg_temp.as_user('emma');
select lives_ok($$ insert into fx (k, id) values ('single', public.create_event((select id from fx where k = 'sports'), 'Une seule place')) $$,
  'an event with one seat');
select lives_ok($$ select public.save_event((select id from fx where k = 'single'), 1, pg_temp.patch(48, 1, false)) $$, 'is filled in');
select lives_ok($$ select public.publish_event((select id from fx where k = 'single')) $$, 'and published');
select pg_temp.as_user('s1', 'aal1');
select is((public.register_for_event((select id from fx where k = 'single')) ->> 'status'), 'confirmed', 'the first student gets the seat');
select pg_temp.as_user('s2', 'aal1');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'single')) $$,
  'P0001', 'event_full', 'full without a waiting list: refused');

-- =============================================================================
-- 4. Privacy of registrations
-- =============================================================================

select pg_temp.as_user('hugo', 'aal1');
select is((select count(*)::integer from public.event_registrations where user_id <> (select id from fx where k = 'hugo')), 0,
  'a student never reads someone else''s registration');
select ok((select count(*) from public.event_registrations) > 0, 'but reads their own');
select throws_ok($$ select public.event_attendees((select id from fx where k = 'atelier')) $$,
  'P0001', 'insufficient_permission', 'a student cannot list the participants');
select throws_ok($$ select public.remove_event_registration((select id from fx where k = 'lea_tournoi_reg'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'nor remove someone else''s registration');
select is((public.my_event_status((select id from fx where k = 'webinaire')) -> 'registration'), 'null'::jsonb,
  'not registered: no private details');
select pg_temp.as_user('tom', 'aal1');
select ok((public.my_event_status((select id from fx where k = 'webinaire')) -> 'registration' ->> 'access_details') like '%visio.example.test%',
  'a confirmed participant gets the private joining details');

select pg_temp.as_user('julie');
select is((public.event_attendees((select id from fx where k = 'atelier')) -> 'counts' ->> 'confirmed'), '3',
  'the Finance president sees the Finance participants');
select ok(public.event_attendees((select id from fx where k = 'atelier'))::text not like '%@%',
  'names only: no e-mail address in the list');
select throws_ok($$ select public.event_attendees((select id from fx where k = 'tournoi')) $$,
  'P0001', 'insufficient_permission', 'but not the Sports participants');
select pg_temp.as_user('lucas');
select lives_ok($$ select public.event_attendees((select id from fx where k = 'atelier')) $$,
  'the Finance events officer sees them (events.attendees.view)');
select throws_ok($$ select public.export_event_attendees((select id from fx where k = 'atelier')) $$,
  'P0001', 'insufficient_permission', 'but cannot export them without events.attendees.export');
select pg_temp.as_user('julie');
select is(jsonb_array_length(public.export_event_attendees((select id from fx where k = 'atelier')) -> 'rows'), 3,
  'the president exports the list');
select is((select count(*)::integer from public.governance_audit_events
            where action = 'event_attendees_exported' and resource_id = (select id from fx where k = 'atelier')), 1,
  'exports are audited');
select pg_temp.as_user('alice');
select throws_ok($$ select public.event_attendees((select id from fx where k = 'atelier')) $$,
  'P0001', 'insufficient_permission', 'BDE leadership does not read an association''s participants');
select pg_temp.as_user('garance');
select throws_ok($$ select public.event_attendees((select id from fx where k = 'atelier')) $$,
  'P0001', 'insufficient_permission', 'nor does the continuity guardian');
select is((select count(*)::integer from public.events), 0, 'the guardian reads no event row');

-- =============================================================================
-- 5. Cancellation, promotion, capacity
-- =============================================================================

select pg_temp.as_user('paul', 'aal1');
select lives_ok($$ select public.cancel_my_registration((select id from fx where k = 'tournoi')) $$,
  'a confirmed student gives back their seat');
select is(pg_temp.reg_status('tournoi', 'lea'), 'confirmed', 'the first waiting student is promoted');
select is(pg_temp.reg_status('tournoi', 'hugo'), 'waitlisted', 'the next one keeps waiting');
select is((pg_temp.event('tournoi')).confirmed_count || '/' || (pg_temp.event('tournoi')).waitlist_count, '2/1',
  'two seats taken, one waiting: the capacity holds');
select is(pg_temp.outbox_count('tournoi', 'event_promoted'), 1, 'the promoted student is told');
select pg_temp.as_user('hugo', 'aal1');
select is((public.my_event_status((select id from fx where k = 'tournoi')) -> 'registration' ->> 'position'), '1',
  'the waiting place moves up');
select throws_ok($$ select public.cancel_my_registration((select id from fx where k = 'single')) $$,
  'P0001', 'registration_not_found', 'a student cannot cancel someone else''s registration');

select pg_temp.as_user('emma');
select throws_ok($$ select public.save_event((select id from fx where k = 'tournoi'), (pg_temp.event('tournoi')).version, '{"capacity": 1}'::jsonb) $$,
  'P0001', 'capacity_below_confirmed', 'capacity never goes below the confirmed seats');
select throws_ok($$ select public.save_event((select id from fx where k = 'tournoi'), (pg_temp.event('tournoi')).version, '{"waitlist_enabled": false}'::jsonb) $$,
  'P0001', 'waitlist_not_empty', 'the waiting list cannot be closed while someone waits');
select throws_ok($$ select public.save_event((select id from fx where k = 'tournoi'), (pg_temp.event('tournoi')).version,
                    '{"registration_mode": "none", "capacity": null, "waitlist_enabled": false}'::jsonb) $$,
  'P0001', 'registration_mode_locked', 'nor registration switched off while people are registered');
select lives_ok($$ select public.save_event((select id from fx where k = 'tournoi'), (pg_temp.event('tournoi')).version, '{"capacity": 3}'::jsonb) $$,
  'one more seat');
select is(pg_temp.reg_status('tournoi', 'hugo'), 'confirmed', 'goes to the waiting list first');
select throws_ok($$ select public.unpublish_event((select id from fx where k = 'tournoi')) $$,
  'P0001', 'event_has_registrations', 'an event with participants is cancelled, not unpublished');

-- The cancellation cutoff (two hours before) on an event starting in one hour.
select lives_ok($$ insert into fx (k, id) values ('soon', public.create_event((select id from fx where k = 'sports'), 'Bientôt')) $$,
  'an event starting in an hour');
select lives_ok($$ select public.save_event((select id from fx where k = 'soon'), 1, pg_temp.patch(1, 10, false) || '{"cancellation_cutoff_minutes": 120}'::jsonb) $$,
  'with a two-hour cancellation cutoff');
select lives_ok($$ select public.publish_event((select id from fx where k = 'soon')) $$, 'published');
select pg_temp.as_user('s3', 'aal1');
select is((public.register_for_event((select id from fx where k = 'soon')) ->> 'status'), 'confirmed', 'a student registers');
select throws_ok($$ select public.cancel_my_registration((select id from fx where k = 'soon')) $$,
  'P0001', 'cancellation_closed', 'past the cutoff, self-service cancellation stops');

-- =============================================================================
-- 6. Material changes, moderation, cancellation
-- =============================================================================

select pg_temp.as_user('julie');
select lives_ok($$ select public.save_event((select id from fx where k = 'atelier'), (pg_temp.event('atelier')).version,
                    jsonb_build_object('starts_at', (pg_temp.event('atelier')).starts_at + interval '1 day',
                                       'ends_at', (pg_temp.event('atelier')).ends_at + interval '1 day')) $$,
  'the Finance president reschedules a published event');
select is(pg_temp.outbox_count('atelier', 'event_changed'), 3, 'every participant is told');
select ok((select details ? 'before' and details ? 'after' from public.governance_audit_events
            where action = 'event_rescheduled' and resource_id = (select id from fx where k = 'atelier')),
  'the change is audited with the old and new values');
select pg_temp.as_user('lucas');
select lives_ok($$ select public.save_event((select id from fx where k = 'atelier'), (pg_temp.event('atelier')).version,
                    '{"summary": "Résumé corrigé."}'::jsonb) $$,
  'a wording fix needs only events.edit');

select pg_temp.as_user('julie');
select throws_ok($$ select public.hide_event((select id from fx where k = 'atelier'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'an association cannot use moderation');
select pg_temp.as_user('alice');
select lives_ok($$ select public.hide_event((select id from fx where k = 'atelier'), 'Masquage de test.') $$,
  'the BDE hides an event');
select is((pg_temp.event('atelier')).status, 'scheduled', 'hiding does not cancel it');
select is(pg_temp.reg_status('atelier', 'hugo'), 'confirmed', 'registrations stay as they were');
select pg_temp.as_user('julie');
select throws_ok($$ select public.publish_event((select id from fx where k = 'atelier')) $$,
  'P0001', 'event_hidden', 'the association cannot republish it to bypass moderation');
select pg_temp.as_user('s4', 'aal1');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'atelier')) $$,
  'P0001', 'event_not_found', 'and nobody can register meanwhile');
set local role anon;
select is(public.public_event('atelier-finance-exemple') ->> 'state', 'not_found', 'it is gone from the public site');
set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$ select public.restore_event_visibility((select id from fx where k = 'atelier'), 'Rétabli (test).') $$,
  'the BDE restores it');

select pg_temp.as_user('emma');
select throws_ok($$ select public.cancel_event((select id from fx where k = 'atelier'), 'Pirate') $$,
  'P0001', 'insufficient_permission', 'another association cannot cancel it');
select pg_temp.as_user('julie');
select throws_ok($$ select public.cancel_event((select id from fx where k = 'atelier'), '') $$,
  'P0001', 'reason_required', 'cancelling needs a reason');
select is(public.cancel_event((select id from fx where k = 'atelier'), 'Annulation de test.'), 3,
  'the organizer cancels: every participant is told');
select is((pg_temp.event('atelier')).cancellation_reason, 'Annulation de test.', 'the reason is kept');
select is(pg_temp.reg_status('atelier', 'hugo'), 'confirmed', 'registration history is kept, not deleted');
select throws_ok($$ select public.cancel_event((select id from fx where k = 'atelier'), 'Encore') $$,
  'P0001', 'event_cancelled', 'a cancelled event stays cancelled');
select pg_temp.as_user('s5', 'aal1');
select throws_ok($$ select public.register_for_event((select id from fx where k = 'atelier')) $$,
  'P0001', 'event_cancelled', 'nobody registers for a cancelled event');

-- =============================================================================
-- 7. Messages: delivery never touches registrations
-- =============================================================================

select pg_temp.as_user('hugo', 'aal1');
select ok(public.mark_notifications_read() > 0, 'a student marks their messages as read');
select is((select count(*)::integer from public.notification_outbox where recipient_id <> (select id from fx where k = 'hugo')), 0,
  'and reads no one else''s');
reset role;
set local role service_role;
select lives_ok($$ insert into fx (k, v) values ('claimed', (public.claim_notification_emails(5) -> 0 ->> 'id')) $$,
  'the e-mail worker claims a batch');
select lives_ok($$ select public.complete_notification_email((select v from fx where k = 'claimed')::bigint, false, 'smtp_down') $$,
  'a delivery fails');
reset role;
select is((select email_status || '/' || email_attempts from public.notification_outbox where id = (select v from fx where k = 'claimed')::bigint),
  'pending/1', 'the message waits for a retry');
select is(pg_temp.reg_status('tournoi', 'hugo'), 'confirmed', 'registrations are untouched by delivery problems');
set local role authenticated;
select pg_temp.as_user('hugo', 'aal1');
select throws_ok($$ select public.claim_notification_emails(5) $$, '42501', null, 'students cannot run the e-mail worker');

-- =============================================================================
-- 7b. Reads fixed forward (20261025090000_event_read_fixes)
-- =============================================================================

select pg_temp.as_user('paul', 'aal1');
select is((public.register_for_event((select id from fx where k = 'tournoi')) ->> 'status'), 'waitlisted',
  'a student who cancelled registers again (full: the waiting list)');
select pg_temp.as_user('emma');
select is((public.event_attendees((select id from fx where k = 'tournoi')) -> 'counts' ->> 'cancelled'), '0',
  'their old cancelled row no longer counts as a cancellation');
select is((public.event_attendees((select id from fx where k = 'tournoi'), null, 'paul') ->> 'total'), '1',
  'they appear once in the participant list');
select is((public.event_attendees((select id from fx where k = 'tournoi'), null, 'paul') -> 'rows' -> 0 ->> 'status'), 'waitlisted',
  'with their current registration');
select pg_temp.as_user('julie');
select lives_ok($$ select public.set_post_event((select p.id from public.posts p where p.organization_id = (select id from fx where k = 'finance')
                                                  order by p.created_at limit 1), (select id from fx where k = 'webinaire')) $$,
  'an article of Finance points to its webinar');
select is((public.post_event_options((select p.id from public.posts p where p.organization_id = (select id from fx where k = 'finance')
                                       order by p.created_at limit 1)) -> 'current' ->> 'slug'),
          (select slug from public.events where id = (select id from fx where k = 'webinaire')),
  'the editor gets the linked event''s address');

-- =============================================================================
-- 8. Revocation, deletion, ownership
-- =============================================================================

select pg_temp.as_user('lucas');
select lives_ok($$ select public.save_event((select id from fx where k = 'draft_lucas'), 1, '{"summary": "Brouillon."}'::jsonb) $$,
  'Lucas edits his draft');
select pg_temp.as_user('julie');
select lives_ok($$ select public.end_assignment((select id from fx where k = 'lucas_events'), 'Fin de mandat (test).') $$,
  'the president ends his Événements mandate');
select pg_temp.as_user('lucas');
select throws_ok($$ select public.save_event((select id from fx where k = 'j_event'), (pg_temp.event('j_event')).version, '{"summary": "x"}'::jsonb) $$,
  'P0001', 'insufficient_permission', 'an event manager whose mandate ended edits nothing');
select throws_ok($$ select public.event_attendees((select id from fx where k = 'j_event')) $$,
  'P0001', 'insufficient_permission', 'nor reads participants, in the same session');
select pg_temp.as_user('julie');
select throws_ok($$ select public.delete_event_draft((select id from fx where k = 'j_event')) $$,
  'P0001', 'event_was_published', 'an event that went online is never deleted');
select lives_ok($$ select public.delete_event_draft((select id from fx where k = 'draft_lucas')) $$,
  'a draft can be deleted');
reset role;
select throws_ok($$ update public.events set organization_id = (select id from fx where k = 'sports') where id = (select id from fx where k = 'j_event') $$,
  'P0001', 'event_owner_locked', 'an event never changes owner, not even by a direct update');
set local role authenticated;

-- Suspended association: nothing is published.
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('late', public.create_event((select id from fx where k = 'finance'), 'Après suspension')) $$,
  'a draft before the suspension');
select lives_ok($$ select public.save_event((select id from fx where k = 'late'), 1, pg_temp.patch(96, null, false)) $$, 'is filled in');
select pg_temp.as_user('alice');
select lives_ok($$ select public.set_organization_status((select id from fx where k = 'finance'), 'suspended', 'Suspension de test.') $$,
  'the BDE suspends Finance');
select pg_temp.as_user('julie');
select throws_ok($$ select public.publish_event((select id from fx where k = 'late')) $$,
  'P0001', 'insufficient_permission', 'a suspended association publishes nothing');

select * from finish();

rollback;
