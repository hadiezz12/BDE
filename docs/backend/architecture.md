# Architecture

## The picture

```
                 BROWSER (untrusted)
                 Client Components
                        │  createSupabaseBrowserClient()      publishable key
                        │                                     + the user's session (Phase 3)
                        ▼
   NEXT.JS SERVER  ───────────────────────────────────────────────────────────────
   Server Components, Server Actions, Route Handlers
        │
        ├── src/lib/data/*  (the only place pages get data from)
        │       └── createSupabaseServerClient()           publishable key
        │                                                  + the request's cookies
        │
        └── (no privileged client: removed in Phase 11; trusted jobs run as
             Edge Functions, see security-foundations.md)
                        │
                        ▼
   SUPABASE (hosted project, or the local stack)
     API gateway ── checks the key in the `apikey` header
       ├── Data API (PostgREST): exposes the `public` and `graphql_public` schemas only
       ├── Auth (Phase 3)
       ├── Storage (buckets: later phases)
       └── Edge Functions (later phases)
                        │
                        ▼
     POSTGRES ── row level security is the security boundary
       public    tables reachable through the Data API (RLS required on every table)
       private   internal helpers, never exposed (today: private.set_updated_at())
       auth, storage, …  managed by Supabase; we do not edit them
```

## Frontend ↔ Supabase

- Pages and components never create Supabase clients and never call `supabase.from(...)`
  themselves. They call async functions in `src/lib/data/*`, which return the domain types of
  `src/lib/types.ts` (`EventItem`, `Association`, …). This was true in Phase 1 with mock data and
  stays true with the database: a loader swaps its body, its signature does not move.
- The three clients live in `src/lib/supabase/` and nowhere else. ESLint refuses
  `createClient`, `createBrowserClient` and `createServerClient` imports outside that folder,
  and refuses any import of `admin.ts` without an explained exception.
- Data flows one way through a mapping step:

  ```
  database row (src/types/database.types.ts, generated)
     → loader in src/lib/data/<domain>.ts selects explicit columns and maps the row
     → domain type (src/lib/types.ts, written for the UI)
     → component
  ```

  Components never import the generated database types. A column rename then touches one
  loader, not forty components.
- Errors cross the same boundary: a loader turns a Supabase error into a `DataError`
  (`src/lib/data/errors.ts`) with a kind and a French sentence; the Postgres details stay in the
  server log.

## Environments

Local (Docker), development/staging (hosted `verypinkclub-dev`) and production (not created yet)
are separate Supabase projects with separate keys. The app only knows which one it talks to through
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
See [environments.md](environments.md).

## Client and server boundary

| Code | Runs in | Client | Key | Who it acts as |
| --- | --- | --- | --- | --- |
| Client Component | browser | `createSupabaseBrowserClient()` | publishable | `anon`, or the signed-in user |
| Server Component, Server Action, Route Handler | Node | `createSupabaseServerClient()` | publishable | the person whose cookies came with the request |
| Trusted job | Edge Function | its database connection (`SUPABASE_DB_URL`), private functions only | platform-provided | the database owner, through narrow functions |

Both everyday clients carry the same rights. The server is not a way around row level security.
`server.ts` and `public.ts` import `server-only`, so importing them from browser code fails the
build.

## Authentication (Phase 3, implemented)

Details: [authentication.md](authentication.md).

- Supabase Auth provides identity; `auth.users` stays managed by Supabase. Sign-in is the school
  e-mail plus a 6-digit code; institutional sign-in (Microsoft / Google) is wired but off until
  the school's provider exists.
- Who may sign up is decided inside Supabase Auth by the before-user-created hook
  (`private.before_user_created`), against `private.allowed_signup_domains` and
  `private.signup_email_exceptions`. Default deny.
- `public.profiles` (one row per user, created by a trigger) holds the name, studies and avatar
  path. **No role column**, no e-mail copy. Private to its owner.
- `src/proxy.ts` refreshes the session cookie on every page request; server code identifies the
  user with `getClaims()` through `src/lib/auth/context.ts` (`requireUser`, `requireAal2`).
