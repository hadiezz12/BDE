-- Phase 11 · Continuity: academic years and the rollover, expiry without
-- jobs, the governance checker (detection, reminders, escalation,
-- resolution), mandate reminders, handover checklists, the transfer of a
-- reviewer's work, the job dispatcher, retention, the institutional
-- register, backups, incidents, the continuity reads and daylight saving —
-- the security matrix of the brief (§116) and its simulations (§107–115),
-- straight against the database. Runs on top of supabase/seed.sql (Alice and
-- Marc lead the BDE until ten months from now, an open BDE succession waits
-- for Marc; Garance is the guardian; Julie presides Finance, Emma Sports
-- with Paul proposed after her; Lucas holds Communication and Événements in
-- Finance with a delegation; Hugo's treasurer mandate ended last month).
--
-- Time: nothing here changes the clock. Authorizations are read at a given
-- instant through the database's own functions (p_at / p_now), which no API
-- role may call, so a client never chooses the time of a check (§105).
-- Two simultaneous runs of a job and two storage workers are tested by
-- supabase/tests/concurrency/continuity.sh. Everything is rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(164);

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
  ('hugo', 'a0000000-0000-4000-8000-000000000008'),
  ('paul', 'a0000000-0000-4000-8000-00000000000a');
insert into fx (k, id)
select 'a_julie', a.id from public.position_assignments a
 where a.user_id = 'a0000000-0000-4000-8000-000000000004' and a.office = 'association_president' and a.status = 'active';
insert into fx (k, id)
select 't_sports', t.id from public.leadership_transitions t
 where t.organization_id = (select id from fx where k = 'sports') and t.status = 'open';
insert into fx (k, id)
select 'spo', c.id from public.recruitment_campaigns c
 where c.organization_id = (select id from fx where k = 'sports') and c.title = 'Recrutement 2027 (exemple)';
insert into fx (k, id)
select 'app_nina', a.id from public.applications a where a.campaign_id = (select id from fx where k = 'spo') and a.status = 'submitted';
insert into fx (k, id) values ('current_year', (select id from public.academic_years where status = 'current'));

-- Paul joins Sports as a plain member (fixture for the committee).
insert into public.memberships (organization_id, user_id, status)
values ((select id from fx where k = 'sports'), (select id from fx where k = 'paul'), 'active')
on conflict do nothing;

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

-- Everything the rollover must leave untouched, as one fingerprint.
create function pg_temp.world() returns text language sql stable security definer as $f$
  select concat_ws('/',
    (select count(*) || ':' || string_agg(id::text || o.status || o.slug, ',' order by id) from public.organizations o),
    (select count(*) || ':' || count(*) filter (where status = 'active') from public.memberships),
    (select count(*) || ':' || string_agg(id::text || status || ends_at::text, ',' order by id) from public.position_assignments),
    (select count(*) from public.delegations where status = 'active'),
    (select count(*) || ':' || count(*) filter (where publication = 'published') from public.posts),
    (select count(*) || ':' || count(*) filter (where status = 'scheduled') from public.events),
    (select count(*) || ':' || count(*) filter (where status = 'confirmed') from public.event_registrations),
    (select count(*) || ':' || count(*) filter (where status = 'submitted') from public.applications),
    (select count(*) from public.recruitment_campaigns),
    (select count(*) from public.leadership_transitions));
$f$;
grant execute on function pg_temp.world() to anon, authenticated, service_role;

-- =============================================================================
-- 1. Structure and closed doors (as the owner)
-- =============================================================================

select is(pg_temp.n($$ select count(*) from public.academic_years where status = 'current' $$), 1, 'exactly one current academic year');
select ok((select mandate_ends_at = ((ends_on + time '23:59')::timestamp at time zone 'Europe/Paris')
             from public.academic_years where status = 'current'),
  'the seeded year suggests mandates ending on its last day, 23:59 in Paris');
select throws_ok($$ insert into public.academic_years (label, starts_on, ends_on, status, mandate_starts_at, mandate_ends_at)
                   values ('2090–2091', '2090-09-01', '2091-08-31', 'current', '2090-09-01', '2091-08-31') $$,
  '23505', null, 'a second current year is refused by the database');
select throws_ok($$ insert into public.academic_years (label, starts_on, ends_on, mandate_starts_at, mandate_ends_at)
                   select '1999–2000', starts_on + 10, ends_on + 10, mandate_starts_at, mandate_ends_at
                     from public.academic_years where status = 'current' $$,
  '23P01', null, 'two years never overlap');
select is(pg_temp.n($$ select count(*) from public.scheduled_jobs $$), 10, 'ten recurring jobs in the catalog');
select is(pg_temp.n($$ select count(*) from public.retention_policies where keep_months is not null $$), 0,
  'no retention period is configured by default (nothing is deleted until the BDE decides)');
select ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname ~ '(dump|download_backup|backup_download|restore_backup|restore_database|export_database|run_sql|execute_sql|exec_sql|run_job|run_any)'),
  'no RPC downloads a backup, restores one or runs arbitrary SQL or jobs');
