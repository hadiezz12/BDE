import type { UserProfile } from "@/lib/types";

/**
 * PHASE 1 MOCK, no longer used by the workspace. It was the fictional account
 * behind the development preview of /manage, which Phase 4 replaced with
 * real, database-checked permissions (lib/governance). Clearly a demo
 * account, never a realistic person; real students are Supabase Auth users
 * with a row in public.profiles.
 */
export const users: UserProfile[] = [
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
