import type { Association } from "@/lib/types";

/**
 * The associations listed on the platform. Only the BDE for now, in its own
 * words (source: the client's maquette): every other association will be
 * created by its présidente or président once the platform ships. Never add
 * one here to make the list look fuller.
 *
 * Unknown facts stay empty on purpose: no bureau names, no socials, no
 * contact address, no founding year, no member count, no photos (the UI draws
 * its own fallbacks). The BDE fills them in later.
 */
export const associations: Association[] = [
  {
    id: "a-very-pink-club",
    slug: "very-pink-club",
    name: "Very Pink Club",
    kind: "Bureau des étudiants",
    category: "bde",
    accent: "rose",
    tagline: "Paris by night, version très rose.",
    description: [
      "Le Very Pink Club, c'est le bureau des étudiants de GEM Alpine Business School : une équipe de bénévoles qui monte les soirées, les week-ends et les apéros de l'année. On négocie les salles, on remplit les listes, on gère la sécurité — et on fait en sorte que chaque événement reste accessible.",
      "8 événements, une carte à 30 €, et une promo qu'on ne lâche pas. Le Very Pink Club produit les week-ends, les soirées et les apéros de GEM Alpine Business School.",
    ],
    logo: { src: "/brand/vpc-badge.png", alt: "Logo du Very Pink Club", width: 406, height: 404 },
    gallery: [],
    socials: [],
    meetingInfo:
      "Permanence sur le campus et sur place pendant tous les événements. Pendant la campagne des listes, on répond au plus vite via nos réseaux.",
    team: [],
    highlights: ["On produit tout nous-mêmes", "Des prix cassés pour les adhérents", "Sécurité et VSS / VDH partout"],
    pillars: [
      {
        title: "On produit tout nous-mêmes",
        detail:
          "Salles, artistes, bus, sécurité : le bureau négocie, monte et démonte chaque événement de l'année. Rien n'est sous-traité à des prestataires extérieurs.",
      },
      {
        title: "Des prix cassés pour les adhérents",
        detail:
          "La carte cotisante à 30 € ouvre de -20 % à -40 % sur tous nos événements, toute l'année, plus l'accès à la campagne des listes.",
      },
      {
        title: "Sécurité et VSS / VDH partout",
        detail:
          "Référent·es formé·es, briefing des équipes et canal d'alerte confidentiel ouvert 365 jours par an, sur chaque événement comme en dehors.",
      },
    ],
  },
];
