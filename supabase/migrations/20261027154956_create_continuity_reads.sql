-- Phase 11 · What the continuity pages read, the weekly report, the
-- preparation checks that depend on operations, the security self-check,
-- the public heartbeat, and the schedules of every recurring job.
-- Each read is cut to its audience: the BDE sees governance and operations,
-- an association its own continuity, the guardian governance availability
-- and recovery only, the privacy officer one person's responsibilities.
-- None of them returns an applicant, a CV, an answer, a note, a participant
-- list, a secret or a provider credential.

-- ---- Shared pieces ----------------------------------------------------------------------------------------------

-- The declared backup checks, by kind: never · verified · partial · failed ·
-- stale (verified more than three months before the current academic year
-- began: to redo at each handover, the summer before counts).
create or replace function private.backup_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
           'kind', k.kind,
           'status', case when b.id is null then 'never'
                          when b.outcome <> 'verified' then b.outcome
                          when b.checked_on < coalesce((select y.starts_on - 92 from public.academic_years y where y.status = 'current'), b.checked_on)
                            then 'stale'
                          else 'verified' end,
           'checked_on', b.checked_on, 'environment', b.environment, 'method', b.method, 'notes', b.notes,
           'recorded_by_name', case when b.recorded_by is null then null else private.person_name(b.recorded_by) end)
           order by k.ord)
    from (values ('database_backups_available', 1), ('database_restore_test', 2), ('storage_copy_available', 3),
                 ('storage_restore_test', 4)) as k (kind, ord)
    left join lateral (select v.* from public.backup_verifications v where v.kind = k.kind
                        order by v.checked_on desc, v.recorded_at desc limit 1) b on true;
$$;

-- The last migration the database recorded (null when the history table is absent).
create or replace function private.applied_schema_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return null;
  end if;
  execute 'select max(version) from supabase_migrations.schema_migrations' into v;
  return v;
end;
$$;

