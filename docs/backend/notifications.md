# Notifications and e-mail (Phase 10)

One notification system for the whole platform: a catalog of message types, one entry point that
every producer calls, an in-app notification centre, e-mail delivery by a Supabase Edge Function,
each person's choices, scheduled reminders, BDE and association messages to an audience, and the
BDE's monitoring. **A notification is never an access**: every page it leads to checks the person's
rights again, and a notification row grants nothing.

Migrations: `20261027074236_create_notification_center` (tables, catalog, keys, RLS),
`20261027074414_create_notification_functions` (`private.notify`, the centre, choices,
unsubscribe), `20261027074556_create_notification_delivery_functions` (the worker's functions,
provider events, reminders, retention, health), `20261027074754_create_notification_producers`
(broadcasts, the new producers, schedules, privileges), `20261027082914_notification_broadcast_options_fix`.
Tests: `supabase/tests/database/notifications.test.sql` (137), `supabase/tests/concurrency/notifications.sh`,
`src/lib/notifications/notifications.test.mjs`, `e2e/notifications.spec.ts`.

## Audit (what existed before Phase 10)

| Piece | State found |
| --- | --- |
| `notification_outbox` (Phase 7, extended in 8–9) | one row per recipient, mixing the in-app message (`read_at`) and the e-mail state (`email_status`, attempts, backoff) in the same row; unique `dedupe_key`; RLS "read own"; payload snapshot ≤ 4 kB |
| Producers | events (`private.enqueue_notification`, `notify_event_participants`, the day-before reminder), recruitment candidates (`enqueue_application_message`), recruitment team (`enqueue_team_message`) and two inline inserts (committee appointment, assignments). Governance, publishing and account security produced **nothing** |
| E-mail worker | `POST /api/notifications/send` (Next.js, bearer secret, privileged client), transports `log` and `brevo`; **nothing schedules it**, so no e-mail has ever left |
| Words | `src/lib/events/messages.ts`, `src/lib/recruitment/messages.ts`, `src/lib/events/email.ts`, used both by the account pages and the worker |
| Account | `/account/notifications` (real rows, grouped by day, "mark all read"); no header bell; the account nav badge wired to nothing; **preferences were the Phase 1 mock** |
| Supabase | no Edge Function; `pg_net` available, not installed; Vault installed |

## The model

| Table | What it holds | Who reads it |
| --- | --- | --- |
| `notification_topics` | what a person chooses about (12 topics), its class and category, its defaults | everyone (public words) |
| `notification_types` | every kind of message (54), its topic, importance, whether it may be e-mailed, whether it is **confidential** | everyone |
| `notifications` | the in-app notification, one per recipient (the Phase 7 outbox renamed, its rows kept): kind, frozen payload, organization, resource, `read_at`, `archived_at`, unique `dedupe_key` | the recipient, own rows (and the MFA restrictive policy) |
| `notification_deliveries` | one row per channel (e-mail today): status, attempts, next attempt, lease, error code, provider message id, idempotency key | nobody through the API (the worker, the health functions) |
| `notification_delivery_attempts` | each attempt and its outcome | nobody through the API |
| `notification_provider_events` | Brevo's events, once each (`dedupe_key`) | nobody through the API |
| `notification_suppressions` | addresses that must not be e-mailed (hash only), why, when cleared | nobody through the API |
| `notification_preferences`, `notification_settings` | a person's choices per topic; quiet hours | the person, own rows |
| `notification_preference_changes` | the record of every choice (topic, follow, quiet hours, unsubscribe link, suppression cleared) | the person, own rows |
| `notification_follows` | the associations a person follows | the person, own rows |
| `notification_unsubscribe_tokens` | hashes of the one-click tokens (90 days, single use) | nobody through the API |
| `notification_broadcasts`, `notification_broadcast_recipients` | messages to an audience, and the frozen list of recipients | through `organization_broadcasts` only |
| `notification_config` | the delivery mode, the sender, the reply-to, the site's address (one row) | nobody through the API |
| `notification_worker_runs`, `notification_email_captures` | each worker run (counts); test-mode e-mails | nobody through the API |

### Topics and classes

| Class | Topics | In the centre | By e-mail |
| --- | --- | --- | --- |
| **essential** | `account_security`, `governance_actions` (an invitation, a presidency, an approval waiting for you), `event_registration`, `recruitment_candidate` | always | always (cannot be turned off; no unsubscribe link) |
| **operational** | `governance_updates`, `content_workflow`, `event_reminders`, `recruitment_reminders`, `recruitment_team`, `association_messages` | always | on by default, can be turned off |
| **optional** | `bde_announcements`, `followed_updates` | on by default, can be turned off | **off** by default (opt-in) |

`private.notification_choice(user, topic)` applies this; the person's settings page shows it.

