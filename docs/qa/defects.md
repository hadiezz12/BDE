# Defect register (Phase 15)

Severity model of the Phase 15 brief (§8): **P0** critical (blocks release) ·
**P1** high (blocks release) · **P2** moderate · **P3** low. Every fixed defect
has a test that fails without the fix (or reproduced it) and passes with it.
Findings of the Phase 14 security review keep their numbers
(`docs/privacy/security.md`, F1–F14) and are summarised at the end.

## Found and fixed in Phase 15

| ID | Title | Sev. | Phase / module | Reproduction | Root cause | Fix | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| D1 | An erasure is undone by restoring an older backup | **P1** | 14 · privacy | Erase a student after a backup, restore it into a new database, reconcile: the student is back, `reapplied = 0` | The erasure ledger lives in the database it protects: a restore brings back the old ledger too. The Phase 14 test had kept the current ledger, which a restore does not do | Ledger export / import (`export_erasure_ledger`, `import_erasure_ledger`, officer + 2FA, audited), a copy kept off the database, the desk warns when it is behind, runbook corrected | `supabase/tests/restore/restore-drill.sh` (real `pg_dump`/`pg_restore`): 9/11 before, 18/18 after; `privacy.test.sql` §5b | Fixed `506e1ba` |
| D10 | A session keeps working for up to an hour after signing out | **P1** | 3 · auth | Copy a student's cookies, sign out, replay them: `/account` opens, the personal-data export downloads, the API answers | The site verified the JWT's signature only; the database trusted the JWT; nobody asked whether the session still existed. "Sign out everywhere", an erasure and a time-box were not effective either | `private.session_alive()` (session in `auth.sessions`, before `not_after`) in `require_actor()`, restrictive policies on every directly readable table and on Storage, the site treats an ended session as signed out | `security_matrix.test.sql` (13 checks + posture), `e2e/security.spec.ts` replays the attack; on dev: `/login`, 401, API 400 | Fixed `a6b25ce` |
| F6 | No script Content-Security-Policy (Phase 14 finding) | P2 | 14 · site | — | Only `frame-ancestors`/`object-src`/… were set | Nonce per response, `'strict-dynamic'`, no `unsafe-inline`/`eval` for scripts | `csp.test.mjs`, `e2e/security.spec.ts`, 19 pages on the production build | Fixed `5925b64` |
| D2 | `X-Powered-By: Next.js` sent | P3 | 2 · config | `curl -I /` | Next default | `poweredByHeader: false` | `e2e/security.spec.ts` | Fixed `5925b64` |
| D3 | The redirect from `/account` to sign-in had no `Cache-Control` | P3 | 3 · auth | Signed-out `GET /account` | The proxy set `no-store` on the page, not on its redirect | `private, no-store` on the redirect | `e2e/security.spec.ts` (failed on CI first) | Fixed `744e27f` |
| D4 | Header link's name did not contain its visible text (every page) | P2 | 1 · a11y (WCAG 2.5.3) | axe `label-content-name-mismatch` | `aria-label` replaced "BDE · GEM Paris" | Visible text is the name, "accueil" for screen readers | `e2e/accessibility.spec.ts` | Fixed `1fa3589` |
| D5 | Editor H2/H3 buttons named "Intertitre" while showing "H2" | P3 | 6 · a11y (2.5.3) | axe on the editor | Label without the visible text | "H2, Intertitre" | idem | Fixed `1fa3589` |
| D6 | Moving strips not reachable by keyboard when they scroll (reduced motion) | P2 | 1 · a11y (2.1.1) | axe `scrollable-region-focusable` on `/` | Scrollable region without focus | `tabIndex={0}`; focus also pauses them | idem | Fixed `1fa3589` |
| D7 | Sideways scrolling on phones: the header at 320 px (every page), section rows, long buttons, a status badge ("Complet · liste d'attente") and, on Chromium for Windows, the display title "Recrutements." up to 412 px wide | P2 | 1 · a11y (1.4.10) | 320–412 px viewports | Fixed widths in the header cluster; non-wrapping rows, badges and buttons; a display size with a 36.8 px minimum for a 13-letter word in the wide font | Wordmark read but hidden below 352 px; rows and badges wrap; buttons `max-w-full`; display size `min(8.2vw, …)` below ~450 px; `overflow-wrap: break-word` on display styles | reflow test (9 public pages, CI, names what sticks out); 12 public pages × 6 widths and 12 management pages (local, Edge) | Fixed `1fa3589`, `ffcc015`, this commit |
| D8 | Image uploader: a hidden file input in the tab order, without a name | P2 | 5 · a11y (4.1.2) | axe `label` (critical) on a campaign | Unlike the other uploaders | `tabIndex=-1`, `aria-hidden`; the button opens it | axe on BDE campaign (local) | Fixed `1fa3589` |
| D9 | Studio "subtle" text 4.42:1 on sunken backgrounds | P3 | 1 · a11y (1.4.3) | axe on the committee page | Token too light | `#6b646e` (4.69:1) | idem | Fixed `1fa3589` |
| D11 | The neon headline blinked forever | P2 | 1 · a11y (2.2.2) | axe caught it mid-dim (light theme, CI) | Infinite 9-second flicker loop | Power-on flicker only (0.3–1.9 s), then steady | `e2e/accessibility.spec.ts` | Fixed `261a018` |
| D14 | With reduced motion, the neon headline sat at 15 % opacity for 0.3 s | P3 | 1 · a11y (1.4.3, 2.3.3) | Reduced motion, axe right after load | The reduced-motion rule shortened animations but kept their delays; a delayed animation shows its first frame meanwhile | Delays set to 0 under reduced motion | `e2e/accessibility.spec.ts` (headline opacity 1 at once) | Fixed (this commit) |

