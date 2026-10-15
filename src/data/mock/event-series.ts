import type { EventSeries } from "@/lib/types";

/**
 * "Les 8 événements de l'année": the BDE's recurring events, in the BDE's
 * order and in its own words (source: the client's maquette). Each has a
 * neon emblem in public/brand/events/ and wears that emblem's colour
 * (same mapping as eventAccent in components/events/event-facts).
 *
 * No date, venue, price, capacity or line-up here: none is known yet. Dated
 * editions will be CampusEvent records pointing back with `seriesId`.
 */
const emblem = (file: string) => `/brand/events/${file}.png`;

const BDE = "a-very-pink-club";

export const eventSeries: EventSeries[] = [
  {
    id: "s-wei",
    slug: "wei",
    name: "Le WEI",
    subtitle: "Week-end d'intégration",
    description:
      "Deux jours hors de Paris pour lancer l'année : équipes, épreuves, soirées et une promo qui se connaît déjà avant les premiers cours.",
    period: "Septembre · rentrée",
    emblem: emblem("wei"),
    accent: "cyan",
    associationId: BDE,
  },
  {
    id: "s-boo-party",
    slug: "boo-party",
    name: "Boo Party",
    subtitle: "La Sat' Halloween",
    description:
      "Déguisements, DJ, fumée et un concours de costumes qui part toujours en vrille. On prend la salle, tu ramènes ton pire déguisement.",
    period: "Fin octobre · la nuit d'Halloween",
    emblem: emblem("boo-party"),
    accent: "violet",
    associationId: BDE,
  },
  {
    id: "s-well",
    slug: "well",
    name: "Le WELL",
    subtitle: "Week-end of Listing Lists",
    description:
      "Le rendez-vous de la campagne des listes : on remplit les listes de la saison, on te place dans les bons groupes et on ouvre l'année.",
    period: "Week-end d'automne",
    emblem: emblem("well"),
    accent: "rose",
    associationId: BDE,
  },
  {
    id: "s-rose-rain",
    slug: "rose-rain",
    name: "Rose Rain",
    subtitle: "Saint-Valentin",
    description:
      "On vient seul, à deux ou à dix : on se met sur la liste et on voit ce que la nuit décide. Dress code rose, évidemment.",
    period: "Autour du 14 février",
    emblem: emblem("rose-rain"),
    accent: "rose",
    associationId: BDE,
  },
  {
    id: "s-desintegration",
    slug: "desintegration",
    name: "La soirée de Désintégration",
    subtitle: "La soirée de fin d'année",
    description:
      "Dernière soirée avant l'été, derniers verres avec la promo, et la playlist qui finit tout le monde. On ferme l'année en rose.",
    period: "Fin d'année universitaire",
    emblem: emblem("desintegration"),
    accent: "vert",
    associationId: BDE,
  },
  {
    id: "s-apero-attack",
    slug: "apero-attack",
    name: "L'Apéro Attack",
    subtitle: "Apéro aux Champs de Mars",
    description:
      "L'apéro BDE en plein air aux Champs de Mars : on se retrouve tous à la même heure, on occupe la pelouse et on y reste jusqu'au coucher du soleil.",
    period: "Printemps / début d'été",
    emblem: emblem("apero-attack"),
    accent: "or",
    associationId: BDE,
  },
  {
    id: "s-barathons",
    slug: "barathons",
    name: "Les Barathons",
    subtitle: "Rue Princesse × rue Mouffetard",
    description:
      "Notre classique des deux rues : on part de la rue Princesse, on traverse jusqu'à la rue Mouffetard, et on ne s'arrête qu'au dernier bar.",
    period: "Plusieurs dates dans l'année",
    emblem: emblem("barathons"),
    accent: "bleu",
    associationId: BDE,
  },
  {
    id: "s-campagne-des-listes",
    slug: "campagne-des-listes",
    name: "La Campagne des listes",
    subtitle: "L'ouverture des listes de l'année",
    description:
      "Le fil rouge de l'année : chaque inscription sur les listes de nos événements te fait monter au classement, et les finalistes décrochent la priorité sur le WELL.",
    period: "Automne · toute la saison des listes",
    emblem: emblem("campagne-des-listes"),
    accent: "orange",
    associationId: BDE,
  },
];
