-- Phase 6 · Publishing: the security matrix of the brief (§103), approvals
-- bound to exact revisions, scheduling (§105), moderation (§106) and the
-- cross-organization rules (§107), straight against the database. Runs on
-- top of supabase/seed.sql:
--   Julie presides Finance (editorial policy: approval required) and is a
--   plain member of Sports; Lucas holds Communication (posts.create, edit,
--   publish, media.manage) + Événements in Finance; Hugo's Finance mandate has
--   ended; Emma presides Sports (direct publishing); Nina belongs nowhere;
--   Alice and Marc lead the BDE; Garance is the continuity guardian.
--   Seeded posts: see the Phase 6 block of seed.sql.
-- Everything is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(146);

create temporary table fx (k text primary key, id uuid, v text) on commit drop;
grant select, insert, update on fx to anon, authenticated;

insert into fx (k, id) values
  ('finance', (select id from public.organizations where slug = 'exemple-finance')),
  ('sports', (select id from public.organizations where slug = 'exemple-sports')),
  ('bde', (select id from public.organizations where kind = 'bde')),
  ('communication', (select id from public.positions where title = 'Communication'
                      and organization_id = (select id from public.organizations where slug = 'exemple-finance'))),
  ('m_fin', 'c0000000-0000-4000-8000-000000000001'),
  ('m_fin_draft', 'c0000000-0000-4000-8000-000000000002'),
  ('m_sports', 'c0000000-0000-4000-8000-000000000003');

-- Seeded posts, by the title of any of their revisions.
insert into fx (k, id)
select x.k, (select r.post_id from public.post_revisions r where r.title = x.title limit 1)
  from (values ('f_pub', 'Rentrée de l''asso Finance (exemple)'),
               ('f_draft', 'Brouillon de Lucas (exemple)'),
               ('f_sub', 'Soirée networking (exemple)'),
               ('f_appr', 'Partenariats (exemple)'),
               ('f_sched', 'Atelier marchés (exemple)'),
               ('s_recap', 'Récap du tournoi (exemple)'),
               ('s_arch', 'Ancien article (exemple)'),
               ('s_hidden', 'Annonce masquée (exemple)'),
               ('b_imp', 'Infos de rentrée (exemple)')) as x (k, title);

insert into fx (k, id, v)
select 'lucas_comm', a.id, null
  from public.position_assignments a
 where a.position_id = (select id from fx where k = 'communication')
   and a.user_id = 'a0000000-0000-4000-8000-000000000005' and a.status = 'active';

-- Library images (no file needed: the rows are what the rules read).
insert into public.association_media (id, organization_id, object_path, kind, width, height, bytes, created_by)
values
  ('c0000000-0000-4000-8000-000000000001', (select id from fx where k = 'finance'),
   (select id from fx where k = 'finance')::text || '/c0000000-0000-4000-8000-000000000001.webp', 'image', 800, 600, 1000,
   'a0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000002', (select id from fx where k = 'finance'),
   (select id from fx where k = 'finance')::text || '/c0000000-0000-4000-8000-000000000002.webp', 'image', 800, 600, 1000,
   'a0000000-0000-4000-8000-000000000005'),
  ('c0000000-0000-4000-8000-000000000003', (select id from fx where k = 'sports'),
   (select id from fx where k = 'sports')::text || '/c0000000-0000-4000-8000-000000000003.webp', 'image', 800, 600, 1000,
   'a0000000-0000-4000-8000-000000000006');
insert into storage.objects (bucket_id, name)
select 'association-media', object_path from public.association_media
 where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
              'c0000000-0000-4000-8000-000000000003');

-- Slugs for the visitor checks (visitors cannot read the posts table).
create function pg_temp.slug_of(p_post uuid) returns text language sql stable security definer
  as $f$ select slug from public.posts where id = p_post $f$;
grant execute on function pg_temp.slug_of(uuid) to anon, authenticated;
create function pg_temp.prominence_of(p_post uuid) returns text language sql stable security definer
  as $f$ select prominence from public.posts where id = p_post $f$;
grant execute on function pg_temp.prominence_of(uuid) to authenticated;
create function pg_temp.scheduled_of(p_post uuid) returns timestamptz language sql stable security definer
  as $f$ select scheduled_at from public.posts where id = p_post $f$;
grant execute on function pg_temp.scheduled_of(uuid) to authenticated;

