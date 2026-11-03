# Search, discovery, saved items (Phase 12)

One public search across the campus, the BDE's spotlights on the front page, a private list of
saved items per student, optional interests, and links between modules by real ids. Migrations
`20261103073045_create_campus_search.sql` and `20261103073152_create_spotlights_saved_items_interests.sql`;
tests `supabase/tests/database/search.test.sql`, `supabase/tests/concurrency/search.sh`,
`src/lib/search/search.test.mjs`, `e2e/search.spec.ts`.

## The rule

**Search never shows anything a visitor could not already open.** It reads the source tables at
every call through the same predicates as the public pages; nothing is copied into an index that
could lag behind a moderation, an unpublication or a closed campaign.

| Type | Searchable when | Text searched (weights: A titles, B short texts, C long texts) |
| --- | --- | --- |
| Association | `private.association_page_is_public(org)`: active, page published, not withheld | **Published** profile only: name, short name (A); tagline, kind (B); description (C); category labels |
| Article | `publication = 'published'`, not hidden, page public | **Published revision** only (`posts.published_revision_id`): title, intro, body text, tags (existing `post_revisions.search`) |
| Event | `private.event_is_public(e)` (published, not hidden, page public); cancelled ones stay findable, shown cancelled | existing `events.search` |
| Recruitment | `private.campaign_is_public(c)` (published, not hidden, page public) | existing `recruitment_campaigns.search` |
| Position | its campaign public, not retired | title, team (A); summary (B); description, missions, expectations (C) |

Never searched, never returned: drafts and pending revisions, applications, answers, documents,
CVs, reviews, notes, interviews, notifications, audit, personal profiles, saved items, interests,
attendees, private event details (`access_details`). A test reads the source of every search
function and fails if one of those tables appears in it.

## The database

- `public.search_campus(q, type, category, organization, when, status, place, sort, limit, offset,
  per_type)` — `security definer` like every public read (the API roles have no grant on the
  content tables; a `security_invoker` view would return nothing to a visitor). Callable by `anon`
  and `authenticated`; returns `{results: [{type, id, score, card}], counts, total, has_more, too_short}`.
  - Every parameter is checked against a list or the slug pattern (`search_invalid`); limit ≤ 24,
    offset ≤ 480, query cut at 80 characters, under two characters `too_short`.
  - The query: `private.search_tsquery` builds the websearch query (`"phrases"`, `-excluded`,
    `or`) **or** each word as a prefix (`financ` → Finance), from lexemes Postgres extracted
    (never by pasting the text into a query string). French stemming, accents folded
    (`private.fold_accents`), case ignored. `pg_trgm` was evaluated and not used: on short French
    words it returns false friends ("financesoccer" must find nothing).
  - Cards: `private.public_card(type, id)` returns the same public cards as the pages
    (`post_card`, `event_card`, `campaign_card`, `position_card` + its campaign,
    `search_association_card`), or null when the item is not public right now. Saved items use it
    too.
- Ranking (explainable, §21–22): `ts_rank_cd` (normalised) + title bonus (exact 1, starts with
  0.5, a word starts with 0.25) + 0.3 when a word of the association's name starts with the query
  (what an association publishes is found by its name) + a date adjustment (event to come or
  recruitment open +0.15, over or closed −0.15; article of the last 30 days +0.1). Ties: the type's
  date, then the name, then the id, so pages never overlap. Without a query: associations by name
  (BDE first), articles newest first, events soonest first (to come by default), recruitment open
  first. `per_type` keeps the best n of each type (the "Tout" view, §23).
- Time windows are Paris days (`private.paris_start_of`, daylight saving included): today, this
  week (to Sunday night), this weekend (Saturday–Sunday), to come, past. Recruitment status: open,
  upcoming, closing (open and closing within 7 days), closed.
- Indexes: GIN on every searched vector (two new generated columns: `association_profiles.search`,
  `recruitment_positions.search`). `search.sh` checks the planner reaches each table through it.

## The site

