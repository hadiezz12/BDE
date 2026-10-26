# Recruitment review and selection (Phase 9)

Phase 8 lets a student apply; Phase 9 lets the association read, evaluate, interview, decide
and announce. The Phase 8 rules stand: a sent application never changes, files stay in the
private bucket, only the database decides. **No AI screening and no automatic decision**: a
score supports a person's judgment, a decision is always proposed and validated by people, and
no CV or answer is ever sent to an AI or outside service.

Migrations: `20261026113606_create_recruitment_review.sql` (tables, constraints, triggers,
permissions and templates, the privacy officer role, audit vocabulary),
`20261026113902_create_recruitment_review_functions.sql` (access helpers, committee, grids,
reviews, conflicts, tags, comments, the pipeline), `20261026114116_create_recruitment_interviews.sql`
(message templates, slots, interviews, questions to the candidate and their files),
`20261026114323_create_recruitment_decisions.sql` (decisions, approvals, release, offers,
onboarding, the withdrawal cascade, the 5-minute job, retention), `20261026114725_create_recruitment_review_reads.sql`
(the candidate's projection and every read of the workspace, exports, data rights, `my_access`),
then the follow-ups `20261026161915_recruitment_review_followups.sql` and
`20261026163800_recruitment_reviewer_file_reads.sql` (D70).

## Who reads an application

Two routes give access, and nothing else does.

1. **The association's keys (Phase 4).** A position's recruitment keys apply to every campaign of
   **its own** organization (decision D59): `recruitment.applications.view`,
   `recruitment.documents.view`, `recruitment.applications.review`,
   `recruitment.reviews.view_team`, `recruitment.committee.manage`,
   `recruitment.applications.shortlist`, `recruitment.interviews.manage`,
   `recruitment.decisions.propose` / `.approve` / `.release`, `recruitment.applications.export`.
   Offices carry them all; the templates carry part of them ([permissions.md](permissions.md)).
   The BDE offices' keys open the BDE's own campaigns only: the BDE has no routine access to an
   association's applications, and the continuity guardian none at all.
2. **A campaign committee.** `recruitment_committee_members`: an active member of the
   organization, appointed for **one campaign**, with powers (`view`, `documents`, `review`,
   `view_team`, `committee`, `shortlist`, `interviews`, `propose`, `approve`, `release`,
   `export`; `view` always), a scope (the whole campaign, some positions, or only what is
   confided to them: their assignments and the interviews they hold) and an end date (at most 18
   months). Nobody hands out a power they do not hold themselves in that campaign. Revoked,
   expired, or with the membership no longer active: nothing, at the very next request.

`private.application_can(user, application, power)` is the single answer every function asks. It
refuses, whatever the route: a draft; the candidate themself; anyone with a non-withdrawn
application in the same campaign; anyone with an open (or reassigned) conflict on that
application. The key route also stops at the campaign's **seal** (its archiving, or twelve months
after it closed) for anyone who did not already hold the key then (D60): next year's officers do
not inherit last year's candidates. Historic access needs a committee appointment with a written
purpose. `private.campaign_can` answers the same for campaign-wide pages.

The navigation follows the same answers: `my_access` says, per organization, whether the person
sits on a live committee, which opens the Recrutement section without any key; every page asks
the database again.

## The workspace (pages)

