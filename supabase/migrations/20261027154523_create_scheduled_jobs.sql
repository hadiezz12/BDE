-- Phase 11 · Scheduled jobs: one catalog, one dispatcher, one history.
-- Every recurring task of Phases 6–11 runs through private.run_scheduled_job:
-- a lock per job (two runs never overlap: the second one is recorded as
-- skipped), the task's own transaction (a failure rolls its work back and
-- is recorded with a short error code, never a message carrying data), and
-- a summary on the catalog row that the dashboards read. Nothing here grants
-- a right: permissions keep coming from mandates checked at the moment of
-- each action, so a stopped scheduler delays work but never extends access.
-- Also here: the institutional register (who owns the providers), the
-- declared backup and restore checks, and operational incidents.

-- ---- Permission ----------------------------------------------------------------------------------------------

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order)
values
  ('platform.operations.monitor', 'platform', 'platform', 'Suivre la continuité du site',
   'Voir l''état des tâches automatiques, des sauvegardes déclarées, des comptes techniques et des incidents ; relancer une tâche sans risque.',
   false, false, false, true, 111);
insert into public.position_template_permissions (template_key, permission_key)
select t.key, 'platform.operations.monitor' from public.position_templates t where t.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, 'platform.operations.monitor' from public.positions p where p.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;

-- ---- Catalog ---------------------------------------------------------------------------------------------------

create table public.scheduled_jobs (
  job_key text primary key
    constraint scheduled_jobs_job_key_check check (job_key ~ '^[a-z]+(-[a-z]+)*$'),
  area text not null
    constraint scheduled_jobs_area_check
    check (area in ('publishing', 'notifications', 'events', 'recruitment', 'governance', 'retention', 'storage', 'reports')),
  schedule text not null,
  -- How often a success is expected; late after twice that plus ten minutes.
  expected_every interval not null,
  critical boolean not null default false,
  -- May be run again from the dashboard (safe to repeat, never destructive).
  retryable boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_status text
    constraint scheduled_jobs_last_status_check check (last_status in ('succeeded', 'failed', 'skipped')),
  last_duration_ms integer,
  last_result jsonb,
  last_error text,
  consecutive_failures integer not null default 0
);
comment on table public.scheduled_jobs is
  'The recurring tasks and their last outcome (written only by private.run_scheduled_job).';

insert into public.scheduled_jobs (job_key, area, schedule, expected_every, critical, retryable, sort_order) values
  ('publish-scheduled-posts', 'publishing', '* * * * *', interval '1 minute', true, true, 10),
  ('notifications-dispatch', 'notifications', '* * * * *', interval '1 minute', true, true, 20),
  ('notification-reminders', 'events', '*/15 * * * *', interval '15 minutes', true, true, 30),
  ('recruitment-review-jobs', 'recruitment', '*/5 * * * *', interval '5 minutes', true, true, 40),
  ('enqueue-recruitment-reminders', 'recruitment', '7 * * * *', interval '1 hour', false, true, 50),
  ('governance-health', 'governance', '17 * * * *', interval '1 hour', true, true, 60),
  ('storage-cleanup', 'storage', '*/15 * * * *', interval '15 minutes', false, true, 70),
  ('purge-recruitment-data', 'retention', '23 3 * * *', interval '1 day', false, false, 80),
  ('data-retention', 'retention', '40 3 * * *', interval '1 day', false, false, 90),
  ('platform-health-report', 'reports', '0 7 * * 1', interval '7 days', false, false, 100);

create table public.scheduled_job_runs (
  id bigint generated always as identity primary key,
  job_key text not null
    constraint scheduled_job_runs_job_key_fkey references public.scheduled_jobs (job_key) on delete cascade,
  trigger text not null
    constraint scheduled_job_runs_trigger_check check (trigger in ('schedule', 'manual')),
  requested_by uuid
    constraint scheduled_job_runs_requested_by_fkey references auth.users (id) on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null
    constraint scheduled_job_runs_status_check check (status in ('succeeded', 'failed', 'skipped')),
  duration_ms integer not null default 0,
  result jsonb,
  error text
    constraint scheduled_job_runs_error_check check (char_length(error) <= 160),
  constraint scheduled_job_runs_manual_check check (trigger = 'manual' or requested_by is null)
);
create index scheduled_job_runs_job_idx on public.scheduled_job_runs (job_key, started_at desc);
create index scheduled_job_runs_started_idx on public.scheduled_job_runs (started_at);
create index scheduled_job_runs_requested_by_idx on public.scheduled_job_runs (requested_by);

