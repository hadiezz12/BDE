# Database conventions

Mandatory context for every phase that writes SQL. When a convention does not fit, write down
the exception in the migration's header comment and in [decisions.md](decisions.md).

## Naming

- `snake_case` for everything in the database: schemas, tables, columns, constraints, indexes,
  functions, types. Never `createdAt` or `CreatedAt`. (TypeScript keeps camelCase; loaders map.)
- Tables are plural nouns: `events`, `memberships`. Join tables name both sides:
  `position_permissions`.
- Foreign key columns are `<singular>_id`: `organization_id`, `user_id`, `campaign_id`.
- Booleans read as facts: `is_published`, `has_paid`. Timestamps end in `_at`, dates in `_on`.
- Constraints and indexes get explicit names so errors and migrations stay readable:

  | Kind | Pattern | Example |
  | --- | --- | --- |
  | primary key | `<table>_pkey` | `events_pkey` |
  | foreign key | `<table>_<column>_fkey` | `events_organization_id_fkey` |
  | unique | `<table>_<columns>_key` | `memberships_user_id_organization_id_key` |
  | check | `<table>_<rule>_check` | `events_ends_after_start_check` |
  | index | `<table>_<columns>_idx` | `events_organization_id_starts_at_idx` |
  | trigger | what it does | `set_updated_at` |

## Schemas

| Schema | Holds | Exposed through the Data API? |
| --- | --- | --- |
| `public` | the application's tables and the views/functions the app calls | yes: treat everything here as reachable from the internet |
| `private` | trigger functions, RLS helper functions, internal views | no |
| `auth`, `storage`, `realtime`, `vault`, `extensions`, … | managed by Supabase | never edit them |

Anything placed in `public` is an API surface. Supabase grants the API roles (`anon`,
`authenticated`, `service_role`) all privileges on new objects in `public` by default, so the
real protection is row level security (tables) and explicit `revoke`/`grant` (functions). An
internal helper goes in `private`, where the API roles have no access until a migration grants
it narrowly.

## Primary keys

- Domain entities (organizations, events, campaigns, applications…) use
  `id uuid primary key default gen_random_uuid()`. UUIDs do not leak counts or creation order and
  are safe to show in URLs that need an id.
- Use something else when it is genuinely better: a natural key for a fixed reference table
  (`code text primary key`), a composite key for a pure join table
  (`primary key (position_id, permission_id)`), `bigint generated always as identity` for
  high-volume append-only logs that are never exposed by id.
- Never expose sequential ids to make URLs shorter: public URLs use slugs (below).

## Timestamps

- Real-world moments are `timestamptz`: `created_at`, `updated_at`, `published_at`,
  `starts_at`, `ends_at`, `expires_at`, `deleted_at`. Never text, never `timestamp` without time
  zone. The database stores instants; Europe/Paris formatting happens in the UI
  (`src/lib/format.ts`, `src/lib/time.ts`).
