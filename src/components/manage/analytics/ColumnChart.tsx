import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Small column chart for counts over time (registrations per day, posts per
 * month). Pure CSS: columns in the association colour on a ruled baseline.
 * The drawing is decorative (aria-hidden); the figcaption says what it shows
 * in a sentence and the table under "Voir les chiffres" gives every value, so
 * nobody depends on reading bar heights.
 */
export interface ColumnDatum {
  key: string;
  /** Under the column, kept very short ("8", "sept."). */
  axisLabel: string;
  /** Full label for the table ("Mer. 8 oct.", "Septembre"). */
  label: string;
  value: number;
  /** Stacked on top in a dashed outline: something planned, not done yet (programmed posts). */
  extra?: number;
  /** Marks the column with a diamond under it; the text goes in the table. */
  marker?: string;
}

export function ColumnChart({
  data,
  valueLabel,
  extraLabel,
  markerLabel,
  summary,
  tableLabel = "Voir les chiffres",
  periodLabel = "Période",
  className,
}: {
  data: ColumnDatum[];
  /** Header of the value column in the table ("Inscriptions"). */
  valueLabel: string;
  extraLabel?: string;
  /** Legend + table header for markers ("Article publié ce jour-là"). */
  markerLabel?: string;
  /** One or two sentences saying what the chart shows. Rendered as the figcaption. */
  summary: ReactNode;
  tableLabel?: string;
  periodLabel?: string;
  className?: string;
}) {
  const totals = data.map((d) => d.value + (d.extra ?? 0));
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(...totals));
  const n = data.length;
  // Every value fits above its column up to a dozen columns; beyond, only the peak.
  const showAllValues = n <= 12;
  // Axis: every label when few columns, otherwise about six evenly spaced plus the last.
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  const showAxis = (i: number) => i % step === 0 || i === n - 1;
  const hasExtra = data.some((d) => (d.extra ?? 0) > 0);
  const hasMarker = data.some((d) => d.marker);
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const height = (v: number) => `calc((100% - 1.25rem) * ${v / max})`;

  return (
    <figure className={cx("flex flex-col gap-3", className)}>
      <div aria-hidden className="flex flex-col gap-1.5">
        <div className="grid h-40 items-end gap-[3px] border-b-2 border-fg sm:gap-1.5" style={grid}>
          {data.map((d, i) => {
            const total = totals[i];
            const labelled = showAllValues || i === peak;
            return (
              <div key={d.key} className="flex h-full min-w-0 flex-col items-stretch justify-end">
                <span
                  className={cx(
                    "mb-1 h-4 whitespace-nowrap text-center type-meta text-[0.68rem] leading-4",
                    i === peak ? "font-bold text-fg" : "text-subtle",
                    !labelled && "invisible",
                  )}
                >
                  {total}
                </span>
                {(d.extra ?? 0) > 0 && (
                  <span
                    className="block rounded-t-xs border-2 border-b-0 border-dashed border-assoc bg-assoc-soft"
                    style={{ height: height(d.extra ?? 0) }}
                  />
                )}
                <span
                  className={cx("block min-h-px bg-assoc", !(d.extra ?? 0) && "rounded-t-xs")}
                  style={{ height: height(d.value) }}
                />
              </div>
            );
          })}
        </div>
        {hasMarker && (
          <div className="grid gap-[3px] sm:gap-1.5" style={grid}>
            {data.map((d) => (
              <span key={d.key} className="flex h-2.5 justify-center">
                {d.marker && <span className="size-2 rotate-45 bg-fg" />}
              </span>
            ))}
          </div>
        )}
        <div className="grid gap-[3px] sm:gap-1.5" style={grid}>
          {data.map((d, i) => (
            <span
              key={d.key}
              className={cx(
                "flex justify-center overflow-visible whitespace-nowrap type-meta text-[0.68rem] text-subtle",
                !showAxis(i) && "invisible",
              )}
            >
              {d.axisLabel}
            </span>
          ))}
        </div>
      </div>

      {(hasExtra || hasMarker) && (
        <ul aria-hidden className="flex flex-wrap gap-x-5 gap-y-1.5 type-small text-muted">
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-xs bg-assoc" />
            {valueLabel}
          </li>
          {hasExtra && extraLabel && (
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-xs border-2 border-dashed border-assoc bg-assoc-soft" />
              {extraLabel}
            </li>
          )}
          {hasMarker && markerLabel && (
            <li className="flex items-center gap-2">
              <span className="mx-0.5 size-2 rotate-45 bg-fg" />
              {markerLabel}
            </li>
          )}
        </ul>
      )}

      <figcaption className="max-w-2xl type-small text-muted">{summary}</figcaption>

      <details className="group rounded-sm border border-line bg-raised">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3.5 type-label text-[0.7rem] text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          {tableLabel}
          <span aria-hidden className="transition-transform group-open:rotate-180">
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m6 9.5 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <div className="max-h-80 overflow-y-auto border-t border-line">
          <table className="w-full border-collapse text-left type-small">
            <thead>
              <tr className="border-b border-line bg-sunken/60">
                <th scope="col" className="px-3.5 py-2 type-label text-[0.68rem] text-subtle">
                  {periodLabel}
                </th>
                <th scope="col" className="px-3.5 py-2 text-right type-label text-[0.68rem] text-subtle">
                  {valueLabel}
                </th>
                {hasExtra && extraLabel && (
                  <th scope="col" className="px-3.5 py-2 text-right type-label text-[0.68rem] text-subtle">
                    {extraLabel}
                  </th>
                )}
                {hasMarker && markerLabel && (
                  <th scope="col" className="px-3.5 py-2 type-label text-[0.68rem] text-subtle">
                    {markerLabel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3.5 py-1.5 font-semibold">
                    {d.label}
                  </th>
                  <td className="px-3.5 py-1.5 text-right type-meta">{d.value}</td>
                  {hasExtra && extraLabel && <td className="px-3.5 py-1.5 text-right type-meta">{d.extra ?? 0}</td>}
                  {hasMarker && markerLabel && <td className="px-3.5 py-1.5 text-muted">{d.marker ?? ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
