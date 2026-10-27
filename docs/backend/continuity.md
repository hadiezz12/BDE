# Continuity (Phase 11)

How the platform keeps working when the teams change every year, without
anyone holding a power the governance did not give them. Read
`authorization.md`, `leadership-transitions.md` and `notifications.md` first:
this phase adds observation, reminders, preparation and operations around
them. It does not add a way to get a right.

## The rule that does not move

**Rights come from mandates checked at the moment of each action, never from
a job.** `private.user_has_organization_permission`,
`user_has_platform_permission`, `live_committee_member_id` and `guardian_user`
compare `starts_at <= now() < ends_at`. A mandate, a delegation, a committee
appointment or the guardian role stops at its end date with no cleanup job,
even for someone who stays signed in with an old token. An incoming president
gets nothing before the effective time of their transition, then everything
at that instant (the transition wrote both mandates when it completed). A
scheduler that stops delays reminders and publications; it never extends or
grants access.

Nothing in this phase appoints, approves, extends or ends a mandate. The BDE
succession still needs both office holders (or the guardian when one office is
vacant) and the candidates' own acceptance, with the second factor.

## Academic years

`academic_years` (one `current`, no overlap, `planned` → `current` → `closed`)
holds a year's dates, the mandate dates forms suggest, a handover start,
reference recruitment dates and the mandate-reminder offsets (60, 30, 14, 7
days by default). The current year was seeded from the site's existing
convention (1 September – 31 August, Paris) and is the BDE's to check.

| Function | Who | What |
|---|---|---|
| `current_academic_year()` | anyone signed in | labels and dates of the current and next year |
| `academic_years()` | `platform.organizations.manage` | every year |
| `save_academic_year(...)` | same + second factor | create a planned year, edit it; the current year keeps its dates |
| `academic_year_preparation(year)` | `platform.organizations.manage` | automatic checks (offices at the start of the year, association presidencies, expiring officers, delegations, invitations, recruitment, scheduled content, guardian, jobs, backups, register, e-mail mode, retention, incidents) and the nine human confirmations |
| `confirm_academic_year_check(year, key, done)` | same | one human confirmation |
| `confirm_academic_year_rollover(year, acknowledge)` | same + second factor | every confirmation done, warnings acknowledged, at most 30 days before the year starts; closes the old year and makes the new one current. **Changes nothing else.** Audited (`rollover_confirmed`). |

Dates entered in forms are Paris days: `startOfParisDay` / `endOfParisDay`
(site) and `private.paris_start_of` (database) turn them into unambiguous
instants, daylight saving included (tested on 25 October 2026 and 28 March
2027).

## Scheduled jobs

Every recurring task runs through `private.run_scheduled_job(key)`, scheduled
by pg_cron as `select private.run_scheduled_job('<key>')`:

- a transaction-level advisory lock per job: a run that starts while the
  previous one still works does nothing and is recorded `skipped`;
- the task in its own subtransaction: a failure rolls its work back and is
  recorded with a short, data-free error (`private.job_error`: SQL state and
  the message cut before any value);
- the outcome on `scheduled_job_runs` (30 days) and a summary on
  `scheduled_jobs` (last start, success, failure, duration, result counts,
  consecutive failures).

`private.execute_job` is a fixed `case`: no function name is read from a
table, no dynamic SQL. The catalog (`scheduled_jobs`) lists ten jobs:
`publish-scheduled-posts`, `notifications-dispatch`, `notification-reminders`,
`recruitment-review-jobs`, `enqueue-recruitment-reminders`,
`governance-health`, `storage-cleanup`, `purge-recruitment-data`,
`data-retention`, `platform-health-report`.

**Health** (`private.job_health`) is measured from the last *success*, never
from the job's existence: late after twice its period plus ten minutes,
failing after three failures in a row, `not_scheduled` when pg_cron has no
active job with the expected command, `unverifiable` without pg_cron (local
databases). It is computed on every read, so a scheduler that stopped
altogether shows on the next visit of the operations page and in the public
heartbeat, without any job having to run.

`retry_scheduled_job(key)` (`platform.operations.monitor`, second factor):
only jobs marked `retryable` (never a deleting one), once per job every two
minutes (a per-job lock makes two simultaneous clicks one run and one
refusal), audited with the person who asked.

