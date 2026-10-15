-- Student profiles: what the platform shows about an authenticated person.
--
-- Identity (email, sign-in methods, MFA factors) stays in auth.users, which
-- Supabase Auth owns; the email is not copied here. A profile carries no role,
-- no admin flag and no association: authorization arrives in Phase 4 as
-- scoped positions and permissions, never as a column on this table.
--
-- Private by default: a person reads and edits only their own row. A public
-- projection (display name, avatar on a team page) will be a separate view in
-- a later phase, exposing chosen columns only.

create table public.profiles (
  -- Deleting an auth user removes the profile: it has no meaning without the
  -- identity. Account deletion itself is a later, audited privacy process.
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text
    constraint profiles_first_name_check
    check (first_name ~ '^[^[:cntrl:]]{1,60}$' and btrim(first_name) = first_name and first_name <> ''),
  last_name text
    constraint profiles_last_name_check
    check (last_name ~ '^[^[:cntrl:]]{1,60}$' and btrim(last_name) = last_name and last_name <> ''),
  -- Optional name shown on the site instead of the first name.
  display_name text
    constraint profiles_display_name_check
    check (display_name ~ '^[^[:cntrl:]]{1,60}$' and btrim(display_name) = display_name and display_name <> ''),
  -- Object path in the private "avatars" bucket; always inside the owner's folder.
  avatar_path text
    constraint profiles_avatar_path_check
    check (avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$')),
  -- Free text until the school's programmes are a reference list.
  program text
    constraint profiles_program_check
    check (program ~ '^[^[:cntrl:]]{1,80}$' and btrim(program) = program and program <> ''),
  study_year smallint
    constraint profiles_study_year_check
    check (study_year between 1 and 8),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_onboarding_requires_name_check
    check (onboarding_completed_at is null or (first_name is not null and last_name is not null))
);

comment on table public.profiles is
  'One row per auth user (created by trigger). Private: owner-only RLS. No role or permission data, ever.';

create trigger set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- True unless the user has a verified MFA factor and this session has not
-- passed it (aal1). Used by restrictive policies so a half-finished sign-in
-- reads nothing. Security definer because the API roles cannot read
-- auth.mfa_factors.
create or replace function private.mfa_requirement_met()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors f
         where f.user_id = (select auth.uid())
           and f.status = 'verified'
      );
$$;

comment on function private.mfa_requirement_met() is
  'Restrictive-policy helper: false when the user enrolled MFA but the session is only aal1.';

-- First grant of the private schema to an API role (decisions.md, D2):
-- usage, plus execute on this single helper. Every other private function
-- stays closed (the foundation test checks the allowlist).
grant usage on schema private to authenticated;
revoke all on function private.mfa_requirement_met() from public, anon, service_role;
grant execute on function private.mfa_requirement_met() to authenticated;

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_require_mfa_when_enrolled
  on public.profiles
  as restrictive
  for all
  to authenticated
  using ((select private.mfa_requirement_met()))
  with check ((select private.mfa_requirement_met()));

-- Supabase grants everything on new public tables to the API roles; narrow it.
-- No insert (the trigger creates the row), no delete (a later privacy phase),
-- and updates only on the columns a person may edit.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, display_name, avatar_path, program, study_year, onboarding_completed_at)
  on public.profiles to authenticated;

-- Exactly one profile per new auth user. Deliberately tiny: no metadata
-- parsing, nothing that can fail on user input and block a signup. The
-- onboarding form pre-fills names from the identity provider instead.
create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated, service_role;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

-- Users created before this migration (none expected) get their row too.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