create or replace function private.has_verified_mfa(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified');
$$;

-- An open transition, as the pages show it (names of candidates, given approvals).
create or replace function private.transition_summary(p_transition public.leadership_transitions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_transition.id is null then null else jsonb_build_object(
    'id', p_transition.id, 'kind', p_transition.kind, 'effective_at', p_transition.effective_at,
    'mandate_ends_at', p_transition.mandate_ends_at, 'expires_at', p_transition.expires_at, 'created_at', p_transition.created_at,
    'candidates', (select coalesce(jsonb_agg(jsonb_build_object('office', c.office, 'name', private.person_name(c.user_id),
                                                               'accepted', c.accepted) order by c.office), '[]'::jsonb)
                     from public.leadership_transition_candidates c where c.transition_id = p_transition.id),
    'approvals', (select coalesce(jsonb_agg(a.capacity order by a.capacity), '[]'::jsonb)
                    from public.leadership_transition_approvals a where a.transition_id = p_transition.id),
    'missing_approvals', (select i.details -> 'missing_approvals' from public.governance_issues i
                           where i.issue_key = 'transition_pending:' || p_transition.id and i.status = 'open')) end;
$$;

create or replace function private.issue_json(p_issue public.governance_issues)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', p_issue.id, 'kind', p_issue.kind, 'severity', p_issue.severity, 'audience', p_issue.audience,
                            'details', p_issue.details, 'first_detected_at', p_issue.first_detected_at,
                            'notified_at', p_issue.notified_at, 'escalated_at', p_issue.escalated_at);
$$;

-- ---- BDE: governance health (platform.organizations.manage) ------------------------------------------------

create or replace function public.governance_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_bde uuid := private.bde_organization_id();
  v_guardian uuid := private.guardian_user(now());
  v_check public.scheduled_jobs%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  select * into v_check from public.scheduled_jobs where job_key = 'governance-health';
  return jsonb_build_object(
    'generated_at', now(),
    'year', private.academic_year_json(private.current_academic_year()),
    'bde', (select jsonb_agg(jsonb_build_object(
                     'office', o.office,
                     'name', case when a.user_id is null then null else private.person_name(a.user_id) end,
                     'ends_at', a.ends_at,
                     'successor', case when a.id is null then null
                                       else (select private.person_name(s) from (select private.office_holder(v_bde, o.office, a.ends_at) as s) x
                                              where s is not null) end,
                     'ready', a.user_id is not null and private.has_verified_mfa(a.user_id))
                   order by o.ord)
              from (values ('bde_president', 1), ('bde_vice_president', 2)) as o (office, ord)
              left join lateral (select x.* from public.position_assignments x
                                  where x.organization_id = v_bde and x.office = o.office and x.status = 'active'
                                    and x.starts_at <= now() and now() < x.ends_at limit 1) a on true),
    'guardian', jsonb_build_object('configured', v_guardian is not null,
                                   'name', case when v_guardian is null then null else private.person_name(v_guardian) end,
                                   'ready', v_guardian is not null and private.has_verified_mfa(v_guardian)),
    'associations', (select jsonb_build_object(
                              'total', count(*),
                              'without_president', count(*) filter (where private.office_holder(o.id, 'association_president', now()) is null))
                       from public.organizations o where o.kind = 'association' and o.status = 'active'),
    'presidencies', (select coalesce(jsonb_agg(jsonb_build_object(
                                       'organization', o.name, 'slug', o.slug, 'name', private.person_name(a.user_id), 'ends_at', a.ends_at,
                                       'succession', private.handover_metric(o.id, 'succession') ->> 'state')
                                     order by a.ends_at), '[]'::jsonb)
                       from public.position_assignments a join public.organizations o on o.id = a.organization_id
                      where o.kind = 'association' and o.status = 'active' and a.office = 'association_president' and a.status = 'active'
                        and a.starts_at <= now() and now() < a.ends_at and a.ends_at <= now() + interval '60 days'),
    'mandates_expiring_30', (select count(*) from public.position_assignments a join public.organizations o on o.id = a.organization_id
                              where o.status = 'active' and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at
                                and a.ends_at <= now() + interval '30 days'),
    'transitions', (select coalesce(jsonb_agg(private.transition_summary(t) || jsonb_build_object('organization', o.name, 'slug', o.slug)
                                    order by t.effective_at), '[]'::jsonb)
                      from public.leadership_transitions t join public.organizations o on o.id = t.organization_id
                     where t.status = 'open' and t.expires_at > now()),
    'delegations', (select jsonb_build_object('active', count(*) filter (where d.status = 'active' and d.starts_at <= now() and now() < d.ends_at),
                                              'ended_30d', count(*) filter (where d.ends_at <= now() and d.ends_at > now() - interval '30 days'))
                      from public.delegations d),
    'officers_without_mfa', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'officer_mfa_missing'),
    'handovers_not_started', (select count(*) from public.position_assignments a join public.organizations o on o.id = a.organization_id
                               where o.kind = 'association' and o.status = 'active' and a.office = 'association_president'
                                 and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at and a.ends_at <= now() + interval '60 days'
                                 and not exists (select 1 from public.handover_checklist_items h
                                                  where h.organization_id = o.id and h.done
                                                    and h.academic_year_id = (select y.id from public.academic_years y where y.status = 'current'))),
    'issues', (select coalesce(jsonb_agg(private.issue_json(i) order by
                                         case i.severity when 'critical' then 0 when 'warning' then 1 else 2 end, i.first_detected_at), '[]'::jsonb)
                 from public.governance_issues i where i.status = 'open' and i.audience <> 'self' and i.kind <> 'job_unhealthy'),
    'check', jsonb_build_object('last_succeeded_at', v_check.last_succeeded_at,
                                'health', private.job_health(v_check, private.cron_status())));
end;
$$;

-- ---- An association's continuity (its own officers) ----------------------------------------------------------

