import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError, toDataError } from "@/lib/data/errors";

/**
 * The directory's category catalog as the caller may read it (row level
 * security): active categories for everyone, archived ones too for the BDE's
 * leadership, which maintains the list (public.create_association_category,
 * update_association_category).
 */
export interface CatalogCategory {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  archived: boolean;
}

export const getCategoryCatalog = cache(async (): Promise<CatalogCategory[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("association_categories")
    .select("id, slug, label, sort_order, archived_at")
    .order("sort_order")
    .order("label");
  if (error) {
    logDataError("association_categories.list", error);
    throw toDataError(error);
  }
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    sort_order: c.sort_order,
    archived: c.archived_at !== null,
  }));
});