insert into fx (k, v) values ('f_pub_slug', (select slug from public.posts where id = (select id from fx where k = 'f_pub')));

-- =============================================================================
-- 1. Visitors read published posts only
-- =============================================================================

set local role anon;
select is(
  -- Byte order ("C"), the same on every machine whatever its locale.
  (select array_agg(e ->> 'title' order by e ->> 'title' collate "C") from jsonb_array_elements(public.public_posts()) as e),
  array['Infos de rentrée (exemple)', 'Rentrée de l''asso Finance (exemple)', 'Récap du tournoi (exemple)'],
  'the feed lists published, visible posts only (no draft, submission, schedule, archive or hidden post)'
);
select is(
  public.public_post((select v from fx where k = 'f_pub_slug')) -> 'post' ->> 'title',
  'Rentrée de l''asso Finance (exemple)',
  'a visitor reads the published revision, not the edit waiting for review'
);
select is(
  (public.public_post(pg_temp.slug_of((select id from fx where k = 's_arch'))) -> 'post' ->> 'archived'),
  'true', 'an archived post stays readable at its address, marked as archived'
);
select is(
  (public.public_post(pg_temp.slug_of((select id from fx where k = 's_hidden'))) ->> 'state'),
  'not_found', 'a post hidden by moderation is not found'
);
select ok(
  public.public_posts()::text !~ '(Brouillon de Lucas|Soirée networking|Partenariats|Atelier marchés|corrigé)',
  'drafts, submissions, approved and scheduled revisions never reach the feed'
);
select ok(
  public.public_post((select v from fx where k = 'f_pub_slug'))::text
    !~ '(comptes\.example\.test|created_by|user_id|contributors|reviewed_by|membership)',
  'a public article exposes no e-mail, account id or internal field'
);
select is(
  public.public_posts(p_q => 'tournoi') -> 0 ->> 'title', 'Récap du tournoi (exemple)',
  'search finds a published post by its words'
);
select is(jsonb_array_length(public.public_posts(p_q => 'networking')), 0, 'search never finds a submission');
select throws_ok($$ select * from public.posts $$, '42501', null, 'a visitor cannot read the posts table');
select throws_ok($$ select * from public.post_revisions $$, '42501', null, 'a visitor cannot read revisions');
select throws_ok($$ select * from public.post_reviews $$, '42501', null, 'a visitor cannot read review decisions');
select throws_ok($$ select public.create_post((select id from fx where k = 'finance'), 'article', 'x') $$,
  '42501', null, 'a visitor cannot create a post');
select throws_ok($$ select private.run_scheduled_publications() $$, '42501', null, 'a visitor cannot run the publishing worker');

-- =============================================================================
-- 2. Writing: organization scope, concurrency, safe content
-- =============================================================================

