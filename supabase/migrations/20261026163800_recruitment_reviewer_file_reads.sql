-- Phase 9 follow-up: reviewers download a candidate's file with their own
-- session, no privileged key.
--
-- public.recruitment_document checks the caller's access to the file
-- (application_can 'documents') and records the opening in
-- application_access_log. The Storage read policy now honours that record
-- for two minutes, for that caller and that one file, and checks the access
-- again at read time (an appointment revoked in between closes it). The
-- candidate's own reads are unchanged. Nobody else, the privileged client
-- included, is involved in a reviewer's download.

create or replace function private.can_read_application_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.application_documents d
      join public.applications a on a.id = d.application_id
     where d.object_path = p_name and d.status <> 'removed'
       and a.candidate_id = (select auth.uid()))
  or exists (
    select 1
      from public.application_access_log l
      join public.application_documents d on d.id = l.document_id
      join public.applications a on a.id = d.application_id
     where l.actor_id = (select auth.uid()) and l.action = 'document_opened'
       and l.occurred_at > now() - interval '2 minutes'
       and d.object_path = p_name and d.status = 'ready' and a.status = 'submitted'
       and private.application_can((select auth.uid()), a, 'documents'));
$$;
