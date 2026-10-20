-- Phase 5 · Storage for association images.
--
-- One PRIVATE bucket. Every file is a WebP the server re-encoded (no camera
-- metadata, bounded size) at "<organization_id>/<media_id>.webp". Nothing is
-- reachable by a public URL: the site serves an image through its own route,
-- reading it with the visitor's rights, so
--   - a draft image is readable only by the association's page team;
--   - a published image is readable by anyone while a public page uses it,
--     and stops being readable the moment the page is unpublished, withheld,
--     the association suspended, or the image replaced;
--   - another association's folder is never writable, whatever path a client sends.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('association-media', 'association-media', false, 10485760, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The organization a path belongs to, when the path is well formed.
create or replace function private.association_media_organization(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

revoke all on function private.association_media_organization(text) from public, anon, authenticated, service_role;
grant execute on function private.association_media_organization(text) to anon, authenticated;

-- Upload: media.manage in the organization named by the folder, well-formed name only.
create policy association_media_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'association-media'
    and private.association_media_organization(name) is not null
    and (select private.has_organization_permission(private.association_media_organization(name), 'media.manage'))
  );

-- Read: the page team of that organization (drafts included)…
create policy association_media_select_team
  on storage.objects for select to authenticated
  using (
    bucket_id = 'association-media'
    and private.association_media_organization(name) in (select private.my_page_organization_ids())
  );

-- …and anyone, for an image a public page uses in its published version.
create policy association_media_select_public
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'association-media' and private.association_media_object_is_public(name));

-- Delete: media.manage, and only a file the library no longer holds (removed,
-- or never registered because the upload failed halfway).
create policy association_media_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'association-media'
    and (select private.has_organization_permission(private.association_media_organization(name), 'media.manage'))
    and not exists (
      select 1 from public.association_media m where m.object_path = name and m.removed_at is null
    )
  );

-- No update policy: files are never overwritten (a new image gets a new name).

-- Portraits: a member who chose to show their photo, on a public page's
-- published team. The file stays in the private avatars bucket.
create policy avatars_select_public_portraits
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars' and private.portrait_object_is_public(name));

-- Same rule as everywhere: someone who enrolled MFA must finish it first.
create policy association_media_require_mfa_when_enrolled
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'association-media' or (select private.mfa_requirement_met()))
  with check (bucket_id <> 'association-media' or (select private.mfa_requirement_met()));
