import type { CategoryRef } from "@/lib/types";
import type { FilterOption } from "@/components/ui/FilterChips";
import type { IconName } from "@/components/ui/Icon";
import type { StickerTone } from "@/components/ui/Sticker";
import { plural } from "@/lib/format";

/**
 * Small, pure helpers shared by the association components and pages:
 * category parsing for the URL filter, the kicker printed on a tile, and the
 * one sticker a tile may carry. The category catalog itself comes from the
 * database (BDE leadership maintains it); nothing here lists categories.
 */

export interface CategoryWithCount extends CategoryRef {
  count: number;
}

/** `?categorie=sport` → "sport" when the catalog has it; anything else → null (= all). */
export function parseCategory(value: string | string[] | undefined, catalog: readonly CategoryRef[]): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && catalog.some((c) => c.slug === v) ? v : null;
}

/**
 * The first category as a kicker above a name ("SPORT", "PRO"). "Autres" is
 * a filter bucket, not an identity, so it prints nothing.
 */
export function categoryKicker(categories: readonly CategoryRef[]): string | null {
  const first = categories.find((c) => c.slug !== "autre");
  return first ? first.label : null;
}

/**
 * FilterChips options: "Toutes" with the total first, then only the
 * categories that have at least one public page (an empty chip is a dead end).
 */
export function associationCategoryOptions(
  categories: readonly CategoryWithCount[],
  total: number,
  allLabel = "Toutes",
): FilterOption[] {
  return [
    { value: null, label: allLabel, count: total },
    ...categories.filter((c) => c.count > 0).map((c) => ({ value: c.slug, label: c.label, count: c.count })),
  ];
}

/** The single sticker an association tile may carry. It states a fact. */
export interface TileSticker {
  label: string;
  tone?: StickerTone;
  icon?: IconName;
}

/**
 * "Recrute" sticker for an association with an open campaign — green, because
 * green means open. Pass the seats when known: "Recrute · 3 places".
 */
export function recruitingSticker(seats?: number): TileSticker {
  return { label: seats ? `Recrute · ${plural(seats, "place")}` : "Recrute", tone: "ok" };
}
