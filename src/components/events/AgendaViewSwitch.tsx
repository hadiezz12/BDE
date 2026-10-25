import Link from "next/link";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { Icon, type IconName } from "@/components/ui/Icon";

export type AgendaView = "list" | "month" | "week" | "agenda";

const VIEWS: Array<{ view: AgendaView; label: string; icon: IconName; href: string }> = [
  { view: "list", label: "Liste", icon: "list", href: routes.events },
  { view: "agenda", label: "Jour par jour", icon: "calendar", href: `${routes.eventCalendar}?vue=jours` },
  { view: "week", label: "Semaine", icon: "grid", href: `${routes.eventCalendar}?vue=semaine` },
  { view: "month", label: "Mois", icon: "grid", href: `${routes.eventCalendar}?vue=mois` },
];

/**
 * How to look at the agenda: the list (with every filter), or the calendar
 * by day, week or month. Plain links (each view has its own address);
 * `hrefs` lets the calendar keep its current date when switching.
 */
export function AgendaViewSwitch({
  current,
  hrefs = {},
  className,
}: {
  current: AgendaView;
  hrefs?: Partial<Record<AgendaView, string>>;
  className?: string;
}) {
  return (
    <nav aria-label="Affichage de l'agenda" className={cx("rail sm:mx-0 sm:overflow-visible sm:px-0", className)}>
      {VIEWS.map((v) => {
        const active = v.view === current;
        return (
          <Link
            key={v.view}
            href={hrefs[v.view] ?? v.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-sm border-2 px-3.5 type-button text-[0.78rem] transition-colors",
              active ? "border-fg bg-fg text-bg" : "border-line-strong/60 text-fg hover:border-fg",
            )}
          >
            <Icon name={v.icon} size={15} />
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
