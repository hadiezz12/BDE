/**
 * The /search page's state, all in the URL so a search can be shared and
 * the back button undoes a filter: ?q=, ?type= (associations, evenements,
 * articles, recrutement; none = everything), ?asso=, ?categorie=, and per
 * type ?quand= / ?lieu= (events, the agenda's own words), ?statut=
 * (recruitment), ?tri=date, ?page=. Unknown or malformed values are
 * ignored (a stale link still shows a search), a filter that does not
 * belong to the chosen type is dropped. Pure module (relative imports with
 * extensions only), shared by the page, the API route and the tests.
 */

import type { SearchKind } from "../types";
import { routes } from "../routes.ts";

export type SearchTab = "tout" | "associations" | "evenements" | "articles" | "recrutement";
/** The database's types (public.search_campus). */
export type SearchType = "association" | "post" | "event" | "campaign" | "position";
export type SearchWhen = "upcoming" | "today" | "week" | "weekend" | "past";
export type SearchPlace = "campus" | "external" | "online";
export type SearchStatus = "open" | "upcoming" | "closing" | "closed";

export interface SearchState {
  q: string;
  tab: SearchTab;
  /** Association slug. */
  association: string | null;
  /** Category slug, in the chosen type's own catalog. */
  category: string | null;
  when: SearchWhen | null;
  place: SearchPlace | null;
  status: SearchStatus | null;
  /** "date" orders by date even with a query (relevance otherwise). */
  sort: "relevance" | "date";
  page: number;
}

export const MAX_QUERY_LENGTH = 80;
export const PAGE_SIZE = 12;
/** The database stops at offset 480: 40 pages of 12. */
export const MAX_PAGE = 40;

const TAB_PARAM: Record<Exclude<SearchTab, "tout">, string> = {
  associations: "associations",
  evenements: "evenements",
  articles: "articles",
  recrutement: "recrutement",
};

export const TAB_TYPE: Record<SearchTab, SearchType | null> = {
  tout: null,
  associations: "association",
  evenements: "event",
  articles: "post",
  recrutement: "campaign",
};

export const TYPE_KIND: Record<SearchType, SearchKind> = {
  association: "association",
  post: "article",
  event: "evenement",
  campaign: "recrutement",
  position: "poste",
};

const WHEN_PARAM: Record<SearchWhen, string> = {
  upcoming: "a-venir",
  today: "aujourdhui",
  week: "semaine",
  weekend: "weekend",
  past: "passes",
};

const PLACE_PARAM: Record<SearchPlace, string> = {
  campus: "campus",
  external: "exterieur",
  online: "en-ligne",
};

const STATUS_PARAM: Record<SearchStatus, string> = {
  open: "ouvert",
  upcoming: "bientot",
  closing: "fin-proche",
  closed: "clos",
};

type Param = string | string[] | undefined;
type Params = Record<string, Param>;

const first = (v: Param) => (Array.isArray(v) ? v[0] : v);
const reverse = <K extends string>(map: Record<K, string>) =>
  new Map(Object.entries(map).map(([k, v]) => [v as string, k as K]));
const TAB_OF = reverse(TAB_PARAM);
const WHEN_OF = reverse(WHEN_PARAM);
const PLACE_OF = reverse(PLACE_PARAM);
const STATUS_OF = reverse(STATUS_PARAM);

