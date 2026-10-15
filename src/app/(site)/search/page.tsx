import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import { PageResultRow, SearchResultRow } from "@/components/search/SearchResultRow";
import { SearchSections } from "@/components/search/SearchSections";
import { SEARCH_SECTIONS } from "@/components/search/kinds";
import { matchPages, type SitePage } from "@/components/search/pages";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The full page lists every match; the ⌘K dialog stops at five per kind. */
const RESULTS_PER_KIND = 50;
const MAX_QUERY_LENGTH = 80;
/**
 * Searches that lead to what the site really holds: the BDE's events, the
 * carte, the safety page. Only the ones with results are offered.
 */
const SUGGESTED_QUERIES = ["WEI", "Boo Party", "Rose Rain", "Barathons", "Apéro", "Carte", "VSS"];

const listFr = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

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

/** "Dans 1 association, 8 événements de l'année et les pages du site." — only what exists. */
function scopeLine(counts: Record<SearchKind, number>): string {
  const parts = [
    counts.association > 0 && plural(counts.association, "association"),
    counts.evenement > 0 && `${plural(counts.evenement, "événement")} de l'année`,
    counts.recrutement > 0 && plural(counts.recrutement, "campagne de recrutement", "campagnes de recrutement"),
    counts.article > 0 && plural(counts.article, "article du fil", "articles du fil"),
    "les pages du site",
  ].filter((p): p is string => Boolean(p));
  return `Dans ${listFr.format(parts)}.`;
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

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = readQuery((await searchParams).q);
  const index = await getSearchIndex();

  const counts = countByKind(index);
  const results = q ? searchEntries(index, q, RESULTS_PER_KIND) : [];
  const pages: SitePage[] = q ? matchPages(q) : [];
  const groups = groupByKind(results);
  const total = results.length + pages.length;
  const suggestions: FilterOption[] = SUGGESTED_QUERIES.map((s) => ({
    value: s,
    label: s,
    count: searchEntries(index, s, RESULTS_PER_KIND).length + matchPages(s).length,
  })).filter((s) => (s.count ?? 0) > 0);

  const jumps = [
    ...groups.map(([kind, entries]) => ({
      id: `resultats-${kind}`,
      label: SEARCH_KIND_LABEL[kind],
      count: entries.length,
    })),
    ...(pages.length > 0 ? [{ id: "resultats-pages", label: "Pages", count: pages.length }] : []),
  ];

  return (
    <>
      <PageHeader kicker="Tout le site" title="Recherche" intro={<p>{scopeLine(counts)}</p>}>
        <SearchForm query={q} />
        <p className="mt-3 hidden type-meta text-subtle lg:block">
          Depuis n&apos;importe quelle page : Ctrl K, ⌘K sur Mac, ou la touche « / ».
        </p>
      </PageHeader>

      {q && total > 0 && (
        <section aria-labelledby="resultats" className="wrap pb-section">
          <div className="flex flex-col gap-4 border-t-2 border-fg pt-3 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
            <h2 id="resultats" className="type-section break-words">
              {plural(total, "résultat")} pour «&nbsp;{q}&nbsp;»
            </h2>
            {jumps.length > 1 && (
              <nav aria-label="Aller à une rubrique des résultats" className="shrink-0">
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {jumps.map((j) => (
                    <li key={j.id}>
                      <a
                        href={`#${j.id}`}
                        className="inline-flex min-h-10 items-center gap-2 type-label text-fg hover:text-accent-text"
                      >
                        {j.label}
                        <span className="type-meta text-subtle">{j.count}</span>
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
                <ResultGroup
                  key={kind}
                  id={`resultats-${kind}`}
                  title={SEARCH_KIND_LABEL[kind]}
                  count={entries.length}
                  more={section ? { href: section.href, label: section.more } : undefined}
                >
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <SearchResultRow entry={entry} query={q} />
                    </li>
                  ))}
                </ResultGroup>
              );
            })}
            {pages.length > 0 && (
              <ResultGroup id="resultats-pages" title="Pages" count={pages.length}>
                {pages.map((page) => (
                  <li key={page.id}>
                    <PageResultRow page={page} query={q} />
                  </li>
                ))}
              </ResultGroup>
            )}
          </div>
        </section>
      )}

      {q && total === 0 && (
        <section aria-labelledby="resultats" className="wrap pb-section">
          <h2 id="resultats" className="sr-only">
            Résultats
          </h2>
          <EmptyState
            title={`Rien pour « ${q} ».`}
            mark={<span className="type-numeral text-[4.5rem] sm:text-[6rem]">0</span>}
            className="break-words"
          >
            <p>
              Vérifie l&apos;orthographe ou essaie un mot plus court : le nom d&apos;un événement, d&apos;une asso ou
              d&apos;une page. Les accents et les majuscules ne comptent pas.
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
            <SectionHeader
              id="rubriques"
              index={suggestions.length > 0 ? "02" : "01"}
              kicker="Les rubriques"
              title="Ou va droit au but"
            />
            <div className="mt-6">
              <SearchSections counts={counts} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
