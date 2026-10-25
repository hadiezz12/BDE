-- Phase 8 fixes, forward.
--
-- 1. private.form_invalid only raises: declared immutable, the planner could
--    evaluate it ahead of time with its constant argument (plpgsql_check
--    reported it raising during the check). It is volatile.
-- 2. An image sent by a recruitment manager (recruitment.campaigns.manage,
--    allowed since 20261026090000) is audited under that right, not
--    events.create.

create or replace function private.form_invalid(p_detail text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  raise exception 'form_invalid' using errcode = 'P0001', detail = left(p_detail, 200);
end;
$$;

revoke all on function private.form_invalid(text) from public, anon, authenticated, service_role;

create or replace function public.register_association_media(
  p_organization_id uuid,
  p_media_id uuid,
  p_kind text,
  p_width integer,
  p_height integer,
  p_bytes integer,
  p_alt_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_path text := p_organization_id::text || '/' || p_media_id::text || '.webp';
  v_key text;
begin
  if not private.can_upload_media(v_actor, p_organization_id) then
    raise exception 'insufficient_permission' using errcode = 'P0001';
  end if;
  v_key := case when private.user_has_organization_permission(v_actor, p_organization_id, 'media.manage', now()) then 'media.manage'
                when private.user_has_organization_permission(v_actor, p_organization_id, 'posts.create', now()) then 'posts.create'
                when private.user_has_organization_permission(v_actor, p_organization_id, 'events.create', now()) then 'events.create'
                else 'recruitment.campaigns.manage' end;
  if not exists (select 1 from storage.objects where bucket_id = 'association-media' and name = v_path) then
    raise exception 'media_not_found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.association_media where organization_id = p_organization_id and removed_at is null) >= 300 then
    raise exception 'media_quota' using errcode = 'P0001';
  end if;
  begin
    insert into public.association_media (id, organization_id, object_path, kind, width, height, bytes, alt_text, created_by)
    values (p_media_id, p_organization_id, v_path, p_kind, p_width, p_height, p_bytes, nullif(btrim(p_alt_text), ''), v_actor);
  exception
    when unique_violation or check_violation or not_null_violation then
      raise exception 'media_invalid' using errcode = 'P0001';
  end;
  perform private.log_governance_event(
    v_actor, private.authority_for(v_actor, p_organization_id, v_key), 'association_media_uploaded', 'media',
    p_organization_id, null, 'association_media', p_media_id,
    jsonb_build_object('kind', p_kind, 'width', p_width, 'height', p_height, 'bytes', p_bytes)
  );
  return p_media_id;
end;
$$;
