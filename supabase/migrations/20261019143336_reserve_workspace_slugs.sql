-- /manage/plateforme (BDE control center) and /manage/continuite (guardian)
-- are fixed routes next to /manage/[asso]: an association may never take
-- those addresses, or its workspace would be unreachable.
alter table public.organizations
  add constraint organizations_slug_reserved_check
  check (slug not in ('plateforme', 'continuite'));