alter table public.scheduled_jobs enable row level security;
alter table public.scheduled_job_runs enable row level security;
revoke all on public.scheduled_jobs, public.scheduled_job_runs from anon, authenticated;

-- ---- The dispatcher -------------------------------------------------------------------------------------------

-- A short, data-free error: the SQL state and the message cut before any
-- quoted value or detail (codes raised by our functions pass through whole).
create or replace function private.job_error(p_state text, p_message text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(coalesce(p_state, 'XX000') || ' ' ||
              btrim(split_part(split_part(split_part(coalesce(p_message, ''), ':', 1), '(', 1), '"', 1)), 120);
$$;

-- The fixed list of what each job runs. No dynamic SQL, no function name
-- read from a table: a job that is not listed here cannot run.
create or replace function private.execute_job(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  case p_key
    when 'publish-scheduled-posts' then return jsonb_build_object('published', private.run_scheduled_publications());
    when 'notifications-dispatch' then return private.run_notification_dispatch();
    when 'notification-reminders' then return private.enqueue_due_reminders();
    when 'recruitment-review-jobs' then return private.run_recruitment_review_jobs();
    when 'enqueue-recruitment-reminders' then return jsonb_build_object('queued', private.enqueue_recruitment_reminders());
    when 'governance-health' then return private.check_governance_health();
    when 'storage-cleanup' then return private.kick_storage_cleanup();
    when 'purge-recruitment-data' then return private.purge_recruitment_data();
    when 'data-retention' then return private.run_retention();
    when 'platform-health-report' then return private.send_platform_health_report();
    else raise exception 'job_unknown' using errcode = 'P0001';
  end case;
end;
$$;

-- Runs one job. Called by pg_cron (trigger 'schedule') and by
-- retry_scheduled_job (trigger 'manual', with the person who asked).
create or replace function private.run_scheduled_job(p_key text, p_trigger text default 'schedule', p_requested_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_result jsonb;
  v_status text;
  v_error text;
  v_state text;
  v_message text;
  v_ms integer;
begin
  if not exists (select 1 from public.scheduled_jobs where job_key = p_key) then
    raise exception 'job_unknown' using errcode = 'P0001';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('vpc-job:' || p_key)) then
    -- Another run of the same job is still going: this one does nothing.
    insert into public.scheduled_job_runs (job_key, trigger, requested_by, started_at, finished_at, status)
    values (p_key, p_trigger, p_requested_by, v_started, clock_timestamp(), 'skipped');
    update public.scheduled_jobs set last_started_at = v_started, last_finished_at = clock_timestamp(), last_status = 'skipped'
     where job_key = p_key;
    return jsonb_build_object('status', 'skipped');
  end if;

  begin
    v_result := private.execute_job(p_key);
    v_status := 'succeeded';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    v_status := 'failed';
    v_error := private.job_error(v_state, v_message);
    v_result := null;
  end;
  v_ms := greatest(0, (extract(epoch from clock_timestamp() - v_started) * 1000)::integer);

  insert into public.scheduled_job_runs (job_key, trigger, requested_by, started_at, finished_at, status, duration_ms, result, error)
  values (p_key, p_trigger, p_requested_by, v_started, clock_timestamp(), v_status, v_ms, v_result, v_error);
  update public.scheduled_jobs
     set last_started_at = v_started,
         last_finished_at = clock_timestamp(),
         last_status = v_status,
         last_duration_ms = v_ms,
         last_result = coalesce(v_result, last_result),
         last_error = v_error,
         last_succeeded_at = case when v_status = 'succeeded' then clock_timestamp() else last_succeeded_at end,
         last_failed_at = case when v_status = 'failed' then clock_timestamp() else last_failed_at end,
         consecutive_failures = case when v_status = 'failed' then consecutive_failures + 1 else 0 end
   where job_key = p_key;
  return jsonb_build_object('status', v_status, 'duration_ms', v_ms, 'result', v_result, 'error', v_error);
end;
$$;

-- ---- What pg_cron itself says (read without depending on the extension) ----------------------------------------

-- jobname → {active, schedule, command_ok, last_status, last_start}; null when
-- pg_cron is not installed (local databases), so the health says "unverifiable".
create or replace function private.cron_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status jsonb;
begin
  if to_regclass('cron.job') is null then
    return null;
  end if;
  execute $sql$
    select coalesce(jsonb_object_agg(j.jobname, jsonb_build_object(
             'active', j.active,
             'schedule', j.schedule,
             'command_ok', j.command = format('select private.run_scheduled_job(%L)', j.jobname),
             'last_status', d.status,
             'last_start', d.start_time)), '{}'::jsonb)
      from cron.job j
      left join lateral (select r.status, r.start_time from cron.job_run_details r
                          where r.jobid = j.jobid and r.start_time > now() - interval '8 days'
                          order by r.start_time desc limit 1) d on true
  $sql$ into v_status;
  return v_status;
end;
$$;

-- One job's health. ok · late · failing · never_run · not_scheduled · unverifiable.
-- Late is measured from the last success, so a scheduler that stopped
-- altogether shows here at the next read (the dashboards compute this on
-- every visit; nothing has to run for the delay to be seen).
create or replace function private.job_health(p_job public.scheduled_jobs, p_cron jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_cron is null then 'unverifiable'
    when not (p_cron ? p_job.job_key) or not coalesce((p_cron -> p_job.job_key ->> 'active')::boolean, false)
         or not coalesce((p_cron -> p_job.job_key ->> 'command_ok')::boolean, false) then 'not_scheduled'
    when p_job.consecutive_failures >= 3 then 'failing'
    when p_job.last_succeeded_at is null and p_job.created_at < now() - (p_job.expected_every * 2 + interval '10 minutes') then 'never_run'
    when p_job.last_succeeded_at is null then 'ok'
    when p_job.last_succeeded_at < now() - (p_job.expected_every * 2 + interval '10 minutes') then
      case when p_job.last_status = 'failed' then 'failing' else 'late' end
    else 'ok' end;
$$;

create or replace function private.jobs_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := private.cron_status();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', j.job_key, 'area', j.area, 'schedule', j.schedule, 'critical', j.critical, 'retryable', j.retryable,
             'health', private.job_health(j, v_cron),
             'last_started_at', j.last_started_at, 'last_succeeded_at', j.last_succeeded_at, 'last_failed_at', j.last_failed_at,
             'last_status', j.last_status, 'last_duration_ms', j.last_duration_ms, 'last_result', j.last_result,
             'last_error', j.last_error, 'consecutive_failures', j.consecutive_failures,
             'cron_last_status', v_cron -> j.job_key ->> 'last_status',
             'runs_24h', (select jsonb_build_object(
                                   'succeeded', count(*) filter (where r.status = 'succeeded'),
                                   'failed', count(*) filter (where r.status = 'failed'),
                                   'skipped', count(*) filter (where r.status = 'skipped'))
                            from public.scheduled_job_runs r where r.job_key = j.job_key and r.started_at > now() - interval '24 hours'))
           order by j.sort_order)
      from public.scheduled_jobs j), '[]'::jsonb);