- `/search` (`src/app/(site)/search/page.tsx`): tabs Tout · Associations · Événements · Articles ·
  Recrutement (links, `aria-current`, the query kept); filters that belong to the tab only
  (events: when, where, category, order, plus a link to the agenda for exact dates; recruitment:
  status; articles: category, order; associations: category; every tab: association). The whole
  state is in the URL (`src/lib/search/query.ts`: `?q=&type=&asso=&categorie=&quand=&lieu=&statut=&tri=&page=`);
  unknown values are dropped, never passed on. Pages of 12. States: too short, nothing found (with
  "Retirer les filtres" and the other tabs' count), the search not answering. Never indexed
  (`noindex, follow`, canonical `/search`), not in the sitemap.
- ⌘K / Ctrl K / "/" (`CommandSearch`): asks `GET /api/search?q=` once the typing pauses (200 ms),
  cancels the previous request (`AbortController`), keeps the previous answer dimmed while the
  next arrives, announces the count in a live region. The site's own pages are matched in the
  browser (`components/search/pages.ts`), the BDE's events of the year on the server.
- `GET /api/search` (`src/app/api/search/route.ts`): no session read, visitor-level data only,
  `Cache-Control: no-store`, `X-Robots-Tag: noindex`, 30 requests per 10 s per client, then 429
  (`src/lib/rate-limit.ts`: in memory, per server instance — a brake, not a quota).
- Results are built from slugs by `src/lib/search/entries.ts` (`routes.*`), never from a URL in
  the data, so a result can only lead to a page of the site. Titles and lines are rendered as text;
  `Highlight` wraps matches in `<mark>`.
- Before Phase 12 the header shipped a search index (associations, 60 events, current campaigns,
  30 posts: five database reads) with **every** page. It is gone: nothing is downloaded before the
  dialog is used.

## Saved items (§53–60, §80)

- `public.saved_items`: one row per (student, kind, item). One typed column per kind
  (`organization_id`, `post_id`, `event_id`, `campaign_id`, `position_id`), each a real foreign key
  (deleting the item deletes the row), exactly one set (check), `target_id` generated from it,
  `unique (user_id, kind, target_id)`.
- RLS: read own rows only (plus the restrictive MFA policy); no table write for any API role.
  Nobody else reads the list: not another student, not the association, not the BDE.
- `public.save_item(kind, id, saved)` saves only what is public right now (an unknown and a private
  item answer the same `item_not_found`), is idempotent, 500 items at most; unsaving always works.
- `public.my_saved_items(kind)` returns each item with its **live** public card (a cancelled event
  says so, a closed recruitment says so). An item no longer public keeps only its kind and the day
  it was saved: no title, nothing it said.
- `public.my_saved_keys()` gives the ids per kind for the buttons of a page.
- The events-only `event_bookmarks` (Phase 7) were moved into `saved_items` and dropped;
  `set_event_bookmark` is replaced by `save_item('event', …)`; `my_event_status.bookmarked` and
  `my_events.bookmarks` read `saved_items`.
- Saving is not registering, applying or joining: the button says "Enregistrer" (a toggle whose
  state is the database's answer, never assumed), the confirmation says "Ce n'est pas une
  inscription / candidature", `/account/saved` says it in its introduction. A visitor gets
  "Se connecter pour enregistrer" with `?next=` back to the page.
- `/account/saved` (tab "Enregistrés"), filters per kind, removal in place; the student's home
  shows the latest four ("Mon campus").

## Interests and suggestions (§61–65)

- `public.student_interests (user_id, category_id)`: the association categories the BDE keeps
  (no new taxonomy), eight at most, set only by `public.set_my_interests(slugs)`, read own rows
  only. Nothing is inferred from reading, registering or applying; no CV or answer is ever used.
- `public.my_campus_suggestions()`: upcoming public events and open (or about to open) recruitment
  of associations whose page lists one of the chosen categories, each with the categories it
  comes from ("Parce que tu as choisi Sport"). No interest, no suggestion.

## Spotlights (§42–45)

The same featuring as articles and events (Phases 6–7), on the BDE's "À la une" page
(`/manage/plateforme/une`): `platform.content.feature`, second factor, optional end date (60 days
at most), audited (`campaign_prominence_changed`, `association_prominence_changed`).

| Spotlight | Function | Limit | Shown |
| --- | --- | --- | --- |
| Recruitment "à la une" | `set_campaign_prominence` | 3 | First in "Ça recrute" on the home page, marked "À la une du BDE" |
| Association "à l'honneur" | `set_association_prominence` (never the BDE) | 1 | First in "Trouve ta bande", sticker "À l'honneur" |

The reads (`public_featured_campaigns`, `public_featured_associations`) check visibility every
time: a closed, paused or moderated campaign, an unpublished or withheld page leave the front page
at once. An association pins posts and events on its own page itself; only the BDE places things
on the campus front page. No "popular", "trending" or count is shown anywhere (§45).

Also in this migration: `prominence_by` may now be null on a featured item (posts, events,
campaigns, pages) — the account of who featured it can be deleted (the audit keeps the name);
before, deleting such an account failed on the check.

## Related content (§46–52)

`public.public_related_posts(type, id, limit)`: the published articles that point to an event or a
campaign (the link their association set in Phases 7–8), or, for an article, those about the same
event or campaign, then the same association, then the same rubrique. Ids only, never a shared
word. Shown on the event page ("Les articles sur cet événement" / "Le récap"), the recruitment
page ("Sur ce recrutement") and the article page ("À lire aussi"). The existing links remain:
article → its event and campaign, event → its association and related events, campaign → its
positions and association.

## Caching (§75–76)

No cache was added. Every public page already reads the visitor's session in the shell (header,
bell), so pages are rendered per request, and every read checks visibility at that moment: a
publication, a cancellation, a close or a moderation shows on the next request, with nothing to
invalidate. `/api/search` is `no-store`. Caching public parts would need the shell split from the
pages (Next's Cache Components); it was measured as unnecessary at this size (see Performance)
and left for when traffic says otherwise. Personal data (saved items, interests, registrations)
is never cached.

## Performance (§72–74, §101–103)

Method: local production builds (`next start`) of Phase 11 (A) and Phase 12 (B) against the
development Supabase project (over the internet), Microsoft Edge driven by Playwright, the two
builds measured **alternately route by route in the same session** (same machine and network
conditions), median of 3 loads (7 for the desktop routes rechecked), desktop 1440×900 and Pixel 7
with the CPU slowed ×4; server times with `curl`, median of 5, interleaved. Fictional development
data (one public association, one article, one event, one campaign): absolute numbers say little
about a full campus; the comparison is what matters. A first, non-interleaved run gave mobile
times three times higher for **both** builds: the machine was busy, which is why A and B are
measured side by side.

What changed for speed: the header's search index (five database reads and their payload on
every page) is gone; the home page reads the carte cotisante alongside the rest instead of after
it; the article page asks for 12 recent posts instead of 30.

Measured (A → B):

| | Result |
| --- | --- |
| First byte (browser, every route) | ≈ 70–150 ms → 10–35 ms (the shell no longer waits for the index) |
| Full server response (`curl`) | home 168 → 100 ms; other routes equal (98–124 ms) |
| HTML per page (decoded) | 7–12 KB lighter almost everywhere (home 204.7 → 195.3 KB, events 169.9 → 160.6 KB) |
| JavaScript per page | unchanged (234–241 KB transferred, ± 2 KB) |
| Mobile LCP (Pixel 7, CPU ×4) | home 2.12 → 1.19 s, associations 1.97 → 1.60 s, an association 2.20 → 1.80 s, a campaign 1.75 → 1.50 s, search 1.50 → 1.32 s, events 1.55 → 1.46 s; campus, an event, an article, recruitment and the empty search within ± 0.1 s |
| Desktop first paint | ≈ 100 ms earlier (header and skeleton at ≈ 180 ms instead of ≈ 300 ms) |
| Desktop LCP | **≈ 180 ms later** on routes with a loading skeleton (home 320 → 516 ms, associations 348 → 500, an event 304 → 500, a campaign 312 → 504, search 384 → 512; 7 samples) |

The desktop LCP regression is a side effect of the faster shell, not of slower data: the page now
streams at once with its loading skeleton, and React keeps a revealed skeleton on screen about
300 ms before swapping in the content (measured: first paint ≈ 180 ms, heading ≈ 480 ms). In
Phase 11 the shell waited for the index, so the content was ready before the first byte and no
skeleton was ever painted. Every value stays far under the 2.5 s "good" threshold. The fix is to
render static headings outside the route's loading boundary (or drop the skeleton where data is
fast); it touches every route and is left for a later phase, documented here rather than hidden.