create or replace function public.organization_continuity(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_year public.academic_years%rowtype := private.current_academic_year();
  v_president public.position_assignments%rowtype;
  v_transition public.leadership_transitions%rowtype;
  v_can_team boolean;
  v_areas text[];
begin
  select * into v_org from public.organizations where id = p_organization_id and kind = 'association';
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  v_areas := array(select a from unnest(array['presidence', 'communication', 'evenements', 'recrutement']) a
                    where private.user_has_organization_permission(v_actor, p_organization_id, private.handover_area_key(a), now()));
  v_can_team := private.user_has_organization_permission(v_actor, p_organization_id, 'members.view', now());
  if cardinality(v_areas) = 0
     and not private.user_has_organization_permission(v_actor, p_organization_id, 'governance.view', now())
     and not private.user_has_organization_permission(v_actor, p_organization_id, 'members.manage', now()) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;

  select * into v_president from public.position_assignments a
   where a.organization_id = p_organization_id and a.office = 'association_president' and a.status = 'active'
     and a.starts_at <= now() and now() < a.ends_at limit 1;
  select * into v_transition from public.leadership_transitions t
   where t.organization_id = p_organization_id and t.status = 'open' and t.expires_at > now() limit 1;

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'slug', v_org.slug, 'status', v_org.status),
    'year', private.academic_year_json(v_year),
    'president', case when v_president.id is null then null else jsonb_build_object(
                   'name', private.person_name(v_president.user_id), 'ends_at', v_president.ends_at, 'is_me', v_president.user_id = v_actor) end,
    'successor', case when v_president.id is null then null
                      else (select jsonb_build_object('name', private.person_name(s), 'renewal', s = v_president.user_id)
                              from (select private.office_holder(p_organization_id, 'association_president', v_president.ends_at) as s) x
                             where s is not null) end,
    'succession', private.handover_metric(p_organization_id, 'succession'),
    'transition', private.transition_summary(v_transition),
    'officers_expiring', case when v_can_team then (
        select coalesce(jsonb_agg(jsonb_build_object('name', private.person_name(a.user_id), 'position', p.title, 'ends_at', a.ends_at)
                                  order by a.ends_at), '[]'::jsonb)
          from public.position_assignments a join public.positions p on p.id = a.position_id
         where a.organization_id = p_organization_id and a.status = 'active' and a.starts_at <= now() and now() < a.ends_at
           and a.ends_at <= now() + interval '30 days') end,
    'counts', jsonb_build_object(
      'officers_expiring', private.handover_metric(p_organization_id, 'officers_expiring'),
      'scheduled_posts', private.handover_metric(p_organization_id, 'scheduled_posts'),
      'pending_posts', private.handover_metric(p_organization_id, 'pending_posts'),
      'upcoming_events', private.handover_metric(p_organization_id, 'upcoming_events'),
      'active_campaigns', private.handover_metric(p_organization_id, 'active_campaigns')),
    'handover', (select coalesce(jsonb_agg(jsonb_build_object(
                          'key', t.item_key, 'area', t.area, 'label', t.label, 'help', t.help,
                          'metric', case when t.metric is null then null else private.handover_metric(p_organization_id, t.metric) end,
                          'done', coalesce(h.done, false), 'note', h.note, 'updated_at', h.updated_at,
                          'assignee_id', h.assignee_user_id,
                          'assignee_name', case when h.assignee_user_id is null then null else private.person_name(h.assignee_user_id) end,
                          'can_edit', t.area = any (v_areas))
                        order by t.sort_order), '[]'::jsonb)
                   from public.handover_template_items t
                   left join public.handover_checklist_items h
                     on h.item_key = t.item_key and h.organization_id = p_organization_id and h.academic_year_id = v_year.id),
    'members', case when cardinality(v_areas) > 0 then (
        select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', private.person_name(m.user_id))
                                  order by private.person_name(m.user_id)), '[]'::jsonb)
          from public.memberships m where m.organization_id = p_organization_id and m.status = 'active') end,
    'issues', (select coalesce(jsonb_agg(private.issue_json(i) order by i.first_detected_at), '[]'::jsonb)
                 from public.governance_issues i
                where i.status = 'open' and i.organization_id = p_organization_id and i.audience in ('association', 'recruitment')),
    'can', jsonb_build_object(
      'succession', private.user_has_organization_permission(v_actor, p_organization_id, 'governance.succession', now()),
      'team', private.user_has_organization_permission(v_actor, p_organization_id, 'members.manage', now()),
      'areas', to_jsonb(v_areas)));
end;
$$;

-- ---- The guardian (platform.recovery): availability and recovery only ---------------------------------------

