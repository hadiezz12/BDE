# Supabase workflow

## Tools

- **Supabase CLI 2.120.0**, installed as a dev dependency (`supabase` in `package.json`): run it
  with `npx supabase …`. Nothing is installed globally. CI pins the same version
  (`.github/workflows/ci.yml`); bump both together.
- **Docker** (Docker Desktop or a compatible runtime) for the local stack. Without it, every
  `--local` command below fails; see [Without Docker](#without-docker).
- Node 24 (the project's scripts use Node's built-in test runner and TypeScript stripping).

Run `npm install` once after cloning; the CLI binary for your platform comes with it.

## Source of truth

The database is defined by the SQL files in `supabase/migrations/`, applied in timestamp order.
Not the dashboard, not a declarative schema folder (see
[decisions.md](decisions.md#d1-migration-first-not-declarative-schemas)). To see the current
shape of the database, read the migrations, or the generated `src/types/database.types.ts`.

## Commands

| Task | Command | Needs |
| --- | --- | --- |
| Start the local stack | `npm run db:start` (`supabase start`) | Docker |
| Stop it | `npm run db:stop` (`supabase stop`) | Docker |
| Rebuild the local database from scratch (migrations + seed) | `npm run db:reset` (`supabase db reset`) | Docker |
| New migration file | `npm run db:migration -- <descriptive_name>` (`supabase migration new`) | — |
| Database tests (pgTAP) | `npm run db:test` (`supabase test db`) | Docker |
| Database lint (plpgsql_check) | `npm run db:lint` (`supabase db lint --fail-on error`) | Docker |
| Regenerate TypeScript types from the local database | `npm run db:types` | Docker |
| Regenerate types from the linked project | `npm run db:types:linked` | `login` + `link` |
| Check the app reaches the configured project | `npm run db:check` | `.env.local` |
| App checks | `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build` | — |
| Log the CLI in to your Supabase account | `npx supabase login` | browser |
| Link this folder to a hosted project | `npx supabase link --project-ref <ref>` | login, database password |
| Compare local and remote migration history | `npx supabase migration list --linked` | link |
| Preview what a push would apply | `npx supabase db push --dry-run` | link |
| Apply pending migrations to the linked project | `npx supabase db push` | link |
| Lint the linked project | `npx supabase db lint --linked --fail-on error` | link |

There is no `db:push` script on purpose: deploying a migration is a deliberate act, with
`--dry-run` first and a look at which project is linked.

## The daily workflow (with Docker)

1. `git pull`, then `npm run db:start` (first run downloads the images).
2. `npm run db:reset` to match the repository exactly.
3. `npm run db:migration -- add_events_table` and write the SQL by hand in the new file.
4. Review the SQL against [database-conventions.md](database-conventions.md).
5. `npm run db:reset`: the whole history must apply from zero.
6. Write or update the pgTAP tests in `supabase/tests/database/`, then `npm run db:test`.
7. `npm run db:lint`.
8. `npm run db:types` and update the loaders in `src/lib/data/` that read the new table.
9. `npm run typecheck`, `npm run lint`, `npm run test:unit`.
10. Commit the migration, the tests, the regenerated types and the code together.
11. Push. CI repeats the reset, tests, lint and the type check from scratch.
12. Apply to development/staging: `npx supabase link --project-ref dqdqqdkwqesfrikbbvlp`,
    `npx supabase db push --dry-run`, then `npx supabase db push`. Verify the app against it
    (`npm run db:check`, then the pages that use the change).
13. Production, later: the same push to the production project, from `main`, after review.

If someone merged a migration with a later timestamp while you were working, give yours a new
timestamp (`npm run db:migration -- same_name`, move the SQL over) and reset again.

## Without Docker

The main development PC cannot run Docker today. What still works there:

- Writing migrations and tests, `npm run db:migration`, all app checks, `npm run db:check`.
- Applying to the dev project with `npx supabase db push` once linked
  (`npx supabase login`, then `link`, which asks for the dev database password).
- Linting the dev project: `npx supabase db lint --linked --fail-on error`.
- Types from the dev project: `npm run db:types:linked`.
- **CI** runs `db start`, `db reset`, `test db`, `db lint` and the generated-types comparison on
  every push to `main` and every pull request. A red database job is the signal that a
  migration does not rebuild from scratch.

AI agents with the Supabase MCP connected may use it against **the dev project only**. Its
`apply_migration` records its own timestamp in the remote history, so: dry-run the SQL inside a
transaction that is rolled back, apply it, read the recorded version with `list_migrations`, and
name the local file `<that version>_<name>.sql` with exactly the SQL that was applied. Local file
names and the remote history must always match (`npx supabase migration list --linked`). The
MCP never touches production.

## Writing tests

pgTAP files live in `supabase/tests/database/` and end in `.test.sql`. Each file is one
transaction that is rolled back:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
-- assertions…
select * from finish();
rollback;
```

Test as the API roles do (`set local role authenticated;` plus
`set local request.jwt.claims = '{"sub": "<uuid>"}';`), check both what is allowed and what is
refused, and keep fixtures inside the file. `foundation.test.sql` holds the whole-schema guards
(RLS on every `public` table, pinned `search_path` on security definer functions,
`security_invoker` views); never weaken them to make a migration pass.

## Generated types

`src/types/database.types.ts` is generated, never edited by hand:

```
migration → db reset (or db push to dev) → npm run db:types (or db:types:linked) → typecheck
```

CI regenerates it from the local stack and fails if the schema it describes differs from the committed file. It compares the types, not the text: the local generator (`db:types`) and the hosted one (`db:types:linked`) format the same schema differently, and either output is fine to commit.

## Branching

Supabase branching (a database per pull request) needs a paid plan and is not used. Local
resets plus CI cover migration testing today. Revisit when the production project exists on
Pro: preview branches could then test migrations against a copy of the production schema.

## Database change checklist

Copy into the pull request description:

```
[ ] One concern, descriptive name, header comment explaining why
[ ] Applies from zero (db reset, or the CI database job is green)
[ ] Reversible or recoverable: destructive steps split, data migrated first
[ ] Constraints: not null, checks, uniqueness scoped correctly
[ ] Foreign keys present, on delete behaviour chosen and justified
[ ] RLS enabled on every new public table, policies for each allowed operation
[ ] Grants on new functions reviewed; internal helpers in `private`
[ ] Indexes for the foreign keys and the queries that need them
[ ] pgTAP tests added or updated (allowed and refused cases)
[ ] db lint passes; dev project security/performance advisors checked
[ ] Generated types regenerated and committed
[ ] App typecheck, lint, unit tests and build pass
[ ] No real personal data in seeds or tests
[ ] Docs updated if a convention changed
```
