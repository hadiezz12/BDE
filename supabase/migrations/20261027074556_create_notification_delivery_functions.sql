-- Phase 10 · The e-mail side of notifications: the worker's private functions
-- (claim, complete, capture, runs), provider events, reminders, retention,
-- the worker's wake-up call and the delivery health the BDE monitors.

-- ---- The worker (the notifications-worker Edge Function, connected as the database owner) -------------------

-- A secret kept in Vault by the operator (null when absent: then nothing runs).
create or replace function private.notification_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  select s.decrypted_secret into v_value from vault.decrypted_secrets s where s.name = p_name;
  return nullif(btrim(coalesce(v_value, '')), '');
end;
$$;

-- The worker and the webhook prove who calls them with a token compared here
-- (hashes compared, at least 32 characters, absent secret = always refused).
create or replace function private.notification_token_ok(p_name text, p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text := private.notification_secret(p_name);
begin
  return v_secret is not null and char_length(v_secret) >= 32 and p_token is not null
     and extensions.digest(p_token, 'sha256') = extensions.digest(v_secret, 'sha256');
end;
$$;

create or replace function private.notification_worker_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('mode', c.delivery_mode, 'email_from', c.email_from, 'reply_to', c.reply_to, 'site_url', c.site_url)
    from public.notification_config c where c.id;
$$;

-- Does the person still want this topic by e-mail (essential topics: yes)?
create or replace function private.notification_email_wanted(p_user uuid, p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.email from private.notification_choice(p_user, p_topic) c), false);
$$;