create or replace function public.guardian_continuity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_bde uuid := private.bde_organization_id();
  v_transition public.leadership_transitions%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.recovery');
  select * into v_transition from public.leadership_transitions t
   where t.organization_id = v_bde and t.status = 'open' and t.expires_at > now() limit 1;
  return jsonb_build_object(
    'generated_at', now(),
    'offices', (select jsonb_agg(jsonb_build_object(
                         'office', o.office,
                         'name', case when h is null then null else private.person_name(h) end,
                         'ends_at', (select a.ends_at from public.position_assignments a
                                      where a.organization_id = v_bde and a.office = o.office and a.status = 'active'
                                        and a.starts_at <= now() and now() < a.ends_at limit 1),
                         'vacant', h is null)
                       order by o.ord)
                  from (values ('bde_president', 1), ('bde_vice_president', 2)) as o (office, ord)
                  cross join lateral (select private.office_holder(v_bde, o.office, now()) as h) x),
    'transition', private.transition_summary(v_transition),
    'issues', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'severity', i.severity,
                                                            'office', i.details ->> 'office', 'ends_at', i.details ->> 'ends_at',
                                                            'first_detected_at', i.first_detected_at)
                                         order by i.first_detected_at), '[]'::jsonb)
                 from public.governance_issues i
                where i.status = 'open'
                  and (i.kind in ('bde_office_vacant', 'guardian_missing')
                       or (i.kind in ('succession_missing', 'transition_pending') and i.organization_id = v_bde)
                       or (i.kind = 'guardian_mfa_missing' and i.subject_user_id = v_actor))),
    'readiness', jsonb_build_object(
      'mfa', private.has_verified_mfa(v_actor),
      'recovery_procedure', (select r.status from public.institutional_records r where r.record_key = 'recovery_procedure'),
      'technical_owner', (select r.status from public.institutional_records r where r.record_key = 'technical_owner')));
end;
$$;

-- ---- BDE: operations (platform.operations.monitor) ---------------------------------------------------------

create or replace function public.platform_operations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');
  return jsonb_build_object(
    'generated_at', now(),
    'scheduler_available', to_regclass('cron.job') is not null,
    'jobs', private.jobs_overview(),
    'notifications', (select jsonb_build_object(
                               'mode', (select c.delivery_mode from public.notification_config c where c.id),
                               'due', count(*) filter (where (d.status in ('queued', 'failed_retryable') and d.next_attempt_at <= now())
                                                          or (d.status = 'processing' and d.lease_until <= now())),
                               'failed_7d', count(*) filter (where d.status = 'failed_permanent' and d.updated_at > now() - interval '7 days'),
                               'accepted_7d', count(*) filter (where d.status in ('provider_accepted', 'delivered') and d.updated_at > now() - interval '7 days'))
                        from public.notification_deliveries d),
    'storage', (select jsonb_build_object(
                         'pending', count(*) filter (where q.done_at is null and q.attempts < 10),
                         'stuck', count(*) filter (where q.done_at is null and q.attempts >= 10),
                         'oldest', min(q.queued_at) filter (where q.done_at is null))
                  from private.storage_cleanup_queue q),
    'incidents', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'id', i.id, 'title', i.title, 'kind', i.kind, 'severity', i.severity, 'status', i.status,
                                   'impact', i.impact, 'detected_at', i.detected_at, 'resolved_at', i.resolved_at,
                                   'owner_name', case when i.owner_user_id is null then null else private.person_name(i.owner_user_id) end,
                                   'updates', (select coalesce(jsonb_agg(jsonb_build_object(
                                                        'status', u.status, 'note', u.note, 'created_at', u.created_at,
                                                        'author_name', case when u.author_id is null then null else private.person_name(u.author_id) end)
                                                      order by u.created_at desc), '[]'::jsonb)
                                                 from public.operational_incident_updates u where u.incident_id = i.id))
                                 order by (i.status = 'resolved'), i.detected_at desc), '[]'::jsonb)
                    from public.operational_incidents i
                   where i.status <> 'resolved' or i.resolved_at > now() - interval '90 days'),
    'backups', private.backup_status(),
    'register', (select jsonb_agg(jsonb_build_object(
                          'key', r.record_key, 'area', r.area, 'provider', r.provider, 'owner', r.owner, 'contact', r.contact,
                          'renewal_on', r.renewal_on, 'status', r.status, 'notes', r.notes, 'verified_at', r.verified_at,
                          'verified_by_name', case when r.verified_by is null then null else private.person_name(r.verified_by) end,
                          'updated_at', r.updated_at)
                        order by r.sort_order)
                   from public.institutional_records r),
    'issues', (select coalesce(jsonb_agg(private.issue_json(i) order by i.first_detected_at), '[]'::jsonb)
                 from public.governance_issues i where i.status = 'open' and i.audience = 'operations'),
    'schema_version', private.applied_schema_version());
