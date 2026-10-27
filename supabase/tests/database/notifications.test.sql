-- Phase 10 · Notifications, e-mail delivery, preferences, broadcasts: the
-- security matrix of the brief (§94) and its workflows (§95–§101), straight
-- against the database, on top of supabase/seed.sql:
--   Alice and Marc lead the BDE; Garance is the guardian; Julie presides
--   Finance (Hugo and Lucas are members); Emma presides Sports. Tom is
--   registered to Sports' "Initiation escalade (exemple)"; Nina's event
--   "Conférence annulée (exemple)" was cancelled. Nina applied to Sports.
-- The worker's SQL steps run as the database owner, as the Edge Function
-- does. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(137);

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
  ('tom', 'a0000000-0000-4000-8000-00000000000c'),
  ('escalade', (select id from public.events where title = 'Initiation escalade (exemple)')),
  ('app_nina', (select a.id from public.applications a join auth.users u on u.id = a.candidate_id
                 join public.recruitment_positions p on p.id = a.position_id
                where split_part(u.email, '@', 1) = 'nina' and p.title = 'Événements (exemple)'));

create function pg_temp.as_user(p_key text, p_aal text default 'aal2') returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', (select id from fx where k = p_key), 'role', 'authenticated', 'aal', p_aal)::text, true);
end $f$;
grant execute on function pg_temp.as_user(text, text) to anon, authenticated, service_role;

create function pg_temp.fid(p_key text) returns uuid language sql stable as $f$ select id from fx where k = p_key $f$;
grant execute on function pg_temp.fid(text) to anon, authenticated, service_role;

-- A count as the database sees it (the test's own eyes, not a user's).
create function pg_temp.n(p_sql text) returns integer language plpgsql security definer as $f$
declare v integer;
begin
  execute p_sql into v;
  return v;
end $f$;
grant execute on function pg_temp.n(text) to anon, authenticated, service_role;

create function pg_temp.t(p_sql text) returns text language plpgsql security definer as $f$
declare v text;
begin
  execute p_sql into v;
  return v;
end $f$;
grant execute on function pg_temp.t(text) to anon, authenticated, service_role;

-- The worker's claim, as the Edge Function calls it, keeping the ids it got.
create function pg_temp.claim(p_limit integer default 50) returns jsonb language plpgsql security definer as $f$
declare v jsonb;
begin
  v := private.claim_notification_deliveries(p_limit);
  return v;
end $f$;

-- A notification and its e-mail, as a module would create them.
create function pg_temp.notify(p_user text, p_kind text, p_key text, p_payload jsonb default '{}'::jsonb) returns bigint
  language sql security definer as $f$ select private.notify((select id from fx where k = p_user), p_kind, p_key, p_payload) $f$;

create function pg_temp.delivery_of(p_notification bigint) returns public.notification_deliveries language sql stable security definer
  as $f$ select * from public.notification_deliveries where notification_id = p_notification $f$;

-- =============================================================================
-- 1. The catalog
-- =============================================================================

select is(pg_temp.n($$ select count(*)::integer from public.notification_types t
                        where not exists (select 1 from public.notification_topics tp where tp.key = t.topic) $$), 0,
  'every type belongs to a topic');
select is(pg_temp.n($$ select count(*)::integer from (select distinct kind from public.notifications) k
                        where not exists (select 1 from public.notification_types t where t.key = k.kind) $$), 0,
  'every notification kept from the Phase 7 outbox is a catalog type');
select is(pg_temp.n($$ select count(*)::integer from public.notification_types where topic in
                        (select key from public.notification_topics where class = 'essential') and importance = 'critical'
                        and key not like 'account_%' and key <> 'governance_bde_vacancy' $$), 0,
  'critical is reserved to account security and the BDE vacancy');
select is(pg_temp.n($$ select count(*)::integer from public.notification_deliveries d
                        join public.notifications n on n.id = d.notification_id where d.recipient_id <> n.recipient_id $$), 0,
  'a delivery always goes to its notification''s recipient');

-- =============================================================================
-- 2. Reading one's own notifications only (§94, §23)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('tom', 'aal1');
select ok((select count(*) from public.notifications) > 0, 'Tom reads his own notifications');
select is((select count(*)::integer from public.notifications where recipient_id <> pg_temp.fid('tom')), 0,
  'and none of anyone else''s (row level security)');
