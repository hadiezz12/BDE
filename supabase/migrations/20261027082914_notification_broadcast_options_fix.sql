-- Phase 10 · Fix: each audience option carries its own estimate.
-- `array || object || object` appended the estimate as a separate element of
-- the array; the option and its counts are now one object.

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
      v_options := v_options || jsonb_build_array(
        jsonb_build_object('audience', v_audience) || private.broadcast_estimate(p_organization_id, v_audience));
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
