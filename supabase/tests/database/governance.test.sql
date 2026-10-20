-- Phase 4 governance security tests.
--
-- Runs on top of supabase/seed.sql (the fictional governance world: Alice
-- and Marc lead the BDE, Garance is the continuity guardian, Julie presides
-- "Finance (exemple)", Emma "Sports (exemple)"…). CI resets the database
-- with the seed before running this file.
--
-- Every scenario goes straight at the database as one of the fictional
-- people (role `authenticated` + their JWT claims): direct table writes,
-- direct function calls, other organizations' ids. Nothing here goes through
-- the interface. Everything rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(163);

-- Fixture ids (computed as the owner, readable by every role below).
create temp table fx (k text primary key, id uuid);
grant select, insert on fx to public;
insert into fx (k, id)
select 'bde', id from public.organizations where kind = 'bde'
union all select 'finance', id from public.organizations where slug = 'exemple-finance'
union all select 'sports', id from public.organizations where slug = 'exemple-sports'
union all select 'arts', id from public.organizations where slug = 'exemple-arts'
union all select 'conseil', id from public.organizations where slug = 'exemple-conseil'
union all select 'm_julie_fin', m.id from public.memberships m join public.organizations o on o.id = m.organization_id
  where o.slug = 'exemple-finance' and m.user_id = 'a0000000-0000-4000-8000-000000000004'
union all select 'm_lucas_fin', m.id from public.memberships m join public.organizations o on o.id = m.organization_id
  where o.slug = 'exemple-finance' and m.user_id = 'a0000000-0000-4000-8000-000000000005'
union all select 'm_hugo_fin', m.id from public.memberships m join public.organizations o on o.id = m.organization_id
  where o.slug = 'exemple-finance' and m.user_id = 'a0000000-0000-4000-8000-000000000008'
union all select 'm_sarah_fin', m.id from public.memberships m join public.organizations o on o.id = m.organization_id
  where o.slug = 'exemple-finance' and m.user_id = 'a0000000-0000-4000-8000-000000000009'
union all select 'm_julie_spo', m.id from public.memberships m join public.organizations o on o.id = m.organization_id
  where o.slug = 'exemple-sports' and m.user_id = 'a0000000-0000-4000-8000-000000000004'
union all select 'pos_fin_president', p.id from public.positions p join public.organizations o on o.id = p.organization_id
  where o.slug = 'exemple-finance' and p.office = 'association_president'
union all select 'pos_fin_com', p.id from public.positions p join public.organizations o on o.id = p.organization_id
  where o.slug = 'exemple-finance' and p.title = 'Communication'
union all select 'pos_fin_events', p.id from public.positions p join public.organizations o on o.id = p.organization_id
  where o.slug = 'exemple-finance' and p.title = 'Événements'
union all select 'pos_bde_president', p.id from public.positions p where p.office = 'bde_president'
union all select 'pos_bde_vp', p.id from public.positions p where p.office = 'bde_vice_president'
union all select 'a_julie_pres', a.id from public.position_assignments a
  where a.office = 'association_president' and a.user_id = 'a0000000-0000-4000-8000-000000000004'
union all select 'a_lucas_com', a.id from public.position_assignments a join public.positions p on p.id = a.position_id
  where a.user_id = 'a0000000-0000-4000-8000-000000000005' and p.title = 'Communication'
union all select 'a_lucas_events', a.id from public.position_assignments a join public.positions p on p.id = a.position_id
  where a.user_id = 'a0000000-0000-4000-8000-000000000005' and p.title = 'Événements'
union all select 'a_marc_vp', a.id from public.position_assignments a
  where a.office = 'bde_vice_president' and a.user_id = 'a0000000-0000-4000-8000-000000000002'
union all select 'inv_nina', i.id from public.organization_invitations i where i.email = 'nina@comptes.example.test'
union all select 't_sports', t.id from public.leadership_transitions t join public.organizations o on o.id = t.organization_id
  where o.slug = 'exemple-sports' and t.status = 'open'
union all select 't_bde', t.id from public.leadership_transitions t where t.kind = 'bde_succession' and t.status = 'open'
union all select 'deleg_lucas', d.id from public.delegations d where d.delegate_user_id = 'a0000000-0000-4000-8000-000000000005';

-- =============================================================================
-- 1. Structure: the BDE root, the catalog, append-only audit (as the owner)
-- =============================================================================

