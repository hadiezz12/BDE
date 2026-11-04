# Retention and privacy requests

## Who decides

How long personal data is kept is a decision of the data controller (the
BDE and the school, with whoever handles data protection for them), with a
legal basis for each period. The code proposes no period. **A policy that
was not decided deletes nothing**, and the site shows it as undecided, not as
a setting.

## Where

- **Centre de contrôle › Continuité › Conservation**: notifications, e-mail
  delivery records, notification preference history, cleared address blocks,
  registrations of past events, resolved continuity points, and since Phase
  14 closed privacy requests, closed invitations (they hold the invited
  e-mail), resolved content reports, the access log of applications and
  files, and the governance audit log (these two: twelve months at least).
- **Centre de contrôle › Recrutements**: drafts, withdrawn, unsuccessful and
  selected applications (Phase 8 settings). Deleting an application deletes
  everything evaluated about it and queues its files for deletion from
  Storage.

## How a change happens

1. Choose the duration in months (empty = keep everything).
2. Save. If the new rule would delete anything, the site answers with the
   exact number of rows and the oldest date, and asks you to type that number
   in « Nombre à confirmer ». Nothing has been deleted yet.
3. Save again with the number. The rule is recorded with your name and your
   note: since Phase 14 the note is **required** for any duration (who decided,
   when, where — 10 characters at least).
4. The nightly job deletes at most 5 000 rows per rule per night (a large
   backlog spreads over several nights) and records the counts in the
   history.

Deleting a notification also deletes the record of its e-mail. Mandates and
positions (who held what, when) are never deleted by these rules; the audit
log loses its oldest lines only under its own decided period.

**Holds** (Phase 14): the privacy officer can exempt a person, an
application, a campaign, an event or an association from every rule and from
erasure, with a purpose, a basis, who decided and a review date within a
year (`/manage/donnees` › Conservations exceptionnelles). Past its review
date a hold stops applying.

## Technical housekeeping (fixed)

Short-lived operating traces, not records about a person, keep a fixed,
documented duration: e-mail delivery attempts and provider events 30 days,
e-mails built in test mode 7 days, e-mail worker runs 14 days, used or
expired unsubscribe links 7 days, frozen broadcast recipient lists 30 days
after sending, job runs 30 days, the scheduler's own log 7 days. Changing one
of these is a code change (`private.run_retention`), reviewed like any other.

## Privacy requests (access, rectification, erasure, restriction, information)

- Since Phase 14, every request goes through **Mes données** (the person) and
  the **privacy officer** (`/manage/donnees`, role provisioned outside the
  site): deadlines, identity, decisions, exports, erasure across modules and
  Storage. Procedure: `docs/privacy/rights-procedure.md`.
- A person who lost access writes to the controller; the officer records the
  request (« Enregistrer une demande reçue hors du site ») and verifies identity
  with what suffices.
- The guardian is **not** a data-access role and must not be asked to read
  anyone's data.

## Deleting an account that still holds responsibilities

The request page lists the person's responsibilities, and the erasure refuses
to run until the officer confirms they end now (the governance checker then
reports the vacancies). Before that, the privacy officer can also use **Avant
de supprimer un compte** on `/manage/donnees`: it lists the person's ongoing positions (with
their organization and end date), transitions, delegations, committee
appointments, handover items and platform roles (the lookup is audited).
Route each through the normal workflows first (a succession, an appointment,
ending a delegation, revoking a committee seat), then process the request.
This sequencing must not become a reason to refuse a valid erasure.
