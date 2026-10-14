import Link from "next/link";
import type { SearchEntry } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { SEARCH_KIND_ICON } from "./kinds";
import { Highlight } from "./Highlight";

/**
 * One result on /search: the kind glyph ringed in the association's accent,
 * the title with the matched words marked, the context line in mono. The
 * whole row is the link.
 */
export function SearchResultRow({ entry, query }: { entry: SearchEntry; query: string }) {
  return (
    <Link
      href={entry.href}
      data-accent={entry.accent}
      className="group flex items-center gap-4 border-t border-line py-4 transition-colors hover:bg-raised/60 sm:gap-5 sm:px-3 sm:py-5"
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-assoc bg-assoc-soft text-assoc-text"
      >
        <Icon name={SEARCH_KIND_ICON[entry.kind]} size={19} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-card break-words hyphens-auto">
          <Highlight text={entry.title} query={query} />
        </span>
        <span className="type-meta text-subtle">{entry.context}</span>
      </span>
      <Icon
        name="arrow-right"
        size={18}
        className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
      />
    </Link>
  );
}
