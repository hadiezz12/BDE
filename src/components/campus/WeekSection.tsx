import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { type FilWeek, weekRangeLabel, weekRelative } from "./labels";

/**
 * One back issue of the fil: the week's number set big and condensed in the
 * margin (sticky on desktop, like a running folio), its dates and relative
 * age in mono, then the stories of that week.
 */
export function WeekSection({
  week,
  as: Heading = "h3",
  children,
  className,
}: {
  week: FilWeek;
  as?: "h2" | "h3";
  children: ReactNode;
  className?: string;
}) {
  const id = `semaine-${week.start}`;
  return (
    <section
      aria-labelledby={id}
      className={cx("grid gap-x-10 gap-y-5 border-t border-line-strong pb-10 pt-4 lg:grid-cols-12", className)}
    >
      <Heading
        id={id}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 self-start lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:col-span-3 lg:flex-col"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="type-label text-muted">N°</span>
          <span className="type-numeral text-[2.75rem] lg:text-[4.5rem]">{week.number}</span>
        </span>
        <span className="sr-only">, </span>
        <span className="flex flex-col type-meta text-muted">
          <span className="text-fg">
            {weekRelative(week)}
            <span className="sr-only">, </span>
          </span>
          <span>{weekRangeLabel(week)}</span>
        </span>
      </Heading>
      <div className="min-w-0 lg:col-span-9">{children}</div>
    </section>
  );
}
