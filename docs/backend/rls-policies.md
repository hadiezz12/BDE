# Row level security, grants and the RPC surface (Phase 4)

Every table in `public` has RLS enabled in the migration that creates it. The governance tables are
**read-only for the API roles**: `authenticated` has SELECT (filtered by the policies below) and no
INSERT, UPDATE or DELETE on any of them; `anon` reads only public organization columns. All writes go
through `security definer` functions (last section). Phase 3's profile and avatar policies are
unchanged.

Helpers used by the policies (all in `private`, `security definer`, `search_path = ''`, answering
about the **caller** only, wrapped in `(select …)` so Postgres evaluates them once per statement):

| Helper | Returns |
| --- | --- |
| `private.mfa_requirement_met()` (Phase 3) | false when the caller enrolled a factor but the session is aal1 |
| `private.has_organization_permission(org, key)` | the caller holds `key` in `org` now |
| `private.has_platform_permission(key)` | the caller holds the platform key now |
| `private.my_organization_ids_with(key)` | organizations where the caller holds `key` now |
| `private.my_open_organization_ids()` | organizations where the caller has an open membership |
| `private.my_transition_ids()` | transitions where the caller is the proposer, a candidate or an approver |
| `private.current_user_email()` | the caller's e-mail (for invitations bound to an address) |

These seven, plus the page and content helpers named in the Phase 5 and Phase 6 sections below,
are the only private functions `authenticated` may execute (checked by `foundation.test.sql`);
every other private function is revoked from `public`, `anon`, `authenticated` and
`service_role`.

## Policies by table

| Table | Who reads what |
| --- | --- |
| `organizations` | everyone (`anon` too): `active` and `archived` rows, public columns only (column grants; `created_by`, `status_reason` never granted); members: their own organizations whatever the status; platform governance (BDE leadership, guardian): all. Restrictive: an enrolled-MFA aal1 session sees only active/archived ones. |
| `memberships` | your own; the whole team of organizations where you have `members.view`. |
| `permissions`, `position_templates`, `position_template_permissions`, `platform_role_permissions` | every signed-in person (the catalog is not secret). |
| `positions`, `position_permissions` | members of the organization; platform governance. |
| `position_assignments` | your own mandates; the team's where you have `members.view`; **office** mandates of every organization for platform governance. |
| `platform_assignments` | your own; platform governance. |
| `delegations`, `delegation_permissions` | the lender and the borrower; the team where you have `members.view`. |
| `organization_invitations` | the invitee (by e-mail); the team where you have `members.invite`. |
| `leadership_transitions` (+ candidates, approvals) | the parties; organizations where you have `governance.view`; platform governance. |
| `governance_audit_events` | organizations where you have `audit.view`; all for `platform.audit.view`; leadership, recovery, bootstrap and organization events for the guardian (`platform.recovery`); events where you are the actor or the subject. |

Every governance table except the catalog also has a **restrictive** policy
`<table>_require_mfa_when_enrolled` (`private.mfa_requirement_met()`): a half-finished sign-in reads
nothing, as in Phase 3.

Several permissive SELECT policies per table (own / team / platform) are kept on purpose: each says
one rule in one line, which is easier to review than one long `or`. The Supabase advisor's "multiple
permissive policies" performance warning is accepted for that reason (decision D22); the volumes
here are small (a few hundred associations, a few thousand memberships).

## Grants

- `anon`: SELECT on the public columns of `organizations`; nothing else; no function.
- `authenticated`: SELECT on the governance tables (through the policies); EXECUTE on the seven
  private helpers above and on the `public` governance functions; no table writes.
- `service_role`: nothing new. No server code uses the secret key for governance; there is no
  admin bypass in the application.
- `postgres` (the project owner, SQL editor only): `private.bootstrap_governance`,
  `private.provision_guardian`.

## The RPC surface

Each function below is `security definer` with `search_path = ''`, executable by `authenticated`
only, and starts by identifying the caller (`private.require_actor`, which also enforces
`mfa_requirement_met`). It then checks the caller's right in the target organization (never a
client-supplied flag), the second factor where needed, the ceiling, dates and states; writes in
one transaction; and calls `private.log_governance_event`.

