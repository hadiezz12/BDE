-- One shared trigger function that keeps updated_at current.
--
-- Convention (docs/backend/database-conventions.md): a table that tracks
-- changes declares
--
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
--
-- and attaches this function instead of defining its own copy:
--
--   create trigger set_updated_at
--     before update on public.<table>
--     for each row execute function private.set_updated_at();
--
-- now() is the start time of the transaction, so every row changed in one
-- transaction gets the same stamp, and a value sent by a client is ignored.
-- Firing a trigger needs no EXECUTE grant, so the API roles can update rows
-- without being able to call this function themselves.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE UPDATE row trigger: sets updated_at to now(). Attach it; do not copy it.';

revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;
