-- Foundation guards: conventions every later migration has to keep.
--
-- The last three assertions scan the whole schema, so they keep protecting
-- tables, functions and views added by later phases. If one of them fails
-- after your migration, fix the migration, not the test.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- The private schema exists, visitors cannot reach it, and signed-in users
-- can call only the helpers RLS policies need. Granting another one is a
-- deliberate decision: add it to this list in the same migration.
select has_schema('private', 'the private schema exists');
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon has no usage on the private schema'
);
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in ('mfa_requirement_met') $$,
  'authenticated can execute only the allowlisted private helpers'
);

-- The shared updated_at trigger function.
select has_function(
  'private', 'set_updated_at', array[]::name[],
  'private.set_updated_at() exists'
);
select function_returns(
  'private', 'set_updated_at', array[]::name[], 'trigger',
  'private.set_updated_at() is a trigger function'
);
select ok(
  not has_function_privilege('anon', 'private.set_updated_at()', 'execute'),
  'anon cannot call private.set_updated_at() directly'
);
select ok(
  not has_function_privilege('authenticated', 'private.set_updated_at()', 'execute'),
  'authenticated cannot call private.set_updated_at() directly'
);

-- Its behaviour, on a throwaway table outside public (rolled back at the end).
create schema tap_fixture;
create table tap_fixture.items (
  id int primary key,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at
  before update on tap_fixture.items
  for each row execute function private.set_updated_at();

insert into tap_fixture.items (id, label, created_at, updated_at) values
  (1, 'one', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z'),
  (2, 'two', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');

update tap_fixture.items set label = 'one, edited' where id = 1;

select is(
  (select updated_at from tap_fixture.items where id = 1),
  now(),
  'an update stamps updated_at with the transaction time'
);
select is(
  (select created_at from tap_fixture.items where id = 1),
  '2000-01-01T00:00:00Z'::timestamptz,
  'an update leaves created_at alone'
);

-- An API role can update the table (the trigger needs no grant), and a value
-- it sends for updated_at is replaced.
grant usage on schema tap_fixture to authenticated;
grant select, update on tap_fixture.items to authenticated;

set local role authenticated;
update tap_fixture.items
   set label = 'two, edited', updated_at = '1999-01-01T00:00:00Z'
 where id = 2;
reset role;

select is(
  (select updated_at from tap_fixture.items where id = 2),
  now(),
  'an update by an API role is stamped with now(), whatever updated_at it sends'
);

-- Whole-schema guards.
select is_empty(
  $$ select format('%I.%I', n.nspname, c.relname)
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity $$,
  'every table in the exposed public schema has row level security enabled'
);
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosecdef
        and not exists (
          select 1
            from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
           where cfg like 'search_path=%'
        ) $$,
  'every security definer function in public or private pins its search_path'
);
select is_empty(
  $$ select format('%I.%I', n.nspname, c.relname)
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'v'
        and not exists (
          select 1
            from unnest(coalesce(c.reloptions, array[]::text[])) as opt
           where opt in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')
        ) $$,
  'every view in the exposed public schema runs with security_invoker'
);

select * from finish();

rollback;