/** What was typed: spaces collapsed, control characters dropped, 80 characters at most. */
export function searchQuery(raw: Param): string {
  return (first(raw) ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/** A slug as the database writes them, or null. */
export function searchSlug(raw: Param): string | null {
  const v = first(raw);
  return v && v.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? v : null;
}

export function parseSearchState(params: Params): SearchState {
  const tab = TAB_OF.get(first(params.type) ?? "") ?? "tout";
  const events = tab === "evenements";
  const recruitment = tab === "recrutement";
  const page = Number.parseInt(first(params.page) ?? "", 10);
  return {
    q: searchQuery(params.q),
    tab,
    association: searchSlug(params.asso),
    // Each type has its own catalog: no category across every type.
    category: tab === "tout" ? null : searchSlug(params.categorie),
    when: events ? (WHEN_OF.get(first(params.quand) ?? "") ?? null) : null,
    place: events ? (PLACE_OF.get(first(params.lieu) ?? "") ?? null) : null,
    status: recruitment ? (STATUS_OF.get(first(params.statut) ?? "") ?? null) : null,
    sort: first(params.tri) === "date" ? "date" : "relevance",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/**
 * The URL of a search, with only what differs from the defaults, always in
 * the same order. Changing anything but the page goes back to page 1.
 */
export function searchHref(state: SearchState, patch: Partial<SearchState> = {}): string {
  const next = { ...state, ...patch };
  if (!("page" in patch)) next.page = 1;
  if ("tab" in patch && patch.tab !== state.tab) {
    // Filters of another type do not follow to a new tab.
    next.category = null;
    next.when = null;
    next.place = null;
    next.status = null;
  }
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.tab !== "tout") p.set("type", TAB_PARAM[next.tab]);
  if (next.association) p.set("asso", next.association);
  if (next.category && next.tab !== "tout") p.set("categorie", next.category);
  if (next.when && next.tab === "evenements") p.set("quand", WHEN_PARAM[next.when]);
  if (next.place && next.tab === "evenements") p.set("lieu", PLACE_PARAM[next.place]);
  if (next.status && next.tab === "recrutement") p.set("statut", STATUS_PARAM[next.status]);
  if (next.sort === "date" && next.q) p.set("tri", "date");
  if (next.page > 1) p.set("page", String(next.page));
  const qs = p.toString();
  return qs ? `${routes.search}?${qs}` : routes.search;
}

/** Whether any filter narrows the search (the query and the tab aside). */
export function hasFilters(state: SearchState): boolean {
  return Boolean(state.association || state.category || state.when || state.place || state.status);
}

/** The arguments of public.search_campus for this state (the database checks them again). */
export function searchArgs(
  state: SearchState,
  options: { type?: SearchType | null; limit?: number; offset?: number; perType?: number | null } = {},
) {
  const type = options.type === undefined ? TAB_TYPE[state.tab] : options.type;
  const limit = options.limit ?? PAGE_SIZE;
  return {
    p_q: state.q || null,
    p_type: type,
    // A filter of the tab's own type only (positions follow their campaign's status).
    p_category: type && type === TAB_TYPE[state.tab] ? state.category : null,
    p_organization: state.association,
    p_when: type === "event" ? state.when : null,
    p_status: type === "campaign" || type === "position" ? state.status : null,
    p_place: type === "event" ? state.place : null,
    p_sort: state.q && state.sort === "date" ? "date" : null,
    p_limit: limit,
    p_offset: options.offset ?? (state.page - 1) * limit,
    p_per_type: options.perType ?? null,
  };
}

export const WHEN_LABEL: Record<SearchWhen, string> = {
  upcoming: "À venir",
  today: "Aujourd'hui",
  week: "Cette semaine",
  weekend: "Ce week-end",
  past: "Passés",
};

export const PLACE_LABEL: Record<SearchPlace, string> = {
  campus: "Sur le campus",
  external: "À l'extérieur",
  online: "En ligne",
};

export const STATUS_LABEL: Record<SearchStatus, string> = {
  open: "Candidatures ouvertes",
  upcoming: "Ouvre bientôt",
  closing: "Ferme dans 7 jours",
  closed: "Clos",
};

export const TAB_LABEL: Record<SearchTab, string> = {
  tout: "Tout",
  associations: "Associations",
  evenements: "Événements",
  articles: "Articles",
  recrutement: "Recrutement",
};

export const TABS: SearchTab[] = ["tout", "associations", "evenements", "articles", "recrutement"];
