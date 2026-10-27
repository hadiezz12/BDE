#!/usr/bin/env bash
# Concurrency test of the continuity jobs (Phase 11, brief §51, §52, §55),
# with real parallel sessions — something one pgTAP transaction cannot do.
#
#   1. A job is still running when the scheduler starts it again. Expected:
#      the second run does nothing and is recorded as skipped.
#   2. Five sessions run the governance checker at the same instant.
#      Expected: one open row per issue, no alert sent twice.
#   3. Two storage-cleanup workers claim at the same instant. Expected:
#      every queued file claimed by exactly one of them.
#   4. Alice clicks "Relancer" twice at once. Expected: one run, one refusal.
#
# Runs as the database owner, as pg_cron and the Edge Function do. Fictional
# data only; what is made here is removed at the end.
# Usage: supabase/tests/concurrency/continuity.sh "<database url>"
set -euo pipefail

DB="${1:?usage: continuity.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

ALICE=a0000000-0000-4000-8000-000000000001

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from private.storage_cleanup_queue where reason = 'concurrency_test';
SQL
}

cleanup

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
as() { echo "select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\", \"aal\": \"${2:-aal1}\"}', false);"; }

# ---- 1. A run while the previous one still holds the job ------------------------------------------------
start=$(at 1)
(
  "${PSQL[@]}" <<SQL > "$TMP/holder.out" 2>&1
begin;
select pg_advisory_xact_lock(hashtext('vpc-job:governance-health'));
select pg_sleep(4);
commit;
SQL
) &
(
  "${PSQL[@]}" <<SQL > "$TMP/second.out" 2>&1
select pg_sleep_until('$start'::timestamp + interval '1 second');
select 'status:' || (private.run_scheduled_job('governance-health') ->> 'status');
SQL
) &
wait
grep -qx 'status:skipped' <(tr -d '\r' < "$TMP/second.out") || fail "a run during another one should be skipped: $(tr '\n' ' ' < "$TMP/second.out")"
echo "ok - a job started while it is still running does nothing (recorded as skipped)"

# ---- 2. Five checkers at once ----------------------------------------------------------------------------------
before=$(sql "select count(*) from public.notifications where kind in ('governance_issue_alert', 'governance_bde_vacancy')")
start=$(at 2)
for s in 1 2 3 4 5; do
  (
    "${PSQL[@]}" <<SQL > "$TMP/check-$s.out" 2>&1
select pg_sleep_until('$start');
select 'status:' || (private.run_scheduled_job('governance-health') ->> 'status');
SQL
  ) &
done
wait
ran=$(cat "$TMP"/check-*.out | tr -d '\r' | grep -cE '^status:(succeeded|skipped)$' || true)
[ "$ran" = "5" ] || fail "five checkers: $(cat "$TMP"/check-*.out | tr '\n' ' ' | head -c 400)"
dupes=$(sql "select count(*) from (select issue_key from public.governance_issues where status = 'open' group by issue_key having count(*) > 1) d")
[ "$dupes" = "0" ] || fail "$dupes issues are open twice"
twice=$(sql "select count(*) from (select dedupe_key from public.notifications where kind = 'governance_issue_alert' group by dedupe_key having count(*) > 1) d")
[ "$twice" = "0" ] || fail "$twice alerts were sent twice"
again=$(sql "select (private.run_scheduled_job('governance-health') -> 'result' ->> 'notified')")
[ "$again" = "0" ] || fail "a run after the five sent $again new alerts"
after=$(sql "select count(*) from public.notifications where kind in ('governance_issue_alert', 'governance_bde_vacancy')")
echo "ok - five checkers at once: one open row per issue, no alert twice ($((after - before)) new alerts in all)"

# ---- 3. Two storage workers, one queue ---------------------------------------------------------------------------
"${PSQL[@]}" > /dev/null <<'SQL'
insert into private.storage_cleanup_queue (bucket_id, object_path, reason)
select 'recruitment-documents', 'applications/00000000-0000-4000-8000-' || lpad(g::text, 12, '0') || '/00000000-0000-4000-8000-000000000000',
       'concurrency_test'
  from generate_series(1, 40) g;
SQL
start=$(at 2)
for w in 1 2; do
  (
    "${PSQL[@]}" <<SQL > "$TMP/claim-$w.out" 2>&1
select pg_sleep_until('$start');
select c ->> 'id' from jsonb_array_elements(public.claim_storage_cleanup(200)) c;
SQL
  ) &
done
wait
ours=$(sql "select string_agg(id::text, ' ') from private.storage_cleanup_queue where reason = 'concurrency_test'")
total=0
for id in $(cat "$TMP"/claim-*.out | tr -d '\r' | grep -E '^[0-9]+$'); do
  case " $ours " in *" $id "*) total=$((total + 1)) ;; esac
done
distinct=$(cat "$TMP"/claim-*.out | tr -d '\r' | grep -E '^[0-9]+$' | sort -u | wc -l | tr -d ' ')
all=$(cat "$TMP"/claim-*.out | tr -d '\r' | grep -cE '^[0-9]+$' || true)
[ "$all" = "$distinct" ] || fail "two workers claimed $all files but only $distinct distinct ones"
[ "$total" = "40" ] || fail "expected the 40 test files claimed once each, got $total"
echo "ok - two storage workers at once: 40 files, each claimed by exactly one worker"

# ---- 4. Two clicks on "Relancer" ---------------------------------------------------------------------------------------
sql "delete from public.scheduled_job_runs where job_key = 'storage-cleanup' and trigger = 'manual'" > /dev/null
start=$(at 2)
for t in 1 2; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/retry-$t.out" 2>&1
select pg_sleep_until('$start');
$(as "$ALICE" aal2)
select 'retry:' || (public.retry_scheduled_job('storage-cleanup') ->> 'status');
SQL
  ) &
done
wait
ok=$(cat "$TMP"/retry-*.out | tr -d '\r' | grep -cE '^retry:(succeeded|skipped)$' || true)
refused=$(cat "$TMP"/retry-*.out | tr -d '\r' | grep -c 'job_retry_too_soon' || true)
[ "$ok/$refused" = "1/1" ] || fail "two clicks: $ok runs, $refused refusals (expected 1/1): $(cat "$TMP"/retry-*.out | tr '\n' ' ' | head -c 400)"
echo "ok - two clicks on Relancer at once: one run, one refusal"

cleanup
echo "continuity concurrency: all scenarios passed"
