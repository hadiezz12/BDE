# Publishing: posts, revisions, approval, scheduling, moderation (Phase 6)

A **post** is something an organization (the BDE or an association) writes for the whole campus:
an `article` (a real piece), an `annonce` (a piece of information to pass on), a `recap` (looking
back on an event) or a `breve` (two lines, no cover). It belongs to exactly one organization for
ever, has a stable identity, a history of **revisions**, and goes online only through the
database functions below. The public feed (`/campus`), the article pages (`/campus/<slug>`), the
association pages and the home page read posts as a visitor; nothing on them is invented or
hard-coded.

What a post is **not**: an event (Phase 7 has its own model, dates and registrations; a post never
stands in for one), a recruitment campaign (Phase 8), a comment thread (there are no comments,
likes or view counters), or an association's page (Phase 5, [association-pages.md](association-pages.md)).

Migrations: `20261021092120_create_posts.sql` (helpers, tables, permissions, audit vocabulary,
read policies, Storage policy changes), `20261021092414_create_post_functions.sql` (writing,
review, publication, scheduling, the worker), `20261021092556_create_post_moderation_and_reads.sql`
(reports, moderation, rubriques, the desk and editor reads, the public read model, images, the
pg_cron job). Tests: `supabase/tests/database/posts.test.sql` (136 checks), `e2e/publishing.spec.ts`.
App side: `src/lib/posts/*` (format, payload shapes, scheduling in Paris time),
`src/lib/data/posts.ts` (public reads), `src/app/actions/posts.ts` (Server Actions),
`src/components/posts/RichText.tsx` (the only body renderer).

## Three concerns, never mixed up

| Concern | Stored in | Values | Set by |
| --- | --- | --- | --- |
| A revision's review status | `post_revisions.status` | `draft`, `submitted`, `approved`, `changes_requested`, `superseded` | the content team (`posts.*`) |
| The post's publication | `posts.publication` (+ `published_revision_id`, schedule columns) | `unpublished`, `published`, `archived`; a schedule is `pending` or `failed` | publishers (`posts.publish`) and the worker |
| Moderation | `posts.hidden_at`, `hidden_reason` | hidden or not | BDE (`platform.content.moderate`) |

- Only a `draft` changes. From submission on, a revision's content is **frozen** by the trigger
  `private.freeze_submitted_revision` (`revision_locked`), for every role including the database
  owner: what was reviewed is what goes online (decisions D33, D34).
- Which revision visitors read is `published_revision_id`; which one the team works on is
  `working_revision_id` (always the latest). They are the same revision only until someone edits a
  live post.
