# Scheduled jobs

Every recurring task runs in the database through one dispatcher
(`private.run_scheduled_job`), scheduled by pg_cron. The BDE sees them in
**Centre de contrôle › Continuité › Opérations**. Details:
`docs/backend/continuity.md#scheduled-jobs`.

| Job | Every | Essential | Retry from the site | Does |
|---|---|---|---|---|
| `publish-scheduled-posts` | minute | yes | yes | publishes approved scheduled posts (rechecks every blocker) |
| `notifications-dispatch` | minute | yes | yes | dispatches broadcasts, wakes the e-mail worker |
| `notification-reminders` | 15 min | yes | yes | event and interview reminders, pending reviews |
| `recruitment-review-jobs` | 5 min | yes | yes | scheduled decision releases, offer expiry |
| `enqueue-recruitment-reminders` | hour | no | yes | candidate reminders |
| `governance-health` | hour (:17) | yes | yes | the governance checker, mandate reminders |
| `storage-cleanup` | 15 min | no | yes | wakes the `storage-cleanup` Edge Function when files wait |
| `purge-recruitment-data` | night (03:23 UTC) | no | **no** | recruitment retention (Phase 8 settings) |
| `data-retention` | night (03:40 UTC) | no | **no** | retention policies, technical housekeeping |
| `platform-health-report` | Monday 07:00 UTC | no | **no** | the weekly report to the BDE offices |

Deleting jobs are never retried by hand: they run again the next night.

## Reading the health

- **À l'heure**: last success within twice the period plus ten minutes.
- **En retard**: no success for longer than that. Look at pg_cron
  (`select * from cron.job_run_details order by start_time desc limit 20;`
  in the SQL editor, read-only) and the project's status.
- **En échec**: three failures in a row (the short error code is shown; the
  full message is in the database logs, never in the site).
- **Non programmée**: pg_cron has no active job with the expected command.
  Re-apply the last migration that schedules jobs (see "Fixing the
  schedule"), never edit `cron.job` by hand.
- **Impossible à vérifier**: no pg_cron (local databases). Never shown as
  healthy.

A failed run rolled its own work back; pending work is still there and the
next run processes it. Retrying from the site is safe for retryable jobs and
needs the second factor.

## The external uptime check (to configure)

The site's health is also measured from outside, so a stopped scheduler or a
database outage is noticed even if nothing inside runs:

1. Choose a monitoring service the institution controls (any HTTP uptime
   checker).
2. Monitor `GET https://<site address>/api/health` every 5 minutes. 200 =
   fine; 503 = degraded (database, sign-in, or essential jobs late). The body
   is `{status, database, auth, jobs, checked_at}` and nothing else.
3. Send its alerts to the technical owner and to a BDE role address.
4. Write the service and who receives its alerts in the register line
   **Surveillance extérieure du site**.

## The storage cleanup (to configure once per project)

The `storage-cleanup` Edge Function needs two Vault secrets. Without them
files wait (nothing is lost) and the operations page says "not configured".
The token is generated inside the database and never leaves it (the function
checks it through its own database connection):

```sql
-- Supabase SQL editor of the project, by the technical owner.
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/storage-cleanup',
                           'storage_cleanup_url', 'storage-cleanup Edge Function address');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                           'storage_cleanup_token', 'storage-cleanup Edge Function token');
```

Deploy the function with `verify_jwt = false` (see `supabase/config.toml`):
the token is its only key. It uses the platform-provided `SUPABASE_DB_URL`,
`SUPABASE_URL` and `SUPABASE_SECRET_KEYS`; nothing to add to its secrets.
To rotate the token: `select vault.update_secret((select id from vault.secrets
where name = 'storage_cleanup_token'), encode(extensions.gen_random_bytes(32), 'hex'));`.

## Fixing the schedule

The schedules are in the migrations (the last one that calls
`cron.schedule`). If a job is missing or wrong in pg_cron, re-run that
migration's scheduling block through a new migration (it is idempotent:
`cron.schedule` with an existing name replaces the command). Do not edit jobs
in the dashboard: the next migration would disagree with it.

## Schema drift

The operations page compares the last migration the database recorded with
the last one in the code (`src/lib/continuity/schema.ts`, kept equal to the
last file by a unit test). If they differ: apply the missing migrations
through the normal workflow (`docs/backend/supabase-workflow.md`), or deploy
the code that matches the database. Never change the database by hand to
match a file.

## The security self-check

**Opérations › Contrôle de sécurité** re-runs on every visit: row level
security on every public table, no insert/update/delete grant to API roles,
every security-definer function with a fixed search path, private functions
closed (same allowlist as `supabase/tests/database/foundation.test.sql`), the
office overlap guard, both BDE offices held, exactly one guardian, officers
without a second factor. "À corriger" means a migration must fix it, reviewed
like any other: the check never changes a policy by itself. The full
regression suite (`supabase test db`, CI) is the deeper version of the same
check and must stay green before any deployment.
