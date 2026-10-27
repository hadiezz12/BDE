-- Phase 10 · The notification engine: one entry point (private.notify), the
-- producers of Phases 7–9 routed through it, the notification centre, the
-- person's choices, the worker's steps (claim, complete, capture), provider
-- events, obsolete reminders, consolidated reminders, retention and the
-- one-minute dispatch. No API role writes a notification or a delivery.

-- ---- The single entry point ----------------------------------------------------------------------------

-- What a person chose for a topic (essential topics: always both channels).
create or replace function private.notification_choice(p_user uuid, p_topic text)
returns table (in_app boolean, email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select case when tp.class = 'essential' then true
              when tp.class = 'operational' then true
              else coalesce(p.in_app, tp.default_in_app) end,
         case when tp.class = 'essential' then true else coalesce(p.email, tp.default_email) end
    from public.notification_topics tp
    left join public.notification_preferences p on p.user_id = p_user and p.topic = tp.key
   where tp.key = p_topic;
$$;

-- One notification for one person, from a trusted producer (never from a
-- browser). The catalog fixes its topic and importance; the person's choices
-- decide the channels; the key makes it idempotent (a producer firing twice
-- for the same thing and person creates one notification and one delivery).
-- Returns the new id, or null (already there, or nothing wanted).
create or replace function private.notify(
  p_recipient uuid,
  p_kind text,
  p_key text,
  p_payload jsonb default '{}'::jsonb,
  p_organization_id uuid default null,
  p_resource_type text default null,
  p_resource_id uuid default null,
  p_event_id uuid default null,
  p_application_id uuid default null,
  p_broadcast_id uuid default null,
  p_importance text default null,
  p_email boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.notification_types%rowtype;
  v_class text;
  v_in_app boolean;
  v_email boolean;
  v_id bigint;
begin
  if p_recipient is null then
    return null;
  end if;
  select * into v_type from public.notification_types where key = p_kind;
  if not found then
    raise exception 'notification_type_unknown' using errcode = 'P0001', detail = p_kind;
  end if;
  if not exists (select 1 from auth.users u where u.id = p_recipient) then
    return null;
  end if;
  select tp.class into v_class from public.notification_topics tp where tp.key = v_type.topic;
  select c.in_app, c.email into v_in_app, v_email from private.notification_choice(p_recipient, v_type.topic) c;
  v_email := v_email and v_type.email and coalesce(p_email, true);
  if not v_in_app and not v_email then
    return null;
  end if;

  insert into public.notifications (recipient_id, kind, event_id, application_id, payload, dedupe_key, organization_id,
                                    resource_type, resource_id, importance, broadcast_id, read_at, archived_at)
  values (p_recipient, p_kind, p_event_id, p_application_id, coalesce(p_payload, '{}'::jsonb), p_key, p_organization_id,
          p_resource_type, p_resource_id, p_importance, p_broadcast_id,
          case when v_in_app then null else now() end, case when v_in_app then null else now() end)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  if v_email then
    insert into public.notification_deliveries (notification_id, recipient_id, essential, topic)
    values (v_id, p_recipient, v_class = 'essential', v_type.topic)
    on conflict (notification_id, channel) do nothing;
  end if;
  return v_id;
end;
$$;

-- ---- Phase 7–9 producers, now through private.notify ----------------------------------------------------

create or replace function private.enqueue_notification(
  p_recipient uuid, p_kind text, p_event public.events, p_dedupe_key text, p_extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(p_recipient, p_kind, p_dedupe_key,
                         private.event_message_payload(p_event) || coalesce(p_extra, '{}'::jsonb),
                         p_event.organization_id, 'event', p_event.id, p_event.id);
end;
$$;

create or replace function private.enqueue_application_message(p_application public.applications, p_kind text, p_key text, p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(p_application.candidate_id, p_kind, p_key,
                         private.application_message_payload(p_application) || coalesce(p_extra, '{}'::jsonb),
                         (select c.organization_id from public.recruitment_campaigns c where c.id = p_application.campaign_id),
                         'application', p_application.id, null, p_application.id);
end;
$$;

create or replace function private.enqueue_team_message(p_recipient uuid, p_app public.applications, p_kind text, p_key text,
                                                        p_extra jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null then
    return;
  end if;
  perform private.notify(p_recipient, p_kind, p_key,
                         private.team_message_payload(p_app) || coalesce(p_extra, '{}'::jsonb),
                         (select c.organization_id from public.recruitment_campaigns c where c.id = p_app.campaign_id),
                         'application', p_app.id, null, p_app.id);
end;
$$;

-- ---- The notification centre (one's own rows only) ------------------------------------------------------

create or replace function private.notification_item(p_n public.notifications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_n.id, 'kind', p_n.kind, 'category', tp.category,
    'importance', coalesce(p_n.importance, t.importance), 'payload', p_n.payload,
    'organization', case when o.id is null then null else jsonb_build_object(
                      'id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name, 'accent', o.accent, 'kind', o.kind) end,
    'resource_type', p_n.resource_type, 'resource_id', p_n.resource_id,
    'event_id', p_n.event_id, 'application_id', p_n.application_id,
    'created_at', p_n.created_at, 'read_at', p_n.read_at, 'archived_at', p_n.archived_at)
    from public.notification_types t
    join public.notification_topics tp on tp.key = t.topic
    left join public.organizations o on o.id = p_n.organization_id
   where t.key = p_n.kind;
$$;

-- A page of one's notifications, newest first; the cursor is the last row's
-- (created_at, id), so a page never repeats or skips a row.
create or replace function public.my_notifications(
  p_view text default 'all',
  p_category text default null,
  p_before timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_rows public.notifications[];
  v_items jsonb;
  v_last public.notifications;
begin
  if coalesce(p_view, 'all') not in ('all', 'unread', 'archived')
     or (p_category is not null and p_category not in ('account', 'governance', 'content', 'events', 'recruitment', 'campus')) then
    raise exception 'filter_invalid' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.n order by (x.n).created_at desc, (x.n).id desc), '{}') into v_rows
    from (
      select n from public.notifications n
        join public.notification_types t on t.key = n.kind
        join public.notification_topics tp on tp.key = t.topic
       where n.recipient_id = v_actor
         and case coalesce(p_view, 'all')
               when 'archived' then n.archived_at is not null
               when 'unread' then n.archived_at is null and n.read_at is null
               else n.archived_at is null end
         and (p_category is null or tp.category = p_category)
         and (p_before is null or (n.created_at, n.id) < (p_before, coalesce(p_before_id, 9223372036854775807)))
       order by n.created_at desc, n.id desc
       limit v_limit + 1
    ) x;
  select coalesce(jsonb_agg(private.notification_item(r) order by r.created_at desc, r.id desc), '[]'::jsonb) into v_items
    from unnest(v_rows[1:v_limit]) r;
  if cardinality(v_rows) > v_limit then
    v_last := v_rows[v_limit];
  end if;
  return jsonb_build_object(
    'items', v_items,
    'next', case when v_last.id is null then null
                 else jsonb_build_object('before', v_last.created_at, 'before_id', v_last.id) end);
end;
$$;

-- The bell: how many unread (capped at 100: "99+"), and the latest five.
create or replace function public.my_notification_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unread', (select count(*) from (select 1 from public.notifications n
                                      where n.recipient_id = (select auth.uid()) and n.read_at is null and n.archived_at is null
                                      limit 100) s),
    'latest', coalesce((select jsonb_agg(private.notification_item(x.n) order by (x.n).created_at desc, (x.n).id desc)
                          from (select n from public.notifications n
                                 where n.recipient_id = (select auth.uid()) and n.archived_at is null
                                 order by n.created_at desc, n.id desc limit 5) x), '[]'::jsonb))
   where (select auth.uid()) is not null;
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = v_actor and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Archived: out of the default list (and read); restorable.
create or replace function public.archive_notifications(p_ids bigint[], p_archive boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_count integer;
begin
  if cardinality(coalesce(p_ids, '{}')) not between 1 and 200 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  if coalesce(p_archive, true) then
    update public.notifications set archived_at = now(), read_at = coalesce(read_at, now())
     where recipient_id = v_actor and id = any (p_ids) and archived_at is null;
  else
    update public.notifications set archived_at = null
     where recipient_id = v_actor and id = any (p_ids) and archived_at is not null;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Opening a notification marks it read and says what it is about; the site
-- then sends the person to the page, which checks access again on its own.
create or replace function public.open_notification(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_n public.notifications%rowtype;
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where id = p_id and recipient_id = v_actor
  returning * into v_n;
  if not found then
    raise exception 'notification_not_found' using errcode = 'P0001';
  end if;
  return private.notification_item(v_n);
end;
$$;

-- ---- A person's choices ----------------------------------------------------------------------------------

create or replace function private.email_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(lower(btrim(p_email)), 'sha256'), 'hex');
$$;

create or replace function public.my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_email text;
begin
  select u.email into v_email from auth.users u where u.id = v_actor;
  return jsonb_build_object(
    'topics', (select jsonb_agg(jsonb_build_object(
                 'key', tp.key, 'class', tp.class, 'category', tp.category, 'label', tp.label, 'description', tp.description,
                 'in_app', c.in_app, 'email', c.email, 'customized', p.user_id is not null)
                 order by tp.sort_order)
                 from public.notification_topics tp
                 cross join lateral private.notification_choice(v_actor, tp.key) c
                 left join public.notification_preferences p on p.user_id = v_actor and p.topic = tp.key),
    'settings', coalesce((select jsonb_build_object('quiet_hours', s.quiet_hours, 'quiet_start', to_char(s.quiet_start, 'HH24:MI'),
                                                    'quiet_end', to_char(s.quiet_end, 'HH24:MI'), 'timezone', s.timezone)
                            from public.notification_settings s where s.user_id = v_actor),
                         jsonb_build_object('quiet_hours', false, 'quiet_start', '22:00', 'quiet_end', '08:00', 'timezone', 'Europe/Paris')),
    'follows', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'slug', o.slug, 'name', o.name, 'short_name', o.short_name,
                                                             'accent', o.accent, 'since', f.created_at) order by o.name)
                           from public.notification_follows f join public.organizations o on o.id = f.organization_id
                          where f.user_id = v_actor), '[]'::jsonb),
    'suppression', (select jsonb_build_object('reason', s.reason, 'since', s.created_at)
                      from public.notification_suppressions s
                     where s.cleared_at is null and (s.user_id = v_actor or s.email_hash = private.email_hash(coalesce(v_email, '')))
                     order by s.created_at desc limit 1),
    'changes', coalesce((select jsonb_agg(jsonb_build_object('topic', c.topic, 'organization', o.name, 'change', c.change,
                                                             'source', c.source, 'at', c.created_at) order by c.created_at desc)
                           from (select * from public.notification_preference_changes
                                  where user_id = v_actor order by created_at desc limit 12) c
                           left join public.organizations o on o.id = c.organization_id), '[]'::jsonb));