select ok(jsonb_array_length(public.my_notifications() -> 'items') > 0, 'his notification centre lists them');
select is(pg_temp.n($$ select count(*)::integer from jsonb_array_elements(public.my_notifications() -> 'items') i
                        where (i ->> 'id')::bigint not in (select id from public.notifications where recipient_id = (select id from fx where k = 'tom')) $$), 0,
  'only his');
select ok((public.my_notification_summary() ->> 'unread')::integer >= 0, 'the bell counts his unread notifications');

insert into fx (k, v) values ('nina_notification', (select id::text from public.notifications where recipient_id = pg_temp.fid('nina') limit 1));
select is(public.mark_notifications_read(array[(select v::bigint from fx where k = 'nina_notification')]), 0,
  'marking another person''s notification as read changes nothing');
select is(public.archive_notifications(array[(select v::bigint from fx where k = 'nina_notification')]), 0,
  'nor archiving it');
select throws_ok($$ select public.open_notification((select v::bigint from fx where k = 'nina_notification')) $$,
  'P0001', 'notification_not_found', 'nor opening it');
select throws_ok($$ delete from public.notifications $$, '42501', null, 'no one deletes notifications directly');

-- Forging an official message (§78).
select throws_ok($$ insert into public.notifications (recipient_id, kind, payload, dedupe_key)
                    values ((select id from fx where k = 'nina'), 'recruitment_offer', '{}', 'forged') $$,
  '42501', null, 'a student cannot insert a notification for anyone');
select throws_ok($$ select private.notify((select id from fx where k = 'nina'), 'recruitment_offer', 'forged', '{}'::jsonb) $$,
  '42501', null, 'nor call the notification engine');
select throws_ok($$ update public.notifications set kind = 'account_mfa_disabled' $$, '42501', null, 'nor change one''s own');
select throws_ok($$ select private.claim_notification_deliveries(10) $$, '42501', null, 'nor run the e-mail worker');
select throws_ok($$ select * from public.notification_deliveries $$, '42501', null, 'nor read deliveries');
select throws_ok($$ select * from public.notification_email_captures $$, '42501', null, 'nor captured e-mails');

-- Pagination: two pages, no row twice, newest first.
reset role;
select is(pg_temp.n($$ select count(*)::integer from (select private.notify((select id from fx where k = 'tom'), 'campus_announcement',
                                                               'page-test:' || g, jsonb_build_object('title', 'Annonce ' || g))
                                                        from generate_series(1, 7) g) x $$), 7, 'seven more notifications for Tom');
set local role authenticated;
select pg_temp.as_user('tom', 'aal1');
insert into fx (k, v) values ('page1', (public.my_notifications('all', null, null, null, 4))::text);
select is(jsonb_array_length((select v::jsonb from fx where k = 'page1') -> 'items'), 4, 'a page of four');
select ok((select v::jsonb from fx where k = 'page1') -> 'next' is not null and (select v::jsonb from fx where k = 'page1') -> 'next' <> 'null'::jsonb,
  'with a cursor to the next one');
insert into fx (k, v) values ('page2', (public.my_notifications('all', null,
  ((select v::jsonb from fx where k = 'page1') -> 'next' ->> 'before')::timestamptz,
  ((select v::jsonb from fx where k = 'page1') -> 'next' ->> 'before_id')::bigint, 4))::text);
select is(pg_temp.n($$ select count(*)::integer from jsonb_array_elements((select v::jsonb from fx where k = 'page2') -> 'items') b
                        where (b ->> 'id') in (select a ->> 'id' from jsonb_array_elements((select v::jsonb from fx where k = 'page1') -> 'items') a) $$), 0,
  'the second page repeats nothing of the first');
select throws_ok($$ select public.my_notifications('everything') $$, 'P0001', 'filter_invalid', 'an unknown view is refused');
select ok(public.mark_notifications_read() > 0, 'Tom marks all his notifications read');
select is((public.my_notification_summary() ->> 'unread')::integer, 0, 'nothing unread any more');
select is(public.archive_notifications(array[(select (i ->> 'id')::bigint from jsonb_array_elements((select v::jsonb from fx where k = 'page1') -> 'items') i limit 1)]), 1,
  'he archives one');
select is(jsonb_array_length(public.my_notifications('archived') -> 'items'), 1, 'it moves to the archived view');

