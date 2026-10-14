# Very Pink Club — plateforme BDE & associations

Le hub numérique du BDE de GEM Alpine Business School, campus de Paris : agenda des soirées et événements,
associations, recrutements, fil du campus, espace étudiant et espace de gestion des associations.

> **Phase 1** — design system, architecture front et écrans représentatifs, sur données fictives.
> Aucun backend : pas d'authentification réelle, pas d'inscription, pas d'envoi de formulaire.
> La direction artistique et les règles sont documentées dans [`DESIGN.md`](DESIGN.md).

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

Le pied de page (et le menu compte sur mobile) propose **Mode démo** : afficher le site en tant que
*Visiteur*, *Étudiant·e* (Inès Belkacem) ou *Responsable asso* (Yanis Haddad, qui gère le Very Pink Club
et Ourcq FM). C'est un simple cookie lu par `src/lib/demo-session.ts` — il sera remplacé par Supabase Auth.

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
  data/mock/             contenu fictif (dates relatives à aujourd'hui) + photos Unsplash créditées
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

Logos et emblèmes : Very Pink Club. Photos de démonstration : Unsplash (licence Unsplash), crédits dans
`src/data/mock/photos.ts`. Polices : Archivo et Space Mono (Google Fonts, OFL).