select is((select count(*)::int from public.organizations where kind = 'bde'), 1, 'exactly one BDE root');
select throws_ok(
  $$ insert into public.organizations (slug, name, kind, category, status) values ('autre-bde', 'Autre BDE', 'bde', 'bde', 'active') $$,
  '23505', null, 'a second BDE is refused'
);
select throws_ok(
  $$ update public.organizations set status = 'archived', archived_at = now() where kind = 'bde' $$,
  '23514', null, 'the BDE cannot be archived'
);
select throws_ok(
  $$ update public.organizations set kind = 'association', category = 'autre' where kind = 'bde' $$,
  'P0001', 'organization_kind_immutable', 'the BDE cannot become an association'
);
select throws_ok(
  $$ insert into public.position_permissions (position_id, permission_key)
     values ((select id from fx where k = 'pos_fin_com'), 'platform.recovery') $$,
  'P0001', 'permission_not_grantable', 'an ordinary position can never hold a platform key, however the row arrives'
);
select throws_ok(
  $$ insert into public.position_permissions (position_id, permission_key)
     values ((select id from fx where k = 'pos_fin_com'), 'governance.succession') $$,
  'P0001', 'permission_not_grantable', 'an ordinary position can never hold the succession key'
);
select throws_ok(
  $$ insert into public.delegation_permissions (delegation_id, permission_key)
     values ((select id from fx where k = 'deleg_lucas'), 'members.manage') $$,
  'P0001', 'permission_not_delegable', 'a non-delegable key can never be lent'
);
select throws_ok(
  $$ update public.governance_audit_events set reason = 'rewritten' $$,
  'P0001', 'audit_records_are_append_only', 'audit records cannot be edited, even by the owner role'
);
select throws_ok(
  $$ delete from public.governance_audit_events $$,
  'P0001', 'audit_records_are_append_only', 'audit records cannot be deleted, even by the owner role'
);
select ok(
  not exists (select 1 from public.permissions where scope = 'platform' and (is_grantable or is_delegable)),
  'no platform key is grantable or delegable'
);

-- =============================================================================
-- 2. An ordinary student (Nina, no membership yet)
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal1"}';

select throws_ok(
  $$ insert into public.memberships (organization_id, user_id) values ((select id from fx where k = 'finance'), 'a0000000-0000-4000-8000-000000000007') $$,
  '42501', null, 'a student cannot create their own membership'
);
select throws_ok(
  $$ insert into public.position_assignments (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source)
     values ((select id from fx where k = 'finance'), (select id from fx where k = 'm_julie_fin'), 'a0000000-0000-4000-8000-000000000007',
             (select id from fx where k = 'pos_fin_president'), now(), now() + interval '1 month', 'appointment') $$,
  '42501', null, 'a student cannot write a mandate (appoint themselves president)'
);
select throws_ok(
  $$ update public.positions set title = 'Présidence' $$,
  '42501', null, 'a student cannot edit positions'
);
select throws_ok(
  $$ insert into public.governance_audit_events (authority, action, category) values ('self', 'forged', 'team') $$,
  '42501', null, 'a student cannot forge audit records'
);
select throws_ok(
  $$ select private.bootstrap_governance('a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005',
                                        null, now() + interval '1 month', null, 'take over') $$,
  '42501', null, 'a student cannot run the bootstrap'
);
select throws_ok(
  $$ select public.create_organization('Mon asso', 'mon-asso') $$,
  'P0001', 'insufficient_permission', 'a student cannot create an association'
);
select throws_ok(
  $$ select public.propose_association_succession((select id from fx where k = 'finance'), 'nina@comptes.example.test',
                                                  now() + interval '6 months') $$,
  'P0001', 'insufficient_permission', 'a student cannot propose a president'
);
select throws_ok(
  $$ select public.organization_team((select id from fx where k = 'finance')) $$,
  'P0001', 'insufficient_permission', 'a student cannot list an association''s team'
);
select ok(
  (select count(*) from public.organizations where status = 'active') >= 3
  and not exists (select 1 from public.organizations where slug = 'exemple-arts'),
  'public organizations are readable, one still in setup is not'
);
select is_empty(
  $$ select 1 from public.memberships $$,
  'a student reads nobody''s membership'
);
select is(
  (select public.my_access() -> 'platform')::text, '[]',
  'a student holds no platform key'
);
select is(
  (select count(*)::int from public.profiles where id = 'a0000000-0000-4000-8000-000000000004'), 0,
  'Phase 3 profile isolation still holds'
);

-- =============================================================================
-- 3. A Finance officer (Lucas: Communication + Événements, members.invite lent)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';

