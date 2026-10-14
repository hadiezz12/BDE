import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayFull } from "@/lib/format";
import { dayDiff } from "@/lib/time";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EventPoster } from "@/components/events/EventPoster";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { eventAccent, timeRange } from "@/components/events/event-facts";
import { euros } from "./home-facts";

/**
 * The featured spread, printed on paper: the event's emblem poster with its
 * ticket on one side, and on the other what a student wants to know before
 * buying — how long to wait (a countdown, J-18), the pitch, three practical
 * lines and what the member card saves. The countdown is drawn in the
 * emblem's colour; the poster carries the only sticker.
 */
export function FeaturedEvent({
  event,
  index,
  personal,
  memberActive,
  memberCardHref,
  now,
}: {
  event: EventItem;
  /** Running section number, e.g. "02". */
  index?: string;
  personal?: PersonalState;
  /** null for a visitor (no card to speak of). */
  memberActive: boolean | null;
  memberCardHref: string;
  now: Date;
}) {
  const days = Math.max(0, dayDiff(now, event.startsAt));
  const range = timeRange(event, now);
  const practical = (event.practical ?? []).slice(0, 3);
  const club = event.association.shortName ?? event.association.name;
  const price = event.price;
  const memberPrice = price?.member !== undefined && price.member < price.standard ? price.member : null;

  return (
    <div data-surface="paper" className="grain">
      <section
        aria-labelledby="a-l-affiche"
        data-accent={eventAccent(event)}
        className="wrap grid gap-x-8 gap-y-10 py-section lg:grid-cols-12"
      >
        <SectionHeader
          id="a-l-affiche"
          index={index}
          kicker={`À l'affiche du ${club}`}
          title="Le prochain gros rendez-vous"
          className="lg:col-span-6 lg:col-start-7 lg:row-start-1"
        />

        <EventPoster
          event={event}
          size="lg"
          ratio="1/1"
          sizes="(min-width: 1024px) 34rem, (min-width: 640px) 34rem, 100vw"
          personal={personal}
          now={now}
          className="w-full max-w-[34rem] lg:col-span-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start"
        />

        <div className="flex min-w-0 flex-col gap-8 lg:col-span-6 lg:col-start-7 lg:row-start-2">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <p aria-hidden className="type-numeral text-[5.5rem] text-assoc-text sm:text-[7.5rem]">
              {days > 1 ? `J-${days}` : days === 1 ? "J-1" : "J-0"}
            </p>
            <p className="flex flex-col gap-1 pb-2">
              <span className="sr-only">{days > 1 ? `Dans ${days} jours : ` : days === 1 ? "Demain : " : "Aujourd'hui : "}</span>
              <span className="type-card">{formatDayFull(event.startsAt)}</span>
              <span className="type-meta text-muted">
                <span aria-hidden>{range.text}</span>
                <span className="sr-only">{range.spoken}</span>
              </span>
            </p>
          </div>

          <p className="max-w-2xl type-lead">{event.summary}</p>

          {practical.length > 0 && (
            <div>
              <h3 className="type-label text-muted">À savoir avant d&apos;y aller</h3>
              <ul className="mt-3 border-b border-line">
                {practical.map((line) => (
                  <li key={line} className="flex gap-3 border-t border-line py-3">
                    <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-assoc-text" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {price && memberPrice !== null && (
            <p className="flex items-start gap-3">
              <Icon name="ticket" size={20} className="mt-0.5 shrink-0 text-assoc-text" />
              {memberActive ? (
                <span>
                  Avec ta carte cotisante, tu paies <strong>{euros(memberPrice)}</strong> au lieu de{" "}
                  {euros(price.standard)}.
                </span>
              ) : (
                <span>
                  <strong>{euros(memberPrice)}</strong> avec la carte cotisante, {euros(price.standard)} sans.{" "}
                  <Link href={memberCardHref} className="link font-semibold">
                    La carte : 30&nbsp;€ l&apos;année
                  </Link>
                </span>
              )}
            </p>
          )}

          <div>
            <ButtonLink href={routes.event(event.slug)} icon="arrow-right" size="lg">
              {event.category === "soiree" ? "Voir la soirée" : "Voir l'événement"}
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
