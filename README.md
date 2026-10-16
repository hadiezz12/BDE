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
| `npm run typecheck` | vérification des types |
| `npm run test:unit` | tests unitaires (runner intégré de Node) |
| `npm run db:check` | connexion au projet Supabase de `.env.local` |

## Se connecter en développement

La connexion se fait avec l'adresse e-mail de l'école et un code à 6 chiffres (Supabase Auth). En
développement, des **comptes de test fictifs** (`@comptes.example.test`) entrent avec un mot de passe par
l'encadré pointillé « Comptes de test » en bas de `/login`, affiché seulement si `.env.local` contient
`AUTH_TEST_ACCOUNTS=on` (jamais en production). Les mots de passe ne sont pas dans git. Détails :
`docs/backend/authentication.md` (*Test accounts*). L'aperçu de l'espace assos (`/manage`) reste visible en
développement par le lien « Aperçu de l'espace assos » du pied de page ; en production il reste fermé jusqu'à
la Phase 4.

## Thème clair

Le site est sombre par défaut (la maquette). Le bouton soleil de l'en-tête, ou « Mode clair » dans le menu
compte sur mobile, passe le site en clair ; le choix est gardé dans un cookie. Voir `DESIGN.md` (*Light theme*).

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

## Backend Supabase (Phase 2)

Le socle backend est en place, sans tables métier pour l'instant : les pages lisent encore `src/lib/data/*`
(fonctions `async`, `server-only`) qui renvoient des modèles typés (`EventItem`, `CampaignItem`…). Chaque
fonctionnalité passera sur Supabase en remplaçant le corps de ces fonctions ; les composants ne changent pas.

- Documentation : [`docs/backend/`](docs/backend/README.md) — à lire avant de toucher à la base.
- Variables : copier `.env.example` en `.env.local` et le remplir ([environnements](docs/backend/environments.md)).
- Vérifier la connexion au projet Supabase configuré : `npm run db:check`.
- Base de données : `npm run db:migration`, `db:reset`, `db:test`, `db:lint`, `db:types` (stack locale, Docker
  requis ; la CI les exécute à chaque push) — détail dans [le workflow](docs/backend/supabase-workflow.md).
- Vérifications de l'app : `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`.

## Crédits

Logos, emblèmes et textes : Very Pink Club (maquette du BDE). Aucune photo de banque d'images.
Polices : Archivo et Space Mono (Google Fonts, OFL).