## Open

| ID | Title | Sev. | Module | Detail | Owner | Blocks release |
|---|---|---|---|---|---|---|
| D12 | Layout shift 0.102 on `/associations` on a cold, slow connection | P3 | 1 · performance | The display font (Archivo, expanded) arrives at ~2.6 s on "slow 4G"; the title wraps differently than in the fallback font; with fonts blocked CLS = 0. Warm visits: no shift | Design decision: `font-display: optional` (no shift, fallback font on a first slow visit) or keep the brand font's swap | No |
| D13 | The "Supabase Preview" check (Supabase GitHub integration) fails | P3 | CI | It reads `./supabase/templates/…` from inside `supabase/` (doubled path); the CLI and our CI read them correctly | Dashboard: the integration's directory setting, or turn preview branches off | No |

## Test defects found and fixed (not product defects)

- Restore drill compared grants with `string_agg(… order by 1)` (orders by a constant): fixed before any conclusion.
- Security matrix: one refusal passed for the wrong reason (`invalid_office`); the denial pattern was narrowed to authorization codes only and the guardian case asserts the exact refusal.
- CI ordering: `julie.finance` gets a second factor in `governance.spec`; the management-page CSP pass moved into `accessibility.spec` (runs first).
- The first Finance post may be a frozen submission (read-only), and only its author opens a draft in the
  editor: the editor check signs in as Lucas, the draft's author.
- `locator.isVisible()` answers at once (its `timeout` is ignored), so "is the editor live?" was always false before
  hydration: replaced by `waitFor({ state: "visible" })`.

## Still open from Phase 14 (`docs/privacy/security.md`)

F2 retention undecided (**blocks**), F3 controller / notice (**blocks**), F4 no malware scanning (to decide),
F5 Storage cleanup Vault secrets (blocks production), F7 Auth session time-box (recommended — now enforced by
D10's check once set), F8 providers and DPAs (**blocks**), F9 production project with backups (**blocks**),
F10 2-minute reviewer download window (accepted), F11 audit details (controller), F13 VSS channel (not built),
F14 development-only dependency advisories.
