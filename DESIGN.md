# Very Pink Club — design system (Phase 1)

The digital hub of the BDE of GEM Alpine Business School, Paris campus: events, associations,
recruitment, campus news, a student space and an association workspace.

## Direction: « L'enseigne et l'autocollant »

Everything comes from the supplied logo, which is made of two materials:

| Material | Where it comes from | What it becomes |
|---|---|---|
| **Neon sign** — the enseigne | the round logo (pink neon ring, green palm, cyan triangle), the 8 neon event emblems, the maquette's flickering headline | the **night** surface: ink black, light used only where something is *lit* (tonight, the hero word, an event emblem, a hovered CTA) |
| **Sticker print** — l'autocollant | the panther's thick cartoon outline, the wordmark sticker (pink fill → white keyline → black outline), the cream "I ♥ PANTIN" tank top | the **paper** surface: cream, ink outlines, hard offset shadows, slightly tilted stickers |

A third, calm **studio** surface (warm grey + white panels) serves association management.

### The three UX worlds

| World | Surface | Feel |
|---|---|---|
| Public / student discovery | `night`, with `paper` sections for rhythm | expressive, poster-like, mobile-first |
| Recruitment | `paper` documents inside the night chrome | clear, structured, reassuring — a "fiche de poste" |
| Student space | `paper` | personal, calm, not a CRM |
| Association management | `studio` | dense, predictable, fast |

## Maquette decisions

| Maquette element | Decision | Result |
|---|---|---|
| Night palette, magenta + cyan | **Keep** | Night surface; cyan (from the triangle) is the info/focus colour |
| "effet néon clignotant" headline | **Keep** | `NeonText` + `neon-flicker`: power-on stutter, then rare irregular flickers; off with reduced motion |
| "effet déroulant style carrousel" ticker | **Keep** | `Marquee`: pauses on hover/focus, static scrollable row with reduced motion |
| "effet 3D de la carte" (carte cotisante) | **Keep** | Member card with pointer tilt in the student space and on the BDE page |
| Neon event emblems in circles | **Keep / promote** | Emblems are the accent system: their eight colours become the association palette |
| Amber VSS / VDH section + header link | **Keep** | Amber is reserved for safety; the link is visible at every size |
| Heavy expanded uppercase headings | **Evolve** | Archivo with its width axis: expanded for display, condensed for posters/dates |
| Mono letter-spaced labels everywhere | **Evolve** | Space Mono kept for metadata only (times, counts, codes), tighter tracking |
| Identical rounded cards, 3-column grids | **Remove** | Rows, rules, posters and tickets; cards only where grouping helps |
| Pill buttons with glow everywhere | **Reinterpret** | Square-ish heavy buttons; pills belong to stickers; glow only on hover/lit things |
| Grid-line background, radial glows | **Remove** | Flat ink; light comes from content (emblems, photos) |
| Centred footer columns | **Reinterpret** | Cream sticker-sheet footer with the real wordmark |

## Tokens (all in `src/app/globals.css`)

- **Surfaces** — `data-surface="night|paper|studio"` on any element. Components only use semantic
  utilities: `bg-bg bg-raised bg-sunken text-fg text-muted text-subtle border-line border-line-strong
  bg-accent text-accent-fg text-accent-text text-ok text-warn text-danger text-info`.
- **Light theme** — `html[data-theme="light"]` (cookie `vpc-theme`, read by the server so the first
  paint is right; `ThemeToggle` in the header and in the mobile account sheet; `src/lib/theme.ts`).
  Dark, the maquette, stays the default. Only the night surface changes: a clear blush white
  (`#fdf9fb`), ink type and `--is-night: 0`, so every lit effect takes its printed (paper) form and
  accents use their AA paper colours; neon text switches its tube for its ink. Paper and studio do
  not change. A dark object that stays lit by day (ticket stubs, the member card, the management
  bar) adds `data-theme="dark"` next to `data-surface="night"`. Light-only details use the
  `light:` variant.
- **Association accents** — `data-accent="rose|cyan|violet|vert|or|bleu|orange|corail"`; then
  `bg-assoc text-assoc-fg text-assoc-text bg-assoc-soft shadow-assoc-glow shadow-assoc-press`.
  Every accent passes WCAG AA as a fill (ink text) and as text on night, paper and studio. Associations
  pick a key — never a hex value, never custom CSS.
- **Raw brand colours** (rarely needed directly): `ink #0c0a0e`, `pink #fa0479` (wordmark), `panther #f5226e`,
  `blush #ffc6dc`, `cream #fdf7e9`, `keyline #f6edf0`, `palm #45f27a`, `triangle #12d8f0`, `amber #ffb81c` (safety only).
