-- Phase 13 · Analytics: what the platform's own records say, to the people
-- allowed to read each part, and nothing else.
--
-- Two kinds of figures, never mixed:
--   * now: what holds at this instant (articles online, events to come,
--     open recruitment, waiting lists, work still to do), read live;
--   * over a period: what happened on each Paris day (first publications,
--     registrations made, cancellations, applications sent, decisions
--     released…), counted from the source rows' own timestamps into
--     private.analytics_daily by the 'analytics-refresh' job. Recomputed,
--     never incremented: running it twice gives the same table; a late
--     change within 40 days is picked up at the next hour; older days are
--     compared with the sources and differences reported, not overwritten
--     (a retention purge must not erase the history of counts).
-- Nothing is measured that the platform does not record: no page views, no
-- unique visitors, no reading, no attendance (there is no check-in), no
-- e-mail opens. Those figures are absent by design and say so.
--
-- Access: every read is a SECURITY DEFINER function that asks the
-- authorization functions at this instant (a mandate that ended closes it at
-- once, whatever the session says) and returns counts only, built in the
-- database: no row of an application, a review, a registration or a
-- notification ever leaves it. Small groups in outcome breakdowns are
-- suppressed before the answer is built (private.analytics_suppress).

-- ---- Permissions -------------------------------------------------------------------------------------------

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order) values
  ('analytics.content.view', 'organization', 'insights', 'Voir les statistiques des articles',
   'Articles publiés, programmés et en relecture, par mois et par type, et le temps de relecture. Jamais qui a lu quoi.',
   true, true, false, true, 91),
  ('analytics.events.view', 'organization', 'insights', 'Voir les statistiques des événements',
   'Inscriptions, listes d''attente, annulations et remplissage, événement par événement. Jamais la liste des personnes.',
   true, true, false, true, 92),
  ('analytics.recruitment.view', 'organization', 'insights', 'Voir les statistiques de recrutement',
   'Candidatures envoyées, candidat·es distinct·es et étapes franchies, en totaux ; les résultats des petits groupes sont masqués. Jamais un CV, une réponse ou une évaluation.',
   true, false, true, true, 93),
  ('analytics.recruitment.workflow.view', 'organization', 'insights', 'Suivre l''avancement du recrutement',
   'Ce qui reste à faire : candidatures à attribuer ou à évaluer, entretiens, décisions et offres en attente. Jamais par évaluateur·rice.',
   true, true, false, true, 94),
  ('analytics.export', 'organization', 'insights', 'Exporter les statistiques',
   'Imprimer le rapport et télécharger les tableaux de chiffres autorisés (CSV). Chaque export est enregistré.',
   true, false, false, true, 95),
  ('platform.analytics.view', 'platform', 'platform', 'Voir les statistiques de la plateforme',
   'Les totaux de toutes les assos : articles, événements, inscriptions et recrutements agrégés (petits groupes masqués), sans accès aux données des personnes.',
   false, false, false, true, 112),
  ('platform.analytics.configure', 'platform', 'platform', 'Régler les statistiques',
   'Le seuil de confidentialité des petits groupes et le recalcul des chiffres d''une période.',
   false, false, false, true, 113);

update public.permissions
   set module_ready = true, sort_order = 90,
       description = 'La vue d''ensemble des chiffres de l''asso : articles, événements et recrutements en cours, ce qui attend une action.'
 where key = 'analytics.view';

-- The offices carry every organization key (as at Phase 4); the BDE offices
-- also the platform ones. Existing office positions get them now.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
 cross join (values ('analytics.content.view'), ('analytics.events.view'), ('analytics.recruitment.view'),
                    ('analytics.recruitment.workflow.view'), ('analytics.export')) as k (key)
 where t.office is not null
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
 cross join (values ('analytics.content.view'), ('analytics.events.view'), ('analytics.recruitment.view'),
                    ('analytics.recruitment.workflow.view'), ('analytics.export')) as k (key)
 where p.office is not null
on conflict do nothing;
insert into public.position_template_permissions (template_key, permission_key)
select t.key, k.key
  from public.position_templates t
 cross join (values ('platform.analytics.view'), ('platform.analytics.configure')) as k (key)
 where t.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;
insert into public.position_permissions (position_id, permission_key)
select p.id, k.key
  from public.positions p
 cross join (values ('platform.analytics.view'), ('platform.analytics.configure')) as k (key)
 where p.office in ('bde_president', 'bde_vice_president')
on conflict do nothing;

-- Templates for new positions (a template is a snapshot: positions already
-- created from it keep their keys; the presidency adds these in "Rôles").
insert into public.position_template_permissions (template_key, permission_key) values
  ('vice_president', 'analytics.content.view'), ('vice_president', 'analytics.events.view'),
  ('vice_president', 'analytics.recruitment.view'), ('vice_president', 'analytics.recruitment.workflow.view'),
  ('vice_president', 'analytics.export'),
  ('communications', 'analytics.content.view'),
  ('events', 'analytics.events.view'),
  ('recruitment_manager', 'analytics.recruitment.view'), ('recruitment_manager', 'analytics.recruitment.workflow.view'),
  ('treasurer', 'analytics.content.view'), ('treasurer', 'analytics.events.view'), ('treasurer', 'analytics.export')
on conflict do nothing;

-- ---- Audit vocabulary --------------------------------------------------------------------------------------

alter table public.governance_audit_events drop constraint governance_audit_events_category_check;
alter table public.governance_audit_events add constraint governance_audit_events_category_check
  check (category in ('organization', 'team', 'roles', 'delegation', 'leadership', 'recovery', 'bootstrap',
                      'profile', 'media', 'catalog', 'content', 'moderation', 'events', 'recruitment', 'communications',
                      'continuity', 'analytics'));

-- ---- Settings ----------------------------------------------------------------------------------------------