-- =============================================================================
-- 3. Idempotency and channels (§47, §81)
-- =============================================================================

reset role;
insert into fx (k, v) values ('dup1', pg_temp.notify('hugo', 'event_cancelled', 'test:dup:hugo', '{"title": "Test"}')::text);
select ok((select v from fx where k = 'dup1') is not null, 'a notification is created');
select is(pg_temp.notify('hugo', 'event_cancelled', 'test:dup:hugo', '{"title": "Test"}'), null::bigint,
  'the same source processed again creates nothing');
select is(pg_temp.n($$ select count(*)::integer from public.notifications where dedupe_key = 'test:dup:hugo' $$), 1,
  'one notification');
select is(pg_temp.n($$ select count(*)::integer from public.notification_deliveries where notification_id = (select v::bigint from fx where k = 'dup1') $$), 1,
  'one e-mail delivery');
select throws_ok($$ select private.notify((select id from fx where k = 'hugo'), 'made_up_kind', 'x') $$, 'P0001', 'notification_type_unknown',
  'an unknown type is refused');

-- =============================================================================
-- 4. Preferences: optional, operational, essential (§16, §29–33, §98)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('hugo', 'aal1');
select throws_ok($$ select public.set_notification_preference('event_registration', true, false) $$, 'P0001', 'topic_essential',
  'an essential topic cannot be turned off');
select is(public.set_notification_preference('event_reminders', false, false) ->> 'in_app', 'true',
  'an operational topic stays in the notification centre');
select is(public.set_notification_preference('followed_updates', true, true) ->> 'email', 'true', 'Hugo opts in to e-mails from followed associations');
select is(public.set_notification_preference('followed_updates', true, false) ->> 'email', 'false', 'then out again');
select is(pg_temp.n($$ select count(*)::integer from public.notification_preference_changes where user_id = (select id from fx where k = 'hugo') $$), 3,
  'each change is recorded (his consent record)');
select throws_ok($$ insert into public.notification_preferences (user_id, topic, in_app, email)
                    values ((select id from fx where k = 'nina'), 'followed_updates', true, true) $$, '42501', null,
  'nobody writes someone else''s preferences');
reset role;
insert into fx (k, v) values
  ('pref_optional', pg_temp.notify('hugo', 'followed_post_published', 'test:optional:hugo', '{"title": "Article"}')::text);
insert into fx (k, v) values
  ('pref_operational', pg_temp.notify('hugo', 'event_reminder', 'test:reminder:hugo', '{"title": "Rappel"}')::text);
insert into fx (k, v) values
  ('pref_essential', pg_temp.notify('hugo', 'event_changed', 'test:essential:hugo', '{"title": "Changement"}')::text);
select ok((select v from fx where k = 'pref_optional') is not null and (pg_temp.delivery_of((select v::bigint from fx where k = 'pref_optional'))).id is null,
  'an optional message to someone who opted out of its e-mail: in-app only');
select ok((select v from fx where k = 'pref_operational') is not null and (pg_temp.delivery_of((select v::bigint from fx where k = 'pref_operational'))).id is null,
  'an operational reminder whose e-mail he turned off: in-app only');
select ok((pg_temp.delivery_of((select v::bigint from fx where k = 'pref_essential'))).id is not null,
  'an essential change still gets its e-mail');

-- Defaults: optional e-mails start off.
select is((select c.email from private.notification_choice((select id from fx where k = 'lea'), 'bde_announcements') c), false,
  'BDE announcements are not e-mailed until a student opts in');
select is((select c.email from private.notification_choice((select id from fx where k = 'lea'), 'recruitment_candidate') c), true,
  'application updates are');

-- Quiet hours (optional and operational e-mails only).
insert into public.notification_settings (user_id, quiet_hours, quiet_start, quiet_end, timezone)
values ((select id from fx where k = 'lea'), true,
        ((now() at time zone 'Europe/Paris') - interval '1 hour')::time, ((now() at time zone 'Europe/Paris') + interval '1 hour')::time, 'Europe/Paris');
select ok(private.notification_quiet_until((select id from fx where k = 'lea'), now()) > now(), 'Léa is in her quiet hours');
select ok(private.notification_quiet_until((select id from fx where k = 'tom'), now()) is null, 'Tom set none');

-- =============================================================================
-- 5. The worker: claim, retries, unknown outcomes, provider events (§46–53, §96–97)
-- =============================================================================