select ok(not has_function_privilege('authenticated', 'private.check_governance_health(timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'private.detect_governance_issues(timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'private.enqueue_mandate_reminders(timestamptz)', 'execute')
          and not has_function_privilege('authenticated', 'private.user_has_organization_permission(uuid, uuid, text, timestamptz)', 'execute'),
  'no API role can run a check at a time it chooses (no client clock)');
select ok(not has_function_privilege('authenticated', 'private.run_scheduled_job(text, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.run_retention()', 'execute')
          and not has_function_privilege('authenticated', 'private.execute_job(text)', 'execute')
          and not has_function_privilege('service_role', 'private.run_scheduled_job(text, text, uuid)', 'execute'),
  'the dispatcher and the retention job are not RPCs');
select ok(not has_function_privilege('service_role', 'public.claim_storage_cleanup(integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.claim_storage_cleanup(integer)', 'execute'),
  'the storage claim is no longer callable through the API (the Edge Function uses its database connection)');

-- =============================================================================
-- 2. Expiry needs no job (§17, §18, §116 rows 1–4)
-- =============================================================================

select ok(not private.user_has_organization_permission(pg_temp.fid('hugo'), pg_temp.fid('finance'), 'members.view', now())
          and exists (select 1 from public.position_assignments a where a.user_id = pg_temp.fid('hugo') and a.status = 'active'),
  'Hugo''s ended mandate grants nothing although its row still says active (no cleanup job involved)');
select ok(private.user_has_organization_permission(pg_temp.fid('lucas'), pg_temp.fid('finance'), 'members.invite', now())
          and not private.user_has_organization_permission(pg_temp.fid('lucas'), pg_temp.fid('finance'), 'members.invite', now() + interval '11 days')
          and (select status from public.delegations where delegate_user_id = pg_temp.fid('lucas')) = 'active',
  'Lucas''s delegation stops at its end date, still "active" in its row: no job ends it');

set local role authenticated;
select pg_temp.as_user('hugo');
select throws_ok($$ select public.organization_continuity(pg_temp.fid('finance')) $$, 'P0001', 'insufficient_permission',
  'a former officer, still signed in, reads no continuity of the association');

-- Julie hands Finance over to Lucas, effective in three days (§107).
select pg_temp.as_user('julie');
select lives_ok($$ insert into fx (k, id) values ('t_fin', public.propose_association_succession(pg_temp.fid('finance'),
                     'lucas.finance@comptes.example.test', now() + interval '6 months', now() + interval '3 days')) $$,
  'Julie proposes Lucas, effective in three days');
select pg_temp.as_user('lucas');
select is(public.respond_to_leadership_candidacy(pg_temp.fid('t_fin'), true), 'completed', 'Lucas accepts: the transition is scheduled');
reset role;
select ok(not private.user_has_organization_permission(pg_temp.fid('lucas'), pg_temp.fid('finance'), 'governance.succession', now())
          and private.user_has_organization_permission(pg_temp.fid('julie'), pg_temp.fid('finance'), 'governance.succession', now()),
  'before the effective time Julie keeps her powers and Lucas has none of the presidency''s');
select ok(private.user_has_organization_permission(pg_temp.fid('lucas'), pg_temp.fid('finance'), 'governance.succession', now() + interval '4 days')
          and not private.user_has_organization_permission(pg_temp.fid('julie'), pg_temp.fid('finance'), 'governance.succession', now() + interval '4 days'),
  'at the effective time Lucas presides and Julie''s presidential powers stop, with no job');
select ok(exists (select 1 from public.memberships where organization_id = pg_temp.fid('finance') and user_id = pg_temp.fid('julie') and status = 'active'),
  'Julie stays a member of Finance');
select is(pg_temp.n($$ select count(*) from public.governance_audit_events where resource_id = (select id from fx where k = 't_fin') $$) >= 2, true,
  'the history records the proposal and its completion');

-- =============================================================================
-- 3. Mandate reminders (§19, §20)
-- =============================================================================

insert into fx (k, id, v) select 'lucas_events', a.id, a.ends_at::text from public.position_assignments a
  join public.positions p on p.id = a.position_id
 where a.user_id = pg_temp.fid('lucas') and p.title = 'Événements' and a.status = 'active';
select ok(private.enqueue_mandate_reminders((select v::timestamptz from fx where k = 'lucas_events') - interval '10 days') > 0,
  'ten days before a mandate ends, its reminder is queued');
select is(pg_temp.n($$ select count(*) from public.notifications where dedupe_key like 'mandate:' || (select id from fx where k = 'lucas_events') || ':14:%' $$), 1,
  'only the closest offset (14 days), not the 60- and 30-day ones at once');
select lives_ok($$ select private.enqueue_mandate_reminders((select v::timestamptz from fx where k = 'lucas_events') - interval '10 days') $$,
  'the worker runs again');
select is(pg_temp.n($$ select count(*) from public.notifications where dedupe_key like 'mandate:' || (select id from fx where k = 'lucas_events') || ':%' $$), 1,
  'a repeated run sends no second reminder');
select lives_ok($$ select private.enqueue_mandate_reminders((select v::timestamptz from fx where k = 'lucas_events') - interval '5 days') $$,
  'five days before the end');
select is(pg_temp.n($$ select count(*) from public.notifications where dedupe_key like 'mandate:' || (select id from fx where k = 'lucas_events') || ':7:%' $$), 1,
  'the 7-day reminder goes out once');
select lives_ok($$ select private.enqueue_mandate_reminders(now()) $$, 'reminders now');
select is(pg_temp.n($$ select count(*) from public.notifications where dedupe_key like 'mandate:' || (select id from fx where k = 'a_julie') || ':%' $$), 0,
  'Julie''s presidency ends in three days but its handover is complete: no reminder');

-- =============================================================================
-- 4. The governance checker (§21, §59–62)
-- =============================================================================

select is(pg_temp.n($$ select (private.check_governance_health() ->> 'new')::integer $$) > 0, true, 'the checker records what it finds');
select ok(exists (select 1 from public.governance_issues where issue_key = 'transition_pending:' || pg_temp.fid('t_sports') and status = 'open'
                    and notified_at is not null and escalated_at is not null and severity = 'critical'),
  'the Sports succession, effective now and not accepted, is a critical issue: told and escalated');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('emma') and kind = 'governance_issue_alert'
                    and payload ->> 'issue' = 'transition_pending' and payload ->> 'target' = 'association'),
  'Emma, who runs the succession, is told first');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('alice') and kind = 'governance_issue_alert'
                    and payload ->> 'issue' = 'transition_pending' and payload ->> 'target' = 'platform' and (payload ->> 'escalated')::boolean),
  'and the BDE at once (critical)');
