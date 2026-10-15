import type { DayCount, MonthCount } from "@/lib/data/analytics";
import { dateParts, formatDayShort } from "@/lib/format";
import type { ColumnDatum } from "./ColumnChart";

/**
 * Turns the analytics series into ColumnChart columns: short axis labels
 * ("8", "sept") under the columns, full labels ("Mer. 8 oct.",
 * "Septembre 2026") in the table of values.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mer. 8 oct." */
export function dayLabel(iso: string): string {
  return `${cap(dateParts(iso).weekday)}. ${formatDayShort(iso)}`;
}

/** One column per day; `markers` maps a day key ("2026-10-11") to a note shown as a diamond. */
export function dayColumns(days: DayCount[], markers: Map<string, string> = new Map()): ColumnDatum[] {
  return days.map((d) => ({
    key: d.key,
    axisLabel: dateParts(d.iso).day,
    label: dayLabel(d.iso),
    value: d.count,
    marker: markers.get(d.key),
  }));
}

/** One column per month: published, with what is programmed stacked on top. */
export function monthColumns(months: MonthCount[]): ColumnDatum[] {
  return months.map((m) => {
    const parts = dateParts(m.iso);
    return {
      key: m.key,
      axisLabel: parts.month,
      label: `${cap(parts.monthLong)} ${m.key.slice(0, 4)}`,
      value: m.published,
      extra: m.scheduled,
    };
  });
}