update public.notification_config set delivery_mode = 'off' where id;
select is(jsonb_array_length(pg_temp.claim()), 0, 'e-mails off: the worker claims nothing');
update public.notification_config set delivery_mode = 'capture' where id;

-- Only the new test messages are due: the rest wait.
update public.notification_deliveries set next_attempt_at = now() + interval '1 day' where status = 'queued';
insert into fx (k, v) values ('essential', pg_temp.notify('julie', 'event_cancelled', 'test:worker:julie', '{"title": "Test"}')::text);
insert into fx (k, v) values ('optional', pg_temp.notify('julie', 'association_message', 'test:worker:julie:opt', '{"title": "Réunion", "body": "Demain."}')::text);
insert into fx (k, v) values ('claim1', pg_temp.claim()::text);
select is(jsonb_array_length((select v::jsonb from fx where k = 'claim1')), 2, 'the worker claims the two due e-mails');
select ok((select bool_and(c ->> 'email' like '%@%') from jsonb_array_elements((select v::jsonb from fx where k = 'claim1')) c),
  'with the recipient''s address (the worker''s only)');
select ok((select (c ->> 'unsubscribe') is null from jsonb_array_elements((select v::jsonb from fx where k = 'claim1')) c
            where (c ->> 'essential')::boolean), 'no unsubscribe link on an essential message');
select ok((select (c ->> 'unsubscribe') ~ '^[0-9a-f]{64}$' from jsonb_array_elements((select v::jsonb from fx where k = 'claim1')) c
            where not (c ->> 'essential')::boolean), 'an unsubscribe token on an operational one');
select is(jsonb_array_length(pg_temp.claim()), 0, 'a second worker at the same time gets nothing (leased)');
select is((pg_temp.delivery_of((select v::bigint from fx where k = 'essential'))).status, 'processing', 'leased while processing');

insert into fx (k, v) values ('d_ess', (pg_temp.delivery_of((select v::bigint from fx where k = 'essential'))).id::text);
insert into fx (k, v) values ('d_opt', (pg_temp.delivery_of((select v::bigint from fx where k = 'optional'))).id::text);
select is(private.complete_notification_delivery((select v::bigint from fx where k = 'd_ess'), 'outcome_unknown', 'capture'), 'failed_retryable',
  'a send whose outcome is unknown (timeout) is retried later');