set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ insert into fx (k, id) values ('l_new', public.create_post((select id from fx where k = 'finance'), 'article', 'Article de test')) $$,
  'Finance communication creates a Finance draft'
);
select throws_ok($$ select public.create_post((select id from fx where k = 'sports'), 'article', 'Intrus') $$,
  'P0001', 'insufficient_permission', 'Finance communication cannot create a Sports draft');
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Article de test (v1)', 'intro', 'Une introduction de test.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "<script>alert(1)</script> reste du texte."}]}]}'::jsonb,
                          'cover_media_id', (select id from fx where k = 'm_fin'), 'tags', jsonb_build_array('test'))) $$,
  'the author saves the draft (markup typed as text stays text)'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Écrasement', 'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'P0001', 'draft_conflict', 'a save from a stale version is refused, never silently overwriting'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'Couverture d''une autre asso',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'cover_media_id', (select id from fx where k = 'm_sports'),
                          'tags', '[]'::jsonb)) $$,
  'P0001', 'media_not_found', 'another association''s image cannot be used'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'XSS',
                          'body', '{"type": "doc", "content": [{"type": "script", "text": "alert(1)"}]}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'P0001', 'post_invalid', 'an unknown node type (script) is refused'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'XSS',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "clic", "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}]}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) $$,
  'P0001', 'post_invalid', 'a javascript: link is refused'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'XSS',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "clic", "marks": [{"type": "link", "attrs": {"href": "//evil.example.test"}}]}]}]}'::jsonb,
                          'tags', '[]'::jsonb)) $$,
  'P0001', 'post_invalid', 'a protocol-relative link is refused'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'XSS',
                          'body', '{"type": "doc", "content": [{"type": "image", "attrs": {"src": "https://evil.example.test/x.svg"}}]}'::jsonb,
                          'tags', '[]'::jsonb)) $$,
  'P0001', 'post_invalid', 'an image must be a library reference, never an outside URL'
);
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'Titre', 'body', '{"type": "doc", "content": []}'::jsonb,
                          'tags', jsonb_build_array('<b>'))) $$,
  'P0001', 'post_invalid', 'tags are plain words only'
);
select throws_ok(
  $$ update public.posts set organization_id = (select id from fx where k = 'sports') where id = (select id from fx where k = 'l_new') $$,
  '42501', null, 'a post cannot be moved to another association by a direct update'
);
select throws_ok(
  $$ update public.posts set published_revision_id = working_revision_id, publication = 'published'
      where id = (select id from fx where k = 'l_new') $$,
  '42501', null, 'the published pointer cannot be set directly'
);
select throws_ok(
  $$ update public.post_revisions set status = 'approved' where post_id = (select id from fx where k = 'l_new') $$,
  '42501', null, 'a revision status cannot be set directly'
);
select throws_ok(
  $$ insert into public.posts (organization_id, created_by, working_revision_id)
     values ((select id from fx where k = 'finance'), 'a0000000-0000-4000-8000-000000000004', gen_random_uuid()) $$,
  '42501', null, 'nobody inserts posts directly (no forged author)'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')), 2,
       jsonb_build_object('kind', 'article', 'title', 'Prise de contrôle', 'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'P0001', 'insufficient_permission', 'the Sports president cannot edit a Finance draft'
);
select throws_ok($$ select public.post_editor((select id from fx where k = 'f_draft')) $$,
  'P0001', 'insufficient_permission', 'the Sports president cannot read a Finance draft');
select is((select count(*)::integer from public.post_revisions where post_id = (select id from fx where k = 'f_draft')), 0,
  'nor its revisions through the table');

-- =============================================================================
-- 3. Approval binds to the exact revision
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.submit_post_revision((select id from fx where k = 'l_new'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new'))) $$,
  'the author submits the draft for review'
);
insert into fx (k, id) values ('l_rev1', (select working_revision_id from public.posts where id = (select id from fx where k = 'l_new')));
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 'approve') $$,
  'P0001', 'insufficient_permission', 'creating content gives no approval right'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000008", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 'approve') $$,
  'P0001', 'insufficient_permission', 'a member whose mandate ended cannot approve'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 'approve') $$,
  'P0001', 'insufficient_permission', 'another association''s president cannot approve'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 'approve') $$,
  'P0001', 'mfa_required', 'approving needs the second factor'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.review_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 'approve') $$,
  'the president approves the submitted revision'
);
reset role;
select is(
  (select content_hash from public.post_reviews where revision_id = (select id from fx where k = 'l_rev1') and decision = 'approved'),
  (select private.post_content_hash(r) from public.post_revisions r where r.id = (select id from fx where k = 'l_rev1')),
  'the approval records the hash of exactly what was reviewed'
);
select throws_ok(
  $$ update public.post_revisions set title = 'Changé après approbation' where id = (select id from fx where k = 'l_rev1') $$,
  'P0001', 'revision_locked', 'an approved revision is frozen, even for the database owner'
);
set local role authenticated;

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1')) $$,
  'P0001', 'mfa_required', 'publishing needs the second factor'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.publish_post((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1')) $$,
  'a publisher publishes the approved revision'
);
select lives_ok(
  $$ insert into fx (k, v) values ('l_edit', public.save_post_revision((select id from fx where k = 'l_new'), (select id from fx where k = 'l_rev1'), 0,
       jsonb_build_object('kind', 'article', 'title', 'Article de test (modifié)', 'intro', 'Introduction modifiée.',
                          'body', '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Texte modifié."}]}]}'::jsonb,
                          'tags', '[]'::jsonb))::text) $$,
  'editing the published article opens a new draft revision'
);
select is((select (v::jsonb ->> 'new')::boolean from fx where k = 'l_edit'), true, 'the edit is a new revision');
select is(
  (public.public_post(pg_temp.slug_of((select id from fx where k = 'l_new'))) -> 'post' ->> 'title'),
  'Article de test (v1)', 'the public still reads the approved version while the edit is a draft'
);
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'l_new'), (select (v::jsonb ->> 'revision_id')::uuid from fx where k = 'l_edit')) $$,
  'P0001', 'approval_required', 'changed content cannot go live under the earlier approval'
);

