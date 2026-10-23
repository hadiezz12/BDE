# Backend documentation

The Very Pink Club platform runs on Supabase (Postgres, Auth, Storage, Edge Functions). Phase 2
set up the foundation (tooling, conventions, client plumbing, tests). Phase 3 added real
authentication: school-email sign-in, private student profiles and two-factor authentication.
Phase 4 added authorization and governance: organizations, memberships, positions and scoped
permissions, time-bound mandates, delegations, invitations, leadership transitions, the continuity
guardian, and an append-only audit log. Phase 5 added association pages: the database-driven
directory, public profiles prepared as drafts and published, the image library, each member's
consent on the public team, and BDE moderation. Phase 6 added publishing: posts with numbered
revisions, approval bound to the exact revision or direct publishing per association, scheduled
publication by a pg_cron worker, the public campus feed and article pages, reports and BDE
moderation. Events and recruitment still read the Phase 1 mock layer in `src/lib/data` until their
own phases.

Read in this order:

| Document | What it answers |
| --- | --- |
| [architecture.md](architecture.md) | How the app talks to Supabase, where each future piece (auth, RLS, storage, jobs) goes |
| [authentication.md](authentication.md) | Sign-in, who may sign up, profiles, sessions, MFA, routes, tests — **authentication ≠ authorization** |
| [authorization.md](authorization.md) | How a right is evaluated, default deny, aal2, how the app and later modules use it |
| [permissions.md](permissions.md) | The permission catalog, positions, templates, ceilings |
| [governance.md](governance.md) | Organizations, memberships, mandates, delegations, invitations, guardian, bootstrap, recovery, audit |
| [leadership-transitions.md](leadership-transitions.md) | Successions, appointments, BDE dual approval, recovery |
| [rls-policies.md](rls-policies.md) | Every policy and grant, the private helpers, the RPC surface |
| [association-pages.md](association-pages.md) | Pages, drafts and publishing, preview, public team and consent, images, moderation, directory and SEO |
| [publishing.md](publishing.md) | Posts and revisions, the three state concerns, editorial policy and approval, body format and XSS layers, images, scheduling (the pg_cron worker), addresses, the public read model, reports and moderation |
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
6. Signing in grants nothing. Management rights come from scoped permissions on positions with a
   mandate end ([authorization.md](authorization.md)), never from being authenticated, a role column
   or user metadata. Governance tables are written only through the governance functions.