**Heartbeat.** `platform_heartbeat()` (anyone) returns
`{database, jobs_on_time, checked_at}`; the site's `GET /api/health` adds
whether sign-in answers and returns 200 or 503. An external uptime monitor
calling it is the independent path of brief §54 (to configure: see
`docs/operations/scheduled-jobs.md`).

## The governance checker

`private.check_governance_health(p_now)` (job `governance-health`, hourly)
calls `private.detect_governance_issues(p_now)` and keeps one open row per
problem in `governance_issues` (`issue_key` unique while open):

| Kind | Severity | Told first | Escalated to |
|---|---|---|---|
| `bde_office_vacant` | critical | the other BDE office holder, or the guardian when both are vacant | guardian (kind `governance_bde_vacancy` for the presidency) |
| `association_president_vacant` | warning | BDE | guardian |
| `succession_missing` (an office ending within 30 days, nothing arranged) | warning, critical within 7 days | the association's `governance.succession` holders / the BDE offices | BDE / guardian |
| `transition_pending` (open 3 days, or close to its start or deadline) | warning / critical | the association / the BDE | BDE / guardian |
| `approver_missing` (articles waiting 2 days that only their author may approve) | warning | the association (BDE when no president) | BDE |
| `reviewer_access_expiring` (committee access ending within 7 days, applications undecided) | warning | `recruitment.committee.manage` holders | BDE |
| `guardian_missing` | warning | BDE | — |
| `guardian_mfa_missing`, `officer_mfa_missing` | warning | the person only | — |
| `suspended_with_pending` | info (dashboard only) | — | — |
| `job_unhealthy` | critical for essential jobs | `platform.operations.monitor` holders | — |
| `renewal_due` (a renewal in the register within 30 days) | warning, critical within 7 days | same | — |

Told once when detected; reminded every 7 days (critical: 3), three reminders
at most; escalated once, at once when critical, otherwise after 7 days open.
Recipients are resolved at sending time from current rights
(`private.issue_recipients`), never from a stored list. The notification
(`governance_issue_alert`) carries a `target` (association, platform,
guardian, operations, self) that decides the page it opens. When an issue is
no longer detected it is resolved and its unread alerts leave the
notification centre; a reappearance is a new issue. Detection and resolution
are audited as the `system`'s.

`p_now` exists for the database tests (and the simulation below): no API role
can execute these functions, so no client ever chooses the time of a check.

**Mandate reminders** moved here (`private.enqueue_mandate_reminders`): the
closest offset of the current year only, key
`mandate:<assignment>:<days>:<end epoch>` (compatible with Phase 10's keys),
none when the mandate is renewed, a successor is in place or a transition is
under way.

## Handover

`handover_template_items` (seeded checklists per area: presidence,
communication, événements, recrutement, from brief §36) and
`handover_checklist_items` (per association and academic year: done, note,
the member who takes it on). Each area is ticked by the holders of its key
(`private.handover_area_key`: `governance.succession`, `posts.approve`,
`events.edit`, `recruitment.committee.manage`) through `set_handover_item`
(audited). Next to an item, `private.handover_metric` counts live (pending
articles, scheduled posts, upcoming events, committee access…), counts only.

`transfer_review_assignments(campaign, from, to, reason)` moves the
applications a committee member has not reviewed yet (and their upcoming
interviews, when the actor manages interviews) to another live reviewer, by
calling `assign_recruitment_reviews` and `update_interview_slot`: every Phase
9 check applies (scope, conflicts, own application, availability). What
cannot move stays and is reported. Audited with the reason.

## Retention

`retention_policies` (`keep_months`, null = **kept, nothing deleted**):
notifications (read, archived, any), e-mail delivery records, preference
changes, cleared suppressions, registrations of past events, resolved
governance issues. Phase 10's fixed periods on these were invented and are
gone: until the BDE decides, they are kept, and the pages say so.

- `retention_overview()` (BDE or privacy officer): each policy with what it
  would delete now, the recruitment settings' effect (applications and files),
  the technical housekeeping, the last run.
- `preview_retention_policy(key, months)`: a dry run, deletes nothing.
- `set_retention_policy(key, months, note, confirm_count)` (BDE + second
  factor): when the new value would delete rows, `confirm_count` must repeat
  the previewed number. Audited.
- `private.run_retention()` (job `data-retention`, nightly): at most 5 000
  rows per policy per night, then the technical housekeeping (delivery
  attempts and provider events 30 days, test captures 7, worker runs 14,
  used unsubscribe tokens 7, frozen broadcast recipients 30, job runs 30,
  `cron.job_run_details` 7). Records counts only (`retention_cleanup_executed`).

Recruitment retention stays in `recruitment_settings` (Phase 8). Deleted
application documents are queued for Storage deletion by the existing
trigger; see Storage cleanup.

## Storage cleanup

The Edge Function `storage-cleanup` (verify_jwt off) replaces the Next route
of Phase 8, which was never scheduled. The job `storage-cleanup` (every 15
minutes) calls it through pg_net only when files wait, with the Vault secrets
`storage_cleanup_url` and `storage_cleanup_token` (absent = nothing called,
the operations page says "not configured"). The function checks the token
through its database connection, claims a batch (`claim_storage_cleanup`,
leased five minutes: two workers never take the same file, a crash gives it
back), deletes only `recruitment-documents/applications/<uuid>/<uuid>` paths
through the Storage API with the platform's secret key sent as `apikey`, and
reports each outcome. Neither the site nor any API role calls the claim
functions any more; the site has no privileged client.

## Institutional register, backups, incidents

- `institutional_records`: who holds the providers' accounts (Supabase, code,
  hosting, domain, DNS, certificates, e-mail, billing, technical owner,
  privacy contact, recovery procedure, Storage copies), renewal dates, status.
  Only what the code depends on was seeded (Supabase, GitHub, Brevo); the
  rest is for the people who hold the accounts. `private.looks_secret`
  refuses anything that looks like a key, a token, a connection string or a
  password; the audit keeps the line and the status, not the text.