-- The end of the person's quiet hours if `p_at` falls inside them, else null.
create or replace function private.notification_quiet_until(p_user uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.notification_settings%rowtype;
  v_local timestamp;
  v_time time;
  v_end timestamp;
begin
  select * into v_s from public.notification_settings where user_id = p_user;
  if not found or not v_s.quiet_hours then
    return null;
  end if;
  v_local := p_at at time zone v_s.timezone;
  v_time := v_local::time;
  if v_s.quiet_start < v_s.quiet_end then
    if v_time >= v_s.quiet_start and v_time < v_s.quiet_end then
      v_end := v_local::date + v_s.quiet_end;
    end if;
  elsif v_time >= v_s.quiet_start then
    v_end := (v_local::date + 1) + v_s.quiet_end;
  elsif v_time < v_s.quiet_end then
    v_end := v_local::date + v_s.quiet_end;
  end if;
  return case when v_end is null then null else v_end at time zone v_s.timezone end;
end;
$$;

-- A reminder or a request whose subject changed since it was queued: an event
-- cancelled or moved, an interview moved, a draft sent, an offer answered, an
-- invitation answered. Such a message is not sent (and a stale reminder
-- leaves the notification centre).
create or replace function private.notification_obsolete(p_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n public.notifications%rowtype;
  v_at timestamptz;
begin
  select * into v_n from public.notifications where id = p_id;
  if not found then
    return true;
  end if;
  case v_n.kind
    when 'event_reminder' then
      v_at := (v_n.payload ->> 'starts_at')::timestamptz;
      return not exists (
        select 1 from public.events e
          join public.event_registrations r on r.event_id = e.id and r.user_id = v_n.recipient_id and r.status = 'confirmed'
         where e.id = v_n.event_id and e.status = 'scheduled' and e.publication = 'published' and e.hidden_at is null
           and e.starts_at = v_at and e.starts_at > now());
    when 'recruitment_interview_reminder', 'recruitment_team_interview_reminder' then
      v_at := (v_n.payload ->> 'starts_at')::timestamptz;
      return not exists (
        select 1 from public.recruitment_interviews i
          join public.recruitment_interview_slots s on s.id = i.slot_id
         where i.id = (v_n.payload ->> 'interview_id')::uuid and i.status = 'scheduled'
           and s.starts_at = v_at and s.starts_at > now());
    when 'application_deadline_reminder' then
      return not exists (select 1 from public.applications a where a.id = v_n.application_id and a.status = 'draft');
    when 'recruitment_offer_reminder' then
      return not exists (select 1 from public.recruitment_offers o where o.application_id = v_n.application_id and o.status = 'pending');
    when 'recruitment_clarification_reminder' then
      return not exists (select 1 from public.recruitment_clarifications q
                          where q.application_id = v_n.application_id and q.status = 'open' and (q.due_at is null or q.due_at > now()));
    when 'governance_mandate_expiring' then
      return not exists (select 1 from public.position_assignments a
                          where a.id = (v_n.payload ->> 'assignment_id')::uuid and a.status = 'active'
                            and a.ends_at = (v_n.payload ->> 'ends_at')::timestamptz and a.ends_at > now());
    when 'content_approval_pending' then
      return not exists (select 1 from public.post_revisions r where r.id = v_n.resource_id and r.status = 'submitted');
    when 'governance_invitation_received' then
      return not exists (select 1 from public.organization_invitations i where i.id = v_n.resource_id and i.status = 'pending');
    when 'governance_candidacy_received', 'governance_approval_required' then
      return not exists (select 1 from public.leadership_transitions t where t.id = v_n.resource_id and t.status = 'open');
    else
      return false;
  end case;
end;
$$;

-- Claims up to p_limit e-mails due now. Each one is checked again first:
-- no address → failed; suppressed address → suppressed; an optional topic the
-- person turned off since → cancelled; an obsolete reminder → cancelled; a
-- previous attempt the provider already acknowledged (its events carry our
-- key) → reconciled without sending again; quiet hours → later. The rest is
-- leased for 5 minutes (rows locked with skip locked: two workers never take
-- the same one; a crashed worker's lease expires and the row comes back).
-- Optional messages get a fresh unsubscribe token (only its hash is kept).
create or replace function private.claim_notification_deliveries(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_row record;
  v_out jsonb := '[]'::jsonb;
  v_email text;
  v_until timestamptz;
  v_token text;
  v_event text;
begin
  select delivery_mode into v_mode from public.notification_config where id;
  if coalesce(v_mode, 'off') = 'off' then
    return v_out;
  end if;

  for v_row in
    select d.id, d.status, d.attempts, d.essential, d.topic, d.idempotency_key, d.recipient_id,
           n.id as notification_id, n.kind, n.payload, n.event_id, n.application_id, n.resource_type, n.resource_id,
           n.organization_id, coalesce(n.importance, t.importance) as importance, t.confidential
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      join public.notification_types t on t.key = n.kind
     where d.channel = 'email'
       and ((d.status in ('queued', 'failed_retryable') and d.next_attempt_at <= now())
            or (d.status = 'processing' and d.lease_until <= now()))
     order by d.next_attempt_at, d.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update of d skip locked
  loop
    if v_row.status = 'processing' then
      update public.notification_delivery_attempts set finished_at = now(), outcome = 'outcome_unknown', error = 'lease_expired'
       where delivery_id = v_row.id and finished_at is null;
    end if;

    select u.email into v_email from auth.users u where u.id = v_row.recipient_id;
    if coalesce(btrim(v_email), '') = '' then
      update public.notification_deliveries set status = 'failed_permanent', last_error = 'no_address', lease_until = null,
                                                finished_at = now() where id = v_row.id;
      continue;
    end if;
    if exists (select 1 from public.notification_suppressions s
                where s.cleared_at is null and s.email_hash = private.email_hash(v_email)) then
      update public.notification_deliveries set status = 'suppressed', last_error = 'suppressed', lease_until = null,
                                                finished_at = now() where id = v_row.id;
      continue;
    end if;
    if not v_row.essential and not private.notification_email_wanted(v_row.recipient_id, v_row.topic) then
      update public.notification_deliveries set status = 'cancelled', last_error = 'preference_off', lease_until = null,
                                                finished_at = now() where id = v_row.id;
      continue;
    end if;
    if private.notification_obsolete(v_row.notification_id) then
      update public.notification_deliveries set status = 'cancelled', last_error = 'obsolete', lease_until = null,
                                                finished_at = now() where id = v_row.id;
      update public.notifications set archived_at = coalesce(archived_at, now()), read_at = coalesce(read_at, now())
       where id = v_row.notification_id and kind in ('event_reminder', 'recruitment_interview_reminder', 'recruitment_team_interview_reminder',
                                                     'application_deadline_reminder', 'recruitment_offer_reminder',
                                                     'recruitment_clarification_reminder', 'governance_mandate_expiring',
                                                     'content_approval_pending');
      continue;
    end if;

    -- An earlier attempt whose outcome was unknown, acknowledged since by the provider.
    select e.event into v_event from public.notification_provider_events e
     where e.delivery_key = v_row.idempotency_key and e.event in ('request', 'delivered', 'deferred', 'soft_bounce', 'spam')
     order by (e.event = 'delivered') desc limit 1;
    if v_event is not null then
      update public.notification_deliveries
         set status = case when v_event = 'delivered' then 'delivered' else 'provider_accepted' end,
             accepted_at = coalesce(accepted_at, now()),
             delivered_at = case when v_event = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
             finished_at = case when v_event = 'delivered' then now() else finished_at end,
             last_error = null, lease_until = null
       where id = v_row.id;
      insert into public.notification_delivery_attempts (delivery_id, attempt, finished_at, outcome)
      values (v_row.id, greatest(v_row.attempts, 1), now(), 'reconciled');
      continue;
    end if;

    if not v_row.essential then
      v_until := private.notification_quiet_until(v_row.recipient_id, now());
      if v_until is not null then
        update public.notification_deliveries
           set status = case when status = 'processing' then 'failed_retryable' else status end,
               next_attempt_at = v_until, lease_until = null
         where id = v_row.id;
        continue;
      end if;
    end if;

    update public.notification_deliveries
       set status = 'processing', attempts = attempts + 1, lease_until = now() + interval '5 minutes',
           next_attempt_at = now() + interval '5 minutes'
     where id = v_row.id;
    insert into public.notification_delivery_attempts (delivery_id, attempt, provider)
    values (v_row.id, v_row.attempts + 1, case when v_mode = 'capture' then 'capture' else 'brevo' end);

    v_token := null;
    if not v_row.essential then
      v_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.notification_unsubscribe_tokens (token_hash, user_id, topic, expires_at)
      values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_row.recipient_id, v_row.topic, now() + interval '90 days');
    end if;

    v_out := v_out || jsonb_build_object(
      'id', v_row.id, 'key', v_row.idempotency_key, 'kind', v_row.kind, 'topic', v_row.topic,
      'essential', v_row.essential, 'confidential', v_row.confidential, 'importance', v_row.importance,
      'payload', v_row.payload, 'event_id', v_row.event_id, 'application_id', v_row.application_id,
      'resource_type', v_row.resource_type, 'resource_id', v_row.resource_id,
      'organization', (select jsonb_build_object('slug', o.slug, 'name', o.name, 'short_name', o.short_name)
                         from public.organizations o where o.id = v_row.organization_id),
      'email', v_email, 'name', private.person_name(v_row.recipient_id),
      'attempt', v_row.attempts + 1, 'unsubscribe', v_token);
  end loop;
  return v_out;
end;
$$;

-- The worker's report on one leased e-mail. Accepted by the provider: done
-- (delivery confirmed later by its events, when it sends them). A temporary
-- failure or an unknown outcome (a timeout after sending): retried with
-- exponential backoff and jitter (2, 4, 8, 16, 32 minutes; an unknown outcome
-- waits at least 10 minutes for the provider's events), at most 6 attempts.
-- A permanent refusal: done; an invalid address is suppressed.
create or replace function private.complete_notification_delivery(
  p_id bigint, p_outcome text, p_provider text default null, p_message_id text default null,
  p_error text default null, p_retry_after integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.notification_deliveries%rowtype;
  v_error text := left(nullif(regexp_replace(lower(coalesce(p_error, '')), '[^a-z_]', '', 'g'), ''), 60);
  v_status text;
  v_wait integer;
  v_email text;
begin
  if v_error is not null and char_length(v_error) < 3 then
    v_error := 'unknown';
  end if;
  if p_outcome not in ('provider_accepted', 'failed_retryable', 'failed_permanent', 'outcome_unknown') then
    raise exception 'outcome_invalid' using errcode = 'P0001';
  end if;
  select * into v_d from public.notification_deliveries where id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if v_d.status <> 'processing' then
    -- Already settled meanwhile (the provider's events, or an expired lease).
    return v_d.status;
  end if;

  if p_outcome = 'provider_accepted' then
    v_status := 'provider_accepted';
    update public.notification_deliveries
       set status = v_status, accepted_at = now(), provider = case when p_provider in ('capture', 'brevo', 'log') then p_provider end,
           provider_message_id = left(p_message_id, 300), last_error = null, lease_until = null
     where id = p_id;
  elsif p_outcome = 'failed_permanent' or v_d.attempts >= 6 then
    v_status := 'failed_permanent';
    update public.notification_deliveries
       set status = v_status, last_error = coalesce(v_error, case when p_outcome = 'outcome_unknown' then 'outcome_unknown' else 'refused' end),
           lease_until = null, finished_at = now()
     where id = p_id;
    if v_error = 'invalid_address' then
      select u.email into v_email from auth.users u where u.id = v_d.recipient_id;
      if v_email is not null then
        insert into public.notification_suppressions (user_id, email_hash, reason, source)
        values (v_d.recipient_id, private.email_hash(v_email), 'invalid_address', 'provider')
        on conflict (email_hash) where cleared_at is null do nothing;
      end if;
    end if;
  else
    v_status := 'failed_retryable';
    v_wait := least((60 * power(2, v_d.attempts) * (0.8 + random() * 0.4))::integer, 6 * 3600);
    v_wait := greatest(v_wait, coalesce(least(p_retry_after, 6 * 3600), 0), case when p_outcome = 'outcome_unknown' then 600 else 0 end);
    update public.notification_deliveries
       set status = v_status, last_error = case when p_outcome = 'outcome_unknown' then 'outcome_unknown' else coalesce(v_error, 'unknown') end,
           lease_until = null, next_attempt_at = now() + make_interval(secs => v_wait)
     where id = p_id;
  end if;

  update public.notification_delivery_attempts
     set finished_at = now(), outcome = case when p_outcome = 'outcome_unknown' then 'outcome_unknown' else p_outcome end,
         error = case when p_outcome = 'provider_accepted' then null else coalesce(v_error, case when p_outcome = 'outcome_unknown' then 'outcome_unknown' end) end
   where delivery_id = p_id and attempt = v_d.attempts and finished_at is null;
  return v_status;
end;
$$;

-- Test mode: what would have been sent, recorded instead of sending.
create or replace function private.capture_notification_email(p_id bigint, p_subject text, p_text text, p_html text, p_headers jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select delivery_mode from public.notification_config where id) <> 'capture' then
    raise exception 'capture_disabled' using errcode = 'P0001';
  end if;
  insert into public.notification_email_captures (delivery_id, subject, text_body, html_body, headers)
  values (p_id, left(p_subject, 300), left(p_text, 20000), left(p_html, 60000), coalesce(p_headers, '{}'::jsonb))
  on conflict (delivery_id) do update set subject = excluded.subject, text_body = excluded.text_body,
                                          html_body = excluded.html_body, headers = excluded.headers, captured_at = now();
end;
$$;

create or replace function private.start_notification_run(p_mode text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_worker_runs (mode) values (p_mode) returning id;
$$;

create or replace function private.finish_notification_run(p_id bigint, p_claimed integer, p_accepted integer, p_failed integer,
                                                           p_skipped integer, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_worker_runs
     set finished_at = now(), claimed = coalesce(p_claimed, 0), accepted = coalesce(p_accepted, 0),
         failed = coalesce(p_failed, 0), skipped = coalesce(p_skipped, 0),
         error = left(nullif(regexp_replace(lower(coalesce(p_error, '')), '[^a-z_]', '', 'g'), ''), 60)
   where id = p_id;
$$;

-- ---- Provider events (the notifications-webhook Edge Function) ---------------------------------------------

-- Records one provider event once (a repeated or late event changes nothing
-- it should not): delivered → delivered; hard bounce, invalid address,
-- blocked → failed and the address suppressed; complaint → suppressed;
-- request → accepted (reconciles an unknown outcome). Opens and clicks are
-- not recorded at all: the platform does not track reading.
create or replace function private.record_provider_event(
  p_provider text, p_event text, p_message_id text, p_delivery_key text, p_occurred_at timestamptz, p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := lower(coalesce(p_event, ''));
  v_key uuid;
  v_delivery public.notification_deliveries%rowtype;
  v_inserted bigint;
  v_email text;
  v_reason text;
begin
  if p_provider <> 'brevo' or v_event !~ '^[a-z_]{2,40}$' then
    raise exception 'provider_event_invalid' using errcode = 'P0001';
  end if;
  if v_event in ('opened', 'unique_opened', 'click', 'proxy_open', 'unique_proxy_open') then
    return jsonb_build_object('ignored', true);
  end if;
  if coalesce(p_delivery_key, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := p_delivery_key::uuid;
  end if;
  select * into v_delivery from public.notification_deliveries d
   where (v_key is not null and d.idempotency_key = v_key)
      or (v_key is null and p_message_id is not null and d.provider_message_id = left(p_message_id, 300))
   limit 1
   for update;

  insert into public.notification_provider_events (provider, dedupe_key, event, provider_message_id, delivery_key, delivery_id, occurred_at)
  values (p_provider, md5(concat_ws('|', p_provider, v_event, p_message_id, p_delivery_key, p_occurred_at)), v_event,
          left(p_message_id, 300), v_key, v_delivery.id, p_occurred_at)
  on conflict (dedupe_key) do nothing
  returning id into v_inserted;
  if v_inserted is null then
    return jsonb_build_object('duplicate', true);
  end if;
  if v_delivery.id is null and v_event not in ('hard_bounce', 'invalid_email', 'blocked', 'spam') then
    return jsonb_build_object('recorded', true, 'matched', false);
  end if;

  if v_event = 'request' and v_delivery.status in ('queued', 'processing', 'failed_retryable') then
    update public.notification_deliveries
       set status = 'provider_accepted', accepted_at = coalesce(accepted_at, now()), lease_until = null, last_error = null,
           provider_message_id = coalesce(provider_message_id, left(p_message_id, 300))
     where id = v_delivery.id;
  elsif v_event = 'delivered' and v_delivery.status not in ('delivered', 'failed_permanent', 'suppressed', 'cancelled') then
    update public.notification_deliveries
       set status = 'delivered', accepted_at = coalesce(accepted_at, now()), delivered_at = now(), finished_at = now(),
           lease_until = null, last_error = null, provider_message_id = coalesce(provider_message_id, left(p_message_id, 300))
     where id = v_delivery.id;
  elsif v_event in ('hard_bounce', 'invalid_email', 'blocked', 'error') and v_delivery.id is not null
        and v_delivery.status not in ('failed_permanent', 'suppressed', 'cancelled') then
    update public.notification_deliveries
       set status = 'failed_permanent', lease_until = null, finished_at = now(),
           last_error = case v_event when 'invalid_email' then 'invalid_address' when 'error' then 'provider_error' else v_event end
     where id = v_delivery.id;
  end if;

  v_reason := case v_event when 'hard_bounce' then 'hard_bounce' when 'invalid_email' then 'invalid_address'
                           when 'blocked' then 'blocked' when 'spam' then 'complaint' end;
  if v_reason is not null then
    if v_delivery.id is not null then
      select u.email into v_email from auth.users u where u.id = v_delivery.recipient_id;
    end if;
    v_email := coalesce(v_email, p_email);
    if coalesce(v_email, '') <> '' then
      insert into public.notification_suppressions (user_id, email_hash, reason, source)
      values (v_delivery.recipient_id, private.email_hash(v_email), v_reason, 'provider')
      on conflict (email_hash) where cleared_at is null do nothing;
    end if;
  end if;
  return jsonb_build_object('recorded', true, 'matched', v_delivery.id is not null);
end;
$$;

-- ---- Reminders (one job, current state only) ---------------------------------------------------------------

-- Every 15 minutes. Each reminder's key carries the date it is about, so a
-- moved event or interview reminds again for the new date; the old one is
-- obsolete and stopped (private.notification_obsolete). Draft deadlines,
-- unanswered questions and offers stay with the recruitment job.
create or replace function private.enqueue_due_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_app public.applications%rowtype;
  v_events integer := 0;
  v_interviews integer := 0;
  v_mandates integer := 0;
  v_posts integer := 0;
  v_vacancy integer := 0;
  v_swept integer := 0;
  v_bde uuid;
  v_last uuid;
begin
  -- Events: confirmed participants, the day before (registered more than a day ahead).
  for v_row in
    select e.id as event_id, r.user_id, e.starts_at
      from public.events e
      join public.event_registrations r on r.event_id = e.id and r.status = 'confirmed'
     where e.publication = 'published' and e.status = 'scheduled' and e.hidden_at is null and e.registration_mode = 'internal'
       and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
       and r.confirmed_at <= e.starts_at - interval '24 hours'
  loop
    perform private.enqueue_notification(v_row.user_id, 'event_reminder', e,
      'event:' || v_row.event_id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || v_row.user_id)
      from public.events e where e.id = v_row.event_id;
    v_events := v_events + 1;
  end loop;

  -- Interviews within 24 hours: the candidate and the interviewers.
  for v_row in
    select i.id, i.application_id, s.starts_at, s.ends_at, s.mode, s.location, s.id as slot_id
      from public.recruitment_interviews i
      join public.recruitment_interview_slots s on s.id = i.slot_id
     where i.status = 'scheduled' and s.cancelled_at is null
       and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
       and coalesce(i.scheduled_at, i.invited_at) <= s.starts_at - interval '24 hours'
  loop
    select * into v_app from public.applications where id = v_row.application_id;
    if v_app.status = 'submitted' then
      perform private.enqueue_application_message(v_app, 'recruitment_interview_reminder',
        'interview:' || v_row.id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || v_app.candidate_id,
        jsonb_build_object('interview_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at,
                           'mode', v_row.mode, 'location', case when v_row.mode = 'in_person' then v_row.location end));
      perform private.enqueue_team_message(cm.user_id, v_app, 'recruitment_team_interview_reminder',
        'interview:' || v_row.id || ':reminder:' || extract(epoch from v_row.starts_at)::bigint || ':' || cm.user_id,
        jsonb_build_object('interview_id', v_row.id, 'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at, 'mode', v_row.mode))
        from public.recruitment_slot_interviewers si
        join public.recruitment_committee_members cm on cm.id = si.member_id
       where si.slot_id = v_row.slot_id;
      v_interviews := v_interviews + 1;
    end if;
  end loop;

  -- Mandates ending in 30 and in 7 days, unless renewed.
  for v_row in
    select a.id, a.user_id, a.organization_id, a.ends_at, a.office, p.title, o.slug, coalesce(o.short_name, o.name) as org,
           case when a.ends_at <= now() + interval '7 days' then 7 else 30 end as days
      from public.position_assignments a
      join public.positions p on p.id = a.position_id
      join public.organizations o on o.id = a.organization_id
     where a.status = 'active' and a.starts_at <= now() and a.ends_at > now() and a.ends_at <= now() + interval '30 days'
       and not exists (select 1 from public.position_assignments b
                        where b.membership_id = a.membership_id and b.position_id = a.position_id and b.id <> a.id
                          and b.status = 'active' and b.starts_at >= a.ends_at - interval '1 day')
  loop
    perform private.notify(v_row.user_id, 'governance_mandate_expiring',
      'mandate:' || v_row.id || ':' || v_row.days || ':' || extract(epoch from v_row.ends_at)::bigint,
      jsonb_build_object('assignment_id', v_row.id, 'position', v_row.title, 'organization', v_row.org, 'slug', v_row.slug,
                         'ends_at', v_row.ends_at, 'office', v_row.office, 'days', v_row.days),
      v_row.organization_id, 'assignment', v_row.id);
    v_mandates := v_mandates + 1;
  end loop;

  -- Articles waiting two days for a review: the people who may approve them.
  for v_row in
    select r.id as revision_id, r.post_id, r.title, r.submitted_by, p.organization_id, coalesce(o.short_name, o.name) as org, o.slug
      from public.post_revisions r
      join public.posts p on p.id = r.post_id
      join public.organizations o on o.id = p.organization_id
     where r.status = 'submitted' and r.submitted_at <= now() - interval '48 hours'
  loop
    perform private.notify(m.user_id, 'content_approval_pending', 'post_pending:' || v_row.revision_id || ':' || m.user_id,
      jsonb_build_object('title', v_row.title, 'post_id', v_row.post_id, 'organization', v_row.org, 'slug', v_row.slug),
      v_row.organization_id, 'post', v_row.revision_id)
      from public.memberships m
     where m.organization_id = v_row.organization_id and m.status = 'active'
       and m.user_id is distinct from v_row.submitted_by
       and private.user_has_organization_permission(m.user_id, v_row.organization_id, 'posts.approve', now());
    v_posts := v_posts + 1;
  end loop;

  -- No BDE presidency: the continuity guardian, once per vacancy.
  select id into v_bde from public.organizations where kind = 'bde' limit 1;
  if v_bde is not null and not exists (
       select 1 from public.position_assignments a
        where a.organization_id = v_bde and a.office = 'bde_president' and a.status = 'active'
          and a.starts_at <= now() and now() < a.ends_at) then
    select a.id into v_last from public.position_assignments a
     where a.organization_id = v_bde and a.office = 'bde_president' order by a.ends_at desc limit 1;
    for v_row in
      select g.user_id from public.platform_assignments g
       where g.role = 'guardian' and g.status = 'active' and g.starts_at <= now() and now() < g.ends_at
    loop
      perform private.notify(v_row.user_id, 'governance_bde_vacancy', 'bde_vacancy:' || coalesce(v_last::text, 'none') || ':' || v_row.user_id,
        jsonb_build_object('organization', (select name from public.organizations where id = v_bde)), v_bde, 'organization', v_bde);
      v_vacancy := v_vacancy + 1;
    end loop;
  end if;

  -- Unread reminders that no longer apply leave the notification centre.
  update public.notifications n set archived_at = now(), read_at = coalesce(n.read_at, now())
   where n.archived_at is null and n.read_at is null
     and n.kind in ('event_reminder', 'recruitment_interview_reminder', 'recruitment_team_interview_reminder',
                    'application_deadline_reminder', 'recruitment_offer_reminder', 'recruitment_clarification_reminder',
                    'governance_mandate_expiring', 'content_approval_pending')
     and n.created_at > now() - interval '30 days'
     and private.notification_obsolete(n.id);
  get diagnostics v_swept = row_count;

  return jsonb_build_object('events', v_events, 'interviews', v_interviews, 'mandates', v_mandates, 'posts', v_posts,
                            'vacancy', v_vacancy, 'swept', v_swept);
end;
$$;

-- The Phase 7 reminder function stays callable (tests, operators) and now
-- runs inside the consolidated job.
create or replace function private.enqueue_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return (private.enqueue_due_reminders() ->> 'events')::integer;
end;
$$;

-- ---- Retention (nightly) ---------------------------------------------------------------------------------

-- Notifications are messages, not records: read ones go after 6 months,
-- archived ones after 30 days, any after a year (the business records they
-- were about are untouched). Delivery details after 90 days, attempts and
-- provider events after 30, test captures and worker runs after 7 and 14,
-- used or expired unsubscribe tokens after 7, a dispatched broadcast's
-- recipient list after 30. The choices log (consent) is kept 3 years.
create or replace function private.purge_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifications integer;
  v_deliveries integer;
begin
  delete from public.notifications
   where (read_at is not null and read_at < now() - interval '6 months')
      or (archived_at is not null and archived_at < now() - interval '30 days')
      or created_at < now() - interval '12 months';
  get diagnostics v_notifications = row_count;
  delete from public.notification_deliveries
   where finished_at is not null and finished_at < now() - interval '90 days';
  get diagnostics v_deliveries = row_count;
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
  delete from public.notification_preference_changes where created_at < now() - interval '3 years';
  delete from public.notification_suppressions where cleared_at is not null and cleared_at < now() - interval '1 year';
  return jsonb_build_object('notifications', v_notifications, 'deliveries', v_deliveries);
end;
$$;

-- ---- Waking the worker (pg_cron → pg_net → the Edge Function) ----------------------------------------------

-- Calls the worker only when something is due and e-mails are not "off".
-- Its address and token are Vault secrets set by the operator
-- (notifications_worker_url, notifications_worker_token): without them,
-- nothing is called and the e-mails wait.
create or replace function private.kick_notification_worker()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if (select delivery_mode from public.notification_config where id) = 'off' then
    return false;
  end if;
  if not exists (select 1 from public.notification_deliveries d
                  where (d.status in ('queued', 'failed_retryable') and d.next_attempt_at <= now())
                     or (d.status = 'processing' and d.lease_until <= now())) then
    return false;
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return false;
  end if;
  v_url := private.notification_secret('notifications_worker_url');
  v_token := private.notification_secret('notifications_worker_token');
  if v_url is null or v_token is null or v_url !~ '^https?://' then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token);
  return true;
end;
$$;

-- ---- Delivery health (BDE: platform.communications.monitor) -------------------------------------------------

-- Counts and alerts, never a recipient, an address or a message.
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
    v_alerts := v_alerts || 'mode_off_with_queue';
  end if;
  if v_config.delivery_mode <> 'off' and v_due > 0 and coalesce(v_last.started_at, '-infinity') < now() - interval '10 minutes' then
    v_alerts := v_alerts || 'worker_silent';
  end if;
  if v_due > 50 and v_oldest < now() - interval '15 minutes' then
    v_alerts := v_alerts || 'backlog';
  end if;
  if v_failed >= 10 and v_failed > (v_accepted + v_failed) / 5 then
    v_alerts := v_alerts || 'high_failure';
  end if;
  if (select count(*) from public.notification_deliveries
       where last_error = 'rate_limited' and updated_at > now() - interval '1 hour') >= 5 then
    v_alerts := v_alerts || 'rate_limited';
  end if;
  if v_config.delivery_mode = 'live' and (v_config.email_from is null or v_config.site_url is null) then
    v_alerts := v_alerts || 'config_incomplete';
  end if;
  if v_last.error is not null and v_last.started_at > now() - interval '1 hour' then
    v_alerts := v_alerts || 'worker_error';
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

-- Failed e-mails, for diagnosis: what kind, which association, why, when.
-- No recipient, no address, no content.
create or replace function public.notification_failed_deliveries(p_limit integer default 50, p_before_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.communications.monitor');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'kind', n.kind, 'topic', d.topic, 'essential', d.essential, 'status', d.status,
             'attempts', d.attempts, 'error', d.last_error, 'created_at', d.created_at, 'updated_at', d.updated_at,
             'organization', (select coalesce(o.short_name, o.name) from public.organizations o where o.id = n.organization_id),
             'retryable', d.status = 'failed_permanent' and coalesce(d.last_error, '') not in ('no_address', 'suppressed'))
             order by d.id desc)
      from (select * from public.notification_deliveries
             where status in ('failed_permanent', 'suppressed') and (p_before_id is null or id < p_before_id)
             order by id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) d
      join public.notifications n on n.id = d.notification_id), '[]'::jsonb);
end;
$$;

-- Send a failed e-mail again (after a provider outage was fixed). Second factor, audited.
create or replace function public.retry_notification_delivery(p_delivery_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_d public.notification_deliveries%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.communications.monitor');
  perform private.require_aal2();
  select * into v_d from public.notification_deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'delivery_not_found' using errcode = 'P0001';
  end if;
  if v_d.status <> 'failed_permanent' or coalesce(v_d.last_error, '') in ('no_address', 'suppressed') then
    raise exception 'delivery_not_retryable' using errcode = 'P0001';
  end if;
  update public.notification_deliveries
     set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, finished_at = null
   where id = p_delivery_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'notification_delivery_retried', 'communications', null, null, 'notification_delivery', null,
    jsonb_build_object('delivery_id', p_delivery_id, 'previous_error', v_d.last_error));
end;
$$;

-- The operator's switch (SQL only, as the database owner): off, capture
-- (test mode) or live; the sender, the reply-to and the site's address
-- used in links. Audited.
create or replace function private.set_notification_config(p_mode text, p_email_from text default null, p_reply_to text default null,
                                                           p_site_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.notification_config%rowtype;
begin
  select * into v_before from public.notification_config where id;
  update public.notification_config
     set delivery_mode = p_mode, email_from = nullif(btrim(coalesce(p_email_from, '')), ''),
         reply_to = nullif(btrim(coalesce(p_reply_to, '')), ''), site_url = nullif(btrim(coalesce(p_site_url, '')), ''),
         updated_at = now()
   where id;
  perform private.log_governance_event(
    null, 'provisioning', 'notification_config_changed', 'communications', null, null, 'notification_config', null,
    jsonb_build_object('mode', p_mode, 'previous_mode', v_before.delivery_mode,
                       'email_from_set', nullif(btrim(coalesce(p_email_from, '')), '') is not null,
                       'site_url_set', nullif(btrim(coalesce(p_site_url, '')), '') is not null));
end;
$$;