-- Self-review, changes requested, and a policy change that must not authorize anything retroactively.
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) values ('j_post', public.create_post((select id from fx where k = 'finance'), 'annonce', 'Annonce de Julie')) $$,
  'the president writes an announcement'
);
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 'j_post'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'j_post')), 1,
       jsonb_build_object('kind', 'annonce', 'title', 'Annonce de Julie', 'intro', 'Une annonce de test.',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'and saves it'
);
select lives_ok(
  $$ select public.submit_post_revision((select id from fx where k = 'j_post'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'j_post'))) $$,
  'and submits it'
);
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'j_post'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'j_post')), 'approve') $$,
  'P0001', 'self_review', 'nobody approves their own writing'
);
select throws_ok(
  $$ select public.review_post_revision((select id from fx where k = 'f_sub'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_sub')), 'request_changes') $$,
  'P0001', 'reason_required', 'asking for changes needs a note'
);
select lives_ok(
  $$ select public.review_post_revision((select id from fx where k = 'f_sub'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_sub')), 'request_changes',
       'Précise la date, merci (test).') $$,
  'the president sends a submission back with a note'
);
select lives_ok(
  $$ select public.set_editorial_settings((select id from fx where k = 'finance'), 'direct', true) $$,
  'the president switches Finance to direct publishing'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'f_sub'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_sub'))) $$,
  'P0001', 'approval_required', 'a revision sent back for changes never goes live, even under direct publishing'
);
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'j_post'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'j_post'))) $$,
  'P0001', 'approval_required', 'a submission nobody reviewed is not authorized by the policy change'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ select public.set_editorial_settings((select id from fx where k = 'finance'), 'approval', true) $$,
  'back to approval required'
);

-- Restoring an old version goes through review again.
select lives_ok(
  $$ select public.restore_post_revision((select id from fx where k = 'f_pub'),
       (select r.id from public.post_revisions r where r.post_id = (select id from fx where k = 'f_pub') and r.number = 1)) $$,
  'restoring version 1 opens a new draft'
);
select is(
  (select r.restored_from from public.posts p join public.post_revisions r on r.id = p.working_revision_id
    where p.id = (select id from fx where k = 'f_pub')),
  (select r.id from public.post_revisions r where r.post_id = (select id from fx where k = 'f_pub') and r.number = 1),
  'the new draft records which version it came from (history is not rewritten)'
);
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'f_pub'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_pub'))) $$,
  'P0001', 'approval_required', 'restored content cannot go live without the required approval'
);

-- =============================================================================
-- 4. An author who may only write
-- =============================================================================

select lives_ok(
  $$ select public.update_position((select id from fx where k = 'communication'), 'Communication',
       array['members.view', 'posts.create', 'media.manage']) $$,
  'the president narrows Communication to writing'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'j_post'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'j_post')), 1,
       jsonb_build_object('kind', 'annonce', 'title', 'Réécrit', 'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'P0001', 'insufficient_permission', 'an author cannot edit someone else''s post without posts.edit'
);
select is((select count(*)::integer from public.posts where id = (select id from fx where k = 'j_post')), 0,
  'nor read it');
select is((select count(*)::integer from public.posts where id = (select id from fx where k = 'f_draft')), 1,
  'but still reads their own draft');
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 'f_draft'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_draft')),
       (select r.version from public.posts p join public.post_revisions r on r.id = p.working_revision_id
         where p.id = (select id from fx where k = 'f_draft')),
       jsonb_build_object('kind', 'annonce', 'title', 'Brouillon de Lucas (exemple)', 'intro', 'Brouillon fictif, retouché.',
                          'body', '{"type": "doc", "content": [{"type": "image", "attrs": {"mediaId": "c0000000-0000-4000-8000-000000000002", "alt": "Image de test"}}]}'::jsonb,
                          'tags', '[]'::jsonb)) $$,
  'and still edits it, with an inline image'
);
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'f_appr'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_appr'))) $$,
  'P0001', 'insufficient_permission', 'without posts.publish, even an approved revision cannot be published'
);

