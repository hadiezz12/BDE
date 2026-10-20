# Association pages (Phase 5)

Every organization (the BDE and each association) has one public page, prepared as a **draft** by
its team and put online by **publishing**. The directory (`/associations`) and the pages
(`/associations/<slug>`) are read from the database as a visitor; nothing on them is invented or
hard-coded. Content, events and recruitment still come from the Phase 1 layer until their phases
(only the BDE has any), keyed through `legacyId()` in `src/lib/data/associations.ts`.

Migrations: `20261020081522_create_association_profiles.sql` (tables, rights, policies),
`20261020081748_create_association_page_functions.sql` (functions), `20261020081815_create_association_media_storage.sql`
(bucket and Storage policies), `20261020081817_publish_bde_page.sql` (the BDE's page from its maquette).
Tests: `supabase/tests/database/association_pages.test.sql` (76 checks), `src/lib/associations/associations.test.mjs`,
`e2e/pages.spec.ts` (the brief's §79 journey).

## Two statuses, never mixed up

| | Set by | Values | Effect |
| --- | --- | --- | --- |
| Organization status (`organizations.status`, Phase 4) | BDE leadership | `setup`, `active`, `suspended`, `archived` | Who may act; a suspended or archived association's team is read-only. |
| Page status (`association_pages.status`) | the association (`organization.page.publish`) | `draft` (never published), `published`, `unpublished` | Whether the published version is meant to be online. |
| Moderation (`association_pages.withheld_at`, reason) | BDE (`platform.content.moderate`) | withheld or not | Takes a page off the site and blocks publishing until released. |

A page is **public** only when all three allow it: organization `active`, page `published`, not
withheld (`private.association_page_is_public`). An archived association's address shows a short
"n'est plus active" notice; every other non-public page is a plain 404 that says nothing about why.

## Data model

| Table | Holds |
| --- | --- |
| `association_categories` | The directory's category catalog (slug, label, order, archived). Maintained by BDE leadership; seeded with 9 generic categories. |
| `association_pages` | One row per organization: page status, `published_revision`, first/last publication, unpublication, moderation. |
| `association_profiles` | Two rows per organization, `stage = 'draft'` and `stage = 'published'`: texts, accent, categories (up to 3), contact, links, logo/cover, cover focal point, `revision`. |
| `association_gallery_items` | Ordered photos per stage (up to 24), optional caption. |
| `association_team_entries` | How the team is presented per stage: order, displayed title, hidden. Never a right. |
| `membership_public_profiles` | Each member's own consent: hidden, show photo (off by default), one-line bio. |
| `association_media` | The image library: kind (`logo`, `cover`, `image`), size, alt text, removal date. |
| `organization_slug_history` | Former addresses, which redirect forever and are never reused. |

`organizations.name`, `short_name` and `accent` stay the **published** identity used everywhere else
(workspace, events, menus): publishing copies them from the draft. The draft's other texts never
leave the draft until published.

## Drafts, conflicts and publishing

- Saving goes through `public.save_association_draft(org, base, patch)` (right
  `organization.settings.update`). The editor sends, per section, the fields it changed (`patch`)
  and the values it loaded (`base`). For each field: unchanged → ignored; changed by nobody else
  since loading → saved; changed by someone else **and** different from what this person typed →
  `draft_conflict` naming the fields. Two people editing different sections never collide; a real
  clash is refused instead of silently overwritten. Every save bumps the draft `revision`.
- Gallery and team presentation are saved as whole lists (`set_association_gallery`,
  `set_association_team_presentation`) with the same "unchanged since loaded" check.
- `public.publish_association_page(org, expected_revision)` (right `organization.page.publish`,
  second factor) publishes **the revision the person reviewed**: if anyone saved after the preview,
  it refuses with `draft_changed`. It checks what publishing needs (`page_incomplete`: a line, a
  presentation and, for an association, a category), copies draft → published (profile, gallery,
  team arrangement, identity) in one transaction and audits.
- `unpublish_association_page` takes the page off the site (draft kept); `change_organization_slug`
  moves the address (second factor; the old one redirects, `organization_slug_history`).
- The BDE's address never changes; `plateforme` and `continuite` are reserved words.

## Preview

`/associations/<slug>/apercu` renders the draft through `public.association_preview` (refused
unless the caller may prepare or publish the page), with the same component as the public page
(`AssociationProfile`). Draft images come from the private route below; member photos are left out.
`?vue=telephone` frames the page at phone width (same origin only: the site sends
`X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` everywhere). Never indexed.

## Public team and privacy

Only members holding a **current position** can appear. Order and displayed titles come from the
team presentation; each person's own choices (`set_my_public_team_profile`, in the workspace home,
"Ta présentation publique") decide whether they appear at all, whether their account photo is shown
and their one-line bio. Editors can hide someone, never show someone who said no. Photos are
served by `/media/portraits/<membership>` only while all of this holds (`public_portrait_path`),
re-encoded to a square WebP without metadata. No e-mail, phone or account detail of a member is
ever public; the contact address is the association's own field.

## Images

- Private bucket `association-media`, WebP only, 10 MB, objects `<organization>/<media>.webp`.
- Upload: `POST /manage/<asso>/media/upload` (route handler, so the browser shows progress). It
  checks the session, the `media.manage` right and the request's origin; re-encodes with `sharp`
  (rotation applied, resized: logo 1024, cover 2400×1600, photo 2000; metadata stripped; 32 px
  minimum; 12 MB input maximum; JPEG, PNG, WebP, GIF, AVIF detected from the bytes); stores the file
  with the person's own session (the Storage policy checks the right again) under a fresh name
  (never overwrites); then registers it (`register_association_media`, audited). If registering
  fails, the file is deleted.
- Reading: there are **no public bucket URLs**. `/media/associations/<org>/<file>` serves an image
  to anyone only while a public page uses it (Storage policy `association_media_select_public`,
  5-minute cache); `/media/apercu/associations/...` serves any library image to the page team
  (session, `no-store`, never optimized or cached by `next/image`).
- Removing (`remove_association_media`) is refused while the draft or the published page uses the
  image (`media_in_use`), then deletes the file. Alt text is editable (`update_association_media`).
- Library quota: 300 images per organization (`media_quota`).
- Orphans (a file whose registration and deletion both failed, or whose deletion failed after
  removal) are invisible to everyone (no row, or a removed row) and can be listed with:
  `select name from storage.objects o where bucket_id = 'association-media' and not exists (select 1
  from public.association_media m where m.object_path = o.name and m.removed_at is null);`
  Cleanup is a manual, owner-only task until the background-jobs phase.

## Who may do what

| Action | Right | Second factor |
| --- | --- | --- |
| Prepare the draft (texts, colour, logo/cover choice, gallery, team presentation) | `organization.settings.update` | |
| Send or remove images, edit alt text | `media.manage` (alt text also `organization.settings.update`) | |
| Publish, unpublish, change the address | `organization.page.publish` (offices only by default, not delegable); the address also `platform.organizations.manage` | publish, address |
| Withhold / release a page | `platform.content.moderate` (BDE president and vice-president) | ✓ |
| Maintain categories | `platform.organizations.manage` | ✓ |
| Own public presentation | the member, for their own membership | |
| Renew a pending invitation (+14 days) | `members.invite` | |

The BDE leadership has **no** right inside an association's page: it cannot read drafts, edit, or
publish; moderation is withhold/release with a reason the association sees. The database also lets
it move an address (a name taken by mistake); there is no screen for that yet. The continuity
guardian has no content power at all.

## Directory, SEO, accessibility

- `/associations`: public pages only; `?categorie=` (chips only for categories with a page),
  `?q=` (every word must appear in the name, line, presentation or categories; accents ignored),
  `?tri=recentes` (first publication). The BDE has its own band first. Empty states say who adds
  what.
- Page metadata: title, description from the line, canonical URL, Open Graph image (the cover or
  logo, through the public route). `sitemap.xml` lists public pages; `robots.txt` excludes
  `/manage`, `/account`, previews and private media. Absolute URLs need `SITE_URL` (the BDE's
  domain, not bought yet: empty until then, nothing guessed).
- Accent colours come only from the closed palette (`lib/accents.ts`), so text contrast holds in
  both themes; layout and type stay the site's. Images require (and the library nags for) alt text.

## Error codes

`profile_invalid` (detail: the constraint), `draft_conflict` (detail: the fields), `draft_changed`,
`page_incomplete` (detail: the missing fields), `page_withheld`, `page_not_published`,
`page_not_withheld`, `media_not_found`, `media_quota`, `media_invalid`, `media_in_use`,
`slug_taken`, `slug_invalid`, `category_invalid`, `category_taken`, `gallery_invalid`,
`team_invalid`. French sentences in `src/lib/governance/messages.ts`.
