-- Development seed data.
--
-- Runs after every migration on `supabase db reset` (and on the first
-- `supabase start`), locally and in CI. It may also be loaded into the hosted
-- dev/staging project. It is NEVER loaded into production: do not run
-- `supabase db push --include-seed` against it.
--
-- Rules (docs/backend/database-conventions.md, "Seed data"):
--   * fake people and content only: never a real student, applicant, CV,
--     application answer, personal email or reviewer note;
--   * placeholder domains only: gem.exemple.fr and asso.gem.exemple.fr;
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
