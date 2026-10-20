-- Phase 5 · Association pages: the security matrix, straight against the
-- database (never through the interface). Runs on top of supabase/seed.sql:
--   Julie presides Finance; Lucas holds Communication + Événements there
--   (media.manage, not the page); Sarah is suspended in Finance; Hugo's
--   treasurer mandate has ended; Emma presides Sports; Nina belongs nowhere;
--   Alice and Marc lead the BDE; Garance is the guardian. Finance and Sports
--   pages are published, Arts is a draft, Conseil is suspended.
-- Everything is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert on fx to anon, authenticated;
insert into fx (k, id) values
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('lucas_finance', (select id from public.memberships where user_id = 'a0000000-0000-4000-8000-000000000005'
                      and organization_id = (select id from public.organizations where slug = 'exemple-finance'))),
  ('communication', (select id from public.positions where title = 'Communication'
                      and organization_id = (select id from public.organizations where slug = 'exemple-finance'))),
  ('m1', 'b0000000-0000-4000-8000-000000000001'),
  ('m2', 'b0000000-0000-4000-8000-000000000002');
-- The draft as everyone loaded it at the start (for the concurrency checks).
insert into fx (k, v) values
  ('base', (select to_jsonb(p)::text from public.association_profiles p
             where p.stage = 'draft' and p.organization_id = (select id from fx where k = 'finance')));

-- =============================================================================
-- 1. Visitors read published, public pages only
-- =============================================================================

set local role anon;
select is(
  (select array_agg(e ->> 'slug' order by e ->> 'slug') from jsonb_array_elements(public.public_associations()) as e),
  array['exemple-finance', 'exemple-sports', 'very-pink-club'],
  'the directory lists the published pages of active organizations only'
);
select is(public.public_association('exemple-arts') ->> 'state', 'unavailable', 'a draft page is not public');
select is(public.public_association('exemple-conseil') ->> 'state', 'unavailable', 'a suspended association is not public');
select is(public.public_association('nulle-part') ->> 'state', 'not_found', 'an unknown address is not found');
select ok(
  public.public_association('exemple-finance')::text !~ '(comptes\.example\.test|user_id|"status"|status_reason|revision)',
  'a public page carries no e-mail, account id, status or internal field'
);
select is(
  (select array_agg(t ->> 'name' order by t ->> 'name')
     from jsonb_array_elements(public.public_association('exemple-finance') -> 'association' -> 'team') as t),
  array['Julie Exemple', 'Lucas Exemple'],
  'the public team shows current officers only (no suspended member, no ended mandate)'
);
select throws_ok($$ select * from public.association_profiles $$, '42501', null, 'a visitor cannot read profile rows');
select throws_ok($$ select * from public.memberships $$, '42501', null, 'a visitor cannot read memberships');
select throws_ok($$ select public.association_preview((select id from fx where k = 'finance')) $$,
  '42501', null, 'a visitor cannot preview a draft');
select throws_ok($$ select public.publish_association_page((select id from fx where k = 'finance'), 1) $$,
  '42501', null, 'a visitor cannot call publish');

-- =============================================================================
-- 2. Preparing the draft
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), (select v::jsonb from fx where k = 'base'),
       jsonb_build_object('tagline', 'Nouvelle accroche (test).')) $$,
  'the president saves the draft'
);
select is(
  (select public.public_association('exemple-finance') -> 'association' ->> 'tagline'),
  'Exemple fictif : la finance de marché, racontée entre étudiant·es.',
  'the public page does not change while the edit is a draft'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'sports'), '{}'::jsonb,
       jsonb_build_object('tagline', 'Prise de contrôle (test).')) $$,
  'P0001', 'insufficient_permission', 'a president cannot edit another association''s page'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), (select v::jsonb from fx where k = 'base'),
       jsonb_build_object('accent', 'or')) $$,
  'P0001', 'insufficient_permission', 'communication without the page right cannot change the branding'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.update_position((select id from fx where k = 'communication'), 'Communication',
       array['members.view', 'posts.create', 'posts.edit', 'posts.publish', 'media.manage', 'organization.settings.update']) $$,
  'the president gives Communication the right to prepare the page'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), (select v::jsonb from fx where k = 'base'),
       jsonb_build_object('accent', 'or')) $$,
  'with the right, communication changes the colour, without touching the president''s edit'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), (select v::jsonb from fx where k = 'base'),
       jsonb_build_object('tagline', 'Écrasement (test).')) $$,
  'P0001', 'draft_conflict', 'a stale edit of the same field is refused, not silently overwritten'
);
reset role;
select is(
  (select tagline || ' / ' || accent from public.association_profiles
    where organization_id = (select id from fx where k = 'finance') and stage = 'draft'),
  'Nouvelle accroche (test). / or',
  'both edits are kept'
);
set local role authenticated;

