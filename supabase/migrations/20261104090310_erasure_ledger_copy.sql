-- Phase 15 fix (defect D1): an erasure survives a restore only if the ledger does.
--
-- The erasure ledger (private.erasure_ledger) lives in the database, so a backup
-- taken before an erasure brings back both the person AND a ledger that does not
-- know they were erased: private.reconcile_erasures() then re-applies nothing.
-- Shown by a real backup and restore (supabase/tests/restore/restore-drill.sh).
--
-- The fix keeps a copy of the ledger outside the database: the privacy officer
-- exports it (one-way keys, dates, request references: no personal data), the
-- technical owner keeps it with the off-database copies, and after a restore it
-- is imported before reconciling. The officer's desk says when the copy is older
-- than the last erasure. Nothing here can un-erase anyone: an import only adds keys.

-- The ledger as a document (no checks: callers check; not callable by API roles).
create or replace function private.erasure_ledger_document()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'vpc-erasure-ledger/1',
    'exported_at', now(),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('k', l.person_key, 'at', l.erased_at, 'ref', l.request_reference)
                                          order by l.erased_at, l.person_key)
                           from private.erasure_ledger l), '[]'::jsonb));
$$;

-- Adds the keys of an exported ledger that this database does not have. Never removes one.
create or replace function private.import_erasure_ledger(p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entries jsonb;
  v_count integer;
  v_added integer;
begin
  if p_document is null or jsonb_typeof(p_document) <> 'object'
     or p_document ->> 'format' is distinct from 'vpc-erasure-ledger/1'
     or jsonb_typeof(p_document -> 'entries') is distinct from 'array' then
    raise exception 'erasure_ledger_invalid' using errcode = 'P0001';
  end if;
  v_entries := p_document -> 'entries';
  v_count := jsonb_array_length(v_entries);
  if v_count > 100000 then
    raise exception 'erasure_ledger_invalid' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(v_entries) e
              where jsonb_typeof(e) <> 'object'
                 or coalesce(e ->> 'k', '') !~ '^[0-9a-f]{64}$'
                 or coalesce(e ->> 'at', '') = ''
                 or (e ->> 'ref' is not null and e ->> 'ref' !~ '^PR-[0-9]{6,9}$')) then
    raise exception 'erasure_ledger_invalid' using errcode = 'P0001';
  end if;
  begin
    perform (e ->> 'at')::timestamptz from jsonb_array_elements(v_entries) e;
  exception when others then
    raise exception 'erasure_ledger_invalid' using errcode = 'P0001';
  end;

  insert into private.erasure_ledger (person_key, erased_at, request_reference)
  select e ->> 'k', least((e ->> 'at')::timestamptz, now()), e ->> 'ref'
    from jsonb_array_elements(v_entries) e
  on conflict (person_key) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('entries', v_count, 'added', v_added, 'ledger', (select count(*) from private.erasure_ledger));
end;
$$;

-- The officer: download the copy (audited, counts only).
create or replace function public.export_erasure_ledger()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_doc jsonb;
begin
  perform private.require_privacy_handler(v_actor);
  v_doc := private.erasure_ledger_document();
  perform private.log_governance_event(v_actor, 'self', 'erasure_ledger_exported', 'privacy', null, null, null, null,
                                       jsonb_build_object('entries', jsonb_array_length(v_doc -> 'entries')));
  return v_doc;
end;
$$;

-- The officer, after a restore: bring the copy back in, then reconcile.
create or replace function public.import_erasure_ledger(p_document jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_out jsonb;
begin
  perform private.require_privacy_handler(v_actor);
  v_out := private.import_erasure_ledger(p_document);
  perform private.log_governance_event(v_actor, 'self', 'erasure_ledger_imported', 'privacy', null, null, null, null,
                                       jsonb_build_object('entries', v_out -> 'entries', 'added', v_out -> 'added'));
  return v_out;
end;
$$;

-- What the desk shows: how many erasures, the last one, the last copy taken, and whether the copy is behind.
create or replace function public.erasure_ledger_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_last_erasure timestamptz;
  v_last_export timestamptz;
begin
  perform private.require_privacy_handler(v_actor);
  select max(erased_at) into v_last_erasure from private.erasure_ledger;
  select max(occurred_at) into v_last_export
    from public.governance_audit_events where action = 'erasure_ledger_exported';
  return jsonb_build_object(
    'entries', (select count(*) from private.erasure_ledger),
    'last_erasure_at', v_last_erasure,
    'last_export_at', v_last_export,
    'copy_outdated', v_last_erasure is not null and (v_last_export is null or v_last_export < v_last_erasure));
end;
$$;

revoke all on function private.erasure_ledger_document() from public, anon, authenticated, service_role;
revoke all on function private.import_erasure_ledger(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.export_erasure_ledger() from public, anon, authenticated, service_role;
revoke all on function public.import_erasure_ledger(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.erasure_ledger_status() from public, anon, authenticated, service_role;
grant execute on function public.export_erasure_ledger() to authenticated;
grant execute on function public.import_erasure_ledger(jsonb) to authenticated;
grant execute on function public.erasure_ledger_status() to authenticated;