select ok(
  (select count(*) from public.memberships where organization_id = (select id from fx where k = 'finance')) >= 3,
  'a Finance officer reads the Finance team (members.view)'
);
select is_empty(
  $$ select 1 from public.memberships where organization_id = (select id from fx where k = 'sports') $$,
  'a Finance officer reads nothing of Sports'
);
select ok(
  (select public.my_access() -> 'organizations' -> 0 -> 'permissions') @> '["posts.publish", "events.publish"]'::jsonb,
  'two valid positions give the union of their keys'
);
select throws_ok(
  $$ select public.set_membership_status((select id from fx where k = 'm_julie_spo'), 'suspended', 'not my association') $$,
  'P0001', 'insufficient_permission', 'a Finance officer cannot touch a Sports membership'
);
select throws_ok(
  $$ select public.organization_team((select id from fx where k = 'sports')) $$,
  'P0001', 'insufficient_permission', 'changing the organization id in a request gives nothing'
);
select throws_ok(
  $$ select public.assign_position((select id from fx where k = 'm_lucas_fin'), (select id from fx where k = 'pos_fin_president'),
                                  now() + interval '6 months') $$,
  'P0001', 'insufficient_permission', 'an officer cannot make themselves president'
);
select throws_ok(
  $$ select public.update_position((select id from fx where k = 'pos_fin_com'), 'Communication',
                                  array['members.view', 'posts.create', 'posts.edit', 'posts.publish', 'media.manage', 'members.manage']) $$,
  'P0001', 'insufficient_permission', 'an officer cannot widen their own position'
);
select throws_ok(
  $$ select public.create_delegation((select id from fx where k = 'finance'), (select id from fx where k = 'm_hugo_fin'),
                                    array['posts.publish'], now() + interval '5 days', 'cover me') $$,
  'P0001', 'insufficient_permission', 'an officer without delegations.manage cannot delegate'
);
select is(
  private.has_organization_permission((select id from fx where k = 'finance'), 'members.invite'), true,
  'the lent key works while the delegation runs'
);

-- =============================================================================
-- 4. The Finance president (Julie)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';

select lives_ok(
  $$ select public.invite_member((select id from fx where k = 'finance'), 'nouvelle@student.example.test',
                                (select id from fx where k = 'pos_fin_events'), now() + interval '8 months') $$,
  'the president invites someone with an ordinary position'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where k = 'finance'), 'nina@comptes.example.test') $$,
  'P0001', 'invitation_exists', 'a second pending invitation to the same address is refused'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where k = 'finance'), 'quelquun@gmail.com') $$,
  'P0001', 'user_not_eligible', 'an invitation cannot bypass school eligibility'
);
select throws_ok(
  $$ select public.invite_member((select id from fx where k = 'finance'), 'lucas.finance@comptes.example.test') $$,
  'P0001', 'already_member', 'an active member is not invited again'
);
select throws_ok(
  $$ select public.propose_bde_succession('julie.finance@comptes.example.test', null, now() + interval '6 months') $$,
  'P0001', 'insufficient_permission', 'an association president cannot appoint the BDE president'
);
select throws_ok(
  $$ select public.create_position((select id from fx where k = 'finance'), 'Super-pouvoirs', array['platform.recovery']) $$,
  'P0001', 'permission_not_grantable', 'a custom position with platform powers is refused'
);
select throws_ok(
  $$ select public.create_position((select id from fx where k = 'finance'), 'Présidence bis', array['governance.succession']) $$,
  'P0001', 'permission_not_grantable', 'a custom position named like the presidency gets none of its protected keys'
);
select throws_ok(
  $$ select public.update_position((select id from fx where k = 'pos_fin_president'), 'Présidence', array['members.view']) $$,
  'P0001', 'position_protected', 'the presidency''s keys cannot be edited'
);
select throws_ok(
  $$ select public.assign_position((select id from fx where k = 'm_lucas_fin'), (select id from fx where k = 'pos_fin_president'),
                                  now() + interval '6 months') $$,
  'P0001', 'position_protected', 'the presidency cannot be handed out as an ordinary position'
);
select throws_ok(
  $$ select public.end_assignment((select id from fx where k = 'a_julie_pres'), 'bye') $$,
  'P0001', 'position_protected', 'the presidency cannot be ended as an ordinary mandate'
);
select throws_ok(
  $$ select public.set_membership_status((select id from fx where k = 'm_julie_fin'), 'ended') $$,
  'P0001', 'office_holder', 'the only president cannot leave without a succession'
);
select lives_ok(
  $$ insert into fx (k, id) select 'pos_fin_rh', public.create_position((select id from fx where k = 'finance'), 'RH',
       array['members.view', 'positions.manage', 'positions.assign', 'delegations.manage', 'events.create'], 'custom') $$,
  'the president creates a custom position within her own keys'
);
select lives_ok(
  $$ select public.assign_position((select id from fx where k = 'm_lucas_fin'), (select id from fx where k = 'pos_fin_rh'),
                                  now() + interval '6 months') $$,
  'the president gives it to Lucas'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.create_position((select id from fx where k = 'finance'), 'Sponsoring', array['events.create']) $$,
  'P0001', 'mfa_required', 'granting powers needs a second-factor session'
);

-- =============================================================================
-- 5. The permission ceiling (Lucas, now with RH: positions.manage/assign,
--    delegations.manage, events.create)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';

