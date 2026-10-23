# Environments

Three environments, three separate Supabase projects, never mixed. Data never moves from
production to the others.

```
LOCAL                          DEVELOPMENT / STAGING             PRODUCTION
Supabase CLI stack (Docker)    hosted project verypinkclub-dev   hosted project (not created yet)
fake seed data                 fake/test data only               real students, real associations
db reset at will               reviewed migrations, tests        reviewed migrations only
http://127.0.0.1:54321         https://dqdqqdkwqesfrikbbvlp…     https://<prod-ref>.supabase.co
```

## How to tell which one you are talking to

The project URL in `NEXT_PUBLIC_SUPABASE_URL` identifies it, and `npm run db:check` prints it:

| Environment | URL / project ref | Where it is defined |
| --- | --- | --- |
| Local | `http://127.0.0.1:54321` | `npx supabase start` / `npx supabase status` |
| Development / staging | ref `dqdqqdkwqesfrikbbvlp`, project name `verypinkclub-dev`, region eu-west-3 (Paris), org "hadiezz12's Org", free plan | Supabase dashboard |
| Production | does not exist yet | created at launch (see below) |

For the CLI, `npx supabase projects list` marks the linked project. Check it before any
`--linked` command.

### Local

The Supabase CLI runs Postgres, Auth, Storage and Studio in Docker. `npm run db:start` starts it
and prints the local URL and keys (publishable `sb_publishable_…` and secret `sb_secret_…`;
local-only values, safe to paste into `.env.local`). Seed data comes from `supabase/seed.sql`.

The main development PC currently has no Docker (no admin rights), so the local stack cannot
start there. On that machine the dev project plays the "local" role for experiments, and CI
runs the full local stack from scratch on every push (see
[supabase-workflow.md](supabase-workflow.md)).

### Development / staging: `verypinkclub-dev`

- Created on 2026-10-15 for Phase 2. Fake or test data only, never a real person's data.
- Receives reviewed migrations (and optionally the seed) before production.
- Free plan: no automatic backups, no branching, and the project pauses after about a week
  without activity (restore it from the dashboard; nothing is lost).
