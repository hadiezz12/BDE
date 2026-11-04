# Providers, contracts and transfers

Only providers the code actually uses are listed (checked in `package.json`,
the Supabase clients, the Edge Functions and the network requests a browser
makes, Phase 14). No contract is assumed: every DPA is **to verify** by the
account that owns production.

| Provider | Used for | Data | Integration (verified) | Region | DPA / art. 28 | Transfers | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database, Auth (accounts, sessions, MFA), Storage (photos, association media, CVs), Edge Functions, pg_cron | Everything in `data-inventory.md` | `@supabase/ssr`, `@supabase/supabase-js`; Edge Functions `notifications-worker`, `notifications-webhook`, `storage-cleanup` | Dev: `eu-west-3` (Paris). Production: **not created** | To accept/verify under the production organization (Supabase publishes a DPA) | Hosting in the EU does not exclude access from outside (support, subprocessors): to assess with Supabase's subprocessor list | Dev only; production owner and plan to decide |
| Brevo | Transactional e-mail (optional) | Recipient e-mail, subject/body (neutral for recruitment), delivery events | Edge Function `notifications-worker` transport `brevo`; key only in the function's secrets | To verify | To verify before `live` | To verify | **Not live**: dev runs in `capture` (nothing sent) |
| Site host | Serves the Next.js site, request logs | IP addresses and paths in logs, everything rendered | Not chosen | — | — | — | **Launch blocker** |
| Fonts | — | — | `next/font` downloads Archivo and Space Mono **at build time** and serves them from the site; no browser request to Google | — | — | None at runtime | Verified (e2e: no third-party host) |

**Not used:** analytics or audience tools, advertising, error monitoring
(no Sentry or similar), social widgets, maps, video embeds, CDN other than
the future host, AI services. Development tools (code assistants, design
tools) are **not** processors of production data: real CVs, answers, notes,
tokens or dumps must never be pasted into them (`AGENTS.md`).

## Data flows

```text
Student browser ──HTTPS──> Site (Next.js, host TBD)
   │  cookies: sb-…-auth-token (session), vpc-theme
   │
   │                       ├── server actions / route handlers (the person's own session)
   │                       ▼
   │                  Supabase Auth ── e-mail code ──> student mailbox (via Supabase / custom SMTP)
   │                  Supabase Postgres (RLS, security definer functions)   [C, HR data]
   │                  Supabase Storage: avatars, association-media, recruitment-documents   [C]
   │                       ▲
   │   /media/* and /api/recruitment/documents/<id> stream files after a check (never a public URL)
   │
pg_cron ──pg_net──> Edge Functions (bearer tokens from Vault)
                      notifications-worker ──> Brevo (when live)   [PE; recruitment e-mails neutral]
                      storage-cleanup ──> Storage API (deletes queued paths only)
```

Confidential flows: application answers and documents (browser ↔ site ↔
Supabase, only with the candidate's or an authorized reviewer's session),
exports (database → site → the requester's browser, never stored outside the
database), erasure (database → Storage cleanup queue → worker).

## Before launch (owner: technical owner + controller)

1. Create production under an organization the institution controls; accept
   Supabase's DPA there; record region and plan in the register.
2. Choose the site host; accept its DPA; note its log retention.
3. Before switching e-mail to `live`: Brevo (or another provider) DPA,
   sender domain (the BDE buys the domain), region.
4. For each: list subprocessors, check transfers outside the EU and the
   safeguards (adequacy decision such as the EU–US Data Privacy Framework for
   certified US entities, or standard contractual clauses), and write the
   result in the notice.
