import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { registrationFacts } from "./event-facts";

/**
 * Where registration stands, in words: "Inscriptions ouvertes · 19 places
 * restantes", "Billetterie bientôt · Ouverture le 24 oct. à 12h", "Complet ·
 * Les 24 places sont prises", "Terminé · 380 inscrit·es". The label always
 * says it; colour only repeats it (green open, amber text for the last
 * places, cyan not yet / waiting list, grey closed).
 *
 *  - badge : the status alone (dense tables, side lists)
 *  - full  : status + detail line, optional fill meter (rows, posters, detail page)
 */
const TEXT_TONE = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  accent: "text-accent-text",
  neutral: "text-subtle",
} as const;

export function RegistrationState({
  event,
  variant = "full",
  meter = false,
  now = new Date(),
  className,
}: {
  event: Pick<CampusEvent, "registration" | "startsAt" | "endsAt">;
  variant?: "badge" | "full";
  /** Thin bar showing how full the event is (only when capacity is known). */
  meter?: boolean;
  now?: Date;
  className?: string;
}) {
  const f = registrationFacts(event, now);
  const badge = (
    <StatusBadge tone={f.tone} pulse={f.pulse}>
      {f.label}
    </StatusBadge>
  );
  if (variant === "badge") return <span className={className}>{badge}</span>;

  const pct = f.fill && f.fill.capacity > 0 ? Math.min(100, Math.round((f.fill.taken / f.fill.capacity) * 100)) : null;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {badge}
      {f.detail && (
        <span className={cx("type-small", f.tone === "warn" ? "font-bold text-warn" : "text-muted")}>{f.detail}</span>
      )}
      {meter && pct !== null && f.fill && (
        <span className="mt-1 flex items-center gap-2.5">
          <span aria-hidden className={cx("relative h-1 w-full max-w-48 overflow-hidden rounded-xs bg-line", TEXT_TONE[f.tone])}>
            <span className="absolute inset-y-0 left-0 bg-current" style={{ width: `${pct}%` }} />
          </span>
          <span className="type-meta whitespace-nowrap text-muted">
            <span aria-hidden>
              {f.fill.taken.toLocaleString("fr-FR")}/{f.fill.capacity.toLocaleString("fr-FR")}
            </span>
            <span className="sr-only">
              {f.fill.taken.toLocaleString("fr-FR")} inscrit·es sur {f.fill.capacity.toLocaleString("fr-FR")} places
            </span>
          </span>
        </span>
      )}
    </div>
  );
}