select throws_ok(
  $$ select public.create_position((select id from fx where k = 'finance'), 'Accueil', array['members.manage']) $$,
  'P0001', 'permission_ceiling', 'nobody grants a key they do not hold'
);
select lives_ok(
  $$ select public.create_position((select id from fx where k = 'finance'), 'Rédaction', array['posts.create']) $$,
  'a key you hold can go on a new position'
);
select throws_ok(
  $$ select public.update_position((select id from fx where k = 'pos_fin_com'), 'Communication',
                                  array['members.view', 'posts.create', 'posts.edit', 'posts.publish', 'media.manage', 'members.manage']) $$,
  'P0001', 'permission_ceiling', 'an officer cannot add a key they lack to their own position'
);
select throws_ok(
  $$ select public.assign_position((select id from fx where k = 'm_lucas_fin'), (select id from fx where k = 'pos_fin_rh'),
                                  now() + interval '7 months') $$,
  'P0001', 'self_assignment', 'nobody assigns themselves a position'
);
select throws_ok(
  $$ select public.create_delegation((select id from fx where k = 'finance'), (select id from fx where k = 'm_hugo_fin'),
                                    array['members.invite'], now() + interval '5 days', 'cover me') $$,
  'P0001', 'permission_ceiling', 'a lent key cannot be lent on'
);
select throws_ok(
  $$ select public.create_delegation((select id from fx where k = 'finance'), (select id from fx where k = 'm_hugo_fin'),
                                    array['members.manage'], now() + interval '5 days', 'cover me') $$,
  'P0001', 'permission_not_delegable', 'a non-delegable key is refused'
);
select lives_ok(
  $$ insert into fx (k, id) select 'deleg_hugo', public.create_delegation((select id from fx where k = 'finance'),
       (select id from fx where k = 'm_hugo_fin'), array['events.create'], now() + interval '5 days', 'Remplacement (test)') $$,
  'an officer lends a key they hold, for a few days'
);

-- =============================================================================
-- 6. Mandates in time (as the owner, at chosen moments)
-- =============================================================================

reset role;

select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'members.view', now()),
  false, 'an expired mandate grants nothing'
);
select is(
  private.explain_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'analytics.view'),
  'mandate_ended', 'and the inspector says why'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000009', (select id from fx where k = 'finance'), 'posts.publish', now()),
  false, 'a suspended membership grants nothing, even with a running mandate'
);
select is(
  private.explain_permission('a0000000-0000-4000-8000-000000000009', (select id from fx where k = 'finance'), 'posts.publish'),
  'membership_suspended', 'and the inspector says why'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'events.create', now()),
  true, 'Hugo can create events through Lucas''s delegation'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'events.create',
                                           now() + interval '6 days'),
  false, 'the delegation lapses on its own'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000004', (select id from fx where k = 'finance'), 'members.invite',
                                           (select ends_at from public.position_assignments where id = (select id from fx where k = 'a_julie_pres'))),
  false, 'a mandate stops at its exact end (half-open window)'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000004', (select id from fx where k = 'finance'), 'members.invite',
                                           (select ends_at - interval '1 second' from public.position_assignments where id = (select id from fx where k = 'a_julie_pres'))),
  true, 'and works up to the last second'
);

-- Revocation without signing out: Julie ends Lucas's Événements mandate;
-- Lucas keeps the same session (same claims) and is refused at once, and
-- Hugo's delegation (backed by that key) dies with it.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select is(private.has_organization_permission((select id from fx where k = 'finance'), 'events.publish'), true,
  'Lucas can publish events before');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.end_assignment((select id from fx where k = 'a_lucas_events'), 'Fin de mission') $$,
  'the president ends one of Lucas''s mandates'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select is(private.has_organization_permission((select id from fx where k = 'finance'), 'events.publish'), false,
  'Lucas, same session, is refused at once');
select is(private.has_organization_permission((select id from fx where k = 'finance'), 'posts.publish'), true,
  'his other position still works');
reset role;
select is(
  private.explain_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'events.create'),
  'delegation', 'Hugo''s delegated key is still backed: Lucas keeps events.create through RH'
);

-- A mandate that starts later is not effective yet.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.assign_position((select id from fx where k = 'm_hugo_fin'), (select id from fx where k = 'pos_fin_com'),
                                  now() + interval '6 months', now() + interval '3 days') $$,
  'a mandate can be scheduled for later'
);
reset role;
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'posts.publish', now()),
  false, 'a scheduled mandate grants nothing before it starts'
);
select is(
  private.user_has_organization_permission('a0000000-0000-4000-8000-000000000008', (select id from fx where k = 'finance'), 'posts.publish',
                                           now() + interval '4 days'),
  true, 'and starts on time without any job'
);