select lives_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('description', '<script>alert("x")</script> Un texte reste du texte.')) $$,
  'markup is accepted as plain text (the site prints it, never runs it)'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('social_links', jsonb_build_array(jsonb_build_object('platform', 'website', 'url', 'javascript:alert(1)')))) $$,
  'P0001', 'profile_invalid', 'a javascript: link is refused'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('social_links', jsonb_build_array(jsonb_build_object('platform', 'instagram', 'url', 'https://evil.example.test/instagram.com/')))) $$,
  'P0001', 'profile_invalid', 'an Instagram link must point to Instagram'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('contact_email', 'pas une adresse')) $$,
  'P0001', 'profile_invalid', 'an invalid contact address is refused'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('revision', 99)) $$,
  'P0001', 'profile_invalid', 'only page fields can be written'
);
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('category_ids', jsonb_build_array(gen_random_uuid()))) $$,
  'P0001', 'category_invalid', 'an unknown category is refused'
);

-- An officer whose mandate has ended, and a suspended member, edit nothing.
reset role;
insert into public.positions (organization_id, title, template_key, sort_order)
values ((select id from fx where k = 'finance'), 'Ancienne vice-présidence (test)', 'custom', 50);
insert into public.position_permissions (position_id, permission_key)
select id, 'organization.settings.update' from public.positions where title = 'Ancienne vice-présidence (test)';
insert into public.position_assignments (organization_id, membership_id, user_id, position_id, starts_at, ends_at, source)
select m.organization_id, m.id, m.user_id, (select id from public.positions where title = 'Ancienne vice-présidence (test)'),
       now() - interval '6 months', now() - interval '1 day', 'appointment'
  from public.memberships m
 where m.user_id = 'a0000000-0000-4000-8000-000000000008' and m.organization_id = (select id from fx where k = 'finance');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('founded_year', 2001)) $$,
  'P0001', 'insufficient_permission', 'an officer whose mandate ended cannot edit the page'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000009", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('founded_year', 2001)) $$,
  'P0001', 'insufficient_permission', 'a suspended member cannot edit the page'
);

-- =============================================================================
-- 3. Preview and publication
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select is(
  public.association_preview((select id from fx where k = 'finance')) ->> 'tagline', 'Nouvelle accroche (test).',
  'the page team previews the draft'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.association_preview((select id from fx where k = 'finance')) $$,
  'P0001', 'insufficient_permission', 'someone outside the team cannot preview the draft'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_association_page((select id from fx where k = 'finance'),
       (select revision from public.association_profiles where organization_id = (select id from fx where k = 'finance') and stage = 'draft')) $$,
  'P0001', 'insufficient_permission', 'preparing the page does not mean publishing it'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.publish_association_page((select id from fx where k = 'finance'), 0) $$,
  'P0001', 'mfa_required', 'publishing needs a second-factor session'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_association_page((select id from fx where k = 'finance'), 1) $$,
  'P0001', 'draft_changed', 'publishing a revision other than the one previewed is refused'
);
select is(
  public.publish_association_page((select id from fx where k = 'finance'),
    (select revision from public.association_profiles where organization_id = (select id from fx where k = 'finance') and stage = 'draft')),
  'published', 'the president publishes what was previewed'
);
set local role anon;
select is(
  public.public_association('exemple-finance') -> 'association' ->> 'accent', 'or',
  'the public page shows the published colour'
);
select ok(
  (public.public_association('exemple-finance') -> 'association' ->> 'description') like '<script>%',
  'the published description is the exact text typed (printed as text by the site)'
);
set local role authenticated;

