-- Phase 4 · Permission catalog, position templates and positions.
--
-- Security never reads a title. A position has a display title ("Respo com",
-- "VP Communication") and a set of permission keys; authorization only looks
-- at the keys, their scope and the holder's mandate.
--
-- The catalog is fixed by migrations. A key is:
--   * scope 'organization' (valid inside one organization) or 'platform'
--     (BDE leadership and the continuity guardian only);
--   * grantable: may be put on an ordinary (custom) position. Platform keys
--     and the succession key never are: they belong to protected offices;
--   * delegable: may be lent temporarily (delegations);
--   * sensitive: private data (recruitment applications), granted explicitly;
--   * module_ready: the feature exists in this version. A key for a future
--     module (posts, events, recruitment…) is documented here so roles can be
--     prepared, but it proves nothing exists yet.
-- No wildcard: a new key is granted to nobody until a migration says so.
--
-- Templates are starting points. Creating a position copies the template's
-- keys into position_permissions (a snapshot): changing a template later
-- never rewrites existing positions. Editing a position's keys applies to
-- everyone holding it, immediately (the editor says so).
--
-- Protected offices (association president, BDE president, BDE
-- vice-president) are positions with a non-null `office`. The system creates
-- them; nobody edits their keys or assigns them through the ordinary team
-- functions: only succession, emergency and recovery workflows do.

