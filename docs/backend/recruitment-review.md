# Recruitment review and selection (Phase 9)

Phase 8 lets a student apply; Phase 9 lets the association read, evaluate, interview,
decide and announce. This page is the architecture plan written before the code, kept
as the reference afterwards. The Phase 8 rules stand: a submitted application never
changes, files stay in the private bucket, only the database decides.

## The access model

Two routes give access to an application, and nothing else does.

1. **Organization keys (Phase 4).** A position's keys apply to every campaign of its
   organization: `recruitment.applications.view`, `recruitment.documents.view`,
   `recruitment.applications.review`, `recruitment.reviews.view_team`,
   `recruitment.committee.manage`, `recruitment.applications.shortlist`,
   `recruitment.interviews.manage`, `recruitment.decisions.propose`,
   `recruitment.decisions.approve`, `recruitment.decisions.release`,
   `recruitment.applications.export`. Offices carry them all; the vice-presidency,
   the recruitment manager and the reviewer templates carry part of them (decision
   D59: an association's own leadership reads that association's applications, never
   another's; the BDE's keys are the BDE's own campaigns only).
2. **The campaign committee.** `recruitment_committee_members`: a member of the
   organization (active membership), appointed for one campaign, with a set of
   powers (`view`, `documents`, `review`, `view_team`, `committee`, `shortlist`,
   `interviews`, `propose`, `approve`, `release`, `export`), a scope (the whole
   campaign, some positions, or only the applications assigned to them) and an end
   date. Revoked, expired, or with the membership no longer active: nothing, at the
   next request (no token to wait for).

`private.application_can(user, application, power)` is the single answer used by
every function. It refuses, whatever the route: a draft, the candidate themself,
anyone with an application (draft or sent) in the same campaign, anyone with an open
conflict on that application. The key route also stops at the campaign's seal (its
archiving, or twelve months after it closed) for anyone who did not already hold the
key then (decision D60): next year's officers do not inherit last year's candidates.
Historic access needs a committee appointment with a written purpose.

No API role has any privilege on the Phase 9 tables (RLS on, no policy, no grant):
everything is read and written through the scoped functions, which log what matters.

## Data

- Committee: `recruitment_committee_members`, `recruitment_committee_positions`,
  `recruitment_review_assignments` (work lists; composite keys keep every row inside
  its campaign).
- Pipeline: `application_pipeline` (new → under review → shortlisted → interview),
  a separate table so the candidate's own row never shows it.
- Evaluation: `recruitment_rubric_versions` (JSON criteria, one draft and one live
  version per campaign and kind, frozen once published), `recruitment_reviews`
  (draft → submitted; amendments need a reason) and the append-only
  `recruitment_review_revisions`; `recruitment_conflicts`; `recruitment_tags`,
  `application_tags`; `application_comments` (mentions).
- Interviews: `recruitment_interview_slots` (one candidate per slot),
  `recruitment_slot_interviewers`, `recruitment_interviews` (invited → scheduled →
  completed / no show / cancelled; a unique index makes a slot exclusive).
- Clarifications: `recruitment_clarifications` (question, deadline and its
  extensions, one answer, frozen); files reuse `application_documents` with a
  `clarification_id`.
- Decisions: `recruitment_decisions` (proposed → finalized → released, or returned /
  cancelled / superseded), `recruitment_decision_approvals`, `recruitment_offers`
  (pending → accepted / declined / expired / withdrawn), `recruitment_message_templates`.
- Records: `application_activity` (the team's history of an application),
  `application_access_log` (who opened which application or document), both
  append-only; material steps also go to the Phase 4 governance audit, without the
  candidate's identity or outcome.

## Candidates

The candidate sees a projection, never the pipeline: received / under review,
interview to choose or scheduled, question to answer, offer to answer, not selected,
waiting list, withdrawn. Their timeline is `application_events` (new actions only for
what concerns them). Withdrawing cancels interviews, questions, pending decisions and
offers, and tells the people working on it.

## Messages

The outbox gets recruitment kinds for candidates (interview, question, offer,
outcome, reminders) and for the team (assignment, mention, answer received, offer
answered, withdrawal). A message is queued in the transaction of the decision it
reports, so a failed e-mail never undoes it; payloads carry no note, score or name of
another candidate.
