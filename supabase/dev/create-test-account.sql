-- Creates ONE fictional test account: development / staging projects and the
-- local stack only, NEVER production. See docs/backend/authentication.md
-- (Test accounts) and src/lib/auth/test-accounts.ts.
--
-- The address must be <name>@comptes.example.test (reserved for fiction);
-- any other address inserts nothing. The password is passed in, never
-- written in this file or in git. The account signs in through the dashed
-- "Comptes de test" form, which only exists when AUTH_TEST_ACCOUNTS=on.
--
-- psql variables: email, password, first_name, last_name, display_name
-- (empty = none) and onboarded (true = skip the first-visit form). Example:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -v email=membre@comptes.example.test -v password="$PASSWORD" \
--     -v first_name=Test -v last_name=Membre -v "display_name=Compte test · Membre" \
--     -v onboarded=true -f supabase/dev/create-test-account.sql
--
-- Rows are written the way Supabase Auth writes an e-mail account: the token
-- columns without a default must be '' (Auth cannot read NULL there), the
-- e-mail is confirmed, and the e-mail identity carries the user id. The
-- create_profile_after_signup trigger adds the profile row.

with new_user as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    lower(:'email'), extensions.crypt(:'password', extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  where lower(:'email') ~ '^[a-z0-9][a-z0-9.-]{0,62}@comptes\.example\.test$'
    and length(:'password') >= 12
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  id::text, id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now()
from new_user;

update public.profiles as p
   set first_name = nullif(:'first_name', ''),
       last_name = nullif(:'last_name', ''),
       display_name = nullif(:'display_name', ''),
       onboarding_completed_at = case when :'onboarded' = 'true' then now() end
  from auth.users as u
 where u.id = p.id
   and u.email = lower(:'email')
   and u.email ~ '@comptes\.example\.test$';

-- One row means the account exists; none means the address was refused.
select u.email, p.display_name, p.onboarding_completed_at is not null as onboarded
  from auth.users as u
  join public.profiles as p on p.id = u.id
 where u.email = lower(:'email')
   and u.email ~ '@comptes\.example\.test$';
