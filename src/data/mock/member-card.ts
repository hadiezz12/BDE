import type { MemberCardOffer } from "@/lib/types";
import { parisDateKey } from "@/lib/time";

/**
 * The BDE's carte cotisante, exactly as the BDE presents it (source: the
 * client's maquette): price, benefits, validity, how it works. Nothing else
 * is known yet — no per-event prices (so no savings maths), no last valid
 * day, no place or hours to get it — and online payment is a later phase.
 */

/** The academic year in progress, September → August, Paris time: "2026–2027". */
function currentAcademicYear(): string {
  const [year, month] = parisDateKey(new Date()).split("-").map(Number);
  const start = month >= 9 ? year : year - 1;
  return `${start}–${start + 1}`;
}

const NB = " ";

export const memberCardOffer: MemberCardOffer = {
  associationId: "a-very-pink-club",
  price: 30,
  season: currentAcademicYear(),
  validity: "Année universitaire",
  perks: [
    `De -20${NB}% à -40${NB}% sur tous nos événements, toute l'année`,
    "Tu participes à la campagne des listes et tu peux lister",
    "Les finalistes ont la priorité et la quasi-exclusivité sur le WELL",
  ],
  summary: [
    { label: "Réductions sur les 8 événements", value: `-20${NB}% à -40${NB}%` },
    { label: "Campagne des listes", value: "Incluse" },
    { label: "Priorité sur le WELL", value: "Finalistes" },
    { label: "Validité", value: "Année universitaire" },
    { label: "Prix", value: `30${NB}€` },
  ],
  steps: [
    { title: `Tu paies 30${NB}€ en ligne`, detail: "Paiement par carte bancaire : nom, mail, téléphone." },
    { title: "On valide ta carte", detail: "Tu rejoins la liste des adhérents pour l'année." },
    { title: "Tu listes et tu profites" },
  ],
  paymentLive: false,
};
