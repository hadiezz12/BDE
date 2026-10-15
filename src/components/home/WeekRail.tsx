import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { EventPoster } from "@/components/events/EventPoster";
import type { PersonalState } from "@/components/events/PersonalMarks";

/**
 * The rest of the week as a rail of gig posters (tonight is already on the
 * board above). When the week is quiet the rail shows what comes next and
 * says so in its title, rather than leaving a hole.
 */
export function WeekRail({
  events,
  later,
  index,
  personal,
  now,
  className,
}: {
  /** This week's events not already on screen. */
  events: EventItem[];
  /** Fallback when the week is empty: the next events after it. */
  later: EventItem[];
  index?: string;
  personal: (e: EventItem) => PersonalState | undefined;
  now: Date;
  /** Bottom padding when a paper section follows. */
  className?: string;
}) {
  const quiet = events.length === 0;
  const list = (quiet ? later : events).slice(0, 8);

  return (
    <section aria-labelledby="cette-semaine" className={cx("wrap pt-section", className)}>
      <SectionHeader
        id="cette-semaine"
        index={index}
        kicker={
          quiet
            ? "La semaine est calme"
            : `${plural(events.length, "rendez-vous", "rendez-vous")} dans les 7 prochains jours`
        }
        title={quiet ? "Ensuite" : "Cette semaine"}
        action={{ href: routes.events, label: "Tout l'agenda" }}
      />
      {list.length > 0 ? (
        <ul className="rail mt-8 py-2">
          {list.map((e) => (
            <li key={e.id} className="w-[17.5rem] sm:w-[19rem]">
              <EventPoster event={e} personal={personal(e)} now={now} className="h-full" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-8"
          title="Pas encore de date annoncée"
          actions={
            <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
              Les 8 événements de l&apos;année
            </ButtonLink>
          }
        >
          Les dates sont annoncées par le bureau au fil de l&apos;année.
        </EmptyState>
      )}
    </section>
  );
}
