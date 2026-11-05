# Requirements traceability: Phases 1–14

Built from the code, the migrations and the tests as they are (Phase 15 audit, 4–5 November 2026), not from the
briefs alone. **Status** is what the tests showed: *Pass* = automated tests ran green in CI (and locally where noted);
*Pass (manual)* = checked by hand only; *Not built* / *Deferred* = absent on purpose; *Open* = a known gap.
Authorization is enforced in the database for every row (`docs/backend/authorization.md`); the UI only hides.

Test abbreviations: pgTAP files in `supabase/tests/database/` (`x.test`), concurrency scripts in
`supabase/tests/concurrency/` (`x.sh`), browser specs in `e2e/` (`x.spec`), unit tests `src/**/*.test.mjs` (`unit`).

| ID | Ph. | Feature | Implementation (route · backend) | Expected authorization | Automated tests | Status / known issues | Release impact |
|---|---|---|---|---|---|---|---|
| F-01 | 1 | Brand, design system, public shell, footer, theme | `src/components`, `DESIGN.md`; `/`, light/dark cookie | public | `theme.spec`, `pages.spec`, `accessibility.spec`, `cross-browser.spec` | Pass; D4, D6, D7, D9, D11 fixed; D12 open (font swap CLS) | — |
| F-02 | 1 | Responsive layout, phone tab bar | header, `MobileTabBar` | public | `mobile.spec`, reflow test (320 px), iPhone emulation | Pass (emulation only) | Real-device check before launch |
| F-03 | 2 | Migrations reproducible from scratch, types | `supabase/migrations` (61), `database.types.ts` | — | CI: reset + all pgTAP + types compare + plpgsql lint | Pass | — |
| F-04 | 2 | RLS on every table, no API table writes, definer search paths | all migrations | API roles read through functions | `foundation.test`, `security_matrix.test` (posture), `privacy.test` §9, `security_health()` | Pass | — |
| F-05 | 3 | E-mail code sign-in, school domain only | `/login`, before-user-created hook | eligible domain only | `auth.test`, `auth.spec` | Pass (production domain to set, Phase 16) | SMTP + domain needed |
| F-06 | 3 | Profile, onboarding, photo | `/account/profile`, `profiles`, `avatars` bucket | self | `auth.spec`, `pages.spec`, `accessibility.spec` | Pass | — |
| F-07 | 3 | TOTP second factor, step-up for sensitive actions | `/account/security`, `private.require_aal2` | aal2 server-side | `auth.spec`, every sensitive pgTAP refusal (`mfa_required`) | Pass | — |
| F-08 | 3 | Sign-out ends access; ended sessions refused | proxy, `getAuthContext`, `private.session_alive` | live session only | `security.spec` (replay), `security_matrix.test` | **Fixed D10** | — |
| F-09 | 3 | Institutional SSO | code present, switched off (`AUTH_SSO_PROVIDER` unset) | — | — | Not built for launch (school not involved) | — |
| F-10 | 4 | Organizations, memberships, positions, mandates, delegations | `/manage/[asso]/team`, `/roles` · governance functions | scoped keys at call time | `governance.test` (163), `governance.spec`, `security_matrix.test` | Pass | — |
| F-11 | 4 | BDE two-person succession | `/manage/plateforme` · `propose/approve_bde_succession` | president + VP, distinct, both current | `governance.test`, `governance.spec`, `integrity.sh` (two proposals at once) | Pass | — |
| F-12 | 4 | Guardian (School Responsible) recovery, narrowly scoped | `/manage/continuite` · `propose_bde_recovery` | guardian, 2FA, reason, audited; never self | `governance.test` (`candidate_not_allowed`), `security_matrix.test` (no CV, no export, no publishing) | Pass | Real guardian to appoint (Phase 16) |
| F-13 | 4 | Expiry by date inside every check | `private.user_has_*_permission(…, now())` | — | `continuity.test` §2, `timezone.test` §3 (microsecond boundary), `security_matrix.test` (Hugo) | Pass | — |
| F-14 | 5 | Association pages: draft, preview, publish, media | `/manage/[asso]/settings`, `/associations/[slug]` · `association_*` | association's keys; BDE withhold only | `association_pages.test`, `pages.spec` | Pass | — |
| F-15 | 5 | Public team with each member's consent | `membership_public_profiles` | the member | `association_pages.test` | Pass | — |
| F-16 | 6 | Posts: draft → review → approve exact revision → publish | `/manage/[asso]/content` · `posts`, `post_revisions` | scoped; no self-approval where policy says | `posts.test` (146), `publishing.spec` | Pass | — |
| F-17 | 6 | Scheduled publication, moderation, reports | pg_cron worker, `/manage/plateforme/moderation` | worker only; BDE hide/restore | `posts.test`, `continuity.test` §8 | Pass | — |
| F-18 | 6 | Rich text without HTML (XSS) | `RichText`, `isSafeHref`, CSP | — | `posts.test`, unit (`document.ts`), `csp.test`, `security.spec` | Pass | — |
| F-19 | 7 | Events: create, publish, calendar, ICS, external/info-only modes | `/manage/[asso]/events`, `/events` · `events` | events keys | `events.test` (128), `registrations.spec`, unit (calendar, ics) | Pass | — |
| F-20 | 7 | Registrations, capacity, waiting list, cancellations | `register_for_event` under row lock | student; seats counted by the DB | `registrations.sh` (20 racers / 1 seat, double cancel), `integrity.sh` (capacity cut race), `events.test` | Pass | — |
| F-21 | 7 | Participant lists and exports | `event_attendees`, `export_event_attendees` | events.attendees.view/export | `events.test`, `security_matrix.test` (BDE, guardian, other asso refused) | Pass | — |
| F-22 | 8 | Campaigns, positions, form builder, frozen versions | `/manage/[asso]/recruitment/[campaign]?etape=…` | recruitment keys | `recruitment.test` (161), `recruitment.spec`, unit (`form.ts`) | Pass | — |
| F-23 | 8 | Drafts, autosave, atomic submission, limits, deadline | `start/save/submit_application` | the candidate | `applications.sh` (5 tabs, limit race), `integrity.sh` (two autosaves), `recruitment.test` | Pass | — |
| F-24 | 8 | CV upload (magic bytes, size, private bucket, attachment-only) | `/api/recruitment/...`, `recruitment-documents` | candidate; reviewers via checked route | `recruitment.test`, unit (`documents.ts`), `security_matrix.test` (10 personas refused) | Pass; **no malware scanning (F4)** | Decision needed |
| F-25 | 8 | Historical form versions | `recruitment_form_versions` | — | `recruitment.test` (answers read against their version) | Pass | — |
| F-26 | 9 | Committees, reviewer scope, conflicts, revocation | `/comite`, `private.application_can` | live seat within scope | `recruitment_review.test` (249), `security_matrix.test` (revoked same session) | Pass | — |
| F-27 | 9 | Scores, notes, interviews, slots | `/candidatures`, `/entretiens` | committee powers | `recruitment_review.test`, `review.sh` (one slot, two bookers) | Pass | — |
| F-28 | 9 | Decisions, approval, release, offers, onboarding | `/decisions` | policy; release deliberate | `recruitment_review.test`, `review.sh` (opposite proposals, double release), `review.spec` | Pass; acceptance grants no power (§47) | — |
| F-29 | 10 | Notification centre, preferences, unsubscribe | `/account/notifications` · `private.notify` | the recipient | `notifications.test` (140), `notifications.spec` | Pass | — |
| F-30 | 10 | E-mail worker: claims, retries, provider events | `notifications-worker` Edge Function | worker token | `notifications.test` §5, `notifications.sh` (4 workers) | Pass (dev in `capture`; never live) | SMTP/Brevo + DPA before `live` |
| F-31 | 10 | Broadcasts with approval and frozen audience | `/manage/[asso]/communication`, `/manage/plateforme/communication` | association / BDE + approval | `notifications.test` §9, `notifications.sh`, `security_matrix.test` (other asso / campus refused) | Pass | — |
| F-32 | 11 | Academic years, rollover, handover, governance checker | `/manage/plateforme/continuite` | BDE / guardian (availability only) | `continuity.test` (164), `continuity.spec`, `continuity.sh` | Pass | — |
| F-33 | 11 | Scheduled jobs, health, `/api/health` | `scheduled_jobs`, `run_scheduled_job` | jobs only | `continuity.test` §8, `continuity.sh` | Pass | External monitor to subscribe (Phase 16) |
| F-34 | 11 | Retention mechanism (periods undecided) | `retention_policies`, `data-retention` job | BDE + decision note | `continuity.test` §9, `privacy.test` §6 | Pass; **periods undecided (F2)** | Blocks launch |
| F-35 | 11 | Backups and restore | runbook, register | owner | `restore-drill.sh` (local real restore) | Database restore drilled locally; **provider restore and Storage restore not executed** | Blocks launch |
| F-36 | 12 | Unified search, visibility rules, saved items, interests | `/search`, `search_campus`, `save_item` | public predicates at call time; owner only | `search.test` (187), `search.sh`, `search.spec` | Pass | — |
| F-37 | 13 | Association and BDE statistics with small-group suppression | `/manage/[asso]/analytics`, `/manage/plateforme/statistiques` | section keys at call time | `analytics.test` (152), `analytics.sh`, `analytics.spec`, `security_matrix.test` (no candidate in figures) | Pass | — |
| F-38 | 14 | Privacy notice, cookies, legal pages | `/privacy`, `/cookies`, `/legal` | public | `privacy.spec`, `accessibility.spec` | Pass; **facts missing (F3)** | Blocks launch |
| F-39 | 14 | Data-subject requests, deadlines, export, erasure, holds | `/account/privacy`, `/manage/donnees` | requester / privacy officer + 2FA | `privacy.test` (195), `privacy.spec`, `timezone.test` §2 | Pass; D1 fixed | Officer to appoint |
| F-40 | 14 | No trackers, no consent banner | `docs/privacy/trackers.md` | — | `privacy.spec` (no third-party host, no cookie), `cross-browser.spec` | Pass | — |
| F-41 | 14 | Breach register | `/manage/donnees` › incidents | privacy officer | `privacy.test` §7 | Pass | Roles to decide (L13) |
| F-42 | 14 | Security headers, CSP | `next.config.ts`, `src/proxy.ts` | — | `security.spec`, `csp.test` | Pass (F6 fixed) | HSTS effective on the real domain only |
| F-43 | 1 | VSS / VDH alert form | `/vss` | — | page renders (`accessibility.spec`) | Demonstration only, sends nothing (F13) | Must not be wired without an AIPD |

Features required by earlier briefs and not found: none beyond those marked *Not built* above (SSO by decision,
VSS channel by decision, scheduled statistics summaries — Phase 13 D97).