- A hidden post is never public, whatever its publication says, and nothing the association does
  shows it again (see [Reports and moderation](#reports-and-moderation)).

The desk and the editor fold the three into one plain word per post (`postStage` and `STAGE_LABEL`
in `src/lib/posts/model.ts`, most urgent first): "Masqué par la modération", "Programmation
échouée", "Programmé", "En attente de relecture", "Modifications demandées", "Approuvé, pas encore
publié", "En ligne · modifications en cours", "En ligne", "Archivé", "Retiré du site",
"Brouillon". Raw enum names are never shown.

## Data model

| Table | Holds |
| --- | --- |
| `posts` | Identity and state: organization, address (`slug`), author (`created_by`), working and published revision, publication dates, the pending schedule, moderation, pin, site-wide prominence. |
| `post_revisions` | Content snapshots: `number` (1, 2, … per post), `kind`, `title`, `intro`, `body` (JSON document), `cover_media_id`, `category_id`, `tags`, `status`, `version`, `restored_from`, who wrote (`created_by`, `updated_by`, `contributors`), who submitted and reviewed, `review_mode`, when it went live, a generated `search` vector. |
| `post_reviews` | Every decision on a revision (`approved`, `changes_requested`, `published_directly`) with its reviewer, note and the md5 hash of the content it applied to. |
| `post_revision_media` | Which library images each revision uses (`cover` or `inline`). |
| `post_slug_history` | Former addresses: they redirect and are never given to another post. |
| `post_categories` | The rubriques, one list for the site, maintained by BDE leadership; 8 generic ones seeded by the migration ("Vie de campus" … "International"). |
| `organization_editorial_settings` | One row per organization (created by a trigger on `organizations`): `review_mode` and `show_authors`. |
| `content_reports` | Students' reports on public posts and how they were closed. |

Columns and constraints that carry rules:

- `posts.organization_id` and `posts.created_by` never change (trigger `keep_post_organization`,
  `post_owner_locked`): moving a post to another association would need its own governed workflow.
- `posts.slug` is null until the first publication (a draft has no public address); unique; 3–100
  characters, `^[a-z0-9]+(-[a-z0-9]+)*$`.
- `posts.first_published_at` is set once, by the server, at the first publication. It is the feed
  order: republishing an edit, unarchiving or unpublishing and republishing never moves a post up
  (decision D38). `published_at` is the latest publication (`toPostItem` turns it into an update
  date when it is more than a minute later).
- `posts_published_has_revision_check`: a published or archived post has a published revision, an
  address and a first publication. `posts_archived_check`: `archived` ⇔ `archived_at`.
  `posts_schedule_check`: the scheduled revision, instant and status are set together, and
  `failed` ⇔ an error code. `posts_hidden_check`: hidden ⇔ a reason. `posts_pinned_check`: only a
  published post is pinned. `posts_prominence_set_check`: a prominence other than `normal` names
  who set it.
- The working, published and scheduled pointers are composite foreign keys `(revision id, post
  id)` to `post_revisions (id, post_id)`, deferred to commit: a post can only point to its own
  revisions.
- `post_revisions`: `(post_id, number)` unique; title ≤ 140 characters without control
  characters; intro 1–400 characters, trimmed (null when empty); body checked by
  `private.valid_post_body`; tags by `private.valid_post_tags`; 1–50 contributors;
  `post_revisions_approved_check`: `approved` ⇔ a review mode and a review date.
- Authorship columns (`posts.created_by`, revisions' `created_by`/`updated_by`, reviews'
  `reviewer_id`) are `on delete restrict`, as in the governance tables; the other "who" columns
  are `on delete set null`.
- Images are foreign keys to `association_media` (`on delete restrict`), categories to
  `post_categories` (`on delete restrict`).

Indexes beyond the foreign keys (all covered): `posts_feed_idx` on `(first_published_at desc, id
desc)` where published and not hidden (the feed and its pagination), `posts_due_schedule_idx` on
`scheduled_at` where pending (the worker), `posts_organization_id_updated_at_idx` (the desk),
`posts_prominence_idx` where not `normal`, GIN on `post_revisions.search` and `tags`,
`post_revisions_status_idx` where `submitted`, `content_reports_one_open_per_reporter_idx`
(unique, open reports), `content_reports_status_created_at_idx` (the queue) and
`content_reports_reporter_id_created_at_idx` (rate limits).

The audit log's vocabulary grew: authority `scheduler`, categories `content` and `moderation`,
resource types `post`, `post_revision`, `content_report`, `post_category`.

## State transitions

Every row below is one `security definer` function: it identifies the caller
(`private.require_actor`), locks the post row (`for update`, so two actions on one post never
interleave), checks the right in the post's own organization **now**, writes in one transaction
and audits. "Can edit" means `posts.edit` in the organization, or `posts.create` and having
started the post (`private.can_edit_post`).

Revisions:

| Transition | Function | Who | 2nd factor | Audit action |
| --- | --- | --- | --- | --- |
| new post, revision 1 `draft` | `create_post` | `posts.create` or `posts.edit` | | `post_created` |
| `draft` saved (`version` + 1) | `save_post_revision` | can edit | | none (autosave) |
| frozen working revision → new `draft` (n + 1); a `submitted` one becomes `superseded` | `save_post_revision` | can edit | | `post_revision_started` |
| any revision → new `draft` copying it (`restored_from`); a working `draft`/`submitted` becomes `superseded` | `restore_post_revision` | can edit | | `post_revision_restored` |
| `draft` → `submitted` (frozen) | `submit_post_revision` | can edit; complete, images valid | | `post_submitted` |
| `submitted` → `draft` | `withdraw_post_revision` | can edit | | `post_withdrawn` |
| `submitted` → `approved` (`review_mode = 'review'`) | `review_post_revision(…, 'approve')` | `posts.approve`, not a contributor nor the submitter | ✓ | `post_approved` |
| `submitted` → `changes_requested` (note required) | `review_post_revision(…, 'request_changes', note)` | same | ✓ | `post_changes_requested` |
| working `draft` → `approved` (`review_mode = 'direct'`), direct policy only | inside `publish_post` / `schedule_post` | `posts.publish` | ✓ | `post_published` / `post_scheduled` |

Publication:

| Transition | Function | Who | 2nd factor | Audit action |
| --- | --- | --- | --- | --- |
| any → `published` (this revision) | `publish_post` | `posts.publish`; revision authorized; association active with a public page; not hidden | ✓ | `post_published` |
| schedule set or replaced (`pending`) | `schedule_post` | `posts.publish`; revision authorized; not hidden | ✓ | `post_scheduled` |
| schedule removed (`pending` or `failed`) | `cancel_post_schedule` | `posts.publish` | | `post_schedule_cancelled` |
| `pending` → `published` | `private.run_scheduled_publications` (pg_cron) | the worker, for `scheduled_by` | | `post_published` (authority `scheduler`) |
| `pending` → `failed` (error code) | same | the worker | | `post_schedule_failed` |
| `published`/`archived` → `unpublished` | `unpublish_post` (reason optional) | `posts.publish` | | `post_unpublished` |
| `published` → `archived` | `archive_post(…, true)` | `posts.publish` | | `post_archived` |
| `archived` → `published` | `archive_post(…, false)`; refused while hidden | `posts.publish` | | `post_unarchived` |
| never published, not scheduled → deleted | `delete_post_draft` | can edit | | `post_draft_deleted` (keeps the title) |

Moderation: `hide_post` (visible → hidden) and `restore_post_visibility` (hidden → visible), both
`platform.content.moderate`, second factor and a written reason, audited `post_hidden` and
`post_restored`.

## Editorial policy

Each organization chooses, in `organization_editorial_settings` (right `posts.settings`, second
factor, `set_editorial_settings`, audited `editorial_settings_updated` with the previous values):

- `review_mode = 'direct'` (the default for every organization): a holder of `posts.publish`
  publishes or schedules the current draft alone. Submitting for a second reading stays possible.
- `review_mode = 'approval'`: nothing goes online unless a holder of `posts.approve` who did not
  write it approved that exact revision. A draft cannot be published or scheduled
  (`approval_required`).
- `show_authors`: sign articles "Par <name>" ([Authors on articles](#authors-on-articles)).

Who holds the keys by default ([permissions.md](permissions.md#organization-keys)):

| Position (template) | Content keys |
| --- | --- |
| Présidence (office) | `posts.create`, `posts.edit`, `posts.approve`, `posts.publish`, `posts.settings` |
| Présidence / Vice-présidence du BDE (offices) | the same, in the BDE only; plus `platform.content.moderate` and `platform.content.feature` |
| Vice-présidence | `posts.create`, `posts.edit`, `posts.approve`, `posts.publish` (no settings) |
| Communication | `posts.create`, `posts.edit`, `posts.publish` (no approval, no settings) |
| Événements | none (`media.manage` only: may send images, not write posts) |

Templates are copied once at creation: positions created before Phase 6 kept their keys, except
the offices, which received `posts.approve` and `posts.settings`. In approval mode a president who
writes needs someone else holding `posts.approve` (a vice-presidency created from the template, or
a position that carries it); alone, they cannot get their own articles approved, which is why
`direct` is the default (decision D35).

Some consequences, all enforced in `private.authorize_revision`:

- A revision that is `submitted` or `changes_requested` is never published directly, whatever the
  policy says now: switching to `direct` does not approve a pending submission or overrule a
  request for changes (tested).
- An approval, once given, stays valid for its revision whatever the policy becomes: any
  `approved` revision of the post can be published (the editor offers the working one).
- The policy is the association's own: the BDE has no `posts.settings` in another association
  and cannot impose approval; its oversight is moderation.

## Approval binds to the exact revision

- Submitting freezes the revision. Approving records, on the revision, `status = 'approved'`,
  `review_mode`, `reviewed_by`, `reviewed_at`, and inserts a `post_reviews` row with
  `content_hash = md5(private.post_content(revision))` (kind, title, intro, body, cover, category,
  tags). The freeze is the enforcement; the hash is the record that lets anyone check later that
  what went live is what was read: compare it with `private.post_content_hash` of the published
  revision.
- Any change after approval is a **new revision** with its own number, status `draft` and no
  approval. Publishing it under the earlier approval is refused (`approval_required`, tested).
- Restoring an old version creates a new draft from it (an archived rubrique is dropped): it goes
  through review and publication again; history is never rewritten.
- **Self-review**: the reviewer must not be in the revision's `contributors` (everyone who saved
  it) nor be its submitter (`self_review`). Holding the right is checked now, with the second
  factor: an ended mandate or another association's president cannot approve (tested).
- Requesting changes needs a note of at least 3 characters (`reason_required`; 500 at most); the
  editor shows it to the team (`review_note`).
- **Direct mode** records the same facts: when a publisher publishes or schedules the working
  draft, the revision becomes `approved` with `review_mode = 'direct'` and `reviewed_by` = the
  publisher, and a `post_reviews` row `published_directly` keeps the content hash. Scheduling in
  direct mode therefore approves (and freezes) the revision at scheduling time.

## Saving and concurrency

- The editor autosaves the whole content (`savePost` → `save_post_revision(post, revision,
  version, content)`) with the revision id and `version` it loaded. A draft saved by someone else
  since (version moved), or a working revision that changed (someone started a new one or
  restored), is refused with `draft_conflict`, never overwritten. The editor keeps what was
  typed and asks to reload.
- Saving a frozen working revision (submitted, approved, sent back, live) never touches it: it
  opens a new draft revision (`new: true` in the result) and the editor switches to the returned
  revision id and version. A `submitted` revision replaced this way becomes `superseded` and
  leaves the review queue.
- The content is checked twice: by the Server Action (`normalizePostContent`, which refuses
  rather than cuts too-long text and names the field) and by the database (`check_post_content`:
  only known keys; the category must be active unless it is the one the revision already has;
  every image must be in the organization's library and not removed; then the column checks,
  reported as `post_invalid` with the constraint as detail).
- Saving a draft is not audited (autosave would flood the history); starting a new revision,
  submitting and every later step is.

## Body format

The body is a JSON document, a small fixed subset of the Tiptap / ProseMirror schema, never HTML
(decision D36):

- Nodes: `doc`, `paragraph`, `heading` (levels 2 and 3 only: the title is the page's h1), `text`,
  `hardBreak`, `bulletList`, `orderedList`, `listItem`, `blockquote`, `horizontalRule`, `image`
  (`attrs.mediaId`, `alt`, `caption`). Marks: `bold`, `italic`, `link` (`attrs.href`).
- There are no embeds (video, iframe, social posts), tables, code blocks, underline, colours or
  raw HTML.
- Links: `https://…` or `http://…`, `mailto:…`, or a site path starting with `/` and a lower-case
  letter or a digit (so `//other.site` is refused). Lower-case schemes only. The app also refuses addresses
  with a user part (`https://x@y`) and over 2000 characters (`isSafeHref`); `toSafeHref` turns
  "ton-asso.fr" into `https://ton-asso.fr` and refuses any other scheme.
- Images: only a reference to the organization's library by id, never a URL.

Four layers keep it safe:

1. The editor only knows these nodes and marks: pasting from another site keeps text and basic
   structure and drops the rest.
2. The Server Action normalizes what it receives (`normalizeDocument` in
   `src/lib/posts/document.ts`): unknown nodes, marks and keys dropped; an unsafe link is unlinked
   (its text stays); control characters removed; a text node ≤ 20,000 characters, alt and caption
   ≤ 200 on one line, nesting ≤ 6, ≤ 2,000 blocks, ≤ 180,000 characters of JSON; trailing empty
   paragraphs dropped.
3. The database refuses anything else: `private.valid_post_body` (a column check) accepts a `doc`
   of at most about 200 kB in which every `type`, anywhere, is one of the names above, every link
   matches the rule above, every image `mediaId` is a UUID and every heading is level 2 or 3.
4. `RichText` renders the document element by element through React (text is text: `<script>`
   typed in a paragraph is stored as text, which pgTAP checks, and printed as text), checks every
   link again, opens outside links in a new
   tab with `rel="noopener noreferrer nofollow ugc"` and says so to screen readers, and resolves
   images by id through the revision's own media map. The codebase has no
   `dangerouslySetInnerHTML`.

The other fields: `title` (≤ 140), `intro` (≤ 400, shown in the feed), `kind`, `category_id`
(optional), `tags` (0–8, lower-case words joined by dashes, ≤ 30 characters each, distinct; the
app folds what is typed: "Week-end d'intégration" → `week-end-d-integration`). A `breve` has no
cover (the Server Action drops one). Reading time is about 200 words a minute, at least one. The
editor's quality notes (`qualityNotes`) are reminders only and never block saving.

## Images

Posts use the Phase 5 image library (bucket `association-media`, WebP re-encoded on upload,
300 images per organization, see [association-pages.md](association-pages.md#images)); there is no
second bucket (decision D41).

- **Who sends**: the upload route (`/manage/<asso>/media/upload`), the Storage insert policy and
  `register_association_media` (`private.can_upload_media`) accept `media.manage` **or**
  `posts.create`. Removing an image still needs `media.manage`.
- **What a revision uses** is recorded in `post_revision_media` on every save and restore
  (`private.sync_revision_media`): the cover and each inline image.
- **`media_in_use`**: `remove_association_media` refuses an image used by any revision of any post
  (draft, live, old or superseded), as well as by the page, since an old version can be restored
  and the live one must not break.
- **Draft images stay private.** They are read through `/media/apercu/associations/<org>/<file>`
  with the person's own session; the Storage policy `association_media_select_team` lets in the
  page team and the content team (`private.my_media_organization_ids()`: holders of
  `organization.settings.update`, `organization.page.publish`, `media.manage` or any `posts.*`
  key there, except `posts.settings`). Responses are `private, no-store`, never indexed, never
  passed through the image optimizer. A student outside the association and a visitor read
  nothing (tested).
- **Published images become public** while a public post's live revision uses them:
  `private.association_media_object_is_public` (the visitor's Storage policy) now also answers
  yes when the image is in `post_revision_media` for the `published_revision_id` of a post that
  `private.post_is_public`. It stops being public when the post is unpublished, hidden or its
  association page goes offline, unless something else public uses the same image. Public
  responses and the optimizer keep it at most 5 minutes.
- Visitors' payloads carry a media map (`private.revision_media_map`) of the live revision only:
  an id that is not in it renders nothing.

## Scheduling

A schedule names **one revision and one instant**: `scheduled_revision_id`, `scheduled_at`
(timestamptz), `scheduled_by`, `schedule_status` (`pending`/`failed`), `schedule_error`,
`schedule_attempts`, `schedule_attempted_at`. At most one per post; scheduling again replaces it
(the audit line keeps the previous instant). Editing after scheduling does not change what goes
out: the schedule keeps its revision.

- `schedule_post(post, revision, at)`: `posts.publish`, second factor, `at` between now + 2
  minutes and now + 366 days (`invalid_schedule`), the revision authorized as for publishing (in
  direct mode this approves it, see above), not hidden, complete, images valid. The association
  page does not need to be online yet; it must be at execution.
- Time zone: the database stores the exact instant. The site converts what the editor types as a
  Paris date and time (`parisLocalToInstant` in `src/lib/posts/schedule.ts`): the hour that does
  not exist when clocks go forward (last Sunday of March, 02:00–02:59) is refused with an
  explanation; the hour that happens twice when they go back (last Sunday of October) takes the
  first one (summer time) and the confirmation says so. The pgTAP suite stores a schedule across
  the March change with the session in `Europe/Paris` and reads back the same instant.
- **The worker**: pg_cron job `publish-scheduled-posts`, schedule `* * * * *` (every minute),
  command `select private.run_scheduled_publications()`. It is created by the migration wherever
  the `pg_cron` extension is available (Supabase hosted projects and the local CLI stack); no API
  role can run the function, and no browser or app server is involved.
- Each run takes up to 50 due schedules (`pending`, `scheduled_at <= now()`, oldest first) with
  `for update skip locked`: two runs never take the same post, and a post locked by a person's
  action at that second is simply taken by the next run. For each, it **checks again** what
  publication needs at that moment (`private.publication_blocker(…, true)` plus the revision still
  being `approved`) and either publishes (`private.publish_revision`, authority `scheduler`,
  `published_by` = `scheduled_by`) or marks the schedule `failed` with a code, increments
  `schedule_attempts`, stamps `schedule_attempted_at` and audits `post_schedule_failed`. Each post
  runs in its own savepoint: one failure never blocks the others.
- **Failure codes** (French in `SCHEDULE_ERROR_LABEL`): `post_hidden` (moderation),
  `organization_inactive` (suspended, archived or still in setup), `page_not_public`,
  `post_incomplete` (title under 3 characters, or neither intro nor text), `media_not_found` (an
  image was removed), `revision_not_found`, `approval_missing` (defensive: an approved revision
  never loses its status today), `unexpected` (an error while publishing; rolled back).
- **No duplicates**: publishing clears the schedule and a failure sets it to `failed`, so a post is
  pending at most until one run handles it; a second run finds nothing (tested: one publication,
  one audit line). An overdue schedule (after downtime) is simply due and goes out on the next run
  (tested with three days of delay).
- **No automatic retry**: a `failed` schedule stays on the desk, with its reason, until a publisher
  schedules again (attempts reset to 0), publishes now or cancels.
- **Authority at execution**: the approval of the exact, frozen revision authorizes the
  publication; the scheduler's own rights are **not** re-checked, so a mandate ending between
  scheduling and publication does not drop an approved announcement (decision D37). What stops it:
  cancellation, moderation, a suspended or archived association, an association page that is not
  online, a removed image.

Inspecting it (SQL editor, project owner):

```sql
-- The job and its last runs.
select jobid, jobname, schedule, command, active from cron.job where jobname = 'publish-scheduled-posts';
select status, return_message, start_time, end_time
  from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'publish-scheduled-posts')
 order by start_time desc limit 20;

-- Failed schedules, newest first.
select p.id, o.slug as organization, p.scheduled_at, p.schedule_error, p.schedule_attempts, p.schedule_attempted_at
  from public.posts p join public.organizations o on o.id = p.organization_id
 where p.schedule_status = 'failed'
 order by p.schedule_attempted_at desc;

-- Schedules that should have gone out (the job is not running).
select id, scheduled_at from public.posts
 where schedule_status = 'pending' and scheduled_at < now() - interval '5 minutes';

-- The same failures in the audit log.
select occurred_at, organization_id, resource_id, details
  from public.governance_audit_events
 where action = 'post_schedule_failed'
 order by occurred_at desc limit 20;
```

If the job is missing (an environment created without `pg_cron`), enable the extension and run
`select cron.schedule('publish-scheduled-posts', '* * * * *', 'select private.run_scheduled_publications()');`
as the owner; `select private.run_scheduled_publications();` runs one pass by hand.

## Unpublishing, archiving, deleting

- **Unpublish** (`unpublish_post`, reason optional, kept in the audit line): the post leaves the
  site at once (its address and former addresses answer "not found"); it stays editable and keeps
  its address, its first publication date and its live revision, so publishing again puts it back
  where it was in the feed. The pin, any site-wide prominence and any pending or failed schedule
  are removed (the audit line says whether a prominence or a schedule went with it).
- **Archive** (`archive_post`, published posts only): off the feed, the association page, search,
  facets, the featured lists and the sitemap, but still readable at its address with an
  "archived" mark. Unarchiving puts it back at its first publication date; refused while hidden.
  The pin, any site-wide prominence and any pending or failed schedule are removed, so the worker
  never brings an archived post back.
- **Delete** (`delete_post_draft`): only a post that was never online and has no schedule
  (`post_was_published` otherwise; cancel a failed schedule first). The post, its revisions,
  reviews, image references and reports go with it; the audit line keeps the title (140
  characters). A post that was ever published is never deleted: unpublish or archive it.

## Addresses

- Given at the **first publication**, from the title of the revision going live
  (`private.unique_post_slug`): lower case, accents folded (`private.fold_accents`: à→a, ç→c,
  œ→oe…), every other run of characters becomes one dash, at most 80 characters. Too short (under
  3) or a reserved word (`rss`, `flux`, `feed`, `apercu`, `nouveau`, `recherche`, kept for routes
  under `/campus`) gives `article-<first 8 characters of the id>`. Taken by another post or
  by any former address: `-2`, `-3`… are appended.
- Later publications never change it: retitling an article does not move its link.
- `change_post_slug` (`posts.publish`, second factor; published-once posts only): same format,
  3–100 characters, not reserved (`slug_invalid`), not used by another post now or before
  (`slug_taken`); a post may take back one of its own former addresses. The old address goes to
  `post_slug_history` and answers `moved` (tested) for as long as the post is public; it is never
  given to another post.

## Public read model

Visitors (and signed-in students outside the team) never read the post tables: `anon` has no
grant on them at all (tested), and every public read is a `security definer` function granted to
`anon` and `authenticated` that only ever reads `published_revision_id`.

- **Readable at its address** (`private.post_is_public`): publication `published` or `archived`,
  not hidden, with a live revision, and the association's page public (organization active, page
  published, not withheld: `private.association_page_is_public`).
- **Listed** (feed, search, facets, featured, association page, sitemap): the same, but
  `published` only (archived posts are not listed).

| Function | Returns |
| --- | --- |
| `public_posts(organization_slug, category, kind, q, before_at, before_id, limit)` | Listed posts as cards (no body), newest first publication first. Keyset pagination: pass the last card's `first_published_at` and `id` (`(first_published_at, id) < (…)`), 1–50 per page (20 by default); new posts never shift or repeat what the reader saw. |
| `public_post(slug)` | `{state: 'ok', post}` with body and media map; `{state: 'moved', slug}` for a former address of a public post; `{state: 'not_found'}` for anything else (draft, unpublished, hidden, association not public, unknown), without saying why. |
| `public_post_facets()` | What the filters offer: total, active rubriques with a count, associations with a count (BDE first), kinds with a count. Listed posts only. |
| `public_featured_posts()` | `featured` and `important` posts whose prominence has not ended. |
| `public_association_posts(slug, limit)` | An association's listed posts: pinned first, then newest; 1–24 (6 by default). |
| `public_post_sitemap()` | Address and last publication of up to 5,000 listed posts. |

A card (`private.post_card`) carries the kind, title, intro, cover, rubrique, tags, the
organization's **published** identity (name, short name, accent, logo from its published page),
first and last publication, reading time, the prominence in force (an expired one reads
`normal`), pinned and archived flags, and the author's name where allowed. Never an account id,
an e-mail, a contributor or a reviewer (tested on a public article).

**Search** (`q` in `public_posts`, at least 2 characters, 80 at most): `websearch_to_tsquery` with
the French configuration on accent-folded text (quotes and `-word` work), against the published
revision's generated `search` vector (title weight A, intro B, body text and tags C), **or** the
association's name or short name containing the folded query. Results keep the feed order (see
limitations). A shorter query is ignored (the unfiltered list comes back). A submission or a
draft is never found (tested).

**No draft by query manipulation**: the public functions take slugs, a kind, text and a cursor
(whose id is only a sort bound), never an id to fetch; eligibility is written in the SQL, not
passed as a parameter; the only way to read a draft is the private preview below.

**Private preview**: `post_preview(post, revision?)` returns any revision of the history (the
working one by default) in the public shape, with a `live` flag, to whoever may read the post in
the editor (`private.can_read_post`: can edit, or `posts.approve`, or `posts.publish` in its
organization). The site serves it at `/campus/apercu/<post>[?version=<revision>]`
(`routes.postPreview`) with draft images through the private route, never indexed. `apercu` is a
reserved slug, so no article can take that address.

**On the site**, everything public is read through the functions above, as a visitor
(`src/lib/data/posts.ts`):

- `/campus`: the fil. Filters (association, rubrique, kind, text) live in the URL; older pages use
  the keyset cursor (`?suite=<first publication>~<id>`); filtered and paged views are `noindex`.
- `/campus/<slug>`: the article (shared layout `ArticleView`, the body through `RichText`). A
  former address redirects permanently to the current one; anything else unknown is a plain 404.
  Metadata: title, the intro as description, canonical URL, Open Graph `article` (first and
  latest publication, rubrique as section, tags, the author only where signed, the cover), all
  absolute once `SITE_URL` is set; an archived article is `noindex`. Sharing is "copy the link"
  plus the device's own share sheet (no social network button, no third-party script); "Signaler"
  for signed-in students only, never a count. Then the association's other posts and the latest
  from elsewhere.
- The home page: the BDE's important notices, one lead story (the first featured one, otherwise
  the latest that is not a brève), then the next ones as briefs; no post twice, nothing at all
  when nothing is published.
- An association's page: `public_association_posts`, pinned posts first and marked "Épinglé",
  with a link to the fil filtered on the association.
- Search: the ⌘K dialog filters a small index sent with every page (the 30 latest posts); the
  `/search` page asks `public_posts(q)` for articles (50 at most).
- `/sitemap.xml` lists `/campus` and every listed post (`public_post_sitemap`, last modified = the
  latest publication) once `SITE_URL` is set; `/robots.txt` disallows `/manage`, `/campus/apercu/`
  and `/associations/*/apercu`.
- `/campus/rss`: RSS 2.0 of the 30 latest listed posts (title, link, a guid from the post id, first
  publication, intro, rubrique and kind, who signs). It answers 404 until the site has a public
  address (`SITE_URL` set, and not localhost in production).

## Prominence and pins

- **Pins** belong to the association: `set_post_pin` (`posts.publish`) pins a published post at
  the top of its association page, three per association at most (`pin_limit`). Unpublishing,
  archiving and hiding remove the pin, and a hidden post cannot be pinned (`post_hidden`).
- **Site-wide prominence** belongs to the BDE leadership (decision D40): `set_post_prominence`
  (`platform.content.feature`, second factor) sets `featured` (a story "à la une", any
  association's post, three at a time) or `important` (an important BDE announcement, BDE posts
  only, two at a time: an association's post cannot be dressed as a BDE notice, tested), with an
  optional end (`prominence_until`, after now and within 60 days; the site sends the end of the
  chosen Paris day; `prominence_period` otherwise). `normal` removes it. Only published,
  visible posts can be set (`post_not_published`); hiding, unpublishing and archiving reset it;
  an association cannot change it (tested). The limit counts only the posts the site actually
  shows (published, not hidden, on a public page: the rule of `public_featured_posts`), so a post
  whose association page went offline never blocks a slot.
- Expiry needs no job: every read compares `prominence_until` with now.

## Authors on articles

A post is signed by its association. With `show_authors` on, cards and articles also carry
`author_name` (`private.post_author_name`), and only when the post's author (`created_by`) is
still an active member of the association and has not hidden themselves from its public team
(their own Phase 5 setting). The name is `private.person_name` (display name, or first and last
name): never an e-mail, an account id, the other contributors or the reviewers. The preview shows
the same signature.

## Reports and moderation

- **Reporting** (`report_post`, any signed-in student): only a public post can be reported
  (`post_not_found` otherwise: a draft does not exist publicly). Reason among `harassment`,
  `discrimination`, `misleading`, `privacy`, `image_rights`, `spam`, `other`; details optional,
  ≤ 500 characters. One open report per person and post (`already_reported`, also a unique
  index); at most 5 reports an hour and 20 a day per person (`report_rate_limited`).
- **Anonymity** (decision D39): `reporter_id` is kept for abuse handling only. The moderation screens never show
  it (tested), the association never sees reports (`content_reports` is readable only by the
  reporter, for their own rows), and the audit line `content_reported` has neither actor nor
  organization, so the association's own history does not show it was reported (tested).
- **The queue** (`moderation_queue`, `platform.content.moderate`): open reports grouped by post
  (count, reasons, details, dates; the post as published), hidden posts with their reason and who
  hid them, the 30 latest closed reports, the 50 latest moderation events. `moderated_post`
  returns a post's published content. Moderators read only what was public: never a draft or an
  older revision, and `post_editor` refuses them (tested).
- **Dismiss** (`dismiss_report`, optional note): closes a report without action
  (`report_dismissed`).
- **Hide** (`hide_post`, second factor, reason 3–500 characters): any post that has been published
  at least once. The post leaves the site everywhere at once (address, feed, search, association
  page, featured lists, sitemap; its images too, unless something else public uses them); its
  pin and prominence are removed; its open reports
  are closed as `actioned` with the reason. Audited `post_hidden` with the organization, so the
  association sees it in its history, and sees the reason on the desk and in the editor.
- **Moderation overrides publication**: `publish_post`, `schedule_post` and the worker refuse a
  hidden post (`post_hidden`), and unarchiving does too (all tested for publish, schedule and the
  worker). The association can still edit, unpublish or archive it; none of that makes it public.
- **Restore** (`restore_post_visibility`, second factor, reason): lifts the hide; the post comes
  back exactly as the association left it (online if it is still published; pin and prominence
  are not restored). Audited `post_restored`.
- The BDE leadership has no other power over an association's posts: it cannot read drafts,
  edit, approve or publish them. The continuity guardian has no content power at all (tested).

## Notifications

Phase 6 sends no e-mail or push message (decision D42). People learn what happened from the desk
and the editor (the states above, the reviewer's note, the failed schedule's reason, the hide
reason) and from the audit history. The audit actions are the integration points the
notification phase (Phase 10) will listen to:

| Action | Category | Subject / useful details |
| --- | --- | --- |
| `post_created`, `post_revision_started`, `post_revision_restored`, `post_draft_deleted` | content | revision numbers; title for a deletion |
| `post_submitted`, `post_withdrawn` | content | revision (for approvers) |
| `post_approved`, `post_changes_requested` | content | subject = the submitter; the note as reason |
| `post_published`, `post_scheduled`, `post_schedule_cancelled` | content | revision, first publication or not, scheduled instant |
| `post_schedule_failed` | content | actor = who scheduled (authority `scheduler`), error code |
| `post_unpublished`, `post_archived`, `post_unarchived`, `post_pinned`, `post_unpinned`, `post_slug_changed` | content | reason for an unpublication; old and new address |
| `post_prominence_changed` | content | prominence and end (authority `bde`) |
| `editorial_settings_updated` | content | new and previous policy |
| `content_reported`, `report_dismissed` | moderation | no actor or organization on a report; post and reason in details |
| `post_hidden`, `post_restored` | moderation | the reason; number of reports closed |
| `post_category_created`, `post_category_updated` | catalog | rubrique |
| `association_media_uploaded`, `association_media_removed` | media | kind and size of the image |

French sentences for each: `AUDIT_ACTION_LABEL` in `src/lib/governance/labels.ts`.

## Caching and revalidation

- The public data layer (`src/lib/data/posts.ts`) reads as a visitor (publishable key, no
  cookies) and memoises per request only (React `cache`): a publication, an edit going live, a
  hide or an unpublication shows on the next page load. There is no cross-request cache to purge.
- After every successful action, the Server Actions call `revalidatePath("/", "layout")`, so no
  rendered page or client router cache keeps an outdated version. Autosave does not (it never
  changes what visitors see).
- The worker publishes inside the database: no revalidation is needed for request-time pages.
- `sitemap.xml` is regenerated at most hourly (`revalidate = 3600`) and `/campus/rss` at most
  every ten minutes (`revalidate = 600`); a scheduled publication can take that long to appear
  there. Public images are cached 5 minutes (route and optimizer).
- Private previews, the desk, the editor and the moderation screens are rendered per request for
  the signed-in person and are never cached publicly.

## Who may do what

| Action | Right | Second factor |
| --- | --- | --- |
| Start a post | `posts.create` or `posts.edit` | |
| Write, save, submit, withdraw, restore a version, delete a never-published post | own posts: `posts.create`; every post of the association: `posts.edit` | |
| Send images | `posts.create` or `media.manage` | |
| Remove images (if no revision uses them) | `media.manage` | |
| Approve or request changes (never on a version one wrote or sent) | `posts.approve` | ✓ |
| Publish now, schedule | `posts.publish` | ✓ |
| Cancel a schedule, unpublish, archive and unarchive, pin | `posts.publish` | |
| Change an address | `posts.publish` | ✓ |
| Editorial policy | `posts.settings` | ✓ |
| See the desk | any `posts.*` key (`posts.create` alone: one's own posts) | |
| Open a post in the editor, preview any version | can edit, `posts.approve` or `posts.publish` | |
| Report a public post | any signed-in student | |
| Dismiss a report | `platform.content.moderate` | |
| Hide, restore (with a reason) | `platform.content.moderate` | ✓ |
| Featured story, important BDE announcement | `platform.content.feature` | ✓ |
| Maintain the rubriques | `platform.organizations.manage` | ✓ |

Rights are computed at each request (Phase 4): an ended mandate or a narrowed position stops the
same session at once (tested), and a suspended or archived association's team can no longer act.
Putting content online needs the second factor; taking it off (unpublish, archive, cancel) does
not.

Routes (`src/lib/routes.ts`): the desk `/manage/<asso>/content` (new post `/content/new`, editor
`/content/<post>`, history `/content/<post>/historique`, policy `/content/reglages`); BDE
`/manage/plateforme/moderation`, `/manage/plateforme/une` and the rubriques in
`/manage/plateforme/categories`; public `/campus`, `/campus/<slug>`, `/campus/apercu/<post>`,
`/campus/rss`.

## Tests

- `supabase/tests/database/posts.test.sql` (pgTAP, 136 checks, on top of `seed.sql`, rolled
  back): (1) visitors read published posts only: feed, address, archived mark, hidden = not found,
  search, no internal field, no table access, no write, no worker; (2) writing: organization
  scope, stale version refused, another association's image refused, XSS payloads refused (script
  node, `javascript:` and protocol-relative links, outside image URL, markup in tags), direct
  table writes refused (move organization, set the live pointer or a status, forged author),
  cross-association edit and read refused; (3) approval bound to the exact revision: author,
  ended mandate, other association, missing second factor refused; hash recorded; approved
  revision frozen even for the owner; editing a live post opens a new revision while visitors
  keep the approved one; changed content refused under the old approval; self-review; note
  required; policy switch authorizes nothing retroactively; a restored version needs approval;
  (4) an author with `posts.create` only; (5) draft images private, published cover public,
  `media_in_use`; (6) direct publishing and scheduling: past refused, daylight saving instant,
  overdue publication, no duplicate, `scheduler` authority, cancellation, hidden post and missing
  image fail with their reason, moderation not bypassed by publishing or scheduling; (7) reports
  and moderation: duplicate, draft, rate limit, anonymity towards the association, who may hide,
  second factor, the queue without reporters or drafts, hide and restore, history, prominence
  rules; (8) address change and redirect, deletion rules, policy right, revocation in the same
  session; (9) a suspended association publishes nothing, by hand or by the worker.
- `supabase/tests/database/foundation.test.sql` lists the private helpers each API role may run
  (the three Phase 6 ones included).
- `src/lib/governance/governance.test.mjs` (`npm run test:unit`) checks that every refusal the
  migrations can raise has a French sentence and every audited action a label.
- `src/lib/posts/posts.test.mjs` (`npm run test:unit`, plain Node): the body normalizer (unknown
  nodes, keys and marks dropped, unsafe links unlinked, a hostile paste coming out as a body the
  database accepts, the size and nesting limits, idempotence), `isSafeHref` as the database's link
  rule and `toSafeHref`, tags, reading time, quality notes, Paris time conversion around both
  daylight-saving changes, the desk's stages, tabs and search, the payload mapping (nothing more
  than a card carries, preview images through the private route), the feed cursor and filters,
  and the save input (`normalizePostContent`).
- `src/components/campus/rss-feed.test.mjs`: the RSS document (escaping, characters XML forbids,
  RFC 822 dates, item shape, an empty feed).
- `e2e/publishing.spec.ts` (Playwright, local stack with the seed): the editorial journeys in the
  browser.

## Known limitations

- **Direct publishing has no version check.** `publish_post` publishes the working draft as it is
  stored when the publisher clicks; a co-editor's save a moment earlier goes out with it (pages
  have `draft_changed`, posts do not). In approval mode this cannot happen: only the frozen,
  approved revision is published.
- Failed schedules are not retried and nobody is alerted beyond the desk (and the SQL above). A
  run handles 50 due posts; the rest go out a minute later. Without `pg_cron` on an environment,
  scheduled posts never go out.
- **Moderators see a hidden post's text, not its images**: the images stop being public and the
  BDE is not in the association's team, so the private route refuses them.
- A post whose association page goes offline keeps its prominence flag (it shows again with the
  page) but does not take a slot meanwhile.
- Self-review is judged on the revision's contributors and submitter. A restored or newly
  started revision lists only the person who created it, so the author of the earlier text could
  approve someone else's edit of it.
- An image used by any version of a post can never be removed while the post exists, and a post
  that went online is never deleted: those images stay in the library (quota 300).
- After an unpublication or a hide, a public image can stay in caches for up to 5 minutes.
- No video or social embeds, tables or code blocks; headings of two levels. No comments, likes or
  view counts, by design.
- Reports are invisible to associations by design (they only see a hide and its reason). A
  reporter can read their own report rows (status and closing note) through the API.
- RSS and the sitemap need `SITE_URL` (absolute links, decision D32): until the BDE's domain
  exists, the sitemap is empty and `/campus/rss` answers 404.
- Search is simple: results come in feed order (newest first publication), not by relevance; the
  weights are stored but unused; archived posts are not searchable; a one-character query filters
  nothing (the fil ignores searches under two characters). The ⌘K dialog only knows the 30 latest posts (the `/search` page searches them all).
- An archived rubrique still shows on the posts that have it; it is no longer offered in filters
  or the editor.
- Notifications are in-app states only until Phase 10.

## Error codes

`post_not_found`, `insufficient_permission`, `mfa_required`, `post_invalid` (detail: the
constraint), `draft_conflict`, `revision_not_editable`, `revision_not_submitted`,
`revision_not_found`, `revision_locked`, `post_owner_locked`, `post_incomplete`, `media_not_found`,
`category_invalid`, `self_review`, `reason_required`, `approval_required`, `post_hidden`,
`organization_inactive`, `page_not_public`, `invalid_schedule`, `not_scheduled`,
`post_not_published`, `post_not_archived`, `post_was_published`, `pin_limit`,
`prominence_invalid`, `prominence_limit`, `prominence_period`, `invalid_period`, `slug_invalid`, `slug_taken`,
`already_reported`, `report_rate_limited`, `report_invalid`, `report_not_open`, `post_not_hidden`,
`category_taken`, `media_in_use`, `media_quota`, `media_invalid`. Schedule failures (stored, not
raised): `approval_missing`, `unexpected` and the blockers above. French sentences in
`src/lib/governance/messages.ts`.
