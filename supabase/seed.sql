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
--   * reserved placeholder domains only (.test never resolves): student.example.test
--     for sign-up, comptes.example.test for the fictional accounts;
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

-- Phase 5: fictional association pages, each with its own look, all built
-- through the same functions and the same page component (no special code
-- per association): variation comes only from data. No photos (the seed
-- cannot upload files): pages show their designed fallbacks.
--   Finance (exemple)  published · bleu · 2 categories · pillars, socials, contact
--   Sports (exemple)   published · vert · meeting info, no socials
--   Arts (exemple)     draft only (association still being set up)
do $seed5$
declare
  v_julie uuid := 'a0000000-0000-4000-8000-000000000004';
  v_lucas uuid := 'a0000000-0000-4000-8000-000000000005';
  v_emma uuid := 'a0000000-0000-4000-8000-000000000006';
  v_finance uuid := (select id from public.organizations where slug = 'exemple-finance');
  v_sports uuid := (select id from public.organizations where slug = 'exemple-sports');
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.save_association_draft(v_finance,
    (select to_jsonb(p) from public.association_profiles p where p.organization_id = v_finance and p.stage = 'draft'),
    jsonb_build_object(
      'kind_label', 'Association étudiante (exemple)',
      'tagline', 'Exemple fictif : la finance de marché, racontée entre étudiant·es.',
      'description', E'Association fictive des données de démonstration. Ce texte montre une présentation de plusieurs paragraphes.\n\nUn deuxième paragraphe, pour voir l''espacement de la page publique.',
      'pillars', jsonb_build_array(
        jsonb_build_object('title', 'Exemple de point fort', 'detail', 'Une phrase fictive qui explique ce point.'),
        jsonb_build_object('title', 'Un deuxième point', 'detail', 'Encore une phrase de démonstration.')),
      'contact_email', 'finance@asso.example.test',
      'social_links', jsonb_build_array(
        jsonb_build_object('platform', 'instagram', 'url', 'https://www.instagram.com/exemple.finance.test/'),
        jsonb_build_object('platform', 'website', 'url', 'https://finance.example.test/')),
      'category_ids', (select jsonb_agg(id order by sort_order) from public.association_categories where slug in ('pro', 'entrepreneuriat'))
    ));
  perform public.publish_association_page(v_finance,
    (select revision from public.association_profiles where organization_id = v_finance and stage = 'draft'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_emma, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.save_association_draft(v_sports,
    (select to_jsonb(p) from public.association_profiles p where p.organization_id = v_sports and p.stage = 'draft'),
    jsonb_build_object(
      'kind_label', 'Association sportive (exemple)',
      'tagline', 'Exemple fictif : du sport chaque semaine, sans prise de tête.',
      'description', 'Association fictive des données de démonstration, avec un seul paragraphe de présentation.',
      'meeting_info', 'Exemple : entraînement fictif le mercredi soir.'
    ));
  perform public.publish_association_page(v_sports,
    (select revision from public.association_profiles where organization_id = v_sports and stage = 'draft'));

  -- Lucas chooses to show a short bio (no photo) on Finance's public team.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_lucas, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.set_my_public_team_profile(
    (select id from public.memberships where organization_id = v_finance and user_id = v_lucas),
    false, false, 'Bio fictive de démonstration.');

  perform set_config('request.jwt.claims', '', true);
end
$seed5$;

-- Phase 6: fictional posts in every editorial state, written by calling the
-- publishing functions as the fictional people above (local stack only).
--   Finance (approval required): one published article with an edit waiting
--   for review, Lucas's draft, a submission, an approved brève, an article
--   scheduled for next week.
--   Sports (direct publishing): a published recap, an archived article, an
--   announcement hidden by BDE moderation after a report.
--   BDE: an important announcement.
do $seed6$
declare
  v_alice uuid := 'a0000000-0000-4000-8000-000000000001';
  v_julie uuid := 'a0000000-0000-4000-8000-000000000004';
  v_lucas uuid := 'a0000000-0000-4000-8000-000000000005';
  v_emma uuid := 'a0000000-0000-4000-8000-000000000006';
  v_nina uuid := 'a0000000-0000-4000-8000-000000000007';
  v_finance uuid := (select id from public.organizations where slug = 'exemple-finance');
  v_sports uuid := (select id from public.organizations where slug = 'exemple-sports');
  v_bde uuid := (select id from public.organizations where kind = 'bde');
  v_post uuid;
  v_rev jsonb;
  v_category uuid;
  -- A short rich-text body, clearly fictional.
  v_body jsonb := '{"type": "doc", "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Texte fictif de démonstration, écrit pour les données locales."}]},
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Un intertitre"}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Un second paragraphe, avec un "},
      {"type": "text", "marks": [{"type": "bold"}], "text": "passage en gras"},
      {"type": "text", "text": " et un "},
      {"type": "text", "marks": [{"type": "link", "attrs": {"href": "/associations/exemple-finance"}}], "text": "lien interne"},
      {"type": "text", "text": "."}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Premier point"}]}]},
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Second point"}]}]}]}
  ]}'::jsonb;