-- =============================================================================
-- 5. Draft images stay private
-- =============================================================================

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'association-media'
     and name = (select object_path from public.association_media where id = (select id from fx where k = 'm_fin_draft'))),
  1, 'the author sees the draft image'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal1"}';
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'association-media'
     and name like (select id from fx where k = 'finance')::text || '/c0000000-0000-4000-8000-000000000002%'),
  0, 'a student outside the association cannot read a draft image'
);
set local role anon;
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'association-media'
     and name like (select id from fx where k = 'finance')::text || '/c0000000-0000-4000-8000-000000000002%'),
  0, 'nor can a visitor'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'association-media'
     and name like (select id from fx where k = 'finance')::text || '/c0000000-0000-4000-8000-000000000001%'),
  1, 'the cover of a published article is public'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$ select public.remove_association_media((select id from fx where k = 'm_fin')) $$,
  'P0001', 'media_in_use', 'an image used by a post revision cannot be removed');

-- =============================================================================
-- 6. Direct publishing and scheduling (Sports)
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) values ('s_sch', public.create_post((select id from fx where k = 'sports'), 'article', 'Programmé (test)')) $$,
  'the Sports president writes an article'
);
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 's_sch'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_sch')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Programmé (test)', 'intro', 'Article programmé de test.',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'and saves it'
);
select throws_ok(
  $$ select public.schedule_post((select id from fx where k = 's_sch'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_sch')), now() - interval '1 hour') $$,
  'P0001', 'invalid_schedule', 'a time in the past is refused'
);
set local timezone to 'Europe/Paris';
select lives_ok(
  $$ select public.schedule_post((select id from fx where k = 's_sch'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_sch')),
       '2027-03-28T01:30:00Z'::timestamptz) $$,
  'scheduling across a daylight-saving change'
);
select is(
  (select scheduled_at from public.posts where id = (select id from fx where k = 's_sch')),
  '2027-03-28T01:30:00Z'::timestamptz, 'the exact instant is stored, whatever the session time zone'
);
reset timezone;
select is(
  (select r.status || '/' || r.review_mode from public.posts p join public.post_revisions r on r.id = p.scheduled_revision_id
    where p.id = (select id from fx where k = 's_sch')),
  'approved/direct', 'under direct publishing, scheduling approves the exact revision'
);
set local role anon;
select is(jsonb_array_length(public.public_posts(p_q => 'programmé')), 0, 'a scheduled post is not public before its time');
reset role;
-- The worker was down for three days: the schedule is overdue.
update public.posts set scheduled_at = now() - interval '3 days' where id = (select id from fx where k = 's_sch');
select is(private.run_scheduled_publications(), 1, 'the worker publishes the overdue post');
select is(private.run_scheduled_publications(), 0, 'a second run publishes nothing');
select is(
  (select count(*)::integer from public.governance_audit_events
    where action = 'post_published' and resource_id = (select id from fx where k = 's_sch')),
  1, 'one publication, one audit line (no duplicate)'
);
select is(
  (select authority from public.governance_audit_events
    where action = 'post_published' and resource_id = (select id from fx where k = 's_sch')),
  'scheduler', 'the audit says the scheduler published it'
);
set local role anon;
select is(
  (public.public_post(pg_temp.slug_of((select id from fx where k = 's_sch'))) ->> 'state'),
  'ok', 'the post is now public'
);
set local role authenticated;

-- A cancelled schedule never publishes.
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, id) values ('s_can', public.create_post((select id from fx where k = 'sports'), 'breve', 'Annulé (test)')) $$,
  'another article'
);
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 's_can'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_can')), 1,
       jsonb_build_object('kind', 'breve', 'title', 'Annulé (test)', 'intro', 'Brève programmée puis annulée.',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'saved'
);
select lives_ok(
  $$ select public.schedule_post((select id from fx where k = 's_can'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_can')), now() + interval '1 day') $$,
  'scheduled'
);
select lives_ok($$ select public.cancel_post_schedule((select id from fx where k = 's_can')) $$, 'then cancelled');
reset role;
select is(private.run_scheduled_publications(), 0, 'the worker has nothing to publish');
select is((select publication from public.posts where id = (select id from fx where k = 's_can')), 'unpublished',
  'the cancelled post never went public');
set local role authenticated;

-- A schedule that meets a moderation block, a lost image or a withdrawn approval fails, with a reason.
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select lives_ok(
  $$ insert into fx (k, v) values ('recap_edit', public.save_post_revision((select id from fx where k = 's_recap'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_recap')), 0,
       jsonb_build_object('kind', 'recap', 'title', 'Récap du tournoi (exemple, complété)', 'intro', 'Récap complété.',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'cover_media_id', (select id from fx where k = 'm_sports'),
                          'tags', '[]'::jsonb))::text) $$,
  'the Sports president edits the published recap (new revision, with an image)'
);
select lives_ok(
  $$ select public.schedule_post((select id from fx where k = 's_recap'),
       (select (v::jsonb ->> 'revision_id')::uuid from fx where k = 'recap_edit'), now() + interval '1 day') $$,
  'and schedules the edit'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.hide_post((select id from fx where k = 's_recap'), 'Masquage de test.') $$,
  'BDE moderation hides the recap');
reset role;
update public.posts set scheduled_at = now() - interval '1 minute' where id = (select id from fx where k = 's_recap');
select is(private.run_scheduled_publications(), 0, 'the worker refuses to publish a hidden post');
select is(
  (select schedule_status || '/' || schedule_error from public.posts where id = (select id from fx where k = 's_recap')),
  'failed/post_hidden', 'the failure is recorded with its reason'
);
set local role anon;
select is(
  (public.public_post(pg_temp.slug_of((select id from fx where k = 's_recap'))) ->> 'state'),
  'not_found', 'moderated content did not become visible through scheduling'
);
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 's_recap'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_recap'))) $$,
  'P0001', 'post_hidden', 'the association president cannot bypass moderation by publishing'
);
select throws_ok(
  $$ select public.schedule_post((select id from fx where k = 's_recap'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_recap')), now() + interval '1 day') $$,
  'P0001', 'post_hidden', 'nor by scheduling again'
);

-- An image that disappeared from storage.
select lives_ok(
  $$ insert into fx (k, id) values ('s_img', public.create_post((select id from fx where k = 'sports'), 'article', 'Avec image (test)')) $$,
  'an article with an image'
);
select lives_ok(
  $$ select public.save_post_revision((select id from fx where k = 's_img'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_img')), 1,
       jsonb_build_object('kind', 'article', 'title', 'Avec image (test)', 'intro', 'Article avec une image de test.',
                          'body', '{"type": "doc", "content": []}'::jsonb, 'cover_media_id', (select id from fx where k = 'm_sports'),
                          'tags', '[]'::jsonb)) $$,
  'saved'
);
select lives_ok(
  $$ select public.schedule_post((select id from fx where k = 's_img'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 's_img')), now() + interval '1 day') $$,
  'scheduled'
);
reset role;
update public.association_media set removed_at = now() where id = (select id from fx where k = 'm_sports');
update public.posts set scheduled_at = now() - interval '1 minute' where id = (select id from fx where k = 's_img');
select is(private.run_scheduled_publications(), 0, 'the worker does not publish with a missing image');
select is((select schedule_error from public.posts where id = (select id from fx where k = 's_img')), 'media_not_found',
  'and says why');
update public.association_media set removed_at = null where id = (select id from fx where k = 'm_sports');
set local role authenticated;

-- =============================================================================
-- 7. Reports and moderation
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000007", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ select public.report_post((select id from fx where k = 'f_pub'), 'privacy', 'Une adresse personnelle apparaît (test).') $$,
  'a student reports a published article'
);
select throws_ok(
  $$ select public.report_post((select id from fx where k = 'f_pub'), 'privacy', 'Encore (test).') $$,
  'P0001', 'already_reported', 'the same person cannot pile up reports on one article'
);
select throws_ok(
  $$ select public.report_post((select id from fx where k = 'f_draft'), 'spam', null) $$,
  'P0001', 'post_not_found', 'a draft cannot be reported (it does not exist publicly)'
);
reset role;
-- Four more reports in the last hour (already handled), to reach the limit.
insert into public.content_reports (post_id, reporter_id, reason, created_at, status, resolved_at)
select (select id from fx where k = 'b_imp'), 'a0000000-0000-4000-8000-000000000007', 'spam', now() - (n || ' minutes')::interval,
       'dismissed', now()
  from generate_series(1, 4) as n;
set local role authenticated;
select throws_ok(
  $$ select public.report_post((select id from fx where k = 's_sch'), 'spam', null) $$,
  'P0001', 'report_rate_limited', 'five reports an hour at most'
);

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select is((select count(*)::integer from public.content_reports), 0, 'the reported association does not see reports');
select ok(
  public.governance_history((select id from fx where k = 'finance'), 200)::text !~ 'content_reported',
  'nor finds them in its own history'
);
select throws_ok($$ select public.hide_post((select id from fx where k = 'f_pub'), 'Tentative (test).') $$,
  'P0001', 'insufficient_permission', 'an association president cannot hide content (moderation is the BDE''s)');

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$ select public.hide_post((select id from fx where k = 'f_pub'), 'Tentative (test).') $$,
  'P0001', 'insufficient_permission', 'the continuity guardian has no moderation power');
select throws_ok($$ select public.post_editor((select id from fx where k = 'f_draft')) $$,
  'P0001', 'insufficient_permission', 'and reads no association''s drafts');
select is((select count(*)::integer from public.post_revisions), 0, 'not even through the tables');

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$ select public.hide_post((select id from fx where k = 'f_pub'), 'Données personnelles (test).') $$,
  'P0001', 'mfa_required', 'hiding needs the second factor');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select ok(
  public.moderation_queue()::text ~ 'Une adresse personnelle apparaît'
  and public.moderation_queue()::text !~ '(a0000000-0000-4000-8000-000000000007|comptes\.example\.test|Brouillon de Lucas)',
  'the moderation queue shows the report, never the reporter nor a draft'
);
select throws_ok($$ select public.post_editor((select id from fx where k = 'f_draft')) $$,
  'P0001', 'insufficient_permission', 'BDE leadership does not read association drafts');
select lives_ok($$ select public.hide_post((select id from fx where k = 'f_pub'), 'Données personnelles (test).') $$,
  'the BDE hides the article');
reset role;
select is(
  (select status from public.content_reports where post_id = (select id from fx where k = 'f_pub')),
  'actioned', 'its report is closed as acted on'
);
set local role anon;
select is(public.public_post((select v from fx where k = 'f_pub_slug')) ->> 'state', 'not_found', 'the article left the site');
select ok(public.public_posts()::text !~ 'Rentrée de l''asso Finance', 'and the feed');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'f_pub'),
       (select published_revision_id from public.posts where id = (select id from fx where k = 'f_pub'))) $$,
  'P0001', 'post_hidden', 'the association cannot simply republish it'
);
select is(
  (select (public.content_dashboard((select id from fx where k = 'finance')) -> 'posts') @> jsonb_build_array(
     jsonb_build_object('id', (select id from fx where k = 'f_pub'), 'hidden', jsonb_build_object('reason', 'Données personnelles (test).')))),
  true, 'the association sees that its article was hidden, and why'
);
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.restore_post_visibility((select id from fx where k = 'f_pub'), 'Corrigé (test).') $$,
  'the BDE restores it');
