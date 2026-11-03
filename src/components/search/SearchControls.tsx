import Form from "next/form";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { searchHref, TAB_LABEL, TABS, type SearchState, type SearchTab } from "@/lib/search/query";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** The current search's parameters (page aside), for links and forms that change one of them. */
export function searchParamsOf(state: SearchState, drop: string[] = []): Record<string, string> {
  const href = searchHref(state);
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs)) if (!drop.includes(k)) out[k] = v;
  return out;
}

/**
 * The types as tabs: plain links that keep the query (a shareable URL each,
 * the back button returns to the previous tab). The current one is marked
 * aria-current; counts come from the same search, never estimated.
 */
export function SearchTabs({ state, counts }: { state: SearchState; counts?: Partial<Record<SearchTab, number>> }) {
  return (
    <nav aria-label="Type de résultats" className="border-b border-line-strong">
      <ul className="rail gap-1 sm:gap-2">
        {TABS.map((tab) => {
          const active = tab === state.tab;
          const n = counts?.[tab];
          return (
            <li key={tab}>
              <Link
                href={searchHref(state, { tab })}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cx(
                  "relative -mb-px flex min-h-12 items-center gap-2 whitespace-nowrap border-b-[3px] px-2.5 type-nav transition-colors sm:px-3",
                  active ? "border-accent text-fg" : "border-transparent text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {TAB_LABEL[tab]}
                {n !== undefined && (
                  <span className="font-mono text-[0.75rem] text-subtle">
                    <span aria-hidden>{n}</span>
                    <span className="sr-only">, {plural(n, "résultat")}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Page 2 sur 5", with the previous and next pages as links (no JavaScript needed). */
export function SearchPagination({ state, total, pageSize }: { state: SearchState; total: number; pageSize: number }) {
  const pages = Math.min(Math.ceil(total / pageSize), 40);
  if (pages <= 1) return null;
  const page = Math.min(state.page, pages);
  const around = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav aria-label="Pages de résultats" className="mt-8 flex flex-wrap items-center justify-between gap-4">
      <p className="type-meta text-subtle">
        Page {page} sur {pages}
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        {page > 1 && (
          <li>
            <Link href={searchHref(state, { page: page - 1 })} className={PAGE_LINK} rel="prev">
              <Icon name="arrow-left" size={16} />
              <span className="max-sm:sr-only">Précédente</span>
            </Link>
          </li>
        )}
        {around.map((p, i) => (
          <li key={p} className="flex items-center gap-1.5">
            {i > 0 && p - around[i - 1] > 1 && <span aria-hidden className="px-1 text-subtle">…</span>}
            <Link
              href={searchHref(state, { page: p })}
              aria-current={p === page ? "page" : undefined}
              className={cx(PAGE_LINK, p === page && "border-fg bg-fg text-bg")}
            >
              <span className="sr-only">Page </span>
              {p}
            </Link>
          </li>
        ))}
        {page < pages && (
          <li>
            <Link href={searchHref(state, { page: page + 1 })} className={PAGE_LINK} rel="next">
              <span className="max-sm:sr-only">Suivante</span>
              <Icon name="arrow-right" size={16} />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}

const PAGE_LINK =
  "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-sm border-2 border-line-strong/60 px-3 type-button text-[0.78rem] hover:border-fg";

/** One association, chosen from a list (a GET form: the other parameters ride along). */
export function AssociationFilter({
  state,
  associations,
}: {
  state: SearchState;
  associations: { slug: string; name: string }[];
}) {
  if (associations.length < 2 && !state.association) return null;
  const keep = searchParamsOf(state, ["asso"]);
  return (
    <Form action={routes.search} className="flex flex-wrap items-end gap-2">
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="flex flex-col gap-1.5">
        <span className="type-label text-muted">Association</span>
        <select
          name="asso"
          defaultValue={state.association ?? ""}
          className="min-h-10 rounded-sm border-2 border-line-strong/60 bg-bg px-3 text-[0.9rem] text-fg focus-visible:border-fg"
        >
          <option value="">Toutes les associations</option>
          {associations.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Filtrer
      </Button>
    </Form>
  );
}
