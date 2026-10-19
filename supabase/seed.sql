-- Development seed data.
--
-- Runs after every migration on `supabase db reset` (and on the first
-- `supabase start`), locally and in CI. It is NEVER loaded into a hosted
-- project (development or production): since Phase 4 it creates fictional
-- accounts with a known local password. Do not run
-- `supabase db push --include-seed` against any hosted project.
--
-- Rules (docs/backend/database-conventions.md, "Seed data"):
--   * fake people and content only: never a real student, applicant, CV,
--     application answer, personal email or reviewer note;
--   * placeholder domains only: gem.exemple.fr and asso.gem.exemple.fr;
--   * fixed UUIDs, so tests and links stay stable between resets;
--   * the Phase 1 mock content (src/data/mock) is the reference for
--     realistic names, dates and wording.
--
-- Phase 2 creates no domain tables, so there is nothing to seed yet. Each
-- later phase adds the rows its feature needs, below this header.

-- Phase 3: who may sign up on the LOCAL stack and in CI. A fictional domain
-- (.test is reserved and never resolves), so only made-up students such as
-- alice@student.example.test can create accounts. Production gets the real
-- school domain by hand (docs/backend/authentication.md); hosted projects
-- never receive this seed.
insert into private.allowed_signup_domains (domain, note)
values ('student.example.test', 'Fictional school domain for local development and CI')
on conflict (domain) do nothing;

-- Phase 4: a fictional governance world, for local development, the database
-- tests (supabase/tests/database/governance.test.sql) and the end-to-end
-- tests. Built by calling the governance functions as the fictional people
-- themselves (a second-factor session is simulated), so loading the seed also
-- exercises the workflows. Accounts use the reserved domain
-- comptes.example.test and the LOCAL-ONLY password below: they can sign in on
-- the local stack through the "Comptes de test" form (AUTH_TEST_ACCOUNTS=on).
--
--   Alice    BDE president          Marc   BDE vice-president
--   Garance  continuity guardian    Julie  president of "Finance (exemple)"
--   Lucas    Finance: Communication + Événements, members.invite lent by Julie
--   Emma     president of "Sports (exemple)", where Julie is a plain member
--   Hugo     Finance member whose treasurer mandate ended last month
--   Sarah    Finance member, suspended          Nina   invited to Finance
--   Paul     proposed by Emma as next Sports president (not answered yet)
--   Léa, Tom proposed as next BDE president and vice-president; Alice
--            approved, Marc has not yet
--   "Arts (exemple)" is still being set up (no president); "Conseil
--   (exemple)" is suspended.
do $seed$
declare
  v_alice uuid := 'a0000000-0000-4000-8000-000000000001';
  v_marc uuid := 'a0000000-0000-4000-8000-000000000002';
  v_garance uuid := 'a0000000-0000-4000-8000-000000000003';
  v_julie uuid := 'a0000000-0000-4000-8000-000000000004';
  v_lucas uuid := 'a0000000-0000-4000-8000-000000000005';
  v_emma uuid := 'a0000000-0000-4000-8000-000000000006';
  v_nina uuid := 'a0000000-0000-4000-8000-000000000007';
  v_hugo uuid := 'a0000000-0000-4000-8000-000000000008';
  v_sarah uuid := 'a0000000-0000-4000-8000-000000000009';
  v_paul uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_lea uuid := 'a0000000-0000-4000-8000-00000000000b';
  v_tom uuid := 'a0000000-0000-4000-8000-00000000000c';
  v_year_end timestamptz := now() + interval '10 months';
  v_finance uuid;
  v_sports uuid;
  v_arts uuid;
  v_conseil uuid;
  v_communication uuid;
  v_events uuid;
  v_treasurer uuid;
  v_transition uuid;
  v_invitation uuid;
  v_person record;