| Function | Right checked | aal2 |
| --- | --- | --- |
| `create_organization` | `platform.organizations.manage` | ✓ |
| `set_organization_status` | `platform.organizations.manage` | ✓ |
| `create_position`, `update_position`, `archive_position` | `positions.manage` + ceiling | ✓ |
| `assign_position` | `positions.assign` + ceiling | ✓ (when the position carries keys) |
| `end_assignment` | `positions.assign` (ordinary positions only) | |
| `set_membership_status` | `members.manage` (or yourself, to leave) | |
| `invite_member` | `members.invite` (+ `positions.assign` and ceiling with a position) | ✓ (with a position) |
| `revoke_invitation` | `members.invite` | |
| `respond_to_invitation` | the invitee's e-mail; the inviter's rights re-checked | |
| `create_delegation` | `delegations.manage` + the lender's own position keys | ✓ |
| `revoke_delegation` | lender, borrower or `delegations.manage` | |
| `propose_association_succession` | sitting president + `governance.succession` | ✓ |
| `propose_association_appointment` | `platform.associations.intervene` + reason | ✓ |
| `propose_bde_succession` | sitting BDE president or vice-president | ✓ |
| `propose_bde_recovery` | `platform.recovery` + reason, vacant office only | ✓ |
| `respond_to_leadership_candidacy` | the candidate | ✓ |
| `approve_bde_succession` | sitting BDE officer, or the guardian for a vacant office | ✓ |
| `withdraw_bde_approval`, `cancel_leadership_transition` | the approver; the proposer, BDE or guardian per kind | |
| `end_office_mandate` | association office: `platform.associations.intervene`; BDE office: guardian; + reason | ✓ |
| `my_access`, `organization_team`, `member_access`, `organization_governance`, `governance_overview`, `platform_organizations`, `my_governance_inbox`, `governance_history` | read functions; each checks its own right and returns only what the caller may see | |

Errors are raised as SQLSTATE `P0001` with a short code as message (`insufficient_permission`,
`permission_ceiling`, `mfa_required`, `office_occupied`…); the interface maps each code to a French
sentence (`src/lib/governance/messages.ts`) and never shows Postgres text.

The Supabase security advisor lists each of these as "authenticated can execute a SECURITY DEFINER
function". That is the intended API (decision D21): every one checks authority itself, and the
pgTAP suite calls each as unauthorized users to prove the refusal.

## Phase 5: association pages

Tables (`association_categories`, `association_pages`, `association_profiles`,
`association_gallery_items`, `association_team_entries`, `association_media`,
`membership_public_profiles`, `organization_slug_history`) are read-only for the API roles too.

| Table | Who reads what |
| --- | --- |
| `association_categories` | everyone (`anon` too): active categories; BDE leadership (`platform.organizations.manage`): all. |
| `association_pages` | the page team (`private.my_page_organization_ids()`: holders of `organization.settings.update`, `organization.page.publish` or `media.manage` there, now); platform governance. |
| `association_profiles`, `association_gallery_items`, `association_team_entries`, `association_media` | the page team only (draft and published rows). |
| `membership_public_profiles` | the member themself; the page team. |
| `organization_slug_history` | nobody directly (functions only). |

Each has the restrictive `_require_mfa_when_enrolled` policy. Visitors never read these tables:
`public_associations`, `public_association(slug)`, `public_association_categories` and
`public_portrait_path` (granted to `anon`) return only published, public fields of public pages.

Storage, bucket `association-media` (private): insert by `media.manage` holders into their
organization's folder; select by the page team, or by anyone when
`private.association_media_object_is_public(name)` (a public page uses the image); delete only a
file whose library row is removed or missing. `avatars` gains a select policy for portraits a
member agreed to show on a public team (`private.portrait_object_is_public`). Those two helpers and
`private.association_media_organization` are the only private functions `anon` may execute
(`grant usage on schema private to anon`), checked by `foundation.test.sql`.