-- One row. The smallest group whose outcomes may be shown (decisions,
-- offers, per-association recruitment counts): 5 by default, a starting
-- point for the privacy review, not a legal guarantee of anonymity.
create table private.analytics_settings (
  id boolean primary key default true
    constraint analytics_settings_singleton_check check (id),
  min_group_size smallint not null default 5
    constraint analytics_settings_min_group_size_check check (min_group_size between 3 and 20),
  updated_by uuid
    constraint analytics_settings_updated_by_fkey references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into private.analytics_settings default values;

-- ---- Daily counts ------------------------------------------------------------------------------------------

-- What happened on each Paris day, per association (organization_id null:
-- the platform's own messages). Counts only, no person.
create table private.analytics_daily (
  day date not null,
  organization_id uuid
    constraint analytics_daily_organization_id_fkey references public.organizations (id) on delete cascade,
  metric text not null
    constraint analytics_daily_metric_check check (metric ~ '^[a-z]+(\.[a-z_]+)+$'),
  dimension text not null default ''
    constraint analytics_daily_dimension_check check (char_length(dimension) <= 40),
  value integer not null
    constraint analytics_daily_value_check check (value > 0),
  computed_at timestamptz not null default now(),
  constraint analytics_daily_key unique nulls not distinct (day, organization_id, metric, dimension)
);

create index analytics_daily_organization_idx on private.analytics_daily (organization_id, day);
create index analytics_daily_day_idx on private.analytics_daily (day, metric);

-- The definitions of every daily count, in one place: the refresh writes
-- them, the reconciliation compares with them. Event-time semantics: a
-- registration made on the 3rd and cancelled on the 9th counts once in
-- "registrations.created" on the 3rd and once in "registrations.cancelled"
-- on the 9th; nothing is ever subtracted from a past day.
create or replace function private.analytics_source_counts(p_from date, p_to date)
returns table (day date, organization_id uuid, metric text, dimension text, value integer)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (select private.paris_start_of(p_from) as s, private.paris_start_of(p_to + 1) as e)
  select x.day, x.org, x.metric, x.dim, count(*)::integer
    from (
      -- An article's first publication (one per post, whatever its revisions; a draft never counts).
      select (p.first_published_at at time zone 'Europe/Paris')::date as day, p.organization_id as org,
             'posts.published' as metric, coalesce(r.kind, '') as dim
        from public.posts p
        cross join b
        left join public.post_revisions r on r.id = coalesce(p.published_revision_id, p.working_revision_id)
       where p.first_published_at >= b.s and p.first_published_at < b.e
      union all
      select (e.first_published_at at time zone 'Europe/Paris')::date, e.organization_id, 'events.published', ''
        from public.events e cross join b
       where e.first_published_at >= b.s and e.first_published_at < b.e
      union all
      -- Cancelled after being published (a draft dropped is not a cancellation).
      select (e.cancelled_at at time zone 'Europe/Paris')::date, e.organization_id, 'events.cancelled', ''
        from public.events e cross join b
       where e.cancelled_at >= b.s and e.cancelled_at < b.e and e.first_published_at is not null
      union all
      -- Over without having been cancelled: it took place as planned, as far as the platform knows (no check-in).
      select (e.ends_at at time zone 'Europe/Paris')::date, e.organization_id, 'events.held', ''
        from public.events e cross join b
       where e.ends_at >= b.s and e.ends_at < b.e and e.ends_at <= now()
         and e.status = 'scheduled' and e.first_published_at is not null
      union all
      select (r.created_at at time zone 'Europe/Paris')::date, e.organization_id, 'registrations.created', ''
        from public.event_registrations r join public.events e on e.id = r.event_id cross join b
       where r.created_at >= b.s and r.created_at < b.e
      union all
      select (r.waitlisted_at at time zone 'Europe/Paris')::date, e.organization_id, 'registrations.waitlisted', ''
        from public.event_registrations r join public.events e on e.id = r.event_id cross join b
       where r.waitlisted_at >= b.s and r.waitlisted_at < b.e
      union all
      select (r.promoted_at at time zone 'Europe/Paris')::date, e.organization_id, 'registrations.promoted', ''
        from public.event_registrations r join public.events e on e.id = r.event_id cross join b
       where r.promoted_at >= b.s and r.promoted_at < b.e
      union all
      select (r.cancelled_at at time zone 'Europe/Paris')::date, e.organization_id, 'registrations.cancelled', coalesce(r.cancel_source, '')
        from public.event_registrations r join public.events e on e.id = r.event_id cross join b
       where r.cancelled_at >= b.s and r.cancelled_at < b.e
      union all
      select (a.created_at at time zone 'Europe/Paris')::date, c.organization_id, 'applications.started', ''
        from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id cross join b
       where a.created_at >= b.s and a.created_at < b.e
      union all
      select (a.submitted_at at time zone 'Europe/Paris')::date, c.organization_id, 'applications.submitted', ''
        from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id cross join b
       where a.submitted_at >= b.s and a.submitted_at < b.e
      union all
      select (a.withdrawn_at at time zone 'Europe/Paris')::date, c.organization_id, 'applications.withdrawn', ''
        from public.applications a join public.recruitment_campaigns c on c.id = a.campaign_id cross join b
       where a.withdrawn_at >= b.s and a.withdrawn_at < b.e and a.submitted_at is not null
      union all
      select (d.released_at at time zone 'Europe/Paris')::date, c.organization_id, 'decisions.released', d.outcome
        from public.recruitment_decisions d join public.recruitment_campaigns c on c.id = d.campaign_id cross join b
       where d.released_at >= b.s and d.released_at < b.e
      union all
      select (o.responded_at at time zone 'Europe/Paris')::date, c.organization_id, 'offers.responded', o.status
        from public.recruitment_offers o join public.recruitment_campaigns c on c.id = o.campaign_id cross join b
       where o.responded_at >= b.s and o.responded_at < b.e and o.status in ('accepted', 'declined')
      union all
      -- The platform's messages (no association, no person).
      select (n.created_at at time zone 'Europe/Paris')::date, null::uuid, 'notifications.created', ''
        from public.notifications n cross join b
       where n.created_at >= b.s and n.created_at < b.e
      union all
      select (d.created_at at time zone 'Europe/Paris')::date, null::uuid, 'deliveries.queued', ''
        from public.notification_deliveries d cross join b
       where d.created_at >= b.s and d.created_at < b.e
      union all
      select (d.accepted_at at time zone 'Europe/Paris')::date, null::uuid, 'deliveries.accepted', ''
        from public.notification_deliveries d cross join b
       where d.accepted_at >= b.s and d.accepted_at < b.e
      union all
      select (d.delivered_at at time zone 'Europe/Paris')::date, null::uuid, 'deliveries.delivered', ''
        from public.notification_deliveries d cross join b
       where d.delivered_at >= b.s and d.delivered_at < b.e
      union all
      select (d.finished_at at time zone 'Europe/Paris')::date, null::uuid, 'deliveries.failed', ''
        from public.notification_deliveries d cross join b
       where d.finished_at >= b.s and d.finished_at < b.e and d.status = 'failed_permanent'
      union all
      select (coalesce(d.finished_at, d.created_at) at time zone 'Europe/Paris')::date, null::uuid, 'deliveries.suppressed', ''
        from public.notification_deliveries d cross join b
       where coalesce(d.finished_at, d.created_at) >= b.s and coalesce(d.finished_at, d.created_at) < b.e
         and d.status = 'suppressed'
    ) as x (day, org, metric, dim)
   group by x.day, x.org, x.metric, x.dim;
$$;

-- Recomputes the daily counts of a range of days: deletes them and writes
-- them again from the sources, under one lock (two runs never interleave).
-- Idempotent: a second run leaves exactly the same rows.
create or replace function private.refresh_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_written integer;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'analytics_period_invalid' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('vpc-analytics-refresh'));
  delete from private.analytics_daily where day between p_from and p_to;
  get diagnostics v_deleted = row_count;
  insert into private.analytics_daily (day, organization_id, metric, dimension, value)
  select s.day, s.organization_id, s.metric, s.dimension, s.value
    from private.analytics_source_counts(p_from, p_to) s;
  get diagnostics v_written = row_count;
  return jsonb_build_object('from', p_from, 'to', p_to, 'replaced', v_deleted, 'written', v_written);
end;
$$;

-- Compares stored counts with the sources over a range, without changing
-- anything: the cells that differ (a late correction older than the refresh
-- window, or source rows a retention rule has deleted since).
create or replace function private.reconcile_analytics(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with stored as (
    select d.day, d.organization_id, d.metric, d.dimension, d.value
      from private.analytics_daily d where d.day between p_from and p_to
  ),
  source as (select * from private.analytics_source_counts(p_from, p_to)),
  diff as (
    select coalesce(a.day, s.day) as day, coalesce(a.metric, s.metric) as metric,
           coalesce(a.value, 0) as stored, coalesce(s.value, 0) as source
      from stored a
      full join source s
        on s.day = a.day and s.organization_id is not distinct from a.organization_id
       and s.metric = a.metric and s.dimension = a.dimension
     where coalesce(a.value, 0) <> coalesce(s.value, 0)
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'differences', (select count(*) from diff),
    'stored_above_source', (select count(*) from diff where stored > source),
    'days', coalesce((select jsonb_agg(distinct d.day order by d.day) from (select day from diff order by day limit 20) d), '[]'::jsonb));
$$;

-- The job: the last 40 days recomputed (late changes included), then the
-- year before compared (report only).
create or replace function private.run_analytics_refresh()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  return jsonb_build_object(
    'refreshed', private.refresh_analytics(v_today - 40, v_today),
    'reconciled', private.reconcile_analytics(v_today - 400, v_today - 41));
end;
$$;

-- When the counts were last brought up to date, and whether that is too long ago.
create or replace function private.analytics_freshness()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'data_through', j.last_succeeded_at,
    'stale', j.last_succeeded_at is null or j.last_succeeded_at < now() - interval '2 hours',
    'last_failed_at', j.last_failed_at,
    'last_status', j.last_status,
    'differences', coalesce((j.last_result -> 'reconciled' ->> 'differences')::integer, 0),
    'reconciled_from', j.last_result -> 'reconciled' ->> 'from',
    'reconciled_to', j.last_result -> 'reconciled' ->> 'to')
    from public.scheduled_jobs j where j.job_key = 'analytics-refresh';
$$;

-- ---- Privacy -----------------------------------------------------------------------------------------------

create or replace function private.analytics_k()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select min_group_size from private.analytics_settings), 5)::integer;
$$;

