-- Profile pictures: a PRIVATE bucket. Each person reads and writes only the
-- folder named after their user id ("avatars/{user_id}/{uuid}.webp"); there
-- is no public URL. The app shows a picture through a short-lived signed URL.
-- A later phase decides what becomes visible to others (e.g. on team pages).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object names: "<own user id>/<uuid>.<webp|png|jpg>". The first folder is
-- the authorization; the file name carries no personal data.
create policy avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$')
  );

create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpg)$')
  );

create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Same rule as profiles: someone who enrolled MFA must finish it first.
-- Restrictive, and limited to this bucket so other buckets are unaffected.
create policy avatars_require_mfa_when_enrolled
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'avatars' or (select private.mfa_requirement_met()))
  with check (bucket_id <> 'avatars' or (select private.mfa_requirement_met()));
