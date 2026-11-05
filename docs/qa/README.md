# Quality assurance (Phase 15)

How the platform is tested, where the evidence is, and what is not covered.
Phase 15 is a verification phase: no new product module, fixes and tests only.

| Document | What |
|---|---|
| [traceability.md](traceability.md) | Phases 1–14 feature by feature: implementation, authorization, tests, status |
| [security.md](security.md) | OWASP ASVS 5.0-scoped checklist, threat model review, API, uploads, headers, secrets, dependencies |
| [accessibility.md](accessibility.md) | WCAG 2.2 AA audit: scope, methods, results, remaining work |
| [performance.md](performance.md) | Targets set before measuring, conditions, lab results |
| [reliability.md](reliability.md) | Concurrency, failure and recovery, restore drill, workers, time zones |
| [defects.md](defects.md) | Defect register (found, fixed, open) |
| [release-readiness.md](release-readiness.md) | Release checklist, GO / NO-GO, production prerequisites, Phase 16 hand-off |

## Environments and isolation (brief §9–§10)

| Environment | What it is | Data | E-mail | Who may write |
|---|---|---|---|---|
| Local check database | PostgreSQL 18 on the developer's machine, every migration + `supabase/seed.sql` (no Auth/Storage services) | Seed, fictional | none | the developer |
| CI | GitHub Actions: `supabase db start`/`supabase start` on the runner (Docker), fixed demo keys of the CLI | Seed, fictional, thrown away | Mailpit (caught) | the workflow; **no secret, no hosted project** |
| Development / staging | Hosted `verypinkclub-dev` (Supabase, Paris) | Fictional accounts only (`*@comptes.example.test`) | `capture` (nothing sent) | the project owner |
| Production | **Does not exist** (Phase 16) | — | — | — |

Safeguards: the concurrency scripts and the restore drill refuse any database that is not on this machine
(`supabase/tests/concurrency/_local-only.sh`, `restore-drill.sh`); `npm run db:reset` resets the local stack only;
the CI holds no credential; `AUTH_TEST_ACCOUNTS` (password sign-in for fictional accounts) is never set in
production; the seed is never loaded into a hosted project. Differences from production: the local stack runs the
same migrations and Auth/Storage versions as the CLI pins (2.120.0), with demo keys; the hosted dev project is on a
free plan (no backups, no custom SMTP, Auth settings partly default — `launch-checklist.md`).

## Tools actually used

| Layer | Tool | Where |
|---|---|---|
| Database logic, RLS, grants, functions | pgTAP (`supabase test db`; locally a shim) | `supabase/tests/database/*.test.sql` (15 files, ~1,900 assertions) |
| Concurrency | Real parallel `psql` sessions | `supabase/tests/concurrency/*.sh` (8 scripts, in CI) |
| Backup / restore | `pg_dump -Fc` / `pg_restore` into a new database | `supabase/tests/restore/restore-drill.sh` (local only) |
| Pure logic | Node's test runner (`npm run test:unit`, coverage `npm run test:coverage`) | `src/**/*.test.mjs` (232 tests) |
| Browser end-to-end | Playwright 1.63 on the production build (`next start`) and the local stack | `e2e/*.spec.ts` (83 tests; 91 runs with Firefox, WebKit, iPhone) |
| Accessibility | `@axe-core/playwright` 4.14.0 (WCAG 2.0/2.1/2.2 A+AA) + keyboard, reflow, motion checks | `e2e/accessibility.spec.ts` |
| Security headers / CSP | Playwright | `e2e/security.spec.ts`, `src/lib/security/csp.test.mjs` |
| Secrets, dependencies | `scripts/secret-scan.mjs` (repository + browser bundle), `npm audit --omit=dev` | CI app job |
| Types | `supabase gen types` compared structurally | CI database job |
| Performance | Playwright + Chrome DevTools Protocol throttling (lab) | `performance.md` (local, not in CI) |

Not used: k6 or another load generator (the bounded load cases are the concurrency scripts and the search/analytics
budgets); visual snapshot baselines (screens change with seed dates; see `accessibility.md`).

## Test personas (brief §12)

Seed accounts (`supabase/seed.sql`, local stack and CI only; password `seed-local-password-2026`):

| Persona | Seed identity | Notes |
|---|---|---|
| Anonymous visitor | none (`anon`) | |
| Eligible student | Tom, Nina, new `*@student.example.test` sign-ups | Sign-up limited to the allowed domain (`auth.test.sql`) |
| Ineligible account | any other domain | refused by the before-user-created hook (`auth.test.sql`, `e2e/auth.spec.ts`) |
| Ordinary member | Julie in Sports; tests' `m3` | |
| Communications / events officer | Lucas (Finance: Communication + Événements, `members.invite` delegated) | |
| Recruitment manager, president | Julie (Finance), Emma (Sports) | |
| Assigned / unassigned / revoked reviewer | created by `recruitment_review.test.sql`, `security_matrix.test.sql` (`m4`) | |
| BDE president / vice-president | Alice / Marc | |
| School Responsible (guardian) | Garance | |
| Expired officer | Hugo (treasurer mandate ended) | |
| Suspended member | Sarah | |
| Privacy requester / handler | Nina / Léa (provisioned in `privacy.test.sql`) | |

On the hosted dev project the fictional accounts are `membre@`, `responsable-asso@` (also privacy officer for
30 days), `president-bde@`, `vp-bde@`, `garant@`, `candidat-a@`, `candidat-b@`, `comite@` (`@comptes.example.test`);
their passwords and second-factor keys are only in the git-ignored `test-accounts.local.md`. Browser session files
are never written to disk by the suite (each test signs in), and the CI keeps no traces or videos.

## How to run

```bash
npm run typecheck && npm run lint && npm run test:unit
npm run scan:secrets
npm audit --omit=dev --audit-level=high
npm run db:start && npm run db:reset && npm run db:test      # local Supabase stack (Docker)
bash supabase/tests/concurrency/integrity.sh "$(supabase status -o json | jq -r .DB_URL)"   # and the 7 others
npm run build && npx next start -p 3020 & npx playwright test # e2e on the local stack, as in CI
```

The CI (`.github/workflows/ci.yml`) runs all of this on every push except the restore drill and the performance
lab, which need a developer machine.

## Release gates (brief §98)

Mandatory on every push (a red job blocks the release): typecheck, lint, unit tests, secret scan of the repository
and of the browser bundle, `npm audit` (no high/critical in production dependencies), production build, database
reset from scratch, every pgTAP file (including `security_matrix.test.sql`), every concurrency script,
plpgsql lint, generated types, every end-to-end test (Chromium, Firefox, WebKit, iPhone emulation, accessibility,
CSP, session replay). No test is retried (`retries: 0`). Release policy: no open P0/P1 (`defects.md`).
