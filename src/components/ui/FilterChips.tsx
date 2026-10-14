import Link from "next/link";
import { cx } from "@/lib/cx";

/**
 * Filters are plain links that rewrite the URL's search params: shareable,
 * work without JavaScript, and the back button undoes them. Horizontal rail
 * on mobile (thumb-scrollable), wrapping row on desktop.
 */
export interface FilterOption {
  value: string | null;
  label: string;
  count?: number;
}

export function FilterChips({
  label,
  param,
  options,
  current,
  basePath,
  params = {},
  className,
}: {
  /** Accessible name of the group, e.g. "Filtrer par catégorie". */
  label: string;
  param: string;
  options: FilterOption[];
  current: string | null;
  basePath: string;
  /** Other active params to preserve. */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  const hrefFor = (value: string | null) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== param) sp.set(k, v);
    if (value) sp.set(param, value);
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav aria-label={label} className={cx("rail sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0", className)}>
      {options.map((o) => {
        const active = (o.value ?? null) === (current ?? null);
        return (
          <Link
            key={o.value ?? "all"}
            href={hrefFor(o.value)}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={cx(
              "inline-flex min-h-10 items-center gap-2 rounded-sm border-2 px-3.5 type-button text-[0.78rem] transition-colors",
              active
                ? "border-fg bg-fg text-bg"
                : "border-line-strong/60 text-fg hover:border-fg",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cx("type-meta text-[0.72rem]", active ? "text-bg/70" : "text-subtle")}>{o.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
