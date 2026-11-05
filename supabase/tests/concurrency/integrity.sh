#!/usr/bin/env bash
# Phase 15 — the remaining invariants of brief §110, with real parallel sessions:
#
#   1. Capacity cut during registrations: an event with 10 seats, 8 taken; the
#      organiser lowers it to 8 while ten students register in the same instant.
#      Expected: whichever lands first, confirmed never exceeds the capacity,
#      and the counters match the rows.
#   2. Two autosaves of one draft (two tabs) with the same version: exactly one
#      is kept, the other is told draft_conflict; nothing is silently overwritten.
#   3. Two successions proposed for one association at once (the president names two
#      successors in two tabs): exactly one opens,
#      the other is refused (transition_conflict); never two open transitions.
#
# Fictional data only (*.example.test), created here and deleted at the end.
# Usage: supabase/tests/concurrency/integrity.sh "<database url>"
set -euo pipefail
export PGCLIENTENCODING="${PGCLIENTENCODING:-UTF8}"

DB="${1:?usage: integrity.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap '[ -n "${KEEP_TMP:-}" ] || rm -rf "$TMP"' EXIT
JULIE='a0000000-0000-4000-8000-000000000004'

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }
cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from public.events where title like 'Integrite (test%';
delete from auth.users where email like 'integrite-%@student.example.test';
SQL
}
start_at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
as() { echo "select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\", \"aal\": \"$2\"}', false);"; }

cleanup

# ---- Setup -------------------------------------------------------------------------------
"${PSQL[@]}" <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'integrite-' || lpad(n::text, 3, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 19) as n;
update public.profiles p set first_name = 'Integrite', last_name = 'Test', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'integrite-%@student.example.test';

do $$
declare
  v_finance uuid := (select id from public.organizations where slug = 'exemple-finance');
  v_event uuid;
  v_user uuid;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000004', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_event := public.create_event(v_finance, 'Integrite (test, jauge)');
  perform public.save_event(v_event, 1, jsonb_build_object(
    'summary', 'Evenement de test d''integrite (fictif).', 'location_type', 'campus', 'venue_name', 'Salle de test',
    'starts_at', now() + interval '3 days', 'ends_at', now() + interval '3 days 2 hours',
    'registration_mode', 'internal', 'capacity', 10, 'waitlist_enabled', true));
  perform public.publish_event(v_event);
  for v_user in select id from auth.users where email like 'integrite-%@student.example.test' order by email limit 8 loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform public.register_for_event(v_event);
  end loop;
end $$;
SQL

EV=$(sql "select id from public.events where title = 'Integrite (test, jauge)'")
mapfile -t RACERS < <(sql "select id from auth.users where email like 'integrite-%@student.example.test' order by email offset 8 limit 10")
[ "$(sql "select confirmed_count || '/' || capacity from public.events where id = '$EV'")" = "8/10" ] || fail "setup: 8 of 10 seats"

# ---- 1. Capacity cut during registrations --------------------------------------------------
T=$(start_at 3)
VERSION=$(sql "select version from public.events where id = '$EV'")
(
  "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/cut.out" 2>&1
select pg_sleep_until('$T');
$(as "$JULIE" aal2)
select 'cut:' || coalesce((public.save_event('$EV', $VERSION, '{"capacity": 8}'::jsonb))::text, 'ok');
SQL
) &
i=0
for user in "${RACERS[@]}"; do
  i=$((i + 1))
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/reg-$i.out" 2>&1
select pg_sleep_until('$T');
$(as "$user" aal1)
select public.register_for_event('$EV') ->> 'status';
SQL
  ) &
