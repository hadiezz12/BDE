import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import type { SearchEntry, SearchKind } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { searchCampus, searchEventSeries, type SearchResults } from "@/lib/data/search";
import { getAssociations, getCategoryRefs } from "@/lib/data/associations";
import { getEventFacets } from "@/lib/data/events";
import { getPostFacets } from "@/lib/data/posts";
import { SEARCH_KIND_LABEL } from "@/lib/search/match";
import {
  hasFilters,
  PAGE_SIZE,
  parseSearchState,
  PLACE_LABEL,
  searchHref,
  STATUS_LABEL,
  TAB_LABEL,
  TYPE_KIND,
  WHEN_LABEL,
  type SearchPlace,
  type SearchState,
  type SearchStatus,
  type SearchTab,
  type SearchType,
  type SearchWhen,
} from "@/lib/search/query";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { SearchForm } from "@/components/search/SearchForm";
import { PageResultRow, SearchResultRow } from "@/components/search/SearchResultRow";
import { SearchSections } from "@/components/search/SearchSections";
import { AssociationFilter, SearchPagination, SearchTabs, searchParamsOf } from "@/components/search/SearchControls";
import { matchPages, type SitePage } from "@/components/search/pages";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Searches that lead to what the site itself holds (the BDE's events of the
 * year, the carte, the safety page): only the ones with a match are offered.
 */
const SUGGESTED_QUERIES = ["WEI", "Boo Party", "Rose Rain", "Barathons", "Apéro", "Carte", "VSS"];

const GROUP_TAB: Record<SearchType, SearchTab> = {
  association: "associations",
  event: "evenements",
  campaign: "recrutement",
  position: "recrutement",
  post: "articles",
};
const KIND_TYPE = Object.fromEntries(Object.entries(TYPE_KIND).map(([t, k]) => [k, t])) as Record<SearchKind, SearchType>;

const listFr = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { q } = parseSearchState(await searchParams);
  // Results pages are never indexed (they change with every publication and
  // would compete with the pages they list); their links are followed.
  return {
    title: q ? `Recherche : ${q}` : "Rechercher",
    robots: { index: false, follow: true },
    alternates: { canonical: routes.search },
  };
}

/** "Dans 3 associations, 12 événements publiés…" — only what exists, as a visitor sees it. */
function scopeLine(counts: Record<SearchType, number>): string {
  const parts = [
    counts.association > 0 && plural(counts.association, "association"),
    counts.event > 0 && plural(counts.event, "événement publié", "événements publiés"),
    counts.campaign > 0 && plural(counts.campaign, "recrutement", "recrutements"),
    counts.post > 0 && plural(counts.post, "article", "articles"),
    "les pages du site",
  ].filter((p): p is string => Boolean(p));
  return `Dans ${listFr.format(parts)}.`;
}

