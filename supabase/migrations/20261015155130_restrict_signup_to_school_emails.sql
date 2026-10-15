-- Who may create an account: school email domains, plus exact-address
-- exceptions. Enforced by Supabase Auth through the before-user-created hook
-- (supabase/config.toml [auth.hook.before_user_created]), so a rejected
-- address never becomes a user, whatever the browser sends.
--
-- This decides eligibility only. It grants nothing: what an account may do
-- is Phase 4's authorization model (docs/backend/authentication.md).
--
-- Default deny: with no domain and no exception configured, nobody can sign
-- up. Each environment adds its own rows (local: supabase/seed.sql; hosted
-- projects: docs/backend/authentication.md, "Configuring who may sign up").

create table private.allowed_signup_domains (
  domain text primary key
    constraint allowed_signup_domains_domain_check
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  note text not null
    constraint allowed_signup_domains_note_check
    check (char_length(note) between 3 and 200),
  created_at timestamptz not null default now()
);

comment on table private.allowed_signup_domains is
  'Email domains whose owners may create an account (exact match on the part after @). Infrastructure configuration, not user data.';

create table private.signup_email_exceptions (
  email text primary key
    constraint signup_email_exceptions_email_check
    check (email ~ '^[^@[:space:][:upper:]]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  reason text not null
    constraint signup_email_exceptions_reason_check
    check (char_length(reason) between 3 and 300),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.signup_email_exceptions is
  'Exact addresses outside the school domains that may create an account (e.g. an institutional contact). Grants no role.';

create trigger set_updated_at
  before update on private.signup_email_exceptions
  for each row execute function private.set_updated_at();

-- Not reachable through the Data API (private schema, no grants), and RLS
-- with no policy as a second lock.
alter table private.allowed_signup_domains enable row level security;
alter table private.signup_email_exceptions enable row level security;

create or replace function private.is_email_eligible(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select lower(btrim(candidate)) as email
  )
  select coalesce(
    (
      select n.email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
         and (
           exists (
             select 1
               from private.signup_email_exceptions e
              where e.email = n.email
                and e.is_active
                and (e.expires_at is null or e.expires_at > now())
           )
           or exists (
             select 1
               from private.allowed_signup_domains d
              where d.domain = split_part(n.email, '@', 2)
           )
         )
        from normalized n
    ),
    false
  );
$$;

comment on function private.is_email_eligible(text) is
  'True when the address may hold an account: active, unexpired exception, or a domain in private.allowed_signup_domains.';

-- Called by Supabase Auth before inserting a new user. The message is a code
-- the app translates; the person sees "Utilise ton adresse e-mail de l''école".
create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if private.is_email_eligible(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'signup_email_not_eligible')
  );
end;
$$;

comment on function private.before_user_created(jsonb) is
  'Supabase Auth before-user-created hook: rejects addresses that are not eligible.';

-- An account must stay attached to an eligible address: changing it to a
-- personal mailbox through the Auth API is refused (the app offers no email
-- change in Phase 3).
create or replace function private.guard_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.email is distinct from old.email and new.email is not null
        and not private.is_email_eligible(new.email))
     or (new.email_change is distinct from old.email_change and coalesce(new.email_change, '') <> ''
        and not private.is_email_eligible(new.email_change)) then
    raise exception 'email_change_not_eligible' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_email_change
  before update of email, email_change on auth.users
  for each row execute function private.guard_auth_email_change();

-- Supabase Auth runs hooks as supabase_auth_admin; nobody else may call them.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
revoke all on function private.before_user_created(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.is_email_eligible(text) from public, anon, authenticated, service_role;
revoke all on function private.guard_auth_email_change() from public, anon, authenticated, service_role;