-- A breakdown made safe to show ({"accepted": 3, "declined": 9} …):
--   * the whole group under k: nothing shown, not even the total;
--   * a cell between 1 and k-1: hidden;
--   * exactly one cell hidden: the next smallest is hidden too, so the
--     hidden one cannot be found by subtracting from the total;
--   * p_dominance (outcomes): a single category holding the whole group
--     would tell each member's result — the breakdown is hidden.
-- Returns {total, cells (null where hidden), suppressed: [keys], reason}.
create or replace function private.analytics_suppress(p_cells jsonb, p_k integer, p_dominance boolean default false)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_hidden text[] := '{}';
  v_out jsonb := '{}'::jsonb;
  v_extra text;
  r record;
begin
  for r in select key, coalesce(value::text::integer, 0) as n from jsonb_each(coalesce(p_cells, '{}'::jsonb)) loop
    v_total := v_total + r.n;
  end loop;
  if v_total = 0 then
    return jsonb_build_object('total', 0, 'cells', coalesce(p_cells, '{}'::jsonb), 'suppressed', '[]'::jsonb, 'reason', null);
  end if;
  if v_total < p_k then
    select coalesce(jsonb_object_agg(key, null), '{}'::jsonb) into v_out from jsonb_each(p_cells);
    return jsonb_build_object('total', null, 'cells', v_out, 'suppressed', (select jsonb_agg(key) from jsonb_each(p_cells)),
                              'reason', 'small_group');
  end if;
  if p_dominance and exists (select 1 from jsonb_each(p_cells) where value::text::integer = v_total) then
    select coalesce(jsonb_object_agg(key, null), '{}'::jsonb) into v_out from jsonb_each(p_cells);
    return jsonb_build_object('total', v_total, 'cells', v_out, 'suppressed', (select jsonb_agg(key) from jsonb_each(p_cells)),
                              'reason', 'single_outcome');
  end if;
  select coalesce(array_agg(key order by key), '{}') into v_hidden
    from jsonb_each(p_cells) where value::text::integer between 1 and p_k - 1;
  if cardinality(v_hidden) = 1 then
    select key into v_extra
      from jsonb_each(p_cells)
     where value::text::integer > 0 and key <> all (v_hidden)
     order by value::text::integer, key
     limit 1;
    if v_extra is not null then
      v_hidden := v_hidden || v_extra;
    end if;
  end if;
  select coalesce(jsonb_object_agg(key, case when key = any (v_hidden) then null else value end), '{}'::jsonb) into v_out
    from jsonb_each(p_cells);
  return jsonb_build_object('total', v_total, 'cells', v_out, 'suppressed', to_jsonb(v_hidden),
                            'reason', case when cardinality(v_hidden) > 0 then 'small_cells' end);
end;
$$;

-- A reporting period: Paris days, inclusive, two years at most.
create or replace function private.analytics_check_period(p_from date, p_to date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 731
     or p_from < date '2020-01-01' or p_to > (now() at time zone 'Europe/Paris')::date + 400 then
    raise exception 'analytics_period_invalid' using errcode = 'P0001';
  end if;
end;
$$;

-- Sums of the daily counts over a period, as {"metric:dimension": n}
-- ("posts.published:article"); p_org null = every association together.
create or replace function private.analytics_sums(p_org uuid, p_all boolean, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb)
    from (select d.metric || ':' || d.dimension as k, sum(d.value)::integer as n
            from private.analytics_daily d
           where d.day between p_from and p_to
             and (p_all or d.organization_id = p_org)
           group by d.metric, d.dimension) as x;
$$;

-- The days of a period that have something, for the charts: [[day, metric, dimension, n], …].
create or replace function private.analytics_series(p_org uuid, p_all boolean, p_from date, p_to date, p_prefixes text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.day, x.metric, x.dimension, x.n) order by x.day, x.metric, x.dimension), '[]'::jsonb)
    from (select d.day, d.metric, d.dimension, sum(d.value)::integer as n
            from private.analytics_daily d
           where d.day between p_from and p_to
             and (p_all or d.organization_id = p_org)
             and split_part(d.metric, '.', 1) = any (p_prefixes)
           group by d.day, d.metric, d.dimension) as x;
$$;

-- ---- One association ---------------------------------------------------------------------------------------

