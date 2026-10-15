import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { REGISTRATION_LABEL, dateParts, formatDayMonth, formatPrice, formatWhen, plural } from "@/lib/format";
import { REGISTRATION_TONE, isOver, seatsLeft } from "@/components/events/event-facts";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Sticker } from "@/components/ui/Sticker";

/** The viewer's own relation to the event (students only). */
export type EventAttendance = "inscrit" | "favori" | null;

/**
 * The event an article talks about, as a ticket: a night stub with the date
 * in big condensed numerals, a dashed tear line, then what, when, where and
 * whether you can still get in. One link (stretched title) to the event page.
 * Past events keep the ticket but drop the booking facts.
 */
export function RelatedEventTicket({
  event,
  attendance = null,
  headingLevel = 3,
  className,
}: {
  event: EventItem;
  attendance?: EventAttendance;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const over = isOver(event);
  const d = dateParts(event.startsAt);
  const reg = event.registration;
  const left = reg.status === "ouverte" || reg.status === "derniere-chance" ? seatsLeft(reg) : null;

  return (
    <article
      data-accent={event.association.accent}
      className={cx(
        "group focus-ring-within relative grid grid-cols-[5.25rem_minmax(0,1fr)] border-2 border-fg bg-raised",
        "transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-press",
        className,
      )}
    >
      {/* Decorative: the same date is written out in the body. */}
      <div aria-hidden data-surface="night" className="flex flex-col items-center justify-center gap-1.5 px-2 py-4 text-center">
        <span className="type-label text-muted">{d.weekday}</span>
        <span className="type-numeral text-[3.25rem] text-assoc-text">{d.day}</span>
        <span className="type-label">{d.month}</span>
      </div>

      <div className="flex min-w-0 flex-col gap-2 border-l-2 border-dashed border-fg p-4">
        {attendance && !over && (
          <Sticker
            tone={attendance === "inscrit" ? "accent" : "blush"}
            size="sm"
            tilt={3}
            className="absolute -top-3 right-3"
          >
            {attendance === "inscrit" ? "Tu y vas" : "Enregistré"}
          </Sticker>
        )}
        <H className="type-card text-[1.2rem] break-words">
          <Link
            href={routes.event(event.slug)}
            className="decoration-2 underline-offset-[0.15em] outline-none after:absolute after:inset-0 group-hover:underline"
          >
            {event.title}
          </Link>
        </H>
        {event.subtitle && <p className="type-small text-muted">{event.subtitle}</p>}
        <p className="flex flex-col type-meta text-muted">
          <span>{over ? `Terminé · ${formatDayMonth(event.startsAt)}` : formatWhen(event.startsAt)}</span>
          <span>{event.venue.name}</span>
        </p>
        {!over && (
          <div className="mt-1 flex flex-col gap-1.5">
            <StatusBadge tone={REGISTRATION_TONE[reg.status]}>{REGISTRATION_LABEL[reg.status]}</StatusBadge>
            <p className="type-meta">
              {formatPrice(event.price)}
              {left !== null && ` · ${plural(left, "place restante", "places restantes")}`}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