## One entry point

`private.notify(recipient, kind, key, payload, organization, resource_type, resource_id,
event_id, application_id, broadcast_id, importance, email)` is the only way a notification is
created. It reads the catalog and the recipient's choices, inserts the in-app row with
`on conflict (dedupe_key) do nothing` (a producer firing twice, two workers, a retried request:
one notification), and queues an e-mail delivery when the type may be e-mailed and the person
wants it. A person who turned an optional topic off entirely gets nothing. The payload is a
snapshot of facts the recipient may already know (titles, dates, names of the people acting);
never an answer, a score, a note, an address or a private joining detail.

Producers:

| Area | Kinds | Where |
| --- | --- | --- |
| Events | registration confirmed, waitlisted, promoted, cancelled, removed, event changed or cancelled, reminder | the event functions (Phase 7), `private.enqueue_notification` |
| Recruitment, candidate | submitted, withdrawn, draft reminder, form updated, campaign cancelled, interview invited/scheduled/moved/cancelled/reminder, questions, offers, outcomes | `private.enqueue_application_message` (Phases 8–9) |
| Recruitment, team | review assigned, mention, answer received, interview booked or reminder, decision to approve, offer accepted/declined, candidate withdrew | `private.enqueue_team_message`, `appoint_recruitment_member`, `assign_recruitment_reviews` |
| Governance | invitation received / answered, presidency proposed, approval required, transition completed or closed, mandate ending (30 and 7 days), BDE presidency vacant (guardian) | triggers on `organization_invitations`, `leadership_transition_candidates`, `leadership_transitions`; the reminders job |
| Account security | second factor enabled / removed; a sensitive position or a platform role given or removed | triggers on `auth.mfa_factors`, `position_assignments` (offices and sensitive keys only), `platform_assignments` |
| Publishing | article to review (on submission; again after 48 h), review done, scheduled publication failed, article hidden / restored by the BDE | triggers on `post_revisions`, `post_reviews`, `posts`; the reminders job |
| Campus | BDE announcement, association message, followed association's message, first publication of a followed association's article, event or recruitment | broadcasts (below) |

The `auth.mfa_factors` trigger is created in a block that tolerates a missing privilege; it exists
on the development project (checked).

## The notification centre

- **Bell** (`src/components/notifications/NotificationBell.tsx`) in the site header and the
  workspace top bar: the unread count (`my_notification_summary`, capped at 100 and shown "99+"),
  and on large screens a panel with the five latest, "Tout marquer comme lu" and "Tout voir". On a
  phone it is a link to the centre; below 400 px the account button carries the count instead
  (there is no room for a fourth icon next to VSS / VDH, search and the account). The count comes
  from the server render, then follows a **realtime** subscription to the person's own rows
  (`notifications` is in the `supabase_realtime` publication; RLS filters it) and, whatever
  realtime does, a refresh every minute while the tab is visible and when it comes back to the
  front. A new unread notification is announced politely to screen readers.
- **Centre** `/account/notifications`: newest first, grouped by day; views *Toutes*, *Non lues*,
  *Archivées*; category chips; 30 per page with a keyset cursor (`created_at`, `id`: no line
  repeated or skipped); mark one read, archive, restore; "Tout marquer comme lu". Filters live in
  the address.
- **Opening** `/account/notifications/<id>` (a plain link, never prefetched): `open_notification`
  marks it read (own row only, else "introuvable") and the person is sent to a path rebuilt from
  validated ids and slugs (`notificationPath`, `supabase/functions/_shared/notifications/catalog.ts`),
  never a URL from the payload. Broadcast links are limited to public pages
  (`/events|campus|associations|recruitment/<slug>`), checked by the database and again here.
- **Settings** `/account/notifications/reglages`: each topic with its two channels (essential ones
  fixed, operational ones always in the centre), quiet hours, followed associations, an address
  the provider stopped (and "Reprendre les e-mails"), the last twelve changes.
- **Follow**: "Suivre" on an association's public page (`follow_organization`, recorded with its
  source). Followers get the association's first publications and its messages to followers.
- The account home lists the three latest unread; the account tabs show the count.

The words of every kind live in `supabase/functions/_shared/notifications/` (`events.ts`,
`recruitment.ts`, `platform.ts`, `catalog.ts`): the site and the worker import the same files
(`@notify/*` in the site). The unit tests check that the site has words for exactly the kinds the
database lists.

## E-mail delivery

```
producer → private.notify → notification_deliveries (queued)
pg_cron "notifications-dispatch" (every minute) → private.run_notification_dispatch()
  → broadcasts dispatched in batches → private.kick_notification_worker()
  → pg_net POST <Vault notifications_worker_url>, Bearer <Vault notifications_worker_token>
  → Edge Function notifications-worker (verify_jwt off; token compared in the database)
  → private.claim_notification_deliveries → render → transport → private.complete_notification_delivery
Brevo → Edge Function notifications-webhook (Bearer <Vault notifications_webhook_token>) → private.record_provider_event
```