end;
$$;

-- ---- Running a job again (BDE: platform.operations.monitor) -------------------------------------------------

-- Only the jobs marked retryable (safe to repeat), at most once per job every
-- two minutes, with the second factor; audited with the person who asked.
create or replace function public.retry_scheduled_job(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_job public.scheduled_jobs%rowtype;
  v_outcome jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  perform private.require_aal2();
  select * into v_job from public.scheduled_jobs where job_key = p_key;
  if not found then
    raise exception 'job_unknown' using errcode = 'P0001';
  end if;
  if not v_job.retryable then
    raise exception 'job_not_retryable' using errcode = 'P0001';
  end if;
  -- Two clicks at once: the second waits here, then sees the first run.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vpc-retry:' || p_key));
  if exists (select 1 from public.scheduled_job_runs r
              where r.job_key = p_key and r.trigger = 'manual' and r.started_at > now() - interval '2 minutes') then
    raise exception 'job_retry_too_soon' using errcode = 'P0001';
  end if;
  v_outcome := private.run_scheduled_job(p_key, 'manual', v_actor);
  perform private.log_governance_event(
    v_actor, 'bde', 'scheduled_job_retried', 'continuity', null, null, 'scheduled_job', null,
    jsonb_build_object('job', p_key, 'status', v_outcome ->> 'status', 'error', v_outcome ->> 'error'));
  return jsonb_build_object('status', v_outcome ->> 'status', 'error', v_outcome ->> 'error', 'duration_ms', v_outcome -> 'duration_ms');
end;
$$;

-- ---- Storage cleanup (the storage-cleanup Edge Function) -----------------------------------------------------

-- A claimed file is leased for five minutes: two workers never take the
-- same one, and a worker that crashes gives it back.
alter table private.storage_cleanup_queue add column lease_until timestamptz;

create or replace function public.claim_storage_cleanup(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with batch as (
    select q.id from private.storage_cleanup_queue q
     where q.done_at is null and q.attempts < 10 and (q.lease_until is null or q.lease_until <= now())
     order by q.id limit least(greatest(coalesce(p_limit, 50), 1), 200)
     for update skip locked
  ), claimed as (
    update private.storage_cleanup_queue q set attempts = q.attempts + 1, lease_until = now() + interval '5 minutes'
      from batch where q.id = batch.id
    returning q.id, q.bucket_id, q.object_path
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'bucket', c.bucket_id, 'path', c.object_path) order by c.id), '[]'::jsonb)
    into v_rows from claimed c;
  return v_rows;
