#!/usr/bin/env bash
# Concurrency test of the registration engine (Phase 7, brief §52 and §85),
# with real parallel sessions — something one pgTAP transaction cannot do.
#
#   1. An event with 100 seats and a waiting list; 99 seats already taken.
#      Twenty students press "S'inscrire" in the same instant, each in their
#      own database session.  Expected: exactly 1 confirmed, 19 waiting,
#      confirmed_count = 100, never more.
#   2. The same with no waiting list: exactly 1 confirmed, 19 refused (event_full).
#   3. Two confirmed students cancel in the same instant. Expected: exactly
#      the two first waiting students are promoted, once each, still 100.
#
# Fictional data only (*.example.test), created here and deleted at the end.
# Usage: supabase/tests/concurrency/registrations.sh "<database url>"
# (CI: the local stack's DB_URL; locally: any database built from the
# migrations and supabase/seed.sql).
set -euo pipefail

DB="${1:?usage: registrations.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
RACERS=20
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# (tr: psql on Windows ends lines with a carriage return.)
sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from public.events where title like 'Concurrence (test%';
delete from auth.users where email like 'concurrence-%@student.example.test';
SQL
}

cleanup

# ---- Setup (committed: every session must see it) ---------------------------------
"${PSQL[@]}" <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'concurrence-' || lpad(n::text, 3, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 140) as n;
update public.profiles p set first_name = 'Concurrence', last_name = 'Test', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'concurrence-%@student.example.test';

do $$
declare
  v_julie uuid := 'a0000000-0000-4000-8000-000000000004';
  v_finance uuid := (select id from public.organizations where slug = 'exemple-finance');
  v_event uuid;
  v_user uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  foreach v_event in array array[
    public.create_event(v_finance, 'Concurrence (test, liste)'),
    public.create_event(v_finance, 'Concurrence (test, sans liste)')]
  loop
    perform public.save_event(v_event, 1, jsonb_build_object(
      'summary', 'Événement de test de concurrence.', 'location_type', 'campus', 'venue_name', 'Salle de test',
      'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 2 hours',
      'registration_mode', 'internal', 'capacity', 100,
      'waitlist_enabled', (select title from public.events where id = v_event) like '%, liste)'));
    perform public.publish_event(v_event);
    -- 99 seats taken, one after the other.
    for v_user in select id from auth.users where email like 'concurrence-%@student.example.test'
                   order by email limit 99 loop
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
      perform public.register_for_event(v_event);
    end loop;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_julie, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  end loop;
end $$;
SQL

EV_LIST=$(sql "select id from public.events where title = 'Concurrence (test, liste)'")
EV_NONE=$(sql "select id from public.events where title = 'Concurrence (test, sans liste)'")
mapfile -t RACER_IDS < <(sql "select id from auth.users where email like 'concurrence-%@student.example.test' order by email offset 99 limit $RACERS")

# ---- The race ------------------------------------------------------------------------
race() {
  local event="$1" label="$2"
  local start
  start=$(sql "select to_char(clock_timestamp() + interval '3 seconds', 'YYYY-MM-DD HH24:MI:SS.US')")
  local i=0
  for user in "${RACER_IDS[@]}"; do
    i=$((i + 1))
    (
      "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/$label-$i.out" 2>&1
select pg_sleep_until('$start');
select set_config('request.jwt.claims', '{"sub": "$user", "role": "authenticated", "aal": "aal1"}', false);
select public.register_for_event('$event') ->> 'status';
SQL
    ) &
  done
  wait
}

check() {
  local event="$1" want_confirmed="$2" want_waiting="$3" what="$4"
  local counts rows
  counts=$(sql "select confirmed_count || '/' || waitlist_count from public.events where id = '$event'")
  rows=$(sql "select count(*) filter (where status = 'confirmed') || '/' || count(*) filter (where status = 'waitlisted')
                from public.event_registrations where event_id = '$event'")
  [ "$counts" = "$want_confirmed/$want_waiting" ] || fail "$what: counters $counts, expected $want_confirmed/$want_waiting"
  [ "$rows" = "$want_confirmed/$want_waiting" ] || fail "$what: rows $rows, expected $want_confirmed/$want_waiting"
  echo "ok - $what ($counts)"
}

race "$EV_LIST" liste
confirmed=$(cat "$TMP"/liste-*.out | grep -cx 'confirmed' || true)
waiting=$(cat "$TMP"/liste-*.out | grep -cx 'waitlisted' || true)
[ "$confirmed" = 1 ] || fail "with a waiting list: $confirmed students were told 'confirmed' (expected exactly 1)"
[ "$waiting" = 19 ] || fail "with a waiting list: $waiting students waitlisted (expected 19)"
echo "ok - twenty students, one last seat: 1 confirmed, 19 waiting"
check "$EV_LIST" 100 19 "the capacity holds with a waiting list"

race "$EV_NONE" sans
confirmed=$(cat "$TMP"/sans-*.out | grep -cx 'confirmed' || true)
full=$(cat "$TMP"/sans-*.out | grep -c 'event_full' || true)
[ "$confirmed" = 1 ] || fail "without a waiting list: $confirmed confirmed (expected exactly 1)"
[ "$full" = 19 ] || fail "without a waiting list: $full refused as full (expected 19)"
echo "ok - twenty students, one last seat, no waiting list: 1 confirmed, 19 refused"
check "$EV_NONE" 100 0 "the capacity holds without a waiting list"

# ---- Two simultaneous cancellations -----------------------------------------------------------
mapfile -t LEAVERS < <(sql "select user_id from public.event_registrations
                             where event_id = '$EV_LIST' and status = 'confirmed' order by created_at limit 2")
mapfile -t FIRST_WAITING < <(sql "select user_id from public.event_registrations
                                   where event_id = '$EV_LIST' and status = 'waitlisted' order by queue_position limit 2")
start=$(sql "select to_char(clock_timestamp() + interval '2 seconds', 'YYYY-MM-DD HH24:MI:SS.US')")
for user in "${LEAVERS[@]}"; do
  (
    "${PSQL[@]}" <<SQL > /dev/null
select pg_sleep_until('$start');
select set_config('request.jwt.claims', '{"sub": "$user", "role": "authenticated", "aal": "aal1"}', false);
select public.cancel_my_registration('$EV_LIST');
SQL
  ) &
done
wait
check "$EV_LIST" 100 17 "two simultaneous cancellations: still 100 confirmed"
promoted=$(sql "select string_agg(user_id::text, ',' order by user_id) from public.event_registrations
                 where event_id = '$EV_LIST' and promoted_at is not null")
expected=$(printf '%s\n' "${FIRST_WAITING[@]}" | sort | paste -sd, -)
[ "$promoted" = "$expected" ] || fail "promoted [$promoted], expected the two first waiting students [$expected]"
echo "ok - exactly the two first waiting students were promoted, once each"
messages=$(sql "select count(*) from public.notification_outbox where event_id = '$EV_LIST' and kind = 'event_promoted'")
[ "$messages" = 2 ] || fail "$messages promotion messages (expected 2)"
echo "ok - one promotion message each"

cleanup
echo "All concurrency checks passed."
