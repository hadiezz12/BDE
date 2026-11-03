import "server-only";
import { cache } from "react";
import type { SearchEntry } from "@/lib/types";
import { routes } from "@/lib/routes";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { searchEntries } from "@/lib/search/match";
import { entriesFromHits, type SearchHitPayload } from "@/lib/search/entries";
import { searchArgs, type SearchState, type SearchType } from "@/lib/search/query";
import { getEventSeries } from "./event-series";
import { logDataError, toDataError } from "./errors";

/**
 * The campus search, read as a visitor (anon client, no cookies) through
 * public.search_campus, whoever is signed in: what it returns is exactly
 * what a visitor may read right now (published, visible, of a public page),
 * checked by the database at every call. Nothing is indexed or cached on
 * the site's side, so a moderation, an unpublication or a closed campaign
 * shows on the next search.
 */

export interface SearchResults {
  results: SearchEntry[];
  /** Matches per database type, whatever the page. */
  counts: Record<SearchType, number>;
  total: number;
  hasMore: boolean;
  /** One character typed (or only common words): nothing searched. */
  tooShort: boolean;
}

interface SearchPayload {
  results: SearchHitPayload[];
  counts: Record<SearchType, number>;
  total: number;
  has_more: boolean;
  too_short: boolean;
}

const NO_COUNTS: Record<SearchType, number> = { association: 0, post: 0, event: 0, campaign: 0, position: 0 };

async function searchRpc(args: ReturnType<typeof searchArgs>): Promise<SearchResults> {
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { results: [], counts: NO_COUNTS, total: 0, hasMore: false, tooShort: false };
    throw error;
  }
  const { data, error } = await supabase.rpc("search_campus", args as never);
  if (error) {
    logDataError("search_campus", error);
    throw toDataError(error);
  }
  const payload = data as unknown as SearchPayload;
  const now = new Date();
  return {
    results: entriesFromHits(payload.results ?? [], now),
    counts: { ...NO_COUNTS, ...payload.counts },
    total: payload.total ?? 0,
    hasMore: Boolean(payload.has_more),
    tooShort: Boolean(payload.too_short),
  };
}

/** One page of a search, as the /search page shows it. */
export const searchCampus = cache(
  async (state: SearchState, options: Parameters<typeof searchArgs>[1] = {}): Promise<SearchResults> =>
    searchRpc(searchArgs(state, options)),
);

/**
 * The BDE's events of the year (their pages, from its maquette): the site's
 * own content, matched here, not in the database.
 */
export async function searchEventSeries(q: string, limit = 3): Promise<SearchEntry[]> {
  const series = await getEventSeries();
  const index: SearchEntry[] = series.map((s) => ({
    kind: "evenement",
    id: s.id,
    title: s.name,
    context: `Événement de l'année · ${s.period}`,
    href: routes.event(s.slug),
    accent: s.accent,
    keywords: [s.subtitle, s.description].filter(Boolean).join(" "),
  }));
  return searchEntries(index, q, limit);
}

/**
 * The quick search (⌘K and /api/search): the best few of each type, in one
 * call, plus the events of the year. Null when the database cannot be read.
 */
export async function quickSearch(q: string): Promise<{ results: SearchEntry[]; total: number; tooShort: boolean } | null> {
  try {
    const [found, series] = await Promise.all([
      searchRpc({
        p_q: q,
        p_type: null,
        p_category: null,
        p_organization: null,
        p_when: null,
        p_status: null,
        p_place: null,
        p_sort: null,
        p_limit: 16,
        p_offset: 0,
        p_per_type: 4,
      }),
      searchEventSeries(q, 2),
    ]);
    return { results: [...found.results, ...series], total: found.total + series.length, tooShort: found.tooShort };
  } catch {
    return null;
  }
}
