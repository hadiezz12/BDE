#!/usr/bin/env bash
# Concurrency test of the notification engine (Phase 10, brief §47, §93, §97),
# with real parallel sessions — something one pgTAP transaction cannot do.
#
#   1. Four workers claim e-mails at the same instant. Expected: every due
#      delivery claimed by exactly one of them.
#   2. Five sessions notify the same person for the same source at once.
#      Expected: one notification, one delivery.
#   3. Julie submits the same Finance message from two tabs at once.
#      Expected: one submission (one audit line), one frozen audience.
#
# The worker's steps run as the database owner, as the Edge Function does.
# Fictional data only; what is made here is removed at the end, and e-mails
# go back to "off".
# Usage: supabase/tests/concurrency/notifications.sh "<database url>"
set -euo pipefail

DB="${1:?usage: notifications.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; cleanup; exit 1; }

JULIE=a0000000-0000-4000-8000-000000000004
HUGO=a0000000-0000-4000-8000-000000000008

cleanup() {
  "${PSQL[@]}" <<'SQL' >/dev/null 2>&1 || true
delete from public.notifications where dedupe_key like 'concurrency:%';
delete from public.notification_broadcasts where title = 'Concurrence (test)';
update public.notification_deliveries set status = 'queued', lease_until = null, attempts = 0, next_attempt_at = now()
 where status = 'processing';
update public.notification_config set delivery_mode = 'off' where id;
SQL
}

cleanup

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
as() { echo "select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\", \"aal\": \"${2:-aal1}\"}', false);"; }

# ---- 1. Four workers, one queue ----------------------------------------------------------------------
"${PSQL[@]}" > /dev/null <<SQL
update public.notification_config set delivery_mode = 'capture' where id;
select private.notify('$HUGO', 'event_cancelled', 'concurrency:claim:' || g, jsonb_build_object('title', 'Concurrence ' || g))
  from generate_series(1, 40) g;
SQL
due=$(sql "select count(*) from public.notification_deliveries where status in ('queued', 'failed_retryable') and next_attempt_at <= now()")
[ "$due" -ge 40 ] || fail "expected at least 40 due e-mails, found $due"
start=$(at 2)
for w in 1 2 3 4; do
  (
    "${PSQL[@]}" <<SQL > "$TMP/claim-$w.out" 2>&1
select pg_sleep_until('$start');
select c ->> 'id' from jsonb_array_elements(private.claim_notification_deliveries(100)) c;
SQL
  ) &
done
wait
total=$(cat "$TMP"/claim-*.out | tr -d '\r' | grep -cE '^[0-9]+$' || true)
distinct=$(cat "$TMP"/claim-*.out | tr -d '\r' | grep -E '^[0-9]+$' | sort -u | wc -l | tr -d ' ')
[ "$total" = "$distinct" ] || fail "four workers claimed $total deliveries but only $distinct distinct ones"
[ "$total" -ge 40 ] || fail "only $total deliveries claimed (expected at least 40): $(cat "$TMP"/claim-*.out | tr '\n' ' ' | head -c 400)"
echo "ok - four workers at once: $total e-mails claimed, each by exactly one worker"

# ---- 2. The same source, five times at once ------------------------------------------------------------
start=$(at 2)
for s in 1 2 3 4 5; do
  (
    "${PSQL[@]}" <<SQL > "$TMP/notify-$s.out" 2>&1
select pg_sleep_until('$start');
select coalesce(private.notify('$HUGO', 'event_changed', 'concurrency:same-source', '{"title": "Concurrence"}')::text, 'none');
SQL
  ) &
done
wait
notes=$(sql "select count(*) from public.notifications where dedupe_key = 'concurrency:same-source'")
mails=$(sql "select count(*) from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
              where n.dedupe_key = 'concurrency:same-source'")
[ "$notes/$mails" = "1/1" ] || fail "five sessions for one source: $notes notifications, $mails deliveries (expected 1/1)"
echo "ok - five sessions notify the same source at once: one notification, one e-mail"

# ---- 3. One message submitted from two tabs --------------------------------------------------------------
BROADCAST=$("${PSQL[@]}" <<SQL | tr -d '\r' | tail -n 1
$(as "$JULIE" aal2)
select public.create_notification_broadcast((select id from public.organizations where slug = 'exemple-finance'), 'members',
                                            'Concurrence (test)', 'Message fictif envoyé deux fois.') ->> 'id';
SQL
)
[ -n "$BROADCAST" ] || fail "no draft created"
start=$(at 2)
for t in 1 2; do
  (
    "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL > "$TMP/submit-$t.out" 2>&1
select pg_sleep_until('$start');
$(as "$JULIE" aal2)
select 'submitted:' || coalesce(public.submit_notification_broadcast('$BROADCAST') ->> 'already', 'first');
SQL
  ) &
done
wait
first=$(cat "$TMP"/submit-*.out | tr -d '\r' | grep -cx 'submitted:first' || true)
again=$(cat "$TMP"/submit-*.out | tr -d '\r' | grep -cx 'submitted:true' || true)
[ "$first/$again" = "1/1" ] || fail "two tabs submitting: $first first, $again repeated (expected 1/1): $(cat "$TMP"/submit-*.out | tr '\n' ' ')"
audit=$(sql "select count(*) from public.governance_audit_events where action = 'notification_broadcast_submitted' and resource_id = '$BROADCAST'")
frozen=$(sql "select (select count(*) from public.notification_broadcast_recipients where broadcast_id = '$BROADCAST')
                     = (select recipient_count from public.notification_broadcasts where id = '$BROADCAST')")
[ "$audit/$frozen" = "1/t" ] || fail "one submission expected: $audit audit lines, audience frozen once: $frozen"
echo "ok - two tabs submit the same message at once: one submission, one frozen audience"

cleanup
echo "notification concurrency: all scenarios passed"