- Scheduled posts (Phase 6) need the `pg_cron` extension: the migration creates the job
  `publish-scheduled-posts` (every minute) where it exists. It is enabled here; check it on any
  new environment ([publishing.md](publishing.md#scheduling)).
- Its legacy `anon` / `service_role` keys are still active next to the new
  publishable/secret keys. Nothing uses them: disable them in Dashboard → Settings → API Keys.

### Auth settings per environment

Sign-in settings (site URL, redirect URLs, the before-user-created hook, the code e-mail
templates, MFA) live in `supabase/config.toml` for the local stack. Hosted projects need the
same settings applied with `npx supabase config push` (after `login` and `link`) or by hand in
the dashboard; who may sign up is data in `private.allowed_signup_domains` and
`private.signup_email_exceptions` (default: nobody). See
[authentication.md](authentication.md#configuration-per-environment).

**verypinkclub-dev today:** migrations applied (profiles, hook function, avatars bucket), but its
Auth settings are still the hosted defaults: the hook is not enabled and the templates send a link
instead of a code. `npx supabase config push` is refused on this free-plan project ("Email
template modification is not available for free tier projects using the default email
provider"): changing templates needs a custom SMTP. Until the BDE's e-mail service exists, set the
rest by hand: Authentication → Hooks → Before User Created → Postgres →
`private.before_user_created`, and Authentication → URL Configuration (site URL and the
`/auth/callback**` redirect URLs). Once a custom SMTP is configured here, the push works in full.
Meanwhile, four fictional test
accounts (`@comptes.example.test`) sign in with a password, no e-mail needed: see
[authentication.md](authentication.md#test-accounts-development-only).

### Production

- Not created yet. It is created when the platform ships, as its own project (never by
  promoting the dev project).
- It needs the final site URL for Auth redirects, emails and cookies. **The BDE buys the
  domain**: that step waits for the client.
- Recommended plan: Pro or higher, for daily backups (see below).
- Only reviewed migrations reach it (`supabase db push` from `main`, deliberately). No manual
  schema edits in its dashboard, no seed, no experiments, no `db reset --linked`, ever.
- **Governance bootstrap (Phase 4)**, once, after the migrations: the BDE names its real first
  president, vice-president and continuity guardian (three different people); each signs in once;
  then the project owner runs `private.bootstrap_governance(...)` in the SQL editor
  ([governance.md](governance.md#bootstrap-first-bde-leadership)). Never with test accounts, never
  invented people. Until then, nobody manages anything in production.
- `AUTH_TEST_ACCOUNTS` is never set in production.
- Enable the `pg_cron` extension before applying the Phase 6 migrations, or scheduled posts never
  go out (the job `publish-scheduled-posts` is created only where the extension exists).

## Variables

| Variable | Public or secret | Used by | Value comes from |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public (inlined into the browser bundle) | all three clients | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (inlined into the browser bundle) | browser and server clients | Dashboard → Settings → API Keys → publishable (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | **secret**, server only | `createSupabaseAdminClient()` — nothing calls it yet | API Keys → secret (`sb_secret_…`). Leave empty. |
| `AUTH_SSO_PROVIDER` | server only, not secret | shows institutional sign-in on `/login` (`azure` or `google`) | leave empty until the school's provider is configured in Supabase |
| `AUTH_TEST_ACCOUNTS` | server only, not secret | development only: `on` shows the "Comptes de test" form on `/login` | `on` in a development `.env.local`; **never set in production** |
| `SUPABASE_ACCESS_TOKEN` | **secret**, personal | the Supabase CLI (`login`, `link`, `gen types --linked`) | your account's access tokens; `npx supabase login` stores it for you |
| `SUPABASE_DB_PASSWORD` | **secret** | the CLI's `link` / `db push` in non-interactive use | the project's database password (Dashboard → Database) |

- Names only in `.env.example`. Real values in `.env.local`, which git ignores (`.env*`, with an
  exception for `.env.example`).
- `NEXT_PUBLIC_` values are frozen into the JavaScript at build time: build each deployment
  with its own environment's values.
- A secret never gets the `NEXT_PUBLIC_` prefix. The app refuses to start a client if the public
  key variable holds a secret or `service_role` key, and `npm run db:check` scans every
  `NEXT_PUBLIC_` variable for one.
- Hosting (Vercel or other, later) stores each environment's variables in its own settings;
  CI holds no Supabase secret today.

## What may be committed

| Commit | Never commit |
| --- | --- |
| `.env.example` (names only) | `.env`, `.env.local`, any file with a real key |
| `supabase/config.toml` (no secrets; secrets go through `env(...)`) | `supabase/.temp/`, `supabase/.branches/` (CLI state) |
| `supabase/migrations/*`, `supabase/seed.sql` (fake data), `supabase/tests/*` | secret keys, database passwords, access tokens |
| `src/types/database.types.ts` (generated) | database dumps or exports with real data |

If a secret is ever committed: rotate it in the dashboard first (removing it from git history
does not make it secret again), then remove it from the code.

## Backups

**What exists today.** The organization is on the free plan. Supabase takes automatic daily
backups only for Pro, Team and Enterprise projects, so `verypinkclub-dev` has **no automatic
backup**. That is acceptable: it holds only fake data that the migrations and the seed can
rebuild.

**Before launch (production):**

- Put the production project on Pro (daily backups, 7 days kept, restorable from
  Dashboard → Database → Backups). Consider Point-in-Time Recovery (paid add-on) once real
  recruitment data is stored, since daily backups can lose up to a day.
- Add an off-site logical dump on a schedule (`supabase db dump` for schema and data), stored
  encrypted outside Supabase, with a retention period that matches the GDPR rules of that time.
- Database backups do **not** contain Storage files (only their metadata). Private files (CVs,
  documents) need their own export or replication plan.
- Rehearse a restore on a throwaway project before launch, and again yearly. A backup that has
  never been restored is a hope, not a backup.
- Deleting a Supabase project deletes its backups too.

**Backup is not migration is not git:**

| | What it gives back | What it cannot do |
| --- | --- | --- |
| Migrations (`supabase/migrations`) | the schema, rebuilt from scratch, anywhere | bring back data |
| Backups / dumps | the data and the database state at a point in time | explain or review a change |
| Git | the history of code, migrations, tests and docs | hold the data |

You need all three.
