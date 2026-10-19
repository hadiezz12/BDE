# Authentication

```
Authentication answers:  Who are you?
Authorization answers:   What are you allowed to do?

Phase 3 implements authentication.
Phase 4 implements authorization.
```

Signing in proves an identity and nothing else. A new account is an ordinary student with **zero
management privileges**: no association, no BDE role, no reviewer right. Nothing in the code may
treat "signed in" as "allowed to manage" (see [Handoff to Phase 4](#handoff-to-phase-4)).

## What is implemented

| Piece | State |
| --- | --- |
| Sign-in method | **School e-mail + 6-digit code** (Supabase email OTP). No password. The first sign-in creates the account. |
| Institutional sign-in (Microsoft Entra ID / Google Workspace) | **Ready, switched off.** Needs the school's real identity provider and credentials ([below](#institutional-sign-in)). Never tested against a real provider. |
| Who may sign up | Enforced by Supabase Auth's **before-user-created hook** against a domain list and an exact-address exception list. Default deny. |
| Profiles | `public.profiles`, one row per auth user, private to its owner. |
| Onboarding | Short form on first sign-in (first and last name required; display name, programme, year optional). |
| Avatars | Optional, private `avatars` bucket, owner-only. |
| Sessions | Cookie sessions via `@supabase/ssr`, refreshed by `src/proxy.ts`, verified with `getClaims()` on the server. |
| Two-factor authentication | TOTP (authenticator app), optional for students, enforced by the database once enrolled. |
| Management (`/manage`) | **Not available** in production until Phase 4, for everyone. Development keeps a fictional preview. |

## The flow

```
Visitor ── browses everything public (no account needed)
   │
   │  opens /account (or clicks "Se connecter")
   ▼
/login ── school e-mail ──► Supabase Auth signInWithOtp
                              │  new address? before-user-created hook:
                              │  eligible domain or exception → user created
                              │  anything else → refused ("Utilise ton adresse e-mail de l'école")
                              ▼
          6-digit code by e-mail ──► verifyOtp (server action, cookies set on the server)
                              │
                              ├─ MFA enrolled? → /login/verification (TOTP code → aal2)
                              ├─ first visit?  → /account/onboarding
                              └─ otherwise     → ?next= destination, or /account
```

## Who may sign up

Source of truth: two tables in the `private` schema (not exposed by the Data API, readable by
no API role):

| Table | Row means |
| --- | --- |
| `private.allowed_signup_domains (domain, note)` | any address `…@domain` may create an account (exact match: subdomains need their own row) |
| `private.signup_email_exceptions (email, reason, is_active, expires_at)` | this exact address may create an account while active and unexpired |

`private.before_user_created(event)` runs inside Supabase Auth before every user creation (email,
OAuth, any method) and calls `private.is_email_eligible(email)`. Ineligible: the user is never
created and the client receives `signup_email_not_eligible`, which the app translates.

**Default deny.** No row, no signup. That is the state of every hosted project until someone adds
the real domain on purpose; a missing configuration can never open the platform to any address.

An exception decides only *whether this identity may exist*. It grants nothing: no School
Responsible, no BDE role. Those are Phase 4.

**The school's domain is `grenoble-em.com`** (confirmed 2026-10-19). It is shared by every GEM
campus, and the platform is not run with the school (no directory, no institutional sign-in), so a
school address proves "GEM student", not "Paris campus". The site is meant for the Paris campus;
that part stays declared by the student and, where it matters (the carte cotisante, members-only
features), checked by the BDE itself. Production adds this one domain at setup; development
projects keep fictional data and do not need it.

### Configuring who may sign up

| Environment | How |
| --- | --- |
| Local stack, CI | `supabase/seed.sql` adds the fictional `student.example.test`. |
| Development (`verypinkclub-dev`) | Nothing configured: signups are refused. Add an exception for a tester (below), on that project only. |
| Production | The school's real student domain(s), once confirmed by the BDE / the school. **Not known yet.** |

Run in the SQL editor of the target project (or through a migration if the value should be
versioned for every environment):

```sql
-- the school's student domain (exact; add another row per sub-domain)
insert into private.allowed_signup_domains (domain, note)
values ('<real-domain>', 'GEM Alpine Business School students');

-- an exact address outside the domains (no role is attached to it)
insert into private.signup_email_exceptions (email, reason, expires_at)
values ('<address>', '<who and why>', null);
```

### Email changes

The app offers no e-mail change in Phase 3. The Auth API still allows one, so
`private.guard_auth_email_change()` (a `before update of email, email_change` trigger on
`auth.users`) refuses any new address that is not eligible: a student cannot move their account to
a personal mailbox. Supabase also asks both the old and the new address to confirm
(`double_confirm_changes`).

## Profiles

`public.profiles` (migration `…_create_profiles.sql`):

| Column | Notes |
| --- | --- |
| `id` | = `auth.users.id`, `on delete cascade` (no meaning without the identity) |
| `first_name`, `last_name` | required to finish onboarding; 1–60 characters, no control characters |
| `display_name` | optional, shown instead of the first name |
| `avatar_path` | object path in the `avatars` bucket; a check forces it into the owner's folder |
| `program` | optional free text (no reference list of programmes exists yet) |
| `study_year` | optional, 1–8 |
| `onboarding_completed_at` | set when the first-visit form is done |
| `created_at`, `updated_at` | `private.set_updated_at()` trigger |

Deliberately absent: `role`, `is_admin`, `association_id`, the e-mail (it stays in `auth.users`,
the single source of truth, read from the verified session), birth date, phone, gender, address,
social handles.

- **Creation:** `create_profile_after_signup`, an `after insert on auth.users` trigger calling
  `private.create_profile_for_new_user()`. It inserts the id and nothing else, so user input can
  never make a signup fail. A missing row is logged and shown as "Ton compte n'est pas encore prêt".
- **Pre-fill:** names sent by an institutional provider (`given_name`, `family_name`) pre-fill the
  onboarding form only; they are never trusted for any decision.
- **RLS:** `profiles_select_own` and `profiles_update_own` (`auth.uid() = id`), plus the restrictive
  `profiles_require_mfa_when_enrolled`. Grants: `select` and column-level `update` on the editable
  columns to `authenticated`; nothing to `anon`; no insert or delete for anyone through the API.
- **Data access:** only `src/lib/data/profile.ts` reads or writes the table, always for the
  verified session user; Server Actions validate input with `src/lib/auth/profile-input.ts` and
  never accept an id from the browser.
- **Privacy:** a profile is visible to its owner only. A later phase can expose a public
  projection (display name, avatar, position on a team page) as a separate `security_invoker`
  view with chosen columns; the table itself stays private.

## Avatars

- Bucket `avatars`: **private**, 2 MB, `image/webp`, `image/png`, `image/jpeg`.
- Path: `{user_id}/{uuid}.{webp|png|jpg}`; storage policies let a user select, insert, update and
  delete only inside their own folder, with that exact name format, plus the MFA restriction.
- Upload goes through the `uploadAvatar` Server Action: the browser first shrinks the picture to
  512 px WebP (which also drops camera metadata), then the server checks the size, detects the real
  type from the file's bytes, picks the path itself and uploads with the student's own session.
- Shown through a one-hour signed URL. No public URL exists.

## Sessions

- `src/proxy.ts` (Next 16's proxy, formerly middleware) runs `updateSession()` on every page
  request: it refreshes the session cookie with `getClaims()`, forwards Supabase's cache headers,
  redirects signed-out visitors away from `/account`, and marks personal and sign-in pages
  `Cache-Control: private, no-store`.
- `src/lib/auth/context.ts` is the only way the server learns who is there:
  `getAuthContext()` (`anonymous` / `mfa_required` / `authenticated` with `aal`), `requireUser()`
  (redirects to sign in or to the second factor), `isAal2()` / `requireAal2()` for Phase 4.
  It uses `getClaims()` (verified JWT), never `getSession()`'s cookie copy.
- Every account page, layout and Server Action checks again; the proxy is a first gate only.
- Sign-out is a POST Server Action (`signOut`, this device or every device).
- Pages that read the session are dynamic: nothing personal is ever prerendered or cached.
- `AuthListener` re-renders a tab that comes back to the front after the session cookie appeared or
  disappeared (sign-in or sign-out in another tab).

## Two-factor authentication (TOTP)

- **Enrollment** (`/account/security`): `startTotpEnrollment` (clears an abandoned unverified
  factor, enrolls a new one, returns the QR code and the manual key for that screen only) →
  `confirmTotpEnrollment` (first code from the app, `challengeAndVerify`). Only a verified factor
  counts; the session becomes **aal2**.
- **Sign-in:** after the e-mail code, a user with a verified factor is sent to
  `/login/verification`. Until the TOTP code is verified the session is **aal1** and treated as
  signed out: account pages redirect, the header offers "Terminer la connexion", and the database
  returns nothing of theirs (`private.mfa_requirement_met()` in restrictive policies on `profiles`
  and on the `avatars` bucket).
- **Removal:** only from an aal2 session (the app checks; Supabase enforces it too), then the
  session is refreshed.
- **Secrets:** generated and stored by Supabase Auth; the app never stores, logs or tracks them.
- **Recovery codes:** none. A home-made recovery system would weaken MFA. Losing the authenticator
  currently blocks sign-in; a verified recovery procedure belongs with Phase 4's governance tools.

## Routes

| Route | Access |
| --- | --- |
| `/`, `/events…`, `/associations…`, `/recruitment…`, `/campus…`, `/search`, `/vss` | public |
| `/login`, `/login/verification`, `/auth/callback` | sign-in (redirect away when already signed in) |
| `/account`, `/account/profile`, `/account/security`, `/account/onboarding`, `/account/…` | signed-in students (aal2 when MFA is enrolled); first visit goes through onboarding |
| `/manage…` | production: "L'espace des bureaux ouvre bientôt" for everyone; `next dev`: fictional preview |

`?next=` destinations go through `safeNextPath()`: same-site paths only (no absolute,
protocol-relative or backslash URLs, no control characters, never back to `/login` or `/auth`).

## Messages, enumeration, rate limits

- `src/lib/auth/messages.ts` maps every Auth error code to a short French sentence; students never
  see codes, stack traces or the words OAuth, JWT or Supabase.
- After an address is submitted the screen says "si l'adresse est éligible, un code vient d'y être
  envoyé" whether the account exists or not. The only explicit refusal is the domain rule, which
  is public.
- Supabase Auth enforces the limits (`[auth.rate_limit]`, `max_frequency = 60s` per address); the
  form mirrors them (resend cooldown, buttons disabled while sending) for comfort only.

## E-mail

- Templates in `supabase/templates/`: sign-in code (`confirmation` and `magic_link`),
  `reauthentication`, and security notices when an authenticator is added or removed. Plain,
  table-based, code only, nothing personal. The brand is set in text: a logo image needs the site's
  final domain to be hosted.
- Local stack: Mailpit at http://127.0.0.1:54324 catches everything.
- Hosted projects: Supabase's default sender only delivers to the organization's own members and
  is heavily rate-limited. **Production needs its own SMTP provider** (domain with SPF/DKIM),
  configured in the dashboard or with `env(...)` secrets in `config.toml` — never committed.

## Institutional sign-in

`AUTH_SSO_PROVIDER` (server variable, `azure` or `google`) shows "Continuer avec ton compte de
l'école" on `/login`. Before setting it:

1. Get the school's provider: Microsoft Entra ID tenant (preferred if GEM uses Microsoft 365) or
   Google Workspace.
2. Register an application with the provider, redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Enable the provider in Supabase (Auth → Providers) with the client id and secret; for Azure set
   the tenant URL so only the school's directory can sign in.
4. Scopes requested by the app: `openid email profile` only. No mailbox, calendar, files, contacts.
   Provider tokens are not stored.
5. The before-user-created hook still applies: an institutional identity whose e-mail is not in an
   allowed domain is refused.
6. Test the full flow on the development project before production.

## Test accounts (development only)

Fictional accounts to try the site as each kind of user without a school mailbox. They cannot
receive a code, so a development environment lets them in with a password, through a dashed
"Comptes de test" form under the normal sign-in on `/login`.

- Two locks (`src/lib/auth/test-accounts.ts`), checked again by the Server Action
  `signInWithTestAccount`: the server variable `AUTH_TEST_ACCOUNTS=on` (never set in production),
  and an address `<name>@comptes.example.test`, a domain reserved for fiction that the sign-up hook
  never allows. Any other address gets the same refusal, whatever the password.
- Accounts are created by hand with `supabase/dev/create-test-account.sql` (psql variables; the
  password is passed in, never committed). The script inserts nothing for any other domain.
- Sign-in goes through Supabase's own `signInWithPassword`; the second factor, the first-visit
  form and `next` behave exactly as after a code.
- A test account is a student account: no role, no management right. Phase 4 grants positions to
  them on the development project only.
- The passwords stay outside git, in the maintainer's local `*.local.md` note (ignored).

On `verypinkclub-dev` (created 2026-10-16):

| Address | Profile | Used for |
| --- | --- | --- |
| `nouveau@comptes.example.test` | empty, not onboarded | the first-visit form |
| `membre@comptes.example.test` | "Compte test · Membre" | a signed-in student |
| `president-bde@comptes.example.test` | "Compte test · Présidence BDE" | the BDE presidency, once Phase 4 grants it |
| `responsable-asso@comptes.example.test` | "Compte test · Responsable d'asso" | an association officer, once Phase 4 grants it |

CI creates `e2e.membre@comptes.example.test` on its throwaway local stack with the same script.

## Configuration per environment

| Setting | Local (`config.toml`) | Hosted (dashboard or `npx supabase config push`) |
| --- | --- | --- |
| Site URL | `http://127.0.0.1:3020` | dev: `http://localhost:3020`; production: the real `https://` domain (the BDE buys it) |
| Redirect URLs | `http://127.0.0.1:3020/auth/callback**`, `http://localhost:3020/auth/callback**` | the site's `/auth/callback**` only; previews as narrow as possible |
| Before-user-created hook | `pg-functions://postgres/private/before_user_created` | same, Auth → Hooks |
| Email OTP | 6 digits, 10 min, 60 s between sends, confirmations on | same |
| Email templates | `supabase/templates/*` | same files |
| TOTP MFA | enroll + verify on | same |
| SMTP | Mailpit | production: own provider |

`npx supabase config push` (after `login` and `link`) applies the `[auth]` section of
`config.toml` to the linked project. Check the linked project first; never push local URLs to
production. A free-plan project on Supabase's default mailer refuses the push, because it includes
the e-mail templates: configure a custom SMTP first, or set the hook and URLs by hand in the
dashboard (see [environments.md](environments.md#auth-settings-per-environment)).

### Production checklist

```
[ ] Correct production Site URL (https, the real domain)
[ ] Allowed redirect URLs limited to the site's /auth/callback
[ ] Before-user-created hook enabled
[ ] School domain grenoble-em.com in private.allowed_signup_domains; arbitrary signups refused (test a gmail address)
[ ] Exceptions reviewed (each with a reason, none stale)
[ ] Institutional OAuth app configured, if used; its secret stored in Supabase only
[ ] Production SMTP configured; templates reviewed and sent to a test inbox
[ ] Email OTP expiry and rate limits reviewed
[ ] MFA enrollment, challenge and removal tested on the production build
[ ] Auth callback tested (cancel, expired link, success)
[ ] Sign-out and "every device" sign-out tested
[ ] No privileged key in the client bundle (search the build for sb_secret_)
[ ] HTTPS everywhere; preview URLs restricted
[ ] Dev project's legacy anon/service_role keys disabled
[ ] AUTH_TEST_ACCOUNTS not set; no @comptes.example.test account exists
```

## Tests

| Layer | File | What it proves |
| --- | --- | --- |
| Database (pgTAP) | `supabase/tests/database/auth.test.sql` (39) | signup eligibility (domains, exceptions, expiry, look-alikes), hook grants, one profile per user, no role column, profile isolation and column grants, onboarding and avatar constraints, MFA enforcement (aal1 vs aal2), email-change guard, avatar storage isolation, private bucket |
| Database (pgTAP) | `supabase/tests/database/foundation.test.sql` (13) | RLS on every public table, private helpers allowlist, search_path, security_invoker views |
| Unit | `src/lib/auth/auth.test.mjs` | open-redirect refusal, error messages, profile validation, avatar path and type detection, test-account locks |
| End-to-end | `e2e/*.spec.ts` (Playwright, CI on the local stack) | the full scenario below, desktop and phone; the test-account sign-in; the light theme |

### Security matrix

| Scenario | Expected | Covered by |
| --- | --- | --- |
| Visitor browses associations and events | allowed | e2e |
| Visitor opens `/account` | redirect to sign in, `next` kept | e2e |
| School-domain student signs up | allowed | pgTAP + e2e |
| Gmail signup | refused | pgTAP + e2e |
| Active exception | allowed | pgTAP |
| Expired / inactive exception | refused | pgTAP |
| New student | no management right; `/manage` unavailable | pgTAP (no role column) + e2e |
| A reads / edits own profile | allowed | pgTAP + e2e |
| A edits B, inserts, deletes, changes id | refused | pgTAP |
| A uploads into B's avatar folder / reads B's avatar | refused | pgTAP |
| MFA user after the first factor only | aal1, sees nothing, redirected to second step | pgTAP + e2e |
| MFA user after the TOTP code | aal2 | e2e |
| Wrong e-mail code / wrong TOTP code | refused with a message | e2e |
| `?next=https://evil…` | ignored | unit + e2e |
| Expired / invalid callback | `/login?error=…` | manual (dev server) |
| Sign out, then `/account` | redirect to sign in | e2e |
| Test-account form without `AUTH_TEST_ACCOUNTS=on` | absent, and the action refuses | unit |
| Test-account form with a non-test address or a wrong password | refused, same message | unit + e2e |

## Handoff to Phase 4

- Identity: `auth.users.id` = `public.profiles.id`. Reference it from memberships, positions,
  mandates, delegations, applications.
- Server checks: `requireUser()` for "who", `requireAal2()` for sensitive governance actions.
  Database checks: `auth.uid()`, `(auth.jwt() ->> 'aal') = 'aal2'`, and new helpers in `private`
  (granted to `authenticated` one by one, added to the foundation test's allowlist).
- Done in Phase 4: `/manage` reads real, scoped permissions ([authorization.md](authorization.md));
  the Phase 1 preview and its fictional officer are gone.
- Never: a role column on profiles, roles in `user_metadata`, or "if this e-mail then admin".