select ok(not exists (select 1 from public.notifications where recipient_id in (pg_temp.fid('nina'), pg_temp.fid('hugo'))
                        and kind = 'governance_issue_alert'),
  'nobody unrelated is told');
insert into fx (k, v) values ('alerts', (select count(*)::text from public.notifications where kind = 'governance_issue_alert'));
select is(pg_temp.n($$ select (private.check_governance_health() ->> 'new')::integer $$), 0, 'a second run finds nothing new');
select is(pg_temp.n($$ select count(*) from public.notifications where kind = 'governance_issue_alert' $$), (select v::integer from fx where k = 'alerts'),
  'and sends nothing again');
select ok(not exists (select 1 from public.governance_issues where status = 'open' group by issue_key having count(*) > 1),
  'one open row per issue');

set local role authenticated;
select pg_temp.as_user('emma');
select lives_ok($$ select public.cancel_leadership_transition(pg_temp.fid('t_sports'), 'Paul ne répond pas (test)') $$, 'Emma cancels her proposal');
reset role;
select lives_ok($$ select private.check_governance_health() $$, 'the checker runs');
select ok(exists (select 1 from public.governance_issues where issue_key = 'transition_pending:' || pg_temp.fid('t_sports') and status = 'resolved'),
  'the issue of the cancelled transition is resolved');
select ok(not exists (select 1 from public.notifications n join public.governance_issues i on i.id = n.resource_id
                       where n.resource_type = 'governance_issue' and i.issue_key = 'transition_pending:' || pg_temp.fid('t_sports')
                         and n.read_at is null),
  'its unread alerts leave the notification centre');
select ok(exists (select 1 from public.governance_audit_events where action = 'governance_issue_resolved' and authority = 'system'),
  'the resolution is in the audit as the system''s');

-- Eleven months later: both BDE mandates over, nobody approved (§28, §109).
insert into fx (k, v) values ('bde_assignments', (select count(*)::text from public.position_assignments
                                                   where office in ('bde_president', 'bde_vice_president')));
select is(pg_temp.n($$ select count(*) from private.detect_governance_issues(now() + interval '11 months') where kind = 'bde_office_vacant'
                         and audience = 'guardian' $$), 2,
  'both BDE offices are vacant then, and the guardian is the one to tell');
select ok(not private.user_has_platform_permission(pg_temp.fid('alice'), 'platform.organizations.manage', now() + interval '11 months')
          and not private.user_has_platform_permission(pg_temp.fid('marc'), 'platform.organizations.manage', now() + interval '11 months'),
  'neither outgoing BDE officer keeps a power after their mandate');
select lives_ok($$ select private.check_governance_health(now() + interval '11 months') $$, 'the checker runs at that time');
select is(pg_temp.n($$ select count(*) from public.position_assignments where office in ('bde_president', 'bde_vice_president') $$),
  (select v::integer from fx where k = 'bde_assignments'), 'it appoints nobody');
select ok(exists (select 1 from public.notifications where recipient_id = pg_temp.fid('garance') and kind = 'governance_bde_vacancy'
                    and resource_type = 'governance_issue'),
  'the guardian is told the BDE has no presidency');
select ok(private.guardian_user(now() + interval '11 months') = pg_temp.fid('garance'),
  'the restricted recovery stays available to the guardian');

-- =============================================================================
-- 5. Academic years and the rollover (§8–14)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select throws_ok($$ select public.academic_years() $$, 'P0001', 'insufficient_permission', 'an association president does not read the year settings');
select pg_temp.as_user('garance');
select throws_ok($$ select public.save_academic_year(null, '2027–2028', '2027-09-01', '2028-08-31', '2027-09-01', '2028-08-31') $$,
  'P0001', 'insufficient_permission', 'the guardian does not configure years');
