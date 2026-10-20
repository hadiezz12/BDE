-- Phase 5 · The BDE's page, in its own words.
--
-- Until now the BDE's public text lived in the Phase 1 mock layer
-- (src/data/mock/associations.ts). It is the client's real text, from its
-- maquette, so it moves here, in every environment, as the BDE's first
-- published page (draft and published identical). From now on the BDE's
-- president and vice-president edit it from the site like any association.
-- Nothing is invented: unknown facts (socials, contact, founding year, photos)
-- stay empty; the official badge is the site's own brand asset.

with content as (
  select
    'Bureau des étudiants'::text as kind_label,
    'Paris by night, version très rose.'::text as tagline,
    'Le Very Pink Club, c''est le bureau des étudiants de GEM Alpine Business School : une équipe de bénévoles qui monte les soirées, les week-ends et les apéros de l''année. On négocie les salles, on remplit les listes, on gère la sécurité — et on fait en sorte que chaque événement reste accessible.'
      || E'\n\n'
      || '8 événements, une carte à 30 €, et une promo qu''on ne lâche pas. Le Very Pink Club produit les week-ends, les soirées et les apéros de GEM Alpine Business School.' as description,
    'Permanence sur le campus et sur place pendant tous les événements. Pendant la campagne des listes, on répond au plus vite via nos réseaux.'::text as meeting_info,
    jsonb_build_array(
      jsonb_build_object('title', 'On produit tout nous-mêmes',
        'detail', 'Salles, artistes, bus, sécurité : le bureau négocie, monte et démonte chaque événement de l''année. Rien n''est sous-traité à des prestataires extérieurs.'),
      jsonb_build_object('title', 'Des prix cassés pour les adhérents',
        'detail', 'La carte cotisante à 30 € ouvre de -20 % à -40 % sur tous nos événements, toute l''année, plus l''accès à la campagne des listes.'),
      jsonb_build_object('title', 'Sécurité et VSS / VDH partout',
        'detail', 'Référent·es formé·es, briefing des équipes et canal d''alerte confidentiel ouvert 365 jours par an, sur chaque événement comme en dehors.')
    ) as pillars
),
bde as (
  select id from public.organizations where kind = 'bde'
)
update public.association_profiles p
   set kind_label = c.kind_label, tagline = c.tagline, description = c.description,
       meeting_info = c.meeting_info, pillars = c.pillars, revision = 1, updated_at = now()
  from content c, bde
 where p.organization_id = bde.id and p.stage = 'draft';

insert into public.association_profiles (organization_id, stage, kind_label, tagline, description, meeting_info, pillars, revision)
select p.organization_id, 'published', p.kind_label, p.tagline, p.description, p.meeting_info, p.pillars, p.revision
  from public.association_profiles p
  join public.organizations o on o.id = p.organization_id
 where o.kind = 'bde' and p.stage = 'draft';

update public.association_pages pg
   set status = 'published', published_revision = 1, first_published_at = now(), published_at = now()
  from public.organizations o
 where o.id = pg.organization_id and o.kind = 'bde';

select private.log_governance_event(
  null, 'provisioning', 'association_page_published', 'profile', o.id, null, 'association_page', o.id,
  jsonb_build_object('revision', 1, 'first', true, 'source', 'maquette'),
  'Texte du BDE issu de la maquette du client'
)
  from public.organizations o
 where o.kind = 'bde';
