#!/usr/bin/env bash
# Restore drill (Phase 15, brief §64 and §93): a real backup and a real restore
# of the database, with a fictional student, to check that an erasure made
# after the backup is not undone by restoring it.
#
#   1. a fictional student exists;            4. the ledger is exported (no personal data);
#   2. a backup is taken (pg_dump -Fc);       5. the backup is restored into a NEW database;
#   3. the student is erased;                 6. the restored copy is checked, the ledger
#                                                imported, the erasure re-applied, RLS and
#                                                grants compared with the source.
#
# Runs ONLY against a local PostgreSQL holding the check database built from the
# migrations (never a hosted project): it refuses any host but localhost/127.0.0.1.
# It creates and drops "<source>_restore_drill". Needs psql, pg_dump, pg_restore on PATH
# (or PSQL/PG_DUMP/PG_RESTORE), a superuser in PGUSER/PGPASSWORD.
#
#   bash supabase/tests/restore/restore-drill.sh vpc_check
set -u
SRC="${1:?usage: restore-drill.sh <source database>}"
DST="${SRC}_restore_drill"
HOST="${PGHOST:-localhost}"
case "$HOST" in localhost|127.0.0.1) ;; *) echo "refusing: PGHOST=$HOST is not local" >&2; exit 2 ;; esac
PSQL="${PSQL:-psql}"; PG_DUMP="${PG_DUMP:-pg_dump}"; PG_RESTORE="${PG_RESTORE:-pg_restore}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
q() { local db="$1"; shift; "$PSQL" -h "$HOST" -X -q -A -t -v ON_ERROR_STOP=1 -d "$db" "$@"; }
fails=0; n=0
check() { # check <description> <expected> <actual>
  n=$((n + 1))
  if [ "$2" = "$3" ]; then echo "ok $n - $1"; else echo "not ok $n - $1 (expected '$2', got '$3')"; fails=$((fails + 1)); fi
}

UID_="$(q "$SRC" -c "select gen_random_uuid()")"
EMAIL="restauration-${UID_:0:8}@student.example.test"

# 1. A fictional student, identifiable.
q "$SRC" -c "delete from auth.users where id = '$UID_'" >/dev/null
q "$SRC" -c "insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ('00000000-0000-0000-0000-000000000000', '$UID_', 'authenticated', 'authenticated',
                     '$EMAIL', '', now(), '{}', '{}', now(), now())" >/dev/null
q "$SRC" -c "update public.profiles set first_name = 'Exercice', last_name = 'Restauration', onboarding_completed_at = now()
              where id = '$UID_'" >/dev/null
check "the fictional student exists before the backup" "$EMAIL" "$(q "$SRC" -c "select email from auth.users where id = '$UID_'")"

# 2. The backup.
"$PG_DUMP" -h "$HOST" -Fc -d "$SRC" -f "$WORK/backup.dump"
check "a backup file was written" "yes" "$( [ -s "$WORK/backup.dump" ] && echo yes || echo no)"

# 3. The erasure, after the backup.
q "$SRC" -c "select private.erase_person('$UID_', null, null, true)" >/dev/null
check "the student is erased in the live database" "t" "$(q "$SRC" -c "select email is null from auth.users where id = '$UID_'")"

# 4. The ledger export (one-way keys, dates, references: no personal data).
HAS_EXPORT=$(q "$SRC" -c "select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                           where s.nspname = 'private' and p.proname = 'erasure_ledger_document'")
if [ "$HAS_EXPORT" = "1" ]; then
  q "$SRC" -c "select private.erasure_ledger_document()::text" > "$WORK/ledger.json"
fi
check "the ledger can be exported from the live database" "1" "$HAS_EXPORT"
if [ -s "$WORK/ledger.json" ]; then
  check "the export holds no e-mail address" "0" "$(grep -c '@' "$WORK/ledger.json")"
  check "the export holds no account id" "0" "$(grep -c "$UID_" "$WORK/ledger.json")"
fi

# 5. Restore into an isolated new database.
q postgres -c "drop database if exists $DST" >/dev/null
q postgres -c "create database $DST" >/dev/null
"$PG_RESTORE" -h "$HOST" -d "$DST" --no-owner --exit-on-error "$WORK/backup.dump" 2> "$WORK/restore.err"
check "the backup restores without error" "0" "$?"

# 6. What the restore brought back, and the reconciliation.
check "the restored copy holds the student again (backups keep erased data)" "$EMAIL" \
  "$(q "$DST" -c "select email from auth.users where id = '$UID_'")"
check "the restored ledger does not know this erasure (it predates it)" "0" \
  "$(q "$DST" -c "select count(*) from private.erasure_ledger where person_key = private.person_key('$UID_')")"
check "reconciling with the restored ledger alone re-applies nothing" "0" \
  "$(q "$DST" -c "select private.reconcile_erasures() ->> 'reapplied'")"
if [ -s "$WORK/ledger.json" ]; then
  q "$DST" -c "select private.import_erasure_ledger(\$j\$$(cat "$WORK/ledger.json")\$j\$::jsonb)" > "$WORK/import.txt"
  check "importing the exported ledger adds this erasure" "t" \
    "$(q "$DST" -c "select exists (select 1 from private.erasure_ledger where person_key = private.person_key('$UID_'))")"
  check "the reconciliation then erases the student again" "1" "$(q "$DST" -c "select private.reconcile_erasures() ->> 'reapplied'")"
  check "the e-mail is gone from the restored copy" "t" "$(q "$DST" -c "select email is null from auth.users where id = '$UID_'")"
  check "the profile is anonymised" "Compte" "$(q "$DST" -c "select first_name from public.profiles where id = '$UID_'")"
  check "a second reconciliation changes nothing" "0" "$(q "$DST" -c "select private.reconcile_erasures() ->> 'reapplied'")"
fi

# Access control comes back with the data.
RLS_SQL="select string_agg(c.relname || ':' || c.relrowsecurity, ',' order by c.relname) from pg_class c
          join pg_namespace s on s.oid = c.relnamespace where s.nspname in ('public','private') and c.relkind = 'r'"
check "row-level security is the same on every table" "$(q "$SRC" -c "$RLS_SQL" | md5sum)" "$(q "$DST" -c "$RLS_SQL" | md5sum)"
GRANT_SQL="select string_agg(table_schema || '.' || table_name || ':' || grantee || ':' || privilege_type, ',' order by table_schema, table_name, grantee, privilege_type)
             from information_schema.role_table_grants where table_schema in ('public','private')
              and grantee in ('anon','authenticated')"
check "table grants to visitors and students are the same" "$(q "$SRC" -c "$GRANT_SQL" | md5sum)" "$(q "$DST" -c "$GRANT_SQL" | md5sum)"
check "the scheduled jobs' definitions came back" "$(q "$SRC" -c "select count(*) from public.scheduled_jobs")" \
  "$(q "$DST" -c "select count(*) from public.scheduled_jobs")"

# Clean up: the isolated copy goes; the fictional account stays erased in the source.
q postgres -c "drop database if exists $DST" >/dev/null
q "$SRC" -c "delete from auth.users where id = '$UID_'" >/dev/null 2>&1 || true
echo "restore drill: $((n - fails))/$n passed"
[ "$fails" -eq 0 ]