-- The statistics of one association for a period (Paris days), and the
-- same counts over a comparison period when one is given. Each section
-- needs its own key in that association, checked now: analytics.view
-- (overview), analytics.content.view, analytics.events.view,
-- analytics.recruitment.view, analytics.recruitment.workflow.view,
-- governance.view (team and governance). At least one analytics key.
create or replace function public.organization_analytics(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_org public.organizations%rowtype;
  v_view boolean;
  v_content boolean;
  v_events boolean;
  v_recruitment boolean;
  v_workflow boolean;
  v_export boolean;
  v_team boolean;
  v_k integer := private.analytics_k();
  v_s timestamptz;
  v_e timestamptz;
  v_sums jsonb;
  v_compare jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_campaigns jsonb;
begin
  select * into v_org from public.organizations where id = p_organization_id;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0001';
  end if;
  v_view := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.view', now());
  v_content := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.content.view', now());
  v_events := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.events.view', now());
  v_recruitment := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.recruitment.view', now());
  v_workflow := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.recruitment.workflow.view', now());
  v_export := private.user_has_organization_permission(v_actor, v_org.id, 'analytics.export', now());
  v_team := private.user_has_organization_permission(v_actor, v_org.id, 'governance.view', now());
  if not (v_view or v_content or v_events or v_recruitment or v_workflow) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.analytics_check_period(p_from, p_to);
  if p_compare_from is not null or p_compare_to is not null then
    perform private.analytics_check_period(p_compare_from, p_compare_to);
  end if;
  v_s := private.paris_start_of(p_from);
  v_e := private.paris_start_of(p_to + 1);
  v_sums := private.analytics_sums(v_org.id, false, p_from, p_to);
  v_compare := case when p_compare_from is null then null else private.analytics_sums(v_org.id, false, p_compare_from, p_compare_to) end;

  if v_view then
    v_sections := v_sections || jsonb_build_object('overview', jsonb_build_object(
      'posts_online', (select count(*) from public.posts p
                        where p.organization_id = v_org.id and p.publication = 'published' and p.hidden_at is null),
      'events_upcoming', (select count(*) from public.events e
                           where e.organization_id = v_org.id and e.publication = 'published' and e.hidden_at is null
                             and e.status = 'scheduled' and e.starts_at > now()),
      'campaigns_open', (select count(*) from public.recruitment_campaigns c
                          where c.organization_id = v_org.id and c.hidden_at is null and private.campaign_state(c) = 'open'),
      -- Seats taken for what is still to come (the public pages show the same figure per event).
      'registrations_upcoming', (select count(*) from public.event_registrations r join public.events e on e.id = r.event_id
                                  where e.organization_id = v_org.id and r.status = 'confirmed' and e.status = 'scheduled'
                                    and e.publication = 'published' and e.ends_at > now()),
      'insights', jsonb_build_object(
        'approvals_waiting', (select count(*) from public.post_revisions r join public.posts p on p.id = r.post_id
                               where p.organization_id = v_org.id and r.status = 'submitted'),
        'approvals_waiting_since', (select min(r.submitted_at) from public.post_revisions r join public.posts p on p.id = r.post_id
                                     where p.organization_id = v_org.id and r.status = 'submitted'),
        'schedules_failed', (select count(*) from public.posts p where p.organization_id = v_org.id and p.schedule_status = 'failed'),
        'events_near_capacity', (select count(*) from public.events e
                                  where e.organization_id = v_org.id and e.publication = 'published' and e.status = 'scheduled'
                                    and e.starts_at > now() and e.registration_mode = 'internal' and e.capacity is not null
                                    and (select count(*) from public.event_registrations r
                                          where r.event_id = e.id and r.status = 'confirmed') >= ceil(e.capacity * 0.9)),
        'campaigns_closing_week', (select count(*) from public.recruitment_campaigns c
                                    where c.organization_id = v_org.id and c.hidden_at is null and private.campaign_state(c) = 'open'
                                      and c.closes_at <= now() + interval '7 days'))));
  end if;

  if v_content then
    v_sections := v_sections || jsonb_build_object('content', jsonb_build_object(
      'online', (select count(*) from public.posts p where p.organization_id = v_org.id and p.publication = 'published' and p.hidden_at is null),
      'archived', (select count(*) from public.posts p where p.organization_id = v_org.id and p.publication = 'archived'),
      'offline', (select count(*) from public.posts p
                   where p.organization_id = v_org.id and p.publication = 'unpublished' and p.first_published_at is not null),
      'hidden', (select count(*) from public.posts p where p.organization_id = v_org.id and p.hidden_at is not null),
      'drafts', (select count(*) from public.posts p
                  where p.organization_id = v_org.id and p.first_published_at is null and p.publication = 'unpublished'),
      'scheduled', (select count(*) from public.posts p
                     where p.organization_id = v_org.id and p.schedule_status = 'pending' and p.scheduled_at > now()),
      'approvals_waiting', (select count(*) from public.post_revisions r join public.posts p on p.id = r.post_id
                             where p.organization_id = v_org.id and r.status = 'submitted'),
      'reviews', (select jsonb_build_object(
                     'approved', count(*) filter (where v.decision = 'approved'),
                     'changes_requested', count(*) filter (where v.decision = 'changes_requested'),
                     'median_hours', round((percentile_cont(0.5) within group (
                        order by extract(epoch from v.created_at - r.submitted_at) / 3600)
                        filter (where v.decision = 'approved' and r.submitted_at is not null))::numeric, 1))
                    from public.post_reviews v
                    join public.post_revisions r on r.id = v.revision_id
                    join public.posts p on p.id = v.post_id
                   where p.organization_id = v_org.id and v.created_at >= v_s and v.created_at < v_e
                     and v.decision in ('approved', 'changes_requested')),
      'series', private.analytics_series(v_org.id, false, p_from, p_to, array['posts'])));
  end if;

  if v_events then
    v_sections := v_sections || jsonb_build_object('events', jsonb_build_object(
      'upcoming', (select count(*) from public.events e
                    where e.organization_id = v_org.id and e.publication = 'published' and e.status = 'scheduled' and e.starts_at > now()),
      'waiting_now', (select count(*) from public.event_registrations r join public.events e on e.id = r.event_id
                       where e.organization_id = v_org.id and r.status = 'waitlisted' and e.ends_at > now()),
      'series', private.analytics_series(v_org.id, false, p_from, p_to, array['events', 'registrations']),
      'by_category', coalesce((
        select jsonb_agg(jsonb_build_object('label', x.label, 'events', x.n) order by x.n desc, x.label)
          from (select coalesce(k.label, 'Sans catégorie') as label, count(*) as n
                  from public.events e left join public.event_categories k on k.id = e.category_id
                 where e.organization_id = v_org.id and e.first_published_at is not null
                   and e.starts_at >= v_s and e.starts_at < v_e
                 group by coalesce(k.label, 'Sans catégorie')) as x), '[]'::jsonb),
      'list', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', x.id, 'slug', x.slug, 'title', x.title, 'starts_at', x.starts_at, 'ends_at', x.ends_at,
                 'series_key', x.series_key,
                 'state', case when x.status = 'cancelled' then 'cancelled' when x.ends_at <= now() then 'over'
                               when x.starts_at <= now() then 'live' else 'upcoming' end,
                 'mode', x.registration_mode, 'capacity', x.capacity,
                 'confirmed', x.confirmed, 'waitlisted', x.waitlisted, 'cancelled', x.cancelled, 'created', x.created,
                 'promoted', x.promoted,
                 'utilization', case when x.registration_mode = 'internal' and x.capacity is not null and x.capacity > 0
                                     then round(x.confirmed::numeric / x.capacity, 3) end)
               order by x.starts_at, x.id)
          from (select e.id, e.slug, e.title, e.starts_at, e.ends_at, e.series_key, e.status, e.registration_mode, e.capacity,
                       count(r.id) filter (where r.status = 'confirmed') as confirmed,
                       count(r.id) filter (where r.status = 'waitlisted') as waitlisted,
                       count(r.id) filter (where r.status = 'cancelled') as cancelled,
                       count(r.id) as created,
                       count(r.id) filter (where r.promoted_at is not null) as promoted
                  from public.events e
                  left join public.event_registrations r on r.event_id = e.id
                 where e.organization_id = v_org.id and e.first_published_at is not null
                   and e.starts_at >= v_s and e.starts_at < v_e
                 group by e.id
                 order by e.starts_at, e.id
                 limit 100) as x), '[]'::jsonb)));
  end if;

  if v_recruitment or v_workflow then
    -- Campaigns published (now or before) whose window meets the period.
    select coalesce(jsonb_agg(c.cj order by c.opens_at desc, c.id), '[]'::jsonb) into v_campaigns
      from (select c.id, c.opens_at,
                   jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'state', private.campaign_state(c),
                                      'opens_at', c.opens_at, 'closes_at', c.closes_at, 'required_reviews', c.required_reviews,
                                      'positions', (select count(*) from public.recruitment_positions ps
                                                     where ps.campaign_id = c.id and ps.retired_at is null)) as cj
              from public.recruitment_campaigns c
             where c.organization_id = v_org.id and c.first_published_at is not null
               and c.opens_at < v_e and c.closes_at >= v_s
             order by c.opens_at desc, c.id
             limit 30) as c;
  end if;

  if v_recruitment then
    v_sections := v_sections || jsonb_build_object('recruitment', jsonb_build_object(
      'candidates', (select count(distinct a.candidate_id) from public.applications a
                      join public.recruitment_campaigns c on c.id = a.campaign_id
                     where c.organization_id = v_org.id and a.submitted_at >= v_s and a.submitted_at < v_e),
      'series', private.analytics_series(v_org.id, false, p_from, p_to, array['applications']),
      'campaigns', coalesce((
        select jsonb_agg(cj || private.analytics_campaign_funnel((cj ->> 'id')::uuid, v_k) order by ord)
          from jsonb_array_elements(v_campaigns) with ordinality as t (cj, ord)), '[]'::jsonb)));
  end if;

  if v_workflow then
    v_sections := v_sections || jsonb_build_object('workflow', jsonb_build_object(
      'campaigns', coalesce((
        select jsonb_agg(jsonb_build_object('id', cj -> 'id', 'title', cj -> 'title', 'state', cj -> 'state')
                         || private.analytics_campaign_workflow((cj ->> 'id')::uuid) order by ord)
          from jsonb_array_elements(v_campaigns) with ordinality as t (cj, ord)), '[]'::jsonb)));
  end if;

  if v_team then
    v_sections := v_sections || jsonb_build_object('team', jsonb_build_object(
      'members_active', (select count(*) from public.memberships m where m.organization_id = v_org.id and m.status = 'active'),
      'members_suspended', (select count(*) from public.memberships m where m.organization_id = v_org.id and m.status = 'suspended'),
      'positions_held', (select count(*) from public.position_assignments a
                          where a.organization_id = v_org.id and a.status = 'active' and a.starts_at <= now()
                            and (a.ends_at is null or a.ends_at > now())),
      'mandates_ending_60d', (select count(*) from public.position_assignments a
                               where a.organization_id = v_org.id and a.status = 'active' and a.ends_at > now()
                                 and a.ends_at <= now() + interval '60 days'),
      'presidency', exists (select 1 from public.position_assignments a
                             where a.organization_id = v_org.id and a.status = 'active'
                               and a.office in ('association_president', 'bde_president')
                               and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())),
      'transitions_open', (select count(*) from public.leadership_transitions t
                            where t.organization_id = v_org.id and t.status = 'open'),
      'issues', jsonb_build_object(
        'critical', (select count(*) from public.governance_issues i
                      where i.organization_id = v_org.id and i.status = 'open' and i.severity = 'critical'),
        'warning', (select count(*) from public.governance_issues i
                     where i.organization_id = v_org.id and i.status = 'open' and i.severity = 'warning'),
        'info', (select count(*) from public.governance_issues i
                  where i.organization_id = v_org.id and i.status = 'open' and i.severity = 'info'))));
  end if;

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_org.id, 'slug', v_org.slug, 'name', v_org.name, 'kind', v_org.kind),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'compare_period', case when p_compare_from is null then null
                           else jsonb_build_object('from', p_compare_from, 'to', p_compare_to) end,
    'rights', jsonb_build_object('overview', v_view, 'content', v_content, 'events', v_events, 'recruitment', v_recruitment,
                                 'workflow', v_workflow, 'team', v_team, 'export', v_export),
    'min_group_size', v_k,
    'freshness', private.analytics_freshness(),
    -- Period sums, only of the sections this person may read.
    'totals', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_sums)
                where (v_content and key like 'posts.%') or ((v_events or v_view) and (key like 'events.%'))
                   or (v_events and key like 'registrations.%')
                   or (v_recruitment and (key like 'applications.%'))
                   or (v_view and key like 'posts.%')),
    'compare', case when v_compare is null then null else
                 (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_compare)
                   where (v_content and key like 'posts.%') or ((v_events or v_view) and (key like 'events.%'))
                      or (v_events and key like 'registrations.%')
                      or (v_recruitment and (key like 'applications.%'))
                      or (v_view and key like 'posts.%')) end,
    'sections', v_sections);
