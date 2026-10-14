import type { UserProfile } from "@/lib/types";
import { ago, at } from "./clock";

/** The two demo accounts: a student, and an officer who manages two associations. */
export const users: UserProfile[] = [
  {
    id: "u-ines",
    firstName: "Inès",
    lastName: "Belkacem",
    email: "ines.belkacem@gem.exemple.fr",
    programme: "Programme Grande École",
    year: "2A",
    memberships: [
      { associationId: "a-altitude", role: "Membre", since: ago(370, "12:30") },
      { associationId: "a-ourcq-fm", role: "Chroniqueuse", since: ago(28, "18:00") },
    ],
    memberCard: { number: "VPC-26-0412", season: "2026–2027", validUntil: at(260, "23:59") },
    savedEventIds: ["e-boo-party", "e-masterclass-ma-pme-familiale", "e-scene-ouverte-3", "e-ski-week-val-thorens"],
    // Past ones too: the student space lists them under "Déjà passés" ("Tu y étais").
    registeredEventIds: ["e-barathon-princesse-mouffetard", "e-pitch-night-1", "e-collecte-de-rentree"],
    managedAssociationIds: [],
  },
  {
    id: "u-yanis",
    firstName: "Yanis",
    lastName: "Haddad",
    email: "yanis.haddad@gem.exemple.fr",
    programme: "Programme Grande École",
    year: "2A",
    memberships: [
      { associationId: "a-very-pink-club", role: "VP événements", since: ago(320, "20:00") },
      { associationId: "a-ourcq-fm", role: "Co-responsable d'antenne", since: ago(210, "18:00") },
    ],
    memberCard: { number: "VPC-26-0007", season: "2026–2027", validUntil: at(260, "23:59") },
    savedEventIds: ["e-well", "e-gala-hiver", "e-live-ourcq-fm-special-listes"],
    registeredEventIds: ["e-barathon-princesse-mouffetard", "e-boo-party"],
    managedAssociationIds: ["a-very-pink-club", "a-ourcq-fm"],
  },
];
