import type { Bucket } from "@/lib/analytics/period";
import type { ColumnDatum } from "./ColumnChart";

/**
 * Turns period buckets (days, weeks, months) and their counts into
 * ColumnChart columns: short axis labels ("8", "3 nov.", "sept") under the
 * columns, full labels ("Mar. 8 oct.", "Semaine du 3 nov.", "Septembre
 * 2026") in the table of values. A bucket cut by the period's edge says so
 * in its label.
 */
export function bucketColumns(bs: Bucket[], values: number[], extra?: number[]): ColumnDatum[] {
  return bs.map((b, i) => ({
    key: b.key,
    axisLabel: b.axisLabel,
    label: b.label,
    value: values[i] ?? 0,
    extra: extra?.[i] || undefined,
  }));
}
