-- Phase 15 fix (defect D10): a session that has ended stops working at once.
--
-- Found by replaying a signed-in student's cookies after "Se déconnecter" (brief §24): the
-- access token is a signed JWT valid for its whole lifetime (60 minutes), and neither the
-- site (which verifies the signature locally) nor the database (which trusts the JWT)
-- asked whether the session still existed. A copied cookie kept opening /account, the
-- personal-data export and the API for up to an hour; "sign out everywhere", an erasure
-- (which deletes sessions) or a session time-box did not cut it either.
--
-- Supabase Auth puts the session's id in every user token (claim session_id) and deletes
-- the row of auth.sessions when the session ends (sign-out, sign-out everywhere, erasure,
-- refresh-token reuse), and sets not_after when a time-box applies. So:
--   * private.session_alive(): true when the token names no session (database jobs, the
--     service role, the pgTAP tests' simulated claims) or when that session still exists
--     and has not passed not_after;
--   * private.require_actor(), the first line of nearly every function the site calls,
--     refuses a dead session as not_authenticated;
--   * every table students can read directly gets a RESTRICTIVE policy with the same test,
--     and so do Storage objects (CVs, photos): a dead session reads nothing;
--   * public.session_alive() lets the site treat such a session as signed out.
-- A posture test (security_matrix.test.sql) keeps every directly readable table covered.

create or replace function private.session_alive()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session text := (select auth.jwt()) ->> 'session_id';
begin
  if v_session is null or v_session = '' then
    return true;
  end if;
  if v_session !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (select 1 from auth.sessions s
                  where s.id = v_session::uuid
                    and (s.not_after is null or s.not_after > now()));
end;
$$;
comment on function private.session_alive() is
  'Is the session named by the caller''s token still open? (No session in the token: nothing to check.) Phase 15, D10.';
revoke all on function private.session_alive() from public, anon, authenticated, service_role;
-- Row-level security policies run as the reader: they need to call it.
grant execute on function private.session_alive() to authenticated;

create or replace function private.require_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  -- A token whose session has ended (signed out, everywhere, erased, timed out) is no longer anyone.
  if not private.session_alive() then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if not private.mfa_requirement_met() then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return v_actor;
end;
$$;
revoke all on function private.require_actor() from public, anon, authenticated, service_role;

-- For the site: is this request's session still open?
create or replace function public.session_alive()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.session_alive();
$$;
revoke all on function public.session_alive() from public, anon, authenticated, service_role;
grant execute on function public.session_alive() to authenticated;

-- Every table a student can read directly: nothing for a dead session.
do $$
declare
  t record;
begin
  for t in
    select distinct c.relname
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema
     where g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
       and g.table_schema = 'public' and c.relkind = 'r' and c.relrowsecurity
     order by c.relname
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select private.session_alive())) with check ((select private.session_alive()))',
      t.relname || '_live_session', t.relname);
  end loop;
end;
$$;

-- Storage (CVs, documents, photos, association media): the same.
create policy objects_live_session on storage.objects as restrictive for all to authenticated
  using ((select private.session_alive())) with check ((select private.session_alive()));

-- The three functions that read the caller's own data without private.require_actor(): same rule.
create or replace function public.my_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.session_alive() or not private.mfa_requirement_met() then
    return null;
  end if;
  return jsonb_build_object(
    'platform', coalesce((
      select jsonb_agg(k.key order by k.sort_order)
        from public.permissions k
       where k.scope = 'platform'
         and private.user_has_platform_permission(v_user, k.key, now())
    ), '[]'::jsonb),
    'is_guardian', private.guardian_user(now()) is not distinct from v_user and v_user is not null,
    'organizations', coalesce((
      select jsonb_agg(org order by (org ->> 'kind') = 'bde' desc, org ->> 'name')
        from (
          select jsonb_build_object(
                   'id', o.id,
                   'slug', o.slug,
                   'name', o.name,
                   'short_name', o.short_name,
                   'kind', o.kind,
                   'accent', o.accent,
                   'status', o.status,
                   'membership_id', m.id,
                   'membership_status', m.status,
                   'permissions', coalesce((
                     select jsonb_agg(k.key order by k.sort_order)
                       from public.permissions k
                      where k.scope = 'organization'
                        and private.user_has_organization_permission(v_user, o.id, k.key, now())
                   ), '[]'::jsonb),
                   'positions', coalesce((
                     select jsonb_agg(jsonb_build_object('title', p.title, 'office', a.office, 'ends_at', a.ends_at) order by p.sort_order, p.title)
                       from public.position_assignments a
                       join public.positions p on p.id = a.position_id
                      where a.membership_id = m.id
                        and a.status = 'active'
                        and a.starts_at <= now()
                        and now() < a.ends_at
                   ), '[]'::jsonb),
                   -- Phase 9: a live appointment to one of its recruitment committees.
                   'recruitment_committee', exists (
                     select 1 from public.recruitment_committee_members cm
                      where cm.organization_id = o.id and cm.user_id = v_user
                        and cm.id = private.live_committee_member_id(v_user, cm.campaign_id))
                 ) as org
            from public.memberships m
            join public.organizations o on o.id = m.organization_id
           where m.user_id = v_user
             and m.status <> 'ended'
        ) s
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.am_i_following(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.notification_follows f
                  where f.user_id = (select auth.uid()) and f.organization_id = p_organization_id)
     and private.session_alive();
$function$;

create or replace function public.my_notification_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'unread', (select count(*) from (select 1 from public.notifications n
                                      where n.recipient_id = (select auth.uid()) and n.read_at is null and n.archived_at is null
                                      limit 100) s),
    'latest', coalesce((select jsonb_agg(private.notification_item(x.n) order by (x.n).created_at desc, (x.n).id desc)
                          from (select n from public.notifications n
                                 where n.recipient_id = (select auth.uid()) and n.archived_at is null
                                 order by n.created_at desc, n.id desc limit 5) x), '[]'::jsonb))
   where (select auth.uid()) is not null and private.session_alive();
$function$;

-- The security self-check (Phase 11) knows the new policy helper.
create or replace function public.security_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                                     'can_delete_application_document', 'session_alive')))
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
$function$;
