import type {
  SafetyAlertKind,
  SafetyCommitment,
  SafetyContact,
  SafetyHotline,
  SafetyPractice,
} from "@/lib/types";

/**
 * VSS / VDH page content.
 *  - National numbers and the government site are REAL public resources:
 *    keep them exact.
 *  - The BDE's commitments and the alert categories are the BDE's own words
 *    (source: the client's maquette).
 *  - Campus contacts: none listed. The school's VSS cell exists (commitment
 *    05) but its contact details are not known; never invent a name, room,
 *    email, phone or opening hours. Added once whoever runs it confirms them.
 *  - Event practices: none beyond what the commitments already say.
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

export const safetyContacts: SafetyContact[] = [];

export const safetyPractices: SafetyPractice[] = [];

/** "Ce à quoi nous nous tenons", in the BDE's order. */
export const safetyCommitments: SafetyCommitment[] = [
  {
    number: "01",
    title: "Tolérance zéro",
    detail:
      "Aucun comportement sexiste, sexuel, raciste, homophobe ou harcelant n'a sa place dans nos événements — ni avant, ni pendant, ni après.",
  },
  {
    number: "02",
    title: "Des référent·es formé·es",
    detail:
      "Des membres du bureau formé·es à l'accueil des victimes sont identifiables sur chaque événement, avec un briefing des équipes en début de soirée.",
  },
  {
    number: "03",
    title: "Un canal d'alerte confidentiel",
    detail:
      "Le dépôt d'alerte est ouvert toute l'année. Lieu, date, catégorie, et un moyen de te joindre : aucun compte à créer, aucun nom obligatoire.",
  },
  {
    number: "04",
    title: "Une réponse sous 48 h",
    detail: "Chaque alerte est lue par le bureau, et une réponse est apportée au contact indiqué dans les 48 h.",
  },
  {
    number: "05",
    title: "Accompagnement vers les bonnes personnes",
    detail:
      "Orientation vers la cellule VSS de l'école, les associations spécialisées et, si tu le souhaites, accompagnement au dépôt de plainte.",
  },
  {
    number: "06",
    title: "De la sécurité sur place",
    detail:
      "Staff de sécurité, point d'eau, vestiaire et équipes briefées sur toutes nos soirées : on préfère prévenir que réparer.",
  },
];

/** "Nature de l'alerte" choices of the confidential alert form, in order. */
export const safetyAlertKinds: SafetyAlertKind[] = [
  { value: "violence-sexiste", label: "Violence sexiste" },
  { value: "violence-sexuelle", label: "Violence sexuelle" },
  { value: "harcelement", label: "Harcèlement" },
  { value: "discrimination", label: "Discrimination" },
];