- `backup_verifications`: database backups available, database restore
  tested, Storage copy available, Storage restore tested — each a dated,
  signed declaration (the site cannot see a provider's console). Status:
  never, verified, partial, failed, stale (older than three months before the
  current year began). Database backups never cover Storage objects.
- `operational_incidents` and their updates: title, kind, severity, status,
  impact, who handles it, escalation by kind (in the site's words).

All written through `save_institutional_record`, `record_backup_verification`
(second factor), `open_operational_incident`, `update_operational_incident`
(`platform.operations.monitor`).

## Reads, per audience

| Function | Key | Shows | Never |
|---|---|---|---|
| `governance_health()` | `platform.organizations.manage` | BDE offices, guardian readiness, associations, presidencies ending in 60 days, transitions with what they wait for, issues (not personal ones), the checker's own health | applicants, participants, someone's MFA (a count) |
| `organization_continuity(org)` | the org's `governance.view`, `members.manage` or a handover area key | presidency and successor, transition, officers ending (with `members.view`), counts, the checklist, its issues | another association; applicants |
| `guardian_continuity()` | `platform.recovery` | BDE offices, the BDE transition, BDE issues, own readiness | associations' content, applicants, attendees |
| `platform_operations()` | `platform.operations.monitor` | jobs, queues, incidents, backups, register, technical issues, schema version | secrets, connection strings, provider credentials |
| `security_health()` | same | RLS everywhere, no table writes for API roles, definer functions with a search path, private functions closed (same allowlist as `foundation.test.sql`), office overlap guard, BDE offices, one guardian, officers without MFA (count), schema version | object contents |
| `continuity_handover_report()` | `platform.organizations.manage` | the printable handover report | CVs, notes, attendees |
| `account_responsibilities(email)` | `platform.privacy.requests` + second factor | what an account still holds before an erasure (audited) | applications |
| `platform_heartbeat()` | anyone | three booleans | anything else |

The weekly `platform-health-report` job sends `platform_health_report` (counts
only) to the BDE offices, Monday 07:00 UTC.

## Tests

- `supabase/tests/database/continuity.test.sql` (164 checks): the §116
  matrix and the §107–115 simulations (handover with future effective time,
  both BDE mandates over with nobody approved, reminders and their dedupe,
  escalation and resolution, rollover fingerprint, job failure and recovery,
  retention preview/confirm/idempotence, register refusals, reads per
  audience, daylight saving).
- `supabase/tests/concurrency/continuity.sh`: a job started twice, five
  checkers at once, two storage workers, a double retry (CI step).
- `src/lib/continuity/continuity.test.mjs`: every key has its words, every
  alert says something specific, the schema version constant is the last
  migration.
- `e2e/continuity.spec.ts`.

Phase 4 rules (dual approval, same person twice, candidate acceptance,
recovery limits) and Phase 9 rules (seal, committee expiry, no inherited
reviewer access) keep their own tests in `governance.test.sql` and
`recruitment_review.test.sql`.