select pg_temp.as_user('hugo');
select throws_ok($$ select public.save_academic_year(null, '2027–2028', '2027-09-01', '2028-08-31', '2027-09-01', '2028-08-31') $$,
  'P0001', 'insufficient_permission', 'an ordinary member does not either');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.save_academic_year(null, '2027–2028', '2027-09-01', '2028-08-31', '2027-09-01', '2028-08-31') $$,
  'P0001', 'mfa_required', 'the BDE needs the second factor');
select pg_temp.as_user('alice');
select is(jsonb_typeof(public.current_academic_year() -> 'current'), 'object', 'anyone signed in reads the current year');
select throws_ok($$ select public.save_academic_year(pg_temp.fid('current_year'), y.label, y.starts_on, y.ends_on + 1, y.mandate_starts_at, y.mandate_ends_at)
                     from public.current_academic_year() c, lateral (select (c -> 'current' ->> 'label') as label,
                       (c -> 'current' ->> 'starts_on')::date as starts_on, (c -> 'current' ->> 'ends_on')::date as ends_on,
                       (c -> 'current' ->> 'mandate_starts_at')::timestamptz as mandate_starts_at,
                       (c -> 'current' ->> 'mandate_ends_at')::timestamptz as mandate_ends_at) y $$,
  'P0001', 'academic_year_current_dates', 'the current year''s dates no longer move');
select throws_ok($$ select public.save_academic_year(null, 'année prochaine', '2090-09-01', '2091-08-31', '2090-09-01', '2091-08-31') $$,
  'P0001', 'academic_year_invalid', 'a year needs a name like 2027–2028');
reset role;

-- The current year ends in ten days (fixture), so the next one can be prepared and confirmed.
update public.academic_years set ends_on = (now() at time zone 'Europe/Paris')::date + 10,
                                 mandate_ends_at = private.paris_start_of((now() at time zone 'Europe/Paris')::date + 11) - interval '1 minute'
 where status = 'current';
insert into fx (k, v) select 'next_label', (split_part(label, '–', 2)::int) || '–' || (split_part(label, '–', 2)::int + 1)
  from public.academic_years where status = 'current';
insert into fx (k, v) values ('world', pg_temp.world());

set local role authenticated;
select pg_temp.as_user('alice');
select lives_ok($$ insert into fx (k, id) select 'next_year', public.save_academic_year(null, (select v from fx where k = 'next_label'),
                     (now() at time zone 'Europe/Paris')::date + 11, (now() at time zone 'Europe/Paris')::date + 375,
                     s.start, s.start + interval '12 months' - interval '1 minute')
                     from (select ((now() at time zone 'Europe/Paris')::date + 11)::timestamp at time zone 'Europe/Paris' as start) s $$,
  'Alice prepares the next year');
select throws_ok($$ select public.save_academic_year(null, (select v from fx where k = 'next_label'), '2099-09-01', '2100-08-31', '2099-09-01', '2100-08-31') $$,
  'P0001', 'academic_year_overlap', 'two years cannot share a name');
select is((public.academic_year_preparation(pg_temp.fid('next_year')) ->> 'can_roll_over')::boolean, false,
  'the preparation is not complete yet');
select is(jsonb_array_length(public.academic_year_preparation(pg_temp.fid('next_year')) -> 'manual'), 9, 'nine human confirmations');
select ok(public.academic_year_preparation(pg_temp.fid('next_year'))::text !~* '(candidate_id|answers|cv_|"document)',
  'the preparation shows counts and offices, nothing about applicants');
select throws_ok($$ select public.confirm_academic_year_rollover(pg_temp.fid('next_year'), true) $$,
  'P0001', 'rollover_checks_incomplete', 'no rollover before every confirmation');
select lives_ok($$ select public.confirm_academic_year_check(pg_temp.fid('next_year'), k, true)
                     from unnest(array['leadership_reviewed', 'mandates_reviewed', 'delegations_reviewed', 'recruitment_access_reviewed',
                                       'scheduled_content_reviewed', 'operational_contacts_reviewed', 'recovery_procedure_documented',
                                       'backup_health_reviewed', 'notification_test_done']) k $$,
  'Alice confirms the nine points');
select throws_ok($$ select public.confirm_academic_year_check(pg_temp.fid('next_year'), 'everything_fine', true) $$,
  'P0001', 'check_unknown', 'only the listed points exist');
select throws_ok($$ select public.confirm_academic_year_rollover(pg_temp.fid('next_year'), false) $$,
  'P0001', 'rollover_warnings_unacknowledged', 'checks asking for attention must be acknowledged');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.confirm_academic_year_rollover(pg_temp.fid('next_year'), true) $$,
  'P0001', 'mfa_required', 'the rollover needs the second factor');
select pg_temp.as_user('julie');
select throws_ok($$ select public.confirm_academic_year_rollover(pg_temp.fid('next_year'), true) $$,
  'P0001', 'insufficient_permission', 'an association president cannot roll over');
select pg_temp.as_user('alice');
select is(public.confirm_academic_year_rollover(pg_temp.fid('next_year'), true) ->> 'status', 'current', 'Alice confirms the rollover');
reset role;
select is(pg_temp.world(), (select v from fx where k = 'world'),
  'the rollover changed no organization, membership, mandate, post, event, registration, application or transition');
