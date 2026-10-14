import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/demo-session";
import type { Association, AssociationRef, DemoRole, UserProfile } from "@/lib/types";
import { getAssociation, getAssociationsByIds, toRef } from "./associations";
import { getEvents } from "./events";
import { getPosts } from "./posts";
import { getCampaigns } from "./recruitment";
import { getApplicants } from "./users";

/**
 * Access to the association workspace (/manage). The check lives here, next
 * to the data, because a layout does not stop its pages from rendering: the
 * [asso] layout shows the gate, and every section page asks again through
 * getManageContext() before reading anything.
 *
 * Phase 1: rights come from the demo session (UserProfile.managedAssociationIds).
 * Phase 2: the same shapes, backed by Supabase Auth + RLS.
 */

export interface ManageContext {
  association: Association;
  user: UserProfile;
  role: DemoRole;
  /** Every association this user manages, current one included (for the switcher). */
  managed: AssociationRef[];
}

export type ManageGate =
  | ({ status: "ok" } & ManageContext)
  | { status: "login"; association: Association }
  | { status: "forbidden"; association: Association; user: UserProfile; managed: AssociationRef[] };

/** Associations the current viewer manages (empty for visitors and plain students). */
export const getManagedAssociations = cache(async (): Promise<AssociationRef[]> => {
  const session = await getSession();
  if (!session.user) return [];
  return (await getAssociationsByIds(session.user.managedAssociationIds)).map(toRef);
});

/**
 * Who may open /manage/[slug]. `null` when no association has this slug.
 * Memoised per request, so the layout and the page share one lookup.
 */
export const getManageGate = cache(async (slug: string): Promise<ManageGate | null> => {
  const association = await getAssociation(slug);
  if (!association) return null;
  const session = await getSession();
  if (!session.user) return { status: "login", association };
  const managed = await getManagedAssociations();
  if (!session.user.managedAssociationIds.includes(association.id)) {
    return { status: "forbidden", association, user: session.user, managed };
  }
  return { status: "ok", association, user: session.user, role: session.role, managed };
});

/**
 * For section pages under /manage/[asso]. Call it first, before any data:
 *   const ctx = await getManageContext(asso);
 *   if (!ctx) return null; // the layout is already showing the access gate
 * Unknown slug → notFound().
 */
export async function getManageContext(slug: string): Promise<ManageContext | null> {
  const gate = await getManageGate(slug);
  if (!gate) notFound();
  if (gate.status !== "ok") return null;
  return { association: gate.association, user: gate.user, role: gate.role, managed: gate.managed };
}

/* ---- Navigation counters ----------------------------------------------- */

export type ManageCountKey = "content" | "events" | "recruitment";

export interface ManageCount {
  count: number;
  /** Spoken/visible meaning of the number, e.g. "7 candidatures à lire". */
  label: string;
}

const s = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Small "to do" numbers shown next to the sections in the management nav.
 * Real counts only: unread applications, draft posts, draft events.
 */
export async function getManageNavCounts(associationId: string): Promise<Partial<Record<ManageCountKey, ManageCount>>> {
  const [campaigns, posts, events] = await Promise.all([
    getCampaigns({ associationId }),
    getPosts({ associationId, includeUnpublished: true }),
    getEvents({ associationId, includeUnpublished: true, when: "upcoming" }),
  ]);
  const applicants = campaigns.length ? await getApplicants({ campaignIds: campaigns.map((c) => c.id) }) : [];

  const unread = applicants.filter((a) => a.status === "envoyee").length;
  const draftPosts = posts.filter((p) => p.publication === "brouillon").length;
  const draftEvents = events.filter((e) => e.publication === "brouillon").length;

  const counts: Partial<Record<ManageCountKey, ManageCount>> = {};
  if (unread) counts.recruitment = { count: unread, label: s(unread, "candidature à lire", "candidatures à lire") };
  if (draftPosts) counts.content = { count: draftPosts, label: s(draftPosts, "brouillon", "brouillons") };
  if (draftEvents) counts.events = { count: draftEvents, label: s(draftEvents, "brouillon", "brouillons") };
  return counts;
}