**Mode** (`notification_config.delivery_mode`, set by the operator with
`select private.set_notification_config(mode, email_from, reply_to, site_url)`, audited):
`off` (default: nothing is claimed, e-mails wait), `capture` (test mode: each e-mail is rendered
and stored in `notification_email_captures`, never sent; kept 7 days) or `live` (Brevo). Live
needs a sender, the site's address and the function secret `BREVO_API_KEY`; without them nothing
is claimed and the run records why.

**The worker** (`supabase/functions/notifications-worker`, loop in `_shared/notifications/worker.ts`)
reaches the database with `SUPABASE_DB_URL` (provided by the platform) and calls only private
functions, which no API role may execute; no API key, nothing in the site. Each run claims
batches of 10 for at most 15 seconds. **Claiming re-checks every message** under `for update skip
locked` (two workers never take the same one): no address → failed; a suppressed address →
suppressed; an optional topic turned off since → cancelled; an **obsolete** reminder or request
(the event moved or cancelled, the interview moved, the draft sent, the offer or question
answered, the invitation answered, the article reviewed, the mandate renewed) → cancelled and
taken out of the centre; an earlier attempt that Brevo acknowledged since → reconciled without
sending again; quiet hours (non-essential only, the person's time zone) → postponed to their end.
The rest is leased for 5 minutes; an expired lease comes back and its attempt is marked
`outcome_unknown`. Optional and operational e-mails get a fresh unsubscribe token.

**Outcomes** (`complete_notification_delivery`): accepted (2xx); `failed_retryable` with
exponential backoff and ±20 % jitter (2, 4, 8, 16, 32 minutes, `Retry-After` honoured, at most
6 hours) for 401/403 (`transport_auth`), 402 (`transport_quota`), 429 (`rate_limited`), 5xx
(`transport_down`) and connection errors; **`outcome_unknown`** when the call timed out after
sending (8 s), retried after at least 10 minutes so Brevo's events can reconcile it first;
`failed_permanent` for 400 (an invalid recipient address is also suppressed) and after the 6th
attempt (the dead letter, listed for the BDE with a "Relancer" button). Brevo has no idempotency
key: each message carries the delivery's key in `X-Mailin-custom`, echoed in every webhook event.
Errors are short codes; the provider's own message (which may echo the address) is never stored.

**Templates** (`_shared/notifications/email.ts`): subject, text and HTML in the site's identity
(ink band, pink wordmark, cream paper), every value escaped, no image, no tracking pixel, one main
button to the notification's page, a footer saying why the person gets it and whether it can be
turned off, a link to the settings and, for non-essential messages, a link to
`/notifications/desabonnement?t=<token>` plus `List-Unsubscribe` (`/api/notifications/unsubscribe?t=`)
and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). **Confidential** kinds
(everything about an application) keep a neutral subject ("Du nouveau sur ta candidature",
"Recrutement : du nouveau dans ton espace de gestion") and body: no position, reference, message
or outcome; an offer and a refusal read the same, and no "Important" mark. The BDE previews every
template with obviously fictional values on its communication page.

**Unsubscribing** needs no sign-in: the page asks before doing anything (a link scanner opening it
changes nothing); the button or the mail client's one-click POST calls `unsubscribe_with_token`
(single use, never an essential topic, recorded with source `unsubscribe_link`). A GET on the API
address only redirects to the page.