end;
$$;

create or replace function public.complete_storage_cleanup(p_id bigint, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.storage_cleanup_queue
     set done_at = case when p_ok then now() end,
         lease_until = null,
         last_error = case when p_ok then null else left(regexp_replace(lower(coalesce(p_error, 'unknown')), '[^a-z_]', '', 'g'), 60) end
   where id = p_id;
$$;

-- Wakes the storage-cleanup Edge Function when files wait (pg_net). Its
-- address and token are Vault secrets set by the operator
-- (storage_cleanup_url, storage_cleanup_token): without them nothing is
-- called, the files wait and the dashboard says why.
create or replace function private.kick_storage_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
  v_url text;
  v_token text;
begin
  select count(*) into v_pending from private.storage_cleanup_queue q
   where q.done_at is null and q.attempts < 10 and (q.lease_until is null or q.lease_until <= now());
  if v_pending = 0 then
    return jsonb_build_object('pending', 0, 'worker_called', false);
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return jsonb_build_object('pending', v_pending, 'worker_called', false, 'reason', 'pg_net_missing');
  end if;
  v_url := private.notification_secret('storage_cleanup_url');
  v_token := private.notification_secret('storage_cleanup_token');
  if v_url is null or v_token is null or v_url !~ '^https://' then
    return jsonb_build_object('pending', v_pending, 'worker_called', false, 'reason', 'not_configured');
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token);
  return jsonb_build_object('pending', v_pending, 'worker_called', true);
end;
$$;

-- ---- Institutional register (who owns what outside the site) ---------------------------------------------

-- The site's application roles do not control its providers (database,
-- code, hosting, domain, e-mail): this register says who does, who pays,
-- what renews when and whether someone verified it. Never a password, a key,
-- a token or a card number (refused by private.looks_secret).
create table public.institutional_records (
  record_key text primary key
    constraint institutional_records_record_key_check
    check (record_key in ('supabase_project', 'supabase_billing', 'source_repository', 'hosting', 'hosting_billing', 'domain',
                          'dns', 'https_certificates', 'email_provider', 'email_domain', 'uptime_monitor', 'storage_copies',
                          'technical_owner', 'privacy_contact', 'recovery_procedure')),
  area text not null
    constraint institutional_records_area_check
    check (area in ('infrastructure', 'code', 'domain', 'email', 'billing', 'contacts', 'recovery')),
  provider text
    constraint institutional_records_provider_check check (char_length(provider) between 1 and 120),
  owner text
    constraint institutional_records_owner_check check (char_length(owner) between 1 and 200),
  contact text
    constraint institutional_records_contact_check check (char_length(contact) between 1 and 200),
  renewal_on date,
  status text not null default 'not_configured'
    constraint institutional_records_status_check check (status in ('verified', 'needs_review', 'not_configured')),
  notes text
    constraint institutional_records_notes_check check (char_length(notes) <= 1000),
  verified_at timestamptz,
  verified_by uuid
    constraint institutional_records_verified_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz,
  updated_by uuid
    constraint institutional_records_updated_by_fkey references auth.users (id) on delete set null,
  sort_order smallint not null,
  constraint institutional_records_verified_check check (status <> 'verified' or verified_at is not null)
);
create index institutional_records_verified_by_idx on public.institutional_records (verified_by);
create index institutional_records_updated_by_idx on public.institutional_records (updated_by);

