import Link from "next/link";
import type { SearchKind } from "@/lib/types";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { SEARCH_SECTIONS } from "./kinds";

const ROW =
  "group grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-4 border-t border-line-strong py-5 transition-colors hover:bg-raised/60 " +
  "sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:gap-6 sm:px-3 sm:py-6";

/**
 * The site's contents page, magazine-style: each section with what it holds
 * right now (real counts from the search index), then the safety page.
 * Shown when the query is empty or finds nothing.
 */
export function SearchSections({ counts }: { counts: Record<SearchKind, number> }) {
  return (
    <ul className="border-b border-line-strong">
      {SEARCH_SECTIONS.map((s) => (
        <li key={s.kind}>
          <Link href={s.href} className={ROW}>
            <span aria-hidden className="type-numeral text-[3rem] text-accent-text sm:text-[4.5rem]">
              {counts[s.kind]}
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="type-headline transition-colors group-hover:text-accent-text">{s.title}</span>
              <span className="type-small text-muted">{s.describe(counts[s.kind])}</span>
            </span>
            <Icon
              name="arrow-right"
              size={20}
              className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
            />
          </Link>
        </li>
      ))}
      <li>
        <Link href={routes.safety} className={ROW}>
          <span aria-hidden className="text-warn">
            <Icon name="shield" size={44} className="sm:size-14" />
          </span>
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="type-headline text-warn">VSS / VDH</span>
            <span className="type-small text-muted">
              Nos engagements, le canal d&apos;alerte confidentiel et les numéros utiles.
            </span>
          </span>
          <Icon
            name="arrow-right"
            size={20}
            className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
          />
        </Link>
      </li>
    </ul>
  );
}