select ok((select status from public.academic_years where id = pg_temp.fid('current_year')) = 'closed'
          and (select status from public.academic_years where id = pg_temp.fid('next_year')) = 'current',
  'the old year is closed (kept), the new one current');
select ok(private.user_has_platform_permission(pg_temp.fid('alice'), 'platform.organizations.manage', now()),
  'Alice keeps exactly the rights of her own mandate');
select ok(exists (select 1 from public.governance_audit_events where action = 'rollover_confirmed' and actor_user_id = pg_temp.fid('alice')),
  'the rollover is in the audit, with its author');
set local role authenticated;
select pg_temp.as_user('alice');
select is(public.confirm_academic_year_rollover(pg_temp.fid('next_year'), true) ->> 'already', 'true', 'confirming twice changes nothing');
select throws_ok($$ select public.save_academic_year(pg_temp.fid('current_year'), '2000–2001', '2000-09-01', '2001-08-31', '2000-09-01', '2001-08-31') $$,
  'P0001', 'academic_year_closed', 'a closed year is history');
reset role;

-- =============================================================================
-- 6. Handover checklists (§35–38, §120)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('julie');
select lives_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'successor_proposed', true, 'Lucas a accepté (test)') $$,
  'Julie ticks the succession');
select lives_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'pending_posts_reviewed', false, null, pg_temp.fid('lucas')) $$,
  'and hands the article reviews to Lucas');
select throws_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'media_reviewed', false, null, pg_temp.fid('nina')) $$,
  'P0001', 'member_not_found', 'only a member of the team can take an item');
select pg_temp.as_user('lucas');
select lives_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'upcoming_events_reviewed', true) $$,
  'Lucas ticks his own area (events)');
select throws_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'successor_proposed', false) $$,
  'P0001', 'insufficient_permission', 'but not the presidency''s');
select pg_temp.as_user('emma');
select throws_ok($$ select public.set_handover_item(pg_temp.fid('finance'), 'successor_proposed', false) $$,
  'P0001', 'insufficient_permission', 'another association''s president cannot touch Finance''s list');
select throws_ok($$ select public.organization_continuity(pg_temp.fid('finance')) $$, 'P0001', 'insufficient_permission',
  'nor read it');
select pg_temp.as_user('julie');
select is((select h ->> 'done' from jsonb_array_elements(public.organization_continuity(pg_temp.fid('finance')) -> 'handover') h
            where h ->> 'key' = 'successor_proposed'), 'true', 'Julie sees her list');
select is(public.organization_continuity(pg_temp.fid('finance')) -> 'successor' ->> 'name', 'Lucas Exemple', 'and the incoming president');
select pg_temp.as_user('alice');
select throws_ok($$ select public.organization_continuity(pg_temp.fid('finance')) $$, 'P0001', 'insufficient_permission',
  'the BDE does not read an association''s private handover');
reset role;
select ok(exists (select 1 from public.governance_audit_events where action = 'handover_item_updated' and organization_id = pg_temp.fid('finance')),
  'the checklist changes are audited');

-- =============================================================================
-- 7. Responsibility transfer: a reviewer's work (§38, §39, §111)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('emma');
select lives_ok($$ insert into fx (k, id) values ('m_julie', public.appoint_recruitment_member(pg_temp.fid('spo'),
                     (select id from public.memberships where organization_id = pg_temp.fid('sports') and user_id = pg_temp.fid('julie')),
                     'reviewer', array['view', 'review'], 'campaign', null, now() + interval '2 months')) $$,
  'Emma appoints Julie to review the Sports applications');
select lives_ok($$ insert into fx (k, id) values ('m_paul', public.appoint_recruitment_member(pg_temp.fid('spo'),
                     (select id from public.memberships where organization_id = pg_temp.fid('sports') and user_id = pg_temp.fid('paul')),
                     'reviewer', array['view', 'review'], 'campaign', null, now() + interval '2 months')) $$,
  'and Paul');
select is((public.assign_recruitment_reviews(pg_temp.fid('spo'), array[pg_temp.fid('app_nina')], array[pg_temp.fid('m_julie')], 'each') ->> 'assigned')::integer, 1,
  'Nina''s application is given to Julie');
select pg_temp.as_user('julie');
select throws_ok($$ select public.transfer_review_assignments(pg_temp.fid('spo'), pg_temp.fid('m_julie'), pg_temp.fid('m_paul'), 'je pars') $$,
  'P0001', 'insufficient_permission', 'a reviewer cannot hand their own work around');
select pg_temp.as_user('emma');
select throws_ok($$ select public.transfer_review_assignments(pg_temp.fid('spo'), pg_temp.fid('m_julie'), pg_temp.fid('m_paul'), '') $$,
  'P0001', 'reason_required', 'a transfer says why');
select is((public.transfer_review_assignments(pg_temp.fid('spo'), pg_temp.fid('m_julie'), pg_temp.fid('m_paul'), 'Julie passe la main (test)') ->> 'applications')::integer, 1,
  'Emma moves Julie''s pending review to Paul');
reset role;
select ok(exists (select 1 from public.recruitment_review_assignments where member_id = pg_temp.fid('m_paul') and removed_at is null)
          and not exists (select 1 from public.recruitment_review_assignments where member_id = pg_temp.fid('m_julie') and removed_at is null),
  'Paul holds it now, Julie no longer');