-- Neither the guardian nor the BDE edits an association's page.
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('founded_year', 2001)) $$,
  'P0001', 'insufficient_permission', 'the guardian cannot edit an association''s page'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('founded_year', 2001)) $$,
  'P0001', 'insufficient_permission', 'BDE leadership cannot edit an association''s page'
);
select throws_ok(
  $$ select public.association_editor((select id from fx where k = 'finance')) $$,
  'P0001', 'insufficient_permission', 'BDE leadership cannot open an association''s editor'
);

-- BDE moderation: withhold, with a reason; the team cannot republish meanwhile.
select lives_ok(
  $$ select public.withhold_association_page((select id from fx where k = 'finance'), 'Contenu à vérifier (test)') $$,
  'BDE leadership withholds a page, with a reason'
);
set local role anon;
select is(public.public_association('exemple-finance') ->> 'state', 'unavailable', 'a withheld page is not public');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_association_page((select id from fx where k = 'finance'),
       (select revision from public.association_profiles where organization_id = (select id from fx where k = 'finance') and stage = 'draft')) $$,
  'P0001', 'page_withheld', 'a withheld page cannot be republished by its team'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.release_association_page((select id from fx where k = 'finance'), 'Le garant libère (test)') $$,
  'P0001', 'insufficient_permission', 'the guardian has no moderation power'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.release_association_page((select id from fx where k = 'finance'), 'Vérifié (test)') $$,
  'BDE leadership releases it'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.unpublish_association_page((select id from fx where k = 'finance'), 'Refonte (test)') $$,
  'the team takes its page offline'
);
set local role anon;
select is(public.public_association('exemple-finance') ->> 'state', 'unavailable', 'an unpublished page is not public');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select is(
  public.publish_association_page((select id from fx where k = 'finance'),
    (select revision from public.association_profiles where organization_id = (select id from fx where k = 'finance') and stage = 'draft')),
  'published', 'and puts it back online'
);

-- =============================================================================
-- 4. Addresses
-- =============================================================================

select is(public.change_organization_slug((select id from fx where k = 'finance'), 'exemple-finance-2'), 'exemple-finance-2',
  'the president changes the page address');
set local role anon;
select is(public.public_association('exemple-finance'), jsonb_build_object('state', 'moved', 'slug', 'exemple-finance-2'),
  'the old address redirects to the new one');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.change_organization_slug((select id from fx where k = 'sports'), 'exemple-finance') $$,
  'P0001', 'slug_taken', 'another association cannot take an old address'
);
select throws_ok(
  $$ select public.change_organization_slug((select id from fx where k = 'sports'), 'exemple-finance-2') $$,
  'P0001', 'slug_taken', 'another association cannot take a current address'
);
select throws_ok(
  $$ select public.change_organization_slug((select id from fx where k = 'sports'), 'plateforme') $$,
  'P0001', 'slug_invalid', 'reserved words are refused'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.create_organization('Usurpation (test)', 'exemple-finance') $$,
  'P0001', 'slug_taken', 'a new association cannot take an old address either'
);

