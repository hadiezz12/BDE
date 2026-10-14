import type { Metadata } from "next";
import Link from "next/link";
import type { SearchEntry, SearchKind } from "@/lib/types";
import { getSearchIndex } from "@/lib/data/search";
import { searchEntries, SEARCH_KIND_LABEL } from "@/lib/search";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { SearchSections } from "@/components/search/SearchSections";
import { SEARCH_SECTIONS } from "@/components/search/kinds";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The full page lists every match; the ⌘K dialog stops at five per kind. */
const RESULTS_PER_KIND = 50;
const MAX_QUERY_LENGTH = 80;
/** Searches that show what the index holds. Only the ones with results are offered. */
const SUGGESTED_QUERIES = ["Boo", "Altitude", "Trésorier", "Ski", "Pitch", "Podcast", "VSS"];

function readQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = readQuery((await searchParams).q);
  return q ? { title: `Recherche : ${q}`, robots: { index: false, follow: true } } : { title: "Rechercher" };
}

function countByKind(index: SearchEntry[]): Record<SearchKind, number> {
  const counts: Record<SearchKind, number> = { association: 0, evenement: 0, recrutement: 0, article: 0 };
  for (const entry of index) counts[entry.kind] += 1;
  return counts;
}

/** Groups keep the ranking: the kind holding the best match comes first. */
function groupByKind(results: SearchEntry[]): [SearchKind, SearchEntry[]][] {
  const groups = new Map<SearchKind, SearchEntry[]>();
  for (const entry of results) groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry]);
  return [...groups.entries()];
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = readQuery((await searchParams).q);
  const index = await getSearchIndex();

  const counts = countByKind(index);
  const results = q ? searchEntries(index, q, RESULTS_PER_KIND) : [];
  const groups = groupByKind(results);
  const suggestions: FilterOption[] = SUGGESTED_QUERIES.map((s) => ({
    value: s,
    label: s,
    count: searchEntries(index, s, RESULTS_PER_KIND).length,
  })).filter((s) => (s.count ?? 0) > 0);

  return (
    <>
      <PageHeader
        kicker="Tout le campus"
        title="Recherche"
        intro={
          <p>
            Dans {plural(counts.association, "association")}, {plural(counts.evenement, "événement")} à venir,{" "}
            {plural(counts.recrutement, "campagne")} de recrutement et {plural(counts.article, "article")} du fil.
          </p>
        }
      >
        <SearchForm query={q} />
        <p className="mt-3 hidden type-meta text-subtle lg:block">
          Depuis n&apos;importe quelle page : Ctrl K, ⌘K sur Mac, ou la touche « / ».
        </p>
      </PageHeader>

      {q && results.length > 0 && (
        <section aria-labelledby="resultats" className="wrap pb-section">
          <div className="flex flex-col gap-4 border-t-2 border-fg pt-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
            <h2 id="resultats" className="type-section break-words">
              {plural(results.length, "résultat")} pour «&nbsp;{q}&nbsp;»
            </h2>
            {groups.length > 1 && (
              <nav aria-label="Aller à une rubrique des résultats" className="shrink-0">
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {groups.map(([kind, entries]) => (
                    <li key={kind}>
                      <a
                        href={`#resultats-${kind}`}
                        className="inline-flex min-h-10 items-center gap-2 type-label text-fg hover:text-accent-text"
                      >
                        {SEARCH_KIND_LABEL[kind]}
                        <span className="type-meta text-subtle">{entries.length}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-14 lg:mt-12 lg:gap-20">
            {groups.map(([kind, entries]) => {
              const section = SEARCH_SECTIONS.find((s) => s.kind === kind);
              return (
                <section
                  key={kind}
                  id={`resultats-${kind}`}
                  aria-labelledby={`resultats-${kind}-titre`}
                  className="grid gap-4 lg:grid-cols-12 lg:gap-8"
                >
                  <header className="flex items-end gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:col-span-3 lg:flex-col lg:items-start lg:gap-3 lg:self-start">
                    <p aria-hidden className="type-numeral text-[3.25rem] text-accent-text lg:text-[5.5rem]">
                      {entries.length}
                    </p>
                    <div className="flex min-w-0 flex-col gap-1.5 pb-1 lg:pb-0">
                      <h3 id={`resultats-${kind}-titre`} className="type-headline">
                        {SEARCH_KIND_LABEL[kind]}
                        <span className="sr-only"> : {plural(entries.length, "résultat")}</span>
                      </h3>
                      {section && (
                        <Link
                          href={section.href}
                          className="group inline-flex items-center gap-1.5 type-label text-muted hover:text-accent-text"
                        >
                          {section.more}
                          <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      )}
                    </div>
                  </header>
                  <ul className="border-b border-line lg:col-span-9">
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <SearchResultRow entry={entry} query={q} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>
      )}

      {q && results.length === 0 && (
        <section aria-labelledby="resultats" className="wrap pb-section">
          <h2 id="resultats" className="sr-only">
            Résultats
          </h2>
          <EmptyState
            title={`Rien pour « ${q} ».`}
            mark={<span className="type-numeral text-[4.5rem] sm:text-[6rem]">0</span>}
            className="break-words"
          >
            <p>
              Vérifie l&apos;orthographe ou essaie un mot plus court : un nom d&apos;asso, un type de soirée, un poste.
              Les accents et les majuscules ne comptent pas.
            </p>
          </EmptyState>
          {suggestions.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 type-label text-muted">Essaie plutôt</p>
              <FilterChips label="Recherches suggérées" param="q" options={suggestions} current={q} basePath={routes.search} />
            </div>
          )}
          <div className="mt-[var(--section)]">
            <SectionHeader kicker="Les rubriques" title="Ou va droit au but" />
            <div className="mt-6">
              <SearchSections counts={counts} />
            </div>
          </div>
        </section>
      )}

      {!q && (
        <div className="wrap flex flex-col gap-[var(--section)] pb-section">
          {suggestions.length > 0 && (
            <section aria-labelledby="suggestions">
              <SectionHeader id="suggestions" index="01" kicker="Pour démarrer" title="Pas d'idée ? Essaie ça" />
              <FilterChips
                label="Recherches suggérées"
                param="q"
                options={suggestions}
                current={null}
                basePath={routes.search}
                className="mt-6"
              />
            </section>
          )}
          <section aria-labelledby="rubriques">
            <SectionHeader id="rubriques" index={suggestions.length > 0 ? "02" : "01"} kicker="Les rubriques" title="Ou va droit au but" />
            <div className="mt-6">
              <SearchSections counts={counts} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
