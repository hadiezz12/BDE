import "server-only";
import { associations } from "@/data/mock";
import type { Association, AssociationCategory, AssociationRef } from "@/lib/types";

/**
 * Data access for associations. Mock-backed in Phase 1; each function keeps
 * its signature when it moves to Supabase, so pages never change.
 */

export function toRef(a: Association): AssociationRef {
  const { id, slug, name, shortName, kind, category, accent, logo } = a;
  return { id, slug, name, shortName, kind, category, accent, logo };
}

const byId = new Map(associations.map((a) => [a.id, a]));

/** Synchronous lookup used while joining other entities. */
export function associationRef(id: string): AssociationRef {
  const a = byId.get(id);
  if (!a) throw new Error(`Unknown association ${id}`);
  return toRef(a);
}

function normalise(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export async function getAssociations(filter: { category?: AssociationCategory; q?: string } = {}) {
  const q = filter.q ? normalise(filter.q.trim()) : "";
  return associations
    .filter((a) => !filter.category || a.category === filter.category)
    .filter(
      (a) =>
        !q ||
        normalise([a.name, a.shortName, a.kind, a.tagline, ...a.description].join(" ")).includes(q),
    )
    .sort((a, b) => (a.category === "bde" ? -1 : b.category === "bde" ? 1 : a.name.localeCompare(b.name, "fr")));
}

export async function getAssociation(slug: string): Promise<Association | null> {
  return associations.find((a) => a.slug === slug) ?? null;
}

export async function getAssociationById(id: string): Promise<Association | null> {
  return byId.get(id) ?? null;
}

export async function getAssociationsByIds(ids: string[]): Promise<Association[]> {
  return ids.map((id) => byId.get(id)).filter((a): a is Association => Boolean(a));
}

/** Category counts for filter chips. */
export async function getAssociationCategoryCounts(): Promise<Partial<Record<AssociationCategory, number>>> {
  const counts: Partial<Record<AssociationCategory, number>> = {};
  for (const a of associations) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return counts;
}
