#!/usr/bin/env bash
# Concurrency test of recruitment review (Phase 9, brief §49, §68-69, §106),
# with real parallel sessions — something one pgTAP transaction cannot do. On
# the seeded Finance campaign ("Recrutement 2027 (exemple)", Julie presides;
# Trésorerie has one place):
#
#   1. Eight invited candidates press "Je prends ce créneau" on the same slot
#      at the same instant. Expected: one booking, seven "slot_taken".
#   2. Julie and Lucas (appointed manager) propose two different outcomes for
#      the same application at once. Expected: one pending decision.
#   3. Two offers for the only Trésorerie place are approved at the same
#      instant by two approvers. Expected: one finalized, one capacity_reached.
#   4. The same decision is released from two sessions at once. Expected: one
#      release, one offer, one message.
#   5. The candidate accepts the offer in five tabs at once. Expected: one
#      answer, the other tabs told it is already given; one history step.
#
# Fictional data only (*.example.test). Applications, appointments and slots
# made here are deleted at the end; the fictional accounts stay when the
# append-only audit names them (it refuses to forget its actors).
# Usage: supabase/tests/concurrency/review.sh "<database url>"
set -euo pipefail

DB="${1:?usage: review.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

JULIE=a0000000-0000-4000-8000-000000000004
LUCAS=a0000000-0000-4000-8000-000000000005

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from public.applications where candidate_id in (select id from auth.users where email like 'revue-%@student.example.test');
delete from public.recruitment_interview_slots where instructions = 'Concurrence (test)';
delete from public.recruitment_committee_members where purpose = 'Concurrence (test)'
   or (user_id = 'a0000000-0000-4000-8000-000000000005' and role = 'manager' and appointed_by = 'a0000000-0000-4000-8000-000000000004');
update public.recruitment_campaigns c set required_reviews = 1, approval_policy = 'single'
  from public.organizations o where o.id = c.organization_id and o.slug = 'exemple-finance' and c.title = 'Recrutement 2027 (exemple)';
SQL
}

cleanup

"${PSQL[@]}" <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'revue-' || lpad(n::text, 2, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 8) as n
 where not exists (select 1 from auth.users u where u.email = 'revue-' || lpad(n::text, 2, '0') || '@student.example.test');
update public.profiles p set first_name = 'Revue', last_name = 'Test', onboarding_completed_at = now()
  from auth.users u where u.id = p.id and u.email like 'revue-%@student.example.test';
SQL

