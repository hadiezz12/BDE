-- Internal schema for database helpers that must never be reachable through
-- the Data API.
--
-- Only the schemas listed under [api].schemas in supabase/config.toml are
-- exposed over HTTP (public, graphql_public). `private` is not, and the API
-- roles get nothing on it. A later phase that needs a helper inside an RLS
-- policy grants usage and execute narrowly, in its own migration, together
-- with a test (see docs/backend/database-conventions.md).

create schema if not exists private;

comment on schema private is
  'Internal helpers (trigger functions, future policy helpers). Not exposed through the Data API; grant narrowly.';

revoke all on schema private from public, anon, authenticated, service_role;

-- Postgres grants EXECUTE on every new function to PUBLIC by default. Functions
-- created later in this schema start with no grants instead.
alter default privileges in schema private revoke execute on functions from public;
