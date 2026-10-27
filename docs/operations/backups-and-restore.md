# Backups and restore

A backup that was never restored is not a recovery plan. This runbook says
what exists, what does not, how to test a restore without touching
production, and how to record it so the site can show it honestly.

## What the provider does (and does not)

As documented by Supabase (checked 27 October 2026; re-check the plan page,
the numbers change):

- **Free plan:** no backup the project owner can restore or download.
  Supabase recommends taking your own regular dumps (`supabase db dump`).
- **Pro / Team / Enterprise:** daily database backups, kept 7 / 14 / 30 days,
  restorable from the dashboard. Point-in-time recovery is a paid add-on.
- **Database backups never include Storage objects** (association images,
  post and event media, CVs and application documents). Restoring the
  database brings back the rows that point to files, not the files.

The development project `verypinkclub-dev` is on the free plan, in a
personal organization: it has no provider backup, and it must not become the
production project as it is (see `technical-ownership.md`).

Which plan production uses, and who verified its backups, goes in the
register (**Centre de contrôle › Continuité › Registre et sauvegardes**,
line *Projet Supabase*). The site cannot read the provider's console: the
backup status it shows is always a person's dated declaration.

## Database

Without provider backups (or in addition to them), take dumps on a schedule
the technical owner chooses, from a machine the institution controls:

```bash
supabase db dump --db-url "$DATABASE_URL" -f schema.sql
supabase db dump --db-url "$DATABASE_URL" --data-only -f data.sql
```

`$DATABASE_URL` comes from the project's settings and is a secret: keep it in
a password manager or the CI secret store, never in a file in the repository.
A dump contains every applicant's data and every private note: store it
**encrypted**, somewhere only the technical owner (and their named backup)
can open, never on a personal drive, never in a shared folder, never in
public storage. Delete old dumps according to the retention decisions.

## Storage

Storage needs its own copy:

- Copy the three private buckets (`avatars`, `association-media` — which
  also holds post and event media — and `recruitment-documents`) with an
  S3-compatible tool through Supabase Storage's S3 endpoint. The S3 access
  keys are created in the dashboard and are secrets.
- The destination must be encrypted and private, under the institution's
  control. `recruitment-documents` holds CVs: its copy is as confidential as
  the bucket itself.
- Record where the copies are in the register line *Copies des fichiers*.

## Restore test (at least once a year, before each handover)

1. Create a **separate, isolated** Supabase project (never production, never
   the project of another environment people use).
2. Restore the database there (provider restore to a new project, or apply
   the schema dump then the data dump).
3. Restore some Storage objects into the same buckets.
4. Check: the tables exist, the row counts look right, a fictional sign-in
   works, a public association page renders, an image is served, a
   committee member can open a document they were assigned (with a test
   account created there), RLS refuses what it should (`supabase test db`
   against it if possible), pg_cron jobs exist, the Edge Functions and their
   secrets are configured.
5. Delete the isolated project when done. Real applicant data must not stay
   in a test environment; prefer synthetic data whenever the test allows.
6. Record it: **Registre et sauvegardes › Déclarer une vérification**
   (*Restauration de la base testée* / *Restauration des fichiers testée*,
   result, environment, date, how). The site shows it as "À refaire cette
   année" once it is older than three months before the current academic
   year began.

## Recovery objectives

How much data may be lost (RPO) and how long the site may be down (RTO) are
the institution's decisions, based on the plan it pays for. Nothing in this
repository promises a recovery time. Write the chosen targets in the register
line *Procédure de récupération des accès* (notes) once decided.

## Who may access backups

Only the technical owner and the person they name as backup. Not the BDE
offices, not the guardian, not association presidents: a backup contains more
than any of them may read in the site. No page of the site lists, downloads
or restores a backup, and none ever should.