end;
$$;

-- A repeatable self-check of the security foundations (counts and names of
-- objects only). It reports; it never changes a policy or a grant.
create or replace function public.security_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_checks jsonb := '[]'::jsonb;
  v_names text[];
  v_count integer;
  v_bde uuid := private.bde_organization_id();
begin
  perform private.require_platform_permission(v_actor, 'platform.operations.monitor');

  v_names := array(select c.relname::text from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1);
  v_checks := v_checks || jsonb_build_object('key', 'rls_enabled', 'status', case when cardinality(v_names) = 0 then 'ok' else 'attention' end,
                                             'value', to_jsonb(v_names));

  v_names := array(select distinct g.table_name::text from information_schema.role_table_grants g
                    where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
                      and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') order by 1);
  v_checks := v_checks || jsonb_build_object('key', 'no_table_writes', 'status', case when cardinality(v_names) = 0 then 'ok' else 'attention' end,
                                             'value', to_jsonb(v_names));

  v_names := array(select n.nspname || '.' || p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                    where n.nspname in ('public', 'private') and p.prosecdef
                      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1);
  v_checks := v_checks || jsonb_build_object('key', 'definer_search_path', 'status', case when cardinality(v_names) = 0 then 'ok' else 'attention' end,
                                             'value', to_jsonb(v_names));

  -- The private helpers read policies need (the same list as supabase/tests/database/foundation.test.sql).
  v_names := array(select p.proname::text from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'private'
                      and ((has_function_privilege('anon', p.oid, 'execute')
                            and p.proname not in ('association_media_object_is_public', 'portrait_object_is_public', 'association_media_organization'))
                           or (has_function_privilege('authenticated', p.oid, 'execute')
                               and p.proname not in ('mfa_requirement_met', 'has_organization_permission', 'has_platform_permission',
                                                     'my_organization_ids_with', 'my_open_organization_ids', 'my_transition_ids',
                                                     'current_user_email', 'my_page_organization_ids', 'association_media_organization',
                                                     'association_media_object_is_public', 'portrait_object_is_public',
                                                     'my_post_editor_organization_ids', 'my_readable_post_ids', 'my_media_organization_ids',
                                                     'my_event_team_organization_ids', 'my_readable_event_ids',
                                                     'my_recruitment_organization_ids', 'my_application_ids',
                                                     'can_upload_application_document', 'can_read_application_document',
                                                     'can_delete_application_document')))
                    order by 1);
  v_checks := v_checks || jsonb_build_object('key', 'private_functions_closed', 'status', case when cardinality(v_names) = 0 then 'ok' else 'attention' end,
                                             'value', to_jsonb(v_names));

  select count(*) into v_count from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  v_checks := v_checks || jsonb_build_object('key', 'anon_functions', 'status', 'info', 'value', v_count);

  select count(*) into v_count from pg_catalog.pg_constraint c
   where c.conname in ('position_assignments_one_holder_per_office', 'position_assignments_one_office_per_person')
      or (c.contype = 'x' and c.conrelid = 'public.position_assignments'::regclass);
  v_checks := v_checks || jsonb_build_object('key', 'office_overlap_guard', 'status', case when v_count > 0 then 'ok' else 'attention' end,
                                             'value', v_count);

  select count(*) into v_count from unnest(array['bde_president', 'bde_vice_president']) o where private.office_holder(v_bde, o, now()) is null;
  v_checks := v_checks || jsonb_build_object('key', 'bde_offices', 'status', case when v_count = 0 then 'ok' else 'attention' end, 'value', v_count);

  select count(*) into v_count from public.platform_assignments g
   where g.role = 'guardian' and g.status = 'active' and g.starts_at <= now() and now() < g.ends_at;
  v_checks := v_checks || jsonb_build_object('key', 'guardian_assignments', 'status', case when v_count = 1 then 'ok' else 'attention' end,
                                             'value', v_count);

  select count(*) into v_count from public.governance_issues i where i.status = 'open' and i.kind in ('officer_mfa_missing', 'guardian_mfa_missing');
  v_checks := v_checks || jsonb_build_object('key', 'officers_mfa', 'status', case when v_count = 0 then 'ok' else 'attention' end, 'value', v_count);

  v_checks := v_checks || jsonb_build_object('key', 'schema_version', 'status', 'info', 'value', private.applied_schema_version());
  v_checks := v_checks || jsonb_build_object('key', 'notification_mode', 'status', 'info',
                                             'value', (select c.delivery_mode from public.notification_config c where c.id));
  return jsonb_build_object('generated_at', now(), 'checks', v_checks);
end;
$$;

-- ---- The heartbeat (anyone; the external uptime check calls /api/health) ------------------------------------

-- Booleans only: the database answers, and the critical jobs ran on time
-- (null when no scheduler is installed, e.g. a local database).
create or replace function public.platform_heartbeat()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := private.cron_status();
begin
  return jsonb_build_object(
    'database', true,
    'jobs_on_time', case when v_cron is null then null
                         else not exists (select 1 from public.scheduled_jobs j where j.critical and private.job_health(j, v_cron) <> 'ok') end,
    'checked_at', now());
end;
$$;

-- ---- The privacy officer: one person's responsibilities before an erasure ---------------------------------

-- What an account still holds (offices, positions, transitions, committee
-- appointments, handover items, platform roles), so the request can be
-- routed through the governance workflows first. Organizations and dates
-- only; recorded in the audit.
create or replace function public.account_responsibilities(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_user uuid;
begin
  perform private.require_platform_permission(v_actor, 'platform.privacy.requests');
  perform private.require_aal2();
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then
    return jsonb_build_object('found', false);
  end if;
  perform private.log_governance_event(
    v_actor, 'self', 'account_responsibilities_viewed', 'continuity', null, v_user, null, null, '{}'::jsonb);
  return jsonb_build_object(
    'found', true,
    'name', private.person_name(v_user),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('organization', o.name, 'slug', o.slug, 'position', p.title,
                                                                 'office', a.office, 'ends_at', a.ends_at) order by a.ends_at), '[]'::jsonb)
                      from public.position_assignments a
                      join public.positions p on p.id = a.position_id
                      join public.organizations o on o.id = a.organization_id
                     where a.user_id = v_user and a.status = 'active' and a.ends_at > now()),
    'transitions', (select count(*) from public.leadership_transitions t
                     where t.status = 'open' and t.expires_at > now()
                       and (t.proposed_by = v_user or exists (select 1 from public.leadership_transition_candidates c
                                                               where c.transition_id = t.id and c.user_id = v_user))),
    'delegations', (select count(*) from public.delegations d
                     where d.status = 'active' and d.ends_at > now() and (d.delegate_user_id = v_user or d.delegator_user_id = v_user)),
    'committee', (select count(*) from public.recruitment_committee_members cm
                   where cm.user_id = v_user and cm.revoked_at is null and cm.ends_at > now()),
    'handover_items', (select count(*) from public.handover_checklist_items h where h.assignee_user_id = v_user and not h.done),
    'platform_roles', (select coalesce(jsonb_agg(g.role), '[]'::jsonb) from public.platform_assignments g
                        where g.user_id = v_user and g.status = 'active' and g.ends_at > now()));
