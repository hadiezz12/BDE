# Release readiness (end of Phase 15)

## Recommendation: **NO-GO**

The software has no open P0 or P1 defect: the two found in this phase (D1, D10) are fixed and covered by tests,
and the release gates run on every push. **The platform is still not fit to open to real students**, because
launch-blocking institutional and legal decisions are missing and because production does not exist yet:

1. No identified data controller, contact or DPO decision; the privacy notice and legal notice are unapproved drafts (F3, L1–L2, L5, L7).
2. No retention period decided: everything is kept indefinitely (F2, L4).
3. No production project, host, e-mail provider, processor agreements or transfer assessment (F8, F9, L6).
4. No domain (the BDE buys it): no production Auth redirects, SMTP sender, HSTS.
5. No production privacy officer, guardian or BDE officers bootstrapped.
6. Backup and Storage restore of the real provider not executed (only a local database drill).
7. Malware scanning of uploaded CVs undecided (F4); recruitment AIPD not done (L8).

A **GO** needs all of these closed in Phase 16 and the deployment smoke tests below passed. A *conditional GO*
is not appropriate: items 1–5 are legal or operational preconditions, not deferrable defects.

## Release checklist (brief §115)

**Application**
- [x] Clean build passes (CI app job)
- [x] Critical routes work (e2e: public, student, president, BDE, guardian, privacy journeys)
- [x] No blocking functional defect open (`defects.md`)

**Database**
- [x] Migrations reproducible from scratch (CI reset on every push; types compared)
- [x] RLS tests pass (`security_matrix.test`, all pgTAP)
- [x] No unauthorized grants (posture checks; `security_health()`)
- [x] Critical constraints tested (capacity, one open transition, autosave versions, office overlap)

**Security**
- [x] No open P0/P1
- [x] Secrets protected (scan of repository and bundle: 0)
- [x] MFA on sensitive actions verified (`mfa_required` refusals)
- [x] Private Storage secured (no public bucket; matrix)
- [ ] Session time-box/inactivity values set in production Auth (F7)
- [ ] Malware scanning decision (F4)

**Privacy**
- [x] CV access isolation verified (10 personas)
- [x] Data-rights workflows tested (`privacy.test`, `privacy.spec`)
- [x] No tracker; no banner needed (verified in three engines)
- [ ] Retention configured (blocked safely: nothing deleted until decided)
- [ ] Required legal approvals obtained

**Reliability**
- [x] Worker failure / retry tested
- [x] Notification outbox tested
- [ ] Backup coverage verified on the real provider (database and Storage)
- [x] Recovery procedure documented (`docs/operations/backups-and-restore.md`, corrected for D1)

**UX / UI**
- [x] Core mobile journeys pass (emulation)
- [x] Accessibility findings reviewed and fixed (WCAG 2.2 AA automated + keyboard/reflow/motion)
- [ ] Screen-reader and real-device checks
- [x] Critical visual defects resolved (D7 reflow); D12 (font swap shift) open, low

**Operations**
- [ ] Technical owner identified (institutional)
- [x] Governance recovery verified (tests)
- [ ] Monitoring configured (`/api/health` exists; no subscriber; no error monitoring)

## Production prerequisites (brief §112) — not done, Phase 16

| Prerequisite | State |
|---|---|
| Production Supabase project, under an organization the institution controls, paid plan with backups (PITR), region EU | Not created |
| Hosting for the site (EU region next to the database), TLS | Not chosen |
| Domain (bought by the BDE), DNS | Not bought |
| Sending domain for e-mail, SPF/DKIM/DMARC, Brevo (or other) account and DPA | Not done; dev runs in `capture` |
| Auth configuration: site URL, redirect URLs, e-mail code templates, custom SMTP, allowed school domain `grenoble-em.com`, MFA, session time-box/inactivity | Not done (dev partly default) |
| Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`; **never** `AUTH_TEST_ACCOUNTS`, never a secret key in the site | To set |
| Edge Function secrets (`notifications-worker`: Brevo key) and Vault tokens (`notifications_worker_token`, `notifications_webhook_token`, `storage_cleanup_token`, ...) | To create in production |
| Storage buckets (created by migrations) and an off-database copy of files and of the erasure ledger | Procedure written, not set up |
| Monitoring: an uptime check on `/api/health`, alert recipients; optional error monitoring (a processor) | Not set |
| Recovery contacts, technical owner, guardian, first BDE officers (`private.bootstrap_governance`, real people chosen by the BDE) | Not named |
| Controller details, notice approval (`/manage/donnees` › Notice), legal notice, retention decisions, AIPD, privacy officer | Not given |

## Legal and institutional blockers (brief §113)

Unchanged since Phase 14 (`docs/privacy/launch-checklist.md`): L1 controller, L2 contact / DPO, L3 legal bases,
L4 retention, L5 notice approval, L6 providers and transfers, L7 publisher, L9 privacy officer, L13 breach roles
— all **open and launch-blocking**; L8 AIPD recommended before launch; L10–L12, L14 open, non-blocking. The site is
not validated by GEM: it must not be presented as an official school service. Whether RGAA applies is to be
checked (`accessibility.md`).

## Phase 16 hand-off: deployment checklist

1. **Decisions first** (blockers 1–7 above), recorded in the register and the notice.
2. **Production Supabase project** (institutional organization, EU, backups): run `npx supabase db push` from a
   clean checkout (dry-run first); never load `seed.sql`; generate and compare types; once the BDE officers exist, read the security self-check (Continuité › Opérations, `security_health()`).
3. **Auth**: site URL and redirects on the bought domain, custom SMTP, templates (`supabase/templates/`), the school
   domain in `private.allowed_signup_domains`, MFA, session time-box and inactivity timeout.
4. **Secrets**: Vault tokens and Edge Function secrets in production only; rotate nothing that dev used.
5. **Edge Functions**: deploy `notifications-worker`, `notifications-webhook`, `storage-cleanup`; e-mail mode `off`
   → `capture` → `live` only after the provider's DPA and DNS checks.
6. **Hosting**: environment variables; build; HSTS effective on HTTPS; check the CSP on the real host (Supabase origin in `connect-src`).
7. **Bootstrap**: the guardian, the BDE president and vice-president (real people, by the project owner), then the privacy officer.
8. **Monitoring**: uptime check on `/api/health`; who receives alerts.
9. **Backups**: confirm PITR; set up the off-database copies (Storage files, erasure ledger); run the restore drill
   procedure on the production backups into an isolated project.
10. **Smoke tests on production** (no fake data left behind): public pages and CSP headers; sign-in with a real
    school address; second factor; one association page published by its president; an event registration and
    cancellation; a recruitment draft and withdrawal; a privacy self-export; sign-out and session replay refused;
    the security self-check (Continuité › Opérations) all `ok`.