done
wait
STATE=$(sql "select confirmed_count || '/' || coalesce(capacity::text, 'none') || '/' || waitlist_count from public.events where id = '$EV'")
ROWS=$(sql "select count(*) filter (where status = 'confirmed') || '/' || count(*) filter (where status = 'waitlisted')
              from public.event_registrations where event_id = '$EV'")
CONFIRMED=${STATE%%/*}; REST=${STATE#*/}; CAPACITY=${REST%%/*}; WAITING=${REST#*/}
[ "$CONFIRMED" -le "$CAPACITY" ] || fail "capacity cut: $CONFIRMED confirmed for $CAPACITY seats"
[ "$ROWS" = "$CONFIRMED/$WAITING" ] || fail "capacity cut: rows $ROWS, counters $CONFIRMED/$WAITING"
if grep -q '^cut:' "$TMP/cut.out"; then WON="the cut (capacity $CAPACITY)"; else WON="the registrations (cut refused: $(grep -o 'capacity[a-z_]*\|[a-z_]*conflict' "$TMP/cut.out" | head -1))"; fi
echo "ok - capacity cut racing ten registrations: $CONFIRMED confirmed of $CAPACITY, $WAITING waiting, counters = rows; first: $WON"

# ---- 2. Two autosaves of one draft ----------------------------------------------------------------
STUDENT=$(sql "select id from auth.users where email = 'integrite-019@student.example.test'")
APP=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -1
$(as "$STUDENT" aal1)
select (public.start_application((select ps.id from public.recruitment_positions ps join public.recruitment_campaigns c on c.id = ps.campaign_id
                                    join public.organizations o on o.id = c.organization_id
                                   where o.slug = 'exemple-finance' and c.title = 'Recrutement 2027 (exemple)'
                                     and ps.title = 'Communication (exemple)')) ->> 'application_id');
SQL
)
[ -n "$APP" ] || fail "autosave: no draft"
V=$(sql "select version from public.applications where id = '$APP'")
T=$(start_at 2)
for tab in A B; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/save-$tab.out" 2>&1
select pg_sleep_until('$T');
$(as "$STUDENT" aal1)
select 'saved:' || (public.save_application_answers('$APP', $V, '{"motivation": "Onglet $tab (test)."}'::jsonb))::text;
SQL
  ) &
done
wait
SAVED=$(cat "$TMP"/save-*.out | grep -c '^saved:' || true)
CONFLICT=$(cat "$TMP"/save-*.out | grep -c 'draft_conflict' || true)
[ "$SAVED" = 1 ] && [ "$CONFLICT" = 1 ] || fail "autosave: $SAVED saved, $CONFLICT conflicts (expected 1 and 1)"
KEPT=$(sql "select answers ->> 'motivation' from public.applications where id = '$APP'")
WINNER=$(grep -l '^saved:' "$TMP"/save-*.out | sed 's/.*save-\(.\)\.out/\1/')
[ "$KEPT" = "Onglet $WINNER (test)." ] || fail "autosave: kept '$KEPT', but tab $WINNER was the one told it saved"
echo "ok - two tabs save one draft at once: tab $WINNER kept, the other told draft_conflict"

# ---- 3. Two successions proposed at once ----------------------------------------------------------
T=$(start_at 2)
for who in lucas.finance hugo.finance; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/propose-$who.out" 2>&1
select pg_sleep_until('$T');
$(as "$JULIE" aal2)
select 'opened:' || public.propose_association_succession((select id from public.organizations where slug = 'exemple-finance'),
         '$who@comptes.example.test', now() + interval '6 months', null);
SQL
  ) &
done
wait
OPENED=$(cat "$TMP"/propose-*.out | grep -c '^opened:' || true)
REFUSED=$(cat "$TMP"/propose-*.out | grep -c 'transition_conflict' || true)
OPEN_NOW=$(sql "select count(*) from public.leadership_transitions t join public.organizations o on o.id = t.organization_id
                 where o.slug = 'exemple-finance' and t.status = 'open'")
[ "$OPENED" = 1 ] && [ "$REFUSED" = 1 ] && [ "$OPEN_NOW" = 1 ] || fail "successions: $OPENED opened, $REFUSED refused, $OPEN_NOW open (expected 1, 1, 1)"
echo "ok - two successions proposed at once: one opened, the other refused, one open transition"
TID=$(cat "$TMP"/propose-*.out | grep '^opened:' | sed 's/^opened://')
"${PSQL[@]}" >/dev/null <<SQL
$(as "$JULIE" aal2)
select public.cancel_leadership_transition('$TID', 'Fin du test de concurrence (fictif).');
SQL

cleanup
echo "integrity: all invariants held"
