-- Phase 11 · Retention: how long personal records are kept is decided by
-- the BDE (as the data controller's representative on the site), never by
-- the code. An unconfigured policy deletes nothing and is reported as such.
-- Each change shows first what it would delete (dry run) and must be
-- confirmed when it would delete something; the daily job deletes in
-- batches and records what it did. Short-lived technical logs keep the
-- fixed housekeeping documented in docs/operations/retention.md.
--
-- This replaces the fixed periods Phase 10 had put on notifications,
-- deliveries, preference changes and cleared suppressions: from now on they
-- are kept until the BDE configures their policy.

create table public.retention_policies (
  policy_key text primary key
    constraint retention_policies_policy_key_check
    check (policy_key in ('notifications_read', 'notifications_archived', 'notifications_any', 'notification_deliveries',
                          'notification_preference_changes', 'notification_suppressions_cleared', 'event_registrations_past',
                          'governance_issues_resolved')),
  keep_months smallint
    constraint retention_policies_keep_months_check check (keep_months between 1 and 120),
  note text
    constraint retention_policies_note_check check (char_length(note) <= 500),
  updated_by uuid
    constraint retention_policies_updated_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz,
  sort_order smallint not null
);
comment on table public.retention_policies is
  'How long personal records are kept (null = kept, nothing deleted). Set only through set_retention_policy.';
create index retention_policies_updated_by_idx on public.retention_policies (updated_by);
alter table public.retention_policies enable row level security;
revoke all on public.retention_policies from anon, authenticated;

insert into public.retention_policies (policy_key, sort_order) values
  ('notifications_read', 10),
  ('notifications_archived', 20),
  ('notifications_any', 30),
  ('notification_deliveries', 40),
  ('notification_preference_changes', 50),
  ('notification_suppressions_cleared', 60),
  ('event_registrations_past', 70),
  ('governance_issues_resolved', 80);

-- How many rows a policy would delete with p_months (and the oldest date),
-- without deleting anything.
create or replace function private.retention_eligible(p_key text, p_months integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz;
  v_count bigint;
  v_oldest timestamptz;
begin
  if p_months is null then
    return null;
  end if;
  v_cut := now() - make_interval(months => p_months);
  case p_key
    when 'notifications_read' then
      select count(*), min(read_at) into v_count, v_oldest from public.notifications where read_at is not null and read_at < v_cut;
    when 'notifications_archived' then
      select count(*), min(archived_at) into v_count, v_oldest from public.notifications where archived_at is not null and archived_at < v_cut;
    when 'notifications_any' then
      select count(*), min(created_at) into v_count, v_oldest from public.notifications where created_at < v_cut;
    when 'notification_deliveries' then
      select count(*), min(finished_at) into v_count, v_oldest from public.notification_deliveries where finished_at is not null and finished_at < v_cut;
    when 'notification_preference_changes' then
      select count(*), min(created_at) into v_count, v_oldest from public.notification_preference_changes where created_at < v_cut;
    when 'notification_suppressions_cleared' then
      select count(*), min(cleared_at) into v_count, v_oldest from public.notification_suppressions where cleared_at is not null and cleared_at < v_cut;
    when 'event_registrations_past' then
      select count(*), min(coalesce(e.ends_at, e.starts_at)) into v_count, v_oldest
        from public.event_registrations r join public.events e on e.id = r.event_id
       where coalesce(e.ends_at, e.starts_at) < v_cut;
    when 'governance_issues_resolved' then
      select count(*), min(resolved_at) into v_count, v_oldest from public.governance_issues where status = 'resolved' and resolved_at < v_cut;
    else
      raise exception 'policy_unknown' using errcode = 'P0001';
  end case;
  return jsonb_build_object('count', v_count, 'oldest', v_oldest);
end;
$$;

-- What the recruitment settings (Phase 8) would delete at the next run, for
-- the same overview (counts only: applications and their files).
create or replace function private.recruitment_retention_eligible()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.recruitment_settings%rowtype;
  v_out jsonb := '{}'::jsonb;
  v_ids uuid[];
begin
  select * into v_s from public.recruitment_settings where id;
  v_ids := array(select a.id from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id
                  where v_s.draft_retention_months is not null and a.status = 'draft'
                    and (c.status = 'cancelled' or c.closes_at <= now())
                    and greatest(coalesce(c.cancelled_at, c.closes_at), a.updated_at) < now() - make_interval(months => v_s.draft_retention_months));
  v_out := v_out || jsonb_build_object('draft', private.recruitment_retention_count(v_s.draft_retention_months, v_ids));
  v_ids := array(select a.id from public.applications a
                  where v_s.withdrawn_retention_months is not null and a.status = 'withdrawn'
                    and a.withdrawn_at < now() - make_interval(months => v_s.withdrawn_retention_months));
  v_out := v_out || jsonb_build_object('withdrawn', private.recruitment_retention_count(v_s.withdrawn_retention_months, v_ids));
  v_ids := array(select a.id from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id
                  where v_s.submitted_retention_months is not null and a.status = 'submitted'
                    and not exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
                    and (c.status in ('cancelled', 'closed') or c.closes_at <= now())
                    and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_s.submitted_retention_months));
  v_out := v_out || jsonb_build_object('submitted', private.recruitment_retention_count(v_s.submitted_retention_months, v_ids));
  v_ids := array(select a.id from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id
                  where v_s.selected_retention_months is not null and a.status = 'submitted'
                    and exists (select 1 from public.recruitment_offers o where o.application_id = a.id and o.status = 'accepted')
                    and coalesce(c.cancelled_at, c.closed_at, c.closes_at) < now() - make_interval(months => v_s.selected_retention_months));
  v_out := v_out || jsonb_build_object('selected', private.recruitment_retention_count(v_s.selected_retention_months, v_ids));
  return v_out;
end;
$$;

create or replace function private.recruitment_retention_count(p_months integer, p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'months', p_months,
    'applications', case when p_months is null then null else cardinality(p_ids) end,
    'documents', case when p_months is null then null
                      else (select count(*) from public.application_documents d where d.application_id = any (p_ids) and d.status <> 'removed') end,
    'campaigns', case when p_months is null then null
                      else (select count(distinct a.campaign_id) from public.applications a where a.id = any (p_ids)) end);
$$;

-- The fixed housekeeping of technical logs (documented; not personal records).
create or replace function private.retention_housekeeping()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object('key', 'notification_delivery_attempts', 'keep_days', 30),
    jsonb_build_object('key', 'notification_provider_events', 'keep_days', 30),
    jsonb_build_object('key', 'notification_email_captures', 'keep_days', 7),
    jsonb_build_object('key', 'notification_worker_runs', 'keep_days', 14),
    jsonb_build_object('key', 'notification_unsubscribe_tokens', 'keep_days', 7),
    jsonb_build_object('key', 'notification_broadcast_recipients', 'keep_days', 30),
    jsonb_build_object('key', 'scheduled_job_runs', 'keep_days', 30),
    jsonb_build_object('key', 'cron_run_details', 'keep_days', 7));
