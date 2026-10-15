# Very Pink Club — plateforme BDE & associations

Le hub numérique du BDE de GEM Alpine Business School, campus de Paris : agenda des soirées et événements,
associations, recrutements, fil du campus, espace étudiant et espace de gestion des associations.

> **Phase 1** — design system, architecture front et écrans, avec **le seul contenu réel connu** : celui de
> la maquette du BDE (le Very Pink Club, ses 8 événements de l'année, la carte cotisante, la page VSS / VDH).
> Aucun backend : pas d'authentification réelle, pas d'inscription, pas de paiement, pas d'envoi de formulaire.
> La direction artistique et les règles sont documentées dans [`DESIGN.md`](DESIGN.md).

## Contenu réel uniquement

Le site part chez de vrais étudiant·es : il n'affiche que des faits donnés par le BDE (la maquette) ou des
informations publiques réelles (17, 112, 114, 3919, arretonslesviolences.gouv.fr). Aucune association, personne,
date, lieu, prix, jauge, chiffre, photo ou coordonnée inventés pour « remplir ».

- Les autres associations n'existent pas encore sur la plateforme : **chaque présidente ou président créera la page
  de son asso** (présentation, bureau, réseaux, événements, recrutements, articles).
- Les dates, lieux et tarifs de chaque édition des 8 événements seront **annoncés par le bureau**.
- Là où il manque du contenu, la page montre un état vide dessiné qui dit qui l'ajoutera.
- Les données de développement éventuelles doivent être manifestement fictives et ne jamais partir en production.

## Lancer le projet

```bash
npm install
npm run dev -- -p 3020
```

Sur la machine de dev Windows (Node portable), utiliser `H:\tools\vpc-dev.cmd`.

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de dev (Turbopack) |
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | vérification des types |

## Mode démo (Phase 1)

Le pied de page (et la page de connexion) propose **Mode démo** : afficher le site en tant que *Visiteur*
(par défaut), *Compte démo — étudiant·e* ou *Compte démo — responsable d'asso* (qui gère uniquement le Very
Pink Club). Les comptes démo ne sont pas de vraies personnes et démarrent vides : aucune inscription, candidature,
notification ni carte. C'est un simple cookie lu par `src/lib/demo-session.ts` — il sera remplacé par Supabase Auth.

## Structure

```
src/
  app/
    (site)/              pages publiques + espace étudiant (en-tête, pied de page, barre d'onglets mobile)
      events/ associations/ recruitment/ campus/ search/ vss/ login/ account/
    manage/              espace de gestion des associations (surface « studio », sa propre coque)
    actions/             server actions (démo uniquement)
    globals.css          tous les tokens du design system
  components/
    ui/ layout/ brand/ media/ states/ search/   primitives et coque partagées
    events/ associations/ recruitment/ campus/ account/ manage/ …   composants métier
  data/mock/             contenu réel de la maquette (BDE, 8 événements, carte, VSS) ; le reste est vide
  lib/
    types.ts             types du domaine (alignés sur le futur schéma Supabase)
    data/                accès aux données — la seule couche à remplacer par Supabase
    format.ts time.ts    dates en français, heure de Paris
    routes.ts            toutes les URL internes
    accents.ts           palette contrôlée des associations
    media-slots.ts       emplacements d'images (et briefs pour visuels générés)
public/brand/            logos fournis (non modifiés) et emblèmes néon des 8 événements
```

## Intégration Supabase (phases suivantes)

Les pages n'appellent que `src/lib/data/*` (fonctions `async`, `server-only`) qui renvoient des modèles
typés (`EventItem`, `CampaignItem`…). Remplacer le corps de ces fonctions par des requêtes Supabase suffit ;
les composants ne connaissent pas la source des données.

## Crédits

Logos, emblèmes et textes : Very Pink Club (maquette du BDE). Aucune photo de banque d'images.
Polices : Archivo et Space Mono (Google Fonts, OFL).