select ok((select next_attempt_at >= now() + interval '9 minutes' from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')),
  'not before the provider had time to report it');
select is(private.complete_notification_delivery((select v::bigint from fx where k = 'd_ess'), 'provider_accepted', 'capture'), 'failed_retryable',
  'a late report for a delivery no longer leased changes nothing');

-- The provider reports the first attempt: reconciled, not sent twice.
select is(private.record_provider_event('brevo', 'request', '<m1@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), now()) ->> 'recorded', 'true',
  'the provider''s event is recorded');
select is((select status from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), 'provider_accepted',
  'the unknown outcome is reconciled: accepted, no second send');
select is(private.record_provider_event('brevo', 'request', '<m1@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), now() - interval '1 second') ->> 'recorded', 'true',
  'another event of the same kind (later timestamp) is recorded');
select is(private.record_provider_event('brevo', 'delivered', '<m1@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), '2026-01-01T10:00:00Z') ->> 'recorded', 'true',
  'delivered');
select is(private.record_provider_event('brevo', 'delivered', '<m1@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), '2026-01-01T10:00:00Z') ->> 'duplicate', 'true',
  'the same webhook twice is recorded once');
select is((select status from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), 'delivered', 'delivered stays delivered');
select is(private.record_provider_event('brevo', 'request', '<m1@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), '2025-12-31T10:00:00Z') ->> 'recorded', 'true',
  'an older event arriving late');
select is((select status from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_ess')), 'delivered',
  'never moves a delivery backwards');
select is(private.record_provider_event('brevo', 'opened', '<m1@test>', null, now()) ->> 'ignored', 'true', 'opens are not tracked');
select throws_ok($$ select private.record_provider_event('mailchimp', 'delivered', 'x', null, now()) $$, 'P0001', 'provider_event_invalid',
  'an unknown provider is refused');
select is(private.notification_token_ok('notifications_webhook_token', 'forged-token-forged-token-forged-token'), false,
  'a webhook call without the shared token is refused');
select is(private.notification_token_ok('notifications_worker_token', null), false, 'so is a worker call');

-- A provider that is down: retries with backoff, then failed for good; the business record is untouched.
update public.notification_deliveries set attempts = 6 where id = (select v::bigint from fx where k = 'd_opt');
select is(private.complete_notification_delivery((select v::bigint from fx where k = 'd_opt'), 'failed_retryable', 'capture', null, 'transport_down'),
  'failed_permanent', 'after the last attempt a failing e-mail stops');
select ok(exists (select 1 from public.notifications where id = (select v::bigint from fx where k = 'optional')),
  'its in-app notification is still there');

-- A bounce suppresses the address; the next e-mail to it is not sent.
select is(private.record_provider_event('brevo', 'hard_bounce', '<m2@test>', (select idempotency_key::text from public.notification_deliveries where id = (select v::bigint from fx where k = 'd_opt')), now()) ->> 'matched', 'true',
  'a hard bounce');
select is(pg_temp.n($$ select count(*)::integer from public.notification_suppressions where user_id = (select id from fx where k = 'julie') and cleared_at is null $$), 1,
  'suppresses the address (stored as a hash)');
insert into fx (k, v) values ('after_bounce', pg_temp.notify('julie', 'event_cancelled', 'test:bounce:julie', '{"title": "X"}')::text);
select is(jsonb_array_length(pg_temp.claim()), 0, 'the next e-mail to that address is not handed to the worker');
select is((pg_temp.delivery_of((select v::bigint from fx where k = 'after_bounce'))).status, 'suppressed', 'it is marked suppressed');
set local role authenticated;
select pg_temp.as_user('julie');
select ok(public.my_notification_preferences() -> 'suppression' ->> 'reason' = 'hard_bounce', 'Julie sees why she gets no e-mail');
select is(public.clear_my_email_suppression(), 1, 'and can ask for e-mails again');
reset role;

-- A crashed worker: its lease expires and the message comes back.
insert into fx (k, v) values ('crash', pg_temp.notify('lucas', 'event_cancelled', 'test:crash:lucas', '{"title": "X"}')::text);
select is(jsonb_array_length(pg_temp.claim()), 1, 'Lucas''s e-mail is claimed');
update public.notification_deliveries set lease_until = now() - interval '1 second'
 where id = (pg_temp.delivery_of((select v::bigint from fx where k = 'crash'))).id;
select is(jsonb_array_length(pg_temp.claim()), 1, 'after the lease, another run takes it again');
select is((select outcome from public.notification_delivery_attempts where delivery_id = (pg_temp.delivery_of((select v::bigint from fx where k = 'crash'))).id
            order by attempt limit 1), 'outcome_unknown', 'the lost attempt is recorded as unknown');

-- =============================================================================
-- 6. Unsubscribe links (§34)
-- =============================================================================

set local role anon;
select is(public.unsubscribe_with_token('not-a-token') ->> 'status', 'invalid', 'a malformed token is refused');
select is(public.unsubscribe_with_token(repeat('a', 64)) ->> 'status', 'invalid', 'an unknown token is refused');
reset role;
insert into fx (k, v) values ('token', (select c ->> 'unsubscribe' from jsonb_array_elements((select v::jsonb from fx where k = 'claim1')) c
                                        where not (c ->> 'essential')::boolean));
set local role anon;
select is(public.peek_unsubscribe_token((select v from fx where k = 'token')) ->> 'status', 'valid', 'a real token is recognised without signing in');
select is(public.unsubscribe_with_token((select v from fx where k = 'token')) ->> 'status', 'done', 'one click unsubscribes');
select is(public.unsubscribe_with_token((select v from fx where k = 'token')) ->> 'status', 'already', 'a second click changes nothing');
reset role;
select is((select c.email from private.notification_choice((select id from fx where k = 'julie'), 'association_messages') c), false,
  'Julie gets no more association e-mails');
select is((select source from public.notification_preference_changes where user_id = (select id from fx where k = 'julie')
            order by id desc limit 1), 'unsubscribe_link', 'recorded as coming from the link');
select is((select c.email from private.notification_choice((select id from fx where k = 'julie'), 'governance_actions') c), true,
  'her essential messages are untouched');

-- =============================================================================
-- 7. Reminders follow the current state (§54–56, §101)
-- =============================================================================

update public.notification_deliveries set next_attempt_at = now() + interval '1 day' where status in ('queued', 'failed_retryable');
select ok(exists (select 1 from public.event_registrations r where r.event_id = pg_temp.fid('escalade') and r.user_id = pg_temp.fid('tom')
                   and r.status = 'confirmed'), 'Tom is registered to the climbing session');
insert into fx (k, v)
select 'old_reminder', (select private.notify(pg_temp.fid('tom'), 'event_reminder',
                          'event:' || e.id || ':reminder:test:' || pg_temp.fid('tom'),
                          private.event_message_payload(e), e.organization_id, 'event', e.id, e.id))::text
  from public.events e where e.id = pg_temp.fid('escalade');
set local role authenticated;
select pg_temp.as_user('emma');
select lives_ok($$ select public.save_event((select id from fx where k = 'escalade'), (select version from public.events where id = (select id from fx where k = 'escalade')),
                    jsonb_build_object('starts_at', (select starts_at from public.events where id = (select id from fx where k = 'escalade')) + interval '2 hours',
                                       'ends_at', (select ends_at from public.events where id = (select id from fx where k = 'escalade')) + interval '2 hours')) $$,
  'Emma moves the session two hours later');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('tom') and kind = 'event_changed' and event_id = pg_temp.fid('escalade')
                   and created_at = now()), 'Tom is told of the change');
select ok(private.notification_obsolete((select v::bigint from fx where k = 'old_reminder')), 'the reminder for the old time is obsolete');
update public.notification_deliveries set next_attempt_at = now() - interval '1 second'
 where notification_id = (select v::bigint from fx where k = 'old_reminder');
select is(pg_temp.n($$ select count(*)::integer from jsonb_array_elements(pg_temp.claim()) c
                        where (c ->> 'id')::bigint = (pg_temp.delivery_of((select v::bigint from fx where k = 'old_reminder'))).id $$), 0,
  'the worker does not send it');
select is((pg_temp.delivery_of((select v::bigint from fx where k = 'old_reminder'))).last_error, 'obsolete', 'it is cancelled as obsolete');
select ok((select archived_at is not null from public.notifications where id = (select v::bigint from fx where k = 'old_reminder')),
  'and leaves the notification centre');
set local role authenticated;
select pg_temp.as_user('tom', 'aal1');
select lives_ok($$ select public.cancel_my_registration((select id from fx where k = 'escalade')) $$, 'Tom cancels his registration');
reset role;
select is(pg_temp.n($$ select count(*)::integer from public.notifications where recipient_id = (select id from fx where k = 'tom')
                        and kind = 'event_reminder' and event_id = (select id from fx where k = 'escalade') and archived_at is null
                        and not private.notification_obsolete(id) $$), 0,
  'no attendance reminder for him stays valid');
select ok(jsonb_typeof(private.enqueue_due_reminders()) = 'object', 'the consolidated reminder job runs');

-- =============================================================================
-- 8. Recruitment privacy and decision release (§76–77, §100)
-- =============================================================================

select is(pg_temp.n($$ select count(*)::integer from public.notifications n
                        where n.application_id = (select id from fx where k = 'app_nina') and n.recipient_id = (select id from fx where k = 'nina')
                          and n.kind in ('recruitment_rejected', 'recruitment_offer', 'recruitment_waitlisted') $$), 0,
  'no outcome message before a release');
select ok(not exists (select 1 from public.notifications n where n.recipient_id = pg_temp.fid('nina')
                        and (n.payload ? 'note' or n.payload ? 'scores' or n.payload ? 'rationale' or n.payload ? 'recommendation')),
  'nothing internal in any of Nina''s notifications');
select ok(not exists (select 1 from public.notifications n where n.kind like 'recruitment_%' and n.payload ? 'answers'),
  'no application answer in any recruitment notification');

-- A reviewer told of their appointment, then revoked, opens the old notification.
insert into fx (k, id) select 'spo', c.id from public.recruitment_campaigns c join public.organizations o on o.id = c.organization_id
 where c.title = 'Recrutement 2027 (exemple)' and o.slug = 'exemple-sports';
insert into fx (k, id) select 'julie_sports', m.id from public.memberships m
 where m.organization_id = pg_temp.fid('sports') and m.user_id = pg_temp.fid('julie');
set local role authenticated;
select pg_temp.as_user('emma');
insert into fx (k, id) values ('member', public.appoint_recruitment_member(pg_temp.fid('spo'), pg_temp.fid('julie_sports'), 'reviewer',
  array['view', 'documents', 'review'], 'campaign', null, now() + interval '1 month'));
reset role;
insert into fx (k, v) values ('appointed', (select id::text from public.notifications where recipient_id = pg_temp.fid('julie')
                                             and kind = 'recruitment_review_assigned' order by id desc limit 1));
select ok((select v from fx where k = 'appointed') is not null, 'Julie is told she reviews Sports'' applications');
set local role authenticated;
select pg_temp.as_user('julie');
select ok(public.recruitment_application(pg_temp.fid('app_nina')) is not null, 'she opens Nina''s application');
select pg_temp.as_user('emma');
select lives_ok($$ select public.revoke_recruitment_member((select id from fx where k = 'member'), 'Fin du test.') $$, 'Emma ends her appointment');
select pg_temp.as_user('julie');
select lives_ok($$ select public.open_notification((select v::bigint from fx where k = 'appointed')) $$, 'the old notification still opens');
select throws_ok($$ select public.recruitment_application((select id from fx where k = 'app_nina')) $$, 'P0001', 'application_not_found',
  'but the application does not: a notification is not an access');
reset role;
select ok(not exists (select 1 from private.application_users_with((select a from public.applications a where a.id = pg_temp.fid('app_nina')), 'view') u
                       where u = pg_temp.fid('julie')), 'and the team''s next messages no longer reach her');

-- =============================================================================
-- 9. Broadcasts (§62–69, §99)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'bde'), 'all_students', 'Annonce pirate', 'Texte.') $$,
  'P0001', 'insufficient_permission', 'an association officer cannot write to all students');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'sports'), 'members', 'Réunion', 'Texte.') $$,
  'P0001', 'insufficient_permission', 'nor to another association''s members');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'finance'), 'everyone@example.test', 'Liste', 'Texte.') $$,
  'P0001', 'audience_invalid', 'an audience is never a list of addresses');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'finance'), 'members', 'Réunion', 'Texte.', 'https://ailleurs.example.test') $$,
  'P0001', 'link_invalid', 'a link only to a public page of the site');