| Page | What it is | Who |
| --- | --- | --- |
| `/manage/evaluations` | My work across associations: confided and not yet evaluated, interviews to hold, decisions to validate | anyone with a seat or a reading key |
| `/manage/[asso]/recruitment` | The desk; each campaign links to its review side ("N à évaluer" / "Candidatures") | editors, reading keys, committee members |
| `…/[campaign]/suivi` | Counts within the person's own scope, per position, the rules | `view` |
| `…/[campaign]/candidatures` | Filters (name or reference, position, stage, review state, reviewer, label, dates, order), pages of 25, bulk: confide, move on, invite to interview; the CSV export | `view`; bulk per power |
| `…/candidatures/[application]` | Answers on their form version, files, questions, reviews (one's own; others with `view_team`), interviews, team discussion with mentions, decision and offer, labels, assignment, conflicts, the team's history, who opened what | `view`; each block per power |
| `…/[campaign]/entretiens` | Open slots (a day, start times, duration, mode, place or link, interviewers), waiting invitations, the calendar | `view`; organizing with `interviews`; an interviewer sees their own slots |
| `…/[campaign]/decisions` | Places per position, ready to decide, to validate, validated (release several at once, now or later), announced, the waiting-list order | `propose`, `approve`, `release` or `view_team` |
| `…/[campaign]/comite` | Members (appoint, change, end), who reads through a position, the rules, the two grids, message templates, labels, conflicts, the access log | `view`; changes with `committee` |
| `/manage/donnees` | Data-rights requests | the privacy officer only |

A committee-only member opening the campaign editor is sent to its review side. Every page says
when the person is themself a candidate in the campaign (and then sees nothing).

## Work distribution

`assign_recruitment_reviews(campaign, applications[], members[], mode)`: `each` gives every chosen
person every application, `balanced` gives each application to the least loaded person; row by
row the database skips what it must (out of scope, conflict, own application, already confided,
decided or withdrawn) and says so. `unassign_recruitment_review` removes a line nobody started.
`set_recruitment_review_policy` sets the required number of reviews (0–5, default 1) and the
approval policy (second factor).

## Grids, reviews, conflicts

- **Grids** (`recruitment_rubric_versions`): one for applications and one for interviews, each
  with one draft (saved with an edit version: two people cannot overwrite each other) and one
  published version, frozen. Up to 12 criteria: a label, what is looked at, a maximum (2–10), a
  weight (1–10), required or not. Criteria are about the application and the position, never about
  who the person is. Publishing a new version leaves the reviews made with the old one as they
  were.
- **A review** (`recruitment_reviews`): a score per criterion, a recommendation (present, see in
  interview, retain, waiting list, do not retain, undecided) and a note. The total is the plain
  weighted sum over the criteria scored, shown with its basis ("13 weighted points out of 20, 2
  criteria scored: 65 %"); the app and `private.review_total` compute it the same way. A draft is
  private; submitting needs every required criterion; a submitted review changes only by a
  correction with a reason, kept in `recruitment_review_revisions`. Reviews are blind: the others'
  reviews, the averages and the discussion need `view_team`. Nothing ranks, sorts or decides by
  score.
- **Conflicts**: anyone working on an application can declare a personal link; they lose access
  at once. Whoever holds `committee` clears it or keeps the person away (with a reason).
- **Labels** and **comments** (with mentions, retractable by their author) are internal.

## The candidate's view and the pipeline

The team's pipeline (`application_pipeline`: new, under review, shortlisted, interview, moved by
`move_recruitment_applications` with `shortlist`) is never shown to the candidate. They see
`private.candidate_status` only: sent, being examined (once a review started), a question to
answer, an interview to book or booked, an offer (with its deadline), accepted / declined /
expired / withdrawn, not selected, waiting list, withdrawn. A proposed or validated decision, a
shortlist, a score, a note or a reviewer's name never reach them. Their timeline stays
`application_events`.

## Questions to the candidate

`request_clarification` (`shortlist`): one open question at a time, an optional deadline (it can
be extended, with the history kept), optionally files. The candidate answers once from their
application page; files go through the Phase 8 upload route with `clarification_id` (same content
checks, their own session) and only before the answer is sent. What was sent never changes.

## Interviews

- Slots (`interviews`): one candidate per slot (unique index), an interviewer never in two
  overlapping slots, in person (a place, required), online (a https link) or by phone. Changing a
  booked slot's details or cancelling it tells the person.
- `invite_to_interview` (several at once): the person chooses a free slot from their page;
  `book_interview_slot` is atomic (two people on the last slot: one gets it). They can change until
  24 hours before. The link is given only once booked, and only to them and the team.
- `reschedule_interview`, `cancel_interview` (with a reason, told), `complete_interview` (held or
  no-show). Interviewers named on a slot see the application booked on it and can assess the
  interview with the interview grid.

## Decisions and offers

- `propose_recruitment_decision` (`propose`): retain (offer), waiting list or do not retain, a
  rationale for the team and an optional message for the person. One pending decision per
  application.
- `approve_recruitment_decision` (`approve`, second factor) under the campaign's policy: one
  approval, two by different people, or one plus the presidency's. Fewer reviews than required
  needs a written reason; retaining beyond a position's places needs one too, checked under the
  position's lock with the offers already made (`private.position_offers`). Returned and
  cancelled proposals stay on record.
- `release_recruitment_decisions` (`release`, second factor): validated decisions reach their
  candidates, now or at a set time (the 5-minute job, which checks the scheduler still holds the
  power and the application is still open). An offer gets an optional answer deadline. The
  message is the decision's own, else the campaign's template, else the standard words; templates
  accept only `{prenom}`, `{association}`, `{recrutement}`, `{poste}`, `{reference}`, replaced as
  text.
- Offers: `respond_to_recruitment_offer` (the candidate; a repeated answer changes nothing),
  `withdraw_recruitment_offer` (`release`, a reason, second factor); expiry by the job.
- Waiting list: an order the team sets (`order_recruitment_waitlist`); when a place frees up,
  nothing happens by itself: someone proposes to retain the next person, validated like any
  decision, which supersedes the waiting-list one.
- **Onboarding**: once an offer is accepted, someone who may invite members starts
  `start_recruitment_onboarding` (optionally a non-office position and a mandate end): the usual
  Phase 4 invitation, accepted by the person. No right is given before, and an office is never
  handed out this way.

Withdrawing an application cancels its interviews, questions, pending decisions and offers, and
tells the people working on it; cancelling a campaign stops the same.

## Messages

Candidate kinds (interview invited / scheduled / rescheduled / cancelled, question asked /
extended / reminder, offer and its reminder / expiry / withdrawal, not selected, waiting list) and
team kinds (assigned, mention, answer received, interview booked, decision to validate, offer
accepted / declined, candidate withdrew) go through `notification_outbox` in the transaction of
the step they report. Payloads never carry a score, a note or another candidate's name; team
messages link only into the workspace (`teamLink` allows `/manage/evaluations` and an
application's page, nothing else).

## Files

A team member downloads through `GET /api/recruitment/documents/<id>`:
`public.recruitment_document` checks the `documents` power and records the opening; the Storage
read policy then lets that same person read that one file for two minutes, checking the power
again; the route streams it as an attachment (`no-store`, `nosniff`, sandboxed). No signed URL, no
privileged key (D66). **No virus scanner exists**: files are only ever served as downloads, never
displayed inline (D69); the BDE decides whether to add one before real campaigns.

## Export

`POST …/[campaign]/export` (`export`, second factor, audited with the row count): reference,
name, programme, year, position, dates, status, stage, number of reviews, average, decision,
offer. Never an answer, a note, a score detail, an e-mail or a file. Cells that a spreadsheet
would read as a formula are neutralised; the request must come from the site itself.

## Data rights, retention, records

- **Privacy officer** (`platform.privacy.requests`, a platform role provisioned by the project
  owner with `private.provision_privacy_officer`; never the BDE offices or the guardian):
  `/manage/donnees` compiles everything held about one person's applications, internal
  assessments included, for an access request, and erases an application with everything about
  it (its files are queued for deletion). Both need a written reason and the second factor, and
  are audited about the person concerned.
- **Retention** (`purge_recruitment_data`, nightly): Phase 8's durations, plus one for
  applications that ended with an accepted offer (`selected_retention_months`, set by the BDE
  with the others). Nothing is erased while a duration is undecided. Reviews, notes, interviews,
  questions, decisions and records leave with their application.
- **Records**: `application_activity` (the team's history of an application) and
  `application_access_log` (who opened which application or file; one line per person per half
  hour for an application), both append-only; the governance audit gets one line per material
  step, without the candidate's identity or the outcome.

## Tests

- `supabase/tests/database/recruitment_review.test.sql` (pgTAP, 249 checks): the access matrix
  (§116: keys, committee powers and scopes, conflicts, fellow candidates, another association,
  the BDE, the guardian, the seal, historic access with a purpose), each workflow (§117–123:
  grids, reviews and corrections, assignments, pipeline, questions with files, interviews and
  slots, decisions under each policy with capacity and overrides, release now and scheduled,
  offers and expiry, waiting list, onboarding, withdrawal cascade, templates, export, data
  rights, retention) and the regressions (§124).
- `supabase/tests/concurrency/review.sh`: five races in real parallel sessions (eight candidates
  on one slot, two opposite proposals at once, two approvals for the last place, one release from
  two sessions, an offer accepted in five tabs).
- `src/lib/recruitment/review.test.mjs`: the score arithmetic, the grid checks, placeholders, the
  spreadsheet-safe export, the team's words, what candidates are told, message links.
- `e2e/review.spec.ts`: on the local stack, Paul evaluates Nina's application, validates and
  announces an offer, Nina accepts it; another association's member opens nothing; the export is
  same-site only.

## Known limits

- No malware scanning (above). No calendar invitations (.ics) or video-conference integration:
  the link is typed by the team. E-mails go out only once the e-mail worker is configured
  (Phase 7); until then messages are in Notifications.
- Recommendations and decisions are free choices of the people involved; the platform records
  them, it does not check them against any criterion.
