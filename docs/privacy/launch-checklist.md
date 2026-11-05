# Privacy launch checklist and open decisions

Nothing here is done by the site on its own: each line names who decides.
**Launch-blocking** lines must be closed before real students use the site.

## Legal and institutional (controller)

| # | Decision | Who | Blocks launch | Status |
| --- | --- | --- | --- | --- |
| L1 | Identify the controller (the BDE's legal form, registration, address, representative) and whether associations are joint controllers for their recruitment and events (art. 26 agreement) | BDE + adviser | **Yes** | Open |
| L2 | Contact for rights requests outside the site; appoint (or decide not to) a DPO | Controller | **Yes** | Open |
| L3 | Validate the legal basis of each activity (`processing-register.md`) | Controller + adviser | **Yes** | Open |
| L4 | Decide every retention period (`retention-schedule.md`), including accounts' inactivity and the audit log | BDE | **Yes** | Open |
| L5 | Approve the privacy notice with the missing facts, then record the version (`/manage/donnees` › Notice) | Controller | **Yes** | Open |
| L6 | Choose the production host and e-mail provider; sign DPAs; assess transfers (`processors-and-transfers.md`) | Controller + technical owner | **Yes** | Open |
| L7 | Publisher details for the legal notice (`/legal`) | BDE | **Yes** | Open |
| L8 | AIPD for recruitment (`dpia-screening.md`) | Controller | Recommended before launch | Open |
| L9 | Appoint the production privacy officer (provisioned by the project owner) | Controller → owner | **Yes** | Open |
| L10 | Policy on disclosing evaluations in access requests (names removed by default) | Controller | No | Open |
| L11 | Whether any association may ever ask special-category questions, and on what ground | Controller | No (forms are gated) | Open |
| L12 | Malware scanning of uploads (a scanning provider would be a processor) | Controller + technical owner | To decide | Open |
| L13 | Who notifies the CNIL and the people in case of a breach; approve the templates | Controller | **Yes** | Open |
| L14 | The VSS / VDH channel: keep as information only, or assess and build | BDE + controller | No (not built) | Open |

## Technical (technical owner)

| # | Task | Blocks launch | Status |
| --- | --- | --- | --- |
| T1 | Production Supabase project under an institutional organization, with backups | **Yes** | Open |
| T2 | Vault secrets for `storage-cleanup` (dev and production); the updated worker (avatars) is deployed on dev, to deploy on production | **Yes** | Open |
| T3 | Session time-box and inactivity timeout in Supabase Auth | Recommended | Open |
| T4 | Restore test on the provider: import the latest copy of the erasure ledger, then `select private.reconcile_erasures();` and the Storage orphan step (database part drilled locally in Phase 15, `supabase/tests/restore/restore-drill.sh`) | Before launch | Open |
| T5 | Nonce-based script CSP (done, Phase 15) and a penetration test by an independent party (not done: Phase 15 is the developers' verification, `docs/qa/security.md`) | Recommended before launch | CSP done; pen test open |
| T6 | Redeploy `notifications-worker` so e-mails use the Phase 13–14 words | Before e-mail goes live | Open |

## Done in Phase 14 (technical, tested)

Requests workflow with deadlines and history; self-service export; officer
exports with expiry; coordinated erasure with Storage, holds and restore
reconciliation; retention decision notes and holds; breach register with
72-hour reminders; notice versions; form-builder justification gate; public
privacy, cookies and legal pages; security headers; Next.js patched.
