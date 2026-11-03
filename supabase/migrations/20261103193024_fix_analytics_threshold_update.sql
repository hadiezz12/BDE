-- Phase 13 fix: the small-group threshold could not be saved on the hosted
-- project. Its update of the one-row settings table had no WHERE clause, and
-- the hosted database refuses that for API sessions (pg-safeupdate, SQLSTATE
-- 21000 "UPDATE requires a WHERE clause"); the local test database has no
-- such guard. Same function, the row named by its key. Grants are unchanged
-- (create or replace keeps them).

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
  update private.analytics_settings set min_group_size = p_value, updated_by = v_actor, updated_at = now() where id;
  perform private.log_governance_event(
    v_actor, 'bde', 'analytics_settings_changed', 'analytics', private.bde_organization_id(), null,
    'organization', private.bde_organization_id(), jsonb_build_object('min_group_size', p_value, 'before', v_before));
end;
$$;