select ok((select bool_and(o ? 'audience' and o ? 'recipients' and o ? 'email')
             from jsonb_array_elements(public.notification_broadcast_options((select id from fx where k = 'finance')) -> 'options') o),
  'each audience option carries its own estimate');
insert into fx (k, v) values ('fin_b', public.create_notification_broadcast((select id from fx where k = 'finance'), 'members',
  'Réunion d''équipe (test)', 'Demain à 18 h, salle fictive.') ->> 'id');
select ok((select v from fx where k = 'fin_b') is not null, 'Julie drafts a message to Finance''s members');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'finance'), 'members',
                    'Réunion d''équipe (test)', 'Demain à 18 h, salle fictive.') $$,
  'P0001', 'broadcast_duplicate', 'the same text twice is refused');
select is(public.submit_notification_broadcast((select v::uuid from fx where k = 'fin_b')) ->> 'status', 'queued', 'submitted, it is queued');
select is(public.submit_notification_broadcast((select v::uuid from fx where k = 'fin_b')) ->> 'already', 'true', 'a second click changes nothing');
select pg_temp.as_user('garance');
select throws_ok($$ select public.create_notification_broadcast((select id from fx where k = 'bde'), 'all_students', 'Annonce', 'Texte.') $$,
  'P0001', 'insufficient_permission', 'the guardian cannot write to students');