$$;

-- ---- Reads and changes (BDE: platform.organizations.manage) ------------------------------------------------

create or replace function public.retention_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not (private.user_has_platform_permission(v_actor, 'platform.organizations.manage', now())
          or private.user_has_platform_permission(v_actor, 'platform.privacy.requests', now())) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'policies', (select jsonb_agg(jsonb_build_object(
                          'key', p.policy_key, 'keep_months', p.keep_months, 'note', p.note, 'updated_at', p.updated_at,
                          'updated_by_name', case when p.updated_by is null then null else private.person_name(p.updated_by) end,
                          'eligible', private.retention_eligible(p.policy_key, p.keep_months))
                        order by p.sort_order)
                   from public.retention_policies p),
    'recruitment', private.recruitment_retention_eligible(),
    'housekeeping', private.retention_housekeeping(),
    'last_run', (select jsonb_build_object('at', j.last_succeeded_at, 'status', j.last_status, 'result', j.last_result)
                   from public.scheduled_jobs j where j.job_key = 'data-retention'),
    'can_edit', private.user_has_platform_permission(v_actor, 'platform.organizations.manage', now()));
end;
$$;

-- Dry run of a change: what p_months would delete now. Deletes nothing.
create or replace function public.preview_retention_policy(p_key text, p_months integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  if not exists (select 1 from public.retention_policies where policy_key = p_key) then
    raise exception 'policy_unknown' using errcode = 'P0001';
  end if;
  if p_months is not null and p_months not between 1 and 120 then
    raise exception 'retention_invalid' using errcode = 'P0001';
  end if;
  return coalesce(private.retention_eligible(p_key, p_months), jsonb_build_object('count', 0, 'oldest', null));
end;
$$;

-- Sets (or clears, with null) a policy. When the new value would delete
-- records at the next run, p_confirm_count must repeat the previewed count:
-- nothing is ever deleted by a click that did not see the number first.
create or replace function public.set_retention_policy(p_key text, p_months integer, p_note text default null, p_confirm_count bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_old public.retention_policies%rowtype;
  v_eligible jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  perform private.require_aal2();
  select * into v_old from public.retention_policies where policy_key = p_key for update;
  if not found then
    raise exception 'policy_unknown' using errcode = 'P0001';
  end if;
  if p_months is not null and p_months not between 1 and 120 then
    raise exception 'retention_invalid' using errcode = 'P0001';
  end if;
  v_eligible := private.retention_eligible(p_key, p_months);
  if coalesce((v_eligible ->> 'count')::bigint, 0) > 0 and p_confirm_count is distinct from (v_eligible ->> 'count')::bigint then
    raise exception 'retention_confirmation_required' using errcode = 'P0001';
  end if;
  update public.retention_policies
     set keep_months = p_months, note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), updated_by = v_actor, updated_at = now()
   where policy_key = p_key;
  perform private.log_governance_event(
    v_actor, 'bde', 'retention_policy_changed', 'continuity', null, null, 'retention_policy', null,
    jsonb_build_object('policy', p_key, 'from_months', v_old.keep_months, 'to_months', p_months,
                       'eligible', coalesce((v_eligible ->> 'count')::bigint, 0)));
  return coalesce(v_eligible, jsonb_build_object('count', 0, 'oldest', null));
end;
$$;

-- ---- The daily job (data-retention) -----------------------------------------------------------------------

-- Configured policies first, at most 5 000 rows per policy and per night (a
-- large backlog spreads over several nights instead of one mass deletion),
-- then the technical housekeeping. Records what it deleted (counts only).
create or replace function private.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.retention_policies%rowtype;
  v_cut timestamptz;
  v_n integer;
  v_done jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_cron integer := 0;
  c_batch constant integer := 5000;
begin
  for v_p in select * from public.retention_policies where keep_months is not null order by sort_order loop
    v_cut := now() - make_interval(months => v_p.keep_months);
    case v_p.policy_key
      when 'notifications_read' then
        delete from public.notifications where id in (
          select id from public.notifications where read_at is not null and read_at < v_cut limit c_batch);
      when 'notifications_archived' then
        delete from public.notifications where id in (
          select id from public.notifications where archived_at is not null and archived_at < v_cut limit c_batch);
      when 'notifications_any' then
        delete from public.notifications where id in (select id from public.notifications where created_at < v_cut limit c_batch);
      when 'notification_deliveries' then
        delete from public.notification_deliveries where id in (
          select id from public.notification_deliveries where finished_at is not null and finished_at < v_cut limit c_batch);
      when 'notification_preference_changes' then
        delete from public.notification_preference_changes where id in (
          select id from public.notification_preference_changes where created_at < v_cut limit c_batch);
      when 'notification_suppressions_cleared' then
        delete from public.notification_suppressions where id in (
          select id from public.notification_suppressions where cleared_at is not null and cleared_at < v_cut limit c_batch);
      when 'event_registrations_past' then
        delete from public.event_registrations where id in (
          select r.id from public.event_registrations r join public.events e on e.id = r.event_id
           where coalesce(e.ends_at, e.starts_at) < v_cut limit c_batch);
      when 'governance_issues_resolved' then
        delete from public.governance_issues where id in (
          select id from public.governance_issues where status = 'resolved' and resolved_at < v_cut limit c_batch);
      else
        null;
    end case;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_done := v_done || jsonb_build_object(v_p.policy_key, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  -- Technical housekeeping (private.retention_housekeeping).
  delete from public.notification_delivery_attempts where started_at < now() - interval '30 days';
  delete from public.notification_provider_events where received_at < now() - interval '30 days';
  delete from public.notification_email_captures where captured_at < now() - interval '7 days';
  delete from public.notification_worker_runs where started_at < now() - interval '14 days';
  delete from public.notification_unsubscribe_tokens
   where (used_at is not null and used_at < now() - interval '7 days') or expires_at < now() - interval '7 days';
  delete from public.notification_broadcast_recipients br
   using public.notification_broadcasts b
   where b.id = br.broadcast_id and b.status in ('dispatched', 'cancelled')
     and coalesce(b.dispatched_at, b.cancelled_at) < now() - interval '30 days';
  delete from public.scheduled_job_runs where started_at < now() - interval '30 days';
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
    get diagnostics v_cron = row_count;
  end if;

  if v_total > 0 then
    perform private.log_governance_event(
      null, 'scheduler', 'retention_cleanup_executed', 'continuity', null, null, 'retention_policy', null, v_done);
  end if;
  return jsonb_build_object('deleted', v_done, 'total', v_total, 'cron_details', v_cron);
end;
$$;

-- The Phase 10 job is replaced by data-retention.
drop function if exists private.purge_notifications();

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.retention_eligible(text, integer) from public, anon, authenticated, service_role;
revoke all on function private.recruitment_retention_eligible() from public, anon, authenticated, service_role;
revoke all on function private.recruitment_retention_count(integer, uuid[]) from public, anon, authenticated, service_role;
revoke all on function private.retention_housekeeping() from public, anon, authenticated, service_role;
revoke all on function private.run_retention() from public, anon, authenticated, service_role;
revoke all on function public.retention_overview() from public, anon;
revoke all on function public.preview_retention_policy(text, integer) from public, anon;
revoke all on function public.set_retention_policy(text, integer, text, bigint) from public, anon;
grant execute on function public.retention_overview() to authenticated;
grant execute on function public.preview_retention_policy(text, integer) to authenticated;
grant execute on function public.set_retention_policy(text, integer, text, bigint) to authenticated;