-- =============================================================================
-- 7. Invitations
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select is_empty(
  $$ select 1 from public.organization_invitations where organization_id = (select id from fx where k = 'finance') $$,
  'another association''s president reads none of Finance''s invitations'
);
select throws_ok(
  $$ select public.respond_to_invitation((select id from fx where k = 'inv_nina'), true) $$,
  'P0001', 'invitation_not_found', 'nobody accepts someone else''s invitation'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal1"}';
select is(
  (select count(*)::int from public.organization_invitations where id = (select id from fx where k = 'inv_nina')), 1,
  'the invitee sees her invitation'
);
select lives_ok(
  $$ select public.respond_to_invitation((select id from fx where k = 'inv_nina'), true) $$,
  'the invitee accepts with her own account'
);
select ok(
  private.has_organization_permission((select id from fx where k = 'finance'), 'posts.publish'),
  'she now holds the offered position''s keys'
);
select throws_ok(
  $$ select public.respond_to_invitation((select id from fx where k = 'inv_nina'), true) $$,
  'P0001', 'invitation_not_pending', 'an invitation cannot be replayed'
);

-- An invitation sent by someone who has since lost the authority grants nothing.
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 'inv_paul', public.invite_member((select id from fx where k = 'finance'), 'paul.sports@comptes.example.test') $$,
  'Lucas invites with the lent key'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.revoke_delegation((select id from fx where k = 'deleg_lucas'), 'Partiels finis') $$,
  'the president takes the lent key back'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select is(private.has_organization_permission((select id from fx where k = 'finance'), 'members.invite'), false,
  'a revoked delegation grants nothing');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.respond_to_invitation((select id from fx where k = 'inv_paul'), true) $$,
  'P0001', 'invitation_invalid', 'the invitation of an officer who lost the key cannot be accepted'
);

-- An expired invitation.
reset role;
update public.organization_invitations set expires_at = now() - interval '1 minute'
 where email = 'nouvelle@student.example.test';
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000ff', 'nouvelle@student.example.test');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-0000000000ff", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.respond_to_invitation((select id from public.organization_invitations where email = 'nouvelle@student.example.test'), true) $$,
  'P0001', 'invitation_expired', 'an expired invitation cannot be accepted'
);

-- =============================================================================
-- 8. Association succession (Sports: Emma proposed Paul)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.respond_to_leadership_candidacy((select id from fx where k = 't_sports'), true) $$,
  'P0001', 'mfa_required', 'accepting a presidency needs a second-factor session'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.respond_to_leadership_candidacy((select id from fx where k = 't_sports'), true) $$,
  'P0001', 'transition_not_found', 'someone who is not the candidate cannot accept'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.propose_association_succession((select id from fx where k = 'sports'), 'lucas.finance@comptes.example.test',
                                                  now() + interval '6 months') $$,
  'P0001', 'transition_conflict', 'a competing succession is refused while one is open'
);
reset role;
select is(private.office_holder((select id from fx where k = 'sports'), 'association_president', now()),
  'a0000000-0000-4000-8000-000000000006'::uuid, 'a pending succession changes nothing yet');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal2"}';
select is(
  public.respond_to_leadership_candidacy((select id from fx where k = 't_sports'), true), 'completed',
  'the successor accepts and the handover completes'
);
reset role;
select is(private.office_holder((select id from fx where k = 'sports'), 'association_president', now()),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'the successor is president');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal2"}';
select ok(private.has_organization_permission((select id from fx where k = 'sports'), 'members.invite'),
  'the new president can manage Sports');
select ok(not private.has_organization_permission((select id from fx where k = 'finance'), 'members.invite'),
  'and nothing of Finance');
select throws_ok(
  $$ select public.respond_to_leadership_candidacy((select id from fx where k = 't_sports'), true) $$,
  'P0001', 'transition_not_open', 'a completed transition cannot be accepted twice'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select ok(not private.has_organization_permission((select id from fx where k = 'sports'), 'members.invite'),
  'the former president''s powers ended');
reset role;
select ok(
  exists (select 1 from public.governance_audit_events
           where action = 'leadership_transition_completed' and organization_id = (select id from fx where k = 'sports')),
  'the handover is in the audit history'
);

-- A handover at a later date, and a declined one.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 't_sports_later', public.propose_association_succession((select id from fx where k = 'sports'),
       'emma.sports@comptes.example.test', now() + interval '11 months', now() + interval '10 days') $$,
  'a president proposes a handover in ten days'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_sports_later'), true), 'completed',
  'accepted: the mandates are created now');
reset role;
select is(private.office_holder((select id from fx where k = 'sports'), 'association_president', now()),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'the sitting president stays until the date');
select is(private.office_holder((select id from fx where k = 'sports'), 'association_president', now() + interval '11 days'),
  'a0000000-0000-4000-8000-000000000006'::uuid, 'the successor takes over on the date, without any job');

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 't_fin_declined', public.propose_association_succession((select id from fx where k = 'finance'),
       'hugo.finance@comptes.example.test', now() + interval '6 months') $$,
  'Julie proposes Hugo'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal1"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_fin_declined'), false), 'cancelled',
  'Hugo declines');
