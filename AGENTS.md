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