CAMPAIGN=$(sql "select c.id from public.recruitment_campaigns c join public.organizations o on o.id = c.organization_id
                 where o.slug = 'exemple-finance' and c.title = 'Recrutement 2027 (exemple)'")
[ -n "$CAMPAIGN" ] || fail "the seeded Finance campaign is missing"
TRESO=$(sql "select id from public.recruitment_positions where campaign_id = '$CAMPAIGN' and title like 'Tr_sorerie (exemple)'")
COM=$(sql "select id from public.recruitment_positions where campaign_id = '$CAMPAIGN' and title = 'Communication (exemple)'")
mapfile -t CANDIDATES < <(sql "select id from auth.users where email like 'revue-%@student.example.test' order by email")
[ "${#CANDIDATES[@]}" = 8 ] || fail "expected eight fictional candidates"

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
as() { echo "select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\", \"aal\": \"${2:-aal1}\"}', false);"; }

# Each candidate applies (with the CV the form asks for).
apply() {
  "${PSQL[@]}" <<SQL > /dev/null
$(as "$1")
do \$\$
declare v uuid; d jsonb;
begin
  v := (public.start_application('$2') ->> 'application_id')::uuid;
  perform public.save_application_answers(v, 1, '{"motivation": "Candidature de test de concurrence.", "hours": 3, "budget": true}'::jsonb);
  d := public.reserve_application_document(v, 'cv', 'CV.pdf', 'application/pdf', 1000);
  insert into storage.objects (bucket_id, name) values ('recruitment-documents', d ->> 'object_path');
  perform public.confirm_application_document((d ->> 'document_id')::uuid);
  perform public.submit_application(v, (select version from public.applications where id = v), true);
end \$\$;
SQL
}
for c in "${CANDIDATES[@]}"; do apply "$c" "$COM"; done
apply "${CANDIDATES[0]}" "$TRESO"
apply "${CANDIDATES[1]}" "$TRESO"
app() { sql "select id from public.applications where candidate_id = '$1' and position_id = '$2'"; }

# Julie: decisions by one approver, no review required here; Lucas becomes a manager.
"${PSQL[@]}" <<SQL > /dev/null
$(as "$JULIE" aal2)
select public.set_recruitment_review_policy('$CAMPAIGN', 0, 'single');
select public.appoint_recruitment_member('$CAMPAIGN',
  (select id from public.memberships where user_id = '$LUCAS' and organization_id = (select organization_id from public.recruitment_campaigns where id = '$CAMPAIGN')),
  'manager', array['view', 'review', 'propose', 'approve', 'release'], 'campaign', null, now() + interval '1 month');
SQL

# ---- 1. Eight candidates, one slot ------------------------------------------------------------
SLOT=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -n 1
$(as "$JULIE" aal2)
select public.create_interview_slots('$CAMPAIGN', null, array[date_trunc('hour', now()) + interval '5 days 10 hours'], 30, 'in_person',
                                     'Salle fictive', null, 'Concurrence (test)', null) -> 'created' ->> 0;
SQL
)
[ -n "$SLOT" ] || fail "no slot created"
ids=$(for c in "${CANDIDATES[@]}"; do printf "'%s'," "$(app "$c" "$COM")"; done)
"${PSQL[@]}" > /dev/null <<SQL
$(as "$JULIE" aal2)
select public.invite_to_interview(array[${ids%,}]::uuid[]);
SQL
start=$(at 2)
i=0
for c in "${CANDIDATES[@]}"; do
  i=$((i + 1))
  interview=$(sql "select i.id from public.recruitment_interviews i join public.applications a on a.id = i.application_id
                    where a.candidate_id = '$c' and a.position_id = '$COM' and i.status = 'invited'")
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/book-$i.out" 2>&1
select pg_sleep_until('$start');
$(as "$c")
select 'booked:' || (public.book_interview_slot('$interview', '$SLOT') ->> 'status');
SQL
  ) &
done
wait
booked=$(cat "$TMP"/book-*.out | tr -d '\r' | grep -cx 'booked:scheduled' || true)
taken=$(cat "$TMP"/book-*.out | grep -c 'slot_taken' || true)
[ "$booked/$taken" = "1/7" ] || fail "eight candidates on one slot: $booked booked, $taken refused (expected 1/7): $(cat "$TMP"/book-*.out | tr '\n' ' ')"
held=$(sql "select count(*) from public.recruitment_interviews where slot_id = '$SLOT' and status = 'scheduled'")
[ "$held" = 1 ] || fail "$held interviews hold the slot (expected 1)"
echo "ok - eight candidates take one slot at once: one booking, seven told it is taken"

# ---- 2. Two contradictory proposals ----------------------------------------------------------------
A3=$(app "${CANDIDATES[2]}" "$COM")
start=$(at 2)
for who in "$JULIE:offer" "$LUCAS:reject"; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/propose-${who%%:*}.out" 2>&1
select pg_sleep_until('$start');
$(as "${who%%:*}" aal2)
select 'proposed:' || public.propose_recruitment_decision('$A3', '${who##*:}');
SQL
  ) &
done
wait
proposed=$(cat "$TMP"/propose-*.out | tr -d '\r' | grep -c '^proposed:' || true)
pending=$(cat "$TMP"/propose-*.out | grep -c 'decision_pending' || true)
[ "$proposed/$pending" = "1/1" ] || fail "two contradictory proposals: $proposed made, $pending refused (expected 1/1): $(cat "$TMP"/propose-*.out | tr '\n' ' ')"
live=$(sql "select count(*) from public.recruitment_decisions where application_id = '$A3' and status in ('proposed', 'finalized')")
[ "$live" = 1 ] || fail "$live pending decisions for one application (expected 1)"
echo "ok - two managers propose opposite outcomes at once: one pending decision"

