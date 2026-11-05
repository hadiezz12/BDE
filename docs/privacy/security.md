# Security review (Phase 14)

Automated and manual checks only: **this is not a penetration test** (Phase
15 plans broader testing). Evidence is in the tests named below and in the
Phase 14 report.

## Threat model (what matters most)

| Scenario | Control | Evidence |
| --- | --- | --- |
| A student reads another student's application, request or export | RLS on every table, no table grant; reads only through definer functions checking the caller; exports bound to the requester | `privacy.test.sql` §1–§2, `recruitment*.test.sql`, `e2e/privacy.spec.ts` |
| A reviewer reads another association's CVs, or keeps reading after revocation | `private.application_can` per row, at the time of the call; downloads checked and logged | `recruitment_review.test.sql` (scope, revocation, expiry) |
| An expired officer keeps acting | Mandates checked by date inside every authorization function (no job, no JWT claim) | `governance`, `analytics`, `continuity` tests (§81) |
| The BDE or the guardian browses applicants or privacy cases | No key opens them; privacy cases need `platform.privacy.requests` | `privacy.test.sql` (BDE and guardian refused) |
| A forged request, role or consent | No table writes for API roles; roles only from mandates; requests carry the session's identity | `privacy.test.sql` §1 and §9 |
| A leaked file URL | No public bucket, no signed URL handed out; reviewer downloads open a 2-minute Storage window for that file and that session only (D66) | `foundation.test.sql`, `recruitment_review.test.sql`, posture check (no public bucket) |
| An exposed secret | Only the Supabase URL and the publishable key are public; secrets in Edge Function secrets and Vault; secret scan of the repository | scan below |
| Stored XSS in articles, answers, notes | React escaping, JSON rich text rendered by `RichText` only, `isSafeHref`, no `dangerouslySetInnerHTML` | Phase 6 tests |
| CSRF on downloads and exports | Server Actions' origin check; route handlers check `Origin` (exports, privacy downloads) | `e2e/analytics.spec.ts`, `e2e/privacy.spec.ts` |
| A malicious upload | Content checks by magic bytes, size limits, allowed types, attachment-only downloads; **no malware scanner** | Phase 8 tests; finding F4 |
| Private pages cached and served to someone else | Dynamic rendering with the session; downloads `private, no-store`; no shared cache layer (D93) | headers, Phase 12 D93 |
| Erased data coming back from a backup | Ledger of one-way keys + `reconcile_erasures()` in the restore runbook | `privacy.test.sql` §5 |
| Destructive retention without a decision | Null = keep; a period needs a decision note and the previewed count; holds | `privacy.test.sql` §6, `continuity.test.sql` |
| Fake breach decision or a hidden breach | Breach fields writable only by the privacy officer (second factor), audited; reminders to the officer and BDE operations | `privacy.test.sql` §7 |

## Controls inventory

- **Database**: RLS enabled on every table in `public` and `private`; no
  INSERT/UPDATE/DELETE/TRUNCATE grant to `anon`/`authenticated`; every
  `security definer` function pins `search_path`; private helpers closed to
  API roles (allowlist in `foundation.test.sql`); new privacy helpers checked
  in `privacy.test.sql` §9; append-only audit and access logs (deletion only
  by the retention job, after a decided period of at least 12 months).
- **Storage**: three private buckets (`avatars`, `association-media`,
  `recruitment-documents`), files served by the site's routes after a check;
  the cleanup worker deletes only queued paths of known shapes in those
  buckets (now including erased profile photos).
- **Auth**: e-mail code sign-in (no password), school domain at signup, TOTP
  second factor required server-side (`private.require_aal2`, the JWT's
  `aal`, never a client flag) for sensitive governance, recruitment exports,
  platform statistics exports and every privacy-officer action.
- **Site**: headers — `X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors
  'self'; object-src 'none'; base-uri 'self'; form-action 'self'`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (no camera, microphone, location,
  payment), `Cross-Origin-Opener-Policy: same-origin`, HSTS one year.