create table public.permissions (
  key text primary key
    constraint permissions_key_check
    check (key ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$'),
  scope text not null
    constraint permissions_scope_check
    check (scope in ('organization', 'platform')),
  category text not null
    constraint permissions_category_check
    check (category in ('team', 'roles', 'governance', 'settings', 'content', 'events', 'media', 'recruitment', 'insights', 'platform')),
  label text not null,
  description text not null,
  is_grantable boolean not null default false,
  is_delegable boolean not null default false,
  is_sensitive boolean not null default false,
  module_ready boolean not null default false,
  sort_order smallint not null,
  constraint permissions_platform_protected_check
    check (scope = 'organization' or (not is_grantable and not is_delegable)),
  constraint permissions_delegable_grantable_check
    check (not is_delegable or is_grantable)
);

comment on table public.permissions is
  'Canonical permission catalog (migrations only). Authorization reads keys, never position titles.';

insert into public.permissions (key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order) values
  -- Team
  ('members.view', 'organization', 'team', 'Voir l''équipe', 'La liste des membres, leurs postes et leurs mandats.', true, true, false, true, 10),
  ('members.invite', 'organization', 'team', 'Inviter des membres', 'Envoyer des invitations à rejoindre l''asso, avec un poste ordinaire.', true, true, false, true, 11),
  ('members.manage', 'organization', 'team', 'Suspendre ou retirer des membres', 'Suspendre, réactiver ou retirer un membre (jamais la présidence).', true, false, false, true, 12),
  -- Roles
  ('positions.manage', 'organization', 'roles', 'Créer et modifier les postes', 'Créer des postes et choisir leurs droits, dans la limite de ses propres droits.', true, false, false, true, 20),
  ('positions.assign', 'organization', 'roles', 'Attribuer et retirer les postes', 'Donner un poste ordinaire à un membre, ou le lui retirer.', true, false, false, true, 21),
  ('delegations.manage', 'organization', 'roles', 'Déléguer ses droits', 'Prêter temporairement certains de ses droits à un membre.', true, false, false, true, 22),
  -- Governance
  ('governance.view', 'organization', 'governance', 'Voir la gouvernance', 'La présidence en cours, son mandat et les passations.', true, true, false, true, 30),
  ('audit.view', 'organization', 'governance', 'Voir l''historique', 'Qui a fait quoi dans la gestion de l''asso.', true, true, false, true, 31),
  ('governance.succession', 'organization', 'governance', 'Proposer sa succession', 'Réservé à la présidence : proposer la personne qui prendra la suite.', false, false, false, true, 32),
  -- Settings (Phase 5)
  ('organization.settings.update', 'organization', 'settings', 'Modifier la page et les réglages', 'Nom, présentation, couleur, réseaux de l''asso.', true, true, false, false, 40),
  -- Content (later phase)
  ('posts.create', 'organization', 'content', 'Écrire des articles', 'Rédiger des brouillons d''articles.', true, true, false, false, 50),
  ('posts.edit', 'organization', 'content', 'Modifier les articles', 'Modifier les articles de l''asso.', true, true, false, false, 51),
  ('posts.publish', 'organization', 'content', 'Publier les articles', 'Mettre en ligne ou retirer un article.', true, true, false, false, 52),
  -- Events (later phase)
  ('events.create', 'organization', 'events', 'Créer des événements', 'Préparer de nouveaux événements.', true, true, false, false, 60),
  ('events.edit', 'organization', 'events', 'Modifier les événements', 'Modifier les événements de l''asso.', true, true, false, false, 61),
  ('events.publish', 'organization', 'events', 'Publier les événements', 'Mettre en ligne ou annuler un événement.', true, true, false, false, 62),
  -- Media (later phase)
  ('media.manage', 'organization', 'media', 'Gérer la médiathèque', 'Ajouter et retirer les photos et visuels.', true, true, false, false, 70),
  -- Recruitment (later phase). Applications are private data: explicit grant
  -- only, never delegable, and later narrowed to a campaign or a position.
  ('recruitment.campaigns.manage', 'organization', 'recruitment', 'Gérer les campagnes', 'Créer et ouvrir les campagnes de recrutement.', true, true, false, false, 80),
  ('recruitment.questions.manage', 'organization', 'recruitment', 'Gérer les formulaires', 'Choisir les questions posées aux candidat·es.', true, true, false, false, 81),
  ('recruitment.applications.view', 'organization', 'recruitment', 'Lire les candidatures', 'Les réponses et les CV des candidat·es (données personnelles).', true, false, true, false, 82),
  ('recruitment.applications.review', 'organization', 'recruitment', 'Évaluer les candidatures', 'Noter et commenter les candidatures.', true, false, true, false, 83),
  ('recruitment.applications.export', 'organization', 'recruitment', 'Exporter les candidatures', 'Télécharger les candidatures hors du site.', true, false, true, false, 84),
  -- Insights (later phase)
  ('analytics.view', 'organization', 'insights', 'Voir les statistiques', 'Les chiffres de fréquentation de l''asso.', true, true, false, false, 90),
  -- Platform: BDE leadership and the continuity guardian only.
  ('platform.governance.view', 'platform', 'platform', 'Voir la gouvernance de la plateforme', 'Les présidences de toutes les assos, les passations en cours et les manques.', false, false, false, true, 100),
  ('platform.organizations.manage', 'platform', 'platform', 'Créer et archiver les assos', 'Créer une asso, la publier, la suspendre ou l''archiver.', false, false, false, true, 101),
  ('platform.associations.intervene', 'platform', 'platform', 'Intervenir sur une présidence', 'En cas d''urgence, mettre fin à une présidence d''asso ou en nommer une.', false, false, false, true, 102),
  ('platform.bde.succession', 'platform', 'platform', 'Passation du BDE', 'Proposer et approuver la nouvelle présidence et vice-présidence du BDE.', false, false, false, true, 103),
  ('platform.audit.view', 'platform', 'platform', 'Voir l''historique de la plateforme', 'Les actions de gouvernance de toutes les assos.', false, false, false, true, 104),
  ('platform.content.moderate', 'platform', 'platform', 'Modérer les contenus publics', 'Retirer un contenu public qui pose problème.', false, false, false, false, 105),
  ('platform.recovery', 'platform', 'platform', 'Reprise d''urgence du BDE', 'Rétablir une présidence ou une vice-présidence du BDE quand elle manque.', false, false, false, true, 106);

create table public.position_templates (
  key text primary key
    constraint position_templates_key_check check (key ~ '^[a-z_]+$'),
  label text not null,
  description text not null,
  -- Set on the three protected offices, which nobody picks in the editor.
  office text
    constraint position_templates_office_check
    check (office in ('association_president', 'bde_president', 'bde_vice_president')),
  sort_order smallint not null,
  constraint position_templates_office_key unique (office)
);

comment on table public.position_templates is
  'Starting points for positions (migrations only). Creating a position copies the template''s keys.';

create table public.position_template_permissions (
  template_key text not null
    constraint position_template_permissions_template_key_fkey references public.position_templates (key) on delete cascade,
  permission_key text not null
    constraint position_template_permissions_permission_key_fkey references public.permissions (key) on delete restrict,
  constraint position_template_permissions_pkey primary key (template_key, permission_key)
);

insert into public.position_templates (key, label, description, office, sort_order) values
  ('association_president', 'Présidence', 'Gère toute l''asso. Ne se transmet que par une passation.', 'association_president', 1),
  ('bde_president', 'Présidence du BDE', 'Gère le BDE et la gouvernance de la plateforme. Passation à double approbation.', 'bde_president', 2),
  ('bde_vice_president', 'Vice-présidence du BDE', 'Mêmes responsabilités que la présidence du BDE, par une autre personne.', 'bde_vice_president', 3),
  ('vice_president', 'Vice-présidence', 'Large gestion au quotidien : équipe, contenus, événements, recrutements.', null, 10),
  ('communications', 'Communication', 'Articles et médias.', null, 11),
  ('events', 'Événements', 'Création et publication des événements.', null, 12),
  ('recruitment_manager', 'Responsable recrutement', 'Campagnes, formulaires et candidatures.', null, 13),
  ('recruitment_reviewer', 'Évaluation des candidatures', 'Lire et évaluer les candidatures.', null, 14),
  ('treasurer', 'Trésorerie', 'Voit l''équipe et les chiffres, sans accès aux données privées.', null, 15),
  ('member', 'Membre', 'Fait partie de l''asso, sans droit de gestion.', null, 16),
  ('custom', 'Sur mesure', 'Choisis chaque droit toi-même.', null, 17);

-- The offices: every organization key that exists today, chosen one by one
-- (the BDE hands over by dual approval, not by the association succession key).
insert into public.position_template_permissions (template_key, permission_key)
select t.key, p.key
  from public.position_templates t
  cross join public.permissions p
 where t.office is not null
   and p.scope = 'organization'
   and not (t.office <> 'association_president' and p.key = 'governance.succession');

-- BDE offices also carry the platform keys, except the guardian's recovery.
insert into public.position_template_permissions (template_key, permission_key)
select t.key, p.key
  from public.position_templates t
  cross join public.permissions p
 where t.office in ('bde_president', 'bde_vice_president')
   and p.scope = 'platform'
   and p.key <> 'platform.recovery';

insert into public.position_template_permissions (template_key, permission_key) values
  ('vice_president', 'members.view'),
  ('vice_president', 'members.invite'),
  ('vice_president', 'positions.assign'),
  ('vice_president', 'governance.view'),
  ('vice_president', 'audit.view'),
  ('vice_president', 'organization.settings.update'),
  ('vice_president', 'posts.create'),
  ('vice_president', 'posts.edit'),
  ('vice_president', 'posts.publish'),
  ('vice_president', 'events.create'),
  ('vice_president', 'events.edit'),
  ('vice_president', 'events.publish'),
  ('vice_president', 'media.manage'),
  ('vice_president', 'recruitment.campaigns.manage'),
  ('vice_president', 'recruitment.questions.manage'),
  ('vice_president', 'analytics.view'),
  ('communications', 'members.view'),
  ('communications', 'posts.create'),
  ('communications', 'posts.edit'),
  ('communications', 'posts.publish'),
  ('communications', 'media.manage'),
  ('events', 'members.view'),
  ('events', 'events.create'),
  ('events', 'events.edit'),
  ('events', 'events.publish'),
  ('events', 'media.manage'),
  ('recruitment_manager', 'members.view'),
  ('recruitment_manager', 'recruitment.campaigns.manage'),
  ('recruitment_manager', 'recruitment.questions.manage'),
  ('recruitment_manager', 'recruitment.applications.view'),
  ('recruitment_manager', 'recruitment.applications.review'),
  ('recruitment_manager', 'recruitment.applications.export'),
  ('recruitment_reviewer', 'recruitment.applications.view'),
  ('recruitment_reviewer', 'recruitment.applications.review'),
  ('treasurer', 'members.view'),
  ('treasurer', 'analytics.view');

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    constraint positions_organization_id_fkey references public.organizations (id) on delete restrict,
  -- Display only: "Présidente", "Respo com". Never read by authorization.
  title text not null
    constraint positions_title_check
    check (title ~ '^[^[:cntrl:]]{1,60}$' and btrim(title) = title),
  description text
    constraint positions_description_check
    check (char_length(description) between 1 and 300),
  office text
    constraint positions_office_check
    check (office in ('association_president', 'bde_president', 'bde_vice_president')),
  template_key text
    constraint positions_template_key_fkey references public.position_templates (key) on delete set null,
  sort_order smallint not null default 100,
  archived_at timestamptz,
  created_by uuid
    constraint positions_created_by_fkey references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_id_organization_id_key unique (id, organization_id),
  constraint positions_office_not_archived_check check (office is null or archived_at is null)
);

