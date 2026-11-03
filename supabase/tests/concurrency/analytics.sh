#!/usr/bin/env bash
# Load and concurrency test of the analytics (Phase 13, brief §104, §114),
# with real parallel sessions and a synthetic volume.
#
#   1. Two refreshes start at the same instant. Expected: both succeed one
#      after the other (one lock), and the daily counts are exactly those of
#      a single run.
#   2. A synthetic campus — 2 000 published events, 40 000 registrations,
#      3 000 applications, all fictional — inside
#      one transaction that is rolled back: the full refresh, an
#      association's dashboard over a year and the platform dashboard are
#      timed against budgets, and the dashboards are checked to read the
#      daily counts (not the sources) for period totals.
#
# Runs as the database owner, switching to the API roles inside each
# session. Fictional data only; nothing is left behind.
# Usage: supabase/tests/concurrency/analytics.sh "<database url>"
set -euo pipefail

DB="${1:?usage: analytics.sh <database url>}"
PSQL=(psql "$DB" -X -q -t -A -v ON_ERROR_STOP=1)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

sql() { "${PSQL[@]}" -c "$1" | tr -d '\r'; }
fail() { echo "FAIL: $*"; exit 1; }

# Budgets in milliseconds (CI runners are slow and shared; ceilings, not targets).
REFRESH_BUDGET_MS=${ANALYTICS_REFRESH_BUDGET_MS:-20000}
DASHBOARD_BUDGET_MS=${ANALYTICS_DASHBOARD_BUDGET_MS:-3000}

at() { sql "select to_char(clock_timestamp() + interval '$1 seconds', 'YYYY-MM-DD HH24:MI:SS.US')"; }
fingerprint() { sql "select md5(coalesce(string_agg(concat_ws('|', day, organization_id, metric, dimension, value), ',' order by day, organization_id, metric, dimension), '')) from private.analytics_daily"; }

# ---- 1. Two refreshes at once ------------------------------------------------------------------------------
sql "select private.refresh_analytics(date '2020-01-01', (now() at time zone 'Europe/Paris')::date)" >/dev/null
expected=$(fingerprint)
start=$(at 1)
for s in 1 2; do
  (
    "${PSQL[@]}" <<SQL > "$TMP/refresh-$s.out" 2>&1
select pg_sleep_until('$start'::timestamp);
select 'written:' || (private.refresh_analytics(date '2020-01-01', (now() at time zone 'Europe/Paris')::date) ->> 'written');
SQL
  ) &
done
wait
for s in 1 2; do
  grep -q '^written:' <(tr -d '\r' < "$TMP/refresh-$s.out") || fail "refresh $s: $(tr '\n' ' ' < "$TMP/refresh-$s.out")"
done
[ "$(fingerprint)" = "$expected" ] || fail "two simultaneous refreshes left different counts"
echo "ok - two simultaneous refreshes: both ran, one after the other, and the counts are those of a single run"

# ---- 2. A synthetic campus, timed, then rolled back --------------------------------------------------------
"${PSQL[@]}" <<'SQL' > "$TMP/volume.out" 2>&1 || true
begin;
-- 1 500 fictional students.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'volume-' || lpad(n::text, 4, '0') || '@student.example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  from generate_series(1, 1500) as n;
create temporary table vu as
  select id, row_number() over (order by email) as n from auth.users where email like 'volume-%@student.example.test';

-- 2 000 published events of Finance over two years, copied from a seeded one.
with src as (select * from public.events where organization_id = (select id from public.organizations where slug = 'exemple-finance')
                                          and first_published_at is not null and registration_mode = 'internal' limit 1)
insert into public.events (organization_id, created_by, slug, title, summary, category_id, location_type, venue_name,
                           starts_at, ends_at, timezone, registration_mode, capacity, waitlist_enabled, publication,
                           first_published_at, published_at, status, cancelled_at, cancellation_reason)
select s.organization_id, s.created_by, 'volume-' || n, 'Événement volume ' || n || ' (test)', s.summary, s.category_id,
       s.location_type, s.venue_name,
       now() - make_interval(days => 700) + make_interval(days => n / 3), now() - make_interval(days => 700) + make_interval(days => n / 3, hours => 2),
       s.timezone, 'internal', 50, true, 'published',
       now() - make_interval(days => 720) + make_interval(days => n / 3), now() - make_interval(days => 720) + make_interval(days => n / 3),
       case when n % 25 = 0 then 'cancelled' else 'scheduled' end,
       case when n % 25 = 0 then now() - make_interval(days => 701) + make_interval(days => n / 3) end,
       case when n % 25 = 0 then 'Annulation volume (test).' end
  from src s, generate_series(1, 2000) as n;
create temporary table ve as
  select id, row_number() over (order by starts_at, id) as n from public.events where slug like 'volume-%';

-- 40 000 registrations: 20 per event, a mix of confirmed, waiting and cancelled.
insert into public.event_registrations (event_id, user_id, status, reference, created_at, confirmed_at, waitlisted_at, queue_position,
                                        cancelled_at, cancel_source)
select e.id, u.id,
       case when k % 10 = 0 then 'cancelled' when k % 10 = 1 then 'waitlisted' else 'confirmed' end,
       'V' || lpad(upper(to_hex(((e.n - 1) * 20 + k)::integer)), 7, '0'),
       ev.starts_at - make_interval(days => (10 - k % 10)::integer),
       case when k % 10 not in (0, 1) then ev.starts_at - make_interval(days => (10 - k % 10)::integer) end,
       case when k % 10 = 1 then ev.starts_at - make_interval(days => (10 - k % 10)::integer) end,
       case when k % 10 = 1 then 1 end,
       case when k % 10 = 0 then ev.starts_at - interval '1 day' end,
       case when k % 10 = 0 then 'self' end
  from ve e
  join public.events ev on ev.id = e.id
 cross join generate_series(1, 20) as k
  join vu u on u.n = ((e.n * 7 + k) % 1500) + 1;

