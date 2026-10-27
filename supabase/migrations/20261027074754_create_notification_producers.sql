-- Phase 10 · Who gets told what: broadcasts (BDE announcements, association
-- messages, followed updates), the producers that did not exist before
-- (governance, publishing, account security), the one-minute dispatch, the
-- schedules and the privileges of every Phase 10 function.

-- ---- Broadcasts ----------------------------------------------------------------------------------------------

-- Who may write to an audience on behalf of an organization:
--   all_students: the BDE only, with platform.communications.broadcast;
--   members / followers: communications.send in that organization (or, for
--   the BDE's own members and followers, the BDE broadcast key).
-- The guardian and the privacy officer hold neither.
create or replace function private.can_broadcast(p_actor uuid, p_organization_id uuid, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
     where o.id = p_organization_id and o.status = 'active'
       and case p_audience
             when 'all_students' then o.kind = 'bde'
                                      and private.user_has_platform_permission(p_actor, 'platform.communications.broadcast', now())
             when 'members' then private.user_has_organization_permission(p_actor, o.id, 'communications.send', now())
                                 or (o.kind = 'bde' and private.user_has_platform_permission(p_actor, 'platform.communications.broadcast', now()))
             when 'followers' then private.user_has_organization_permission(p_actor, o.id, 'communications.send', now())
                                   or (o.kind = 'bde' and private.user_has_platform_permission(p_actor, 'platform.communications.broadcast', now()))
             else false end);
$$;

-- How the actor acted, for the audit: the BDE key, or their position or delegation.
create or replace function private.broadcast_authority(p_actor uuid, p_organization_id uuid, p_audience text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_audience = 'all_students'
                   or not private.user_has_organization_permission(p_actor, p_organization_id, 'communications.send', now())
              then 'bde'
              else private.authority_for(p_actor, p_organization_id, 'communications.send') end;
$$;

-- The people an audience means right now (resolved here, never sent by a browser).
create or replace function private.broadcast_audience(p_organization_id uuid, p_audience text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
   where p_audience = 'all_students' and p.onboarding_completed_at is not null
  union
  select m.user_id from public.memberships m
   where p_audience = 'members' and m.organization_id = p_organization_id and m.status = 'active'
  union
  select f.user_id from public.notification_follows f
   where p_audience = 'followers' and f.organization_id = p_organization_id;
$$;

create or replace function private.broadcast_kind(p_audience text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_audience when 'all_students' then 'campus_announcement'
                         when 'members' then 'association_message'
                         when 'followers' then 'followed_announcement' end;
$$;

-- Is the person still part of the audience (checked again when dispatched)?
create or replace function private.broadcast_still_eligible(p_broadcast public.notification_broadcasts, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_broadcast.audience
           when 'all_students' then exists (select 1 from public.profiles p where p.id = p_user and p.onboarding_completed_at is not null)
           when 'members' then exists (select 1 from public.memberships m where m.user_id = p_user
                                         and m.organization_id = p_broadcast.organization_id and m.status = 'active')
           when 'followers' then exists (select 1 from public.notification_follows f where f.user_id = p_user
                                           and f.organization_id = p_broadcast.organization_id)
           else false end;
$$;

-- How many people, and how many would get an e-mail today (their choices).
create or replace function private.broadcast_estimate(p_organization_id uuid, p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'recipients', count(*),
    'email', count(*) filter (where private.notification_email_wanted(a.id, t.topic)))
    from private.broadcast_audience(p_organization_id, p_audience) a(id)
    cross join (select topic from public.notification_types where key = private.broadcast_kind(p_audience)) t;
$$;

-- What the caller may send for an organization, with today's limits.
create or replace function public.notification_broadcast_options(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_options jsonb := '[]'::jsonb;
  v_audience text;
  v_sent integer;
begin
  foreach v_audience in array array['all_students', 'members', 'followers'] loop
    if private.can_broadcast(v_actor, p_organization_id, v_audience) then
      v_options := v_options || jsonb_build_object('audience', v_audience) || private.broadcast_estimate(p_organization_id, v_audience);
    end if;
  end loop;
  if jsonb_array_length(v_options) = 0 then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  select count(*) into v_sent from public.notification_broadcasts
   where organization_id = p_organization_id and origin = 'person'
     and status in ('pending_approval', 'queued', 'dispatching', 'dispatched') and submitted_at > now() - interval '24 hours';
  return jsonb_build_object('options', v_options, 'sent_last_24h', v_sent,
                            'limit_per_day', case when (select kind from public.organizations where id = p_organization_id) = 'bde' then 3 else 5 end);
end;
$$;

-- A draft: nothing is sent until it is submitted (and approved, for a
-- campus-wide e-mail). Plain text, a link only to a public page of the site,
-- "important" only for a BDE announcement to everyone. The same text twice
-- in a week is refused.
create or replace function public.create_notification_broadcast(
  p_organization_id uuid, p_audience text, p_title text, p_body text, p_link_path text default null,
  p_email boolean default false, p_importance text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text := left(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), 200);
  v_body text := btrim(replace(coalesce(p_body, ''), E'\r\n', E'\n'));
  v_link text := nullif(btrim(coalesce(p_link_path, '')), '');
  v_importance text := coalesce(nullif(p_importance, ''), 'normal');
  v_fingerprint text;
  v_id uuid;
begin
  if p_audience not in ('all_students', 'members', 'followers') then
    raise exception 'audience_invalid' using errcode = 'P0001';
  end if;
  if not private.can_broadcast(v_actor, p_organization_id, p_audience) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if char_length(v_title) not between 3 and 120 or char_length(v_body) not between 1 and 2000 then
    raise exception 'broadcast_invalid' using errcode = 'P0001';
  end if;
  if v_link is not null and v_link !~ '^/(events|campus|associations|recruitment)/[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'link_invalid' using errcode = 'P0001';
  end if;
  if v_importance not in ('normal', 'important') or (v_importance = 'important' and p_audience <> 'all_students') then
    raise exception 'importance_not_allowed' using errcode = 'P0001';
  end if;
  v_fingerprint := md5(p_audience || '|' || lower(v_title) || '|' || lower(v_body));
  if exists (select 1 from public.notification_broadcasts b
              where b.organization_id = p_organization_id and b.fingerprint = v_fingerprint and b.status <> 'cancelled'
                and b.created_at > now() - interval '7 days') then
    raise exception 'broadcast_duplicate' using errcode = 'P0001';
  end if;
  insert into public.notification_broadcasts (organization_id, origin, kind, audience, email, importance, title, body, link_path,
                                              needs_approval, created_by, fingerprint)
  values (p_organization_id, 'person', private.broadcast_kind(p_audience), p_audience, coalesce(p_email, false), v_importance,
          v_title, v_body, v_link, p_audience = 'all_students' and coalesce(p_email, false), v_actor, v_fingerprint)
  returning id into v_id;
  perform private.log_governance_event(
    v_actor, private.broadcast_authority(v_actor, p_organization_id, p_audience),
    'notification_broadcast_created', 'communications', p_organization_id, null, 'notification_broadcast', v_id,
    jsonb_build_object('audience', p_audience, 'email', coalesce(p_email, false), 'importance', v_importance));
  return jsonb_build_object('id', v_id) || private.broadcast_estimate(p_organization_id, p_audience);
end;
$$;

-- Submitting freezes the audience (user ids, never shown) and queues it, or
-- waits for a second BDE approval for a campus-wide e-mail. Limits: 3 per
-- day for the BDE, 5 per association, 5 000 people for members or
-- followers. A repeated click returns the same state.
create or replace function public.submit_notification_broadcast(p_id uuid, p_scheduled_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_b public.notification_broadcasts%rowtype;
  v_org_kind text;
  v_sent integer;
  v_count integer;
begin
  select * into v_b from public.notification_broadcasts where id = p_id and origin = 'person' for update;
  if not found or v_b.created_by is distinct from v_actor then
    raise exception 'broadcast_not_found' using errcode = 'P0001';
  end if;
  if v_b.status in ('pending_approval', 'queued', 'dispatching', 'dispatched') then
    return jsonb_build_object('status', v_b.status, 'recipients', v_b.recipient_count, 'already', true);
  end if;
  if v_b.status <> 'draft' then
    raise exception 'broadcast_closed' using errcode = 'P0001';
  end if;
  if not private.can_broadcast(v_actor, v_b.organization_id, v_b.audience) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  if v_b.email or v_b.audience = 'all_students' then
    perform private.require_aal2();
  end if;
  if p_scheduled_at is not null and (p_scheduled_at < now() - interval '5 minutes' or p_scheduled_at > now() + interval '30 days') then
    raise exception 'schedule_invalid' using errcode = 'P0001';
  end if;
  select kind into v_org_kind from public.organizations where id = v_b.organization_id;
  select count(*) into v_sent from public.notification_broadcasts
   where organization_id = v_b.organization_id and origin = 'person'
     and status in ('pending_approval', 'queued', 'dispatching', 'dispatched') and submitted_at > now() - interval '24 hours';
  if v_sent >= (case when v_org_kind = 'bde' then 3 else 5 end) then
    raise exception 'broadcast_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.notification_broadcast_recipients (broadcast_id, user_id)
  select v_b.id, a.id from private.broadcast_audience(v_b.organization_id, v_b.audience) a(id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    delete from public.notification_broadcast_recipients where broadcast_id = v_b.id;
    raise exception 'broadcast_no_recipient' using errcode = 'P0001';
  end if;
  if v_b.audience <> 'all_students' and v_count > 5000 then
    delete from public.notification_broadcast_recipients where broadcast_id = v_b.id;
    raise exception 'broadcast_too_large' using errcode = 'P0001';
  end if;

  update public.notification_broadcasts
     set status = case when needs_approval then 'pending_approval' else 'queued' end,
         submitted_at = now(), scheduled_at = p_scheduled_at, recipient_count = v_count, version = version + 1
   where id = v_b.id
  returning * into v_b;
  perform private.log_governance_event(
    v_actor, private.broadcast_authority(v_actor, v_b.organization_id, v_b.audience),
    'notification_broadcast_submitted', 'communications', v_b.organization_id, null, 'notification_broadcast', v_b.id,
    jsonb_build_object('audience', v_b.audience, 'email', v_b.email, 'recipients', v_count, 'needs_approval', v_b.needs_approval,
                       'scheduled_at', p_scheduled_at));
  return jsonb_build_object('status', v_b.status, 'recipients', v_count);
end;
$$;

-- The second BDE approval of a campus-wide e-mail: another holder of the
-- broadcast key, with the second factor.
create or replace function public.approve_notification_broadcast(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_b public.notification_broadcasts%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.communications.broadcast');
  perform private.require_aal2();
  select * into v_b from public.notification_broadcasts where id = p_id and origin = 'person' for update;
  if not found then
    raise exception 'broadcast_not_found' using errcode = 'P0001';
  end if;
  if v_b.status in ('queued', 'dispatching', 'dispatched') and v_b.approved_by = v_actor then
    return jsonb_build_object('status', v_b.status, 'already', true);
  end if;
  if v_b.status <> 'pending_approval' then
    raise exception 'broadcast_closed' using errcode = 'P0001';
  end if;
  if v_b.created_by = v_actor then
    raise exception 'approver_must_differ' using errcode = 'P0001';
  end if;
  update public.notification_broadcasts
     set status = 'queued', approved_by = v_actor, approved_at = now(), version = version + 1
   where id = p_id;
  perform private.log_governance_event(
    v_actor, 'bde', 'notification_broadcast_approved', 'communications', v_b.organization_id, null, 'notification_broadcast', p_id,
    jsonb_build_object('audience', v_b.audience, 'email', v_b.email, 'recipients', v_b.recipient_count));
  return jsonb_build_object('status', 'queued');
end;
$$;

-- Cancelled before it is out (or while it goes out: the rest is not sent).
create or replace function public.cancel_notification_broadcast(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_b public.notification_broadcasts%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v_b from public.notification_broadcasts where id = p_id and origin = 'person' for update;
  if not found or not (v_b.created_by = v_actor or private.can_broadcast(v_actor, v_b.organization_id, v_b.audience)) then
    raise exception 'broadcast_not_found' using errcode = 'P0001';
  end if;
  if v_b.status in ('dispatched', 'cancelled') then
    raise exception 'broadcast_closed' using errcode = 'P0001';
  end if;
  if v_b.status <> 'draft' and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.notification_broadcasts
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = left(v_reason, 500), version = version + 1
   where id = p_id;
  if v_b.status <> 'draft' then
    perform private.log_governance_event(
      v_actor, private.broadcast_authority(v_actor, v_b.organization_id, v_b.audience),
      'notification_broadcast_cancelled', 'communications', v_b.organization_id, null, 'notification_broadcast', p_id,
      jsonb_build_object('previous_status', v_b.status), v_reason);
  end if;
end;
$$;

-- An organization's messages and how they went out (counts only).
create or replace function public.organization_broadcasts(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_approver boolean := private.user_has_platform_permission(v_actor, 'platform.communications.broadcast', now());
begin
  if not (private.can_broadcast(v_actor, p_organization_id, 'members') or private.can_broadcast(v_actor, p_organization_id, 'followers')
          or private.can_broadcast(v_actor, p_organization_id, 'all_students')) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'audience', b.audience, 'kind', b.kind, 'title', b.title, 'body', b.body, 'link_path', b.link_path,
             'email', b.email, 'importance', b.importance, 'status', b.status, 'needs_approval', b.needs_approval,
             'mine', b.created_by = v_actor,
             'can_approve', v_approver and b.status = 'pending_approval' and b.created_by is distinct from v_actor,
             'created_by_name', case when b.created_by is null then null else private.person_name(b.created_by) end,
             'approved_by_name', case when b.approved_by is null then null else private.person_name(b.approved_by) end,
             'created_at', b.created_at, 'submitted_at', b.submitted_at, 'approved_at', b.approved_at, 'scheduled_at', b.scheduled_at,
             'dispatched_at', b.dispatched_at, 'cancelled_at', b.cancelled_at, 'cancel_reason', b.cancel_reason,
             'recipients', b.recipient_count,
             'stats', (select jsonb_build_object(
                         'notified', count(distinct n.id),
                         'read', count(distinct n.id) filter (where n.read_at is not null and n.archived_at is null),
                         'email_queued', count(d.id) filter (where d.status in ('queued', 'processing', 'failed_retryable')),
                         'email_accepted', count(d.id) filter (where d.status in ('provider_accepted', 'delivered')),
                         'email_failed', count(d.id) filter (where d.status in ('failed_permanent', 'suppressed')))
                         from public.notifications n left join public.notification_deliveries d on d.notification_id = n.id
                        where n.broadcast_id = b.id))
             order by b.created_at desc)
      from (select * from public.notification_broadcasts
             where organization_id = p_organization_id and origin = 'person'
             order by created_at desc limit 50) b), '[]'::jsonb);
end;
$$;

-- Works through queued broadcasts in bounded batches (the one-minute job):
-- each person is checked again (still a member, still following, still a
-- student), then notified through private.notify (their choices apply, the
-- key makes it idempotent). A system broadcast whose subject is no longer
-- public is dropped. The audience of a system broadcast is frozen here.
create or replace function private.dispatch_notification_broadcasts(p_batch integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.notification_broadcasts%rowtype;
  v_user uuid;
  v_org record;
  v_done integer := 0;
  v_public boolean;
  v_count integer;
begin
  for v_b in
    select * from public.notification_broadcasts
     where status in ('queued', 'dispatching') and coalesce(scheduled_at, now()) <= now()
     order by coalesce(scheduled_at, submitted_at, created_at)
     limit 5
     for update skip locked
  loop
    if v_b.origin = 'system' then
      v_public := case v_b.source_type
        when 'post' then exists (select 1 from public.posts p where p.id = v_b.source_id and p.publication = 'published' and p.hidden_at is null)
        when 'event' then exists (select 1 from public.events e where e.id = v_b.source_id and private.event_is_public(e)
                                     and e.status = 'scheduled')
        when 'recruitment_campaign' then exists (select 1 from public.recruitment_campaigns c where c.id = v_b.source_id
                                                    and private.campaign_is_public(c))
        else false end;
      if not v_public then
        update public.notification_broadcasts set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Plus en ligne.'
         where id = v_b.id;
        continue;
      end if;
      if v_b.recipient_count is null then
        insert into public.notification_broadcast_recipients (broadcast_id, user_id)
        select v_b.id, a.id from private.broadcast_audience(v_b.organization_id, v_b.audience) a(id)
        on conflict do nothing;
        get diagnostics v_count = row_count;
        update public.notification_broadcasts set recipient_count = v_count where id = v_b.id;
      end if;
    end if;
    if v_b.status = 'queued' then
      update public.notification_broadcasts set status = 'dispatching', dispatch_started_at = now() where id = v_b.id;
    end if;
    select o.slug, coalesce(o.short_name, o.name) as name into v_org from public.organizations o where o.id = v_b.organization_id;

    for v_user in
      select r.user_id from public.notification_broadcast_recipients r
       where r.broadcast_id = v_b.id and r.dispatched_at is null
       limit greatest(coalesce(p_batch, 500), 1)
       for update skip locked
    loop
      if private.broadcast_still_eligible(v_b, v_user) then
        perform private.notify(v_user, v_b.kind, 'broadcast:' || v_b.id || ':' || v_user,
          jsonb_build_object('title', v_b.title, 'body', v_b.body, 'link', v_b.link_path,
                             'organization', v_org.name, 'organization_slug', v_org.slug) || v_b.payload,
          v_b.organization_id, 'broadcast', v_b.id, null, null, v_b.id,
          case when v_b.importance = 'important' then 'important' end, v_b.email);
      end if;
      update public.notification_broadcast_recipients set dispatched_at = now() where broadcast_id = v_b.id and user_id = v_user;
      v_done := v_done + 1;
    end loop;

    if not exists (select 1 from public.notification_broadcast_recipients r where r.broadcast_id = v_b.id and r.dispatched_at is null) then
      update public.notification_broadcasts set status = 'dispatched', dispatched_at = now() where id = v_b.id;
      if v_b.origin = 'person' then
        perform private.log_governance_event(
          null, 'scheduler', 'notification_broadcast_dispatched', 'communications', v_b.organization_id, null,
          'notification_broadcast', v_b.id,
          jsonb_build_object('recipients', v_b.recipient_count,
                             'notified', (select count(*) from public.notifications n where n.broadcast_id = v_b.id)));
      end if;
    end if;
  end loop;
  return v_done;
end;
$$;

-- The one-minute job: broadcasts out, then the worker woken if e-mails are due.
create or replace function private.run_notification_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispatched integer;
  v_kicked boolean;
begin
  v_dispatched := private.dispatch_notification_broadcasts();
  v_kicked := private.kick_notification_worker();
  return jsonb_build_object('dispatched', v_dispatched, 'worker_called', v_kicked);
end;
$$;

-- ---- Followed associations: a first publication, told to its followers ------------------------------------

create or replace function private.queue_followed_update(p_kind text, p_organization_id uuid, p_source_type text, p_source_id uuid,
                                                         p_title text, p_link text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_broadcasts (organization_id, origin, kind, audience, email, title, link_path, source_type,
                                              source_id, payload, status, submitted_at, fingerprint)
  select p_organization_id, 'system', p_kind, 'followers', true, left(coalesce(nullif(btrim(p_title), ''), 'Sans titre'), 120),
         p_link, p_source_type, p_source_id, coalesce(p_payload, '{}'::jsonb), 'queued', now(),
         md5(p_kind || '|' || p_source_id)
   where exists (select 1 from public.notification_follows f where f.organization_id = p_organization_id)
  on conflict (kind, source_id) where origin = 'system' do nothing;
$$;

create or replace function private.on_post_first_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.first_published_at is null and new.first_published_at is not null and new.slug is not null then
    perform private.queue_followed_update('followed_post_published', new.organization_id, 'post', new.id,
      (select r.title from public.post_revisions r where r.id = new.published_revision_id),
      '/campus/' || new.slug, jsonb_build_object('slug', new.slug));
  end if;
  return null;
end;
$$;

create trigger notify_followers_on_first_publication
  after update of first_published_at on public.posts
  for each row execute function private.on_post_first_published();

create or replace function private.on_event_first_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.first_published_at is null and new.first_published_at is not null and new.slug is not null then
    perform private.queue_followed_update('followed_event_published', new.organization_id, 'event', new.id, new.title,
      '/events/' || new.slug, jsonb_build_object('slug', new.slug, 'starts_at', new.starts_at));
  end if;
  return null;
end;
$$;

create trigger notify_followers_on_first_publication
  after update of first_published_at on public.events
  for each row execute function private.on_event_first_published();

create or replace function private.on_campaign_first_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.first_published_at is null and new.first_published_at is not null and new.slug is not null then
    perform private.queue_followed_update('followed_recruitment_opened', new.organization_id, 'recruitment_campaign', new.id, new.title,
      '/recruitment/' || new.slug, jsonb_build_object('slug', new.slug, 'closes_at', new.closes_at));
  end if;
  return null;
end;
$$;

create trigger notify_followers_on_first_publication
  after update of first_published_at on public.recruitment_campaigns
  for each row execute function private.on_campaign_first_published();

-- ---- Governance ------------------------------------------------------------------------------------------------

create or replace function private.org_name(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.short_name, o.name) from public.organizations o where o.id = p_organization_id;
$$;

-- An invitation: the invited person (if they already have an account) and,
-- once answered, the person who sent it.
create or replace function private.on_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_slug text;
begin
  select slug into v_slug from public.organizations where id = new.organization_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    select u.id into v_user from auth.users u where lower(u.email) = new.email;
    perform private.notify(v_user, 'governance_invitation_received', 'invitation:' || new.id || ':' || coalesce(v_user::text, ''),
      jsonb_build_object('organization', private.org_name(new.organization_id), 'slug', v_slug,
                         'position', (select p.title from public.positions p where p.id = new.position_id),
                         'by_name', private.person_name(new.invited_by)),
      new.organization_id, 'invitation', new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    select u.id into v_user from auth.users u where lower(u.email) = new.email;
    perform private.notify(new.invited_by, 'governance_invitation_answered', 'invitation:' || new.id || ':answered',
      jsonb_build_object('organization', private.org_name(new.organization_id), 'slug', v_slug, 'answer', new.status,
                         'person', case when v_user is null then null else private.person_name(v_user) end),
      new.organization_id, 'invitation', new.id);
  end if;
  return null;
end;
$$;

create trigger notify_on_invitation_change
  after insert or update of status on public.organization_invitations
  for each row execute function private.on_invitation_change();

-- A presidency proposed to someone.
create or replace function private.on_transition_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.leadership_transitions%rowtype;
begin
  select * into v_t from public.leadership_transitions where id = new.transition_id;
  perform private.notify(new.user_id, 'governance_candidacy_received', 'candidacy:' || new.transition_id || ':' || new.office || ':' || new.user_id,
    jsonb_build_object('organization', private.org_name(v_t.organization_id), 'office', new.office, 'kind', v_t.kind,
                       'by_name', private.person_name(v_t.proposed_by), 'expires_at', v_t.expires_at),
    v_t.organization_id, 'transition', v_t.id);
  return null;
end;
$$;

create trigger notify_candidate
  after insert on public.leadership_transition_candidates
  for each row execute function private.on_transition_candidate();

-- A BDE handover waits for the other office's approval (and the guardian's,
-- for a recovery); a completed or closed transition is told to the people
-- involved, and a completed one to the organization's members (in-app).
create or replace function private.on_transition_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_payload jsonb := jsonb_build_object('organization', private.org_name(new.organization_id), 'kind', new.kind,
                                        'slug', (select slug from public.organizations where id = new.organization_id));
begin
  if tg_op = 'INSERT' and new.kind in ('bde_succession', 'bde_recovery') then
    for v_user in
      select distinct a.user_id from public.position_assignments a
       where a.organization_id = new.organization_id and a.office in ('bde_president', 'bde_vice_president')
         and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at
      union
      select g.user_id from public.platform_assignments g
       where new.kind = 'bde_recovery' and g.role = 'guardian' and g.status = 'active' and g.starts_at <= now() and now() < g.ends_at
    loop
      if v_user is distinct from new.proposed_by then
        perform private.notify(v_user, 'governance_approval_required', 'approval:' || new.id || ':' || v_user,
          v_payload || jsonb_build_object('by_name', private.person_name(new.proposed_by), 'expires_at', new.expires_at),
          new.organization_id, 'transition', new.id);
      end if;
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'open' and new.status in ('completed', 'cancelled', 'expired') then
    for v_user in
      select c.user_id from public.leadership_transition_candidates c where c.transition_id = new.id
      union select new.proposed_by
    loop
      perform private.notify(v_user,
        case when new.status = 'completed' then 'governance_transition_completed' else 'governance_transition_closed' end,
        'transition:' || new.id || ':' || new.status || ':' || v_user, v_payload || jsonb_build_object('status', new.status),
        new.organization_id, 'transition', new.id);
    end loop;
    if new.status = 'completed' then
      for v_user in
        select m.user_id from public.memberships m where m.organization_id = new.organization_id and m.status = 'active'
      loop
        perform private.notify(v_user, 'governance_transition_completed', 'transition:' || new.id || ':completed:' || v_user,
          v_payload || jsonb_build_object('status', new.status, 'member', true),
          new.organization_id, 'transition', new.id, null, null, null, null, false);
      end loop;
    end if;
  end if;
  return null;
end;
$$;

create trigger notify_on_transition_change
  after insert or update of status on public.leadership_transitions
  for each row execute function private.on_transition_change();

-- ---- Account security --------------------------------------------------------------------------------------------

-- Does a position carry an office or a key that matters for security?
create or replace function private.position_is_sensitive(p_position_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.positions p where p.id = p_position_id and p.office is not null)
      or exists (select 1 from public.position_permissions pp
                   join public.permissions k on k.key = pp.permission_key
                  where pp.position_id = p_position_id
                    and (k.is_sensitive or k.scope = 'platform'
                         or k.key in ('members.manage', 'positions.manage', 'positions.assign', 'delegations.manage', 'governance.succession')));
$$;

create or replace function private.on_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    v_change := 'granted';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status in ('ended', 'cancelled') then
    v_change := 'removed';
  else
    return null;
  end if;
  if not private.position_is_sensitive(new.position_id) then
    return null;
  end if;
  perform private.notify(new.user_id, 'account_privilege_changed', 'privilege:' || new.id || ':' || v_change,
    jsonb_build_object('organization', private.org_name(new.organization_id), 'change', v_change,
                       'position', (select p.title from public.positions p where p.id = new.position_id),
                       'office', new.office, 'starts_at', new.starts_at, 'ends_at', new.ends_at),
    new.organization_id, 'assignment', new.id);
  return null;
end;
$$;

create trigger notify_on_assignment_change
  after insert or update of status on public.position_assignments
  for each row execute function private.on_assignment_change();

create or replace function private.on_platform_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change text;
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    v_change := 'granted';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status in ('ended', 'cancelled') then
    v_change := 'removed';
  else
    return null;
  end if;
  perform private.notify(new.user_id, 'account_platform_role_changed', 'platform_role:' || new.id || ':' || v_change,
    jsonb_build_object('role', new.role, 'change', v_change, 'starts_at', new.starts_at, 'ends_at', new.ends_at),
    null, 'platform_assignment', new.id);
  return null;
end;
$$;

create trigger notify_on_platform_assignment_change
  after insert or update of status on public.platform_assignments
  for each row execute function private.on_platform_assignment_change();

-- The second factor turned on (a factor verified) or off (a verified factor removed).
create or replace function private.on_mfa_factor_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from 'verified' and new.status = 'verified' then
    perform private.notify(new.user_id, 'account_mfa_enabled', 'mfa:' || new.id || ':enabled', '{}'::jsonb, null, 'account', new.id);
  elsif tg_op = 'DELETE' and old.status = 'verified' then
    perform private.notify(old.user_id, 'account_mfa_disabled', 'mfa:' || old.id || ':disabled', '{}'::jsonb, null, 'account', old.id);
  end if;
  return null;
end;
$$;

do $mfa$
begin
  create trigger notify_on_mfa_factor_change
    after update of status or delete on auth.mfa_factors
    for each row execute function private.on_mfa_factor_change();
exception when insufficient_privilege then
  raise notice 'auth.mfa_factors: trigger not created (insufficient privilege)';
end;
$mfa$;

-- ---- Publishing ----------------------------------------------------------------------------------------------------

-- A revision submitted for review: the people who may approve it (not its author).
create or replace function private.on_revision_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts%rowtype;
  v_slug text;
begin
  if not (old.status is distinct from 'submitted' and new.status = 'submitted') then
    return null;
  end if;
  select * into v_post from public.posts where id = new.post_id;
  select slug into v_slug from public.organizations where id = v_post.organization_id;
  perform private.notify(m.user_id, 'content_approval_requested', 'post_submitted:' || new.id || ':' || m.user_id,
    jsonb_build_object('title', new.title, 'post_id', new.post_id, 'organization', private.org_name(v_post.organization_id),
                       'slug', v_slug, 'by_name', case when new.submitted_by is null then null else private.person_name(new.submitted_by) end),
    v_post.organization_id, 'post', new.post_id)
    from public.memberships m
   where m.organization_id = v_post.organization_id and m.status = 'active'
     and m.user_id is distinct from new.submitted_by
     and private.user_has_organization_permission(m.user_id, v_post.organization_id, 'posts.approve', now());
  return null;
end;
$$;

create trigger notify_on_revision_submitted
  after update of status on public.post_revisions
  for each row execute function private.on_revision_status_change();

-- A review decided: the author who submitted it.
create or replace function private.on_post_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.post_revisions%rowtype;
  v_post public.posts%rowtype;
begin
  if new.decision not in ('approved', 'changes_requested') then
    return null;
  end if;
  select * into v_rev from public.post_revisions where id = new.revision_id;
  select * into v_post from public.posts where id = new.post_id;
  if v_rev.submitted_by is null or v_rev.submitted_by = new.reviewer_id then
    return null;
  end if;
  perform private.notify(v_rev.submitted_by, 'content_review_done', 'post_review:' || new.id,
    jsonb_build_object('title', v_rev.title, 'post_id', new.post_id, 'decision', new.decision,
                       'organization', private.org_name(v_post.organization_id),
                       'slug', (select slug from public.organizations where id = v_post.organization_id),
                       'by_name', private.person_name(new.reviewer_id)),
    v_post.organization_id, 'post', new.post_id);
  return null;
end;
$$;

create trigger notify_on_post_review
  after insert on public.post_reviews
  for each row execute function private.on_post_review();

-- A scheduled publication that failed, and a post hidden or restored by the
-- BDE: the people who scheduled or wrote it and those who may publish.
create or replace function private.on_post_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_slug text;
  v_user uuid;
begin
  select r.title into v_title from public.post_revisions r where r.id = new.working_revision_id;
  select slug into v_slug from public.organizations where id = new.organization_id;
  if old.schedule_status is distinct from 'failed' and new.schedule_status = 'failed' then
    for v_user in select distinct x from unnest(array[new.scheduled_by, new.created_by]) x where x is not null loop
      perform private.notify(v_user, 'content_schedule_failed',
        'post_schedule:' || new.id || ':' || extract(epoch from coalesce(new.scheduled_at, now()))::bigint || ':' || v_user,
        jsonb_build_object('title', v_title, 'post_id', new.id, 'error', new.schedule_error,
                           'organization', private.org_name(new.organization_id), 'slug', v_slug),
        new.organization_id, 'post', new.id);
    end loop;
  end if;
  if (old.hidden_at is null) <> (new.hidden_at is null) then
    for v_user in
      select new.created_by
      union
      select m.user_id from public.memberships m
       where m.organization_id = new.organization_id and m.status = 'active'
         and private.user_has_organization_permission(m.user_id, new.organization_id, 'posts.publish', now())
    loop
      perform private.notify(v_user, 'content_moderated',
        'post_moderation:' || new.id || ':' || extract(epoch from coalesce(new.hidden_at, now()))::bigint || ':' ||
          case when new.hidden_at is null then 'restored' else 'hidden' end || ':' || v_user,
        jsonb_build_object('title', v_title, 'post_id', new.id, 'hidden', new.hidden_at is not null,
                           'organization', private.org_name(new.organization_id), 'slug', v_slug),
        new.organization_id, 'post', new.id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger notify_on_post_change
  after update of schedule_status, hidden_at on public.posts
  for each row execute function private.on_post_change();

-- ---- The Phase 7 worker functions are gone (replaced by the Edge Function's steps) --------------------------

drop function if exists public.claim_notification_emails(integer);
drop function if exists public.complete_notification_email(bigint, boolean, text);

-- ---- Schedules ---------------------------------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from cron.job where jobname = 'enqueue-event-reminders') then
      perform cron.unschedule('enqueue-event-reminders');
    end if;
    perform cron.schedule('notification-reminders', '*/15 * * * *', 'select private.enqueue_due_reminders()');
    perform cron.schedule('notifications-dispatch', '* * * * *', 'select private.run_notification_dispatch()');
    perform cron.schedule('notification-retention', '40 3 * * *', 'select private.purge_notifications()');
  end if;
end;
$cron$;

-- ---- Privileges ----------------------------------------------------------------------------------------------------

revoke all on function private.notification_choice(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.notify(uuid, text, text, jsonb, uuid, text, uuid, uuid, uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function private.notification_item(public.notifications) from public, anon, authenticated, service_role;
revoke all on function private.email_hash(text) from public, anon, authenticated, service_role;
revoke all on function private.log_preference_change(uuid, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.notification_secret(text) from public, anon, authenticated, service_role;
revoke all on function private.notification_token_ok(text, text) from public, anon, authenticated, service_role;
revoke all on function private.notification_worker_config() from public, anon, authenticated, service_role;
revoke all on function private.notification_email_wanted(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.notification_quiet_until(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.notification_obsolete(bigint) from public, anon, authenticated, service_role;
revoke all on function private.claim_notification_deliveries(integer) from public, anon, authenticated, service_role;
revoke all on function private.complete_notification_delivery(bigint, text, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function private.capture_notification_email(bigint, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.start_notification_run(text) from public, anon, authenticated, service_role;
revoke all on function private.finish_notification_run(bigint, integer, integer, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function private.record_provider_event(text, text, text, text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_due_reminders() from public, anon, authenticated, service_role;
revoke all on function private.purge_notifications() from public, anon, authenticated, service_role;
revoke all on function private.kick_notification_worker() from public, anon, authenticated, service_role;
revoke all on function private.set_notification_config(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function private.can_broadcast(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.broadcast_authority(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.broadcast_audience(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.broadcast_kind(text) from public, anon, authenticated, service_role;
revoke all on function private.broadcast_still_eligible(public.notification_broadcasts, uuid) from public, anon, authenticated, service_role;
revoke all on function private.broadcast_estimate(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.dispatch_notification_broadcasts(integer) from public, anon, authenticated, service_role;
revoke all on function private.run_notification_dispatch() from public, anon, authenticated, service_role;
revoke all on function private.queue_followed_update(text, uuid, text, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.on_post_first_published() from public, anon, authenticated, service_role;
revoke all on function private.on_event_first_published() from public, anon, authenticated, service_role;
revoke all on function private.on_campaign_first_published() from public, anon, authenticated, service_role;
revoke all on function private.org_name(uuid) from public, anon, authenticated, service_role;
revoke all on function private.on_invitation_change() from public, anon, authenticated, service_role;
revoke all on function private.on_transition_candidate() from public, anon, authenticated, service_role;
revoke all on function private.on_transition_change() from public, anon, authenticated, service_role;
revoke all on function private.position_is_sensitive(uuid) from public, anon, authenticated, service_role;
revoke all on function private.on_assignment_change() from public, anon, authenticated, service_role;
revoke all on function private.on_platform_assignment_change() from public, anon, authenticated, service_role;
revoke all on function private.on_mfa_factor_change() from public, anon, authenticated, service_role;
revoke all on function private.on_revision_status_change() from public, anon, authenticated, service_role;
revoke all on function private.on_post_review() from public, anon, authenticated, service_role;
revoke all on function private.on_post_change() from public, anon, authenticated, service_role;

revoke all on function public.my_notifications(text, text, timestamptz, bigint, integer) from public, anon;
revoke all on function public.my_notification_summary() from public, anon;
revoke all on function public.archive_notifications(bigint[], boolean) from public, anon;
revoke all on function public.open_notification(bigint) from public, anon;
revoke all on function public.my_notification_preferences() from public, anon;
revoke all on function public.set_notification_preference(text, boolean, boolean) from public, anon;
revoke all on function public.set_notification_settings(boolean, text, text, text) from public, anon;
revoke all on function public.follow_organization(uuid, boolean, text) from public, anon;
revoke all on function public.am_i_following(uuid) from public, anon;
revoke all on function public.clear_my_email_suppression() from public, anon;
revoke all on function public.peek_unsubscribe_token(text) from public;
revoke all on function public.unsubscribe_with_token(text) from public;
revoke all on function public.notification_health() from public, anon;
revoke all on function public.notification_failed_deliveries(integer, bigint) from public, anon;
revoke all on function public.retry_notification_delivery(bigint) from public, anon;
revoke all on function public.notification_broadcast_options(uuid) from public, anon;
revoke all on function public.create_notification_broadcast(uuid, text, text, text, text, boolean, text) from public, anon;
revoke all on function public.submit_notification_broadcast(uuid, timestamptz) from public, anon;
revoke all on function public.approve_notification_broadcast(uuid) from public, anon;
revoke all on function public.cancel_notification_broadcast(uuid, text) from public, anon;
revoke all on function public.organization_broadcasts(uuid) from public, anon;

grant execute on function public.my_notifications(text, text, timestamptz, bigint, integer) to authenticated;
grant execute on function public.my_notification_summary() to authenticated;
grant execute on function public.archive_notifications(bigint[], boolean) to authenticated;
grant execute on function public.open_notification(bigint) to authenticated;
grant execute on function public.my_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, boolean, boolean) to authenticated;
grant execute on function public.set_notification_settings(boolean, text, text, text) to authenticated;
grant execute on function public.follow_organization(uuid, boolean, text) to authenticated;
grant execute on function public.am_i_following(uuid) to authenticated;
grant execute on function public.clear_my_email_suppression() to authenticated;
grant execute on function public.peek_unsubscribe_token(text) to anon, authenticated;
grant execute on function public.unsubscribe_with_token(text) to anon, authenticated;
grant execute on function public.notification_health() to authenticated;
grant execute on function public.notification_failed_deliveries(integer, bigint) to authenticated;
grant execute on function public.retry_notification_delivery(bigint) to authenticated;
grant execute on function public.notification_broadcast_options(uuid) to authenticated;
grant execute on function public.create_notification_broadcast(uuid, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.submit_notification_broadcast(uuid, timestamptz) to authenticated;
grant execute on function public.approve_notification_broadcast(uuid) to authenticated;
grant execute on function public.cancel_notification_broadcast(uuid, text) to authenticated;
grant execute on function public.organization_broadcasts(uuid) to authenticated;
