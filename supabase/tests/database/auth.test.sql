-- Phase 3 security properties: who may sign up, profile isolation, the MFA
-- requirement, the email-change guard and avatar storage. Fake identities
-- only (*.example.test).

begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

-- Fixtures -------------------------------------------------------------------
insert into private.allowed_signup_domains (domain, note)
values ('student.example.test', 'fictional school domain for tests')
on conflict (domain) do nothing;

insert into private.signup_email_exceptions (email, reason, is_active, expires_at) values
  ('contact@institution.example.test', 'test: active exception', true, null),
  ('expired@institution.example.test', 'test: expired exception', true, now() - interval '1 day'),
  ('paused@institution.example.test', 'test: inactive exception', false, null);

-- Who may sign up (the before-user-created hook) ------------------------------
select is(
  private.before_user_created('{"user": {"email": "alice@student.example.test"}}'),
  '{}'::jsonb,
  'a school-domain address may sign up'
);
select is(
  private.before_user_created('{"user": {"email": "  Marc@Student.Example.TEST "}}'),
  '{}'::jsonb,
  'case and surrounding spaces do not matter'
);
select is(
  private.before_user_created('{"user": {"email": "someone@gmail.com"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'a personal address is refused'
);
select is(
  private.before_user_created('{"user": {"email": "x@evil.student.example.test"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'a subdomain of an allowed domain is refused (exact match only)'
);
select is(
  private.before_user_created('{"user": {"email": "x@student.example.test.evil.test"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'a look-alike domain is refused'
);
select is(
  private.before_user_created('{"user": {"email": "a@b@student.example.test"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'an address with two @ is refused'
);
select is(
  private.before_user_created('{"user": {"phone": "+33600000000"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'a signup without an email is refused'
);
select is(
  private.before_user_created('{"user": {"email": "contact@institution.example.test"}}'),
  '{}'::jsonb,
  'an active exception may sign up'
);
select is(
  private.before_user_created('{"user": {"email": "expired@institution.example.test"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'an expired exception is refused'
);
select is(
  private.before_user_created('{"user": {"email": "paused@institution.example.test"}}') -> 'error' ->> 'message',
  'signup_email_not_eligible',
  'an inactive exception is refused'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'private.before_user_created(jsonb)', 'execute'),
  'Supabase Auth can run the hook'
);
select ok(
  not has_function_privilege('authenticated', 'private.before_user_created(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.before_user_created(jsonb)', 'execute'),
  'the API roles cannot call the hook'
);
select ok(
  not has_table_privilege('authenticated', 'private.allowed_signup_domains', 'select')
  and not has_table_privilege('authenticated', 'private.signup_email_exceptions', 'select'),
  'the eligibility configuration is not readable by students'
);

-- One profile per new auth user -------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'alice@student.example.test'),
  ('22222222-2222-4222-8222-222222222222', 'marc@student.example.test');

select results_eq(
  $$ select count(*)::int from public.profiles where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222') $$,
  array[2],
  'each new auth user gets a profile'
);
select results_eq(
  $$ select count(*)::int from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  array[1],
  'exactly one profile per user'
);
select hasnt_column('public', 'profiles', 'role', 'profiles has no role column');
select hasnt_column('public', 'profiles', 'is_admin', 'profiles has no admin flag');

-- Profile isolation, as Alice (no MFA) ----------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "aal": "aal1"}';

select results_eq(
  $$ select id::text from public.profiles $$,
  array['11111111-1111-4111-8111-111111111111'],
  'a student sees only their own profile'
);
select results_eq(
  $$ with u as (update public.profiles set first_name = 'Alice', last_name = 'Exemple'
               where id = '11111111-1111-4111-8111-111111111111' returning 1)
     select count(*)::int from u $$,
  array[1],
  'a student can edit their own profile'
);
select results_eq(
  $$ with u as (update public.profiles set first_name = 'Pirate'
               where id = '22222222-2222-4222-8222-222222222222' returning 1)
     select count(*)::int from u $$,
  array[0],
  'a student cannot edit another profile'
);
select throws_ok(
  $$ update public.profiles set created_at = now() where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'created_at is not editable'
);
select throws_ok(
  $$ update public.profiles set id = '22222222-2222-4222-8222-222222222222' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'the profile id is not editable'
);
select throws_ok(
  $$ insert into public.profiles (id) values ('33333333-3333-4333-8333-333333333333') $$,
  '42501', null,
  'students cannot create profiles'
);
select throws_ok(
  $$ delete from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null,
  'students cannot delete profiles'
);
select throws_ok(
  $$ update public.profiles set avatar_path = '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'a profile cannot point at another user''s avatar'
);
select lives_ok(
  $$ update public.profiles set onboarding_completed_at = now(), study_year = 2
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'a student with a full name can finish onboarding'
);
select throws_ok(
  $$ update public.profiles set first_name = '<b>' || repeat('x', 70) || '</b>'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null,
  'names have a length limit'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.profiles $$,
  '42501', null,
  'visitors cannot read profiles at all'
);
reset role;

-- MFA: once enrolled, an aal1 session reads and writes nothing --------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'test', 'totp', 'verified', now(), now());

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "aal": "aal1"}';
select results_eq(
  $$ select count(*)::int from public.profiles $$,
  array[0],
  'with MFA enrolled, a first-factor-only session sees nothing'
);
select results_eq(
  $$ with u as (update public.profiles set display_name = 'Pirate' where id = '11111111-1111-4111-8111-111111111111' returning 1)
     select count(*)::int from u $$,
  array[0],
  'with MFA enrolled, a first-factor-only session edits nothing'
);
set local request.jwt.claims to '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "aal": "aal2"}';
select results_eq(
  $$ select count(*)::int from public.profiles $$,
  array[1],
  'after the second factor (aal2) the profile is back'
);
reset role;

-- Email change guard ------------------------------------------------------------
select throws_ok(
  $$ update auth.users set email_change = 'marc.perso@gmail.com' where id = '22222222-2222-4222-8222-222222222222' $$,
  'P0001', 'email_change_not_eligible',
  'an account cannot move to a personal address'
);
select lives_ok(
  $$ update auth.users set email_change = 'marc.nouveau@student.example.test' where id = '22222222-2222-4222-8222-222222222222' $$,
  'an account can move to another school address'
);

-- Avatars, as Marc (no MFA) ---------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated", "aal": "aal1"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp') $$,
  'a student can upload into their own avatar folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp') $$,
  '42501', null,
  'a student cannot upload into another student''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '22222222-2222-4222-8222-222222222222/mon-cv.html') $$,
  '42501', null,
  'only <uuid>.<webp|png|jpg> names are accepted'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated", "aal": "aal2"}';
select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'avatars' $$,
  array[0],
  'a student cannot see another student''s avatar'
);
select results_eq(
  $$ with u as (update storage.objects set name = '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
               where bucket_id = 'avatars' returning 1)
     select count(*)::int from u $$,
  array[0],
  'a student cannot take over another student''s avatar'
);
reset role;

select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'the avatars bucket is private'
);

select * from finish();

rollback;
