import Image from "next/image";
import Link from "next/link";
import type { EventSeries } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { LIT_EMBLEM } from "@/components/events/event-facts";
import { Icon } from "@/components/ui/Icon";

/**
 * "Les 8 événements de l'année" on an association's page: the recurring
 * events it produces, in its own order, as a ruled list in two columns —
 * the neon emblem lit in its colour, the name, the subtitle, and when in the
 * year it comes back (in words, never a date). Each row is one link to the
 * event's own page (routes.event). Nothing dated here: dated editions are
 * announced separately.
 */
export function EventSeriesList({ series, className }: { series: EventSeries[]; className?: string }) {
  if (!series.length) return null;
  return (
    <ol className={cx("grid border-b border-line md:grid-cols-2 md:gap-x-10", className)}>
      {series.map((s, i) => (
        <li key={s.id} data-accent={s.accent} className="border-t border-line">
          <div className="group focus-ring-within relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 py-4 sm:gap-x-5">
            <span
              aria-hidden
              className="absolute -top-px left-0 h-0.5 w-full origin-left scale-x-0 bg-assoc transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100"
            />
            <Image
              src={s.emblem}
              alt=""
              width={154}
              height={154}
              className="size-16 shrink-0 rounded-full sm:size-[4.5rem]"
              style={LIT_EMBLEM}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="type-meta text-subtle">
                <span aria-hidden>{String(i + 1).padStart(2, "0")} · </span>
                {s.period}
              </p>
              <h3 className="type-card text-[1.2rem] leading-tight break-words">
                <Link
                  href={routes.event(s.slug)}
                  className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
                >
                  {s.name}
                </Link>
              </h3>
              <p className="type-small text-muted">{s.subtitle}</p>
            </div>
            <Icon
              name="arrow-right"
              size={18}
              className="shrink-0 text-assoc-text transition-transform group-hover:translate-x-0.5"
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
