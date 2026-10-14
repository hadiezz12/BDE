import type { MemberCardOffer } from "@/lib/types";
import { parisDateKey, parisISO } from "@/lib/time";

/**
 * The BDE's carte cotisante. The season follows the school year (September
 * to June) so the demo stays current; the member/standard prices themselves
 * live on each event (src/data/mock/events.ts).
 */
function currentSeason(): { label: string; endYear: number } {
  const [year, month] = parisDateKey(new Date()).split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return { label: `${start}–${start + 1}`, endYear: start + 1 };
}

const season = currentSeason();

export const memberCardOffer: MemberCardOffer = {
  associationId: "a-very-pink-club",
  price: 30,
  season: season.label,
  validUntil: parisISO(`${season.endYear}-06-30`, "23:59"),
  perks: [
    "Le tarif adhérent sur chaque billet du BDE, du barathon de rentrée à la Soirée de Désintégration.",
    "Une seule carte pour toute l'année, nominative : tu la montres à l'entrée avec ta carte étudiante.",
  ],
  where: "Au local B-12, du lundi au jeudi de 12h30 à 14h.",
  payment: "Carte bancaire ou espèces. Prévois ta carte étudiante, elle est faite sur place.",
  note: "Sans carte, tu entres quand même : le tarif standard existe pour que personne ne reste dehors.",
  storySlug: "pourquoi-la-carte-reste-a-30-euros",
};
