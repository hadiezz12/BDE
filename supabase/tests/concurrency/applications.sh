#!/usr/bin/env bash
# Concurrency test of applications (Phase 8, brief §110 and §113), with real
# parallel sessions — something one pgTAP transaction cannot do. On the seeded
# Sports campaign ("Recrutement 2027 (exemple)": open, one position per
# candidate, CV optional):
#
#   1. A student presses "Postuler" in five tabs at once. Expected: one draft,
#      the four other tabs find it.
#   2. The same student presses "Envoyer" in five tabs at once. Expected: one
#      submission, the four other tabs are told it is already sent; one
#      confirmation message, one "submitted" step in the history.
#   3. Ten students each start the three positions at the same instant (the
#      campaign allows one). Expected: exactly one application each, the
#      others refused with application_limit.
#
# Fictional data only (*.example.test), created here and deleted at the end.
# Usage: supabase/tests/concurrency/applications.sh "<database url>"
set -euo pipefail

DB="${1:?usage: applications.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# (tr: psql on Windows ends lines with a carriage return.)
sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from public.notifications where recipient_id in (select id from auth.users where email like 'candidature-%@student.example.test');
delete from auth.users where email like 'candidature-%@student.example.test';
SQL
}

cleanup

"${PSQL[@]}" <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'candidature-' || lpad(n::text, 2, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 11) as n;
update public.profiles p set first_name = 'Candidature', last_name = 'Test', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'candidature-%@student.example.test';
SQL

CAMPAIGN=$(sql "select c.id from public.recruitment_campaigns c join public.organizations o on o.id = c.organization_id
                 where o.slug = 'exemple-sports' and c.title = 'Recrutement 2027 (exemple)'")
[ -n "$CAMPAIGN" ] || fail "the seeded Sports campaign is missing"
mapfile -t POSITIONS < <(sql "select id from public.recruitment_positions where campaign_id = '$CAMPAIGN' and retired_at is null order by display_order")
[ "${#POSITIONS[@]}" = 3 ] || fail "expected three open positions, found ${#POSITIONS[@]}"
EVENTS="${POSITIONS[0]}"
FIRST=$(sql "select id from auth.users where email = 'candidature-01@student.example.test'")
mapfile -t OTHERS < <(sql "select id from auth.users where email like 'candidature-%@student.example.test' and email <> 'candidature-01@student.example.test' order by email")

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
as() { echo "select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\", \"aal\": \"aal1\"}', false);"; }

# ---- 1. Five tabs, one draft ---------------------------------------------------------
start=$(at 2)
for i in 1 2 3 4 5; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/start-$i.out" 2>&1
select pg_sleep_until('$start');
$(as "$FIRST")
select public.start_application('$EVENTS') ->> 'already';
SQL
  ) &
done
wait
drafts=$(sql "select count(*) from public.applications where candidate_id = '$FIRST'")
fresh=$(cat "$TMP"/start-*.out | tr -d '\r' | grep -cx 'false' || true)
found=$(cat "$TMP"/start-*.out | tr -d '\r' | grep -cx 'true' || true)
[ "$drafts" = 1 ] || fail "five simultaneous starts made $drafts applications (expected 1)"
[ "$fresh/$found" = "1/4" ] || fail "five simultaneous starts: $fresh created, $found found (expected 1/4)"
echo "ok - five tabs press Postuler at once: one draft, found by the four others"

APP=$(sql "select id from public.applications where candidate_id = '$FIRST'")
VERSION=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -n 1
$(as "$FIRST")
select public.save_application_answers('$APP', 1, '{"motivation": "Candidature de test de concurrence.", "sport": "foot"}'::jsonb) ->> 'version';
SQL
)

# ---- 2. Five tabs, one submission --------------------------------------------------------
start=$(at 2)
for i in 1 2 3 4 5; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/submit-$i.out" 2>&1
select pg_sleep_until('$start');
$(as "$FIRST")
select public.submit_application('$APP', $VERSION, true) ->> 'already';
SQL
  ) &
done
wait
fresh=$(cat "$TMP"/submit-*.out | tr -d '\r' | grep -cx 'false' || true)
already=$(cat "$TMP"/submit-*.out | tr -d '\r' | grep -cx 'true' || true)
[ "$fresh/$already" = "1/4" ] || fail "five simultaneous submissions: $fresh sent, $already already sent (expected 1/4): $(cat "$TMP"/submit-*.out | tr '\n' ' ')"
status=$(sql "select status || '/' || version from public.applications where id = '$APP'")
[ "$status" = "submitted/$((VERSION + 1))" ] || fail "after five submissions the application is $status (expected submitted/$((VERSION + 1)))"
steps=$(sql "select count(*) from public.application_events where application_id = '$APP' and action = 'submitted'")
[ "$steps" = 1 ] || fail "$steps 'submitted' steps in the history (expected 1)"
messages=$(sql "select count(*) from public.notifications where application_id = '$APP' and kind = 'application_submitted'")
[ "$messages" = 1 ] || fail "$messages confirmation messages (expected 1)"
echo "ok - five tabs press Envoyer at once: one submission, one confirmation"

# ---- 3. The limit holds under a race -------------------------------------------------------
start=$(at 3)
for user in "${OTHERS[@]}"; do
  for position in "${POSITIONS[@]}"; do
    (
      "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/limit-$user-$position.out" 2>&1
select pg_sleep_until('$start');
$(as "$user")
select 'started:' || (public.start_application('$position') ->> 'already');
SQL
    ) &
  done
done
wait
started=$(cat "$TMP"/limit-*.out | tr -d '\r' | grep -cx 'started:false' || true)
refused=$(cat "$TMP"/limit-*.out | grep -c 'application_limit' || true)
[ "$started" = 10 ] || fail "ten students racing for three positions: $started started (expected 10)"
[ "$refused" = 20 ] || fail "ten students racing for three positions: $refused refused (expected 20)"
over=$(sql "select count(*) from (select candidate_id from public.applications a join auth.users u on u.id = a.candidate_id
                                    where u.email like 'candidature-%@student.example.test' and a.campaign_id = '$CAMPAIGN'
                                    group by candidate_id having count(*) > 1) x")
[ "$over" = 0 ] || fail "$over students hold more applications than the campaign allows"
echo "ok - ten students start three positions at once: one each, twenty refused"

cleanup
echo "ok - concurrency of applications"