- A calendar date with no time (a mandate's last day, a birthday) is `date`; say in a comment
  which time zone defines the day (Europe/Paris).

## created_at / updated_at

Tables whose rows change carry:

```sql
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

and attach the single shared trigger function — never a copy:

```sql
create trigger set_updated_at
  before update on public.<table>
  for each row execute function private.set_updated_at();
```

`now()` is the transaction time, so a value sent by a client is replaced. Append-only tables
(audit log, status history) have `created_at` only.

## Soft deletion vs erasure

- Do not add `deleted_at` everywhere. Use soft deletion (`deleted_at timestamptz`, `null` = live)
  where people need to undo, keep history, or keep references valid: likely posts, events,
  associations, campaigns. Every query, view and policy on such a table must exclude deleted
  rows; prefer a view or a policy condition over remembering it in each loader.
- A soft-deleted row is still personal data. **Deleting is not erasing.** GDPR erasure or
  anonymisation (applications, CVs, answers, reviewer notes) is a separate, audited process with
  retention rules, designed in its own phase. Security, audit and consent records may have to
  be kept or anonymised rather than deleted; that is decided per table in that phase.

## Statuses

Pick the mechanism per state machine, and write down why in the migration header:

| Mechanism | Use when | Example |
| --- | --- | --- |
| Postgres `enum` | small, stable set; ordering matters; rarely changes (adding a value is fine, removing or renaming is painful) | `publication_status`: draft, scheduled, published, archived |
| `text` + `check (status in (...))` | set may change with product decisions; simple to migrate | an application's review stage |
| lookup table with a foreign key | values carry data (label, order, colour), are managed by admins, or differ per organization | custom position types |

Never an unconstrained free `text` for a known state machine. Transitions that matter (who may
move an application from `interview` to `accepted`) are enforced in a function or policy, not
only in React. No business status type exists yet.

## Foreign keys and deletion

Every reference is a real foreign key constraint. Choose the `on delete` behaviour per
relationship; there is no default for the project:

| Behaviour | Use when | Example |
| --- | --- | --- |
| `restrict` (or the default `no action`) | the child must not silently disappear; deletion must be a deliberate process | an application → its campaign; an audit record → its actor |
| `cascade` | the child has no meaning without the parent and no history value | a draft's attachments → the draft; position_permissions → position |
| `set null` | the child stays meaningful without the parent | a post's `author_id` when an account is erased (shown as "ancien membre") |

`on delete cascade` is never used on applications, reviews, audit records or memberships
without a written reason.

## Indexes

- Create an index because a query or a constraint needs it, not for every column.
- Postgres does not index foreign keys automatically: index a foreign key column when you
  filter or join by it or delete from the parent (almost always the case for
  `organization_id`, `campaign_id`, `user_id`).
- Composite indexes follow the real access pattern, equality columns first, then the range or
  sort column: `(organization_id, starts_at)` for "this association's upcoming events".
- A partial index fits a hot subset: `where deleted_at is null`, `where status = 'published'`.
- Supabase's performance advisor lists unindexed foreign keys; check it after each migration.

## Uniqueness

Domain uniqueness is a database constraint, not an `if (!exists) insert()` in TypeScript (two
requests can pass the check at the same time). Scope it explicitly:
`unique (organization_id, slug)`, `unique (user_id, organization_id)`. Use a partial unique
index when soft-deleted rows must not block a new row:
`create unique index … on events (organization_id, slug) where deleted_at is null;`

## Other constraints

Structural truths live in the database: `not null` where a value is required,
`check (ends_at >= starts_at)`, `check (score between 0 and 5)`, length limits on user text
(`check (char_length(title) <= 120)`). Business rules that need context (deadlines, quotas) go in
functions and policies with tests. React validation is for the user's comfort, not for
integrity.

## Slugs

- Public URLs use slugs: `/associations/very-pink-club`, `/events/wei`.
- Format: lowercase ASCII letters, digits and single hyphens, 1–80 characters, checked by
  `check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`.
- Uniqueness has a defined scope (global for associations; per organization, or per series and
  year, for events) enforced by a unique constraint.
- A slug identifies a page; it never authorizes anything. Policies use ids and memberships.
  Changing a slug may need a redirect table later; ids never change.

## Row level security expectations

- Every table in `public` has `alter table … enable row level security;` in the migration that
  creates it, and its policies in the same migration (or none, which denies everything to the
  API roles). The guard test `supabase/tests/database/foundation.test.sql` fails if a table in
  `public` has RLS off.
- Before any real data is stored, every user-accessible table has policies for each operation
  it allows, and tests for both what is allowed and what is refused.
- Views in `public` use `with (security_invoker = true)` so they respect the caller's RLS (the
  guard test checks this too). `security definer` functions pin `search_path` (checked too) and
  live in `private` unless they are a deliberate RPC.
- A hidden button is not authorization. A permission problem is fixed in a policy, never by
  switching to the secret key.

## Migrations

- One concern per migration, a descriptive snake_case name:
  `20261015…_create_private_schema.sql`, never `fix.sql` or `final2.sql`.
- Header comment: what and why, plus any convention exception.
- A migration that has run anywhere shared (dev/staging, production) is never edited; fix
  forward with a new migration.
- Destructive changes (dropping a column, narrowing a type) ship in steps: stop writing,
  migrate data, then drop in a later migration.
- Data changes (backfills) are explicit SQL in a migration; `db diff` does not capture them.
- Workflow and checklist: [supabase-workflow.md](supabase-workflow.md).

## Seed data

`supabase/seed.sql` runs after the migrations on every local reset. Fake data only, obviously
fictitious ("Finance (exemple)", "[démo]"), reserved `.test` domains (`student.example.test`, `comptes.example.test`), fixed
UUIDs. Never a real student, applicant, CV, answer, email or reviewer note, even anonymised.
Seeds never reach production. Real content is entered by the BDE and the association presidents
through the platform.

## Tests later phases must add

pgTAP files in `supabase/tests/database/`, run by `supabase test db` and in CI:

- schema constraints (each check and unique rule refuses what it should)
- database functions and triggers
- RLS: allowed and refused, per role, per operation
- permissions resolved from positions, mandates and delegations
- role and mandate expiry, delegation expiry
- cross-organization isolation (association A never sees association B's private data)
- application privacy (applicants see only their own; reviewers only their campaign's; the
  School Responsible never by default)