reset role;
select is(private.office_holder((select id from fx where k = 'finance'), 'association_president', now()),
  'a0000000-0000-4000-8000-000000000004'::uuid, 'a declined succession transfers nothing');

-- An expired request can never complete.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 't_fin_expired', public.propose_association_succession((select id from fx where k = 'finance'),
       'hugo.finance@comptes.example.test', now() + interval '6 months') $$,
  'Julie proposes Hugo again'
);
reset role;
update public.leadership_transitions set expires_at = now() - interval '1 second', created_at = now() - interval '15 days'
 where id = (select id from fx where k = 't_fin_expired');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.respond_to_leadership_candidacy((select id from fx where k = 't_fin_expired'), true) $$,
  'P0001', 'transition_expired', 'an expired succession cannot be replayed'
);

-- =============================================================================
-- 9. BDE intervention in an association emergency (Alice)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.end_office_mandate((select id from fx where k = 'a_julie_pres'), 'coup de force') $$,
  'P0001', 'insufficient_permission', 'an association officer cannot invoke the emergency override'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.end_office_mandate((select id from fx where k = 'a_julie_pres'), '') $$,
  'P0001', 'reason_required', 'an emergency needs a written reason'
);
select throws_ok(
  $$ select public.create_organization('Plateforme', 'plateforme') $$,
  'P0001', 'organization_invalid', 'workspace route names are reserved slugs'
);
select lives_ok(
  $$ select public.end_office_mandate((select id from fx where k = 'a_julie_pres'), 'Compte de la présidente compromis (test)') $$,
  'BDE leadership ends a compromised presidency'
);
reset role;
select is(private.office_holder((select id from fx where k = 'finance'), 'association_president', now()), null::uuid,
  'Finance has no president for now');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 't_fin_emergency', public.propose_association_appointment((select id from fx where k = 'finance'),
       'hugo.finance@comptes.example.test', 'Intérim après compromission (test)', now() + interval '4 months') $$,
  'BDE leadership proposes an interim president'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_fin_emergency'), true), 'completed',
  'the interim accepts');
reset role;
select is(private.office_holder((select id from fx where k = 'finance'), 'association_president', now()),
  'a0000000-0000-4000-8000-000000000008'::uuid, 'the interim is president');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.invite_member((select id from fx where k = 'finance'), 'someone@student.example.test') $$,
  'P0001', 'insufficient_permission', 'the removed president, same session and token, is refused'
);
reset role;
select is(
  (select reason from public.governance_audit_events where action = 'association_president_removed' order by id desc limit 1),
  'Compte de la présidente compromis (test)', 'the emergency and its reason are in the history'
);