-- Only what the code itself depends on is named; everything else is left
-- for the people who actually hold the accounts to fill in.
insert into public.institutional_records (record_key, area, provider, sort_order) values
  ('supabase_project', 'infrastructure', 'Supabase', 10),
  ('hosting', 'infrastructure', null, 20),
  ('uptime_monitor', 'infrastructure', null, 30),
  ('source_repository', 'code', 'GitHub', 40),
  ('domain', 'domain', null, 50),
  ('dns', 'domain', null, 60),
  ('https_certificates', 'domain', null, 70),
  ('email_provider', 'email', 'Brevo', 80),
  ('email_domain', 'email', null, 90),
  ('supabase_billing', 'billing', 'Supabase', 100),
  ('hosting_billing', 'billing', null, 110),
  ('technical_owner', 'contacts', null, 120),
  ('privacy_contact', 'contacts', null, 130),
  ('recovery_procedure', 'recovery', null, 140),
  ('storage_copies', 'recovery', null, 150);

-- Restores and backups as people verified them (a declaration, dated and
-- signed; the site cannot see the provider's backups itself).
create table public.backup_verifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint backup_verifications_kind_check
    check (kind in ('database_backups_available', 'database_restore_test', 'storage_copy_available', 'storage_restore_test')),
  outcome text not null
    constraint backup_verifications_outcome_check check (outcome in ('verified', 'partial', 'failed')),
  environment text not null
    constraint backup_verifications_environment_check check (environment in ('production', 'staging', 'development')),
  checked_on date not null,
  method text
    constraint backup_verifications_method_check check (char_length(method) <= 500),
  notes text
    constraint backup_verifications_notes_check check (char_length(notes) <= 1000),
  recorded_by uuid
    constraint backup_verifications_recorded_by_fkey references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index backup_verifications_kind_idx on public.backup_verifications (kind, checked_on desc);
create index backup_verifications_recorded_by_idx on public.backup_verifications (recorded_by);

-- Serious operational problems and who handles them (deliberately small).
create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null
    constraint operational_incidents_title_check check (char_length(title) between 3 and 140),
  kind text not null
    constraint operational_incidents_kind_check
    check (kind in ('governance', 'infrastructure', 'notifications', 'jobs', 'security', 'data', 'other')),
  severity text not null
    constraint operational_incidents_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    constraint operational_incidents_status_check check (status in ('open', 'investigating', 'monitoring', 'resolved')),
  impact text
    constraint operational_incidents_impact_check check (char_length(impact) <= 500),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  opened_by uuid
    constraint operational_incidents_opened_by_fkey references auth.users (id) on delete set null,
  owner_user_id uuid
    constraint operational_incidents_owner_user_id_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_incidents_resolved_check check ((status = 'resolved') = (resolved_at is not null))
);
create index operational_incidents_status_idx on public.operational_incidents (status, detected_at desc);
create index operational_incidents_opened_by_idx on public.operational_incidents (opened_by);
create index operational_incidents_owner_user_id_idx on public.operational_incidents (owner_user_id);
create trigger operational_incidents_set_updated_at
  before update on public.operational_incidents
  for each row execute function private.set_updated_at();

