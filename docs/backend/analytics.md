# Statistics, reports and privacy (Phase 13)

Counts an association or the BDE can act on, taken from the platform's own records, never about
a person, and never a number for what the platform does not measure. Migrations
`20261103180617_create_analytics.sql` and `20261103193024_fix_analytics_threshold_update.sql` (the
threshold update named its row: the hosted database refuses an `update` without `where`); tests `supabase/tests/database/analytics.test.sql`
(152 assertions), `supabase/tests/concurrency/analytics.sh`, `src/lib/analytics/analytics.test.mjs`,
`e2e/analytics.spec.ts`. The metric dictionary of the site is `src/lib/analytics/metrics.ts`; a unit
test checks that every key there, and every daily metric of the database, is listed below.

## The rules

1. **Nothing invented.** Every figure is a count of rows the platform holds (posts, events,
   registrations, applications, decisions, deliveries, memberships) or a stated formula over such
   counts. Attendance, page views, unique visitors, reading time, likes, shares and e-mail opens are
   **not measured**: each view says so in words ("Non mesuré"), never as 0.
2. **Counted in the database, by the person's own keys, now.** The browser receives counts only.
   `public.organization_analytics` and `public.platform_analytics` are `security definer` functions
   that check each section's key with `private.user_has_organization_permission(actor, org, key,
   now())` (or the platform variant) at every call. A mandate that ended an hour ago reads nothing.
   No client chooses the time of the check, no "see all associations" key exists.
3. **Small groups are hidden before anything leaves the database** (below), and the BDE never gets
   a drill-down to an applicant: campus-wide recruitment is totals only.
4. **No reviewer scoreboard.** Workflow counts are per campaign and per stage ("3 évaluations
   manquantes"), never per person.

## Who reads what

| Key (organization, category *insights*) | Grantable | Delegable | Sensitive | Opens |
| --- | --- | --- | --- | --- |
| `analytics.view` | ✓ | ✓ | | the overview (current state, period totals of articles and events, insights) |
| `analytics.content.view` | ✓ | ✓ | | articles: publications, drafts, scheduled, reviews, review time |
| `analytics.events.view` | ✓ | ✓ | | events: publications, held, cancelled, registrations, waiting list, the per-event table |
| `analytics.recruitment.view` | ✓ | | ✓ | recruitment: applications, distinct candidates, each campaign's funnel and outcomes (suppressed) |
| `analytics.recruitment.workflow.view` | ✓ | ✓ | | the work left per campaign (assignments, reviews, interviews, decisions, offers) |
| `analytics.export` | ✓ | | | the printable report and the CSV, for the sections the person can read |
| `governance.view` (existing) | | | | the team view (members, positions, mandates ending, presidency, continuity points) |

At least one analytics key is needed to open `/manage/[asso]/analytics`; each view needs its own.
Offices (presidency) received every new key, in their templates and in every existing office
position. Templates: Vice-présidence every analytics key; Communication `analytics.content.view`;
Événements `analytics.events.view`; Responsable recrutement `analytics.recruitment.view` and
`.workflow.view`; Trésorerie `analytics.view`, `analytics.content.view`, `analytics.events.view`,
`analytics.export`. A Communication officer therefore sees articles and events, never a
recruitment figure (brief §9).

| Platform key | Held by | Opens |
| --- | --- | --- |
| `platform.analytics.view` | BDE president, BDE vice-president | `/manage/plateforme/statistiques`: associations, articles, events, recruitment in suppressed totals, insights; reports and CSV (second factor) |
| `platform.analytics.configure` | BDE president, BDE vice-president | the small-group threshold and the recompute of past days (second factor, audited) |
| `platform.governance.view` (existing) | BDE offices, guardian | the governance section (BDE offices filled, associations without a president, mandates ending, open points) |
| `platform.communications.monitor` (existing) | BDE offices | the messages section (notifications created, e-mails accepted, delivered, failed, suppressed; queue) |

The guardian (School Responsible) gains nothing: `platform_analytics` answers her with the
governance section only, and her page stays `/manage/continuite` (BDE availability and recovery,
Phase 11), which already shows the continuity indicators of brief §55.

## How the numbers are made

**Two kinds of figures**, and every tile says which:

- **"En ce moment"** (current state): read live from the source tables at each page load (articles
  online, events to come, seats confirmed, campaigns open, work in progress, members).
- **"Pendant la période"** (event time): sums of `private.analytics_daily`, one row per Paris day,
  organization, metric and dimension, with a count. A registration made on 12 October and cancelled
  on 4 November counts as made in October and cancelled in November. The tile and the chart of a
  period come from the same rows.
- **"Toute la campagne"** (cohort): a recruitment's funnel, from its first application to now.

**The daily table** holds counts only (no user id, no row id), RLS on, nothing granted. It is
rebuilt, never incremented: `private.refresh_analytics(from, to)` deletes the days of the range and
inserts `private.analytics_source_counts(from, to)` under an advisory lock, so two runs at once give
the result of one (tested). The job `analytics-refresh` (`scheduled_jobs`, area `reports`, hourly at
:25, not critical, retryable; the Phase 11 dispatcher, no new scheduler) refreshes the last 40 days
and then **reconciles** days 41–400 without changing them: the cells whose stored count no longer
matches the records (a late correction, or source rows a retention rule has deleted) are counted in
the job result and shown on the BDE settings view. `public.recompute_analytics(from, to)` refreshes
an older range on request (configure key, second factor, 400 days at most, audited); the page warns
that a day whose sources a retention rule deleted loses its counts. The migration backfills from
2020-01-01; the seed does the same and records one regular job run.

**Freshness**: `private.analytics_freshness()` reads the job's last success. Each page says "Comptes
par période calculés … (toutes les heures)"; after two hours without a success it says the counts
stop at that time (and that current-state figures stay exact) instead of passing them off as
current. A failed job is a Phase 11 job failure (Continuité › Opérations).

**Periods** (`src/lib/analytics/period.ts`): 7, 30 or 90 days, this month, the current academic
year, the previous one (both from the Phase 11 calendar via `public.analytics_years()`, never a
hardcoded September), or chosen dates. Paris calendar days, both ends included; day arithmetic at
noon UTC so daylight-saving changes never move a day. Two years at most per view; nothing before
2020-01-01; the database checks the same (`analytics_period_invalid`). A malformed URL falls back to
the 30 last days with a sentence saying why. Charts are daily up to 31 days, weekly (Monday weeks,
cut weeks labelled) up to 120, monthly beyond.

**Comparisons** compare like with like: the same number of days just before; this month against
the same days of the previous month (clamped to its length); a year still running against the same
elapsed days of the previous year, said in words ("comparée aux 64 premiers jours de 2025-2026, pas
à l'année entière"); a closed year against the one before. No comparison is shown when the previous
period would start before the first measured day. It can be turned off.

**Changes and rates** (`src/lib/analytics/compare.ts`): previous 0 and current > 0 is "Nouvelle
activité", never +∞ %; both 0 is "Aucune activité, ni avant"; a hidden side gives no change. A rate
with a zero denominator is "—" ("Pas de taux : rien à diviser"), never 0 % or 100 %; a share between
0 and 1 % reads "< 1 %", between 99 and 100 % "> 99 %". A change states a difference, never a cause.

## The metric dictionary

Quality: **Compté** (operational: counted from records), **Calculé** (derived by the formula),
**Non mesuré**. There is no audience metric. Refresh: *hourly* (the daily table), *live*
(read at each load).

| Key | Label | Quality | Time | Refresh | Formula (source) | Threshold |
| --- | --- | --- | --- | --- | --- | --- |
| `overview.posts_online` | Articles en ligne | Compté | now | live | published, not hidden (`posts`) | |
| `overview.events_upcoming` | Événements à venir | Compté | now | live | published, scheduled, not started (`events`) | |
| `overview.registrations_upcoming` | Places réservées à venir | Compté | now | live | confirmed registrations of events not over (`event_registrations`) | |
| `overview.campaigns_open` | Recrutements ouverts | Compté | now | live | campaigns in state open | |
| `posts.published` | Articles publiés | Compté | period | hourly | first publication in the period, one per article whatever its versions (`posts.first_published_at`; dimension = kind) | |
| `content.online` | En ligne | Compté | now | live | published, not hidden | |
| `content.drafts` | Brouillons | Compté | now | live | never published | |
| `content.scheduled` | Programmés | Compté | now | live | schedule pending, date to come | |
| `content.approvals_waiting` | En attente de relecture | Compté | now | live | revisions submitted (`post_revisions`) | |
| `content.offline` | Retirés du site | Compté | now | live | published once, unpublished now | |
| `content.hidden` | Masqués par le BDE | Compté | now | live | `posts.hidden_at` set | |
| `content.reviews.median_hours` | Temps de relecture (médiane) | Calculé | period | live | median of approval − submission, hours (`post_reviews`, `post_revisions`) | |
| `events.published` | Événements publiés | Compté | period | hourly | `events.first_published_at` | |
| `events.held` | Événements passés | Compté | period | hourly | ended in the period, not cancelled | |
| `events.cancelled` | Événements annulés | Compté | period | hourly | `events.cancelled_at`, after publication | |
| `registrations.created` | Inscriptions faites | Compté | period | hourly | `event_registrations.created_at` (seats and waiting list, cancelled since included) | |
| `registrations.waitlisted` | Entrées en liste d'attente | Compté | period | hourly | `waitlisted_at` | |
| `registrations.promoted` | Passages de l'attente à une place | Compté | period | hourly | `promoted_at` | |
| `registrations.cancelled` | Désinscriptions | Compté | period | hourly | `cancelled_at`; dimension = `cancel_source` (self, organizer) | |
| `event.confirmed` | Inscriptions confirmées | Compté | now | live | confirmed seats of one event — **not attendance** | |
| `event.utilization` | Remplissage | Calculé | now | live | confirmed ÷ capacity; none without a capacity or for registration elsewhere | |
| `applications.submitted` | Candidatures envoyées | Compté | period | hourly | `applications.submitted_at`; one per application (a person applying twice counts twice) | platform: under k hidden |
| `applications.withdrawn` | Candidatures retirées | Compté | period | hourly | `withdrawn_at` after submission | platform: under k hidden |
| `applications.started` | Candidatures commencées | Compté | period | hourly | `applications.created_at` (drafts: never who, never their content) | |
| `recruitment.candidates` | Candidat·es distinct·es | Compté | period | live | distinct `candidate_id` with a submission in the period — association only | |
| `campaign.funnel` | Étapes de la campagne | Compté | cohort | live | started, sent, reviewed (≥ 1 submitted review), shortlisted (stage or its history), interviewed | after "sent": k sent |
| `campaign.submission_rate` | Taux d'envoi | Calculé | cohort | live | sent ÷ started | |
| `campaign.interview_rate` | Taux d'entretien | Calculé | cohort | live | interviewed ÷ sent | k sent |
| `campaign.outcomes` | Décisions annoncées | Compté | cohort | live | released decisions by outcome (offer, reject, waitlist); a decision not yet announced is absent | k, cells, dominance |
| `campaign.offers` | Réponses aux offres | Compté | cohort | live | offers by status (accepted, declined, pending, expired or withdrawn) | k, cells, dominance |
| `campaign.acceptance_rate` | Taux d'acceptation | Calculé | cohort | live | accepted ÷ offers | as offers |
| `workflow.items` | Travail en cours | Compté | now | live | per campaign: to assign, reviews missing, complete, interviews to schedule / scheduled, decisions to approve / announce, offers unanswered; never per reviewer | |
| `team.members_active` | Membres actifs | Compté | now | live | active memberships | |
| `team.mandates_ending_60d` | Mandats qui finissent sous 60 jours | Compté | now | live | `position_assignments.ends_at` | |
| `platform.associations_active` | Assos actives | Compté | now | live | associations active (BDE excluded) | |
| `platform.members_distinct` | Étudiant·es membres | Compté | now | live | distinct people with an active membership | |
| `platform.memberships_active` | Adhésions | Compté | now | live | active memberships (one person in three associations counts three) | |
| `platform.recruitment_by_association` | Candidatures par asso | Compté | period | hourly | `applications.submitted` per association | k, cells |
| `notifications.created` | Notifications créées | Compté | period | hourly | `notifications.created_at` (never whose) | |
| `deliveries.accepted` | E-mails acceptés par le prestataire | Compté | period | hourly | `accepted_at` — accepted is not received | |
| `deliveries.delivered` | E-mails remis | Compté | period | hourly | `delivered_at`, when the provider confirms — delivered is not read | |
| `deliveries.failed` | Échecs définitifs | Compté | period | hourly | `failed_permanent` | |
| `deliveries.suppressed` | Non envoyés | Compté | period | hourly | `suppressed` (the person's choice, a blocked address) | |
| `unavailable.attendance` | Présence réelle | Non mesuré | — | never | no check-in exists | |
| `unavailable.views` | Vues et lectures | Non mesuré | — | never | audience measurement not enabled (below) | |
| `unavailable.visitors` | Visiteurs uniques | Non mesuré | — | never | cannot be counted without following people | |
| `unavailable.engagement` | J'aime, partages, commentaires | Non mesuré | — | never | the site has none; a "copy link" button proves no share | |
| `unavailable.email_opens` | E-mails ouverts | Non mesuré | — | never | no tracking pixel, by design (Phase 10) | |

Daily metrics kept by the database (`private.analytics_daily.metric`): `posts.published`,
`events.published`, `events.held`, `events.cancelled`, `registrations.created`,
`registrations.waitlisted`, `registrations.promoted`, `registrations.cancelled`,
`applications.started`, `applications.submitted`, `applications.withdrawn`, `decisions.released`
(dimension = outcome; platform outcomes only, suppressed), `offers.responded` (accepted or declined;
platform only, suppressed), `notifications.created`, `deliveries.queued`, `deliveries.accepted`,
`deliveries.delivered`, `deliveries.failed`, `deliveries.suppressed`. Messages rows have no
organization.

Wording fixed once for every screen and export: an *inscription* is not a *présence*; a
*candidature* is not a *personne*; *accepté par le prestataire* is not *remis*, and *remis* is not
*lu*; *passé* means ended without being cancelled.

## Privacy: small groups, complements, differencing

`private.analytics_settings.min_group_size` = **k** (default 5, between 3 and 20, set by
`public.set_analytics_min_group_size`: configure key, second factor, audited). Every breakdown that
could tell someone's result goes through `private.analytics_suppress(cells, k, dominance)`:

- **the whole group under k**: nothing shown, not even the total (`small_group`);
- **a cell between 1 and k − 1**: hidden; when exactly one cell is hidden, the next smallest is
  hidden with it, so it cannot be recovered by subtracting from the total (`small_cells`,
  complementary suppression, brief §47);
- **dominance** (outcomes, offers): one category holding the whole group would tell each member's
  result, so the breakdown is hidden (`single_outcome`).

Where it applies: a campaign's stages after "sent", its outcomes and offers (all hidden while fewer
than k applications were sent), the platform's outcomes and offers, the platform's applications per
association, the platform's monthly applications (a month under k is "masqué") and its period
totals of applications sent and withdrawn (left out of `totals`, listed in `suppressed_totals`).
The platform has **no daily recruitment series** and **no campus-wide count of distinct
candidates** (it would let one follow people across associations). Zero is not suppressed: "nobody"
reveals nothing about anyone.

**Residual risks, stated plainly:**

- An association's own recruitment page shows its applications per day and per position. That is
  the association's own data, read only with `analytics.recruitment.view` (sensitive, not
  delegable), and it already knew who applied from its review pages (Phase 9); the counts tell it
  nothing new about a person.
- Differencing across overlapping periods (30 days today vs 30 days yesterday) can isolate one
  day's count in the association's own series. For the platform, the series is monthly and every
  month under k is hidden, which keeps the difference between two windows at whole months.
  Changing k moves what is shown; the change is audited.
- Event registrations per event are shown as counts to the association that runs the event (it
  already sees the names with `events.attendees.view`).
- A threshold of 3–20 protects against casual identification, not against someone who already
  knows most members of a group. No figure is published outside the workspace.

## Audience measurement (not enabled) — CNIL assessment

No page view, visitor, reading or click is recorded, and no measurement script is loaded. The
CNIL allows audience measurement without consent only when it is strictly necessary to the site,
first-party, limited to anonymous aggregate statistics, with no cross-site tracking, no combination
with other processing, identifiers kept at most 13 months and data at most 25 months, and people
informed and able to object (CNIL, *Cookies et traceurs : solutions de mesure d'audience
exemptées de consentement*). The site would qualify only with a self-hosted, cookieless or
short-lived first-party counter, IP addresses truncated, no user id in the logs (brief §59), bots
filtered, and a measurement start date shown on every chart (brief §62). Because:

- the BDE has not asked for audience figures and no decision depends on them yet;
- the site's users are students of one school, a small population where "anonymous" visit logs
  joined with sign-in times could identify people;
- the legal information and privacy notice would have to change first (owner and DPO decision),

audience measurement stays **off**. It is a later decision for the BDE and the school's DPO, with
the conditions above; the dictionary lists it as *Non mesuré* until then, and nothing in the code
collects it.

## Reports and exports

- **Printable report** (`/manage/[asso]/analytics/rapport`, `/manage/plateforme/statistiques/rapport`):
  opened from the "Rapport et export" form (a GET form, never a prefetched link) with the chosen
  sections among those the person can read and the current period. The page asks the dashboard
  function again (rights now), then `public.log_analytics_export` (organization:
  `analytics.export`; platform: `platform.analytics.view` and the second factor) **before** showing
  anything; a refused record means no report. Print or "save as PDF" from the browser (no PDF
  engine added, brief §91).
- **CSV** (`POST …/analytics/export`, `POST /manage/plateforme/statistiques/export`): same checks,
  plus the site's own origin (route handlers do not get the Server Actions' check). Built in memory
  from the same rows as the report (`src/lib/analytics/csv.ts`), UTF-8 with BOM, semicolons, every
  cell neutralised for spreadsheets (an event titled `=HYPERLINK(…)` stays text), `Cache-Control:
  private, no-store`, attachment, file name `statistiques-<asso|plateforme>-<from>-<to>.csv`. Hidden
  values are written "masqué" with the reason, never 0; rates as percentages, hours as hours.
- **Audit**: `analytics_exported` (category `analytics`): actor, scope, kind (csv/report), sections,
  period — never the figures. Also `analytics_settings_changed` and `analytics_recomputed`.
- **No stored report, no public URL**: a report URL holds only a period and section names; it shows
  nothing to someone without the keys at that moment (tested).
- **No custom query**: sections and metrics are fixed in the database functions; nothing takes SQL,
  a table name or a free metric key from the browser.

**Scheduled summaries** (brief §95–96, optional) are **not built** in Phase 13. If the BDE asks
for them: a subscription table per person and scope, one key of `scheduled_jobs`, a notification
through `private.notify` carrying a link to the dashboard only (no figure, no attachment), the
rights checked again at send time and the subscription ended when they lapse. No second e-mail
worker.

## Screens

- `/manage/[asso]/analytics?vue=apercu|articles|evenements|recrutement|equipe` with the period bar
  (`?periode=7j|30j|90j|mois|annee|annee-precedente`, `?du=&au=`, `?comparer=non`), the freshness
  line, the views the person's keys open, the definitions of every figure on the view (from the
  dictionary), the "Non mesuré" list, and "Rapport et export" with the export key.
- `/manage/plateforme/statistiques?vue=apercu|articles|evenements|recrutement|gouvernance|messages|reglages`,
  the "Statistiques" tab of the control center.
- Accessible: every chart is a figure with a sentence and a "Voir les chiffres" table, the drawing is
  decorative; hidden cells read "masqué (moins de k)" to screen readers; colour never carries
  meaning alone; tabs and period presets are links with `aria-current`; works without JavaScript
  (GET forms) and at phone width (tables scroll inside their box).

## Performance (brief §104–105)

`supabase/tests/concurrency/analytics.sh`, in a rolled-back transaction on a synthetic campus
(1,500 accounts, 2,000 events, 40,000 registrations, 3,000 applications), local Postgres 18:

| Operation | Measured (two runs) | Budget (CI fails above) |
| --- | --- | --- |
| Full refresh of the synthetic campus (`refresh_analytics`) | 744–988 ms | 20,000 ms |
| One association's dashboard, every section | 284–430 ms | 3,000 ms |
| Platform dashboard | 101–151 ms | 3,000 ms |

Indexes: `analytics_daily (organization_id, day)` and `(day, metric)`; the live counts use the
existing indexes of the source tables. Period sums read the small daily table, not the sources.

## Tests

- `analytics.test.sql`: the §106 rights matrix (president, communication, events, recruitment,
  expired treasurer, ordinary student, guardian, BDE, anonymous; the private schema unreadable; no
  forbidden column in any function), event correctness §107/§110 (a capacity-50 gala: 58 register,
  8 cancel, 8 promoted, 7 waitlisted → 50 confirmed, utilization 1.000; uncapped → no utilization;
  cancelled event; no attendance), articles §112 (a republished article counts once), recruitment
  §108/§111 (funnel, suppression, dominance, k = 10, platform suppression), idempotency and
  reconciliation §114, exports and settings §115, comparisons, freshness, mandate expiry §81.
- `analytics.sh`: two refreshes at once; the synthetic campus against the budgets.
- `analytics.test.mjs`: the dictionary against the migration and this document; no function
  updates or deletes without `where` (pg-safeupdate on the hosted project, absent locally); periods
  (presets, academic years, elapsed comparisons, daylight saving, validation); changes and rates;
  the CSV (formula neutralisation, hidden values, sections dropped).
- `e2e/analytics.spec.ts`: the president's views, report and CSV; communication without
  recruitment or export; the BDE's suppressed recruitment and the second factor for its export;
  refusals (another association, a student, an export from another origin).
