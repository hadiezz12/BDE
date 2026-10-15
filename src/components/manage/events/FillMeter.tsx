import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";

/**
 * How full an event is, for the bureau: "inscrit·es/places · %" over a thin bar in
 * the association's colour. Numbers carry the meaning (the bar repeats them),
 * and a sentence says it for screen readers. Events without a counted gauge
 * say so in words instead of drawing an empty bar.
 */
export function FillMeter({
  registration,
  className,
}: {
  registration: Pick<CampusEvent["registration"], "capacity" | "taken" | "status">;
  className?: string;
}) {
  const { capacity, taken, status } = registration;

  if (capacity === undefined) {
    return (
      <span className={cx("type-small text-subtle", className)}>
        {status === "libre" ? "Sans inscription" : "Sans jauge"}
      </span>
    );
  }

  const cap = capacity.toLocaleString("fr-FR");
  if (taken === undefined) {
    // Gauge set, ticketing not open yet: the status badge next to it says so.
    return <span className={cx("type-meta text-muted", className)}>Jauge {cap}</span>;
  }

  const ratio = capacity > 0 ? Math.min(1, taken / capacity) : 0;
  const pct = Math.round(ratio * 100);
  const sold = taken.toLocaleString("fr-FR");

  return (
    <span className={cx("flex w-full min-w-[8.5rem] max-w-56 flex-col gap-1.5", className)}>
      <span className="flex items-baseline justify-between gap-3 type-meta">
        <span aria-hidden>
          <span className="font-bold text-fg">{sold}</span>
          <span className="text-subtle">/{cap}</span>
        </span>
        <span aria-hidden className={pct >= 100 ? "font-bold text-fg" : "text-subtle"}>
          {pct}&nbsp;%
        </span>
        <span className="sr-only">
          {sold} inscrit·es sur {cap} places, soit {pct}&nbsp;%
        </span>
      </span>
      <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-sunken">
        <span className="block h-full rounded-full bg-assoc" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
