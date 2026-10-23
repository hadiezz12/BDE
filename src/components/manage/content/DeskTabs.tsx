import Link from "next/link";
import { DESK_VIEWS, type DeskView } from "@/lib/posts/model";
import { cx } from "@/lib/cx";
import { deskHref, type DeskQuery } from "./desk";

/**
 * The desk's tabs (Tous, Brouillons, À relire…): plain links that rewrite
 * ?vue= and keep the search, kind and order, so a view can be shared and the
 * back button undoes it. Each count is what that tab would show with the
 * current search. Sideways-scrolling on phones, like the page editor's tabs.
 */
export function DeskTabs({
  asso,
  query,
  counts,
}: {
  asso: string;
  query: DeskQuery;
  counts: Record<DeskView, number>;
}) {
  return (
    <nav
      aria-label="Étapes des articles"
      className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      <ul className="flex min-w-max gap-1 border-b border-line">
        {DESK_VIEWS.map((v) => {
          const active = v.key === query.view;
          return (
            <li key={v.key}>
              <Link
                href={deskHref(asso, { ...query, view: v.key })}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cx(
                  "relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {v.label}
                <span className={cx("type-meta text-[0.75rem]", active ? "text-fg" : "text-subtle")}>{counts[v.key]}</span>
                <span
                  aria-hidden
                  className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