- **Type** — `type-hero type-display type-poster type-title type-section type-headline type-card type-lead
  type-body type-small type-label type-meta type-caption type-button type-nav type-numeral`.
  Uppercase is for display, section heads, buttons and labels. Card titles and body are sentence case.
- **Layout** — `wrap` (max 90rem + fluid gutter), `wrap-text` (46rem), `py-section`, `rail`
  (edge-bleeding horizontal scroller). Public pages use a 12-column grid with asymmetric spans;
  management uses a regular grid.
- **Shape** — radius `xs 2px · sm 4px · md 8px · lg 14px`; `rounded-full` only for stickers, avatars,
  emblems. Containers are near-square.
- **Effects** — `neon`, `neon-flicker`, `sticker`, `grain`, `halftone`, `perforation`, `skeleton`,
  `reveal`, `reveal-image`, `shadow-press`, `shadow-sticker`.
- **Motion** — 140 / 240 / 520 ms, `ease-out`. Every animation is disabled under
  `prefers-reduced-motion`.

## Components

| Area | Components |
|---|---|
| Brand | `BrandMark` (panther / badge / logo / wordmark — the real files), `NeonText`, `Marquee` |
| UI | `Button`/`ButtonLink`, `Sticker`, `StatusBadge`, `Icon` (house SVG set), `Field`/`Input`/`Textarea`/`Select`/`Checkbox`/`ChoiceGroup`, `FilterChips` (URL-driven), `Dialog`, `Avatar`, `Skeleton`, `EmptyState` |
| Media | `MediaFrame` (fixed ratio + next/image + designed fallback), `Poster` (generated gig poster or lit emblem) |
| Layout | `SiteHeader`, `NavLinks`, `MobileTabBar`, `UserMenu`/`MobileUserButton`, `SiteFooter`, `PageHeader`, `Breadcrumbs`, `SectionHeader`, `ThemeToggle` |
| Associations | `AssociationLogo` (logo or monogram sticker), `AssociationIdentity` |
| Search | `CommandSearch` (⌘K / Ctrl K / "/") + `/search` page |

Domain components (events, recruitment, campus, account, manage) live in `src/components/<area>/`.

## Rules of thumb

- Glow means "lit": tonight's events, the hero word, emblems, CTA hover. Never on static cards.
- Amber means safety. Green means open/live. Pink means the brand and primary action.
- One sticker per card, max. Stickers state facts ("Ce soir", "3 postes"), not decoration.
- Dates are scannable first: big condensed numerals + mono weekday/month, then relative words
  ("Ce soir", "Demain soir", "Plus que 3 jours").
- No icon + title + paragraph card grids. No centred hero. No gradient text. No fake stats.
- Images go through `MediaFrame` with a `slot` from `src/lib/media-slots.ts`; every slot has a designed
  fallback so the site never depends on generated art.
- Copy is French, tutoiement, with the maquette's humour — and concrete only about what is actually known
  (see *Real content only*). A room, price or seat count appears when the BDE or an association has given it.

## Real content only

The site ships to real students, so it states only facts the BDE has given (its maquette: the club, its
8 events of the year, the carte cotisante, the VSS / VDH commitments) or real public information (17, 112,
114, 3919, arretonslesviolences.gouv.fr). No invented association, person, date, venue, address, price,
capacity, line-up, statistic, quote, contact detail or event photo — not even to make a page look fuller.

- Missing content gets a **designed empty state** that says who will add it ("Chaque présidente ou président
  créera la page de son asso.", "Les dates de cette édition seront annoncées par le bureau."), or the block is
  left out when an empty one would only add noise (an empty gallery). A page never looks broken.
- Generic copy about how the platform works is fine; so are form placeholders clearly marked "Ex : …".
- Components built for content that does not exist yet (dated editions, campaigns, articles, applications)
  stay in the codebase and simply receive no data.
- Phase 1 demo accounts are labelled as demo ("Compte démo — étudiant·e"), never a realistic person, and start
  empty. Any dev seed data must be obviously fictitious and never reach production.

## Data

Typed entities in `src/lib/types.ts`; the real content above in `src/data/mock/` (every other collection is an
empty array); data access in `src/lib/data/*` (async, server-only) — the only layer to swap for Supabase.
Pages and components never import `src/data/mock` directly. Sessions come from Supabase Auth (`src/lib/session.ts`,
Phase 3); fictional development test accounts are described in `docs/backend/authentication.md`.