end;
$$;

-- ---- The BDE handover report (printable page) --------------------------------------------------------------

create or replace function public.continuity_handover_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_bde uuid := private.bde_organization_id();
  v_current public.academic_years%rowtype := private.current_academic_year();
  v_next public.academic_years%rowtype := private.next_academic_year();
  v_from timestamptz;
  v_transition public.leadership_transitions%rowtype;
begin
  perform private.require_platform_permission(v_actor, 'platform.organizations.manage');
  -- The instant the next team should be in place.
  v_from := coalesce(v_next.mandate_starts_at, private.paris_start_of(v_current.ends_on + 1), now());
  select * into v_transition from public.leadership_transitions t
   where t.organization_id = v_bde and t.status = 'open' and t.expires_at > now() limit 1;
  return jsonb_build_object(
    'generated_at', now(),
    'current_year', private.academic_year_json(v_current),
    'next_year', private.academic_year_json(v_next),
    'from', v_from,
    'bde', (select jsonb_agg(jsonb_build_object(
                     'office', o.office,
                     'current', (select private.person_name(h) from (select private.office_holder(v_bde, o.office, now()) as h) x where h is not null),
                     'incoming', (select private.person_name(h) from (select private.office_holder(v_bde, o.office, v_from) as h) x where h is not null))
                   order by o.ord)
              from (values ('bde_president', 1), ('bde_vice_president', 2)) as o (office, ord)),
    'bde_transition', private.transition_summary(v_transition),
    'associations', (select jsonb_build_object(
                              'total', count(*),
                              'ready', count(*) filter (where private.office_holder(o.id, 'association_president', v_from) is not null),
                              'action', coalesce(jsonb_agg(jsonb_build_object(
                                                   'name', o.name, 'slug', o.slug,
                                                   'state', private.handover_metric(o.id, 'succession') ->> 'state')
                                                 order by o.name)
                                                 filter (where private.office_holder(o.id, 'association_president', v_from) is null), '[]'::jsonb))
                       from public.organizations o where o.kind = 'association' and o.status = 'active'),
    'work', jsonb_build_object(
      'upcoming_events', (select count(*) from public.events e where e.status = 'scheduled' and e.publication = 'published' and e.starts_at > now()),
      'scheduled_posts', (select count(*) from public.posts p where p.schedule_status = 'pending'),
      'open_campaigns', (select count(*) from public.recruitment_campaigns c
                          where c.status = 'scheduled' and c.archived_at is null and coalesce(c.closes_at, 'infinity'::timestamptz) > now())),
    'platform', jsonb_build_object(
      'jobs_not_ok', (select coalesce(jsonb_agg(j ->> 'key'), '[]'::jsonb) from jsonb_array_elements(private.jobs_overview()) j
                       where j ->> 'health' not in ('ok', 'unverifiable')),
      'failed_deliveries_7d', (select count(*) from public.notification_deliveries d
                                where d.status = 'failed_permanent' and d.updated_at > now() - interval '7 days'),
      'notification_mode', (select c.delivery_mode from public.notification_config c where c.id),
      'backups', private.backup_status(),
      'register_not_verified', (select count(*) from public.institutional_records r where r.status <> 'verified'),
      'retention_unconfigured', (select count(*) from public.retention_policies p where p.keep_months is null)),
    'issues', (select coalesce(jsonb_agg(private.issue_json(i) order by
                                         case i.severity when 'critical' then 0 when 'warning' then 1 else 2 end, i.first_detected_at), '[]'::jsonb)
                 from public.governance_issues i where i.status = 'open' and i.audience <> 'self'));
