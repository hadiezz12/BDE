# Technical ownership

The site's application roles (BDE offices, association positions, the
guardian) control nothing outside the site. The accounts that run it —
database, code, hosting, domain, e-mail — belong to whoever created them,
until they are transferred. A graduating student's personal account must not
be the only key to the platform. This runbook is for the **institutional
technical owner** (a person or service of the school named in the register)
and whoever helps them.

## The register

**Centre de contrôle › Continuité › Registre et sauvegardes** lists every
dependency with who holds it, how to reach them, the next renewal and
whether someone verified it. The BDE offices can edit it (with the second
factor); the technical owner checks it at least at each handover. Never a
password, a key, a token or a card number: the database refuses text that
looks like one.

## Dependencies and their handover checklist

| Dependency | Today (development) | Before launch | At each handover |
|---|---|---|---|
| **Supabase** (database, accounts, files, Edge Functions) | `verypinkclub-dev`, free plan, in the developer's personal organization | A production project in an organization owned by the school or the BDE, with at least two owners (technical owner + a named backup); a plan with backups | Owners are current people; billing contact correct; plan and backups verified |
| **Source repository** | GitHub, personal account of the developer, public | Transfer to an organization the school or BDE controls; branch protection on `main`; CI required | Members reviewed; departing people removed |
| **Hosting** of the Next.js site | not chosen | Team account owned by the institution; environment variables set from `docs/backend/environments.md` | Owners and billing reviewed |
| **Domain and DNS** | none (the BDE buys the domain) | Registered to the BDE/school, not to a person; auto-renew on; renewal date in the register | Renewal date and contacts checked |
| **E-mail provider** (Brevo, used by the code) | no account | Account owned by the institution; sending domain authenticated (SPF, DKIM); key set as the `notifications-worker` function secret only | Members and key rotation reviewed |
| **Uptime monitor** | none | Checks `/api/health`, alerts the technical owner | Alert recipients current |
| **Recovery procedure** | — | Written: how the school recovers each account through the provider's own process | Known by the guardian and the technical owner |

## Billing

For each paid service, write in the register: who pays, the plan, the
renewal date, and how a successor verifies the status. The site never stores
payment details. A lapsed payment is the most common way such a site dies:
the renewal reminders (governance checker, `renewal_due`) exist for this.

## Secrets and their rotation

| Secret | Lives in | Rotate |
|---|---|---|
| Supabase secret key (`sb_secret_…`) | Supabase dashboard; the Edge Functions get it from the platform (`SUPABASE_SECRET_KEYS`). The site does not use it. | Dashboard › API keys: create a new secret key, delete the old one |
| Database password / connection string | Supabase dashboard; your password manager for dumps | Dashboard › Database › reset password |
| `notifications_worker_token`, `notifications_webhook_token`, `storage_cleanup_token` | Supabase Vault | `vault.update_secret` with a new random value (see `scheduled-jobs.md`); the webhook token must also change at Brevo |
| `BREVO_API_KEY` | Edge Function secret of `notifications-worker` | Create a new key at Brevo, set it with `supabase secrets set`, delete the old one |
| Hosting environment variables | The host's encrypted settings | Per the host |

When someone with access leaves: remove them from each provider's team,
rotate every secret they could read, and update the register.

## Deployments

- Code: pull request → CI (types, lint, unit, database tests with plpgsql
  lint, concurrency scripts, end-to-end) → merge to `main` → the host deploys.
- Database: migrations in `supabase/migrations/`, applied in order through
  `docs/backend/supabase-workflow.md`. Never `supabase config push` blindly,
  never a hand edit in production, never a migration rewritten after it was
  applied anywhere: fix forward.
- Edge Functions: deployed from `supabase/functions/` with the
  `verify_jwt` setting of `supabase/config.toml`.
- Production is never used for experiments. Test on the development
  project, with fictional accounts.

## Failed migrations

A migration runs in a transaction: if it fails, nothing of it stays. Read the
error, fix forward with a new migration, re-run the tests, apply again.
Never edit the failed file once it has been applied to any shared
environment, never mark it applied by hand.

## What the technical owner must not do

Use the site's powers without holding them. Infrastructure access lets a
person read the database directly: that is not an authorization to read
applications or private content. Use it for operations only, and write what
you did in an incident when it touches users' data.