New RPCs (same pattern as above, details in [association-pages.md](association-pages.md#who-may-do-what)):
`save_association_draft`, `set_association_gallery`, `set_association_team_presentation`,
`publish_association_page` (aal2), `unpublish_association_page`, `change_organization_slug` (aal2),
`withhold_association_page` / `release_association_page` (aal2), `register_association_media`,
`update_association_media`, `remove_association_media`, `set_my_public_team_profile`,
`renew_invitation`, `create_association_category` / `update_association_category` (aal2), and the
reads `association_editor`, `association_preview`. `create_organization` and
`platform_organizations` were redefined (category goes to the draft; page status in the list).

## Phase 6: publishing

Tables `post_categories`, `organization_editorial_settings`, `posts`, `post_revisions`,
`post_reviews`, `post_revision_media`, `post_slug_history` and `content_reports` are read-only for
the API roles as well: every privilege is revoked from `anon` and `authenticated`, then SELECT is
granted back where a policy below allows reading. Writes go only through the functions listed
further down. A trigger freezes a revision's content once it is no longer a draft
(`freeze_submitted_revision`, `revision_locked`) and another keeps a post's organization and
author (`keep_post_organization`, `post_owner_locked`), whoever runs the update.

New private helpers, `security definer`, answering about the caller only, granted to
`authenticated`:

| Helper | Returns |
| --- | --- |
| `private.my_post_editor_organization_ids()` | organizations where the caller holds `posts.edit`, `posts.approve` or `posts.publish` now (they see every post there) |
| `private.my_readable_post_ids()` | posts of those organizations, plus the posts the caller started where they hold `posts.create` |
| `private.my_media_organization_ids()` | organizations whose image library the caller may look at: the page team (Phase 5) and anyone holding `posts.create`, `posts.edit`, `posts.approve` or `posts.publish` there |

| Table | Who reads what |
| --- | --- |
| `post_categories` | everyone (`anon` too): active rubriques; BDE leadership (`platform.organizations.manage`): all. |
| `organization_editorial_settings` | the content team: `my_post_editor_organization_ids()` and holders of `posts.create`. |
| `posts`, `post_revisions`, `post_reviews`, `post_revision_media` | posts in `my_readable_post_ids()` only (editors, approvers and publishers: the whole association; an author with `posts.create` alone: their own posts). |
| `post_slug_history` | nobody directly: no grant, functions only. |
| `content_reports` | the reporter, for their own reports (every column, including status and closing note); nobody else, not even moderators, who read through `moderation_queue`. |

Each table except `post_categories` and `post_slug_history` also has the restrictive
`<table>_require_mfa_when_enrolled` policy. Visitors never read these tables (`anon` gets
`42501`, tested). No policy reads by platform key: BDE leadership sees another association's
posts only through `moderation_queue` / `moderated_post` (published content), and the continuity
guardian reads none of them (tested, tables and `post_editor`).

Phase 5 policies changed:

- `association_media`: `association_media_read_page_team` became
  `association_media_read_content_team` (`my_media_organization_ids()`), so authors see the
  library they pick images from.
- Storage, bucket `association-media`: `association_media_select_team` now uses
  `my_media_organization_ids()` (draft images for the content team);
  `association_media_insert` accepts `posts.create` as well as `media.manage`;
  `private.association_media_object_is_public(name)` (the visitor's select policy) also answers
  yes for an image of the live revision of a public post. Delete is unchanged.

`private.can_upload_media(user, organization)` (`media.manage` or `posts.create`) is used by
`register_association_media` only; it is not granted to any API role.

The RPC surface, same pattern as above (details in [publishing.md](publishing.md#who-may-do-what)).
"Can edit" is `posts.edit` in the post's organization, or `posts.create` and having started the
post.

| Function | Right checked | aal2 |
| --- | --- | --- |
| `create_post` | `posts.create` or `posts.edit` | |
| `save_post_revision`, `submit_post_revision`, `withdraw_post_revision`, `restore_post_revision`, `delete_post_draft` | can edit | |
| `review_post_revision` | `posts.approve`, not a contributor or the submitter | ✓ |
| `publish_post`, `schedule_post` | `posts.publish` + an approved revision (or the working draft under direct publishing) | ✓ |
| `cancel_post_schedule`, `unpublish_post`, `archive_post`, `set_post_pin` | `posts.publish` | |
| `change_post_slug` | `posts.publish` | ✓ |
| `set_editorial_settings` | `posts.settings` | ✓ |
| `set_post_prominence` | `platform.content.feature` | ✓ |
| `report_post` | any signed-in person; the post must be public | |
| `dismiss_report` | `platform.content.moderate` | |
| `hide_post`, `restore_post_visibility` | `platform.content.moderate` + reason | ✓ |
| `create_post_category`, `update_post_category` | `platform.organizations.manage` | ✓ |
| `register_association_media` (redefined) | `media.manage` or `posts.create` | |
| `remove_association_media` (redefined) | `media.manage`; refused while any post revision uses the image | |
| `content_dashboard` | any `posts.*` key in the organization (own posts only with `posts.create` alone) | |
| `post_editor`, `post_preview` | can edit, `posts.approve` or `posts.publish` | |
| `moderation_queue`, `moderated_post` | `platform.content.moderate` (published content only, never a reporter) | |

Granted to `anon` and `authenticated`, reading only the live revision of public posts:
`public_posts`, `public_post`, `public_post_facets`, `public_featured_posts`,
`public_association_posts`, `public_post_sitemap`.

The scheduled worker `private.run_scheduled_publications()` is executable by no API role; the
pg_cron job `publish-scheduled-posts` runs it every minute as the database owner
([publishing.md](publishing.md#scheduling)).

## Phase 7: events

Tables `event_categories`, `events`, `event_coorganizers`, `event_slug_history`,
`event_registrations`, `event_bookmarks` and `notification_outbox` are read-only for the API
roles: writes go only through the event functions ([events.md](events.md)). Policies:

| Table | Who reads |
| --- | --- |
| `event_categories` | everyone the active ones; `platform.organizations.manage` all |
| `events`, `event_coorganizers` | the event's team (`events.edit`, `events.publish`; an author their own drafts). Visitors read through `public_events` / `public_event` only |
| `event_registrations` | the student their own rows. Teams read through `event_attendees` (`events.attendees.view`) |
| `event_bookmarks` | the student their own rows |
| `notification_outbox` (renamed `notifications` in Phase 10) | the recipient their own rows (no write: `mark_notifications_read`) |

Each has a restrictive policy requiring the second factor when the person enrolled one. New
private helpers, `security definer`, about the caller only: `private.my_event_team_organization_ids()`,
`private.my_readable_event_ids()`. Granted to `anon` and `authenticated`: `public_events`,
`public_event`, `public_event_facets`, `public_featured_events`, `public_association_events`,
`public_series_events`, `public_event_sitemap`. Granted to `service_role` only:
`claim_notification_emails`, `complete_notification_email`. The reminders function is executable
by no API role; the pg_cron job `enqueue-event-reminders` runs it every 15 minutes.

## Phase 8: recruitment

Tables `recruitment_campaigns`, `recruitment_campaign_slug_history`, `recruitment_positions`,
`recruitment_form_versions`, `applications`, `application_events`, `application_documents` and
`recruitment_settings` are read-only for the API roles: writes go only through the recruitment
functions ([recruitment.md](recruitment.md)). `private.storage_cleanup_queue` is not exposed.
Policies:

| Table | Who reads |
| --- | --- |
| `recruitment_campaigns`, `recruitment_positions`, `recruitment_form_versions` | the campaign's team (`recruitment.*` in its association). Visitors read through `public_recruitment_*` only |
| `applications`, `application_events`, `application_documents` | **the candidate only**, their own rows. Teams and the BDE read counts through `recruitment_dashboard`, `recruitment_editor`, `platform_recruitment` |
| `recruitment_settings` | everyone (the privacy notice is public) |

Storage, bucket `recruitment-documents` (private): insert only a path the caller reserved for
their own draft (`private.can_upload_application_document`), read and delete only their own
documents (`can_read_application_document`, `can_delete_application_document`). No organizer,
BDE or guardian policy. Each table has a restrictive policy requiring the second factor when the
person enrolled one. Private helpers granted to `authenticated` (caller only):
`private.my_recruitment_organization_ids()`, `private.my_application_ids()` and the three
document helpers. Granted to `anon` and `authenticated`: `public_recruitment_campaigns`,
`public_recruitment_campaign`, `public_recruitment_position`, `public_recruitment_facets`,
`public_association_recruitment`, `public_recruitment_sitemap`, `public_recruitment_privacy`.
Granted to `service_role` only: `claim_storage_cleanup`, `complete_storage_cleanup`. The
reminders and purge functions are executable by no API role; pg_cron runs them.

## Phase 9: review, interviews, decisions

Every Phase 9 table has RLS enabled, **no policy and no grant** for `anon` and `authenticated`:
`recruitment_committee_members`, `recruitment_committee_positions`,
`recruitment_review_assignments`, `application_pipeline`, `recruitment_rubric_versions`,
`recruitment_reviews`, `recruitment_review_revisions`, `recruitment_conflicts`,
`recruitment_tags`, `application_tags`, `application_comments`, `recruitment_clarifications`,
`recruitment_interview_slots`, `recruitment_slot_interviewers`, `recruitment_interviews`,
`recruitment_decisions`, `recruitment_decision_approvals`, `recruitment_offers`,
`recruitment_message_templates`, `application_activity`, `application_access_log`. They are read
and written only through the `security definer` functions of
[recruitment-review.md](recruitment-review.md), each of which asks
`private.application_can(user, application, power)` (or `private.campaign_can`) row by row:
nothing is fetched and then filtered in the app. The Phase 8 candidate-only policies on
`applications`, `application_events` and `application_documents` are unchanged; reviewers never
read those tables directly.

Storage, bucket `recruitment-documents`: the read policy
(`private.can_read_application_document`) also lets a team member read **one** file for two
minutes after `public.recruitment_document` checked their `documents` power and recorded the
opening in `application_access_log`, and checks that power again at read time. Reviewers have no
other Storage access (no listing, no upload, no delete), and no privileged key is involved.

`application_activity` and `application_access_log` are append-only (`private.forbid_record_rewrite`;
only the cascade of an erased application removes them). The governance audit gets one line per
material step, with no candidate identity and no outcome.

## Performance (brief §61)

- Policies call the helpers through `(select …)` subqueries (initPlan, once per statement).
- The helpers hit composite indexes: assignments by `(user_id, organization_id)`, memberships by
  user and by the one-open-membership unique index, delegations by
  `(delegate_user_id, organization_id)`, the audit log by `(organization_id, occurred_at)` and
  `(category, occurred_at)`; the exclusion constraints' GiST indexes serve the period checks; every
  foreign key is covered (`20261019141733_index_governance_foreign_keys.sql`).
- Lists are built server-side in one function call per screen (no per-row policy round trips from
  the client).

## Phase 10: notifications

Every Phase 10 table has RLS enabled and no write grant for the API roles ([notifications.md](notifications.md)).

| Table | Who reads |
| --- | --- |
| `notification_topics`, `notification_types` | everyone (the catalog's public words) |
| `notifications` | the recipient, own rows (Phase 7 policy kept, renamed `notifications_read_own`; MFA restrictive policy) — also in the `supabase_realtime` publication, which applies RLS |
| `notification_preferences`, `notification_settings`, `notification_preference_changes`, `notification_follows` | the person, own rows (MFA restrictive policies) |
| `notification_deliveries`, `notification_delivery_attempts`, `notification_provider_events`, `notification_suppressions`, `notification_unsubscribe_tokens`, `notification_broadcasts`, `notification_broadcast_recipients`, `notification_config`, `notification_worker_runs`, `notification_email_captures` | nobody through the API |

Granted to `authenticated`: `my_notifications`, `my_notification_summary`, `mark_notifications_read`,
`archive_notifications`, `open_notification`, `my_notification_preferences`,
`set_notification_preference`, `set_notification_settings`, `follow_organization`, `am_i_following`,
`clear_my_email_suppression` (own rows only); `notification_broadcast_options`,
`create_notification_broadcast`, `submit_notification_broadcast`, `approve_notification_broadcast`,
`cancel_notification_broadcast`, `organization_broadcasts` (`communications.send` or
`platform.communications.broadcast`); `notification_health`, `notification_failed_deliveries`,
`retry_notification_delivery` (`platform.communications.monitor`). Granted to `anon` and
`authenticated`: `peek_unsubscribe_token`, `unsubscribe_with_token` (the token is the proof).
Every `private.*` function of Phase 10 is revoked from `public`, `anon`, `authenticated` and
`service_role`: the worker and the jobs run them as the owner. The Phase 7 functions
`claim_notification_emails` and `complete_notification_email` are dropped. Jobs:
`notifications-dispatch` (every minute), `notification-reminders` (every 15 minutes, replaces
`enqueue-event-reminders`), `notification-retention` (03:40).