create table public.operational_incident_updates (
  id bigint generated always as identity primary key,
  incident_id uuid not null
    constraint operational_incident_updates_incident_id_fkey references public.operational_incidents (id) on delete cascade,
  status text not null
    constraint operational_incident_updates_status_check check (status in ('open', 'investigating', 'monitoring', 'resolved')),
  note text not null
    constraint operational_incident_updates_note_check check (char_length(note) between 1 and 1000),
  author_id uuid
    constraint operational_incident_updates_author_id_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index operational_incident_updates_incident_idx on public.operational_incident_updates (incident_id, created_at);
create index operational_incident_updates_author_id_idx on public.operational_incident_updates (author_id);

alter table public.institutional_records enable row level security;
alter table public.backup_verifications enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.operational_incident_updates enable row level security;
revoke all on public.institutional_records, public.backup_verifications, public.operational_incidents,
              public.operational_incident_updates from anon, authenticated;

-- Free text that looks like a credential: refused everywhere in the register.
create or replace function private.looks_secret(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_text, '') ~* '(sb_secret_|sb_publishable_|service_role|sk_live_|sk_test_|xkeysib-|xsmtpsib-|ghp_|github_pat_|-----BEGIN|eyJ[A-Za-z0-9_-]{10,}\.|postgres(ql)?://[^[:space:]]*:[^[:space:]]*@|mot de passe *[:=]|password *[:=]|[A-Za-z0-9_]{32,})';
$$;

create or replace function private.clean_register_text(p_text text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_text, '')), '');
begin
  -- Line breaks only in the longer texts (notes); no other control character.
  if v is not null and (char_length(v) > p_max or v ~ '[\x01-\x09\x0b\x0c\x0e-\x1f\x7f]' or (p_max <= 200 and v ~ '[\r\n]')) then
    raise exception 'register_text_invalid' using errcode = 'P0001';
  end if;
  if private.looks_secret(v) then
    raise exception 'secret_not_allowed' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function public.save_institutional_record(
  p_key text, p_provider text, p_owner text, p_contact text, p_renewal_on date, p_status text, p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.institutional_records%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  perform private.require_aal2();
  select * into v_old from public.institutional_records where record_key = p_key for update;
  if not found then
    raise exception 'record_unknown' using errcode = 'P0001';
  end if;
  if p_status not in ('verified', 'needs_review', 'not_configured') then
    raise exception 'register_text_invalid' using errcode = 'P0001';
  end if;
  update public.institutional_records
     set provider = private.clean_register_text(p_provider, 120),
         owner = private.clean_register_text(p_owner, 200),
         contact = private.clean_register_text(p_contact, 200),
         renewal_on = p_renewal_on,
         status = p_status,
         notes = private.clean_register_text(p_notes, 1000),
         verified_at = case when p_status = 'verified' then now() else null end,
         verified_by = case when p_status = 'verified' then v_actor else null end,
         updated_at = now(),
         updated_by = v_actor
   where record_key = p_key;
  perform private.log_governance_event(
    v_actor, 'bde', 'institutional_record_updated', 'continuity', null, null, 'institutional_record', null,
    jsonb_build_object('record', p_key, 'from', v_old.status, 'to', p_status, 'renewal_on', p_renewal_on));
end;
$$;

create or replace function public.record_backup_verification(
  p_kind text, p_outcome text, p_environment text, p_checked_on date, p_method text default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  perform private.require_aal2();
  if p_kind not in ('database_backups_available', 'database_restore_test', 'storage_copy_available', 'storage_restore_test')
     or p_outcome not in ('verified', 'partial', 'failed') or p_environment not in ('production', 'staging', 'development')
     or p_checked_on is null or p_checked_on > v_today or p_checked_on < v_today - 366 then
    raise exception 'backup_check_invalid' using errcode = 'P0001';
  end if;
  insert into public.backup_verifications (kind, outcome, environment, checked_on, method, notes, recorded_by)
  values (p_kind, p_outcome, p_environment, p_checked_on, private.clean_register_text(p_method, 500),
          private.clean_register_text(p_notes, 1000), v_actor)
  returning id into v_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'backup_verification_recorded', 'continuity', null, null, 'backup_verification', v_id,
    jsonb_build_object('kind', p_kind, 'outcome', p_outcome, 'environment', p_environment, 'checked_on', p_checked_on));
  return v_id;
end;
$$;

create or replace function public.open_operational_incident(
  p_title text, p_kind text, p_severity text, p_impact text default null, p_detected_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
  v_title text := private.clean_register_text(p_title, 140);
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  if v_title is null or char_length(v_title) < 3
     or p_kind not in ('governance', 'infrastructure', 'notifications', 'jobs', 'security', 'data', 'other')
     or p_severity not in ('low', 'medium', 'high', 'critical')
     or (p_detected_at is not null and (p_detected_at > now() + interval '5 minutes' or p_detected_at < now() - interval '30 days')) then
    raise exception 'incident_invalid' using errcode = 'P0001';
  end if;
  insert into public.operational_incidents (title, kind, severity, impact, detected_at, opened_by, owner_user_id)
  values (v_title, p_kind, p_severity, private.clean_register_text(p_impact, 500), coalesce(p_detected_at, now()), v_actor, v_actor)
  returning id into v_id;
  insert into public.operational_incident_updates (incident_id, status, note, author_id)
  values (v_id, 'open', 'Incident ouvert.', v_actor);
  perform private.log_governance_event(
    v_actor, 'bde', 'incident_opened', 'continuity', null, null, 'operational_incident', v_id,
    jsonb_build_object('kind', p_kind, 'severity', p_severity));
  return v_id;
end;
$$;

-- A new status with a note; resolving dates the end. The person who writes
-- becomes the one handling it unless p_keep_owner.
create or replace function public.update_operational_incident(
  p_id uuid, p_status text, p_note text, p_severity text default null, p_keep_owner boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_incident public.operational_incidents%rowtype;
  v_note text := private.clean_register_text(p_note, 1000);
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  select * into v_incident from public.operational_incidents where id = p_id for update;
  if not found then
    raise exception 'incident_not_found' using errcode = 'P0001';
  end if;
  if v_incident.status = 'resolved' and p_status = 'resolved' then
    raise exception 'incident_resolved' using errcode = 'P0001';
  end if;
  if p_status not in ('open', 'investigating', 'monitoring', 'resolved') or v_note is null
     or (p_severity is not null and p_severity not in ('low', 'medium', 'high', 'critical')) then
    raise exception 'incident_invalid' using errcode = 'P0001';
  end if;
  update public.operational_incidents
     set status = p_status,
         severity = coalesce(p_severity, severity),
         resolved_at = case when p_status = 'resolved' then now() else null end,
         owner_user_id = case when coalesce(p_keep_owner, true) and owner_user_id is not null then owner_user_id else v_actor end
   where id = p_id;
  insert into public.operational_incident_updates (incident_id, status, note, author_id) values (p_id, p_status, v_note, v_actor);
  perform private.log_governance_event(
    v_actor, 'bde', case when p_status = 'resolved' then 'incident_resolved' else 'incident_updated' end, 'continuity', null, null,
    'operational_incident', p_id, jsonb_build_object('from', v_incident.status, 'to', p_status, 'severity', coalesce(p_severity, v_incident.severity)));
end;
$$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.looks_secret(text) from public, anon, authenticated, service_role;
revoke all on function private.clean_register_text(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.save_institutional_record(text, text, text, text, date, text, text) from public, anon;
revoke all on function public.record_backup_verification(text, text, text, date, text, text) from public, anon;
revoke all on function public.open_operational_incident(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.update_operational_incident(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.save_institutional_record(text, text, text, text, date, text, text) to authenticated;
grant execute on function public.record_backup_verification(text, text, text, date, text, text) to authenticated;
grant execute on function public.open_operational_incident(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.update_operational_incident(uuid, text, text, text, boolean) to authenticated;
revoke all on function private.job_error(text, text) from public, anon, authenticated, service_role;
revoke all on function private.execute_job(text) from public, anon, authenticated, service_role;
revoke all on function private.run_scheduled_job(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.cron_status() from public, anon, authenticated, service_role;
revoke all on function private.job_health(public.scheduled_jobs, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.jobs_overview() from public, anon, authenticated, service_role;
revoke all on function private.kick_storage_cleanup() from public, anon, authenticated, service_role;
revoke all on function public.retry_scheduled_job(text) from public, anon;
grant execute on function public.retry_scheduled_job(text) to authenticated;
-- The worker reaches them through its database connection: no API role calls them any more.
revoke all on function public.claim_storage_cleanup(integer) from public, anon, authenticated, service_role;
revoke all on function public.complete_storage_cleanup(bigint, boolean, text) from public, anon, authenticated, service_role;
