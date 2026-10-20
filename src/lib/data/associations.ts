import "server-only";
import { cache } from "react";
import { associations as mockAssociations } from "@/data/mock";
import type { Association, AssociationRef, CategoryRef } from "@/lib/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SupabaseConfigError } from "@/lib/supabase/env";
import {
  toAssociation,
  type AssociationPayload,
  type CategoryCount,
  type PublicPageState,
} from "@/lib/associations/model";
import { normalizeSearch } from "@/lib/associations/search";
import { logDataError, toDataError } from "./errors";

/**
 * Public association data (Phase 5): what any visitor may see, read from the
 * database as a visitor (anon client, no cookies) through the public read
 * functions, which return only published pages of active associations.
 * Memoised per request only: a publication shows on the next page load.
 *
 * Content, events and recruitment still read the Phase 1 mock layer until
 * their phases; their few links to an association go through the mock ids
 * below (the BDE only).
 */

export function toRef(a: Association): AssociationRef {
  const { id, slug, name, shortName, kind, isBde, categories, accent, logo } = a;
  return { id, slug, name, shortName, kind, isBde, categories, accent, logo };
}

const mockById = new Map(mockAssociations.map((a) => [a.id, a]));

/**
 * Synchronous lookup used while joining the mock modules (events, posts,
 * recruitment) to their association. Those lists are empty or BDE-only until
 * their own phases.
 */
export function associationRef(id: string): AssociationRef {
  const a = mockById.get(id);
  if (!a) throw new Error(`Unknown association ${id}`);
  return toRef(a);
}

/**
 * The id the mock modules (events of the year, carte cotisante, dated events,
 * posts, recruitment) use for this association: the BDE's mock id for the
 * BDE's page, the database id otherwise. Goes away with those modules' phases.
 */
export function legacyId(a: Pick<Association, "id" | "slug">): string {
  return mockAssociations.find((m) => m.slug === a.slug)?.id ?? a.id;
}

async function rpc<T>(name: "public_associations" | "public_association_categories"): Promise<T | null> {
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    // No Supabase settings (a build without environment): nothing to show.
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }
  const { data, error } = await supabase.rpc(name);
  if (error) {
    logDataError(name, error);
    throw toDataError(error);
  }
  return data as T;
}

/** Every public page (BDE first, then by name). */
export const getPublicAssociations = cache(async (): Promise<Association[]> => {
  const payload = await rpc<AssociationPayload[]>("public_associations");
  return (payload ?? []).map((p) => toAssociation(p));
});

/** Active categories with how many public pages use each. */
export const getPublicCategories = cache(async (): Promise<CategoryCount[]> => {
  return (await rpc<CategoryCount[]>("public_association_categories")) ?? [];
});

export type AssociationSort = "nom" | "recentes";

/**
 * The directory: public pages, optionally filtered by category (slug) and by
 * a search on the name, short name, line, presentation and categories
 * (accents and case ignored; every word typed must appear).
 */
export async function getAssociations(
  filter: { category?: string | null; q?: string; sort?: AssociationSort } = {},
): Promise<Association[]> {
  const all = await getPublicAssociations();
  const words = filter.q ? normalizeSearch(filter.q).split(" ").filter(Boolean) : [];
  const list = all
    .filter((a) => !filter.category || a.categories.some((c) => c.slug === filter.category))
    .filter((a) => {
      if (words.length === 0) return true;
      const text = normalizeSearch(
        [a.name, a.shortName, a.kind, a.tagline, ...a.description, ...a.categories.map((c) => c.label)].join(" "),
      );
      return words.every((w) => text.includes(w));
    });
  if (filter.sort === "recentes") {
    return [...list].sort((x, y) => (y.firstPublishedAt ?? "").localeCompare(x.firstPublishedAt ?? ""));
  }
  return list;
}

/** One public page by its address. States other than "ok" say what to render instead. */
export const getAssociationPage = cache(async (slug: string): Promise<PublicPageState> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return { state: "not_found" };
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { state: "not_found" };
    throw error;
  }
  const { data, error } = await supabase.rpc("public_association", { p_slug: slug });
  if (error) {
    logDataError("public_association", error);
    throw toDataError(error);
  }
  return data as unknown as PublicPageState;
});

/** The public page with this address, or null (not public, moved, unknown). */
export async function getAssociation(slug: string): Promise<Association | null> {
  const page = await getAssociationPage(slug);
  return page.state === "ok" ? toAssociation(page.association) : null;
}

/** The BDE's public page. */
export async function getBde(): Promise<Association | null> {
  return (await getPublicAssociations()).find((a) => a.isBde) ?? null;
}

/**
 * By id: a database id, or one of the mock ids the not-yet-migrated modules
 * use (only the BDE's), resolved to the public page with the same address.
 */
export async function getAssociationById(id: string): Promise<Association | null> {
  const all = await getPublicAssociations();
  const mock = mockById.get(id);
  return all.find((a) => a.id === id || (mock !== undefined && a.slug === mock.slug)) ?? null;
}

export async function getAssociationsByIds(ids: string[]): Promise<Association[]> {
  if (ids.length === 0) return [];
  const all = await getPublicAssociations();
  return ids.map((id) => all.find((a) => a.id === id)).filter((a): a is Association => Boolean(a));
}

/** The catalog's categories as plain refs (filters, forms). */
export async function getCategoryRefs(): Promise<CategoryRef[]> {
  return (await getPublicCategories()).map(({ slug, label }) => ({ slug, label }));
}
