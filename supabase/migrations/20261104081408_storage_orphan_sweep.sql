-- Phase 14 · After a Storage restore, files of erased or purged records come
-- back with no row pointing to them. The reconciliation now also queues
-- them for deletion: any CV or document in recruitment-documents that no
-- application_documents row references, and any profile photo in avatars
-- that no profile references, older than a day (an upload in progress is
-- never touched). The storage-cleanup worker deletes what is queued.

create or replace function private.queue_storage_orphans()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_docs integer;
  v_avatars integer;
begin
  insert into private.storage_cleanup_queue (bucket_id, object_path, reason)
  select o.bucket_id, o.name, 'orphan_after_restore'
    from storage.objects o
   where o.bucket_id = 'recruitment-documents'
     and coalesce((to_jsonb(o) ->> 'created_at')::timestamptz, '-infinity') < now() - interval '1 day'
     and not exists (select 1 from public.application_documents d where d.object_path = o.name)
  on conflict (bucket_id, object_path) do nothing;
  get diagnostics v_docs = row_count;
  insert into private.storage_cleanup_queue (bucket_id, object_path, reason)
  select o.bucket_id, o.name, 'orphan_after_restore'
    from storage.objects o
   where o.bucket_id = 'avatars'
     and coalesce((to_jsonb(o) ->> 'created_at')::timestamptz, '-infinity') < now() - interval '1 day'
     and not exists (select 1 from public.profiles p where p.avatar_path = o.name)
  on conflict (bucket_id, object_path) do nothing;
  get diagnostics v_avatars = row_count;
  return jsonb_build_object('documents', v_docs, 'avatars', v_avatars);
end;
$$;

-- The reconciliation after a restore: erasures again, then the files left behind.
create or replace function private.reconcile_erasures()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n integer := 0;
  v_files jsonb;
begin
  for v_user in
    select u.id from auth.users u join private.erasure_ledger l on l.person_key = private.person_key(u.id)
     where not private.is_held('person', u.id)
       and (coalesce((u.raw_app_meta_data ->> 'erased')::boolean, false) is false
        or u.email is not null
        or exists (select 1 from public.profiles p where p.id = u.id and (p.erased_at is null or p.first_name <> 'Compte'))
        or exists (select 1 from public.saved_items s where s.user_id = u.id)
        or exists (select 1 from public.applications a where a.candidate_id = u.id and not private.application_held(a))
        or exists (select 1 from public.event_registrations r where r.user_id = u.id and not private.registration_held(r))
        or exists (select 1 from public.notifications n where n.recipient_id = u.id))
  loop
    perform private.erase_person(v_user, null, null, true);
    update private.erasure_ledger set reapplied_at = now(), reapplied_count = reapplied_count + 1
     where person_key = private.person_key(v_user);
    v_n := v_n + 1;
  end loop;
  v_files := private.queue_storage_orphans();
  if v_n > 0 or (v_files ->> 'documents')::integer + (v_files ->> 'avatars')::integer > 0 then
    perform private.log_governance_event(null, 'system', 'privacy_erasures_reapplied', 'privacy', null, null, null, null,
                                         jsonb_build_object('people', v_n, 'files', v_files));
  end if;
  return jsonb_build_object('reapplied', v_n, 'ledger', (select count(*) from private.erasure_ledger), 'orphan_files', v_files);
end;
$$;

revoke all on function private.queue_storage_orphans() from public, anon, authenticated, service_role;
revoke all on function private.reconcile_erasures() from public, anon, authenticated, service_role;