-- =============================================================================
-- 5. Images (Storage policies + the media library)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('association-media', (select id from fx where k = 'finance')::text || '/' || (select id from fx where k = 'm1')::text || '.webp') $$,
  'media.manage uploads into its association''s folder'
);
select lives_ok(
  $$ select public.register_association_media((select id from fx where k = 'finance'), (select id from fx where k = 'm1'),
       'logo', 512, 512, 20480, 'Logo de test') $$,
  'and records the image'
);
select throws_ok(
  $$ select public.register_association_media((select id from fx where k = 'finance'), (select id from fx where k = 'm2'),
       'cover', 512, 512, 20480) $$,
  'P0001', 'media_not_found', 'an image that was not uploaded cannot be recorded'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('association-media', (select id from fx where k = 'finance')::text || '/notes.html') $$,
  '42501', null, 'only <uuid>.webp names are accepted'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('association-media', (select id from fx where k = 'finance')::text || '/' || (select id from fx where k = 'm2')::text || '.webp') $$,
  '42501', null, 'another association''s president cannot upload into this folder'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'association-media'), 0,
  'nor see its unpublished images'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('association-media', (select id from fx where k = 'finance')::text || '/' || (select id from fx where k = 'm2')::text || '.webp') $$,
  '42501', null, 'a student outside the team cannot upload'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000009", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('association-media', (select id from fx where k = 'finance')::text || '/' || (select id from fx where k = 'm2')::text || '.webp') $$,
  '42501', null, 'a suspended member cannot upload'
);
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'association-media'), 0,
  'a visitor cannot read an image no published page uses');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'),
       (select to_jsonb(p) from public.association_profiles p where p.organization_id = (select id from fx where k = 'finance') and p.stage = 'draft'),
       jsonb_build_object('logo_media_id', (select id from fx where k = 'm1'))) $$,
  'the president uses the image as the logo'
);
select is(
  public.publish_association_page((select id from fx where k = 'finance'),
    (select revision from public.association_profiles where organization_id = (select id from fx where k = 'finance') and stage = 'draft')),
  'published', 'and publishes'
);
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'association-media'), 1,
  'a visitor can read an image a public page uses');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.remove_association_media((select id from fx where k = 'm1')) $$,
  'P0001', 'media_in_use', 'an image in use cannot be removed from the library'
);

-- Portraits: only with the member's consent, on a public page.
reset role;
insert into storage.objects (bucket_id, name)
values ('avatars', 'a0000000-0000-4000-8000-000000000005/c0000000-0000-4000-8000-000000000001.webp');
update public.profiles set avatar_path = 'a0000000-0000-4000-8000-000000000005/c0000000-0000-4000-8000-000000000001.webp'
 where id = 'a0000000-0000-4000-8000-000000000005';
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0,
  'a member''s photo is private by default');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.set_my_public_team_profile((select id from fx where k = 'lucas_finance'), false, true, null) $$,
  'the member chooses to show their photo'
);
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1,
  'then visitors can see it on the public team');
set local role authenticated;
select lives_ok(
  $$ select public.set_my_public_team_profile((select id from fx where k = 'lucas_finance'), true, true, null) $$,
  'the member asks not to appear at all'
);
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0,
  'and the photo is private again');
select ok(
  not exists (select 1 from jsonb_array_elements(public.public_association('exemple-finance-2') -> 'association' -> 'team') as t
               where t ->> 'name' = 'Lucas Exemple'),
  'and they leave the public team'
);

-- =============================================================================
-- 6. Categories, audit, revocation
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.create_association_category('musique', 'Musique') $$,
  'P0001', 'insufficient_permission', 'an association president does not edit the category catalog'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.create_association_category('musique', 'Musique') $$, 'BDE leadership adds a category');
select throws_ok($$ select public.create_association_category('musique', 'Musique encore') $$,
  'P0001', 'category_taken', 'no duplicate category');

reset role;
select ok(
  exists (select 1 from public.governance_audit_events
           where action = 'association_page_published' and actor_user_id = 'a0000000-0000-4000-8000-000000000004'
             and organization_id = (select id from fx where k = 'finance')),
  'publications are in the history, with their real author'
);

-- The president loses the office: the same session can no longer edit.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.end_office_mandate(
       (select a.id from public.position_assignments a
         where a.organization_id = (select id from fx where k = 'finance') and a.office = 'association_president'
           and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at),
       'Fin de mandat (test)') $$,
  'BDE leadership ends the presidency'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_association_draft((select id from fx where k = 'finance'), '{}'::jsonb, jsonb_build_object('founded_year', 2001)) $$,
  'P0001', 'insufficient_permission', 'a removed mandate stops working in the same session'
);

select * from finish();
rollback;
