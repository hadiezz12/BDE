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