select ok(exists (select 1 from public.governance_audit_events where action = 'review_responsibilities_transferred'
                    and subject_user_id = pg_temp.fid('julie') and reason is not null),
  'the transfer is audited with its reason');
select ok(not private.user_has_organization_permission(pg_temp.fid('lucas'), pg_temp.fid('sports'), 'recruitment.applications.view', now() + interval '4 days'),
  'presiding Finance gives no recruitment access elsewhere');

-- =============================================================================
-- 8. Jobs: dispatcher, failure, recovery, retry (§51–55, §91, §113)
-- =============================================================================

select is(private.run_scheduled_job('governance-health') ->> 'status', 'succeeded', 'a job runs through the dispatcher');
select ok((select last_succeeded_at is not null and last_status = 'succeeded' and consecutive_failures = 0 from public.scheduled_jobs
            where job_key = 'governance-health'), 'its success is recorded on the catalog');
insert into fx (k, v) select 'report_success', coalesce(last_succeeded_at::text, '') from public.scheduled_jobs where job_key = 'platform-health-report';

-- A job that fails midway (fixture: its function writes, then raises with data in the message).
create or replace function private.send_platform_health_report() returns jsonb language plpgsql security definer set search_path = '' as $f$
begin
  update public.academic_years set notes = 'écrit à moitié' where status = 'current';
  raise exception 'boom: the secret value 4242 (details)';
end $f$;
select is(private.run_scheduled_job('platform-health-report') ->> 'status', 'failed', 'a failing job is recorded as failed');
select ok(not exists (select 1 from public.academic_years where notes = 'écrit à moitié'), 'its partial work is rolled back');
select is((select last_error from public.scheduled_jobs where job_key = 'platform-health-report'), 'P0001 boom',
  'the error kept is a short code, without the data of the message');
select is((select coalesce(last_succeeded_at::text, '') from public.scheduled_jobs where job_key = 'platform-health-report'),
  (select v from fx where k = 'report_success'), 'the last success stays accurate');
select lives_ok($$ select private.run_scheduled_job('platform-health-report'), private.run_scheduled_job('platform-health-report') $$, 'it fails twice more');
select is(private.job_health((select j from public.scheduled_jobs j where job_key = 'platform-health-report'),
                             '{"platform-health-report": {"active": true, "command_ok": true}}'::jsonb), 'failing',
  'three failures in a row: failing');
select is(private.job_health((select j from public.scheduled_jobs j where job_key = 'platform-health-report'), null), 'unverifiable',
  'without a scheduler the health says unverifiable, never healthy');
select is(private.job_health((select j from public.scheduled_jobs j where job_key = 'platform-health-report'),
                             '{"platform-health-report": {"active": false, "command_ok": true}}'::jsonb), 'not_scheduled',
  'a disabled schedule is seen');
update public.scheduled_jobs set last_succeeded_at = now() - interval '8 days', consecutive_failures = 0, last_status = 'succeeded'
 where job_key = 'governance-health';
select is(private.job_health((select j from public.scheduled_jobs j where job_key = 'governance-health'),
                             '{"governance-health": {"active": true, "command_ok": true}}'::jsonb), 'late',
  'an hourly job whose last success is eight days old is late, though it exists in the scheduler');
create or replace function private.send_platform_health_report() returns jsonb language sql security definer set search_path = ''
  as $f$ select '{"sent": 0}'::jsonb $f$;
select is(private.run_scheduled_job('platform-health-report') ->> 'status', 'succeeded', 'once fixed, the next run succeeds');
select is((select consecutive_failures from public.scheduled_jobs where job_key = 'platform-health-report'), 0, 'and the failure count resets');
select throws_ok($$ select private.run_scheduled_job('drop-everything') $$, 'P0001', 'job_unknown', 'only catalog jobs run');

set local role authenticated;
select pg_temp.as_user('nina');
select throws_ok($$ select public.retry_scheduled_job('governance-health') $$, 'P0001', 'insufficient_permission',
  'an ordinary student cannot run a job');
select throws_ok($$ select private.run_scheduled_job('governance-health') $$, '42501', null, 'nor call the dispatcher');
select pg_temp.as_user('julie');
select throws_ok($$ select public.retry_scheduled_job('governance-health') $$, 'P0001', 'insufficient_permission',
  'nor an association president');
select pg_temp.as_user('alice', 'aal1');
select throws_ok($$ select public.retry_scheduled_job('governance-health') $$, 'P0001', 'mfa_required', 'a retry needs the second factor');
select pg_temp.as_user('alice');
select is(public.retry_scheduled_job('governance-health') ->> 'status', 'succeeded', 'the BDE re-runs a safe job');
select throws_ok($$ select public.retry_scheduled_job('governance-health') $$, 'P0001', 'job_retry_too_soon', 'not twice in two minutes');
select throws_ok($$ select public.retry_scheduled_job('data-retention') $$, 'P0001', 'job_not_retryable', 'never a deleting job');
reset role;
select ok(exists (select 1 from public.governance_audit_events where action = 'scheduled_job_retried' and actor_user_id = pg_temp.fid('alice')),
  'the retry is audited with the person who asked');

