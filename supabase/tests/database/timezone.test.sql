-- Phase 15 — time zones, daylight saving and boundaries (brief §53, §91).
-- Institution time zone: Europe/Paris. Instants are stored as timestamptz and
-- compared on the server; no answer may depend on the session's time zone or
-- on the client. Mandates are half-open intervals [starts_at, ends_at).
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- =============================================================================
-- 1. Midnight in Paris around the clock changes (last Sundays of March and October 2027)
-- =============================================================================
select is(private.paris_start_of('2027-03-28'), '2027-03-27 23:00:00+00'::timestamptz,
  'spring-forward day: Paris midnight is still winter time (UTC+1)');
select is(private.paris_start_of('2027-03-29'), '2027-03-28 22:00:00+00'::timestamptz, 'the next midnight is summer time (UTC+2)');
select is(private.paris_start_of('2027-03-29') - private.paris_start_of('2027-03-28'), interval '23 hours', 'that day lasts 23 hours');
select is(private.paris_start_of('2027-10-31'), '2027-10-30 22:00:00+00'::timestamptz, 'fall-back day: midnight is still summer time');
select is(private.paris_start_of('2027-11-01'), '2027-10-31 23:00:00+00'::timestamptz, 'the next midnight is winter time');
select is(private.paris_start_of('2027-11-01') - private.paris_start_of('2027-10-31'), interval '25 hours', 'that day lasts 25 hours');

-- =============================================================================
-- 2. The one-month answer deadline of a privacy request (art. 12.3): end of the same date next month, in Paris
-- =============================================================================
select is(private.privacy_due_at('2027-01-31 12:00+01'), private.paris_start_of('2027-03-01'),
  'received 31 January: due at the end of 28 February (no 31 February)');
select is(private.privacy_due_at('2027-02-28 10:00+01'), private.paris_start_of('2027-03-29'),
  'received 28 February: due at the end of 28 March, a 23-hour day');
select is(private.privacy_due_at('2027-09-30 23:30+02'), private.paris_start_of('2027-10-31'),
  'received 30 September late evening: due at the end of 30 October');
select is(private.privacy_due_at('2027-09-30 22:30+00'), private.paris_start_of('2027-11-02'),
  'received at 00:30 on 1 October in Paris (still 30 September in UTC): the Paris date counts');
set local timezone = 'Pacific/Auckland';
select is(private.privacy_due_at('2027-09-30 22:30+00'), '2027-11-01 23:00:00+00'::timestamptz,
  'the same answer whatever the session''s time zone');
select is(private.paris_start_of('2027-03-29'), '2027-03-28 22:00:00+00'::timestamptz, 'Paris midnight too');
reset timezone;

-- =============================================================================
-- 3. Mandates end at an exact instant: valid the microsecond before, gone at the end
-- =============================================================================
create temporary table fx (k text primary key, id uuid, at timestamptz) on commit drop;
insert into fx (k, id, at)
select 'julie_end', a.user_id, a.ends_at
  from public.position_assignments a
  join public.positions p on p.id = a.position_id
  join public.organizations o on o.id = p.organization_id
 where o.slug = 'exemple-finance' and a.office = 'association_president' and a.status = 'active';
insert into fx (k, id, at)
select 'alice_end', a.user_id, a.ends_at from public.position_assignments a
 where a.office = 'bde_president' and a.status = 'active' and a.user_id = 'a0000000-0000-4000-8000-000000000001';
insert into fx (k, id, at)
select 'guardian_end', g.user_id, g.ends_at from public.platform_assignments g where g.role = 'guardian' and g.status = 'active';

select ok(private.user_has_organization_permission((select id from fx where k = 'julie_end'), (select id from public.organizations where slug = 'exemple-finance'),
                                                   'members.invite', (select at from fx where k = 'julie_end') - interval '1 microsecond'),
  'the association president holds the right one microsecond before the mandate ends');
select ok(not private.user_has_organization_permission((select id from fx where k = 'julie_end'), (select id from public.organizations where slug = 'exemple-finance'),
                                                       'members.invite', (select at from fx where k = 'julie_end')),
  'and not at the end itself (half-open interval), with no job involved');
select is(private.office_holder((select id from public.organizations where kind = 'bde'), 'bde_president',
                                (select at from fx where k = 'alice_end') - interval '1 microsecond'),
  (select id from fx where k = 'alice_end'), 'the BDE president holds the office until the last microsecond');
select isnt(private.office_holder((select id from public.organizations where kind = 'bde'), 'bde_president', (select at from fx where k = 'alice_end')),
  (select id from fx where k = 'alice_end'), 'and no longer at the end');
select is(private.guardian_user((select at from fx where k = 'guardian_end') - interval '1 microsecond'), (select id from fx where k = 'guardian_end'),
  'the guardian likewise');
select ok(private.guardian_user((select at from fx where k = 'guardian_end')) is distinct from (select id from fx where k = 'guardian_end'),
  'and not at the end');

-- =============================================================================
-- 4. A recruitment closes at its exact instant (the database's clock, not the visitor's)
-- =============================================================================
insert into fx (k, id) select 'campaign', c.id from public.recruitment_campaigns c
  join public.organizations o on o.id = c.organization_id
 where o.slug = 'exemple-finance' and c.title = 'Recrutement 2027 (exemple)';
update public.recruitment_campaigns set closes_at = now() + interval '1 microsecond' where id = (select id from fx where k = 'campaign');
select is((select private.campaign_state(c) from public.recruitment_campaigns c where c.id = (select id from fx where k = 'campaign')), 'open',
  'a microsecond before its closing time, a campaign is open');
update public.recruitment_campaigns set closes_at = now() where id = (select id from fx where k = 'campaign');
select is((select private.campaign_state(c) from public.recruitment_campaigns c where c.id = (select id from fx where k = 'campaign')), 'closed',
  'at its closing time, closed');
set local timezone = 'America/Los_Angeles';
select is((select private.campaign_state(c) from public.recruitment_campaigns c where c.id = (select id from fx where k = 'campaign')), 'closed',
  'whatever the session''s time zone');
reset timezone;
select ok((select closes_at from public.recruitment_campaigns where id = (select id from fx where k = 'campaign')) = now(),
  'closing times are instants (timestamptz), compared on the server');

select * from finish();
rollback;