set local role anon;
select is(public.public_post((select v from fx where k = 'f_pub_slug')) ->> 'state', 'ok', 'the article is back as it was published');
set local role authenticated;
select is(
  (select array_agg(action order by id) from public.governance_audit_events
    where category = 'moderation' and (resource_id = (select id from fx where k = 'f_pub')
                                       or details ->> 'post' = (select id from fx where k = 'f_pub')::text)),
  array['content_reported', 'post_hidden', 'post_restored'], 'moderation history records report, hide and restore'
);

-- Prominence: BDE only, and "important" for BDE posts only.
select throws_ok($$ select public.set_post_prominence((select id from fx where k = 'f_pub'), 'important') $$,
  'P0001', 'prominence_invalid', 'an association''s post cannot be dressed as a BDE notice');
select lives_ok($$ select public.set_post_prominence((select id from fx where k = 'f_pub'), 'featured') $$,
  'the BDE features an association''s article');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$ select public.set_post_prominence((select id from fx where k = 'f_pub'), 'normal') $$,
  'P0001', 'insufficient_permission', 'an association president cannot change site-wide prominence');

-- Slots: only posts on the site count, and leaving the site gives the slot back.
reset role;
update public.posts set prominence = 'featured', prominence_until = null, prominence_by = 'a0000000-0000-4000-8000-000000000001'
 where id in ((select id from fx where k = 's_arch'), (select id from fx where k = 's_hidden'), (select id from fx where k = 'f_sched'));
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.set_post_prominence((select id from fx where k = 'b_imp'), 'featured') $$,
  'archived, hidden or unpublished posts do not take a featured slot');