- **Logs**: `logDataError` records where and the error code, never values;
  Edge Functions log counts and short codes; audit details hold no e-mail.
- **Rate limits**: database limits on registrations, applications,
  broadcasts, privacy requests (one open per kind, six a month) and
  self-service exports (ten a day); in-memory limiter on `/api/search`.

## Checks run in Phase 14

- `npm audit --omit=dev`: **0** after upgrading Next.js 16.4.0 → **16.4.2**
  (critical advisories: RCE in the image optimizer with SVG, DoS with Server
  Actions, RCE in `use cache`). Dev tooling: 16 moderate (`minimatch` under
  ESLint), not shipped.
- Secret scan of the 725 tracked files (Supabase secret keys, JWTs,
  Brevo keys, private keys, database URLs with passwords, AWS keys): one
  match, a **synthetic** value in a test that checks the register refuses
  secret-looking text. `test-accounts.local.md` is git-ignored.
- Public environment variables: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
- Schema posture (pgTAP): RLS everywhere, no API write grant, definer
  search paths, no public bucket, no privacy/retention function open to
  visitors.

## Findings register

| # | Finding | Severity | Module | Action | Owner | Type | Status | Blocks launch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Next.js 16.4.0 critical advisories | Critical | Framework | Upgraded to 16.4.2 | Claude | Technical | **Fixed** | — |
| F2 | Retention periods undecided: personal data kept indefinitely | High | Retention | Decide every period (`retention-schedule.md`) | BDE / controller | Institutional | Open | **Yes** |
| F3 | Controller, contact, DPO, legal bases, notice approval missing | High | Notice | Provide the facts, approve, record the version | Controller | Legal | Open | **Yes** |
| F4 | No malware scanning of uploaded CVs and documents | High | Recruitment | Decide: scanning service (a processor), or accept with attachment-only downloads | Controller + technical owner | Technical / institutional | Open | To decide |
| F5 | Storage cleanup not configured on dev (Vault secrets); the updated worker (avatars) is deployed on dev (v2) | Medium | Storage | Create the two Vault secrets; deploy `storage-cleanup` on production | Technical owner | Technical | Open | Yes for production |
| F6 | Session cookie readable by scripts (`@supabase/ssr` default) and no script CSP | Medium | Auth / site | Nonce-based script CSP done in Phase 15 (`src/lib/security/csp.ts`); keep no `dangerouslySetInnerHTML` | — | Technical | **Fixed** (Phase 15) | No |
| F7 | Supabase Auth session timeouts not set | Medium | Auth | Set time-box and inactivity timeout in production (since Phase 15 D10 they take effect at once: an ended session is refused by the database) | Technical owner | Technical | Open | Recommended |
| F8 | Production providers (host, e-mail) and DPAs not chosen | High | Processors | Choose, sign DPAs, assess transfers | Controller | Legal | Open | **Yes** |
| F9 | Dev project on a free plan in a personal organization (no backups) | Medium | Continuity | Production under an institutional organization with backups | Owner | Institutional | Open (Phase 11) | Yes |
| F10 | Reviewer download window of 2 minutes after a check (residual after revocation) | Low | Recruitment | Documented; shorten if needed | — | Technical | Accepted | No |
| F11 | Audit details may contain titles and association names (no e-mails); kept pseudonymously after erasure | Low | Audit | Controller to confirm the accountability need | Controller | Legal | Open | No |
| F12 | Files restored into Storage come back without a row pointing to them | Medium | Backups | `reconcile_erasures()` queues them (migration 20261104081408) + runbook step | Technical owner | Technical | **Fixed** (tested) | No |
| F13 | VSS / VDH alert form is a demonstration; wiring it would process highly sensitive reports | Info | Safety | AIPD before any wiring | Controller | Legal | Not built | — |
| F14 | Dev-only dependency advisories (minimatch) | Low | Tooling | Update ESLint stack when convenient | — | Technical | Open | No |