**Provider events** (`notifications-webhook`): matched by our key (or Brevo's message id),
recorded once; `request` → accepted (reconciles an unknown outcome); `delivered` → delivered;
`hard_bounce`, `invalid_email`, `blocked`, `error` → failed and, except `error`, the address
suppressed; `spam` → complaint, suppressed. Opens and clicks are ignored: the platform does not
track reading. A status never moves backwards. Nothing personal is logged.

## Reminders

One job, `notification-reminders` (every 15 minutes, `private.enqueue_due_reminders`; it replaced
`enqueue-event-reminders`), reads current state only: events starting within 24 h (confirmed seats
registered earlier), interviews within 24 h (the candidate, and each interviewer), mandates ending
within 30 and 7 days (not renewed), articles waiting for review for 48 h, a vacant BDE presidency
(the guardian, once per vacancy). Each key carries the date it is about, so a moved event or
interview reminds again for the new date, and the old reminder is obsolete. The same job takes
stale unread reminders out of the centre. Draft deadlines, unanswered questions and offers stay
with the recruitment job (Phase 8–9), re-checked the same way before sending. All dates are shown
in Europe/Paris.

## Messages to an audience (broadcasts)

| Audience | Who may write | Kind (topic) |
| --- | --- | --- |
| All students (every account that finished its profile) | the BDE, `platform.communications.broadcast` | `campus_announcement` (`bde_announcements`, optional) |
| An association's members | `communications.send` in that association (offices and vice-presidents by default; grantable, not delegable) | `association_message` (`association_messages`) |
| An association's followers | the same | `followed_announcement` (`followed_updates`, optional) |

A message is prepared as a **draft** (plain text, 3–120 + 1–2 000 characters, an optional link to a
public page only, "important" only for a BDE announcement to everyone; the same text twice in a
week is refused), shown with its estimate (how many people, how many by e-mail given their own
choices), then **submitted**: the database freezes the recipients (`notification_broadcast_recipients`,
user ids, never shown), checks the limits (3 per day for the BDE, 5 per association, 5 000 people
for members or followers) and the second factor (for an e-mail or a campus-wide message). A
campus-wide **e-mail** waits for the **approval of another BDE officer** (aal2). The one-minute job
dispatches in batches of 500, checks each person again (still a member, still following, still a
student) and notifies through `private.notify` with the key `broadcast:<id>:<user>` (a second
dispatch is a no-op). Cancelling stops what has not gone out (a reason once submitted). Every step
is audited (category `communications`). The history shows counts only (notified, read on the site,
e-mails accepted, failed). Not a chat: no reply, no thread.

**Followed updates** are system broadcasts queued by triggers on the **first** publication of an
article, an event or a recruitment of a followed association (`followed_*_published/opened`);
dropped if the subject is no longer public when dispatched.

Pages: `/manage/<asso>/communication` (section "Messages", `communications.send`) and
`/manage/plateforme/communication` (BDE).

## Monitoring (BDE)

`platform.communications.monitor` (BDE president and vice-president) opens, on
`/manage/plateforme/communication`: the mode, what is configured (sender, site address, worker
address, webhook token — yes/no only), the queue (due, scheduled, retrying, in progress), the last
24 hours (sent, delivered, failed, suppressed, cancelled), the last run and alerts (`mode_off_with_queue`,
`worker_silent`, `backlog`, `high_failure`, `rate_limited`, `config_incomplete`, `worker_error`);
failed e-mails by kind, association, reason and attempts — **never a recipient, an address or a
content** — with "Relancer" (second factor, audited); the template preview.

## Retention

`notification-retention`, daily at 03:40 (`private.purge_notifications`):

| What | Kept |
| --- | --- |
| A read notification | 6 months |
| An archived notification | 30 days |
| Any notification | 12 months |
| Delivery details (finished) | 90 days |
| Attempts, provider events | 30 days |
| Test-mode e-mails | 7 days |
| Worker runs | 14 days |
| Used or expired unsubscribe tokens | 7 days after use or expiry |
| A dispatched or cancelled broadcast's recipient list | 30 days |
| The record of a person's choices | 3 years |
| A cleared suppression | 1 year |

The business records a notification was about (registrations, applications, decisions, audit
lines) are untouched.

## Configuration

Per environment (the development project is set up: capture mode, the three Vault secrets
generated inside the database, both functions deployed with `verify_jwt` off):

1. Deploy the functions: `npx supabase functions deploy notifications-worker` and
   `notifications-webhook` (`supabase/config.toml` keeps `verify_jwt = false` for both).
2. Vault secrets (SQL editor, as the owner):
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/notifications-worker', 'notifications_worker_url');`
   `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notifications_worker_token');`
   `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notifications_webhook_token');`
3. `pg_net` and `pg_cron` enabled (the migration installs `pg_net` and schedules the jobs where the
   extensions exist).
4. Test first: `select private.set_notification_config('capture', null, null, 'https://<site>');`
   then read `notification_email_captures`.
5. Live: a sender on the BDE's own domain authenticated with Brevo (SPF, DKIM, DMARC), the
   function secret `BREVO_API_KEY` (`npx supabase secrets set BREVO_API_KEY=…`, never in the site
   or the database), a Brevo transactional webhook to `…/functions/v1/notifications-webhook` with
   bearer authentication using `notifications_webhook_token` (events: request, delivered, deferred,
   soft and hard bounce, blocked, invalid, spam, error), then
   `select private.set_notification_config('live', 'Very Pink Club <adresse@domaine>', null, 'https://<site>');`.
6. Watch `/manage/plateforme/communication`.

Locally, the CLI stack serves the functions (`npx supabase functions serve`); the database keeps
`off` unless you set `capture`.

## Not in Phase 10

Push notifications, SMS, chat, read receipts for e-mails, digests, per-association e-mail
branding, attachments.