begin
  -- Finance asks for a review before every publication.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.set_editorial_settings(v_finance, 'approval', true);

  -- 1. Published, then edited (the edit waits for review).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_lucas, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select id into v_category from public.post_categories where slug = 'vie-associative';
  v_post := public.create_post(v_finance, 'article', 'Rentrée de l''asso Finance (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'article', 'title', 'Rentrée de l''asso Finance (exemple)',
                       'intro', 'Article fictif de démonstration : ce que prépare l''asso cette année.',
                       'body', v_body, 'category_id', v_category, 'tags', jsonb_build_array('rentree', 'finance')));
  perform public.submit_post_revision(v_post, (v_rev ->> 'revision_id')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.review_post_revision(v_post, (v_rev ->> 'revision_id')::uuid, 'approve', null);
  perform public.publish_post(v_post, (v_rev ->> 'revision_id')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_lucas, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_rev := public.save_post_revision(v_post, (v_rev ->> 'revision_id')::uuid, 0,
    jsonb_build_object('kind', 'article', 'title', 'Rentrée de l''asso Finance (exemple, corrigé)',
                       'intro', 'Article fictif de démonstration, version corrigée en attente de relecture.',
                       'body', v_body, 'category_id', v_category, 'tags', jsonb_build_array('rentree', 'finance')));
  perform public.submit_post_revision(v_post, (v_rev ->> 'revision_id')::uuid);

  -- 2. A draft.
  v_post := public.create_post(v_finance, 'annonce', 'Brouillon de Lucas (exemple)');
  perform public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'annonce', 'title', 'Brouillon de Lucas (exemple)',
                       'intro', 'Brouillon fictif, jamais publié.', 'body', v_body, 'tags', '[]'::jsonb));

  -- 3. Waiting for review.
  v_post := public.create_post(v_finance, 'article', 'Soirée networking (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'article', 'title', 'Soirée networking (exemple)',
                       'intro', 'Article fictif soumis à la relecture de la présidence.', 'body', v_body, 'tags', '[]'::jsonb));
  perform public.submit_post_revision(v_post, (v_rev ->> 'revision_id')::uuid);

  -- 4. Approved, not yet published.
  v_post := public.create_post(v_finance, 'breve', 'Partenariats (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'breve', 'title', 'Partenariats (exemple)',
                       'intro', 'Brève fictive approuvée, pas encore publiée.', 'body', '{"type": "doc", "content": []}'::jsonb,
                       'tags', '[]'::jsonb));
  perform public.submit_post_revision(v_post, (v_rev ->> 'revision_id')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.review_post_revision(v_post, (v_rev ->> 'revision_id')::uuid, 'approve', null);

  -- 5. Approved and scheduled for next week.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_lucas, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_post := public.create_post(v_finance, 'article', 'Atelier marchés (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'article', 'title', 'Atelier marchés (exemple)',
                       'intro', 'Article fictif programmé pour la semaine prochaine.', 'body', v_body, 'tags', '[]'::jsonb));
  perform public.submit_post_revision(v_post, (v_rev ->> 'revision_id')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.review_post_revision(v_post, (v_rev ->> 'revision_id')::uuid, 'approve', null);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_lucas, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.schedule_post(v_post, (v_rev ->> 'revision_id')::uuid, date_trunc('hour', now()) + interval '7 days');

  -- Sports publishes directly (the default policy).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_emma, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select id into v_category from public.post_categories where slug = 'sport';
  v_post := public.create_post(v_sports, 'recap', 'Récap du tournoi (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'recap', 'title', 'Récap du tournoi (exemple)',
                       'intro', 'Récap fictif d''un tournoi qui n''a pas eu lieu.', 'body', v_body,
                       'category_id', v_category, 'tags', jsonb_build_array('tournoi')));
  perform public.publish_post(v_post, (v_rev ->> 'revision_id')::uuid);

  v_post := public.create_post(v_sports, 'article', 'Ancien article (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'article', 'title', 'Ancien article (exemple)',
                       'intro', 'Article fictif archivé.', 'body', v_body, 'tags', '[]'::jsonb));
  perform public.publish_post(v_post, (v_rev ->> 'revision_id')::uuid);
  perform public.archive_post(v_post, true);

  v_post := public.create_post(v_sports, 'annonce', 'Annonce masquée (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'annonce', 'title', 'Annonce masquée (exemple)',
                       'intro', 'Annonce fictive masquée par la modération du BDE.', 'body', v_body, 'tags', '[]'::jsonb));
  perform public.publish_post(v_post, (v_rev ->> 'revision_id')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_nina, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.report_post(v_post, 'misleading', 'Signalement fictif de démonstration.');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_alice, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.hide_post(v_post, 'Masquage fictif de démonstration.');

  -- The BDE's important announcement.
  select id into v_category from public.post_categories where slug = 'infos-pratiques';
  v_post := public.create_post(v_bde, 'annonce', 'Infos de rentrée (exemple)');
  v_rev := public.save_post_revision(v_post, (select working_revision_id from public.posts where id = v_post), 1,
    jsonb_build_object('kind', 'annonce', 'title', 'Infos de rentrée (exemple)',
                       'intro', 'Annonce fictive du BDE, mise en avant comme importante.', 'body', v_body,
                       'category_id', v_category, 'tags', '[]'::jsonb));
  perform public.publish_post(v_post, (v_rev ->> 'revision_id')::uuid);
  perform public.set_post_prominence(v_post, 'important', null);

  perform set_config('request.jwt.claims', '', true);
end
$seed6$;