-- Storage cleanup: a claimed file is leased.
insert into private.storage_cleanup_queue (bucket_id, object_path, reason)
values ('recruitment-documents', 'applications/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002', 'document_deleted');
select ok(public.claim_storage_cleanup(200)::text like '%00000000-0000-4000-8000-000000000002%', 'a worker claims the file');
select is(jsonb_array_length(public.claim_storage_cleanup(200)), 0, 'a second worker does not get it while it is leased');
select lives_ok($$ select public.complete_storage_cleanup((select id from private.storage_cleanup_queue where reason = 'document_deleted' order by id desc limit 1),
                     false, 'storage_error') $$, 'the first worker fails');
select is(jsonb_array_length(public.claim_storage_cleanup(200)), 1, 'the file can be retried: nothing is lost');

-- =============================================================================
-- 9. Retention (§78–83, §115)
-- =============================================================================

update public.notifications set read_at = now() - interval '13 months', created_at = now() - interval '13 months'
 where recipient_id = pg_temp.fid('lucas');
insert into fx (k, v) values ('old_read', (select count(*)::text from public.notifications where read_at < now() - interval '12 months'));
insert into fx (k, v) values ('others', (select count(*)::text from public.notifications where recipient_id <> pg_temp.fid('lucas')));
select ok((select v::integer from fx where k = 'old_read') > 0, 'fixture: old read notifications');
select is((private.run_retention() ->> 'total')::integer, 0, 'unconfigured policies delete nothing');

set local role authenticated;
select pg_temp.as_user('julie');
select throws_ok($$ select public.set_retention_policy('notifications_read', 12) $$, 'P0001', 'insufficient_permission',
  'an association president cannot set a retention policy');
select pg_temp.as_user('alice');
select is((public.preview_retention_policy('notifications_read', 12) ->> 'count')::integer, (select v::integer from fx where k = 'old_read'),
  'the preview counts what 12 months would delete');
select is(pg_temp.n($$ select count(*) from public.notifications where read_at < now() - interval '12 months' $$), (select v::integer from fx where k = 'old_read'),
  'and deletes nothing');
select throws_ok($$ select public.set_retention_policy('notifications_read', 12) $$, 'P0001', 'retention_confirmation_required',
  'a policy that would delete needs the previewed count confirmed');
select throws_ok($$ select public.set_retention_policy('notifications_read', 12, null, 1) $$, 'P0001', 'retention_confirmation_required',
  'a wrong count is refused');
select throws_ok($$ select public.set_retention_policy('cvs', 1) $$, 'P0001', 'policy_unknown', 'only the listed policies exist');
select lives_ok($$ select public.set_retention_policy('notifications_read', 12, 'Décision de test', (select v::bigint from fx where k = 'old_read')) $$,
  'Alice sets it, having seen the number');
reset role;
select is((private.run_retention() -> 'deleted' ->> 'notifications_read')::integer, (select v::integer from fx where k = 'old_read'),
  'the job deletes exactly what the preview showed');
select is((private.run_retention() ->> 'total')::integer, 0, 'running again deletes nothing more (idempotent)');
select is(pg_temp.n($$ select count(*) from public.notifications where recipient_id <> (select id from fx where k = 'lucas') $$),
  (select v::integer from fx where k = 'others'), 'other records are untouched');
select ok(exists (select 1 from public.governance_audit_events where action = 'retention_cleanup_executed'
                    and details ? 'notifications_read' and subject_user_id is null),
  'the cleanup is in the audit as counts, about nobody in particular');
select ok(exists (select 1 from public.governance_audit_events where action = 'retention_policy_changed' and actor_user_id = pg_temp.fid('alice')),
  'the policy change is audited with its author');

-- =============================================================================
-- 10. Register, backups, incidents (§65–77, §93)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('alice');
select throws_ok($$ select public.save_institutional_record('supabase_project', 'Supabase', 'BDE', 'sb_secret_abcdefghijklmnopqrstuv', null, 'needs_review') $$,
  'P0001', 'secret_not_allowed', 'a key in the register is refused');
select throws_ok($$ select public.save_institutional_record('domain', 'Registrar (exemple)', 'BDE', null, null, 'needs_review',
                     'mot de passe: hunter2') $$, 'P0001', 'secret_not_allowed', 'so is a password in a note');
select throws_ok($$ select public.save_institutional_record('domain', 'Registrar (exemple)', E'BDE\nautre', null, null, 'needs_review') $$,
  'P0001', 'register_text_invalid', 'single-line fields stay single-line');
select lives_ok($$ select public.save_institutional_record('domain', 'Registrar (exemple)', 'Bureau du BDE (exemple)',
                     'contact-bde@example.test', (now() at time zone 'Europe/Paris')::date + 20, 'verified', 'Vérifié sur la console (test).') $$,
  'Alice records who holds the domain and when it renews');
select throws_ok($$ select public.record_backup_verification('database_restore_test', 'verified', 'development', current_date + 3) $$,
  'P0001', 'backup_check_invalid', 'a check cannot be dated in the future');
select lives_ok($$ select public.record_backup_verification('database_restore_test', 'verified', 'development', current_date,
                     'Restauration dans un projet isolé (test)') $$, 'Alice declares a restore test');
