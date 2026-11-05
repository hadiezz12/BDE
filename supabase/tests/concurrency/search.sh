#!/usr/bin/env bash
# Load and concurrency test of the campus search and saved items (Phase 12,
# brief §32, §103), with real parallel sessions — something one pgTAP
# transaction cannot do.
#
#   1. Twenty visitors search at once, 25 searches each (words, prefixes,
#      types, filters, pages, the grouped view, nonsense). Expected: every
#      search answers, none fails, and the slowest stays under the budget.
#   2. The search vectors are indexed: with sequential scans disabled, the
#      planner reaches every searched table through its GIN index.
#   3. One student presses "Enregistrer" in ten tabs at once. Expected: one
#      saved row, ten "saved" answers.
#   4. Ten tabs save and unsave the same item at once. Expected: no error,
#      and at most one row afterwards.
#
# Runs as the database owner, switching to the API roles inside each
# session. Fictional seed data only; what is made here is removed at the end.
# Usage: supabase/tests/concurrency/search.sh "<database url>"
set -euo pipefail

DB="${1:?usage: search.sh <database url>}"
. "$(dirname "$0")/_local-only.sh"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

PAUL=a0000000-0000-4000-8000-00000000000a
# The slowest single search allowed under load, in milliseconds (CI runners
# are slow and shared; the seed is small, so this is a ceiling, not a target).
BUDGET_MS=${SEARCH_BUDGET_MS:-1500}

cleanup() {
  "${PSQL[@]}" -c "delete from public.saved_items where user_id = '$PAUL';" >/dev/null 2>&1 || true
}

cleanup

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }

# ---- 1. Twenty visitors, 25 searches each --------------------------------------------------------------------
start=$(at 2)
for s in $(seq 1 20); do
  (
    "${PSQL[@]}" <<SQL > "$TMP/load-$s.out" 2>&1
set role anon;
select pg_sleep_until('$start'::timestamp);
do \$\$
declare
  v_queries text[] := array['finance', 'financ', 'soirée', 'sport', 'recrutement', 'atelier finance', 'trésorerie',
                            'exemple', 'zzqqxx', 'pink', 'événements', '"atelier finance"', 'finance -atelier', 'x',
                            'communication', 'tournoi', 'conférence', 'sponsoring', 'escalade', 'rentrée',
                            'le', 'week-end', 'basket', 'brouillon', 'partenariats'];
  v_types text[] := array[null, 'association', 'post', 'event', 'campaign', 'position'];
  v_started timestamptz;
  v_ms numeric;
  v_max numeric := 0;
  v_total numeric := 0;
  v_result jsonb;
begin
  for i in 1 .. 25 loop
    v_started := clock_timestamp();
    v_result := public.search_campus(
      v_queries[i], v_types[1 + (i + $s) % 6],
      p_when => case when (i + $s) % 6 = 3 and i % 2 = 0 then 'upcoming' end,
      p_status => case when (i + $s) % 6 = 4 and i % 3 = 0 then 'open' end,
      p_limit => 12, p_offset => case when i % 5 = 0 then 12 else 0 end,
      p_per_type => case when (i + $s) % 6 = 0 then 4 end);
    if v_result ->> 'total' is null then
      raise exception 'search % returned no total', v_queries[i];
    end if;
    v_ms := extract(epoch from clock_timestamp() - v_started) * 1000;
    v_max := greatest(v_max, v_ms);
    v_total := v_total + v_ms;
  end loop;
  raise notice 'max_ms=% avg_ms=%', round(v_max), round(v_total / 25);
end
\$\$;
SQL
  ) &
done
wait
for s in $(seq 1 20); do
  grep -q "ERROR" "$TMP/load-$s.out" && fail "session $s: $(tr '\n' ' ' < "$TMP/load-$s.out")"