select throws_ok($$ select public.set_post_prominence((select id from fx where k = 'b_imp'), 'featured', now() + interval '90 days') $$,
  'P0001', 'prominence_period', 'a featured period ends within 60 days');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.archive_post((select id from fx where k = 'f_pub')) $$,
  'the association archives its featured article');
select is(pg_temp.prominence_of((select id from fx where k = 'f_pub')), 'normal', 'archiving gives the featured slot back');
select lives_ok($$ select public.archive_post((select id from fx where k = 'f_pub'), false) $$,
  'and takes it out of the archives (not featured any more)');

-- Taking a post off the site cancels what was scheduled for it; a hidden post cannot be pinned.
reset role;
update public.posts
   set scheduled_revision_id = published_revision_id, scheduled_at = now() + interval '1 day',
       scheduled_by = 'a0000000-0000-4000-8000-000000000001', schedule_status = 'pending'
 where id = (select id from fx where k = 'b_imp');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.archive_post((select id from fx where k = 'b_imp')) $$,
  'the BDE archives its announcement while an update of it is scheduled');
select is(pg_temp.scheduled_of((select id from fx where k = 'b_imp')), null::timestamptz,
  'archiving cancels the schedule: the worker will not bring the post back');
select lives_ok($$ select public.archive_post((select id from fx where k = 'b_imp'), false) $$,
  'the announcement comes out of the archives');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000006", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$ select public.set_post_pin((select id from fx where k = 's_hidden'), true) $$,
  'P0001', 'post_hidden', 'a post hidden by moderation cannot be pinned');