comment on table public.positions is
  'Positions of an organization. `office` marks the protected ones (system-created, succession only). Titles are display only.';

create unique index positions_one_office_per_organization_idx
  on public.positions (organization_id, office)
  where office is not null;

create unique index positions_title_per_organization_idx
  on public.positions (organization_id, lower(title))
  where archived_at is null;

create trigger set_updated_at
  before update on public.positions
  for each row execute function private.set_updated_at();

-- Offices match the organization's kind, and a position never changes
-- organization or office (a custom position cannot be turned into an office).
create or replace function private.guard_position()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.office is distinct from old.office
       or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'position_identity_immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.office is not null then
    select kind into v_kind from public.organizations where id = new.organization_id;
    if (new.office = 'association_president' and v_kind <> 'association')
       or (new.office in ('bde_president', 'bde_vice_president') and v_kind <> 'bde') then
      raise exception 'office_does_not_match_organization' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_position() from public, anon, authenticated, service_role;

create trigger guard_position
  before insert or update on public.positions
  for each row execute function private.guard_position();

create table public.position_permissions (
  position_id uuid not null
    constraint position_permissions_position_id_fkey references public.positions (id) on delete cascade,
  permission_key text not null
    constraint position_permissions_permission_key_fkey references public.permissions (key) on delete restrict,
  constraint position_permissions_pkey primary key (position_id, permission_key)
);