-- =============================================================================
-- 10. BDE succession, dual approval (Léa and Tom proposed; Alice approved)
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000b", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_bde'), true), 'open',
  'the incoming president accepts: not enough yet');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000c", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_bde'), true), 'open',
  'both candidates accepted, the president approved alone: still not enough');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.approve_bde_succession((select id from fx where k = 't_bde')) $$,
  'P0001', 'already_approved', 'the president cannot approve twice'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.approve_bde_succession((select id from fx where k = 't_bde')) $$,
  'P0001', 'approval_not_allowed', 'an association officer cannot approve'
);
reset role;
select throws_ok(
  $$ insert into public.leadership_transition_approvals (transition_id, capacity, approver_user_id)
     values ((select id from fx where k = 't_bde'), 'bde_vice_president', 'a0000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'one person can never count as both approvals'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.approve_bde_succession((select id from fx where k = 't_bde')) $$,
  'P0001', 'mfa_required', 'a BDE approval needs a second-factor session'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated", "aal": "aal2"}';
select is(public.approve_bde_succession((select id from fx where k = 't_bde')), 'completed',
  'the vice-president approves: two distinct approvals, both acceptances, complete');
reset role;
select is(private.office_holder((select id from fx where k = 'bde'), 'bde_president', now()),
  'a0000000-0000-4000-8000-000000000001'::uuid, 'the sitting president serves until the handover date');
select is(private.office_holder((select id from fx where k = 'bde'), 'bde_president', now() + interval '32 days'),
  'a0000000-0000-4000-8000-00000000000b'::uuid, 'the new president takes office on the date');
select is(private.office_holder((select id from fx where k = 'bde'), 'bde_vice_president', now() + interval '32 days'),
  'a0000000-0000-4000-8000-00000000000c'::uuid, 'and the new vice-president');
select is(private.user_has_platform_permission('a0000000-0000-4000-8000-000000000001', 'platform.governance.view', now() + interval '32 days'),
  false, 'the former president loses platform powers after the date');
select is(private.user_has_platform_permission('a0000000-0000-4000-8000-00000000000b', 'platform.governance.view', now() + interval '32 days'),
  true, 'the new president gains them');
select throws_ok(
  $$ insert into public.position_assignments (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source)
     select (select id from fx where k = 'bde'), m.id, m.user_id, (select id from fx where k = 'pos_bde_president'),
            now(), now() + interval '1 month', 'appointment'
       from public.memberships m where m.organization_id = (select id from fx where k = 'bde')
        and m.user_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '23P01', null, 'two overlapping BDE presidents are impossible, whatever writes'
);
select throws_ok(
  $$ insert into public.position_assignments (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source)
     select (select id from fx where k = 'bde'), m.id, m.user_id, (select id from fx where k = 'pos_bde_vp'),
            now() + interval '40 days', now() + interval '50 days', 'appointment'
       from public.memberships m where m.organization_id = (select id from fx where k = 'bde')
        and m.user_id = 'a0000000-0000-4000-8000-00000000000b' $$,
  '23P01', null, 'one person can never hold both BDE offices at once'
);
select ok(
  (select count(*) from public.governance_audit_events where action = 'bde_succession_approved') = 2,
  'both approvals are in the history'
);

-- =============================================================================
-- 11. The continuity guardian (Garance)
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.governance_overview() $$, 'the guardian sees the governance overview');
select throws_ok(
  $$ select public.organization_team((select id from fx where k = 'finance')) $$,
  'P0001', 'insufficient_permission', 'the guardian cannot read an association''s team'
);
select is(
  private.has_organization_permission((select id from fx where k = 'finance'), 'recruitment.applications.view'), false,
  'the guardian has no access to (future) applications'
);
select throws_ok(
  $$ insert into public.platform_assignments (user_id, role, starts_at, ends_at, reason)
     values ('a0000000-0000-4000-8000-000000000003', 'guardian', now(), now() + interval '4 years', 'more') $$,
  '42501', null, 'the guardian cannot grant themselves anything'
);
select throws_ok(
  $$ select public.propose_bde_recovery('bde_president', 'nina@comptes.example.test', 'take over', now() + interval '2 months') $$,
  'P0001', 'office_occupied', 'recovery never replaces a sitting officeholder'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.end_office_mandate((select id from fx where k = 'a_marc_vp'), 'Compte perdu (test)') $$,
  'P0001', 'mfa_required', 'recovery needs a second-factor session'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.end_office_mandate((select id from fx where k = 'a_marc_vp'), 'Compte du vice-président perdu (test)') $$,
  'the guardian ends a lost BDE mandate'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.end_office_mandate((select id from public.position_assignments where office = 'bde_president'
                                       and user_id = 'a0000000-0000-4000-8000-00000000000b'), 'rivalry') $$,
  'P0001', 'insufficient_permission', 'a BDE officer cannot remove the other one'
);

-- One office vacant: the guardian's approval stands in for it.
select lives_ok(
  $$ insert into fx (k, id) select 't_bde_interim', public.propose_bde_succession(null, 'paul.sports@comptes.example.test',
       now() + interval '25 days') $$,
  'the president proposes an interim vice-president'
);
select is(public.approve_bde_succession((select id from fx where k = 't_bde_interim')), 'open', 'the president approves');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select is(public.approve_bde_succession((select id from fx where k = 't_bde_interim')), 'open',
  'the guardian approves for the vacant office');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_bde_interim'), true), 'completed',
  'the interim accepts and takes office');
reset role;
select is(private.office_holder((select id from fx where k = 'bde'), 'bde_vice_president', now() + interval '32 days'),
  'a0000000-0000-4000-8000-00000000000c'::uuid, 'the approved successor after the interim is kept');

-- Break-glass recovery of a vacant office.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.end_office_mandate((select id from public.position_assignments where office = 'bde_vice_president'
                                       and user_id = 'a0000000-0000-4000-8000-00000000000a'), 'Intérim parti (test)') $$,
  'the guardian ends the interim mandate'
);
select throws_ok(
  $$ select public.propose_bde_recovery('bde_vice_president', 'garance.garante@comptes.example.test', 'self', now() + interval '20 days') $$,
  'P0001', 'candidate_not_allowed', 'the guardian never appoints themselves'
);
select lives_ok(
  $$ insert into fx (k, id) select 't_bde_recovery', public.propose_bde_recovery('bde_vice_president', 'nina@comptes.example.test',
       'Vice-présidence vacante (test)', now() + interval '20 days') $$,
  'the guardian proposes a recovery for the vacant office'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal2"}';
select is(public.respond_to_leadership_candidacy((select id from fx where k = 't_bde_recovery'), true), 'completed',
  'the appointee accepts');
reset role;
select is(private.office_holder((select id from fx where k = 'bde'), 'bde_vice_president', now()),
  'a0000000-0000-4000-8000-000000000007'::uuid, 'the vacant office is filled');
select is(private.user_has_organization_permission('a0000000-0000-4000-8000-000000000003', (select id from fx where k = 'bde'),
  'members.view', now()), false, 'the guardian gained no organization right');
select ok(
  exists (select 1 from public.governance_audit_events where category = 'recovery' and action = 'guardian_recovery_started'
             and reason = 'Vice-présidence vacante (test)'),
  'the recovery and its reason are in the history'
);

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.propose_bde_recovery('bde_president', 'lucas.finance@comptes.example.test', 'take over', now() + interval '2 months') $$,
  'P0001', 'insufficient_permission', 'an ordinary member cannot invoke recovery'
);

