# Security foundations

The platform will hold sensitive data: applications, CVs, answers, reviewer notes, and the
personal data of every student. These rules hold from the first table.

## Trust levels

| Level | Trust | Consequence |
| --- | --- | --- |
| Browser | untrusted | anything it sends can be forged |
| Signed-in user | **still untrusted** | being logged in proves identity, not that the request is allowed |
| Server code (Next.js) | trusted as far as its credentials go | with the publishable key it has exactly the user's rights |
| Database + row level security | **the security boundary** | the final word on who reads and writes what |
| Secret key | highly trusted, dangerous | bypasses RLS entirely; almost never used |

Never trust a `user_id`, `organization_id`, role, permission or ownership claim that comes from
the client. The database derives the user from the verified session (`auth.uid()`) and the
rights from its own tables.

## Identity, authorization, scope, mandate

Four separate questions, answered by separate parts of the future model:

| Question | Answered by |
| --- | --- |
| Who is this? (authentication) | Supabase Auth, Phase 3 |
| What may they do? (authorization) | positions → permissions, Phase 4 |
| Where? (scope) | the organization, campaign or event the permission applies to |
| When? (mandate) | mandate and delegation dates; expired means no access |

There is no global `role` column and there will not be one: one person can be Treasurer of one
association, in charge of Communications in another and a Reviewer for the BDE's recruitment at
the same time. The School Responsible exists for recovery and continuity, not for routine access
to confidential applications. Associations control their own private recruitment data.

## API keys

| Key | Where it may appear | Rights |
| --- | --- | --- |
| Publishable (`sb_publishable_…`) | browser and server, in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `anon` role, or the signed-in user; RLS applies |
| Secret (`sb_secret_…`) | server-only code, in `SUPABASE_SECRET_KEY` | bypasses RLS; rejected by Supabase when sent from a browser |
| Legacy `anon` / `service_role` (JWT) | nowhere in this project | kept by Supabase for old projects; disable them on ours |

The secret key, or any equivalent privileged credential:

- never goes into a `NEXT_PUBLIC_*` variable, client code or the generated JavaScript;
- is never committed, logged, printed, or returned by an API response;
- is checked in code: the app refuses a privileged key in the public variable, and
  `npm run db:check` scans every `NEXT_PUBLIC_` variable for one.

## Privileged access

`createSupabaseAdminClient()` (`src/lib/supabase/admin.ts`) is the only privileged client. It
imports `server-only`, and ESLint rejects every import of it unless the line carries an
`eslint-disable-next-line no-restricted-imports -- <reason>` comment for a reviewer to see.

It is reserved for narrowly defined trusted operations, each listed here before it is written:

| Operation | Why it cannot use the user's client | Added in |
| --- | --- | --- |
| The e-mail worker, `POST /api/notifications/send` | it claims and completes other people's messages (`claim_notification_emails`, `complete_notification_email` are granted to `service_role` only) and reads their address to send them; it runs without a user, behind `NOTIFICATIONS_WORKER_SECRET` | Phase 7 |

A permission problem in a page is fixed with a policy, never by switching to this client.

## Row level security rules

- Every table in `public` has RLS enabled in the migration that creates it; the guard test
  enforces it.
- No real data is stored in a user-accessible table before its policies and their tests exist.
- UI hiding is not authorization: "they cannot see the button" protects nothing.
- Policy helpers run as `security definer` only when needed, live in `private`, pin their
  `search_path`, and are granted to the roles that need them, one by one.

## Storage privacy

- **CVs, application documents and interview notes never go into a public bucket.** They live in
  private buckets, readable only through short-lived signed URLs issued after a permission
  check, and every access to them will be auditable.
- Public buckets hold only content meant for everyone (logos, covers, event and post images).
- Paths carry ids, not names: `applications/{application_id}/{uuid}.pdf`, never
  `jane-doe-cv-finance.pdf`.
- Each upload class has size and MIME limits (to be set with each feature):

  | Class | Indicative limits (decided per feature) |
  | --- | --- |
  | avatars | images (jpeg, png, webp), ~2 MB |
  | public images (logos, covers, posts) | images, ~5 MB |
  | videos | only if a feature needs them; strict size, maybe an external host |
  | CVs and documents | pdf (maybe docx), ~5 MB, private bucket |

  Nothing accepts any file, of any size, of any type.

## Logging

Logs say what failed and where, with ids and error codes, so a failure can be found. They
never contain:

- passwords, tokens, keys, cookies, `Authorization` headers;
- CV contents, application answers, reviewer notes, alert (VSS) contents;
- full request bodies or `PostgrestError.details` / `.hint` (they can contain the values a user
  typed).

`logDataError(where, error)` in `src/lib/data/errors.ts` logs the place, the error kind and the
code, nothing else. No paid monitoring stack is installed; when one is chosen, the same rules
apply to what is sent to it.

## Errors shown to people

Users never see Postgres internals such as
`duplicate key value violates unique constraint "memberships_user_id_organization_id_key"`.
Loaders convert errors with `toDataError(error, { conflict: "Cette personne est déjà membre de
l'association." })` and the UI shows `error.userMessage`. The kinds are `not_found`, `conflict`,
`invalid`, `forbidden`, `unavailable` and `unexpected`.

## Privacy and audit, built in later

The design must keep these possible (nothing is built yet):

- restrict and audit access to applications and CVs (who opened what, when);
- delete or anonymise according to retention rules, distinct from soft deletion;
- export a person's data;
- keep public and private media apart;
- record privileged actions with their actor and context: role changed, presidency
  transferred, application or CV accessed or exported, content moderated, administrator
  restored. Every table that can be changed by a privileged action keeps enough to say who
  acted (`created_by`, an audit log keyed by actor and scope).

## Audit of the repository (2026-10-15)

`.gitignore` excludes `.env*` (with an exception for `.env.example`), the CLI state folders and
build output. The repository was searched for Supabase secret and publishable keys, `service_role`
JWTs, database URLs with passwords, personal access tokens and private keys: none found in the
committed history or the working tree. The dev project's publishable key lives only in the
git-ignored `.env.local`.

## Audit after Phase 3 (2026-10-15)

Same search over the tree and the whole git history, extended to OAuth client secrets and SMTP
passwords: nothing found. No `console.log` remains in `src`; the two log points (`[auth]` in
`src/app/actions/auth.ts`, `[data]` in `src/lib/data/errors.ts`) record an error code and a
category, never an address, a code, a token or a session. No `dangerouslySetInnerHTML` anywhere:
names typed by students are rendered as text. The MFA setup key and QR code exist only in the
Server Action response shown on the security page.

Sign-in specifics (who may sign up, sessions, MFA, redirect safety) are in
[authentication.md](authentication.md).

## Rules for AI agents and developers

These rules are repeated in `AGENTS.md` so every coding agent reads them first.

- Never mutate production experimentally.
- Never expose Supabase secret credentials.
- Never bypass RLS to fix a frontend permission problem.
- Never manually patch a production schema without a migration.
- Never rewrite deployed migrations casually.
- Never create a single global role model.
- Never put applicant files in public storage.
- Never assume UI hiding equals authorization.
- Never remove constraints to make an error disappear.
- Never use real applicant or student personal data in seeds or tests.