reset role;
select ok(private.dispatch_notification_broadcasts() > 0, 'the dispatcher works through it');
select is((select status from public.notification_broadcasts where id = (select v::uuid from fx where k = 'fin_b')), 'dispatched', 'dispatched');
select ok(exists (select 1 from public.notifications where broadcast_id = (select v::uuid from fx where k = 'fin_b') and recipient_id = pg_temp.fid('hugo')),
  'Hugo, a Finance member, gets it');
select ok(not exists (select 1 from public.notifications where broadcast_id = (select v::uuid from fx where k = 'fin_b') and recipient_id = pg_temp.fid('emma')),
  'Emma, not a member, does not');
select is((select n.kind from public.notifications n where n.broadcast_id = (select v::uuid from fx where k = 'fin_b') limit 1), 'association_message',
  'it is an association message');

-- A campus-wide e-mail needs a second BDE approval.
set local role authenticated;
select pg_temp.as_user('alice');
insert into fx (k, v) values ('bde_b', public.create_notification_broadcast((select id from fx where k = 'bde'), 'all_students',
  'Assemblée générale (test)', 'Jeudi, lieu fictif.', null, true, 'important') ->> 'id');
select is(public.submit_notification_broadcast((select v::uuid from fx where k = 'bde_b')) ->> 'status', 'pending_approval',
  'Alice''s campus-wide e-mail waits for a second approval');
