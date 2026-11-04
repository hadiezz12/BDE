# Cookies and terminal storage

Everything the site reads or writes on a device, checked in the code
(`grep` for `document.cookie`, `cookies().set`, `localStorage`,
`sessionStorage`, third-party scripts) and by `e2e/privacy.spec.ts`, which
loads public pages as a visitor and fails on any request to a third-party
host or any cookie set.

| Name | Provider | Purpose | Necessary? | Consent? | Lifetime | Party |
| --- | --- | --- | --- | --- | --- | --- |
| `sb-<project>-auth-token` (chunked `.0`, `.1` when large) | Set by the site through `@supabase/ssr` | Keeps the signed-in session (access and refresh tokens) | Strictly necessary for the service the user asks for | Exempt (CNIL: authentication cookies) | Cookie max-age 400 days (library default), removed at sign-out; the session's own validity is set in Supabase Auth | First party |
| `vpc-theme` | The site (`ThemeToggle`) | Remembers light/dark chosen by the user | Chosen by the user | Exempt (user-interface personalisation chosen by the user) | 1 year, SameSite=Lax, Secure over HTTPS | First party |

No `localStorage`, `sessionStorage` or IndexedDB use. No analytics, pixel,
advertising, social button, embedded video or map. Fonts and images are
served by the site.

**Hence no consent banner.** CNIL guidance requires prior consent only for
trackers that are not strictly necessary; a banner with nothing to choose
would be decorative. `/cookies` lists the two cookies; `/privacy` links to it.

**Residual point:** the session cookie is readable by scripts
(`httpOnly: false`), as `@supabase/ssr` needs for the browser client. Any XSS
could read it: the mitigations are React's escaping, no
`dangerouslySetInnerHTML`, the JSON-only rich text (Phase 6), and the
headers in `next.config.ts`. A nonce-based script CSP is Phase 15 work.
Recommend setting session time-box and inactivity timeouts in Supabase Auth
for production (dashboard, owner).

## If an optional tracker is ever added

Audience measurement stays off (Phase 13, D97). Adding any optional tracker
means, before it ships: a purpose and a CNIL assessment written here; a
consent manager whose first screen offers "Refuser" as easily as
"Accepter"; nothing loaded before consent; a persistent "Préférences de
confidentialité" link; withdrawal that stops collection; consent records
(purpose, choice, notice version, date — no fingerprint); and tests for
each line of the brief's §108 matrix.
