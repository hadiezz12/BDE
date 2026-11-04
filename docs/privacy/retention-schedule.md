# Retention schedule

**No configurable period is decided yet**: every policy below is `null`,
which means *kept, nothing deleted automatically* (Phase 11 rule: no default
invented in code). Deciding them is a **launch blocker** for the controller.
How the mechanism works: `docs/operations/retention.md`.

**Approval:** a period is set by a BDE office (`platform.organizations.manage`,
second factor) with `set_retention_policy`, which now **requires the
decision's reference** (who decided, when — 10 characters at least) and
shows what would be deleted first (dry run); a deletion needs the previewed
count repeated. The audit records every change. The nightly
`data-retention` job deletes at most 5,000 rows per policy per night.

**Holds:** `retention_holds` (privacy officer) exclude a person, an
application, a campaign, an event or an association from the jobs and from
erasure, with a purpose, a basis, who decided and a review date at most a
year away. Past that date the hold stops applying.

**Backups:** whatever is deleted stays in database backups for the
provider's retention (plan-dependent); erasures are re-applied after a
restore. Storage copies are the technical owner's (encrypted) and follow the
same decisions.

| Dataset | Policy / rule | Trigger | Deletion | Current | Proposal for discussion (not decided) |
| --- | --- | --- | --- | --- | --- |
| Notifications read / archived / any | `notifications_read`, `notifications_archived`, `notifications_any` | read / archived / created | Row deletion | null | e.g. a few months after reading |
| E-mail deliveries | `notification_deliveries` | finished | Row deletion | null | e.g. 3–6 months (delivery disputes) |
| Preference changes, cleared suppressions | `notification_preference_changes`, `notification_suppressions_cleared` | created / cleared | Row deletion | null | — |
| Past event registrations | `event_registrations_past` | event end | Row deletion (holds respected) | null | e.g. end of the academic year |
| Resolved governance issues | `governance_issues_resolved` | resolved | Row deletion | null | — |
| Closed privacy requests | `privacy_requests_closed` | completed / refused / withdrawn | Row deletion (events and exports cascade) | null | Long enough to prove the answer (to decide) |
| Closed invitations (hold the invited e-mail) | `organization_invitations_closed` | response or expiry | Row deletion | null | — |
| Resolved content reports | `content_reports_resolved` | resolved | Row deletion | null | — |
| Access log of applications and files | `application_access_log` | opened | Retention job only, **12 months minimum** | null | — |
| Governance audit log | `governance_audit_events` | action | Retention job only, **12 months minimum** | null | Accountability needs vs. data minimisation |
| Recruitment: drafts, withdrawn, not selected, selected | `recruitment_settings` (Phase 8) | campaign end / withdrawal | `purge-recruitment-data` deletes applications with everything evaluated about them and queues files (holds respected) | null | CNIL's recruitment guide (employment context) is a reference to adapt, not a rule here |
| Exports for a request | fixed | creation | Payload purged after **14 days** by `privacy-housekeeping` | 14 days | — |
| Technical logs (delivery attempts, provider events, e-mail captures, worker runs, unsubscribe tokens, broadcast recipients, job runs, cron details) | fixed housekeeping | — | Row deletion | 7–30 days | — |
| Uploads never confirmed | fixed | upload | Marked removed after 1 day, file queued | 1 day | — |
| Accounts | none | — | Erasure on request only | Kept | An inactivity rule (with warning) is a controller decision |
| Erasure ledger | none | — | Manual | Kept | Until no backup older than the erasure can be restored |
| Incident / breach register | none (art. 33(5) documentation) | — | — | Kept | To decide with the controller |

**Future recruitment pools:** not implemented. Unsuccessful candidates are
never reused for a later campaign; an opt-in pool would be a separate
purpose with its own notice and consent.