- TOTP two-factor authentication is optional for students and enforced by restrictive RLS once
  enrolled (aal1 sessions read nothing).
- The Phase 1 demo cookie is gone. `/manage` is unavailable in production until Phase 4.

## Future authorization and RLS (Phase 4)

The governance model needs scoped, time-bound authority, not a global role:

```
School Responsible ── recovery only (never routine access to confidential applications)
        │
BDE President + BDE Vice-President ── two distinct platform admins
        │
Associations ── each controls its own private recruitment data
        │
Association presidents ── create custom positions
        │
Positions ──► permissions        (a position grants permissions; they are separate concepts)
Mandates  ──► when a position is held (they expire)
Delegations ──► temporary, scoped hand-over of permissions
```

One person can hold different positions in different associations at the same time
(Treasurer of one, Communications of another, Reviewer for the BDE recruitment).

How that becomes database security:

- Tables carry the scope they belong to (`organization_id`, `campaign_id`, …).
- RLS policies ask one question: "does the current user hold, right now, a permission on this
  scope?" The answer comes from helper functions in the `private` schema
  (`security definer`, pinned `search_path`, granted to `authenticated` only, each with tests).
- Policies stay small and call the helpers; business rules do not get copied into every policy.
- Cross-organization isolation, mandate expiry and delegation expiry are covered by pgTAP tests
  before any real data exists.

Phase 2 created nothing of this. It only made sure nothing blocks it: no `profiles.role`, a
private schema for the helpers, guard tests that fail if a table in `public` lacks RLS.

## Storage model (later phases)

Two classes of files, never mixed in one bucket:

| Class | Examples | Bucket | Access |
| --- | --- | --- | --- |
| Public media | association logos and covers, event and post images | public bucket(s) | anyone can read; only authorized members can write (RLS on `storage.objects`) |
| Private files | CVs, application documents, interview notes, internal attachments | private bucket(s) | no public URL; read through short-lived signed URLs issued after a permission check |

- **A CV or any applicant document never goes into a public bucket.**
- Object paths follow the owner: `associations/{association_id}/…`, `events/{event_id}/…`,
  `posts/{post_id}/…`, `applications/{application_id}/…`, `avatars/{user_id}/…`. File names are
  generated ids (`{uuid}.pdf`), never personal data (`john-smith-cv.pdf`); the human-readable
  download name is produced at download time.
- Each class gets its own size and MIME limits (bucket settings plus server checks), set with the
  feature that introduces it. Nothing accepts "any file, any size".
- Storage objects are not inside database backups (see [environments.md](environments.md#backups)).

## Edge Functions (later phases)

For work that must not run in the browser and does not fit a page request: sending emails,
scheduled workflows, webhooks from third parties, secure calls to external APIs, narrowly
defined administrative operations. Each function authorizes its caller explicitly (Supabase's
`@supabase/server` SDK, `auth: 'user'` or `auth: 'secret'`). No function exists yet, and no
empty `supabase/functions/` folder was created for show.

## Scheduled jobs (Phase 11)

Expected jobs: mandate expiry, recruitment closure, reminders, delegation expiry, data
retention, governance alerts, scheduled publishing.

Intended shape:

- `pg_cron` (available on Supabase) schedules them; each job calls one well-named SQL function
  in `private`, or an Edge Function through `pg_net` with a secret key read from Vault.
- Jobs are idempotent (safe to run twice), record what they did (audit), and never delete
  personal data without the retention rules decided in that phase.
- Schedules are created by migrations, like everything else.

## Realtime (later, selectively)

Realtime stays off for every table until a feature needs it (candidates: notifications, a
live operations board on event nights, recruitment status). Each use adds the table to the
publication in a migration and relies on the same RLS policies.

## What does not exist on purpose

No ORM, no second database, no GraphQL layer, no queue, no cache server. Supabase and Postgres
are the backend; adding a tool needs a decision record in [decisions.md](decisions.md).
