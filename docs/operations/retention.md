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
  registrations of past events, resolved continuity points.
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
   note (write where it was decided).
4. The nightly job deletes at most 5 000 rows per rule per night (a large
   backlog spreads over several nights) and records the counts in the
   history.

Deleting a notification also deletes the record of its e-mail. Governance
history (who appointed whom, when, why) is never deleted by these rules.

## Technical housekeeping (fixed)

Short-lived operating traces, not records about a person, keep a fixed,
documented duration: e-mail delivery attempts and provider events 30 days,
e-mails built in test mode 7 days, e-mail worker runs 14 days, used or
expired unsubscribe links 7 days, frozen broadcast recipient lists 30 days
after sending, job runs 30 days, the scheduler's own log 7 days. Changing one
of these is a code change (`private.run_retention`), reviewed like any other.

## Privacy requests (access, rectification, erasure, restriction, information)

- Requests about applications go to the **privacy officer**
  (`/manage/donnees`, role provisioned outside the site): candidate report,
  erasure of an application, each with a reason and the second factor, in the
  audit.
- Other personal data (profile, memberships, registrations, notifications):
  the person edits their own profile and choices in their account; anything
  else is handled by the technical owner on a written request, recorded in an
  incident (kind *Données personnelles*) without copying the data into it.
- The guardian is **not** a data-access role and must not be asked to read
  anyone's data.

## Deleting an account that still holds responsibilities

Before erasing an account, the privacy officer uses **Avant de supprimer un
compte** on `/manage/donnees`: it lists the person's ongoing positions (with
their organization and end date), transitions, delegations, committee
appointments, handover items and platform roles (the lookup is audited).
Route each through the normal workflows first (a succession, an appointment,
ending a delegation, revoking a committee seat), then process the request.
This sequencing must not become a reason to refuse a valid erasure.
