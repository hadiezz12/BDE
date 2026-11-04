# Personal-data inventory

Built from the migrations, the Storage buckets, the Edge Functions and the
site's code (Phase 14 audit, 3–4 November 2026). Legal bases are in
`processing-register.md` (all **À VALIDER**). "Retention" is what the site
does today: every configurable period is still **undecided** (null = kept),
see `retention-schedule.md`.

**Classification** (a handling scheme, not a legal category):
**P** public · **PE** personal · **C** confidential · **HR** highly restricted.

**Region**: the development project runs in Supabase `eu-west-3` (Paris).
The production project, its region and the site's host are not chosen yet
(launch blocker).

**Backups**: database backups (provider, plan-dependent, see
`docs/operations/backups-and-restore.md`) contain every table below for
their own retention; they never contain Storage files. Erasures are re-applied
after a restore (`private.reconcile_erasures`).

| Category | Where | Purpose | Subjects | Source | Who sees it | Retention today | Deletion | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| School e-mail, sign-in identifiers | `auth.users.email`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens` | Sign-in by e-mail code | Students | The student | The person; the privacy officer (to answer a request); never other users | Until erasure | Erasure: e-mail removed, identities/sessions/tokens deleted, account banned and soft-deleted | PE |
| MFA factors | `auth.mfa_factors` | Second factor for sensitive actions | Officers, students who enable it | The person | Nobody (secrets held by Supabase Auth) | Until removed or erasure | Erasure deletes them | HR |
| Profile (first/last/display name, programme, year, photo path) | `public.profiles`; photo in bucket `avatars` (`<uid>/<uuid>.ext`) | Identify the person to their teams | Students | The student (programme, year, photo optional) | Teams the person belongs to; public team pages only with the member's own consent | Until erasure | Erasure: names become "Compte supprimé", photo queued for Storage deletion | PE |
| Memberships, positions, mandates, delegations, invitations | `memberships`, `position_assignments`, `delegations`, `organization_invitations` (stores the invited e-mail), `leadership_transitions*`, `platform_assignments` | Run association teams and the BDE; continuity | Members, officers, invitees | Officers, the person | The association's officers with the key; the BDE for governance continuity | Kept (history); invitations: policy `organization_invitations_closed` (undecided) | Erasure ends active ones; rows stay pseudonymous ("Compte supprimé"); invitations to the person deleted or anonymised | PE |
| Public team presentation (bio, photo shown) | `membership_public_profiles`, `association_team_entries` | Public team page | Members | The member (consent) | Public, only if the member chose it | Until withdrawn or erasure | Member's own switch; erasure deletes | P/PE |
| Event registrations and waiting lists | `event_registrations` (status, reference, timestamps, cancel reason) | Organise events, seats, reminders | Students | The student | The organising association (names only, `event_attendees`); BDE: counts only | Policy `event_registrations_past` (undecided) | Retention job (holds respected); erasure | PE |
| Attendance | — | — | — | Not collected | — | — | — | — |
| Applications, answers, snapshot | `applications.answers`, `applications.candidate_snapshot`, `application_events` | Association recruitment | Candidates | The candidate | Candidate; association leadership and committee members within their scope (`private.application_can`); never the BDE or the guardian | Recruitment settings (Phase 8, undecided) | Retention purge (holds respected); erasure; officer can erase one application | C |
| CVs and documents | bucket `recruitment-documents` (`applications/<app>/<uuid>`), metadata `application_documents` | Recruitment | Candidates | The candidate | As applications; download only as attachment, recorded | As applications | Row deletion queues the object; `storage-cleanup` worker deletes it | C |
| Evaluations, notes, comments, interviews, decisions, offers | `recruitment_reviews`(+`_revisions`), `application_comments`, `recruitment_interviews`, `recruitment_decisions`, `recruitment_offers`, `application_pipeline`, `recruitment_clarifications` | Select candidates | Candidates (about), reviewers (authors) | Reviewers, committees | Committee within scope; candidate sees only `candidate_status`; access requests assessed by the officer (names removed) | Leave with the application | Cascade with the application | HR |
| Document/application access log | `application_access_log` | Accountability of who opened what | Reviewers (actors), candidates (about) | The site | Officers via the audit; the privacy officer | Policy `application_access_log` (undecided, ≥ 12 months) | Retention job only (append-only otherwise) | C |
| Notifications and e-mail deliveries | `notifications.payload`, `notification_deliveries`, `notification_email_captures` (capture mode bodies), `notification_suppressions.email_hash` | Inform the person | All users | The site | The recipient; the BDE sees delivery health without content or address | Policies `notifications_*`, `notification_deliveries` (undecided); captures 7 days, attempts 30 days (fixed) | Retention job; erasure | PE |
| Notification choices and follows | `notification_preferences`, `notification_settings`, `notification_follows`, `notification_preference_changes` | Respect the person's choices | All users | The person | The person | Until erasure; changes: policy (undecided) | Erasure | PE |
| Saved items, interests | `saved_items`, `student_interests` | The person's own shortcuts and suggestions | Students | The person | The person only | Until removed or erasure | Erasure | PE |
| Content reports | `content_reports` (reporter id, reason, details) | Moderation | Reporters | The reporter | BDE moderators (never the reporter's identity in the interface) | Policy `content_reports_resolved` (undecided) | Retention job; erasure unlinks the reporter | C |
| Governance audit log | `governance_audit_events` (actor, subject, action, details without e-mails) | Accountability, security | Officers, members concerned | The site | Officers with `audit.view` / `platform.audit.view` | Policy `governance_audit_events` (undecided, ≥ 12 months) | Retention job only (append-only otherwise); after erasure, actor/subject stay as a pseudonymous id | C |
| Governance issues | `governance_issues` (may reference a subject user) | Continuity alerts | Officers | The site | Officers, guardian (BDE availability only) | Policy `governance_issues_resolved` (undecided) | Retention job; erasure deletes the person's | PE |
| Data-subject requests | `privacy_requests`, `privacy_request_events`, `privacy_request_artifacts` (exports, 14 days) | Answer rights requests | Requesters | The person, the officer | The requester (own) and the privacy officer only | Exports purged at 14 days (job); requests: policy `privacy_requests_closed` (undecided) | Job; retention | C |
| Erasure ledger | `private.erasure_ledger` (one-way key, date, request reference) | Re-apply erasures after a restore | Erased persons (pseudonymous) | The site | Nobody through the API | Kept as long as backups that predate the erasure may be restored | Manual, once no such backup remains | PE |
| Retention holds | `retention_holds` | Narrow exceptions to deletion | Persons or records held | The officer | The privacy officer | Until released or past review date (≤ 1 year) | Release | C |
| Incidents and breach assessments | `operational_incidents` (+ breach fields), `operational_incident_updates` | Incident and breach register | Officers (authors) | Officers | BDE operations; the privacy officer | Kept (documentation of breaches) | — | C |
| Recruitment form privacy reviews | `recruitment_form_privacy_reviews` | Justify sensitive questions | Officers (authors) | Officers | The privacy officer, the association | With the form version | Cascade | PE |
| Statistics | `private.analytics_daily` (counts only) | Association and BDE statistics | — (no person) | The site | Through suppression-checked functions | Kept | — | P |
| Server logs | Next.js host logs, Supabase logs | Operations | All users | Host/provider | Technical owner | Provider's retention (to document) | Provider | C |
| Browser storage | Cookies `sb-…-auth-token`, `vpc-theme` | Session, theme | Visitors, users | The browser | — | 400 days max / 1 year | Sign-out / user | PE |
| VSS / VDH alert form | — | — | — | **Not collected** (demonstration only, nothing is sent) | — | — | — | (would be HR) |

**Not collected anywhere:** home address, date of birth, phone, government
id, payment data, attendance, page views, device fingerprints, IP addresses
in application tables. Recruitment forms may ask for some of these only with a
recorded justification (`recruitment_form_privacy_reviews`).