comment on table public.position_permissions is
  'Keys granted by a position. Ordinary positions may only hold grantable organization keys (trigger).';

-- Defence in depth under the functions' own checks: an ordinary position can
-- never hold a platform key or the succession key, however a row arrives.
create or replace function private.guard_position_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_office text;
  v_scope text;
  v_grantable boolean;
begin
  select office into v_office from public.positions where id = new.position_id;
  select scope, is_grantable into v_scope, v_grantable from public.permissions where key = new.permission_key;
  if v_office is null and not (v_scope = 'organization' and v_grantable) then
    raise exception 'permission_not_grantable' using errcode = 'P0001';
  end if;
  if v_office = 'association_president' and v_scope <> 'organization' then
    raise exception 'permission_not_grantable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_position_permission() from public, anon, authenticated, service_role;

create trigger guard_position_permission
  before insert or update on public.position_permissions
  for each row execute function private.guard_position_permission();

-- The continuity guardian's keys (a platform role outside any organization).
create table public.platform_role_permissions (
  role text not null
    constraint platform_role_permissions_role_check check (role in ('guardian')),
  permission_key text not null
    constraint platform_role_permissions_permission_key_fkey references public.permissions (key) on delete restrict,
  constraint platform_role_permissions_pkey primary key (role, permission_key)
);

insert into public.platform_role_permissions (role, permission_key) values
  ('guardian', 'platform.governance.view'),
  ('guardian', 'platform.recovery');

-- The BDE's two offices exist from the start; nobody holds them until the
-- bootstrap (…_create_governance_bootstrap_and_views.sql).
insert into public.positions (organization_id, title, office, template_key, sort_order)
select o.id, t.label, t.office, t.key, t.sort_order
  from public.organizations o
  join public.position_templates t on t.office in ('bde_president', 'bde_vice_president')
 where o.kind = 'bde';

insert into public.position_permissions (position_id, permission_key)
select p.id, tp.permission_key
  from public.positions p
  join public.position_template_permissions tp on tp.template_key = p.template_key
 where p.office in ('bde_president', 'bde_vice_president');

alter table public.permissions enable row level security;
alter table public.position_templates enable row level security;
alter table public.position_template_permissions enable row level security;
alter table public.positions enable row level security;
alter table public.position_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;

revoke all on public.permissions, public.position_templates, public.position_template_permissions,
  public.positions, public.position_permissions, public.platform_role_permissions
  from anon, authenticated;