-- =============================================================================
-- 11b. Cancelling a succession, and a proposer who loses the office meanwhile
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) select 't_cancel', public.propose_association_succession((select id from fx where k = 'finance'),
       'lucas.finance@comptes.example.test', now() + interval '6 months') $$,
  'the interim president proposes a successor'
);
select lives_ok(
  $$ select public.cancel_leadership_transition((select id from fx where k = 't_cancel'), 'Erreur de personne (test)') $$,
  'the proposer cancels it'
);
select is(
  (select status from public.leadership_transitions where id = (select id from fx where k = 't_cancel')), 'cancelled',
  'a cancelled succession stays in the history as cancelled'
);
select lives_ok(
  $$ insert into fx (k, id) select 't_lost', public.propose_association_succession((select id from fx where k = 'finance'),
       'lucas.finance@comptes.example.test', now() + interval '6 months') $$,
  'a new proposal is possible once the first is cancelled'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.end_office_mandate(
       (select a.id from public.position_assignments a
         where a.organization_id = (select id from fx where k = 'finance') and a.office = 'association_president'
           and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at),
       'Compte compromis (test)') $$,
  'BDE leadership ends the proposer''s presidency'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.respond_to_leadership_candidacy((select id from fx where k = 't_lost'), true) $$,
  'P0001', 'proposer_lost_authority', 'nobody takes office from a president who no longer holds it'
);
reset role;
select is(private.office_holder((select id from fx where k = 'finance'), 'association_president', now()), null::uuid,
  'the presidency stays vacant until the BDE appoints someone');
set local role authenticated;

-- =============================================================================
-- 11c. A BDE officer withdraws their approval
-- =============================================================================

reset role;
-- Act as whichever BDE officer sits right now. Proposing is not approving: the
-- officer approves in a separate, explicit step.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', coalesce(private.office_holder((select id from fx where k = 'bde'), 'bde_president', now()),
                  private.office_holder((select id from fx where k = 'bde'), 'bde_vice_president', now())),
  'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select lives_ok(
  $$ insert into fx (k, id) select 't_withdraw', public.propose_bde_succession('lucas.finance@comptes.example.test',
       'paul.sports@comptes.example.test', now() + interval '6 months') $$,
  'a sitting BDE officer proposes the next leadership'
);
select is(public.approve_bde_succession((select id from fx where k = 't_withdraw')), 'open',
  'then approves it (still waiting for the rest)');
select lives_ok(
  $$ select public.withdraw_bde_approval((select id from fx where k = 't_withdraw')) $$,
  'the officer withdraws their approval'
);
reset role;
select is(
  (select count(*)::int from public.leadership_transition_approvals where transition_id = (select id from fx where k = 't_withdraw')),
  0, 'no approval is left on the transition'
);
set local role authenticated;
select throws_ok(
  $$ select public.withdraw_bde_approval((select id from fx where k = 't_withdraw')) $$,
  'P0001', 'approval_not_found', 'there is nothing left to withdraw'
);
select lives_ok(
  $$ select public.cancel_leadership_transition((select id from fx where k = 't_withdraw'), 'Test terminé') $$,
  'the officer cancels the proposal'
);

-- =============================================================================
-- 12. Organization lifecycle and bootstrap
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.set_organization_status((select id from fx where k = 'bde'), 'archived', 'no') $$,
  'P0001', 'bde_protected', 'the BDE cannot be archived through the app'
);
select lives_ok(
  $$ select public.set_organization_status((select id from fx where k = 'sports'), 'archived', 'Asso dissoute (test)') $$,
  'BDE leadership archives an association'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated", "aal": "aal2"}';
select ok(
  not private.has_organization_permission((select id from fx where k = 'sports'), 'members.invite')
  and private.has_organization_permission((select id from fx where k = 'sports'), 'members.view'),
  'an archived association can be read by its team but no longer operated'
);
reset role;
select throws_ok(
  $$ select private.bootstrap_governance('a0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005',
                                        null, now() + interval '1 month', null, 'again') $$,
  'P0001', 'bootstrap_already_done', 'the bootstrap cannot be run a second time'
);
select is(
  (select count(*)::int from public.governance_audit_events where action = 'governance_bootstrapped'), 1,
  'the bootstrap was recorded once'
);

select * from finish();
rollback;