end;
$$;

-- ---- The weekly report (job platform-health-report) --------------------------------------------------------

create or replace function private.send_platform_health_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_user uuid;
  v_sent integer := 0;
  v_week text := to_char(now() at time zone 'Europe/Paris', 'IYYY-"W"IW');
  v_bde uuid := private.bde_organization_id();
begin
  v_payload := jsonb_build_object(
    'week', v_week,
    'associations_without_president', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'association_president_vacant'),
    'successions_missing', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'succession_missing'),
    'mandates_expiring_30', (select count(*) from public.position_assignments a
                              where a.status = 'active' and a.starts_at <= now() and now() < a.ends_at and a.ends_at <= now() + interval '30 days'),
    'transitions_pending', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'transition_pending'),
    'jobs_unhealthy', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'job_unhealthy'),
    'failed_deliveries_7d', (select count(*) from public.notification_deliveries d
                              where d.status = 'failed_permanent' and d.updated_at > now() - interval '7 days'),
    'reviewer_access_expiring', (select count(*) from public.governance_issues i where i.status = 'open' and i.kind = 'reviewer_access_expiring'),
    'backups_verified', (select count(*) from jsonb_array_elements(private.backup_status()) b where b ->> 'status' = 'verified'),
    'open_incidents', (select count(*) from public.operational_incidents i where i.status <> 'resolved'));
  for v_user in select r from private.issue_recipients('bde', null, null) r loop
    perform private.notify(v_user, 'platform_health_report', 'health_report:' || v_week || ':' || v_user, v_payload,
                           v_bde, 'organization', v_bde);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('sent', v_sent, 'week', v_week);
