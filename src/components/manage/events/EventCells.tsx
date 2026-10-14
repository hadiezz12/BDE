import Link from "next/link";
import type { CampusEvent, EventItem, PostItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { dateParts, formatDayShort } from "@/lib/format";
import { EventFacts } from "@/components/events/EventFacts";
import { eventPhase, isLit, isMultiDay, relativeWords } from "@/components/events/event-facts";
import { PublicationStatusBadge } from "@/components/manage/StatusBadges";

/**
 * Cells of the workspace event tables (/manage/[asso]/events and the home
 * digest). Server components: they only format the event and the clock.
 */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Mar. 14 oct." · "Ven. 14 nov. → 16 nov." for a trip. */
export function eventDayLabel(e: Pick<CampusEvent, "startsAt" | "endsAt">): string {
  const start = `${cap(dateParts(e.startsAt).weekday)}. ${formatDayShort(e.startsAt)}`;
  return isMultiDay(e) && e.endsAt ? `${start} → ${formatDayShort(e.endsAt)}` : start;
}

/** Title and venue line. The public page is the row's "Voir" action (published events only). */
export function EventTitleCell({ event }: { event: EventItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-bold break-words">{event.title}</span>
      <EventFacts event={event} show={["venue"]} layout="inline" className="font-normal" />
    </div>
  );
}

/** Day, time range, and the relative words when they help ("Ce soir", "En cours"). */
export function EventWhenCell({ event, now = new Date() }: { event: EventItem; now?: Date }) {
  const words = relativeWords(event, now);
  const lit = isLit(event, now);
  const live = eventPhase(event, now) === "live";
  return (
    <div className="flex flex-col gap-0.5">
      <time dateTime={event.startsAt} className="font-semibold">
        {eventDayLabel(event)}
      </time>
      {/* A trip's dates are already in the first line; its time range would repeat them. */}
      {!isMultiDay(event) && <EventFacts event={event} show={["time"]} layout="inline" now={now} />}
      {words && (
        <span className={cx("type-small font-bold", lit ? "text-assoc-text" : live ? "text-ok" : "text-fg")}>
          {words}
        </span>
      )}
    </div>
  );
}

/** Publication state, and what it means for students. */
export function EventPublicationCell({ event }: { event: EventItem }) {
  return (
    <div className="flex flex-col gap-1">
      <PublicationStatusBadge status={event.publication} />
      <span className="type-small text-subtle">
        {event.publication === "publie"
          ? "Dans l'agenda"
          : event.publication === "programme"
            ? "Pas encore dans l'agenda"
            : "Visible du bureau seulement"}
      </span>
    </div>
  );
}

/** Past events: is there a recap in the fil, and where is it at? */
export function RecapCell({ recap }: { recap: PostItem | undefined }) {
  if (!recap) return <span className="type-small text-subtle">Pas de récap</span>;
  if (recap.publication === "publie") {
    return (
      <Link href={routes.post(recap.slug)} className="link type-small font-semibold">
        Récap en ligne
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <PublicationStatusBadge status={recap.publication} scheduledFor={recap.scheduledFor} />
      <span className="type-small text-subtle">Récap pas encore en ligne</span>
    </div>
  );
}
