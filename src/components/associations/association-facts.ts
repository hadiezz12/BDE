import type { AssociationCategory } from "@/lib/types";
import type { FilterOption } from "@/components/ui/FilterChips";
import type { IconName } from "@/components/ui/Icon";
import type { StickerTone } from "@/components/ui/Sticker";
import { ASSOCIATION_CATEGORY_LABEL, plural } from "@/lib/format";

/**
 * Small, pure helpers shared by the association components and pages:
 * category order and parsing for the URL filter, the kicker printed on a
 * tile, and the one sticker a tile may carry. No data access here.
 */

/** Order of the category chips: the BDE first, then the way students browse. */
export const ASSOCIATION_CATEGORIES: AssociationCategory[] = [
  "bde",
  "sport",
  "culture",
  "arts",
  "pro",
  "entrepreneuriat",
  "solidarite",
  "international",
  "media",
  "autre",
];

/** `?categorie=sport` → "sport"; anything unknown → null (= all). */
export function parseAssociationCategory(value: string | string[] | undefined): AssociationCategory | null {
  const v = Array.isArray(value) ? value[0] : value;
  return ASSOCIATION_CATEGORIES.includes(v as AssociationCategory) ? (v as AssociationCategory) : null;
}

/**
 * Category as a kicker above a name ("SPORT", "PRO"). "Autres" is a filter
 * bucket, not an identity, so it prints nothing.
 */
export function categoryKicker(category: AssociationCategory): string | null {
  return category === "autre" ? null : ASSOCIATION_CATEGORY_LABEL[category];
}

/**
 * FilterChips options from getAssociationCategoryCounts(): "Toutes" with the
 * total first, then only the categories that have at least one association —
 * an empty chip is a dead end.
 */
export function associationCategoryOptions(
  counts: Partial<Record<AssociationCategory, number>>,
  allLabel = "Toutes",
): FilterOption[] {
  const total = ASSOCIATION_CATEGORIES.reduce((n, c) => n + (counts[c] ?? 0), 0);
  return [
    { value: null, label: allLabel, count: total },
    ...ASSOCIATION_CATEGORIES.filter((c) => (counts[c] ?? 0) > 0).map((c) => ({
      value: c,
      label: ASSOCIATION_CATEGORY_LABEL[c],
      count: counts[c],
    })),
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