done
max=$(grep -ho 'max_ms=[0-9]*' "$TMP"/load-*.out | cut -d= -f2 | sort -n | tail -1)
avg=$(grep -ho 'avg_ms=[0-9]*' "$TMP"/load-*.out | cut -d= -f2 | awk '{ s += $1 } END { printf "%d", s / NR }')
test -n "$max" || fail "no timing came back: $(cat "$TMP"/load-1.out)"
[ "$max" -le "$BUDGET_MS" ] || fail "the slowest search took ${max} ms under load (budget ${BUDGET_MS} ms)"
echo "ok - 500 searches by 20 simultaneous visitors, none failed (average ${avg} ms, slowest ${max} ms)"

# ---- 2. The searched tables are reachable through their GIN indexes -------------------------------------------
plan=$("${PSQL[@]}" <<'SQL' | tr -d '\r'
set enable_seqscan = off;
explain (costs off) select 1 from public.association_profiles where search @@ private.search_tsquery('finance');
explain (costs off) select 1 from public.post_revisions where search @@ private.search_tsquery('finance');
explain (costs off) select 1 from public.events where search @@ private.search_tsquery('finance');
explain (costs off) select 1 from public.recruitment_campaigns where search @@ private.search_tsquery('finance');
explain (costs off) select 1 from public.recruitment_positions where search @@ private.search_tsquery('finance');
SQL
)
for idx in association_profiles_search_idx post_revisions_search_idx events_search_idx recruitment_campaigns_search_idx recruitment_positions_search_idx; do
  grep -q "$idx" <<< "$plan" || fail "the planner cannot use $idx: $plan"
done
echo "ok - every searched table is reachable through its GIN index"

# ---- 3. Ten tabs press "Enregistrer" at once ------------------------------------------------------------------
target=$(sql "select id from public.organizations where slug = 'exemple-finance'")
start=$(at 1)
for s in $(seq 1 10); do
  (
    "${PSQL[@]}" <<SQL > "$TMP/save-$s.out" 2>&1
select set_config('request.jwt.claims', '{"sub": "$PAUL", "role": "authenticated", "aal": "aal1"}', false);
set role authenticated;
select pg_sleep_until('$start'::timestamp);
select 'saved:' || public.save_item('association', '$target', true);
SQL
  ) &
done
wait
ok=$(cat "$TMP"/save-*.out | tr -d '\r' | grep -c '^saved:true$' || true)
[ "$ok" -eq 10 ] || fail "ten saves should all answer saved: $(cat "$TMP"/save-*.out | tr '\n' ' ')"
rows=$(sql "select count(*) from public.saved_items where user_id = '$PAUL' and organization_id = '$target'")
[ "$rows" -eq 1 ] || fail "ten simultaneous saves left $rows rows"
echo "ok - ten simultaneous saves of one item: one row, ten confirmations"

# ---- 4. Ten tabs save and unsave at once ------------------------------------------------------------------------
start=$(at 1)
for s in $(seq 1 10); do
  (
    "${PSQL[@]}" <<SQL > "$TMP/toggle-$s.out" 2>&1
select set_config('request.jwt.claims', '{"sub": "$PAUL", "role": "authenticated", "aal": "aal1"}', false);
set role authenticated;
select pg_sleep_until('$start'::timestamp);
select 'state:' || public.save_item('association', '$target', $([ $((s % 2)) -eq 0 ] && echo true || echo false));
SQL
  ) &
done
wait
grep -l "ERROR" "$TMP"/toggle-*.out >/dev/null 2>&1 && fail "a save or unsave failed: $(cat "$TMP"/toggle-*.out | tr '\n' ' ')"
rows=$(sql "select count(*) from public.saved_items where user_id = '$PAUL' and organization_id = '$target'")
[ "$rows" -le 1 ] || fail "saving and unsaving at once left $rows rows"
echo "ok - saving and unsaving in ten tabs at once: no error, ${rows} row (never a duplicate)"

cleanup
echo "search concurrency: all checks passed"