select lives_ok($$ select public.set_post_pin((select id from fx where k = 's_hidden'), false) $$,
  'unpinning stays possible');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';

-- =============================================================================
-- 8. Revocation, deletion, addresses, settings
-- =============================================================================

select lives_ok($$ select public.change_post_slug((select id from fx where k = 'f_pub'), 'rentree-finance-test') $$,
  'a publisher gives the article a new address');
set local role anon;
select is(public.public_post((select v from fx where k = 'f_pub_slug')) ->> 'state', 'moved', 'the former address redirects');
set local role authenticated;
select lives_ok($$ select public.delete_post_draft((select id from fx where k = 'j_post')) $$,
  'a never-published post can be deleted');
select throws_ok($$ select public.delete_post_draft((select id from fx where k = 'f_pub')) $$,
  'P0001', 'post_was_published', 'a published post is archived or unpublished, never deleted');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$ select public.set_editorial_settings((select id from fx where k = 'finance'), 'direct', false) $$,
  'P0001', 'insufficient_permission', 'only posts.settings changes the policy');

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.end_assignment((select id from fx where k = 'lucas_comm'), 'Fin de mandat (test).') $$,
  'the president ends the author''s Communication mandate');
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.save_post_revision((select id from fx where k = 'f_draft'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_draft')), 99,
       jsonb_build_object('kind', 'annonce', 'title', 'Après la fin du mandat', 'body', '{"type": "doc", "content": []}'::jsonb, 'tags', '[]'::jsonb)) $$,
  'P0001', 'insufficient_permission', 'the same session loses the right at once'
);

-- =============================================================================
-- 9. A suspended association publishes nothing
-- =============================================================================

set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$ select public.set_organization_status((select id from fx where k = 'finance'), 'suspended', 'Suspension de test.') $$,
  'the BDE suspends Finance');
reset role;
update public.posts set scheduled_at = now() - interval '1 minute' where id = (select id from fx where k = 'f_sched');
select is(private.run_scheduled_publications(), 0, 'the worker does not publish for a suspended association');
select is((select schedule_error from public.posts where id = (select id from fx where k = 'f_sched')), 'organization_inactive',
  'and records why');
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select public.publish_post((select id from fx where k = 'f_appr'),
       (select working_revision_id from public.posts where id = (select id from fx where k = 'f_appr'))) $$,
  'P0001', 'insufficient_permission', 'and its president cannot publish while it is suspended'
);
set local role anon;
select ok(public.public_posts()::text !~ '"exemple-finance"', 'its posts are off the site');

select * from finish();
rollback;