end;
$$;

-- ---- The academic year's preparation: the operations side ----------------------------------------------------

create or replace function private.academic_year_platform_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := private.cron_status();
  v_bad integer;
  v_backups jsonb := private.backup_status();
begin
  select count(*) into v_bad from public.scheduled_jobs j where private.job_health(j, v_cron) not in ('ok', 'unverifiable');
  return jsonb_build_array(
    jsonb_build_object('key', 'jobs_healthy', 'status', case when v_cron is null then 'info' when v_bad = 0 then 'ok' else 'attention' end,
                       'value', v_bad),
    jsonb_build_object('key', 'backups_verified',
                       'status', case when (select count(*) from jsonb_array_elements(v_backups) b
                                             where b ->> 'kind' in ('database_restore_test', 'storage_restore_test')
                                               and b ->> 'status' = 'verified') = 2 then 'ok' else 'attention' end,
                       'value', v_backups),
    jsonb_build_object('key', 'register_verified',
                       'status', case when exists (select 1 from public.institutional_records r
                                                    where r.record_key in ('technical_owner', 'recovery_procedure', 'domain', 'supabase_project')
                                                      and r.status <> 'verified') then 'attention' else 'ok' end,
                       'value', (select count(*) from public.institutional_records r where r.status = 'verified')),
    jsonb_build_object('key', 'notification_mode', 'status', 'info',
                       'value', (select c.delivery_mode from public.notification_config c where c.id)),
    jsonb_build_object('key', 'retention_configured', 'status', 'info',
                       'value', (select count(*) from public.retention_policies p where p.keep_months is null)),
    jsonb_build_object('key', 'open_incidents',
                       'status', case when exists (select 1 from public.operational_incidents i where i.status <> 'resolved') then 'attention' else 'ok' end,
                       'value', (select count(*) from public.operational_incidents i where i.status <> 'resolved')));
end;
$$;

-- ---- Schedules: every recurring job goes through the dispatcher ------------------------------------------------

do $cron$
declare
  v_job record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from cron.job where jobname = 'notification-retention') then
      perform cron.unschedule('notification-retention');
    end if;
    for v_job in select job_key, schedule from public.scheduled_jobs loop
      perform cron.schedule(v_job.job_key, v_job.schedule, format('select private.run_scheduled_job(%L)', v_job.job_key));
    end loop;
  end if;
end;
$cron$;

-- ---- Privileges ---------------------------------------------------------------------------------------------

revoke all on function private.backup_status() from public, anon, authenticated, service_role;
revoke all on function private.applied_schema_version() from public, anon, authenticated, service_role;
revoke all on function private.has_verified_mfa(uuid) from public, anon, authenticated, service_role;
revoke all on function private.transition_summary(public.leadership_transitions) from public, anon, authenticated, service_role;
revoke all on function private.issue_json(public.governance_issues) from public, anon, authenticated, service_role;
revoke all on function private.send_platform_health_report() from public, anon, authenticated, service_role;
revoke all on function private.academic_year_platform_checks() from public, anon, authenticated, service_role;
revoke all on function public.governance_health() from public, anon;
revoke all on function public.organization_continuity(uuid) from public, anon;
revoke all on function public.guardian_continuity() from public, anon;
revoke all on function public.platform_operations() from public, anon;
revoke all on function public.security_health() from public, anon;
revoke all on function public.account_responsibilities(text) from public, anon;
revoke all on function public.continuity_handover_report() from public, anon;
revoke all on function public.platform_heartbeat() from public;
grant execute on function public.governance_health() to authenticated;
grant execute on function public.organization_continuity(uuid) to authenticated;
grant execute on function public.guardian_continuity() to authenticated;
grant execute on function public.platform_operations() to authenticated;
grant execute on function public.security_health() to authenticated;
grant execute on function public.account_responsibilities(text) to authenticated;
grant execute on function public.continuity_handover_report() to authenticated;
grant execute on function public.platform_heartbeat() to anon, authenticated;