select is((select b ->> 'status' from jsonb_array_elements(public.platform_operations() -> 'backups') b where b ->> 'kind' = 'database_restore_test'),
  'verified', 'the restore test shows as verified, with its date and author');
select is((select b ->> 'status' from jsonb_array_elements(public.platform_operations() -> 'backups') b where b ->> 'kind' = 'storage_restore_test'),
  'never', 'Storage restores are a separate check, never verified by a database one');
select lives_ok($$ insert into fx (k, id) values ('incident', public.open_operational_incident('E-mails en retard (test)', 'notifications', 'medium',
                     'Les confirmations arrivent en retard.')) $$, 'Alice opens an incident');
select lives_ok($$ select public.update_operational_incident(pg_temp.fid('incident'), 'resolved', 'Relancé (test).') $$, 'and resolves it');
select throws_ok($$ select public.update_operational_incident(pg_temp.fid('incident'), 'resolved', 'Encore.') $$,
  'P0001', 'incident_resolved', 'a resolved incident is not resolved twice');
select pg_temp.as_user('garance');
select throws_ok($$ select public.platform_operations() $$, 'P0001', 'insufficient_permission', 'the guardian does not see operations');
select throws_ok($$ select public.save_institutional_record('domain', 'x', 'x', null, null, 'verified') $$, 'P0001', 'insufficient_permission',
  'nor edit the register');
select pg_temp.as_user('hugo');
select throws_ok($$ select public.record_backup_verification('database_restore_test', 'verified', 'production', current_date) $$,
  'P0001', 'insufficient_permission', 'an ordinary member declares nothing');
reset role;
select ok(not exists (select 1 from public.governance_audit_events where action = 'institutional_record_updated'
                       and details::text ~ '(Registrar|contact-bde)'),
  'the audit of the register keeps the line and the status, not its contents');
select ok(exists (select 1 from private.detect_governance_issues() where kind = 'renewal_due' and severity = 'warning'),
  'a renewal written in the register within 30 days becomes a reminder');

-- =============================================================================
-- 11. The continuity reads: each to its audience (§56–58, §90, §116 last row)
-- =============================================================================

set local role authenticated;
select pg_temp.as_user('alice');
select is(jsonb_typeof(public.governance_health() -> 'issues'), 'array', 'the BDE reads governance health');
select ok(public.governance_health()::text !~* '(candidate_id|answers|cv_|"document)' and public.platform_operations()::text !~* '(candidate_id|answers|"document)',
  'without anything about applicants');
select ok(not exists (select 1 from jsonb_array_elements(public.governance_health() -> 'issues') i where i ->> 'audience' = 'self'),
  'nor anyone''s personal account-security alerts (a count only)');
select ok((select bool_and(c ->> 'status' in ('ok', 'info')) from jsonb_array_elements(public.security_health() -> 'checks') c
            where c ->> 'key' in ('rls_enabled', 'no_table_writes', 'definer_search_path', 'private_functions_closed', 'office_overlap_guard')),
  'the security self-check finds row security on, no table writes, closed private functions, the office guard');
select pg_temp.as_user('julie');
select throws_ok($$ select public.governance_health() $$, 'P0001', 'insufficient_permission', 'an association president does not read it');
select throws_ok($$ select public.security_health() $$, 'P0001', 'insufficient_permission', 'nor the security self-check');
select pg_temp.as_user('garance');
select throws_ok($$ select public.governance_health() $$, 'P0001', 'insufficient_permission', 'the guardian has the narrower view only');
select is(jsonb_array_length(public.guardian_continuity() -> 'offices'), 2, 'the guardian sees the two BDE offices');
select ok(public.guardian_continuity()::text !~* '(application|candidate_id|answers|attendee|document)',
  'and nothing about applicants, participants or documents');
select pg_temp.as_user('alice');
select throws_ok($$ select public.guardian_continuity() $$, 'P0001', 'insufficient_permission', 'the BDE has no recovery view');
select throws_ok($$ select public.account_responsibilities('julie.finance@comptes.example.test') $$, 'P0001', 'insufficient_permission',
  'nor the privacy officer''s');
reset role;
set local role anon;
select is((select array_agg(k order by k) from jsonb_object_keys(public.platform_heartbeat()) k), array['checked_at', 'database', 'jobs_on_time'],
  'the public heartbeat says three things: the database answers, whether jobs are on time, when');
reset role;

-- =============================================================================
-- 12. Daylight saving, Paris (§106)
-- =============================================================================

select is(private.paris_start_of('2026-10-25'), '2026-10-24 22:00:00+00'::timestamptz, 'midnight on 25 October 2026 is still summer time');
select is(private.paris_start_of('2026-10-26'), '2026-10-25 23:00:00+00'::timestamptz, 'the next midnight is winter time');
select is(private.paris_start_of('2027-03-28'), '2027-03-27 23:00:00+00'::timestamptz, 'midnight on 28 March 2027 is winter time');
select is(private.paris_start_of('2027-03-29'), '2027-03-28 22:00:00+00'::timestamptz, 'the next one summer time');
select is(private.paris_start_of('2026-10-26') - private.paris_start_of('2026-10-25'), interval '25 hours',
  'the day the clocks go back lasts 25 hours: a mandate is never shortened by it');

select * from finish();

rollback;