Search itself (`supabase/tests/concurrency/search.sh`, local Postgres): 500 searches by 20
simultaneous sessions, average 31 ms, slowest 553 ms; every searched table reachable through its
GIN index.

## Tests

| File | What it proves |
| --- | --- |
| `supabase/tests/database/search.test.sql` (187) | The §94 matrix: visitors find public items of every type and nothing private (drafts, pending revisions, scheduled posts, unpublished campaigns, answers, e-mails); the search reads no private table; helpers not callable; malformed input refused or treated as text; pagination never overlaps; filters, windows and the grouped view; §96 an article's life (V1, private V2, V2 live, unpublished, republished, hidden); §97 an event's life (draft, published, saved, registered separately, rescheduled, cancelled — search and saved list say so); §98 recruitment (save, apply, unsave, close, answers never searchable, the front page drops it); §99 saved items private (table and functions, other students, the association's president), duplicates, idempotence; spotlights' rights, limits, audit, moderation; interests; related articles |
| `supabase/tests/concurrency/search.sh` | 20 simultaneous visitors × 25 searches, the GIN indexes reachable, ten tabs saving one item (one row), save/unsave races |
| `src/lib/search/search.test.mjs` | URL state: cleaning, slugs, foreign filters dropped, canonical URLs, the database arguments; the rate limiter |
| `e2e/search.spec.ts` | `/search` by type with the query in the URL, malicious input shown as text, ⌘K, saving and finding after reload, another student seeing nothing, the sign-in offer, the home page spotlight |