end;
$$;

create or replace function private.log_preference_change(p_user uuid, p_topic text, p_organization uuid, p_change text, p_source text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_preference_changes (user_id, topic, organization_id, change, source)
  values (p_user, p_topic, p_organization, p_change, p_source);
$$;

-- Essential topics cannot be changed; operational topics stay in the
-- notification centre (only their e-mail can be turned off); optional
-- topics, both channels. Every change is recorded (the consent record).
create or replace function public.set_notification_preference(p_topic text, p_in_app boolean, p_email boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_topic public.notification_topics%rowtype;
  v_before record;
  v_in_app boolean;
  v_email boolean := coalesce(p_email, false);
begin
  select * into v_topic from public.notification_topics where key = p_topic;
  if not found then
    raise exception 'topic_not_found' using errcode = 'P0001';
  end if;
  if v_topic.class = 'essential' then
    raise exception 'topic_essential' using errcode = 'P0001';
  end if;
  v_in_app := case when v_topic.class = 'operational' then true else coalesce(p_in_app, true) end;
  select c.in_app, c.email into v_before from private.notification_choice(v_actor, p_topic) c;
  insert into public.notification_preferences (user_id, topic, in_app, email)
  values (v_actor, p_topic, v_in_app, v_email)
  on conflict (user_id, topic) do update set in_app = excluded.in_app, email = excluded.email, updated_at = now();
  if v_before.in_app is distinct from v_in_app then
    perform private.log_preference_change(v_actor, p_topic, null, case when v_in_app then 'in_app_on' else 'in_app_off' end, 'settings');
  end if;
  if v_before.email is distinct from v_email then
    perform private.log_preference_change(v_actor, p_topic, null, case when v_email then 'email_on' else 'email_off' end, 'settings');
  end if;
  return jsonb_build_object('topic', p_topic, 'in_app', v_in_app, 'email', v_email);
end;
$$;

create or replace function public.set_notification_settings(p_quiet_hours boolean, p_quiet_start text, p_quiet_end text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_before boolean;
  v_start time;
  v_end time;
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'Europe/Paris');
begin
  if coalesce(p_quiet_start, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(p_quiet_end, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'quiet_hours_invalid' using errcode = 'P0001';
  end if;
  v_start := p_quiet_start::time;
  v_end := p_quiet_end::time;
  if v_start = v_end or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception 'quiet_hours_invalid' using errcode = 'P0001';
  end if;
  select quiet_hours into v_before from public.notification_settings where user_id = v_actor;
  insert into public.notification_settings (user_id, quiet_hours, quiet_start, quiet_end, timezone)
  values (v_actor, coalesce(p_quiet_hours, false), v_start, v_end, v_tz)
  on conflict (user_id) do update set quiet_hours = excluded.quiet_hours, quiet_start = excluded.quiet_start,
                                      quiet_end = excluded.quiet_end, timezone = excluded.timezone, updated_at = now();
  if coalesce(v_before, false) is distinct from coalesce(p_quiet_hours, false) then
    perform private.log_preference_change(v_actor, null, null,
                                          case when p_quiet_hours then 'quiet_hours_on' else 'quiet_hours_off' end, 'settings');
  end if;
end;
$$;

-- Following an association is the person's own choice, from its page or
-- their settings. An active association only.
create or replace function public.follow_organization(p_organization_id uuid, p_follow boolean, p_source text default 'association_page')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_source text := case when p_source = 'settings' then 'settings' else 'association_page' end;
  v_count integer;
begin
  if coalesce(p_follow, true) then
    if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
      raise exception 'organization_not_found' using errcode = 'P0001';
    end if;
    insert into public.notification_follows (user_id, organization_id) values (v_actor, p_organization_id)
    on conflict do nothing;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      perform private.log_preference_change(v_actor, 'followed_updates', p_organization_id, 'follow', v_source);
    end if;
    return true;
  end if;
  delete from public.notification_follows where user_id = v_actor and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.log_preference_change(v_actor, 'followed_updates', p_organization_id, 'unfollow', v_source);
  end if;
  return false;
end;
$$;

create or replace function public.am_i_following(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.notification_follows f
                  where f.user_id = (select auth.uid()) and f.organization_id = p_organization_id);
$$;

-- A person asks to get e-mails again after a bounce or a complaint on their address.
create or replace function public.clear_my_email_suppression()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_email text;
  v_count integer;
begin
  select u.email into v_email from auth.users u where u.id = v_actor;
  update public.notification_suppressions
     set cleared_at = now(), cleared_by = v_actor
   where cleared_at is null and (user_id = v_actor or email_hash = private.email_hash(coalesce(v_email, '')));
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.log_preference_change(v_actor, null, null, 'suppression_cleared', 'settings');
  end if;
  return v_count;
end;
$$;

-- ---- Unsubscribe links (no sign-in needed; the token is the proof) -----------------------------------------

create or replace function public.peek_unsubscribe_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.notification_unsubscribe_tokens%rowtype;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_row from public.notification_unsubscribe_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  return jsonb_build_object(
    'status', case when v_row.used_at is not null then 'used' when v_row.expires_at <= now() then 'expired' else 'valid' end,
    'topic', v_row.topic, 'label', (select label from public.notification_topics where key = v_row.topic));
end;
$$;

create or replace function public.unsubscribe_with_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_unsubscribe_tokens%rowtype;
  v_topic public.notification_topics%rowtype;
  v_choice record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_row from public.notification_unsubscribe_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_topic from public.notification_topics where key = v_row.topic;
  if v_topic.class = 'essential' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_row.used_at is not null then
    return jsonb_build_object('status', 'already', 'label', v_topic.label);
  end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('status', 'expired', 'label', v_topic.label);
  end if;
  select c.in_app, c.email into v_choice from private.notification_choice(v_row.user_id, v_row.topic) c;
  insert into public.notification_preferences (user_id, topic, in_app, email)
  values (v_row.user_id, v_row.topic, v_choice.in_app, false)
  on conflict (user_id, topic) do update set email = false, updated_at = now();
  update public.notification_unsubscribe_tokens set used_at = now() where token_hash = v_row.token_hash;
  if v_choice.email then
    perform private.log_preference_change(v_row.user_id, v_row.topic, null, 'email_off', 'unsubscribe_link');
  end if;
  return jsonb_build_object('status', 'done', 'label', v_topic.label);
end;
$$;

-- ---- Phase 9 and Phase 7 functions that wrote to the outbox directly (unchanged but for that) -------------------

create or replace function public.appoint_recruitment_member(
  p_campaign_id uuid,
  p_membership_id uuid,
  p_role text,
  p_powers text[],
  p_scope text,
  p_position_ids uuid[] default null,
  p_ends_at timestamptz default null,
  p_purpose text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_membership public.memberships%rowtype;
  v_powers text[];
  v_positions uuid[];
  v_purpose text := nullif(btrim(coalesce(p_purpose, '')), '');
  v_id uuid;
begin
  perform private.require_aal2();
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if v_campaign.status = 'cancelled' then
    raise exception 'campaign_cancelled' using errcode = 'P0001';
  end if;
  select * into v_membership from public.memberships where id = p_membership_id;
  if not found or v_membership.organization_id <> v_campaign.organization_id or v_membership.status <> 'active' then
    raise exception 'member_not_active' using errcode = 'P0001';
  end if;
  if private.candidate_in_campaign(v_membership.user_id, p_campaign_id) then
    raise exception 'candidate_in_campaign' using errcode = 'P0001';
  end if;
  if p_role not in ('manager', 'reviewer', 'interviewer', 'reader') then
    raise exception 'role_invalid' using errcode = 'P0001';
  end if;
  v_powers := private.committee_powers(v_actor, v_campaign, p_powers);
  v_positions := private.committee_scope_positions(p_campaign_id, p_scope, p_position_ids);
  if p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '18 months' then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if private.campaign_sealed_at(v_campaign) is not null and now() >= private.campaign_sealed_at(v_campaign) then
    if v_purpose is null then
      raise exception 'purpose_required' using errcode = 'P0001';
    end if;
    v_purpose := private.require_reason(v_purpose);
  elsif v_purpose is not null then
    v_purpose := left(v_purpose, 500);
  end if;

  -- A previous appointment that simply ran out is closed, so the person can be named again.
  update public.recruitment_committee_members
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = 'Nomination arrivée à son terme'
   where campaign_id = p_campaign_id and user_id = v_membership.user_id and revoked_at is null and ends_at <= now();
  begin
    insert into public.recruitment_committee_members
      (campaign_id, organization_id, membership_id, user_id, role, powers, scope, ends_at, purpose, appointed_by)
    values (p_campaign_id, v_campaign.organization_id, p_membership_id, v_membership.user_id, p_role, v_powers, p_scope,
            p_ends_at, v_purpose, v_actor)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'already_on_committee' using errcode = 'P0001';
  end;
  insert into public.recruitment_committee_positions (member_id, campaign_id, position_id)
  select v_id, p_campaign_id, x from unnest(v_positions) as x;

  perform private.log_governance_event(
    v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_reviewer_assigned', 'recruitment',
    v_campaign.organization_id, v_membership.user_id, 'recruitment_committee_member', v_id,
    jsonb_build_object('campaign_id', p_campaign_id, 'role', p_role, 'powers', to_jsonb(v_powers), 'scope', p_scope,
                       'positions', cardinality(v_positions), 'ends_at', p_ends_at, 'historic', v_purpose is not null
                                                                                      and now() >= coalesce(private.campaign_sealed_at(v_campaign), 'infinity')),
    case when now() >= coalesce(private.campaign_sealed_at(v_campaign), 'infinity') then v_purpose end);
  if v_membership.user_id <> v_actor then
    perform private.notify(v_membership.user_id, 'recruitment_review_assigned', 'committee:' || v_id,
                           jsonb_build_object('title', v_campaign.title, 'organization', coalesce(o.short_name, o.name),
                                              'committee', true, 'link', '/manage/evaluations'),
                           v_campaign.organization_id, 'recruitment_campaign', v_campaign.id)
      from public.organizations o where o.id = v_campaign.organization_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.assign_recruitment_reviews(
  p_campaign_id uuid,
  p_application_ids uuid[],
  p_member_ids uuid[],
  p_mode text default 'each'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_campaign public.recruitment_campaigns%rowtype;
  v_app public.applications%rowtype;
  v_member public.recruitment_committee_members%rowtype;
  v_members uuid[];
  v_app_id uuid;
  v_target uuid;
  v_assigned integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_placed boolean;
  v_notified uuid[] := '{}'::uuid[];
begin
  v_campaign := private.campaign_with(v_actor, p_campaign_id, 'committee', true);
  if p_mode not in ('each', 'balanced') then
    raise exception 'mode_invalid' using errcode = 'P0001';
  end if;
  if cardinality(coalesce(p_application_ids, '{}')) = 0 or cardinality(coalesce(p_member_ids, '{}')) = 0
     or cardinality(p_application_ids) > 500 or cardinality(p_member_ids) > 30 then
    raise exception 'selection_invalid' using errcode = 'P0001';
  end if;
  -- Live appointments of this campaign that may review.
  v_members := array(
    select cm.id from public.recruitment_committee_members cm
     where cm.id = any (p_member_ids) and cm.campaign_id = p_campaign_id
       and cm.id = private.live_committee_member_id(cm.user_id, p_campaign_id) and 'review' = any (cm.powers));
  if cardinality(v_members) <> cardinality(array(select distinct x from unnest(p_member_ids) x)) then
    raise exception 'member_cannot_review' using errcode = 'P0001';
  end if;

  foreach v_app_id in array array(select distinct x from unnest(p_application_ids) x) loop
    select * into v_app from public.applications where id = v_app_id and campaign_id = p_campaign_id;
    if not found or v_app.status <> 'submitted' then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_app_id, 'reason', case when found then 'application_withdrawn' else 'application_not_found' end);
      continue;
    end if;
    v_placed := false;
    for v_target in
      select m from unnest(v_members) m
       order by case when p_mode = 'balanced'
                     then (select count(*) from public.recruitment_review_assignments ra where ra.member_id = m and ra.removed_at is null)
                     else 0 end, m
    loop
      select * into v_member from public.recruitment_committee_members where id = v_target;
      v_reason := case
        when exists (select 1 from public.recruitment_conflicts x where x.application_id = v_app.id and x.user_id = v_member.user_id
                                                                     and x.status in ('open', 'reassigned')) then 'conflict'
        when v_member.user_id = v_app.candidate_id then 'own_application'
        when v_member.scope = 'positions' and not exists (select 1 from public.recruitment_committee_positions cp
                                                          where cp.member_id = v_member.id and cp.position_id = v_app.position_id) then 'out_of_scope'
        when exists (select 1 from public.recruitment_review_assignments ra
                      where ra.application_id = v_app.id and ra.member_id = v_member.id and ra.removed_at is null) then 'already_assigned'
      end;
      if v_reason is not null then
        if p_mode = 'each' then
          v_skipped := v_skipped || jsonb_build_object('application_id', v_app.id, 'member_id', v_member.id, 'reason', v_reason);
        elsif v_reason = 'already_assigned' then
          -- Balanced: it already has one of these reviewers.
          v_placed := true;
          exit;
        end if;
        continue;
      end if;
      insert into public.recruitment_review_assignments (application_id, campaign_id, member_id, assigned_by)
      values (v_app.id, p_campaign_id, v_member.id, v_actor);
      perform private.log_application_activity(v_actor, v_app, 'reviewer_assigned',
        jsonb_build_object('reviewer_name', private.person_name(v_member.user_id)));
      v_assigned := v_assigned + 1;
      if not v_member.user_id = any (v_notified) and v_member.user_id <> v_actor then
        v_notified := v_notified || v_member.user_id;
      end if;
      v_placed := true;
      exit when p_mode = 'balanced';
    end loop;
    if p_mode = 'balanced' and not v_placed then
      v_skipped := v_skipped || jsonb_build_object('application_id', v_app.id, 'reason', 'no_reviewer_available');
    end if;
  end loop;

  foreach v_target in array v_notified loop
    perform private.notify(v_target, 'recruitment_review_assigned',
                           'assign:' || v_target || ':' || p_campaign_id || ':' || extract(epoch from now())::bigint,
                           jsonb_build_object('title', v_campaign.title, 'organization', coalesce(o.short_name, o.name),
                                              'link', '/manage/evaluations'),
                           v_campaign.organization_id, 'recruitment_campaign', p_campaign_id)
      from public.organizations o where o.id = v_campaign.organization_id;
  end loop;
  if v_assigned > 0 then
    perform private.log_governance_event(
      v_actor, private.recruitment_authority(v_actor, p_campaign_id, 'committee'), 'recruitment_reviews_assigned', 'recruitment',
      v_campaign.organization_id, null, 'recruitment_campaign', p_campaign_id,
      jsonb_build_object('assigned', v_assigned, 'reviewers', cardinality(v_members), 'mode', p_mode));
  end if;
  return jsonb_build_object('assigned', v_assigned, 'skipped', v_skipped);
end;
$$;

create or replace function private.event_summary(p_event public.events, p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_event.id, 'slug', p_event.slug, 'title', p_event.title, 'series_key', p_event.series_key,
    'starts_at', p_event.starts_at, 'ends_at', p_event.ends_at, 'timezone', p_event.timezone,
    'location', jsonb_build_object('type', p_event.location_type, 'venue', p_event.venue_name, 'city', p_event.city),
    'cover', private.media_json(p_event.cover_media_id),
    'category', (select c.label from public.event_categories c where c.id = p_event.category_id),
    'publication', p_event.publication, 'status', p_event.status,
    'first_published_at', p_event.first_published_at, 'cancelled_at', p_event.cancelled_at,
    'hidden', case when p_event.hidden_at is null then null
                   else jsonb_build_object('at', p_event.hidden_at, 'reason', p_event.hidden_reason) end,
    'registration', jsonb_build_object(
      'mode', p_event.registration_mode, 'state', private.event_registration_state(p_event),
      'opens_at', p_event.registration_opens_at, 'closes_at', private.event_registration_closes(p_event),
      'capacity', p_event.capacity, 'confirmed', p_event.confirmed_count,
      'waitlist_enabled', p_event.waitlist_enabled, 'waitlist', p_event.waitlist_count),
    'pinned', p_event.pinned_at is not null,
    'prominence', p_event.prominence,
    'created_by_name', private.person_name(p_event.created_by), 'created_by_you', p_event.created_by = p_actor,
    'updated_at', p_event.updated_at,
    'updated_by_name', case when p_event.updated_by is null then null else private.person_name(p_event.updated_by) end,
    -- Operational health: messages to participants not delivered by e-mail yet.
    'emails', (select jsonb_build_object(
                 'pending', count(*) filter (where d.status in ('queued', 'processing', 'failed_retryable')),
                 'failed', count(*) filter (where d.status in ('failed_permanent', 'suppressed')))
                 from public.notifications n join public.notification_deliveries d on d.notification_id = n.id
                where n.event_id = p_event.id),
    'is_public', private.event_is_public(p_event),
    'blocker', private.event_blocker(p_event));
$$;

