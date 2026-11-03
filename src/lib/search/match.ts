import type { SearchEntry, SearchKind } from "./types";

/** Client-safe matcher for the local search index. */

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  association: "Associations",
  evenement: "Événements",
  recrutement: "Recrutements",
  article: "Campus",
};

export function normaliseQuery(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Every query word must match (title, context or keywords). Title matches
 * rank first, then prefix matches, then the rest — in index order.
 */
export function searchEntries(index: SearchEntry[], query: string, limitPerKind = 5): SearchEntry[] {
  const words = normaliseQuery(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = index
    .map((entry, i) => {
      const title = normaliseQuery(entry.title);
      const haystack = `${title} ${normaliseQuery(entry.context)} ${normaliseQuery(entry.keywords)}`;
      if (!words.every((w) => haystack.includes(w))) return null;
      let score = 0;
      for (const w of words) {
        if (title.startsWith(w) || title.includes(` ${w}`)) score += 3;
        else if (title.includes(w)) score += 2;
      }
      return { entry, score, i };
    })
    .filter((x): x is { entry: SearchEntry; score: number; i: number } => Boolean(x))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const perKind = new Map<SearchKind, number>();
  return scored
    .filter(({ entry }) => {
      const n = perKind.get(entry.kind) ?? 0;
      perKind.set(entry.kind, n + 1);
      return n < limitPerKind;
    })
    .map(({ entry }) => entry);
}
