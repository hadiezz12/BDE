import type { UserProfile } from "@/lib/types";

/**
 * DEVELOPMENT PREVIEW ONLY. The fictional account behind the association
 * workspace preview (lib/manage-preview.ts, `next dev` only): clearly a demo
 * account, never a realistic person, empty on purpose. Real students are
 * Supabase Auth users with a row in public.profiles; nobody manages an
 * association before Phase 4.
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
