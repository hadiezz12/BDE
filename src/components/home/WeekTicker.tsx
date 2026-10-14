import type { EventItem } from "@/lib/types";
import { formatTime, relativeDay } from "@/lib/format";
import { Marquee } from "@/components/brand/Marquee";
import { eventAccent, eventPhase, isLit, isMultiDay, LIT_TEXT, timeRange } from "@/components/events/event-facts";

/**
 * The maquette's carousel ticker, fed with the week's agenda: when (in the
 * event's emblem or association colour), what, at what time. Plain text on
 * purpose — the copy row is hidden from assistive tech, so it must hold no
 * links; the rows and posters below carry them. Tonight's "when" is lit.
 * Below three events the loop would show its seam, so it stays off.
 */
export function WeekTicker({ events, now, className }: { events: EventItem[]; now: Date; className?: string }) {
  if (events.length < 3) return null;

  const items = events.map((e) => {
    const multi = isMultiDay(e);
    const live = eventPhase(e, now) === "live";
    const when = live ? (multi ? "En cours" : "En ce moment") : relativeDay(e.startsAt, now);
    const time = multi ? timeRange(e, now).text : formatTime(e.startsAt);
    const lit = isLit(e, now);
    return (
      <span key={e.id} data-accent={eventAccent(e)} className="flex items-baseline gap-3 whitespace-nowrap">
        <span className="type-label text-assoc-text" style={lit ? LIT_TEXT : undefined}>
          {when}
        </span>
        <span className="type-headline text-[clamp(1.3rem,1rem+1.2vw,2.05rem)]">{e.title}</span>
        <span className="type-meta text-muted">{time}</span>
      </span>
    );
  });

  return (
    <div className={className}>
      <Marquee
        items={items}
        label="Cette semaine au campus"
        duration={Math.max(40, events.length * 9)}
        className="border-y border-line py-4 sm:py-5"
      />
    </div>
  );
}
