# Security verification (Phase 15)

Reference: **OWASP ASVS 5.0**, used as a checklist scoped to this platform (a server-rendered Next.js site on
Supabase: Postgres with RLS, Auth, Storage, Edge Functions). **This is not a claim of ASVS conformance** and not a
penetration test by an independent party: it is the developers' verification with automated tests and targeted
manual attacks on local and development environments (never production, never a third party's service).

## Scoped checklist (by ASVS 5.0 chapter)

| Chapter | Applies because | What was verified (evidence) | Gaps |
|---|---|---|---|
| V1 Encoding & sanitization | User text in pages, rich text, CSV exports | React escaping; rich text is validated JSON rendered by `RichText` (no HTML); CSV cells neutralised (unit `csv.ts`); JSON-LD escaped | — |
| V2 Validation & business logic | Registrations, applications, decisions, successions | Every rule in the database (types, CHECKs, functions); concurrency invariants (`*.sh`, `integrity.sh`) | — |
| V3 Web frontend | Browser pages | CSP with per-response nonce, `strict-dynamic`, no `unsafe-inline`/`eval` for scripts; `frame-ancestors 'self'`; `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS; no third-party script (`security.spec`, `privacy.spec`) | Session cookie readable by scripts (library default) — mitigated by the CSP; HSTS only effective on the real HTTPS domain |
| V4 API & web service | PostgREST RPC, route handlers | 32 functions for visitors (all `public_*` readers, search, health, token unsubscribe); 313 for signed-in users, 276 starting with `require_actor()`; no table writes for API roles; worker functions closed (`security_matrix.test`) | Result caps spot-checked (search 24/page, lists with limits), not audited function by function |
| V5 File handling | CVs, documents, images | Magic-byte type checks, size limits, allowed types, random object paths, attachment-only downloads, private buckets, uploads through the person's own session; images re-encoded (sharp) | **No malware scanning (F4)** |
| V6 Authentication | Sign-in | E-mail code, school domain only (hook), TOTP, step-up (`aal2`) server-side, test-account sign-in off unless `AUTH_TEST_ACCOUNTS=on` | Production Auth settings (time-box, SMTP) not set yet (Phase 16) |
| V7 Session management | Cookies, JWT | **D10 fixed**: an ended session (sign-out, everywhere, erasure, time-box) is refused at once by the database and the site; personal pages `no-store` | Time-box/inactivity values to choose (F7) |
| V8 Authorization | Everything | Cross-user matrix (66 checks + 13 session checks) at the database, as each persona, with positive controls; revocation and expiry take effect at the next call (`security_matrix.test`, `recruitment_review.test`, `timezone.test`) | — |
| V9 Self-contained tokens | Supabase JWT | Signature verified (`getClaims`); session liveness checked (D10); role claims never used for authorization (roles from mandates) | — |
| V10 OAuth/OIDC | — | Not used (SSO switched off) | — |
| V11 Cryptography | Hashes, tokens | Platform crypto only (Supabase); one-way keys (`sha256`) for the erasure ledger and suppression lists; random tokens for workers in Vault | — |
| V12 Secure communication | HTTPS | Supabase over HTTPS; the site's host not chosen | TLS of the production host (Phase 16) |
| V13 Configuration | Env, headers, secrets | Only the URL and publishable key public; secret scan of 766 tracked files and of the browser bundle: 0 findings (`scripts/secret-scan.mjs`); `X-Powered-By` off (D2) | Vault secrets on dev still to create (F5) |
| V14 Data protection | Personal data | Privacy controls of Phase 14 (`docs/privacy/`); D1 fixed (erasure survives a restore) | Legal approvals (`release-readiness.md`) |
| V15 Secure coding | Dependencies | `npm audit --omit=dev`: 0; development tooling: 16 moderate (ESLint's `minimatch`), not shipped | — |
| V16 Logging & errors | Audit, logs | Audit log append-only with actor/subject ids; logs carry codes, not values; generic error messages to users | No external error monitoring (decision for Phase 16) |
| V17 WebRTC | — | Not used | — |

## Threat model review (Phase 14 model, re-tested)

| Threat | Result in Phase 15 |
|---|---|
| Privilege escalation, self-appointment | Refused (`security_matrix.test`: member appointing themself, student creating an association; `governance.test`: guardian never self) |
| Broken object-level authorization / ID enumeration | Another student's application, CV, notification, saved items, privacy request: refused or invisible; "not found" used on purpose (`security_matrix.test`) |
| Cross-association leaks | Sports president / Finance officer on Finance data and Sports content: refused |
| Public CV exposure | No public bucket; anonymous and student listing of Storage objects: nothing; upload into someone else's folder: refused |
| Stale permissions | Revoked reviewer refused in the same session; expired officer refused; mandate boundary to the microsecond |
| Session theft | **Was possible for 60 minutes after sign-out (D10) — fixed** |
| Stored XSS | No HTML rendering path; CSP would block an injected script; no violation on 19+ pages |
| SQL injection | No dynamic SQL built from input in API functions; search uses parameterised `websearch_to_tsquery`; plpgsql lint in CI |
| CSRF | Server Actions' origin check; route handlers require the site's `Origin` (privacy exports, ledger copy: `privacy.spec`, ledger check); cookies `SameSite=Lax` |
| SSRF | The server never fetches a user-supplied URL (external registration links are stored, validated `http(s)`, never fetched) |
| Notification spoofing | Notifications only through `private.notify`; no API insert; links rebuilt from ids |
| Forged governance approvals | Approvals bound to current officeholders, distinct people, one open transition per organization (`governance.test`, `integrity.sh`) |
| Sensitive report disclosure | Statistics suppress small groups; no candidate data in figures (`analytics.test`, `security_matrix.test`) |
| Backup exposure / erased data returning | Restore drill: erased data returns with an old backup unless the ledger copy is imported — **D1 fixed** |
| Denial of service | Database rate limits (registrations, applications, broadcasts, privacy requests, exports); `/api/search` in-memory limiter (per server instance — weaker on several instances) |

## API review notes

- Anonymous surface: `public_*` readers (published content only), `search_campus`, `platform_heartbeat`,
  `peek_unsubscribe_token` / `unsubscribe_with_token` (random token, one person, one topic).
- Every mutation is a `security definer` function with `search_path = ''` (posture checks in pgTAP and
  `security_health()`); no function takes the time of an authorization check from the caller.
- Errors: functions raise short codes; the site maps them to French sentences; database details are never shown.

## Uploads

Allowed: PDF, DOCX, JPEG, PNG (CVs and documents); JPEG, PNG, WebP, GIF, AVIF (images, re-encoded). Refused by
content, not by name or declared type: wrong magic bytes, spoofed MIME, empty, oversized, DOCX with macros (Phase 8
unit tests in `src/lib/recruitment/documents.ts`). Object names are generated (UUID); the original file name is
metadata only. Downloads are attachments with `nosniff`. **Malware scanning is not implemented** (F4): either a
scanning provider (a processor, needs a DPA) or an accepted risk, decided by the controller.

## Cache isolation

Personal pages and downloads: `Cache-Control: private, no-store` (including the sign-in redirect, D3); pages render
with the visitor's session; no shared cache layer, no search projection (D88/D93); public pages carry no personal
data. Verified with header tests in `security.spec`.
