import Link from "next/link";
import type { EventSeries } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { SeriesEmblem } from "./SeriesEmblem";

/**
 * One of the BDE's 8 events of the year, as a line of the programme: the lit
 * emblem, its number in the BDE's order, what it is, when in the year it
 * comes back. The whole row is one link (stretched from the title) to the
 * event's page. No date, venue or price: a series has none of its own.
 *
 *   phone   : emblem | number · subtitle, name, description, period
 *   desktop : emblem | number · subtitle, name | description | period →
 */
export function SeriesRow({
  series,
  number,
  headingLevel = 3,
  className,
}: {
  series: EventSeries;
  /** Position in the BDE's order, "01" … "08". */
  number: string;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <article
      data-accent={series.accent}
      className={cx(
        "group focus-ring-within relative grid gap-x-4 gap-y-3 border-t border-line-strong py-6 transition-colors hover:bg-raised/60",
        "grid-cols-[4.5rem_minmax(0,1fr)] [grid-template-areas:'emblem_main'_'emblem_about'_'emblem_when']",
        "sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-x-6",
        "lg:grid-cols-[7rem_minmax(0,5fr)_minmax(0,5fr)_minmax(0,3fr)] lg:gap-x-8 lg:py-8 lg:[grid-template-areas:'emblem_main_about_when']",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute -top-px left-0 h-[3px] w-full origin-left scale-x-0 bg-assoc transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
      />

      <SeriesEmblem
        series={series}
        className="size-[4.5rem] self-start transition-transform duration-300 ease-out [grid-area:emblem] group-hover:scale-[1.04] sm:size-24 lg:size-28"
      />

      <div className="flex min-w-0 flex-col gap-2 [grid-area:main]">
        <p className="flex items-baseline gap-2.5 type-label text-assoc-text">
          <span className="type-meta">{number}</span>
          <span className="min-w-0">{series.subtitle}</span>
        </p>
        <H className="type-card break-words text-[1.35rem] leading-[1.1] hyphens-auto sm:text-[1.6rem] lg:text-[1.75rem]">
          <Link
            href={routes.event(series.slug)}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
          >
            {series.name}
          </Link>
        </H>
      </div>

      <p className="max-w-[40rem] text-muted [grid-area:about] lg:pt-1">{series.description}</p>

      <div className="flex min-w-0 items-start justify-between gap-4 [grid-area:when] lg:pt-1">
        <p className="flex flex-col gap-1">
          <span className="type-label text-muted">Quand</span>
          <span className="font-bold leading-snug">{series.period}</span>
        </p>
        <Icon
          name="arrow-right"
          size={20}
          className="mt-1 hidden shrink-0 text-assoc-text transition-transform group-hover:translate-x-0.5 sm:block"
        />
      </div>
    </article>
  );
}
