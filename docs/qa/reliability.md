# Reliability, concurrency and recovery (Phase 15)

## Concurrency (real parallel database sessions, brief §110)

All scripts run in CI on the local stack (`supabase/tests/concurrency/`), refuse non-local databases, and use
fictional rows they delete afterwards.

| Scenario | Required invariant | Script | Result |
|---|---|---|---|
| Twenty registrations for one last seat | exactly one more confirmed | `registrations.sh` | 1 confirmed, 19 waiting (or refused without a list) |
| Duplicate registration clicks | one active registration | `registrations.sh`, `events.test` | Pass |
| Two cancellations with a waiting list | the first two waiting promoted once each | `registrations.sh` | Pass |
| Capacity cut during registrations | confirmed ≤ capacity, counters = rows | `integrity.sh` | Pass (3/3 local runs; the cut is refused with `capacity_below_confirmed` when the seats filled first) |
| Simultaneous submissions (five tabs), limit race | one active submission | `applications.sh` | Pass |
| Two autosaves of one draft | no silent overwrite | `integrity.sh` | One kept, the other `draft_conflict` |
| Two bookings of one interview slot | one reservation | `review.sh` | Pass |
| Opposite recruitment decisions, double release, five tabs accepting | no contradictory final state | `review.sh` | Pass |
| Two governance transitions at once | one open transition | `integrity.sh` | One opened, one `transition_conflict` |
| Several notification workers | each delivery claimed once | `notifications.sh` | Pass |
| A job started twice, five checkers, two Storage workers | no double run, no double claim | `continuity.sh` | Pass |
| Repeated retention / reconciliation | idempotent | `continuity.test`, `privacy.test` (second reconciliation: 0) | Pass |
| Concurrent revocation and mutation | no mutation after the revocation | `security_matrix.test` (sequential: next call refused) | Checks are made inside each transaction against committed mandates; a call that started before the revocation committed is ordered before it. Not scripted in parallel |

## Failure and recovery (brief §111)

| Failure | Expected | Evidence | Result |
|---|---|---|---|
| E-mail provider unavailable | business action stays committed, delivery retried | `notifications.test` §5 (retries, unknown outcomes, provider events); the action and the notification are separate rows | Pass |
| Upload interrupted | no final document without its file | `recruitment.test` (reserve → upload → confirm; unconfirmed reservations removed after a day, file queued) | Pass |
| Worker crashes | task recoverable | claims are leased (Storage cleanup 5 min, deliveries) and given back (`continuity.sh`, `notifications.test`) | Pass |
| Search query fails | clear error, no invented results | the dialog says "La recherche ne répond pas." | Pass (code review) |
| Session expires / ends | no privilege bypass | D10 fixed: refused at the database and treated as signed out | Pass |
| Notification retried | no uncontrolled duplicate | idempotent keys (`notifications.test` §3, `notifications.sh` case 2) | Pass |
| Event changes before its reminder | the old reminder is not sent | `notifications.test` §7 | Pass |
| Reviewer revoked mid-session | next access refused | `security_matrix.test`, `recruitment_review.test` | Pass |
| Migration fails | stop, fix forward | CI resets from scratch on every push; `docs/backend/supabase-workflow.md`: `db push --dry-run` first, fix forward with a new migration (Phase 15 pushes to dev were also checked by comparing the recorded statements' md5 with the file) | Documented |
| Restore misses Storage objects | gap detected, not reported healthy | Restored files no row points to are queued (`queue_storage_orphans`); the register shows backup checks as declarations only | Partly: files missing *after* a restore are not detected automatically |
| Statistics out of date | staleness visible | `analytics_daily` rebuilt hourly; job health from last success (`continuity.test` §8) | Pass |
| Privacy cleanup partly fails | retry tracked | Storage queue with attempts; a request cannot complete while files wait (`privacy.test`) | Pass |

## Backup and restore (brief §64, §92–§93)

- **Executed:** a real `pg_dump -Fc` / `pg_restore` of the local check database into a new database
  (`supabase/tests/restore/restore-drill.sh`, 18 checks): records come back, row-level security and grants are
  identical, job definitions return, and an erasure made after the backup is re-applied once the off-database
  copy of the ledger is imported (D1).
- **Not executed:** a restore of a Supabase backup (the dev project is on a free plan without backups) and a
  restore of Storage objects. Supabase database backups do not contain Storage files. Both remain **unverified**
  until the production project exists (Phase 16, `docs/operations/backups-and-restore.md`).

## Workers and scheduled jobs

Every recurring task is a `scheduled_jobs` key run by pg_cron through `private.run_scheduled_job`; health is the age
of the last success; `/api/health` and `platform_heartbeat` let an outside monitor watch it (not yet subscribed).
Workers (`notifications-worker`, `storage-cleanup`) authenticate with Vault tokens; on dev the Storage cleanup
tokens are not created yet (F5), so queued files are not deleted there.

## Time zones

Institution time zone Europe/Paris; instants stored as `timestamptz`; `timezone.test.sql` (22 checks): 23- and
25-hour days, the privacy deadline across month ends and clock changes and in any session time zone, mandates ending
at their exact instant, a campaign closing at its instant. Browser tests run with `timezoneId: Europe/Paris`.

## Observability

Job failures, delivery failures and governance issues are visible on the platform's continuity pages; the audit log
records governance and privacy actions without names or e-mails; server logs carry codes, not values. There is
**no external error monitoring** (Sentry or similar): a choice for Phase 16 — if one is added, it must not receive
CVs, answers or personal data, and it is a processor to declare.
