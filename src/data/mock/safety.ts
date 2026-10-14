import type { SafetyContact, SafetyHotline, SafetyPractice } from "@/lib/types";

/**
 * VSS / VDH page content.
 *  - National numbers and the government site are REAL: keep them exact.
 *  - Campus contacts (names, rooms, hours, addresses) are Phase 1
 *    PLACEHOLDERS on the gem.exemple.fr domains; the BDE and the school must
 *    confirm each one before launch. The page labels them as such.
 *  - Event practices follow what the VPC already says in its own copy
 *    (association profile, event pages, WEI recap).
 */

export const safetyHotlines: SafetyHotline[] = [
  {
    id: "h-17",
    number: "17",
    name: "Police secours",
    detail: "Danger immédiat : agression en cours, quelqu'un te suit, te menace ou t'empêche de partir.",
    href: "tel:17",
    actionLabel: "Appeler le 17",
    kind: "urgence",
  },
  {
    id: "h-112",
    number: "112",
    name: "Urgences, partout en Europe",
    detail: "Le même numéro dans toute l'Union européenne, depuis un fixe ou un portable.",
    href: "tel:112",
    actionLabel: "Appeler le 112",
    kind: "urgence",
  },
  {
    id: "h-114",
    number: "114",
    name: "Urgence par SMS",
    detail: "Si tu ne peux pas parler : écris où tu es et ce qui se passe. Aussi pour les personnes sourdes ou malentendantes.",
    href: "sms:114",
    actionLabel: "Écrire au 114",
    kind: "urgence",
  },
  {
    id: "h-3919",
    number: "3919",
    name: "Violences Femmes Info",
    detail:
      "Écoute, information et orientation pour les femmes victimes de violences et pour leur entourage. Gratuit, anonyme, 24 h/24 et 7 j/7.",
    href: "tel:3919",
    actionLabel: "Appeler le 3919",
    kind: "ecoute",
  },
  {
    id: "h-arretons",
    number: "arretonslesviolences.gouv.fr",
    name: "Arrêtons les violences",
    detail:
      "Le site du gouvernement : comprendre tes droits, trouver une association près de chez toi, savoir comment signaler, y compris en ligne.",
    href: "https://arretonslesviolences.gouv.fr",
    actionLabel: "Ouvrir le site",
    kind: "ecoute",
  },
];

export const safetyContacts: SafetyContact[] = [
  {
    id: "c-bde-cellule",
    name: "Cellule VSS & VDH du BDE",
    runBy: "Very Pink Club, le BDE",
    summary:
      "Deux référentes formées lisent les messages et tiennent la permanence. Rien ne sort de la cellule sans ton accord, y compris vis-à-vis du bureau.",
    people: "Aïcha Traoré, référente principale, et une seconde référente",
    hours: "Mardi et jeudi, 13h–14h, sans rendez-vous",
    place: "Salle A-012, porte fermée",
    email: "cellule-vss@asso.gem.exemple.fr",
    toConfirmBy: "BDE",
  },
  {
    id: "c-ecole-ecoute",
    name: "Cellule d'écoute de l'école",
    runBy: "GEM, campus de Paris",
    summary:
      "Indépendante du BDE et des associations. Elle t'écoute, t'oriente vers un·e psychologue, un·e juriste ou une association spécialisée, et t'accompagne si tu veux saisir l'école.",
    hours: "Du lundi au vendredi, 9h–17h",
    place: "Pôle vie étudiante, rez-de-chaussée",
    email: "ecoute@gem.exemple.fr",
    toConfirmBy: "école",
  },
];

export const safetyPractices: SafetyPractice[] = [
  {
    label: "Brassard rose",
    detail: "Les référent·es VSS & VDH le portent toute la nuit. Va vers elles et eux, ou demande au bar où en trouver un·e.",
  },
  {
    label: "En binôme, sobres",
    detail: "Ils et elles tournent à deux dans la salle et ne boivent pas de la soirée. C'est non négociable.",
  },
  {
    label: "Formé·es avant",
    detail: "Trois heures de formation obligatoire avant chaque événement. Sans elle, pas de brassard.",
  },
  {
    label: "Safe zone",
    detail: "À côté du vestiaire, jusqu'à la fermeture : de l'eau, des bouchons d'oreille, une chaise et quelqu'un pour t'écouter.",
  },
  {
    label: "Rentrer",
    detail: "Un·e référent·e t'aide à trouver quelqu'un avec qui rentrer, ou t'accompagne jusqu'aux taxis.",
  },
  {
    label: "Confidentiel",
    detail:
      "Ce que tu leur dis reste dans la cellule. Ils et elles font le lien avec la sécurité de la salle et les secours seulement si c'est nécessaire.",
  },
];
