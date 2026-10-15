import type { UserProfile } from "@/lib/types";

/**
 * PHASE 1 DEMO ONLY. The two accounts behind the demo switch (lib/demo-session):
 * clearly labelled as demo, never a realistic person, and empty on purpose —
 * no programme, no email, no card, no registrations, no memberships. The
 * officer account manages the Very Pink Club and nothing else.
 *
 * `firstName` + `lastName` still read as a name in the UI ("Compte démo
 * étudiant·e"); `demoLabel` is the full label to show where it matters.
 */
export const users: UserProfile[] = [
  {
    id: "u-demo-etudiant",
    firstName: "Compte démo",
    lastName: "étudiant·e",
    demoLabel: "Compte démo — étudiant·e",
    email: "",
    programme: "",
    year: "",
    memberships: [],
    savedEventIds: [],
    registeredEventIds: [],
    managedAssociationIds: [],
  },
  {
    id: "u-demo-responsable",
    firstName: "Compte démo",
    lastName: "responsable d'asso",
    demoLabel: "Compte démo — responsable d'asso",
    email: "",
    programme: "",
    year: "",
    memberships: [],
    savedEventIds: [],
    registeredEventIds: [],
    managedAssociationIds: ["a-very-pink-club"],
  },
];