async function attempt<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/**
 * /search — one search across the campus (public.search_campus: published,
 * visible items of public pages only, checked at every request): tabs per
 * type, filters that belong to the chosen type, pages of 12, every state in
 * the URL. "Tout" groups the best of each type so none crowds out the
 * others; without a query a tab lists (associations by name, events to
 * come, newest articles, open recruitment first). Never indexed.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const state = parseSearchState(await searchParams);
  const { q, tab } = state;
  const everything = tab === "tout";

  // The "Tout" view: the best four of each type, and the counts every tab shows.
  const overviewState: SearchState = { ...state, tab: "tout", category: null, when: null, place: null, status: null, page: 1 };
  const [overview, page, positions, series, associations, categories] = await Promise.all([
    attempt(() => searchCampus(overviewState, { type: null, perType: q ? 4 : 1, limit: 24, offset: 0 })),
    everything ? Promise.resolve(null) : attempt(() => searchCampus(state)),
    tab === "recrutement" && state.page === 1
      ? attempt(() => searchCampus(state, { type: "position", limit: 6, offset: 0 }))
      : Promise.resolve(null),
    q && (everything || tab === "evenements") && state.page === 1 && !hasFilters(state)
      ? searchEventSeries(q, 3)
      : Promise.resolve([] as SearchEntry[]),
    attempt(() => getAssociations()),
    attempt(() => categoriesFor(tab)),
  ]);
  const failed = !overview || (!everything && !page);
  const counts = overview?.counts ?? { association: 0, post: 0, event: 0, campaign: 0, position: 0 };
  const pages: SitePage[] = q && everything ? matchPages(q) : [];
  const tooShort = Boolean(overview?.tooShort);

  const suggestions: FilterOption[] = (
    await Promise.all(
      SUGGESTED_QUERIES.map(async (s) => ((await searchEventSeries(s, 1)).length + matchPages(s).length > 0 ? s : null)),
    )
  )
    .filter((s): s is string => s !== null)
    .map((s) => ({ value: s, label: s }));

  // Every match of each type (not just the four the "Tout" view keeps); positions count with recruitment.
  const tabCounts = q
    ? {
        tout: counts.association + counts.event + counts.post + counts.campaign + counts.position,
        associations: counts.association,
        evenements: counts.event,
        articles: counts.post,
        recrutement: counts.campaign + counts.position,
      }
    : undefined;

  const keep = searchParamsOf(state, ["q"]);

  return (
    <>
      <PageHeader
        kicker="Tout le site"
        title="Recherche"
        intro={
          <p>
            {q
              ? "Associations, articles, événements, recrutements et pages du site : ce que tout le monde peut lire."
              : scopeLine(counts)}
          </p>
        }
      >
        <SearchForm query={q} keep={keep} />
        <p className="mt-3 hidden type-meta text-subtle lg:block">
          Depuis n&apos;importe quelle page : Ctrl K, ⌘K sur Mac, ou la touche « / ».
        </p>
      </PageHeader>

      <div className="wrap pb-section">
        <SearchTabs state={state} counts={tabCounts} />

        {!everything && (
          <Filters state={state} categories={categories ?? []} associations={associations ?? []} />
        )}
        {everything && q && (associations?.length ?? 0) > 1 && (
          <div className="mt-6">
            <AssociationFilter state={state} associations={associations ?? []} />
          </div>
        )}

        <div className="mt-10">
          {failed ? (
            <EmptyState title="La recherche ne répond pas pour l'instant." mark={<Icon name="alert" size={44} />}>
              <p>Réessaie dans un instant. Les rubriques restent accessibles depuis le menu.</p>
            </EmptyState>
          ) : tooShort ? (
            <EmptyState title="Encore une lettre." mark={<span className="type-numeral text-[4.5rem]">1</span>}>
              <p>La recherche commence à deux caractères : un mot, le début d&apos;un nom, une asso.</p>
            </EmptyState>
          ) : everything && q ? (
            <Overview state={state} overview={overview} series={series} pages={pages} suggestions={suggestions} />
          ) : everything ? (
            <Discover counts={counts} suggestions={suggestions} />
          ) : (
            <TabResults state={state} page={page!} positions={positions} series={series} overview={overview} />
          )}
        </div>
      </div>
    </>
  );
}

/** Each type's own catalog of categories (the database checks the slug again). */
async function categoriesFor(tab: SearchTab): Promise<{ slug: string; label: string }[]> {
  switch (tab) {
    case "associations":
      return getCategoryRefs();
    case "evenements":
      return (await getEventFacets()).categories_all;
    case "articles":
      return (await getPostFacets()).categories.map(({ slug, label }) => ({ slug, label }));
    default:
      return [];
  }
}