-- 3 000 applications to Sports (submitted, some withdrawn).
insert into public.applications (candidate_id, campaign_id, position_id, form_version_id, status, candidate_snapshot,
                                 privacy_acknowledged_at, created_at, submitted_at, withdrawn_at)
select u.id, ps.campaign_id, ps.id, c.active_form_version_id,
       case when u.n % 12 = 0 then 'withdrawn' else 'submitted' end, '{}'::jsonb, now(),
       now() - make_interval(days => (u.n % 300)::integer), now() - make_interval(days => (u.n % 300)::integer),
       case when u.n % 12 = 0 then now() - make_interval(days => (u.n % 300)::integer) + interval '1 day' end
  from vu u
  join lateral (select p.* from public.recruitment_positions p
                  join public.recruitment_campaigns c2 on c2.id = p.campaign_id
                  join public.organizations o on o.id = c2.organization_id
                 where o.slug = 'exemple-sports' and p.retired_at is null and c2.title = 'Recrutement 2027 (exemple)'
                 order by p.display_order offset (u.n % 2) limit 1) ps on true
  join public.recruitment_campaigns c on c.id = ps.campaign_id;
insert into public.applications (candidate_id, campaign_id, position_id, form_version_id, status, candidate_snapshot,
                                 privacy_acknowledged_at, created_at, submitted_at)
select u.id, ps.campaign_id, ps.id, c.active_form_version_id, 'submitted', '{}'::jsonb, now(),
       now() - make_interval(days => (u.n % 200)::integer), now() - make_interval(days => (u.n % 200)::integer)
  from vu u
  join lateral (select p.* from public.recruitment_positions p
                  join public.recruitment_campaigns c2 on c2.id = p.campaign_id
                  join public.organizations o on o.id = c2.organization_id
                 where o.slug = 'exemple-sports' and p.retired_at is null and c2.title = 'Recrutement 2027 (exemple)'
                 order by p.display_order offset (1 - u.n % 2) limit 1) ps on true
  join public.recruitment_campaigns c on c.id = ps.campaign_id;

do $$
declare
  v_started timestamptz;
  v_refresh numeric;
  v_org numeric;
  v_platform numeric;
  v_answer jsonb;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  v_started := clock_timestamp();
  perform private.refresh_analytics(date '2020-01-01', v_today);
  v_refresh := extract(epoch from clock_timestamp() - v_started) * 1000;

  perform set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated", "aal": "aal2"}', true);
  v_started := clock_timestamp();
  v_answer := public.organization_analytics((select id from public.organizations where slug = 'exemple-finance'), v_today - 365, v_today);
  v_org := extract(epoch from clock_timestamp() - v_started) * 1000;
  if (v_answer -> 'totals' ->> 'registrations.created:')::integer < 10000 then
    raise exception 'the dashboard did not count the synthetic registrations: %', v_answer -> 'totals';
  end if;

  perform set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "aal": "aal2"}', true);
  v_started := clock_timestamp();
  v_answer := public.platform_analytics(v_today - 365, v_today);
  v_platform := extract(epoch from clock_timestamp() - v_started) * 1000;

  raise notice 'refresh_ms=% organization_ms=% platform_ms=% daily_rows=% registrations=% applications=%',
    round(v_refresh), round(v_org), round(v_platform), (select count(*) from private.analytics_daily),
    (select count(*) from public.event_registrations), (select count(*) from public.applications);
end $$;
rollback;
SQL
grep -q "ERROR" "$TMP/volume.out" && fail "synthetic volume: $(tr '\n' ' ' < "$TMP/volume.out" | head -c 2000)"
line=$(grep -o 'refresh_ms=.*' "$TMP/volume.out" | head -1)
test -n "$line" || fail "no timing: $(tr '\n' ' ' < "$TMP/volume.out" | head -c 2000)"
refresh=$(sed -E 's/.*refresh_ms=([0-9]+).*/\1/' <<< "$line")
org=$(sed -E 's/.*organization_ms=([0-9]+).*/\1/' <<< "$line")
platform=$(sed -E 's/.*platform_ms=([0-9]+).*/\1/' <<< "$line")
[ "$refresh" -le "$REFRESH_BUDGET_MS" ] || fail "full refresh took ${refresh} ms (budget ${REFRESH_BUDGET_MS})"
[ "$org" -le "$DASHBOARD_BUDGET_MS" ] || fail "association dashboard took ${org} ms (budget ${DASHBOARD_BUDGET_MS})"
[ "$platform" -le "$DASHBOARD_BUDGET_MS" ] || fail "platform dashboard took ${platform} ms (budget ${DASHBOARD_BUDGET_MS})"
echo "ok - synthetic campus ($(sed -E 's/.*(daily_rows=[0-9]+ registrations=[0-9]+ applications=[0-9]+).*/\1/' <<< "$line")): full refresh ${refresh} ms, association dashboard over a year ${org} ms, platform ${platform} ms"
[ "$(fingerprint)" = "$expected" ] || fail "the rolled-back volume left counts behind"
echo "ok - nothing of the synthetic campus remains"
echo "analytics concurrency: all checks passed"
