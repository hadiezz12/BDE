-- Phase 4 · Organizations and memberships.
--
-- Single-school platform: exactly one BDE (the Very Pink Club, GEM Paris) and
-- any number of associations. The BDE row is created here, in every
-- environment, because it is the platform's root: it cannot be renamed into
-- an association, change kind, be suspended or archived.
--
-- A membership links a person to an organization. It grants nothing by
-- itself: management rights come from positions (next migrations).
--
-- Writes: none from the API roles. Every change goes through the governance
-- functions (security definer, checked, audited). Read policies arrive with
-- the authorization helpers (…_create_authorization_helpers.sql, next migrations); until then
-- RLS denies everything.
--
-- Convention notes: statuses are text + check (product states that may grow);
-- user references use on delete restrict because memberships are governance
-- history (account erasure is a later, audited privacy process).

create extension if not exists btree_gist with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint organizations_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null
    constraint organizations_name_check
    check (name ~ '^[^[:cntrl:]]{2,80}$' and btrim(name) = name),
  short_name text
    constraint organizations_short_name_check
    check (short_name ~ '^[^[:cntrl:]]{1,20}$' and btrim(short_name) = short_name),
  kind text not null
    constraint organizations_kind_check
    check (kind in ('bde', 'association')),
  -- Same keys as the site's filters (src/lib/types.ts, AssociationCategory).
  category text not null default 'autre'
    constraint organizations_category_check
    check (category in ('bde', 'sport', 'culture', 'pro', 'entrepreneuriat', 'solidarite', 'international', 'arts', 'media', 'autre')),
  -- Closed palette (src/app/globals.css, data-accent), never a free colour.
  accent text not null default 'rose'
    constraint organizations_accent_check
    check (accent in ('rose', 'cyan', 'violet', 'vert', 'or', 'bleu', 'orange', 'corail')),
  tagline text
    constraint organizations_tagline_check
    check (tagline ~ '^[^[:cntrl:]]{1,140}$' and btrim(tagline) = tagline),
  description text
    constraint organizations_description_check
    check (char_length(description) between 1 and 4000),
  -- setup: being prepared, not public · active · suspended: frozen, read-only
  -- for its team · archived: history only.
  status text not null default 'setup'
    constraint organizations_status_check
    check (status in ('setup', 'active', 'suspended', 'archived')),
  status_reason text
    constraint organizations_status_reason_check
    check (char_length(status_reason) between 1 and 500),
  created_by uuid
    constraint organizations_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint organizations_slug_key unique (slug),
  constraint organizations_bde_always_active_check check (kind <> 'bde' or status = 'active'),
  constraint organizations_bde_category_check check ((kind = 'bde') = (category = 'bde')),
  constraint organizations_archived_at_check check ((status = 'archived') = (archived_at is not null))
);

comment on table public.organizations is
  'The BDE (exactly one) and the associations. Public columns are readable; writes only through governance functions.';

-- One BDE root, ever (an immutable expression: no now(), no subquery).
create unique index organizations_single_bde_idx on public.organizations ((true)) where kind = 'bde';

create trigger set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

-- An organization keeps its identity: the BDE never becomes an association
-- and an association never becomes the BDE, whatever function writes.
create or replace function private.guard_organization_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'organization_kind_immutable' using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'organization_identity_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_organization_identity() from public, anon, authenticated, service_role;

create trigger guard_organization_identity
  before update on public.organizations
  for each row execute function private.guard_organization_identity();

create or replace function private.forbid_bde_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'bde' then
    raise exception 'bde_cannot_be_deleted' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function private.forbid_bde_deletion() from public, anon, authenticated, service_role;

create trigger forbid_bde_deletion
  before delete on public.organizations
  for each row execute function private.forbid_bde_deletion();

-- The platform's root. Real, public facts only (the client's maquette).
insert into public.organizations (slug, name, kind, category, accent, tagline, status)
values ('very-pink-club', 'Very Pink Club', 'bde', 'bde', 'rose', 'Paris by night, version très rose.', 'active');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint memberships_organization_id_fkey references public.organizations (id) on delete restrict,
  user_id uuid not null
    constraint memberships_user_id_fkey references auth.users (id) on delete restrict,
  -- active · suspended (kept, grants nothing) · ended (history). An invitation
  -- is not a membership: it lives in organization_invitations.
  status text not null default 'active'
    constraint memberships_status_check
    check (status in ('active', 'suspended', 'ended')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  status_reason text
    constraint memberships_status_reason_check
    check (char_length(status_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets assignments and delegations reference (membership, organization,
  -- user) together, so the three can never disagree.
  constraint memberships_id_organization_id_user_id_key unique (id, organization_id, user_id),
  constraint memberships_ended_at_check check ((status = 'ended') = (ended_at is not null))
);

comment on table public.memberships is
  'A person in an organization. Grants no right by itself. At most one open (not ended) membership per person and organization.';

create unique index memberships_one_open_per_person_idx
  on public.memberships (organization_id, user_id)
  where status <> 'ended';

create index memberships_user_id_idx on public.memberships (user_id);

create trigger set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

create or replace function private.guard_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id or new.joined_at is distinct from old.joined_at
     or new.created_at is distinct from old.created_at then
    raise exception 'membership_identity_immutable' using errcode = 'P0001';
  end if;
  if old.status = 'ended' and new.status <> 'ended' then
    raise exception 'membership_ended' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_membership_identity() from public, anon, authenticated, service_role;

create trigger guard_membership_identity
  before update on public.memberships
  for each row execute function private.guard_membership_identity();

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

revoke all on public.organizations from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
