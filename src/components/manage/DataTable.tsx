import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Dense records for the workspace. A real <table> from md: up; on phones the
 * same rows become stacked entries (title line + label/value pairs), because a
 * sideways-scrolling table at 360 px is unusable. Only one of the two is
 * displayed at a time, so assistive tech never reads both.
 *
 * Server component: cells are render functions, so pass it from server pages.
 */
export interface DataColumn<T> {
  key: string;
  /** Column heading, also the label of the value on phones. */
  header: string;
  cell: (row: T) => ReactNode;
  /** The row's name: rendered as the row header (th scope=row) and as the phone title. Use on one column. */
  primary?: boolean;
  align?: "start" | "end";
  /** Leave out of the phone view (secondary detail). */
  hideOnPhone?: boolean;
  /** Extra classes on the desktop cells (width, nowrap…). */
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  actions,
  actionsLabel = "Actions",
  empty,
  className,
}: {
  /** Accessible name of the table/list ("Campagnes de recrutement de …"). */
  caption: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Per-row controls (a link, a DemoActionButton), right-aligned. */
  actions?: (row: T) => ReactNode;
  actionsLabel?: string;
  /** Rendered instead of the table when there are no rows (e.g. <ManageEmpty>). */
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0) return <>{empty ?? null}</>;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const details = columns.filter((c) => c !== primary && !c.hideOnPhone);

  return (
    <div className={className}>
      {/* md and up: table. `relative` keeps the cells' sr-only text inside the scroll box, so it can't widen the page. */}
      <div className="relative hidden overflow-x-auto rounded-md border border-line bg-raised md:block">
        <table className="w-full border-collapse text-left type-small">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    "whitespace-nowrap px-4 py-2.5 type-label font-bold text-subtle",
                    c.align === "end" && "text-right",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="px-4 py-2.5 text-right">
                  <span className="sr-only">{actionsLabel}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line transition-colors last:border-b-0 hover:bg-bg/70">
                {columns.map((c) => {
                  const cls = cx("px-4 py-3 align-middle", c.align === "end" && "text-right", c.className);
                  return c === primary ? (
                    <th key={c.key} scope="row" className={cx(cls, "font-semibold text-fg")}>
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td key={c.key} className={cls}>
                      {c.cell(row)}
                    </td>
                  );
                })}
                {actions && <td className="whitespace-nowrap px-4 py-2 text-right align-middle">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rows */}
      <ul aria-label={caption} className="divide-y divide-line rounded-md border border-line bg-raised md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="flex flex-col gap-2.5 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-semibold">{primary.cell(row)}</div>
              {actions && <div className="-my-1 shrink-0">{actions(row)}</div>}
            </div>
            {details.length > 0 && (
              <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] items-baseline gap-x-4 gap-y-1.5 type-small">
                {details.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="type-label text-[0.68rem] text-subtle">{c.header}</dt>
                    <dd className="min-w-0">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