end;
$$;

-- One campaign's funnel (whole campaign, not the period): counts only.
-- Stages after "sent" and the outcomes need a group of at least k sent
-- applications; outcome breakdowns go through analytics_suppress.
create or replace function private.analytics_campaign_funnel(p_campaign_id uuid, p_k integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_started integer;
  v_submitted integer;
  v_withdrawn integer;
  v_candidates integer;
  v_small boolean;
begin
  select count(*), count(*) filter (where a.submitted_at is not null),
         count(*) filter (where a.status = 'withdrawn' and a.submitted_at is not null),
         count(distinct a.candidate_id) filter (where a.submitted_at is not null)
    into v_started, v_submitted, v_withdrawn, v_candidates
    from public.applications a where a.campaign_id = p_campaign_id;
  v_small := v_submitted < p_k;
  return jsonb_build_object(
    'started', v_started,
    'submitted', v_submitted,
    'withdrawn', v_withdrawn,
    'candidates', v_candidates,
    'by_position', coalesce((
      select jsonb_agg(jsonb_build_object('title', ps.title, 'submitted', ps.n) order by ps.display_order, ps.title)
        from (select p.title, p.display_order,
                     (select count(*) from public.applications a where a.position_id = p.id and a.submitted_at is not null) as n
                from public.recruitment_positions p where p.campaign_id = p_campaign_id and p.retired_at is null) as ps), '[]'::jsonb),
    'small_group', v_small,
    'reviewed', case when v_small then null else (
      select count(distinct r.application_id) from public.recruitment_reviews r
       where r.campaign_id = p_campaign_id and r.kind = 'application' and r.status = 'submitted') end,
    'shortlisted', case when v_small then null else (
      select count(*) from public.applications a
       where a.campaign_id = p_campaign_id and a.submitted_at is not null
         and (exists (select 1 from public.application_pipeline pl
                       where pl.application_id = a.id and pl.stage in ('shortlisted', 'interview'))
              or exists (select 1 from public.application_activity x
                          where x.application_id = a.id and x.action = 'stage_changed'
                            and x.details ->> 'to' in ('shortlisted', 'interview')))) end,
    'interviewed', case when v_small then null else (
      select count(distinct i.application_id) from public.recruitment_interviews i
       where i.campaign_id = p_campaign_id and i.status in ('scheduled', 'completed', 'no_show')) end,
    'outcomes', case when v_small then null else private.analytics_suppress((
      select jsonb_build_object('offer', count(*) filter (where d.outcome = 'offer'),
                                'reject', count(*) filter (where d.outcome = 'reject'),
                                'waitlist', count(*) filter (where d.outcome = 'waitlist'))
        from public.recruitment_decisions d
       where d.campaign_id = p_campaign_id and d.released_at is not null and d.status = 'released'), p_k, true) end,
    'offers', case when v_small then null else private.analytics_suppress((
      select jsonb_build_object('accepted', count(*) filter (where o.status = 'accepted'),
                                'declined', count(*) filter (where o.status = 'declined'),
                                'pending', count(*) filter (where o.status = 'pending'),
                                'expired', count(*) filter (where o.status in ('expired', 'withdrawn')))
        from public.recruitment_offers o where o.campaign_id = p_campaign_id), p_k, true) end);
end;
$$;

-- What remains to do in one campaign, right now (work items, never per reviewer).
create or replace function private.analytics_campaign_workflow(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.recruitment_campaigns where id = p_campaign_id),
  apps as (
    select a.id,
           exists (select 1 from public.recruitment_review_assignments ra
                    where ra.application_id = a.id and ra.removed_at is null) as assigned,
           (select count(*) from public.recruitment_reviews r
             where r.application_id = a.id and r.kind = 'application' and r.status = 'submitted') as reviews
      from public.applications a where a.campaign_id = p_campaign_id and a.status = 'submitted'
  )
  select jsonb_build_object(
    'in_review', (select count(*) from apps),
    'awaiting_assignment', (select count(*) from apps where not assigned),
    'awaiting_reviews', (select count(*) from apps, c where assigned and reviews < c.required_reviews),
    'reviews_done', (select count(*) from apps, c where reviews >= c.required_reviews),
    'reviews_submitted', (select coalesce(sum(reviews), 0) from apps),
    'interviews_to_schedule', (select count(*) from public.recruitment_interviews i
                                where i.campaign_id = p_campaign_id and i.status = 'invited'),
    'interviews_scheduled', (select count(*) from public.recruitment_interviews i
                              where i.campaign_id = p_campaign_id and i.status = 'scheduled'),
    'decisions_proposed', (select count(*) from public.recruitment_decisions d
                            where d.campaign_id = p_campaign_id and d.status = 'proposed'),
    'decisions_to_release', (select count(*) from public.recruitment_decisions d
                              where d.campaign_id = p_campaign_id and d.status = 'finalized'),
    'offers_pending', (select count(*) from public.recruitment_offers o
                        where o.campaign_id = p_campaign_id and o.status = 'pending'));
$$;

-- ---- The platform ------------------------------------------------------------------------------------------

-- The platform's statistics for a period. Sections by key, checked now:
-- platform.analytics.view (associations, content, events, recruitment in
-- totals with small groups suppressed, monthly), platform.governance.view
-- (continuity), platform.communications.monitor (message delivery). No
-- per-person figure; recruitment never below an association, never a
-- distinct-candidate count across associations.
create or replace function public.platform_analytics(
  p_from date,
  p_to date,
  p_compare_from date default null,
  p_compare_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_view boolean := private.user_has_platform_permission(v_actor, 'platform.analytics.view', now());
  v_configure boolean := private.user_has_platform_permission(v_actor, 'platform.analytics.configure', now());
  v_governance boolean := private.user_has_platform_permission(v_actor, 'platform.governance.view', now());
  v_messages boolean := private.user_has_platform_permission(v_actor, 'platform.communications.monitor', now());
  v_k integer := private.analytics_k();
  v_s timestamptz;
  v_e timestamptz;
  v_sums jsonb;
  v_compare jsonb;
  v_sections jsonb := '{}'::jsonb;
begin
  if not (v_view or v_governance or v_messages) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  perform private.analytics_check_period(p_from, p_to);
  if p_compare_from is not null or p_compare_to is not null then
    perform private.analytics_check_period(p_compare_from, p_compare_to);
  end if;
  v_s := private.paris_start_of(p_from);
  v_e := private.paris_start_of(p_to + 1);
  v_sums := private.analytics_sums(null, true, p_from, p_to);
  v_compare := case when p_compare_from is null then null else private.analytics_sums(null, true, p_compare_from, p_compare_to) end;

  if v_view then
    v_sections := v_sections || jsonb_build_object(
      'associations', jsonb_build_object(
        'active', (select count(*) from public.organizations o where o.kind = 'association' and o.status = 'active'),
        'pages_public', (select count(*) from public.organizations o
                          where o.kind = 'association' and private.association_page_is_public(o.id)),
        'created', (select count(*) from public.organizations o
                     where o.kind = 'association' and o.created_at >= v_s and o.created_at < v_e),
        'archived', (select count(*) from public.organizations o
                      where o.kind = 'association' and o.archived_at >= v_s and o.archived_at < v_e),
        'memberships_active', (select count(*) from public.memberships m
                                join public.organizations o on o.id = m.organization_id
                               where m.status = 'active' and o.status = 'active'),
        'members_distinct', (select count(distinct m.user_id) from public.memberships m
                              join public.organizations o on o.id = m.organization_id
                             where m.status = 'active' and o.status = 'active')),
      'content', jsonb_build_object(
        'online', (select count(*) from public.posts p where p.publication = 'published' and p.hidden_at is null),
        'approvals_waiting', (select count(*) from public.post_revisions r where r.status = 'submitted'),
        'hidden', (select count(*) from public.posts p where p.hidden_at is not null),
        'series', private.analytics_series(null, true, p_from, p_to, array['posts']),
        'by_association', coalesce((
          select jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'published', x.n) order by x.n desc, o.name)
            from (select d.organization_id, sum(d.value)::integer as n from private.analytics_daily d
                   where d.day between p_from and p_to and d.metric = 'posts.published' group by d.organization_id) as x
            join public.organizations o on o.id = x.organization_id), '[]'::jsonb)),
      'events', jsonb_build_object(
        'upcoming', (select count(*) from public.events e
                      where e.publication = 'published' and e.hidden_at is null and e.status = 'scheduled' and e.starts_at > now()),
        'confirmed_for_held', (select count(*) from public.event_registrations r join public.events e on e.id = r.event_id
                                where r.status = 'confirmed' and e.status = 'scheduled'
                                  and e.ends_at >= v_s and e.ends_at < v_e and e.ends_at <= now()),
        'series', private.analytics_series(null, true, p_from, p_to, array['events', 'registrations']),
        'by_association', coalesce((
          select jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'held', x.held, 'cancelled', x.cancelled,
                                              'registrations', x.regs) order by x.held desc, o.name)
            from (select d.organization_id,
                         coalesce(sum(d.value) filter (where d.metric = 'events.held'), 0)::integer as held,
                         coalesce(sum(d.value) filter (where d.metric = 'events.cancelled'), 0)::integer as cancelled,
                         coalesce(sum(d.value) filter (where d.metric = 'registrations.created'), 0)::integer as regs
                    from private.analytics_daily d
                   where d.day between p_from and p_to and d.metric in ('events.held', 'events.cancelled', 'registrations.created')
                   group by d.organization_id) as x
            join public.organizations o on o.id = x.organization_id), '[]'::jsonb)),
      'recruitment', jsonb_build_object(
        'campaigns_open', (select count(*) from public.recruitment_campaigns c
                            where c.hidden_at is null and private.campaign_state(c) = 'open'),
        'campaigns_published', (select count(*) from public.recruitment_campaigns c
                                 where c.first_published_at >= v_s and c.first_published_at < v_e),
        'positions_open', (select count(*) from public.recruitment_positions ps
                            join public.recruitment_campaigns c on c.id = ps.campaign_id
                           where ps.retired_at is null and c.hidden_at is null and private.campaign_state(c) = 'open'),
        -- Monthly only (a daily campus-wide series would let one tell a single
        -- application apart), and a month under k shows as hidden.
        'submitted_by_month', coalesce((
          select jsonb_agg(jsonb_build_array(x.m, case when x.n < v_k then null else x.n end) order by x.m)
            from (select to_char(d.day, 'YYYY-MM') as m, sum(d.value)::integer as n from private.analytics_daily d
                   where d.day between p_from and p_to and d.metric = 'applications.submitted'
                   group by to_char(d.day, 'YYYY-MM')) as x), '[]'::jsonb),
        'by_association', private.analytics_suppress((
          select coalesce(jsonb_object_agg(o.name, x.n), '{}'::jsonb)
            from (select d.organization_id, sum(d.value)::integer as n from private.analytics_daily d
                   where d.day between p_from and p_to and d.metric = 'applications.submitted'
                   group by d.organization_id) as x
            join public.organizations o on o.id = x.organization_id), v_k, false),
        'outcomes', private.analytics_suppress(jsonb_build_object(
          'offer', coalesce((v_sums ->> 'decisions.released:offer')::integer, 0),
          'reject', coalesce((v_sums ->> 'decisions.released:reject')::integer, 0),
          'waitlist', coalesce((v_sums ->> 'decisions.released:waitlist')::integer, 0)), v_k, true),
        'offers', private.analytics_suppress(jsonb_build_object(
          'accepted', coalesce((v_sums ->> 'offers.responded:accepted')::integer, 0),
          'declined', coalesce((v_sums ->> 'offers.responded:declined')::integer, 0)), v_k, true)),
      'insights', jsonb_build_object(
        'events_near_capacity', (select count(*) from public.events e
                                  where e.publication = 'published' and e.status = 'scheduled' and e.starts_at > now()
                                    and e.registration_mode = 'internal' and e.capacity is not null
                                    and (select count(*) from public.event_registrations r
                                          where r.event_id = e.id and r.status = 'confirmed') >= ceil(e.capacity * 0.9)),
        'campaigns_closing_week', (select count(*) from public.recruitment_campaigns c
                                    where c.hidden_at is null and private.campaign_state(c) = 'open'
                                      and c.closes_at <= now() + interval '7 days'),
        'approvals_waiting_2d', (select count(*) from public.post_revisions r
                                  where r.status = 'submitted' and r.submitted_at < now() - interval '2 days')));
  end if;

  if v_governance then
    v_sections := v_sections || jsonb_build_object('governance', jsonb_build_object(
      'bde_president', exists (select 1 from public.position_assignments a
                                where a.office = 'bde_president' and a.status = 'active' and a.starts_at <= now()
                                  and (a.ends_at is null or a.ends_at > now())),
      'bde_vice_president', exists (select 1 from public.position_assignments a
                                     where a.office = 'bde_vice_president' and a.status = 'active' and a.starts_at <= now()
                                       and (a.ends_at is null or a.ends_at > now())),
      'associations_without_president', (select count(*) from public.organizations o
                                          where o.kind = 'association' and o.status = 'active'
                                            and not exists (select 1 from public.position_assignments a
                                                             where a.organization_id = o.id and a.office = 'association_president'
                                                               and a.status = 'active' and a.starts_at <= now()
                                                               and (a.ends_at is null or a.ends_at > now()))),
      'mandates_ending_30d', (select count(*) from public.position_assignments a
                               where a.status = 'active' and a.office is not null and a.ends_at > now()
                                 and a.ends_at <= now() + interval '30 days'),
      'transitions_open', (select count(*) from public.leadership_transitions t where t.status = 'open'),
      'issues', jsonb_build_object(
        'critical', (select count(*) from public.governance_issues i where i.status = 'open' and i.severity = 'critical'),
        'warning', (select count(*) from public.governance_issues i where i.status = 'open' and i.severity = 'warning'),
        'info', (select count(*) from public.governance_issues i where i.status = 'open' and i.severity = 'info'))));
  end if;

  if v_messages then
    v_sections := v_sections || jsonb_build_object('messages', jsonb_build_object(
      'series', private.analytics_series(null, true, p_from, p_to, array['notifications', 'deliveries']),
      'backlog', jsonb_build_object(
        'queued', (select count(*) from public.notification_deliveries d where d.status in ('queued', 'processing')),
        'retrying', (select count(*) from public.notification_deliveries d where d.status = 'failed_retryable'),
        'oldest_queued_at', (select min(d.created_at) from public.notification_deliveries d where d.status = 'queued'))));
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'compare_period', case when p_compare_from is null then null
                           else jsonb_build_object('from', p_compare_from, 'to', p_compare_to) end,
    'rights', jsonb_build_object('view', v_view, 'configure', v_configure, 'governance', v_governance, 'messages', v_messages,
                                 'export', v_view),
    'min_group_size', v_k,
    'freshness', private.analytics_freshness(),
    -- Campus-wide period sums: content and events always, recruitment as
    -- totals only (decisions and offers go through the suppressed breakdowns above).
    'totals', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_sums)
                where (v_view and (key like 'posts.%' or key like 'events.%' or key like 'registrations.%'
                                   or (key in ('applications.submitted:', 'applications.withdrawn:') and value::text::integer >= v_k)))
                   or (v_messages and (key like 'notifications.%' or key like 'deliveries.%'))),
    'suppressed_totals', case when v_view then
      (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_each(v_sums)
        where key in ('applications.submitted:', 'applications.withdrawn:') and value::text::integer < v_k)
      else '[]'::jsonb end,
    'compare', case when v_compare is null then null else
                 (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(v_compare)
                   where (v_view and (key like 'posts.%' or key like 'events.%' or key like 'registrations.%'
                                      or (key in ('applications.submitted:', 'applications.withdrawn:') and value::text::integer >= v_k)))
                      or (v_messages and (key like 'notifications.%' or key like 'deliveries.%'))) end,
    'sections', v_sections);
