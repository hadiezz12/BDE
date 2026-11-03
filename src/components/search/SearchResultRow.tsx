import Link from "next/link";
import type { SearchEntry } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { SEARCH_KIND_ICON } from "./kinds";
import { Highlight } from "./Highlight";
import type { SitePage } from "./pages";

const STATUS_TONE: Record<NonNullable<SearchEntry["status"]>["tone"], StatusTone> = {
  live: "ok",
  soon: "info",
  over: "neutral",
  warn: "danger",
};

/**
 * One result on /search (and in saved items): the kind glyph ringed in the
 * association's accent, the title with the matched words marked, its live
 * state (cancelled, closed, open until…) in words, the context line, and
 * the item's own public line. The whole row is the link. Every text is
 * rendered as text (Highlight wraps matches in <mark>, never HTML).
 */
export function SearchResultRow({ entry, query, kindLabel }: { entry: SearchEntry; query: string; kindLabel?: string }) {
  return (
    <ResultLink
      href={entry.href}
      accent={entry.accent}
      icon={SEARCH_KIND_ICON[entry.kind]}
      title={entry.title}
      context={kindLabel ? `${kindLabel} · ${entry.context}` : entry.context}
      excerpt={entry.excerpt}
      status={entry.status}
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
  excerpt,
  status,
  query,
  tone,
}: {
  href: string;
  accent?: string;
  icon: IconName;
  title: string;
  context: string;
  excerpt?: string;
  status?: SearchEntry["status"];
  query: string;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      data-accent={accent}
      className="group flex items-start gap-4 border-t border-line py-4 transition-colors hover:bg-raised/60 sm:gap-5 sm:px-3 sm:py-5"
    >
      <span
        aria-hidden
        className={cx(
          "mt-0.5 grid size-11 shrink-0 place-items-center rounded-full border-2",
          tone === "warn" ? "border-warn/70 bg-warn/10 text-warn" : "border-assoc bg-assoc-soft text-assoc-text",
        )}
      >
        <Icon name={icon} size={19} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cx("type-card break-words hyphens-auto", tone === "warn" && "text-warn")}>
          <Highlight text={title} query={query} />
        </span>
        {status && (
          <StatusBadge tone={STATUS_TONE[status.tone]} className="text-[0.72rem]">
            {status.label}
          </StatusBadge>
        )}
        <span className="type-meta text-subtle">{context}</span>
        {excerpt && (
          <span className="line-clamp-2 type-small text-muted">
            <Highlight text={excerpt} query={query} />
          </span>
        )}
      </span>
      <Icon
        name="arrow-right"
        size={18}
        className="mt-3 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
      />
    </Link>
  );
}
