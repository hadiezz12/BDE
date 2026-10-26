# Recruitment: campaigns, positions, forms, applications, documents (Phase 8)

A **recruitment campaign** is how an organization (an association or the BDE) looks for new team
members: "Recrutement 2027", "Équipe soirées". It belongs to exactly one organization for ever
(`keep_campaign_organization`, `campaign_owner_locked`), holds **positions** (the roles: "Trésorerie",
"Communication"), one **application form** (versioned) and its dates. Students find campaigns in the
directory (`/recruitment`), on the organization's page, on the home page and in search; they read a
campaign's fiche (`/recruitment/<slug>`) or one position's (`/recruitment/<slug>/<position>`), start
an **application** to a position, fill it in with autosave, attach their CV or documents, review it
and send it, then follow it in **Mes candidatures**.

> **Phase 9 is built:** reading, evaluating, interviews, decisions and offers are described in
> [recruitment-review.md](recruitment-review.md). This page keeps the Phase 8 engine they rest on.

What Phase 8 is **not**: the review of applications. Nobody reads an application's answers or files
except its candidate — not the association's president, not the BDE, not the continuity guardian.
The team sees **counts**. Scoring, reviewer assignments, comments, shortlisting, interviews,
decisions and onboarding into a position are Phase 9 (the data and authorization boundaries are
ready for it, see [Phase 9](#what-phase-9-builds-on)). Until then an application is only `draft`,
`submitted` or `withdrawn`: **submitted never means read or accepted**, and no screen pretends
otherwise.

Migrations: `20261026090000_create_recruitment.sql` (tables, triggers, permissions, audit vocabulary,
outbox kinds, the private documents bucket and its policies, RLS, settings),
`20261026090100_create_recruitment_functions.sql` (campaigns, positions, forms, publication and
moderation, the application engine, documents, retention, reminders, the Storage cleanup queue),
`20261026090200_create_recruitment_reads.sql` (public read model, a student's own reads, the team's
desk, editor and form preview, the BDE list), `20261026090300_link_posts_to_campaigns.sql` (articles
about a campaign), `20261026090400_recruitment_fixes.sql` (fix forward, see D58). Tests:
`supabase/tests/database/recruitment.test.sql` (161 checks), `supabase/tests/concurrency/applications.sh`
(parallel sessions), `src/lib/recruitment/recruitment.test.mjs` (20 unit tests), `e2e/recruitment.spec.ts`.
App side: `src/lib/recruitment/*` (payloads and mapping, the form document and its checks, document
checks, the wizard's parser, desk words, preview, message words), `src/lib/data/recruitment.ts`
(public reads), `src/lib/recruitment/me.ts` (a student's own reads), `src/lib/recruitment/editor.ts`
(team and BDE reads), `src/app/actions/recruitment.ts` (Server Actions), the upload and download
routes under `src/app/api/applications/`, the Storage cleanup worker
`src/app/api/maintenance/storage-cleanup/route.ts`.

## Concerns of a campaign

| Concern | Stored in | Values | Set by |
| --- | --- | --- | --- |
| Publication | `recruitment_campaigns.publication` | `draft`, `published`, `unpublished` | the team (`recruitment.campaigns.publish`) |
| Status | `status` (+ `paused_at`, `closed_at`, `cancelled_at`, `cancellation_reason`) | `scheduled`, `paused`, `closed`, `cancelled` | the team (`recruitment.campaigns.publish`); cancelled is irreversible |
| Moderation | `hidden_at`, `hidden_reason` | hidden or not | the BDE (`platform.content.moderate`) |
| Archive | `archived_at` | archived or not | the team (`recruitment.campaigns.manage`), not while open |

What visitors read is **derived**, never stored (`private.campaign_state`): cancelled → `cancelled`;
not published → `draft` / `unpublished`; closed status or `closes_at <= now()` → `closed`; paused →
`paused`; before `opens_at` → `upcoming`; else `open`. No job flips a campaign open or closed: the
clock does. A campaign is public (`campaign_is_public`) when it is published, not hidden, and its
organization is active with a public page. A position closes with the campaign or earlier
(`position_closes`), and takes applications only while `position_accepting` says so.

Only a draft that was never online can be deleted (`campaign_was_published`). A campaign that
received submissions cannot be taken off the site (`campaign_has_applications`): it is paused,
closed or cancelled, so every candidate keeps a fiche to read. A cancelled campaign stays readable
with its reason; applications are kept and every candidate (submitted or with a draft) is told.

## Permissions

| Key | What it opens | Grantable / delegable / sensitive |
| --- | --- | --- |
| `recruitment.campaigns.manage` | start, write and duplicate campaigns, positions, dates, eligibility; archive; delete a draft; send images | ✓ / ✓ / |
| `recruitment.questions.manage` | write the draft form (questions, documents asked) | ✓ / ✓ / |
| `recruitment.campaigns.publish` | publish, take off, pause, close, reopen, cancel; publish a new form version; change dates, years or the limit of a published campaign; change its address | ✓ / ✓ / |
| `recruitment.applications.view` / `.review` / `.export` and the other review keys | Phase 9: see [permissions.md](permissions.md) and [recruitment-review.md](recruitment-review.md) | — |

Offices hold all three; the "Vice-présidence" and "Recrutement" templates hold `publish` too
(added to existing office positions by the migration). Publishing, cancelling and publishing a form
version need the **second factor** (`mfa_required`). A **material change** of a published campaign
(opening, closing, study years, the per-person limit) needs `publish` even for someone holding
`manage`, and is audited with its before/after (`recruitment_campaign_rescheduled`).

The BDE has **no routine access** to an association's recruitment beyond what visitors see:
`platform_recruitment` returns public fields and counts only. Its powers: hide/restore a campaign
(`platform.content.moderate`, reason, second factor; hiding is not cancelling) and the privacy
notice and retention settings (`platform.organizations.manage`, second factor). The continuity
guardian has no recruitment power and reads no application.

## Writing a campaign: the wizard

`/manage/<asso>/recruitment` is the desk: every campaign with its stage, dates, positions, the
number of applications sent (and withdrawn), its form version, and what needs someone (a campaign
the BDE hid). It also duplicates a campaign ("Recrutement 2028" from "2027": positions and the live
form are copied with fresh ids and remapped position questions; dates, slug and applications are
not). `/manage/<asso>/recruitment/<id>?etape=` is the wizard:

- `infos` — title, one-line summary, presentation, school year, cover (from the library or uploaded
  in place);
- `deroule` — the steps after sending (label, optional day), the FAQ, a contact (name, role, e-mail);
- `postes` — positions: title, team, summary, presentation, missions and expectations (one per line),
  the time it takes, places (left empty when unknown: the site then shows no number), an earlier
  closing, their own study years, the governance template it would become (information only:
  applying grants nothing). Reordered with buttons. A position with applications is **closed
  (retired)**, never deleted (`remove_recruitment_position` returns `retired` or `deleted`);
- `formulaire` — the form builder ([Forms](#forms-and-versions));
- `regles` — opening and deadline in Paris time, positions per person (1–10), study years, a note;
- `apercu` — the checklist and the preview: `/recruitment/apercu/<id>` shows the fiche exactly as it
  will look (state computed as once published), `?poste=<id>` the form a candidate to that position
  fills — usable, checked like the real one, nothing saved (`recruitment_form_preview` never
  creates an application);
- `publication` — publish (the blocker in words when something is missing), pause, close, reopen,
  take off the site, change the address (the former one redirects), cancel, archive, delete a draft,
  the form's versions with their counts, and the campaign's audit history.

Each step saves through `save_recruitment_campaign` / `save_recruitment_position` with the version
the page loaded (`draft_conflict` when a teammate saved first). Every text is plain text: the site
never renders it as HTML.

## Forms and versions

The form is **one JSON document per version** in `recruitment_form_versions.schema`:
`{sections: [{id, title, description?}], questions: [{id, type, scope, section?, label, help?,
required, …}]}`. Types: `short_text`, `long_text` (max length), `single_choice`, `multiple_choice`
(options `{id, label}`, min/max selected), `yes_no`, `number` (min, max, integer), `date` (min, max),
`url`, `file` (formats pdf/docx/image, up to 5 files, up to 10 MB) and `cv` (pdf/docx, one per
form). `scope` is `shared` (everyone, in a section) or a position id (that position's candidates
only). `private.validate_form_schema` whitelists every key per type: no code, no HTML, no handler,
no unknown key; ids are stable `[a-z0-9_]` strings, never re-derived from a label.

A campaign has at most **one draft and one published version**. Before the first publication the
draft is the form, and it is published with the campaign (version 1, frozen). After that, the team
edits a new draft (`save_recruitment_form`, edit version as a guard) and publishes it deliberately
(`publish_recruitment_form`, second factor): the previous version becomes `superseded`, never
rewritten or deleted (`freeze_published_form`), and `active_form_version_id` points to the new one.
New applications use the live version. **Submitted applications keep the version they were filled
on**, so an answer always reads against the question and options as they were. A candidate with a
draft on an older version is told (`application_form_updated`), cannot submit
(`form_version_changed`) and moves to the live version with `refresh_application_form`: answers to
questions with the same id and type that are still valid are kept, the others are dropped (and
named), documents answering removed questions are removed.

The builder (`FormBuilder.tsx`) reminds the team to ask only what helps choose (no health, religion,
opinions, orientation, origin, ID photo or ID number; name, e-mail, programme and year come from the
profile). The TypeScript mirror of the rules (`src/lib/recruitment/form.ts`) only gives messages
early; the database has the last word.

## Applications

`applications` rows are written only by the functions. One non-withdrawn application per student
and position (unique partial index); the campaign's **limit** counts drafts and submitted ones.

- `start_application(position)` — under an advisory lock per (student, campaign): returns the
  student's existing application to that position, or checks the window (`position_refusal`),
  eligibility (`profile_incomplete`, `not_eligible`), the limit (`application_limit`) and a rate
  limit, then creates the draft on the live form version.
- `save_application_answers(app, version, answers)` — autosave from the editor (1.2 s after a
  change, on blur, before a step change): answers to questions not asked are dropped; wrong types
  and unknown options are refused (`answer_invalid`); lengths and bounds are reported and enforced
  at submission. A stale tab gets `draft_conflict` and stops (it says to reload).
- `submit_application(app, version, privacy_acknowledged)` — **the** submission: under the
  application's row lock and the candidate's campaign lock, it checks the window **as the database
  receives it** (opening ≤ now < closing, not paused, not cancelled, not hidden), eligibility, the
  limit, the form version, every answer and every required document, then records the submission,
  a `candidate_snapshot` (name, e-mail, programme, year as they were), the time of the privacy
  acknowledgment and the reference, queues the confirmation and returns. Submitting twice returns
  the same submission (five simultaneous clicks: one submission, `concurrency/applications.sh`).
- After submission the answers and documents are **locked** (`lock_submitted_application`,
  `lock_submitted_document`, even for the database owner). `withdraw_application` marks it
  `withdrawn` (optional reason), keeps it readable, and frees the position.
- `delete_application_draft` deletes a draft and its documents (files queued for cleanup).

A candidate's steps are recorded in `application_events` (started, submitted, withdrawn, document
added/replaced/removed, form updated), read only by the candidate: they are **not** governance audit
lines, so `audit.view` never reveals who applied (D53).

Eligibility in Phase 8 is the **self-declared study year** of the profile (`eligible_years` on the
campaign, overridable per position) plus a free note shown on the fiche. The site cannot check a
programme or a campus (it is not validated by the school); see the report's limits.

## Documents (CVs and files)

Bucket `recruitment-documents`: **private**, PDF, DOCX, JPEG, PNG, 10 MB (each question may ask for
less). Path `applications/<application>/<document>`: no name, no e-mail, no file name. The upload
route (`POST /api/applications/<id>/documents`, same-origin only) reads the file's first bytes
(`sniffDocument`): only a real PDF, a Word document without macros, embedded objects or ActiveX,
a JPEG or a PNG goes further, whatever its name or declared type (`document_unreadable`). Then:

1. `reserve_application_document` checks the draft is the caller's, the question takes this kind
   and size, the count and a rate limit, and reserves a path (`pending`);
2. the file is stored **with the candidate's own session**: the Storage policy
   (`can_upload_application_document`) only lets them write a path they reserved for their draft;
3. `confirm_application_document` checks the file is there and makes it count (`ready`); with
   `replaces`, the previous one is removed only now.

Reads (`can_read_application_document`) and deletions are the candidate's only. Downloads go through
`GET /api/applications/documents/<id>`: `my_application_document` answers for the caller's own
documents, the file is read with their session and streamed as an attachment
(`Content-Disposition: attachment`, `nosniff`, a sandboxing CSP, `no-store`); anyone else gets 404.
No signed URL is handed out. A removed, replaced or purged document's file is queued in
`private.storage_cleanup_queue` by trigger; the maintenance worker
(`POST /api/maintenance/storage-cleanup`, bearer `MAINTENANCE_WORKER_SECRET`, service role, only
paths and buckets the queue names) deletes them. Reservations never confirmed expire after a day
(the nightly purge).

**There is no malware scanner** on this platform: the content checks keep out executable and macro
formats, they do not prove a PDF harmless. Files are only ever handed back to their own candidate,
as downloads. Phase 9 must decide scanning before reviewers open files.

## Messages

`notification_outbox` kinds (with `application_id`): `application_submitted` (with the reference),
`application_withdrawn`, `application_deadline_reminder` (one per unfinished draft whose position
closes within 24 hours, pg_cron `enqueue-recruitment-reminders` hourly at :07, only while it can
still be sent), `application_form_updated`, `recruitment_cancelled` (reason, to submitted and draft
holders). Words in `src/lib/recruitment/messages.ts`, shared by Notifications and the e-mail worker
(the layout is shared with events). Payloads hold public facts only: never an answer or a file.

## Privacy notice and retention

`recruitment_settings` (one row): the **privacy notice** candidates read on the review step before
sending, a contact for questions on their data, and three retention durations in months —
submitted applications after the campaign's closing, withdrawn ones after the withdrawal, drafts
never sent after the closing. Empty means **not decided: nothing is erased**. The pg_cron job
`purge-recruitment-data` (daily, 03:23) applies what is set, deletes the applications (documents
follow, files queued for cleanup) and audits counts only (`recruitment_data_purged`). The BDE sets
these on `/manage/plateforme/recrutements`. Without a notice, the review step shows a short factual
default and the retention lines say "pas encore fixée".

## Public reads and integrations

`public_recruitment_campaigns(view, organization, year, q, limit, offset)` (views current, open,
upcoming, closing_soon, closed, all; French full-text search with accents folded, association
names, position titles), `public_recruitment_campaign(slug)` (ok / moved / not_found),
`public_recruitment_position`, `public_recruitment_facets` (counts for the chips),
`public_association_recruitment` (current, then the last three closed), `public_recruitment_sitemap`,
`public_recruitment_privacy`. Integrations: the home page "Ça recrute" (open campaigns, a student's
own note), the association page (current campaigns, past ones), the associations index ("Recrute"
sticker), search (the ⌘K index carries current campaigns; `/search` asks the database, closed ones
included), the sitemap (campaigns and positions), robots (previews disallowed), and articles about a
campaign (`posts.recruitment_campaign_id`, `set_post_campaign`, the editor's "Recrutement" panel and
a live campaign card under the article, D57).

## What Phase 9 builds on

(Kept as written before Phase 9. Reviewer access ended up as functions, not new table policies:
[recruitment-review.md](recruitment-review.md).)

- Applications are scoped association → campaign → position; reviewer access will be a new key
  checked per campaign/position, through new policies on `applications` and the documents bucket
  (today: candidate only).
- Answers are keyed by stable question ids against an immutable form version; the candidate
  snapshot records who applied as they were at submission.
- Status will extend beyond `submitted`/`withdrawn` (under review, shortlisted…): the `status` check
  and `application_events` actions are the places to grow.
- **Before real campaigns open**, the BDE should know that, until Phase 9, nobody on the team can
  read what candidates send.