end;
$$;

-- The academic years a report can cover (labels and dates only, as
-- configured in Phase 11; never a hardcoded calendar): the current one and
-- the closed ones, newest first. Any signed-in person, like
-- current_academic_year.
create or replace function public.analytics_years()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', y.label, 'starts_on', y.starts_on, 'ends_on', y.ends_on, 'status', y.status)
                            order by y.starts_on desc), '[]'::jsonb)
    from (select * from public.academic_years where status in ('current', 'closed') order by starts_on desc limit 6) as y
   where (select auth.uid()) is not null;
$$;

-- ---- Reports, settings, recompute --------------------------------------------------------------------------

-- Records an export or a printed report (who, which scope, which sections,
-- which period; never the figures) after checking the right to export:
-- analytics.export in the association, or platform.analytics.view with the
-- second factor for the platform. The figures themselves come from the
-- dashboard functions above, already restricted and suppressed.
create or replace function public.log_analytics_export(
  p_scope text,
  p_organization_id uuid,
  p_kind text,
  p_sections text[],
  p_from date,
  p_to date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if p_scope not in ('organization', 'platform') or p_kind not in ('csv', 'report')
     or p_sections is null or cardinality(p_sections) = 0 or cardinality(p_sections) > 8
     or exists (select 1 from unnest(p_sections) s
                 where s not in ('overview', 'content', 'events', 'recruitment', 'workflow', 'team', 'associations',
                                 'governance', 'messages')) then
    raise exception 'analytics_export_invalid' using errcode = 'P0001';
  end if;
  perform private.analytics_check_period(p_from, p_to);
  if p_scope = 'organization' then
    perform private.require_organization_permission(v_actor, p_organization_id, 'analytics.export');
  else
    perform private.require_platform_permission(v_actor, 'platform.analytics.view');
    perform private.require_aal2();
  end if;
  perform private.log_governance_event(
    v_actor, case when p_scope = 'platform' then 'bde' else 'position' end, 'analytics_exported', 'analytics',
    case when p_scope = 'organization' then p_organization_id else private.bde_organization_id() end, null,
    'organization', case when p_scope = 'organization' then p_organization_id else private.bde_organization_id() end,
    jsonb_build_object('scope', p_scope, 'kind', p_kind, 'sections', to_jsonb(p_sections), 'from', p_from, 'to', p_to));
end;
$$;

create or replace function public.set_analytics_min_group_size(p_value integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_before integer := private.analytics_k();
begin
  perform private.require_platform_permission(v_actor, 'platform.analytics.configure');
  perform private.require_aal2();
  if p_value is null or p_value not between 3 and 20 then
    raise exception 'analytics_threshold_invalid' using errcode = 'P0001';
  end if;
  update private.analytics_settings set min_group_size = p_value, updated_by = v_actor, updated_at = now();
  perform private.log_governance_event(
    v_actor, 'bde', 'analytics_settings_changed', 'analytics', private.bde_organization_id(), null,
    'organization', private.bde_organization_id(), jsonb_build_object('min_group_size', p_value, 'before', v_before));
end;
$$;

-- Recomputes a range of days on request (a correction older than the hourly
-- window). A day whose source rows a retention rule has since deleted would
-- lose its history: the person is told so on the page before confirming.
create or replace function public.recompute_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_result jsonb;
begin
  perform private.require_platform_permission(v_actor, 'platform.analytics.configure');
  perform private.require_aal2();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 400
     or p_to > (now() at time zone 'Europe/Paris')::date then
    raise exception 'analytics_period_invalid' using errcode = 'P0001';
  end if;
  v_result := private.refresh_analytics(p_from, p_to);
  perform private.log_governance_event(
    v_actor, 'bde', 'analytics_recomputed', 'analytics', private.bde_organization_id(), null,
    'organization', private.bde_organization_id(), v_result);
  return v_result;
end;
$$;

-- ---- The job -----------------------------------------------------------------------------------------------

insert into public.scheduled_jobs (job_key, area, schedule, expected_every, critical, retryable, sort_order) values
  ('analytics-refresh', 'reports', '25 * * * *', interval '1 hour', false, true, 105);

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
    when 'analytics-refresh' then return private.run_analytics_refresh();
    else raise exception 'job_unknown' using errcode = 'P0001';
  end case;
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('analytics-refresh', '25 * * * *', 'select private.run_scheduled_job(''analytics-refresh'')');
  end if;
end;
$cron$;

-- The history so far, from the records that exist (no page view is
-- invented: none was ever collected).
-- (From the earliest day a period may start: the scan is bounded by the rows' own timestamps.)
select private.refresh_analytics(date '2020-01-01', (now() at time zone 'Europe/Paris')::date);

-- ---- Privileges ---------------------------------------------------------------------------------------------

alter table private.analytics_settings enable row level security;
alter table private.analytics_daily enable row level security;
revoke all on private.analytics_settings, private.analytics_daily from public, anon, authenticated, service_role;

revoke all on function private.analytics_source_counts(date, date) from public, anon, authenticated, service_role;
revoke all on function private.refresh_analytics(date, date) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_analytics(date, date) from public, anon, authenticated, service_role;
revoke all on function private.run_analytics_refresh() from public, anon, authenticated, service_role;
revoke all on function private.analytics_freshness() from public, anon, authenticated, service_role;
revoke all on function private.analytics_k() from public, anon, authenticated, service_role;
revoke all on function private.analytics_suppress(jsonb, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function private.analytics_check_period(date, date) from public, anon, authenticated, service_role;
revoke all on function private.analytics_sums(uuid, boolean, date, date) from public, anon, authenticated, service_role;
revoke all on function private.analytics_series(uuid, boolean, date, date, text[]) from public, anon, authenticated, service_role;
revoke all on function private.analytics_campaign_funnel(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.analytics_campaign_workflow(uuid) from public, anon, authenticated, service_role;
revoke all on function private.execute_job(text) from public, anon, authenticated, service_role;

revoke all on function public.analytics_years() from public, anon;
revoke all on function public.organization_analytics(uuid, date, date, date, date) from public, anon;
revoke all on function public.platform_analytics(date, date, date, date) from public, anon;
revoke all on function public.log_analytics_export(text, uuid, text, text[], date, date) from public, anon;
revoke all on function public.set_analytics_min_group_size(integer) from public, anon;
revoke all on function public.recompute_analytics(date, date) from public, anon;
grant execute on function public.analytics_years() to authenticated;
grant execute on function public.organization_analytics(uuid, date, date, date, date) to authenticated;
grant execute on function public.platform_analytics(date, date, date, date) to authenticated;
grant execute on function public.log_analytics_export(text, uuid, text, text[], date, date) to authenticated;
grant execute on function public.set_analytics_min_group_size(integer) to authenticated;
grant execute on function public.recompute_analytics(date, date) to authenticated;