# ---- 3. Two offers for one place ------------------------------------------------------------------
T1=$(app "${CANDIDATES[0]}" "$TRESO")
T2=$(app "${CANDIDATES[1]}" "$TRESO")
D1=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -n 1
$(as "$JULIE" aal2)
select public.propose_recruitment_decision('$T1', 'offer');
SQL
)
D2=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -n 1
$(as "$JULIE" aal2)
select public.propose_recruitment_decision('$T2', 'offer');
SQL
)
start=$(at 2)
for pair in "$JULIE:$D1" "$LUCAS:$D2"; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/approve-${pair%%:*}.out" 2>&1
select pg_sleep_until('$start');
$(as "${pair%%:*}" aal2)
select 'approved:' || (public.approve_recruitment_decision('${pair##*:}') ->> 'status');
SQL
  ) &
done
wait
final=$(cat "$TMP"/approve-*.out | tr -d '\r' | grep -cx 'approved:finalized' || true)
full=$(cat "$TMP"/approve-*.out | grep -c 'capacity_reached' || true)
[ "$final/$full" = "1/1" ] || fail "two offers for one place: $final finalized, $full refused (expected 1/1): $(cat "$TMP"/approve-*.out | tr '\n' ' ')"
offers=$(sql "select count(*) from public.recruitment_decisions where position_id = '$TRESO' and outcome = 'offer' and status = 'finalized'")
[ "$offers" = 1 ] || fail "$offers finalized offers for a one-place position (expected 1)"
echo "ok - two approvers fill the one place at once: one offer, the other needs a written exception"

# ---- 4. One release from two sessions ---------------------------------------------------------------
WINNER=$(sql "select id from public.recruitment_decisions where position_id = '$TRESO' and outcome = 'offer' and status = 'finalized'")
WAPP=$(sql "select application_id from public.recruitment_decisions where id = '$WINNER'")
start=$(at 2)
for who in "$JULIE" "$LUCAS"; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/release-$who.out" 2>&1
select pg_sleep_until('$start');
$(as "$who" aal2)
select 'released:' || (public.release_recruitment_decisions(array['$WINNER']::uuid[], now() + interval '5 days') ->> 'released');
SQL
  ) &
done
wait
once=$(cat "$TMP"/release-*.out | tr -d '\r' | grep -cx 'released:1' || true)
none=$(cat "$TMP"/release-*.out | tr -d '\r' | grep -cx 'released:0' || true)
[ "$once/$none" = "1/1" ] || fail "one decision released twice at once: $once/$none (expected 1/1): $(cat "$TMP"/release-*.out | tr '\n' ' ')"
offer_rows=$(sql "select count(*) from public.recruitment_offers where decision_id = '$WINNER'")
messages=$(sql "select count(*) from public.notifications where application_id = '$WAPP' and kind = 'recruitment_offer'")
[ "$offer_rows/$messages" = "1/1" ] || fail "after a double release: $offer_rows offers, $messages messages (expected 1/1)"
echo "ok - two managers release the same decision at once: one offer, one message"

# ---- 5. Five tabs accept the offer ---------------------------------------------------------------------
OFFER=$(sql "select id from public.recruitment_offers where decision_id = '$WINNER'")
CANDIDATE=$(sql "select candidate_id from public.recruitment_offers where id = '$OFFER'")
start=$(at 2)
for i in 1 2 3 4 5; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/accept-$i.out" 2>&1
select pg_sleep_until('$start');
$(as "$CANDIDATE")
select public.respond_to_recruitment_offer('$OFFER', true) ->> 'already';
SQL
  ) &
done
wait
fresh=$(cat "$TMP"/accept-*.out | tr -d '\r' | grep -cx 'false' || true)
already=$(cat "$TMP"/accept-*.out | tr -d '\r' | grep -cx 'true' || true)
[ "$fresh/$already" = "1/4" ] || fail "five tabs accept: $fresh answers, $already already (expected 1/4): $(cat "$TMP"/accept-*.out | tr '\n' ' ')"
steps=$(sql "select count(*) from public.application_events where application_id = '$WAPP' and action = 'offer_accepted'")
[ "$steps" = 1 ] || fail "$steps 'offer_accepted' steps (expected 1)"
echo "ok - five tabs accept the offer at once: one answer, one history step"

cleanup
echo "ok - concurrency of recruitment review"
