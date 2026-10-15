import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Horizontal bars for a handful of named counts (applications per role).
 * The numbers are printed in words next to each label, so the bar is only a
 * picture of them (aria-hidden). An optional target (seats to fill) draws a
 * tick on the bar and is printed too: "7 candidatures · 12 places".
 */
export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  /** Seats, capacity… shown as a tick on the bar. */
  target?: number;
}

export function BarList({
  items,
  formatValue,
  formatTarget,
  label,
  className,
}: {
  items: BarDatum[];
  /** "7 candidatures" */
  formatValue: (n: number) => string;
  /** "12 places" */
  formatTarget?: (n: number) => string;
  /** Accessible name of the list. */
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((d) => Math.max(d.value, d.target ?? 0)));
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;

  return (
    <ul aria-label={label} className={cx("flex flex-col gap-4", className)}>
      {items.map((d) => (
        <li key={d.key} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <span className="font-semibold">{d.label}</span>
            <span className="type-meta text-muted">
              <strong className="font-bold text-fg">{formatValue(d.value)}</strong>
              {d.target !== undefined && formatTarget && <> · {formatTarget(d.target)}</>}
            </span>
          </div>
          <div aria-hidden className="relative h-2.5 rounded-full bg-sunken">
            <span className="absolute inset-y-0 left-0 rounded-full bg-assoc" style={{ width: pct(d.value) }} />
            {d.target !== undefined && (
              <span
                className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg"
                style={{ left: pct(d.target) }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