/** Only the controls of the chosen type: no panel of fields that do not apply. */
function Filters({
  state,
  categories,
  associations,
}: {
  state: SearchState;
  categories: { slug: string; label: string }[];
  associations: { slug: string; name: string }[];
}) {
  const chips = (label: string, param: string, current: string | null, options: FilterOption[]) => (
    <div className="flex flex-col gap-2">
      <p className="type-label text-muted" aria-hidden>
        {label}
      </p>
      <FilterChips
        label={label}
        param={param}
        options={options}
        current={current}
        basePath={routes.search}
        params={searchParamsOf(state, [param])}
      />
    </div>
  );
  const whenParam: Record<SearchWhen, string> = {
    upcoming: "a-venir",
    today: "aujourdhui",
    week: "semaine",
    weekend: "weekend",
    past: "passes",
  };
  const placeParam: Record<SearchPlace, string> = { campus: "campus", external: "exterieur", online: "en-ligne" };
  const statusParam: Record<SearchStatus, string> = { open: "ouvert", closing: "fin-proche", upcoming: "bientot", closed: "clos" };

  return (
    <div className="mt-6 flex flex-col gap-5">
      {state.tab === "evenements" &&
        chips(
          "Quand",
          "quand",
          state.when ? whenParam[state.when] : null,
          [
            { value: null, label: state.q ? "Toutes les dates" : "À venir" },
            ...(Object.keys(WHEN_LABEL) as SearchWhen[])
              .filter((w) => state.q || w !== "upcoming")
              .map((w) => ({ value: whenParam[w], label: WHEN_LABEL[w] })),
          ],
        )}
      {state.tab === "evenements" &&
        chips("Où", "lieu", state.place ? placeParam[state.place] : null, [
          { value: null, label: "Partout" },
          ...(Object.keys(PLACE_LABEL) as SearchPlace[]).map((p) => ({ value: placeParam[p], label: PLACE_LABEL[p] })),
        ])}
      {state.tab === "recrutement" &&
        chips("Candidatures", "statut", state.status ? statusParam[state.status] : null, [
          { value: null, label: "Toutes" },
          ...(["open", "closing", "upcoming", "closed"] as SearchStatus[]).map((s) => ({ value: statusParam[s], label: STATUS_LABEL[s] })),
        ])}
      {categories.length > 0 &&
        chips("Catégorie", "categorie", state.category, [
          { value: null, label: "Toutes" },
          ...categories.map((c) => ({ value: c.slug, label: c.label })),
        ])}
      {state.q &&
        (state.tab === "articles" || state.tab === "evenements") &&
        chips("Ordre", "tri", state.sort === "date" ? "date" : null, [
          { value: null, label: "Pertinence" },
          { value: "date", label: state.tab === "articles" ? "Plus récents" : "Par date" },
        ])}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AssociationFilter state={state} associations={associations} />
        {state.tab === "evenements" && (
          <Link
            href={state.q ? `${routes.events}?q=${encodeURIComponent(state.q)}` : routes.events}
            className="inline-flex min-h-10 items-center gap-1.5 type-label text-muted hover:text-accent-text"
          >
            Des dates précises ? L&apos;agenda
            <Icon name="arrow-right" size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

/** One block of results: the count as a big numeral, the rubrique, the rows. */
function ResultGroup({
  id,
  title,
  count,
  more,
  children,
}: {
  id: string;
  title: string;
  count: number;
  more?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="grid gap-4 lg:grid-cols-12 lg:gap-8">
      <header className="flex items-end gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:col-span-3 lg:flex-col lg:items-start lg:gap-3 lg:self-start">
        <p aria-hidden className="type-numeral text-[3.25rem] text-accent-text lg:text-[5.5rem]">
          {count}
        </p>
        <div className="flex min-w-0 flex-col gap-1.5 pb-1 lg:pb-0">
          <h3 id={`${id}-titre`} className="type-headline">
            {title}
            <span className="sr-only"> : {plural(count, "résultat")}</span>
          </h3>
          {more && (
            <Link
              href={more.href}
              className="group inline-flex items-center gap-1.5 type-label text-muted hover:text-accent-text"
            >
              {more.label}
              <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </header>
      <ul className="border-b border-line lg:col-span-9">{children}</ul>
    </section>
  );
}

/**
 * "Tout" with a query: the best of each type, the type holding the best
 * match first (the database's order), each group linking to its tab.
 */
function Overview({
  state,
  overview,
  series,
  pages,
  suggestions,
}: {
  state: SearchState;
  overview: SearchResults | null;
  series: SearchEntry[];
  pages: SitePage[];
  suggestions: FilterOption[];
}) {
  const results = overview?.results ?? [];
  const counts = overview?.counts ?? { association: 0, post: 0, event: 0, campaign: 0, position: 0 };
  const order: SearchType[] = [];
  for (const r of results) {
    const t = KIND_TYPE[r.kind];
    if (!order.includes(t)) order.push(t);
  }
  if (series.length && !order.includes("event")) order.push("event");
  const total = (overview?.total ? Object.values(counts).reduce((a, b) => a + b, 0) : 0) + series.length + pages.length;

  if (total === 0) return <NoResults state={state} otherTabs={null} suggestions={suggestions} />;

  return (
    <section aria-labelledby="resultats">
      <div className="flex flex-col gap-4 border-t-2 border-fg pt-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
        <h2 id="resultats" className="type-section break-words">
          {plural(total, "résultat")} pour «&nbsp;{state.q}&nbsp;»
        </h2>
      </div>
      <div className="mt-8 flex flex-col gap-14 lg:mt-12 lg:gap-20">
        {order.map((type) => {
          const kind = TYPE_KIND[type];
          const rows = [...results.filter((r) => r.kind === kind), ...(type === "event" ? series : [])];
          const count = counts[type] + (type === "event" ? series.length : 0);
          const tab = GROUP_TAB[type];
          return (
            <ResultGroup
              key={type}
              id={`resultats-${type}`}
              title={SEARCH_KIND_LABEL[kind]}
              count={count}
              more={{ href: searchHref(state, { tab }), label: `Tout voir dans ${TAB_LABEL[tab]}` }}
            >
              {rows.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <SearchResultRow entry={entry} query={state.q} />
                </li>
              ))}
            </ResultGroup>
          );
        })}
        {pages.length > 0 && (
          <ResultGroup id="resultats-pages" title="Pages" count={pages.length}>
            {pages.map((p) => (
              <li key={p.id}>
                <PageResultRow page={p} query={state.q} />
              </li>
            ))}
          </ResultGroup>
        )}
      </div>
    </section>
  );
}

/** One type: its page of results (or its listing without a query), then the pages. */
function TabResults({
  state,
  page,
  positions,
  series,
  overview,
}: {
  state: SearchState;
  page: SearchResults;
  positions: SearchResults | null;
  series: SearchEntry[];
  overview: SearchResults | null;
}) {
  const rows = [...(state.page === 1 ? series : []), ...page.results];
  const positionRows = positions?.results ?? [];
  if (rows.length === 0 && positionRows.length === 0) {
    const elsewhere = state.q && overview ? overview.total : 0;
    return <NoResults state={state} otherTabs={elsewhere > 0 ? elsewhere : null} suggestions={[]} />;
  }
  const label = TAB_LABEL[state.tab];
  // Positions are counted with their campaigns: the heading says what the tab holds.
  const found = page.total + (state.page === 1 ? series.length : 0) + (positions?.total ?? 0);
  const heading = state.q ? `${plural(found, "résultat")} pour « ${state.q} »` : listingTitle(state, page.total);
  return (
    <section aria-labelledby="resultats">
      <h2 id="resultats" className="type-section break-words border-t-2 border-fg pt-3">
        {heading}
      </h2>
      {positionRows.length > 0 && (
        <div className="mt-8">
          <h3 className="type-label text-muted">
            {state.q ? "Postes qui correspondent" : "Postes"} · {plural(positions?.total ?? positionRows.length, "poste")}
          </h3>
          <ul className="mt-2 border-b border-line">
            {positionRows.map((entry) => (
              <li key={entry.id}>
                <SearchResultRow entry={entry} query={state.q} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.length > 0 && (
        <>
          {positionRows.length > 0 && <h3 className="mt-10 type-label text-muted">Campagnes</h3>}
          <ul className="mt-2 border-b border-line" aria-label={label}>
            {rows.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`}>
                <SearchResultRow entry={entry} query={state.q} />
              </li>
            ))}
          </ul>
        </>
      )}
      <SearchPagination state={state} total={page.total} pageSize={PAGE_SIZE} />
    </section>
  );
}

function listingTitle(state: SearchState, total: number): string {
  switch (state.tab) {
    case "associations":
      return plural(total, "association");
    case "evenements":
      return state.when === "past" ? plural(total, "événement passé", "événements passés") : plural(total, "événement", "événements");
    case "articles":
      return plural(total, "article", "articles");
    case "recrutement":
      return plural(total, "recrutement", "recrutements");
    default:
      return plural(total, "résultat");
  }
}

/** Nothing found: say so, offer what would find something, and the rubriques. */
function NoResults({
  state,
  otherTabs,
  suggestions,
}: {
  state: SearchState;
  /** Results the same query finds in the other tabs. */
  otherTabs: number | null;
  suggestions: FilterOption[];
}) {
  const filtered = hasFilters(state);
  return (
    <section aria-labelledby="resultats">
      <h2 id="resultats" className="sr-only">
        Résultats
      </h2>
      <EmptyState
        title={state.q ? `Rien pour « ${state.q} »${filtered ? " avec ces filtres" : ""}.` : "Rien à montrer avec ces filtres."}
        mark={<span className="type-numeral text-[4.5rem] sm:text-[6rem]">0</span>}
        className="break-words"
        actions={
          <>
            {filtered && (
              <Link href={searchHref(state, { association: null, category: null, when: null, place: null, status: null })} className="link font-semibold">
                Retirer les filtres
              </Link>
            )}
            {otherTabs !== null && (
              <Link href={searchHref(state, { tab: "tout" })} className="link font-semibold">
                {plural(otherTabs, "résultat")} dans les autres rubriques
              </Link>
            )}
          </>
        }
      >
        <p>
          {state.q
            ? "Vérifie l'orthographe ou essaie un mot plus court : le nom d'un événement, d'une asso ou d'un poste. Les accents et les majuscules ne comptent pas."
            : "Change un filtre : les contenus arrivent quand les assos et le BDE les publient."}
        </p>
      </EmptyState>
      {suggestions.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 type-label text-muted">Essaie plutôt</p>
          <FilterChips label="Recherches suggérées" param="q" options={suggestions} current={state.q} basePath={routes.search} />
        </div>
      )}
    </section>
  );
}

/** No query: where to start, and what each rubrique holds. */
function Discover({ counts, suggestions }: { counts: Record<SearchType, number>; suggestions: FilterOption[] }) {
  return (
    <div className="flex flex-col gap-[var(--section)]">
      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions">
          <SectionHeader id="suggestions" index="01" kicker="Pour démarrer" title="Pas d'idée ? Essaie ça" />
          <FilterChips label="Recherches suggérées" param="q" options={suggestions} current={null} basePath={routes.search} className="mt-6" />
        </section>
      )}
      <section aria-labelledby="rubriques">
        <SectionHeader id="rubriques" index={suggestions.length > 0 ? "02" : "01"} kicker="Les rubriques" title="Ou va droit au but" />
        <div className="mt-6">
          <SearchSections
            counts={{ association: counts.association, evenement: counts.event, recrutement: counts.campaign, article: counts.post }}
          />
        </div>
      </section>
    </div>
  );
}
