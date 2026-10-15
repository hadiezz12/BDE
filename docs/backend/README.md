# Backend documentation

The Very Pink Club platform runs on Supabase (Postgres, Auth, Storage, Edge Functions). Phase 2
set up the foundation (tooling, conventions, client plumbing, tests). Phase 3 added real
authentication: school-email sign-in, private student profiles and two-factor authentication.
There are no business tables yet; the other Phase 1 pages still read the mock layer in `src/lib/data`.

Read in this order:

| Document | What it answers |
| --- | --- |
| [architecture.md](architecture.md) | How the app talks to Supabase, where each future piece (auth, RLS, storage, jobs) goes |
| [authentication.md](authentication.md) | Sign-in, who may sign up, profiles, sessions, MFA, routes, tests — **authentication ≠ authorization** |
| [environments.md](environments.md) | Local, development/staging and production; which variables exist, which are secret; backups |
| [supabase-workflow.md](supabase-workflow.md) | Commands, the daily workflow, how a migration is made and shipped, the change checklist |
| [database-conventions.md](database-conventions.md) | Naming, keys, timestamps, constraints, statuses, deletion, RLS — **mandatory before writing SQL** |
| [security-foundations.md](security-foundations.md) | Trust levels, keys, privileged access, storage privacy, logging, the rules for AI agents |
| [decisions.md](decisions.md) | Why the foundation looks the way it does (decision, reason, alternatives, consequence) |

The short version for anyone (or any agent) about to touch the database:

1. Every change is a migration in `supabase/migrations/`, never a manual edit in the dashboard.
2. Every table in `public` gets row level security in the same migration that creates it.
3. The browser and the server both use the **publishable** key; the **secret** key never leaves
   server-only code and is not used by anything yet.
4. Run the checklist in [supabase-workflow.md](supabase-workflow.md#database-change-checklist)
   before committing a migration.
5. Production does not exist yet. Nothing experimental ever goes there.
6. Signing in grants nothing. Management rights come from Phase 4's scoped permissions, never
   from being authenticated, a role column or user metadata.
