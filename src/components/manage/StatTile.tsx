import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * KPI band: one white strip split by hairlines (not a grid of floating cards).
 * Numbers are real counts derived from the data — never invented marketing
 * figures. Wrap StatTile children in a StatGroup (it renders the <dl>).
 */
export function StatGroup({
  label,
  columns = 4,
  children,
  className,
}: {
  /** Accessible name of the group ("Chiffres de la semaine"). */
  label: string;
  /** Tiles per row from lg: up; phones always show two. */
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      aria-label={label}
      className={cx(
        "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line",
        // An odd last tile spans the row on phones instead of leaving a grey hole.
        "[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1",
        columns === 2 && "lg:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        columns === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export type StatTone = "neutral" | "ok" | "accent" | "danger";

const TONE: Record<StatTone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  accent: "text-assoc-text",
  danger: "text-danger",
};

export function StatTile({
  label,
  value,
  of,
  unit,
  comparison,
  tone = "neutral",
  className,
}: {
  label: string;
  value: number | string;
  /** Capacity or target: shows "/ 400" and a thin fill bar (seats sold, places filled). */
  of?: number;
  /** Short unit after the number ("€", "h"). */
  unit?: string;
  /** One line of context: "dont 7 pas encore ouvertes", "+5 depuis lundi". */
  comparison?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  const shown = typeof value === "number" ? value.toLocaleString("fr-FR") : value;
  const ratio = typeof value === "number" && of ? Math.min(1, Math.max(0, value / of)) : null;
  return (
    <div className={cx("flex flex-col gap-2 bg-raised px-4 py-4 sm:px-5", className)}>
      <dt className="type-label text-[0.7rem] text-subtle">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="type-numeral text-[2.75rem] sm:text-[3.25rem]">{shown}</span>
        {unit && <span className="text-[1.1rem] font-extrabold">{unit}</span>}
        {of !== undefined && <span className="type-meta text-subtle">/ {of.toLocaleString("fr-FR")}</span>}
      </dd>
      {ratio !== null && (
        <dd aria-hidden className="h-1 overflow-hidden rounded-full bg-sunken">
          <span className="block h-full rounded-full bg-assoc" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </dd>
      )}
      {comparison && <dd className={cx("type-small", TONE[tone])}>{comparison}</dd>}
    </div>
  );
}
