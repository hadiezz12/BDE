<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Contenu réel uniquement / Real content only

This site ships to real GEM Alpine Business School students. Every string and every data record may only state facts the BDE has given (its maquette: the Very Pink Club, its 8 events of the year, the carte cotisante, the VSS / VDH page) or real public information (national helplines such as 17, 112, 114, 3919).
Never invent an association, person, date, venue, address, price, capacity, line-up, statistic, quote, contact detail or photo to make a page look fuller: the BDE and the association presidents add the real content themselves.
Where content is missing, render a designed empty state that says who will add it, or leave the block out; never a page that looks broken. Form placeholders are fine when clearly marked "Ex : …".
Dev seed data, if ever needed, must be obviously fictitious (e.g. "Asso test 1", "Compte démo"), kept out of `src/data/mock`, and must never reach production.
Details and examples: `DESIGN.md` › *Real content only*.

## Backend (Supabase) — rules for every agent

Read `docs/backend/README.md` before touching the database, Supabase clients, environment variables or storage. Database conventions: `docs/backend/database-conventions.md`; workflow and change checklist: `docs/backend/supabase-workflow.md`.

- Never mutate production experimentally. (Production does not exist yet; the only hosted project is `verypinkclub-dev`, fake data only.)
- Never expose Supabase secret credentials (no secret in `NEXT_PUBLIC_*`, client code, git, logs or responses).
- Never bypass RLS to fix a frontend permission problem.
- Never manually patch a production schema without a migration in `supabase/migrations/`.
- Never rewrite deployed migrations casually; fix forward with a new one.
- Never create a single global role model (no `profiles.role`).
- Never put applicant files (CVs, documents) in public storage.
- Never assume UI hiding equals authorization.
- Never remove constraints to make an error disappear.
- Never use real applicant or student personal data in seeds or tests.
- Authentication is not authorization: a signed-in user has no management right until a position with a current mandate grants one. No role in `profiles` or `user_metadata`, no "if this e-mail then admin". Sign-in, profiles and MFA: `docs/backend/authentication.md`.
- Authorization and governance (Phase 4): `docs/backend/authorization.md` first, then `permissions.md`, `governance.md`, `leadership-transitions.md`, `rls-policies.md`. Governance tables are written only through the `security definer` functions; never grant table writes, never hand-edit mandates, never add an admin bypass. Real people are bootstrapped in production by the project owner only.
- Association pages (Phase 5): `docs/backend/association-pages.md`. Pages are prepared as drafts and published by the database functions; public pages are read only through `public_association*` as a visitor. Never serve an association image from a storage URL (use the `/media/...` routes), never show a member's photo or bio without their own consent, never let the BDE edit an association's content (moderation is withhold/release).
- Publishing (Phase 6): `docs/backend/publishing.md`. Posts are written, reviewed, published and scheduled only through the database functions; a revision is frozen from submission and an approval binds to that exact revision (never publish anything else under it). Bodies are the validated JSON document rendered by `RichText` only: never HTML, never `dangerouslySetInnerHTML`, links only through `isSafeHref`/`toSafeHref`. Visitors read posts only through `public_post*`; drafts only through `post_preview` on noindex pages. Scheduled posts go out through the pg_cron worker, never an app cron or the browser. Never show a reporter's identity or report counts, never let the BDE read an association's drafts or edit, approve or publish its posts (moderation is hide/restore).
- Events (Phase 7): `docs/backend/events.md`. Events are written, published, cancelled and registered for only through the database functions; seats are counted under the event's lock by the database (never count rows in the app). Visitors read events only through `public_event*`; participants only through `event_attendees` with `events.attendees.view` (names only, never an e-mail). Never show `access_details` to anyone but a confirmed seat, never put a price or an `offers` block anywhere, never let the BDE read an association's participants or drafts (moderation is hide/restore, featuring is "à l'affiche"). Messages go through `notification_outbox`; only the workers (e-mail since Phase 7, Storage cleanup since Phase 8) use the privileged client.
- Recruitment (Phase 8): `docs/backend/recruitment.md`. Campaigns, positions, forms and applications are written only through the database functions; a published form version is frozen (changes go to a new draft version, published deliberately) and answers are read against the version they were filled on. The deadline, eligibility and limits are decided by the database at submission (never in the app). Nobody but the candidate reads an application, its answers or its files until Phase 9 builds reviewer access: teams and the BDE get counts only, and the guardian nothing. CVs and documents live in the private `recruitment-documents` bucket, uploaded through the content-checking route with the candidate's own session and downloaded only as attachments by their candidate; never a public URL, never a signed URL handed out. A candidate's steps are `application_events`, never governance audit lines. Never write "read", "under review" or "accepted" for an application in Phase 8.
