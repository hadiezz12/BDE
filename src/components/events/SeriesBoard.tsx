import Link from "next/link";
import type { EventSeries } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { SeriesEmblem } from "./SeriesEmblem";

/**
 * The BDE's events of the year as a programme board: a ruled grid (no card
 * chrome) where each cell is a lit emblem, the name, what it is and when in
 * the year it comes back. Each cell is one link to the event's page.
 * Numbers follow the BDE's order, so pass `numbers` when showing a subset.
 */
export function SeriesBoard({
  series,
  numbers,
  headingLevel = 3,
  className,
}: {
  series: EventSeries[];
  /** Number to print per series id ("01" … "08"); defaults to the list order. */
  numbers?: Map<string, string>;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  if (series.length === 0) return null;
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";

  return (
    <ul className={cx("grid grid-cols-2 border-l border-t border-line lg:grid-cols-4", className)}>
      {series.map((s, i) => (
        <li
          key={s.id}
          data-accent={s.accent}
          className="group focus-ring-within relative flex min-w-0 flex-col gap-4 border-b border-r border-line p-4 transition-colors hover:bg-raised/60 sm:p-6"
        >
          <span
            aria-hidden
            className="absolute -top-px left-0 h-[3px] w-full origin-left scale-x-0 bg-assoc transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
          />
          <div className="flex items-start justify-between gap-3">
            <SeriesEmblem
              series={s}
              className="size-[4.5rem] transition-transform duration-300 ease-out group-hover:scale-[1.05] sm:size-24"
            />
            <span aria-hidden className="type-meta text-subtle">
              {numbers?.get(s.id) ?? String(i + 1).padStart(2, "0")}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <H className="type-card break-words text-[1.1rem] leading-[1.12] hyphens-auto sm:text-[1.3rem]">
              <Link
                href={routes.event(s.slug)}
                className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
              >
                {s.name}
              </Link>
            </H>
            <p className="type-small text-muted">{s.subtitle}</p>
          </div>
          <p className="mt-auto type-label text-assoc-text">{s.period}</p>
        </li>
      ))}
    </ul>
  );
}
