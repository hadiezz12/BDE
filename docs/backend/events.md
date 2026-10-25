# Events: calendar, registrations, capacity, waiting lists (Phase 7)

An **event** is something an organization (the BDE or an association) organizes at a date and a
place: a party, a match, a workshop, a talk. It belongs to exactly one organization for ever
(`keep_event_organization` refuses any change of owner, `event_owner_locked`), has a stable id and,
once published, an address `/events/<slug>`. Students find it in the agenda (`/events`), the
calendar (`/events/calendrier`), on the organizer's page, on the home page when the BDE features
it, and in search; they register on its page and follow their registrations in **Mes événements**.

What an event is **not**: a post (an article can *point to* an event, see
[Articles about an event](#articles-about-an-event)), a ticket or a payment (there is no price, no
ticket, no QR code: registration is free and tied to the school account), a social feature (nobody
sees who else is coming). The BDE's eight "événements de l'année" stay the maquette's content
(`src/data/mock/event-series.ts`); a dated edition links to one through `series_key`.

Migrations: `20261023120000_create_events.sql` (tables, permissions, audit vocabulary, policies,
Storage), `20261023120100_create_event_functions.sql` (writing, publication, registration engine,
waiting list, moderation, the e-mail worker's functions, the reminders job),
`20261023120200_create_event_reads.sql` (public read model, a student's own reads, the team's desk,
editor, preview and participant list, the BDE list, images),
`20261023120300_link_posts_to_events.sql` (articles about an event),
`20261025090000_event_read_fixes.sql` (fix forward, see D50). Tests:
`supabase/tests/database/events.test.sql` (128 checks), `supabase/tests/concurrency/registrations.sh`
(parallel sessions), `src/lib/events/events.test.mjs` (28 unit tests), `e2e/registrations.spec.ts`.
App side: `src/lib/events/*` (payloads and mapping, the wizard's parser, calendar arithmetic, agenda
filters, ICS, CSV, message words, e-mail, structured data), `src/lib/data/events.ts` (public
reads), `src/lib/events/me.ts` (a student's own reads), `src/lib/events/editor.ts` (team and BDE
reads), `src/app/actions/events.ts` (Server Actions).

## Three concerns, plus registrations

| Concern | Stored in | Values | Set by |
| --- | --- | --- | --- |
| Publication | `events.publication` | `draft`, `published`, `unpublished` | the team (`events.publish`) |
| Status | `events.status` (+ `cancelled_at`, `cancellation_reason`) | `scheduled`, `cancelled` | the team (`events.publish`), irreversible |
| Moderation | `events.hidden_at`, `hidden_reason` | hidden or not | the BDE (`platform.content.moderate`) |
| A registration | `event_registrations.status` | `confirmed`, `waitlisted`, `cancelled` | the student, the team (`events.attendees.manage`), the waiting-list promotion |

"Past" is never stored: an event is over once `ends_at <= now()`. A cancelled event stays readable
at its address with the reason (the page says "Événement annulé"); it is never deleted, and its
registrations are kept as they were (history). A hidden event is not public whatever its
publication says, but it is **not cancelled**: registrations stay, and the association reads the
reason in its desk. Only a draft that was never online can be deleted (`event_was_published`), and
an event with registrations cannot be taken off the site, only cancelled (`event_has_registrations`).

## Permissions

| Key | What it opens | Grantable / delegable / sensitive |
| --- | --- | --- |
| `events.create` | start an event, write one's own drafts, send their images | ✓ / ✓ / |
| `events.edit` | edit every event of the association; wording and image of a published one | ✓ / ✓ / |
| `events.publish` | publish, take off the site, cancel, change dates, place or registration settings of a published event, pin, change an address | ✓ / ✓ / |
| `events.attendees.view` | the participant list (names, statuses, references, dates) | ✓ / – / ✓ |
| `events.attendees.manage` | remove a registration, with a reason the student reads | ✓ / – / ✓ |
| `events.attendees.export` | the CSV export (audited) | ✓ / – / ✓ |

Offices (presidency, BDE offices) hold all six. The "Événements" template holds the three `events.*`
keys plus `attendees.view` and `attendees.manage` (not the export). Participant keys are never
delegable: a list of people is lent by giving a position, not by delegation. A **material change**
of a published event (dates, place, registration settings) needs `events.publish` even for someone
holding `events.edit`, and every participant is told (see [Messages](#messages)).

The BDE has **no routine access** to an association's events beyond what visitors see: its list
(`platform_events`) shows public fields and counts only, never a draft, a participant or the private
joining details. Its two powers are separate keys: `platform.content.moderate` (hide/restore, with
a reason and the second factor) and `platform.content.feature` (put an event "à l'affiche" of the
agenda and home page: three at most, 60 days at most, D47). The continuity guardian has no event
power. Co-organizers (`event_coorganizers`, three at most) are a credit on the page: they can neither
edit the event nor see who registered.

## Writing an event: the wizard

`/manage/<asso>/events` is the desk (tabs À venir, Brouillons, Passés, Annulés; search; what needs
someone: a hidden event, undelivered e-mails). `/manage/<asso>/events/<id>?etape=` is the wizard:
`infos` (title, one-line summary, presentation, category, co-organizers, the BDE's event of the
year), `lieu` (start and end in Paris time, campus / elsewhere / online, venue, address, exact
coordinates, a public online link), `visuels` (a cover from the association's library, uploaded in
place), `inscriptions` (none / internal / external page; capacity or unlimited; waiting list;
opening and closing; self-cancellation cutoff; private details for confirmed seats), `apercu`
(checklist and the phone-width preview) and `publication` (publish, take off the site, pin, change
the address, cancel, delete a draft, history).

Every step is one `save_event(event, version, patch)`: a whitelist of columns, the version against a
teammate's newer save (`draft_conflict`), and every rule again in the database:

- dates: Paris wall-clock times converted to exact instants by `src/lib/events/input.ts`; the
  spring-forward hour does not exist and is refused, the autumn hour that repeats takes its first
  occurrence and says so; the end after the start, 14 days at most;
- links: `https://` with a real host only (`safeExternalUrl`), never shown for an online event's
  private link (that one goes in `access_details`);
- registration invariants: the mode cannot change once someone registered
  (`registration_mode_locked`), capacity never below the confirmed seats (`capacity_below_confirmed`),
  the waiting list cannot be closed while someone waits (`waitlist_not_empty`); raising the
  capacity promotes the waiting list in order.

Publishing (`publish_event`, second factor) needs a title, the summary, both dates, a venue unless
online, the registration page for an external one, an end still to come, an active association
whose page is public, and an existing cover (`private.event_blocker`); the address is fixed from
the title at the first publication (reserved words such as `apercu`, `calendrier`, `ics` and the
eight series addresses are never given). A former address redirects permanently
(`event_slug_history`). Cancelling (`cancel_event`) needs the second factor and a reason the
participants read.

## The registration engine

`register_for_event(event)` is the only way in. Under the event row's lock (`select … for update`;
lock order: the event row, then registrations) it checks, in order: a signed-in student (with the
second factor if enrolled), an onboarded profile (`profile_incomplete`: the team must know who
comes), a public event (`event_not_found`), not cancelled, internal registration, the window (opens
at `registration_opens_at` or publication; closes at `registration_closes_at` or the start,
whichever comes first), the rate limits (30 registrations per 10 minutes per student, 5 per day per
event: `registration_rate_limited`), then gives a seat (`confirmed`) while `confirmed_count <
capacity` (or always when the capacity is null: unlimited), else a waiting place when the list is
on, else `event_full`.

- **One active registration per student and event**: a unique partial index on
  `(event_id, user_id)` where the status is active. Registering twice returns the existing
  registration with `already: true` (a double click is harmless).
- **Counters** `confirmed_count` and `waitlist_count` are maintained only by these functions under
  the lock, and `CHECK (capacity is null or confirmed_count <= capacity)` makes overbooking
  impossible even for a bug. The concurrency suite races 20 students for the last seat: exactly one
  is confirmed, nineteen wait.
- **Reference**: each registration has an 8-character reference (`^[A-Z0-9]{8}$`) shown on the
  student's ticket and in the participant list.
- **Cancelling**: `cancel_my_registration` until the cutoff before the start (0, 1, 2, 6, 12, 24 or
  48 hours; `cancellation_closed` after); leaving the waiting list is always possible before the
  start. `remove_event_registration` (team, `events.attendees.manage`) needs a reason, which the
  student reads; the audit line records the action without the student's name.
- **Account deletion** frees the seat (`release_deleted_registration`).

### Waiting list policy

First come, first served, automatically: `queue_position` comes from a sequence, and when a seat
frees (a cancellation, a removal, a capacity increase) `promote_from_waitlist` confirms the first
waiting students, in order, **while registration is open** (before the closing time, the event
published and scheduled; a hidden event keeps promoting, since hiding is not cancelling). After the closing time nobody is promoted: a place that
frees late stays free rather than surprising someone at the last minute (the team can raise the
capacity knowingly). The promoted student is told (`event_promoted`). A student's place in line is
computed live (`position`), so it moves up as others leave.

### "Dernières places"

The only threshold the site uses: **10 % of the capacity or less is left, at least one seat**
(`lastSeats` in `src/lib/events/model.ts`): a 20-seat workshop says "Dernières places" from 2
seats left, a 4-seat one at 1. Below that, the remaining seats are counted in words; a full event
says "Complet" (with "liste d'attente" when it has one).

## Privacy

| Who | Sees |
| --- | --- |
| Visitors | public fields only (`private.event_card`): title, summary, description, organizer, dates, place, registration state and seat counts. Never a name, never `access_details` |
| A student | their own registrations, saved events and messages (row level security: own rows only) |
| A confirmed student | the private joining details (`access_details`), on the event page and in Mes événements, while the event is to come |
| The event team (`events.attendees.view`) | names, statuses, references, waiting places and dates of its own events' participants. No e-mail, no programme, no photo |
| The BDE | public information and counts, like visitors; nothing of another association's participants |

The CSV export carries the same columns as the list, never an e-mail; every export is an audit
line (`event_attendees_exported`, with the row count). Cells that a spreadsheet would read as a
formula are neutralised (`src/lib/events/csv.ts`). The ICS file and the structured data carry
public fields only; the structured data has **no `offers`** (the site sells nothing and knows no
price).

**Retention: an operator decision, not made yet.** Registrations are kept after the event (the
student's history, the team's attendance). The BDE should decide, before launch, how long they stay
(for example: deleted 12 months after the event, keeping only the counts) and write it in the
privacy notice; a scheduled purge then becomes a one-function migration. Outbox messages follow the
same decision.

## Messages

Every change a participant must know about writes one row of `notification_outbox` (own rows only,
read by the student in **Notifications**), with a `dedupe_key` so a retry never sends twice:
`event_registration_confirmed`, `event_waitlisted`, `event_promoted`, `event_registration_cancelled`,
`event_registration_removed`, `event_changed` (dates or place of a published event, with the old
values), `event_cancelled` (with the reason), `event_reminder`. The payload is a snapshot of public
facts at the time (title, dates, place, organizer): a later edit never rewrites a message, and the
private details are never in it. Words: `src/lib/events/messages.ts`, the same for the in-app list
and the e-mail.

**Reminders**: the pg_cron job `enqueue-event-reminders` (every 15 minutes) writes one reminder per
confirmed participant of an event starting within 24 hours, for those registered more than 24 hours
before (the others just got their confirmation). Its key includes the start: a rescheduled event
reminds again.

**E-mail**: `POST /api/notifications/send`, called by a scheduler with
`Authorization: Bearer <NOTIFICATIONS_WORKER_SECRET>` (404 without it). It claims up to 20 messages
(`claim_notification_emails`: `for update skip locked`, a 10-minute lease, service role only),
renders them (`src/lib/events/email.ts`: escaped, no image, no tracking, links to the site's own
pages only), hands them to the transport and records the outcome (`complete_notification_email`:
retry after 2, 4, 8, 16 minutes, `failed` after 5 attempts, `skipped` without an address). A
delivery problem never touches a registration. Transports (`EMAIL_TRANSPORT`): none (the default:
the worker answers `email_transport_not_configured` and messages stay pending), `log`
(development only), `brevo` (`BREVO_API_KEY`, `EMAIL_FROM`). **No transport is configured
anywhere yet**: today students get their messages in the site only, and the desk shows the e-mails
waiting.

## Reading events

| Reader | Function | Returns |
| --- | --- | --- |
| Agenda, calendar | `public_events(from, to, category, organization, location type, availability, q, after, limit, order)` | public cards overlapping `[from, to)`, keyset pages; `order = 'desc'`: the archive |
| Event page | `public_event(slug)` | `ok` (card + description), `moved` (former address), `not_found` |
| Filters | `public_event_facets()` | counts of what is to come by category, organization, place |
| Home page | `public_featured_events()` | the BDE's featured events, to come |
| Association page | `public_association_events(slug, 'upcoming' or 'past', limit)` | its events (pinned first) |
| Series page | `public_series_events(key)` | the dated editions of one of the eight events of the year |
| Sitemap | `public_event_sitemap()` | addresses and last changes |
| A student | `my_event_status(event)`, `my_events()` | their registration (place, reference, private details if confirmed, whether they may still cancel), saved events |
| The team | `event_dashboard(org)`, `event_editor(event)`, `event_preview(event)`, `event_attendees(…)`, `export_event_attendees(event)` | as described above |
| The BDE | `platform_events(q, view)` | public cards + hidden state, 100 at most |

The agenda's URL filters (`?quand=aujourdhui|semaine|weekend|passes`, `?du=&au=`, `?categorie=`,
`?asso=`, `?lieu=campus|exterieur|en-ligne`, `?dispo=ouvertes|libre`, `?q=`, `?suite=`) are parsed by
`src/lib/events/filters.ts`; filtered and paged views are `noindex`. The calendar
(`?vue=mois|semaine|jours`, `?mois=`, `?jour=`) works in Paris days (a day lasts 23 or 25 hours on a
clock change); a night that ends before noon belongs to its evening, a trip spans its days. Phones
get the day-by-day list of the month instead of the grid.

## Articles about an event

An article can point to one event (`posts.event_id`, `set_post_event`, from the article editor's
"Événement" panel): the association's own events (drafts included) or any public event to come.
The article stores only the id; its page shows the event as a live ticket (date, place, seats,
"Annulé"), read from `public_post` through `post_card.event`, and nothing when the event is not
public. Changing the link of an article that is online needs `posts.publish`.

## Audit

Organizer and BDE actions are governance audit lines (category `events`): `event_created`,
`event_updated`, `event_rescheduled`, `event_location_changed`, `event_registration_changed` (with
before/after values), `event_published`, `event_unpublished`, `event_cancelled`,
`event_draft_deleted`, `event_pinned`, `event_unpinned`, `event_slug_changed`,
`event_registration_removed`, `event_attendees_exported`, `event_hidden`, `event_restored`,
`event_prominence_changed`, `event_category_created`, `event_category_updated`. A student's own
registrations are **not** audit lines: `audit.view` is not `events.attendees.view`, and the audit
must not become a back door to the participant list. The wizard's history shows the event's lines.

## Known limitations

- No recurring events: each date is its own event (the eight events of the year link their
  editions through `series_key`). A recurrence model (a rule generating editions, each with its own
  registrations) is a later decision.
- No guests outside the school, no group registration, no transfer of a seat, no check-in at the
  door (Phase 7 has no tickets or QR codes).
- No e-mail is sent until a transport is configured; no push notifications.
- The BDE list and the calendar read at most 100 and 600 events per view; the agenda pages through
  everything.
- Times are Europe/Paris only (`events.timezone` is constrained to it).
