-- Phase 10 · Fix: notification_health raised "malformed array literal" as soon
-- as an alert applied (`text[] || 'literal'` reads the literal as an array).
-- Found by plpgsql_check in CI; the alerts are appended with array_append.

create or replace function public.notification_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_config public.notification_config%rowtype;
  v_due integer;
  v_oldest timestamptz;
  v_last public.notification_worker_runs%rowtype;
  v_accepted integer;
  v_failed integer;
  v_alerts text[] := '{}';
begin
  perform private.require_platform_permission(v_actor, 'platform.communications.monitor');
  select * into v_config from public.notification_config where id;
  select count(*), min(next_attempt_at) into v_due, v_oldest
    from public.notification_deliveries
   where (status in ('queued', 'failed_retryable') and next_attempt_at <= now()) or (status = 'processing' and lease_until <= now());
  select * into v_last from public.notification_worker_runs order by started_at desc limit 1;
  select count(*) filter (where status in ('provider_accepted', 'delivered')),
         count(*) filter (where status = 'failed_permanent')
    into v_accepted, v_failed
    from public.notification_deliveries where updated_at > now() - interval '24 hours';

  if v_config.delivery_mode = 'off' and v_due > 0 then
    v_alerts := array_append(v_alerts, 'mode_off_with_queue');
  end if;
  if v_config.delivery_mode <> 'off' and v_due > 0 and coalesce(v_last.started_at, '-infinity') < now() - interval '10 minutes' then
    v_alerts := array_append(v_alerts, 'worker_silent');
  end if;
  if v_due > 50 and v_oldest < now() - interval '15 minutes' then
    v_alerts := array_append(v_alerts, 'backlog');
  end if;
  if v_failed >= 10 and v_failed > (v_accepted + v_failed) / 5 then
    v_alerts := array_append(v_alerts, 'high_failure');
  end if;
  if (select count(*) from public.notification_deliveries
       where last_error = 'rate_limited' and updated_at > now() - interval '1 hour') >= 5 then
    v_alerts := array_append(v_alerts, 'rate_limited');
  end if;
  if v_config.delivery_mode = 'live' and (v_config.email_from is null or v_config.site_url is null) then
    v_alerts := array_append(v_alerts, 'config_incomplete');
  end if;
  if v_last.error is not null and v_last.started_at > now() - interval '1 hour' then
    v_alerts := array_append(v_alerts, 'worker_error');
  end if;

  return jsonb_build_object(
    'mode', v_config.delivery_mode,
    'configured', jsonb_build_object('email_from', v_config.email_from is not null, 'site_url', v_config.site_url is not null,
                                     'worker', private.notification_secret('notifications_worker_url') is not null,
                                     'webhook', private.notification_secret('notifications_webhook_token') is not null),
    'queue', jsonb_build_object(
      'due', v_due, 'oldest_due_at', v_oldest,
      'waiting', (select count(*) from public.notification_deliveries where status in ('queued', 'failed_retryable') and next_attempt_at > now()),
      'retrying', (select count(*) from public.notification_deliveries where status = 'failed_retryable'),
      'processing', (select count(*) from public.notification_deliveries where status = 'processing')),
    'last_24h', (select jsonb_build_object(
                   'accepted', count(*) filter (where status = 'provider_accepted'),
                   'delivered', count(*) filter (where status = 'delivered'),
                   'failed', count(*) filter (where status = 'failed_permanent'),
                   'suppressed', count(*) filter (where status = 'suppressed'),
                   'cancelled', count(*) filter (where status = 'cancelled'))
                   from public.notification_deliveries where updated_at > now() - interval '24 hours'),
    'last_run', case when v_last.id is null then null else jsonb_build_object(
                  'started_at', v_last.started_at, 'finished_at', v_last.finished_at, 'mode', v_last.mode,
                  'claimed', v_last.claimed, 'accepted', v_last.accepted, 'failed', v_last.failed, 'skipped', v_last.skipped,
                  'error', v_last.error) end,
    'runs_last_hour', (select count(*) from public.notification_worker_runs where started_at > now() - interval '1 hour'),
    'suppressions', (select count(*) from public.notification_suppressions where cleared_at is null),
    'alerts', to_jsonb(v_alerts));
end;
$$;
