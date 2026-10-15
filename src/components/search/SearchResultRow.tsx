import Link from "next/link";
import type { SearchEntry } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SEARCH_KIND_ICON } from "./kinds";
import { Highlight } from "./Highlight";
import type { SitePage } from "./pages";

/**
 * One result on /search: the kind glyph ringed in the association's accent,
 * the title with the matched words marked, the context line in mono. The
 * whole row is the link.
 */
export function SearchResultRow({ entry, query }: { entry: SearchEntry; query: string }) {
  return (
    <ResultLink
      href={entry.href}
      accent={entry.accent}
      icon={SEARCH_KIND_ICON[entry.kind]}
      title={entry.title}
      context={entry.context}
      query={query}
    />
  );
}

/** A page of the site found by its name or keywords (carte, VSS / VDH…). Safety pages wear amber. */
export function PageResultRow({ page, query }: { page: SitePage; query: string }) {
  return (
    <ResultLink
      href={page.href}
      icon={page.icon}
      title={page.title}
      context={page.context}
      query={query}
      tone={page.tone}
    />
  );
}

function ResultLink({
  href,
  accent,
  icon,
  title,
  context,
  query,
  tone,
}: {
  href: string;
  accent?: string;
  icon: IconName;
  title: string;
  context: string;
  query: string;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      data-accent={accent}
      className="group flex items-center gap-4 border-t border-line py-4 transition-colors hover:bg-raised/60 sm:gap-5 sm:px-3 sm:py-5"
    >
      <span
        aria-hidden
        className={cx(
          "grid size-11 shrink-0 place-items-center rounded-full border-2",
          tone === "warn" ? "border-warn/70 bg-warn/10 text-warn" : "border-assoc bg-assoc-soft text-assoc-text",
        )}
      >
        <Icon name={icon} size={19} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cx("type-card break-words hyphens-auto", tone === "warn" && "text-warn")}>
          <Highlight text={title} query={query} />
        </span>
        <span className="type-meta text-subtle">{context}</span>
      </span>
      <Icon
        name="arrow-right"
        size={18}
        className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
      />
    </Link>
  );
}
