# Data-subject rights: procedure

Migration `20261103215843_create_privacy_rights.sql`; tests
`supabase/tests/database/privacy.test.sql`, `src/lib/privacy/privacy.test.mjs`,
`e2e/privacy.spec.ts`. Pages: `/account/privacy` (the person),
`/manage/donnees` and `/manage/donnees/demandes/<id>` (the privacy officer).

## Roles

- **The person** sees and files their own requests only (`my_privacy_overview`,
  `submit_privacy_request`, `withdraw_privacy_request`, `privacy_artifact_payload`).
- **The privacy officer** — platform role `privacy_officer`, key
  `platform.privacy.requests`, provisioned outside the site by the project
  owner (`private.provision_privacy_officer`, Phase 9). Every officer function
  requires that key **now** and a session with the second factor. Not the BDE
  offices, not the guardian (tests: both refused). The officer cannot handle
  their own request (`privacy_self_handling`).
- Nobody else: no association, no BDE office, no API role can read
  `privacy_requests`, its events or its exports (RLS on, nothing granted).

## The self-service download

`/account/privacy` › **Télécharger (JSON)** → `POST /account/privacy/export`
→ `public.my_personal_data()`: the account (e-mail, dates), profile,
memberships, positions, platform roles, delegations, committee seats, public
team profiles, invitations, registrations, applications (answers, file names,
the status shown to the candidate, questions asked, interviews, offers,
history), saved items, interests, notification choices and history, reports
filed, privacy requests, and a list of what is **not** included (internal
evaluations, other people's data, the files themselves, security logs).
Built on demand, never stored, `Cache-Control: private, no-store`, ten a day,
each export recorded in the audit (never its content). Files are downloaded
one by one from the application page (existing candidate route).

## A request, step by step

1. **Received** — from the account (identity: the session, recorded as
   `session` or `session_mfa`), or recorded by the officer from a letter or
   e-mail when the person lost access (`record_offline_privacy_request`,
   identity `pending`). The person and the officer are notified (reference
   only, e-mails neutral).
2. **Deadline** — `due_at` = end of the same date one calendar month later
   in Paris (31 January → end of 28/29 February), `private.privacy_due_at`.
3. **Identity** — the officer records how it was verified
   (`verify_privacy_request_identity`). A signed-in request needs nothing
   more; a lost-access request is checked with what suffices (an exchange
   from the school address, a question only the person can answer) — **no
   identity document by default**. Ambiguous cases stay `pending`; nothing is
   disclosed or erased while identity is not established (the database
   refuses).
4. **Decision** — `approved`, `partially_approved` or `refused`; a partial
   answer or a refusal carries its reason, shown to the person, who is told
   they may complain to the CNIL.
5. **Extension** — once, of one or two months, only before the first month
   ends, with the reason sent to the person (`extend_privacy_request`). Never
   automatic.
6. **Execution**
   - Access / portability: `prepare_privacy_export` → the person downloads it
     from Mes données for 14 days (counted, recorded); the hourly
     `privacy-housekeeping` job purges it after. For an access request the
     officer may include the **evaluations** of the person's applications
     (scores, recommendations, notes, released decisions) **without reviewers'
     names and without team comments**: the officer assesses third-party
     rights first; the assessment is theirs, case by case.
   - Rectification: profile fields are self-service; for other records the
     officer corrects through the module concerned or records a statement in
     the request's history. Frozen evidence (a submitted application) is not
     rewritten silently: an answer that must go is removed by erasing the
     application (`privacy_erase_application`, Phase 9) or by the candidate's
     new application.
   - Erasure: see below.
   - Restriction, objection, consent withdrawal, other: assessed by the
     officer; consent withdrawals the person can do directly (public team
     presentation, optional e-mails) are pointed out.
7. **Completed** — only when what was decided is done: an access request
   needs its export, an erasure needs every queued file deleted from Storage
   (`privacy_erasure_pending` otherwise). The person is notified.
8. **Reminders** — the hourly job tells the officer every day from seven days
   before the deadline.

## Erasure

- The plan (`privacy_request_detail` → counts, responsibilities, holds) is
  shown before anything happens.
- **Responsibilities** (offices, platform roles, committee seats,
  delegations) block the erasure until the officer confirms they end now;
  the governance checker (Phase 11) then reports the vacancy to the right
  people. This never becomes a permanent obstacle.
- **Holds** (`retention_holds`): a held person is not erased; held
  applications or registrations stay, the rest goes.
- The officer types the reference to confirm (`execute_privacy_erasure`).
- `private.erase_person` ends responsibilities, deletes applications (with
  answers, files, evaluations, interviews, decisions, offers),
  registrations (a freed seat goes to the waiting list), saved items,
  interests, notifications and choices, follows, public team presentations,
  pending invitations to the address (others anonymised), unlinks content
  reports, turns the profile into "Compte supprimé", queues the CVs and the
  photo for Storage deletion, removes the e-mail and metadata from the
  account, deletes identities, sessions, refresh tokens and MFA factors, bans
  and soft-deletes the account row, and writes a one-way key in the ledger.
  Re-running it changes nothing.
- **Kept, pseudonymous:** membership and mandate history, the audit log
  (actor/subject ids, no names or e-mails in details), evaluations the person
  wrote about *other* candidates as a reviewer, content they wrote for an
  association, and the request record itself. These rows point to an account
  that no longer identifies anyone; whether some must also go is a controller
  decision (`launch-checklist.md`).
- Verified on the hosted project (rolled back): e-mail removed, account
  banned and soft-deleted, identities gone, profile anonymised.

## After a restore

A restored database brings back an old ledger too: first import the latest
copy of the ledger kept outside the database (**Réimporter la copie du
registre**, `public.import_erasure_ledger`; the officer downloads a copy after
each erasure, `public.export_erasure_ledger`), then run
`select private.reconcile_erasures();` as the owner (SQL editor) or the
officer's **Refaire les effacements** before reopening the site: every
account whose key is in the ledger and that came back identifiable is erased
again (test: restore simulation in `privacy.test.sql`), then the restored
CVs, documents and photos that no row points to are queued for deletion
(`private.queue_storage_orphans`, older than a day). Restore Storage first
(`docs/operations/backups-and-restore.md`).