select throws_ok($$ select public.approve_notification_broadcast((select v::uuid from fx where k = 'bde_b')) $$, 'P0001', 'approver_must_differ',
  'she cannot approve her own');
select pg_temp.as_user('julie');
select throws_ok($$ select public.approve_notification_broadcast((select v::uuid from fx where k = 'bde_b')) $$, 'P0001', 'insufficient_permission',
  'an association president cannot approve it');
select pg_temp.as_user('marc', 'aal1');
select throws_ok($$ select public.approve_notification_broadcast((select v::uuid from fx where k = 'bde_b')) $$, 'P0001', 'mfa_required',
  'Marc needs his second factor');
select pg_temp.as_user('marc');
select is(public.approve_notification_broadcast((select v::uuid from fx where k = 'bde_b')) ->> 'status', 'queued', 'Marc approves it');
reset role;
select lives_ok($$ select private.dispatch_notification_broadcasts(100000) $$, 'dispatched');
select ok(exists (select 1 from public.notifications where broadcast_id = (select v::uuid from fx where k = 'bde_b') and recipient_id = pg_temp.fid('lea')
                   and importance = 'important'), 'Léa sees it in her notification centre, marked important');
select is((select count(*)::integer from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
            where n.broadcast_id = (select v::uuid from fx where k = 'bde_b')
              and not private.notification_email_wanted(d.recipient_id, 'bde_announcements')), 0,
  'e-mails only to students who opted in to BDE announcements');
select is((select count(*)::integer from public.governance_audit_events where resource_id = (select v::uuid from fx where k = 'bde_b')
            and action in ('notification_broadcast_created', 'notification_broadcast_submitted', 'notification_broadcast_approved',
                           'notification_broadcast_dispatched')), 4,
  'created, submitted, approved, dispatched: all in the audit');

-- =============================================================================
-- 10. Producers that did not exist before (governance, publishing, security)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.invite_member((select id from fx where k = 'finance'), 'lea@comptes.example.test') $$,
  'Julie invites Léa to Finance');
reset role;
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('lea') and kind = 'governance_invitation_received'),
  'Léa is told');
select ok(exists (select 1 from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
                   where n.recipient_id = pg_temp.fid('lea') and n.kind = 'governance_invitation_received'),
  'by e-mail too (an essential request)');

-- A factor as Supabase Auth writes it (the full column set exists on the real stack only).
do $mfa$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'mfa_factors' and column_name = 'factor_type') then
    execute $q$insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
               values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000008', 'test', 'totp', 'unverified', now(), now())$q$;
  else
    insert into auth.mfa_factors (user_id, status) values ('a0000000-0000-4000-8000-000000000008', 'unverified');
  end if;
end;
$mfa$;
update auth.mfa_factors set status = 'verified' where user_id = pg_temp.fid('hugo') and status = 'unverified';
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('hugo') and kind = 'account_mfa_enabled'),
  'turning on the second factor is told to its owner');
delete from auth.mfa_factors where user_id = pg_temp.fid('hugo') and status = 'verified';
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('hugo') and kind = 'account_mfa_disabled'),
  'and turning it off');

-- =============================================================================
-- 11. Retention (§28)
-- =============================================================================

insert into fx (k, v) values ('records', (select (select count(*) from public.event_registrations) || '/' || (select count(*) from public.applications)));
update public.notifications set read_at = now() - interval '7 months', created_at = now() - interval '7 months'
 where recipient_id = pg_temp.fid('lucas');
select ok((private.purge_notifications() ->> 'notifications')::integer > 0, 'old read notifications are purged');
select is((select (select count(*) from public.event_registrations) || '/' || (select count(*) from public.applications)),
  (select v from fx where k = 'records'), 'the registrations and applications they were about are untouched');

select * from finish();

rollback;
