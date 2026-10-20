/**
 * Search text normalization for the association directory. Pure module (no
 * path-alias imports): the unit tests load it with plain Node.
 *
 * A school has a few dozen associations: the directory filters the public
 * list in the application, with these rules, rather than adding a search
 * service. Accents, case, punctuation and extra spaces never matter.
 */

/** The longest search kept (anything longer is cut, not refused). */
export const SEARCH_MAX = 60;

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** The query as typed, trimmed and bounded, for display and for the URL. */
export function cleanQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
}