begin
  for v_person in
    select * from (values
      (v_alice, 'alice.bde', 'Alice'),
      (v_marc, 'marc.bde', 'Marc'),
      (v_garance, 'garance.garante', 'Garance'),
      (v_julie, 'julie.finance', 'Julie'),
      (v_lucas, 'lucas.finance', 'Lucas'),
      (v_emma, 'emma.sports', 'Emma'),
      (v_nina, 'nina', 'Nina'),
      (v_hugo, 'hugo.finance', 'Hugo'),
      (v_sarah, 'sarah.finance', 'Sarah'),
      (v_paul, 'paul.sports', 'Paul'),
      (v_lea, 'lea', 'Léa'),
      (v_tom, 'tom', 'Tom')
    ) as p (id, local_part, first_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_person.id, 'authenticated', 'authenticated',
      v_person.local_part || '@comptes.example.test',
      extensions.crypt('seed-local-password-2026', extensions.gen_salt('bf', 6)), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (v_person.id::text, v_person.id,
            jsonb_build_object('sub', v_person.id::text, 'email', v_person.local_part || '@comptes.example.test',
                               'email_verified', true, 'phone_verified', false),
            'email', now(), now());
    update public.profiles
       set first_name = v_person.first_name, last_name = 'Exemple', onboarding_completed_at = now()
     where id = v_person.id;
  end loop;

  -- The one-time bootstrap (normally run by the project owner).
  perform private.bootstrap_governance(v_alice, v_marc, v_garance, v_year_end, now() + interval '3 years',
                                       'Données de démonstration locales');

  -- Alice creates the associations and names their first presidents.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_alice, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_finance := public.create_organization('Finance (exemple)', 'exemple-finance', 'pro', 'bleu', 'Finance', 'Association fictive de démonstration.');
  v_sports := public.create_organization('Sports (exemple)', 'exemple-sports', 'sport', 'vert', 'Sports', 'Association fictive de démonstration.');
  v_arts := public.create_organization('Arts (exemple)', 'exemple-arts', 'arts', 'violet', 'Arts', null);
  v_conseil := public.create_organization('Conseil (exemple)', 'exemple-conseil', 'pro', 'orange', 'Conseil', null);
  perform public.set_organization_status(v_finance, 'active');
  perform public.set_organization_status(v_sports, 'active');
  perform public.set_organization_status(v_conseil, 'active');
  perform public.set_organization_status(v_conseil, 'suspended', 'Exemple : asso suspendue par le BDE.');
  v_transition := public.propose_association_appointment(v_finance, 'julie.finance@comptes.example.test', 'Première présidence (démo)', v_year_end);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.respond_to_leadership_candidacy(v_transition, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_alice, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_transition := public.propose_association_appointment(v_sports, 'emma.sports@comptes.example.test', 'Première présidence (démo)', v_year_end);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_emma, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.respond_to_leadership_candidacy(v_transition, true);

  -- Julie builds the Finance team.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_communication := public.create_position(v_finance, 'Communication',
    array(select permission_key from public.position_template_permissions where template_key = 'communications'), 'communications');
  v_events := public.create_position(v_finance, 'Événements',
    array(select permission_key from public.position_template_permissions where template_key = 'events'), 'events');
  v_treasurer := public.create_position(v_finance, 'Trésorerie',
    array(select permission_key from public.position_template_permissions where template_key = 'treasurer'), 'treasurer');
  foreach v_invitation in array array[
    public.invite_member(v_finance, 'lucas.finance@comptes.example.test', v_communication, v_year_end),
    public.invite_member(v_finance, 'hugo.finance@comptes.example.test'),
    public.invite_member(v_finance, 'sarah.finance@comptes.example.test', v_communication, v_year_end)
  ] loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', (select u.id from auth.users u join public.organization_invitations i on lower(u.email) = i.email where i.id = v_invitation),
      'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform public.respond_to_invitation(v_invitation, true);
  end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.assign_position((select id from public.memberships where organization_id = v_finance and user_id = v_lucas),
                                 v_events, v_year_end);
  perform public.set_membership_status((select id from public.memberships where organization_id = v_finance and user_id = v_sarah),
                                       'suspended', 'Exemple : membre suspendue.');
  perform public.invite_member(v_finance, 'nina@comptes.example.test', v_communication, v_year_end);
  perform public.create_delegation(v_finance, (select id from public.memberships where organization_id = v_finance and user_id = v_lucas),
                                   array['members.invite'], now() + interval '10 days', 'Exemple : remplacement pendant les partiels.');

  -- Hugo was treasurer last year: a mandate that has already ended.
  insert into public.position_assignments (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source, appointed_by)
  values (v_finance, (select id from public.memberships where organization_id = v_finance and user_id = v_hugo), v_hugo,
          v_treasurer, now() - interval '13 months', now() - interval '1 month', 'appointment', v_julie);

  -- Emma invites Julie to Sports (plain membership) and proposes Paul as successor.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_emma, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_invitation := public.invite_member(v_sports, 'julie.finance@comptes.example.test');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.respond_to_invitation(v_invitation, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_emma, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.propose_association_succession(v_sports, 'paul.sports@comptes.example.test', now() + interval '11 months');

  -- Alice proposes the next BDE leadership and approves; Marc has not yet.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_alice, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_transition := public.propose_bde_succession('lea@comptes.example.test', 'tom@comptes.example.test',
                                                now() + interval '12 months', now() + interval '1 month');
  perform public.approve_bde_succession(v_transition);

  perform set_config('request.jwt.claims', '', true);
end
$seed$;
