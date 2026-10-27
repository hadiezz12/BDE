# Guide : responsable technique de l'institution

Tu es la personne (ou le service) de l'école qui garde les comptes techniques
du site : base de données, code, hébergement, domaine, e-mails. Ces comptes
ne dépendent pas des postes du BDE : sans toi, ils partiraient avec une
promotion diplômée.

Le détail technique est dans `docs/operations/` (en anglais, pour les
développeur·ses) ; voici l'essentiel.

## Tes comptes

| Service | À vérifier |
|---|---|
| Supabase (base, comptes, fichiers, fonctions) | Le projet de production est dans une organisation de l'école ou du BDE, avec au moins deux propriétaires (toi + une personne de secours), et un plan avec sauvegardes. |
| Dépôt du code | Dans une organisation de l'école ou du BDE ; les personnes parties sont retirées. |
| Hébergement | Compte d'équipe de l'institution ; variables d'environnement à jour. |
| Domaine et DNS | Au nom du BDE ou de l'école, renouvellement automatique, date notée. |
| E-mails (Brevo) | Compte de l'institution ; domaine d'envoi authentifié. |
| Surveillance extérieure | Appelle `/api/health` et t'alerte. |

Écris tout dans **Centre de contrôle › Continuité › Registre et
sauvegardes** avec le BDE (qui détient, comment joindre, renouvellement,
vérifié le…). **Jamais de mot de passe ni de clé dedans** : les secrets
restent dans les coffres des services (Supabase Vault et secrets des
fonctions, variables de l'hébergeur), et dans ton gestionnaire de mots de
passe.

## Chaque année, avant la passation

1. Vérifie les propriétaires et la facturation de chaque service.
2. Fais une **restauration de test** dans un projet isolé (jamais sur la
   production), base **et** fichiers, puis déclare-la dans le registre.
3. Retire les accès des personnes parties et change les secrets qu'elles
   pouvaient lire (`docs/operations/technical-ownership.md`).
4. Vérifie la page Opérations : tâches à l'heure, schéma à jour, contrôle de
   sécurité sans « À corriger ».

## Déployer

Code : pull request, tests automatiques (CI) verts, fusion, déploiement par
l'hébergeur. Base : migrations du dépôt, appliquées dans l'ordre ; jamais de
modification à la main en production ; une migration ratée se corrige par une
nouvelle migration.

## En cas de panne

`docs/operations/disaster-recovery.md` : un tableau par scénario (base
indisponible, migration ratée, fichiers manquants, domaine, e-mails, compte
piraté, BDE sans direction…). Ouvre un incident sur la page Opérations pour
que le BDE suive.

## Ce que ton accès ne t'autorise pas

Tes accès techniques te permettent de lire la base directement. Ce n'est pas
une autorisation de lire les candidatures ou les contenus privés : utilise-les
seulement pour l'exploitation, et note ce que tu fais quand ça touche des
données de personnes.
