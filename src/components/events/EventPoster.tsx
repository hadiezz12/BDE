import type { CSSProperties } from "react";
import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { MediaFrame, type Ratio } from "@/components/media/MediaFrame";
import { Sticker, type StickerTone } from "@/components/ui/Sticker";
import { EventDate } from "./EventDate";
import { EventFacts } from "./EventFacts";
import { RegistrationState } from "./RegistrationState";
import { PersonalMarks, type PersonalState } from "./PersonalMarks";
import { eventAccent, eventPhase, eventSticker, relativeWords } from "./event-facts";

/**
 * An event as a gig poster with its ticket: the visual on top (the lit neon
 * emblem for the BDE's signature events, otherwise the cover photo through
 * the "event-cover" slot), then a ticket — date stub, perforation, what /
 * who / when / where — and a full-width strip saying where registration
 * stands. One sticker at most, and only a fact ("Ce soir", "Complet",
 * "Plus que 6 places"). The whole poster is one link.
 *
 *  - md : rails (home "Cette semaine", association profile). Width is the
 *         caller's: e.g. w-[17.5rem] sm:w-[19rem] inside a `rail`.
 *  - lg : featured slot — bigger stub and title, subtitle shown.
 *
 * Hover never moves the card (rails clip vertical overflow): the border takes
 * the accent and, on paper, the sticker offset shadow appears.
 */
export function EventPoster({
  event,
  size = "md",
  media = "auto",
  ratio = "4/5",
  sizes = "(min-width: 640px) 19rem, 17.5rem",
  priority,
  sticker,
  headingLevel = 3,
  showAssociation = true,
  personal,
  now = new Date(),
  className,
}: {
  event: EventItem;
  size?: "md" | "lg";
  /** auto = the neon emblem when the event has one, else the photo. */
  media?: "auto" | "photo";
  ratio?: Ratio;
  /** next/image sizes hint — match the width you give the poster. */
  sizes?: string;
  priority?: boolean;
  /** Override the computed fact; false for none. */
  sticker?: false | { label: string; tone?: StickerTone };
  headingLevel?: 2 | 3 | 4;
  showAssociation?: boolean;
  /** Student session only. */
  personal?: PersonalState;
  now?: Date;
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const accent = eventAccent(event);
  const past = eventPhase(event, now) === "past";
  const useEmblem = media === "auto" && Boolean(event.emblem);
  const fact = sticker === false ? null : (sticker ?? eventSticker(event, now));
  const lg = size === "lg";
  // The sticker already says "Ce soir": don't repeat it under the date.
  const repeatWords = !fact || fact.label !== relativeWords(event, now);

  return (
    <article
      data-accent={accent}
      className={cx(
        "group focus-ring-within relative flex flex-col overflow-hidden rounded-sm border border-line-strong bg-raised",
        "transition-[border-color,box-shadow] duration-200 ease-out hover:border-assoc hover:shadow-sticker",
        className,
      )}
    >
      <div className="relative">
        <MediaFrame
          photo={useEmblem ? undefined : event.cover}
          ratio={ratio}
          slot="event-cover"
          sizes={sizes}
          priority={priority}
          fallback={{
            title: event.title,
            accent,
            kicker: event.association.shortName ?? event.association.name,
            emblem: event.emblem,
          }}
          className={cx(past && "[filter:grayscale(0.6)]")}
          imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        {fact && (
          <Sticker tone={fact.tone ?? "accent"} tilt={-4} className="absolute left-3 top-3">
            {fact.label}
          </Sticker>
        )}
      </div>

      {/* The ticket: stub | perforation | what, who, when, where — then the registration strip */}
      <div className="flex flex-1 border-t border-line-strong">
        <div className={cx("flex shrink-0 justify-center py-4", lg ? "w-[6.25rem] sm:w-[7.5rem]" : "w-16")}>
          <EventDate event={event} size={lg ? "lg" : "md"} align="center" relative={repeatWords} now={now} />
        </div>
        <span
          aria-hidden
          className="perforation w-2 shrink-0 self-stretch"
          style={{ "--perf-hole": "var(--line-strong)" } as CSSProperties}
        />
        <div className={cx("flex min-w-0 flex-1 flex-col gap-2.5 py-4 pl-3 pr-4", lg && "sm:gap-3 sm:py-5 sm:pr-5")}>
          {showAssociation && <AssociationIdentity association={event.association} size="sm" link={false} />}
          <H
            className={cx(
              "type-card break-words hyphens-auto",
              lg ? "text-[1.45rem] leading-[1.1] sm:text-[1.85rem]" : "text-[1.15rem] leading-[1.15]",
            )}
          >
            <Link
              href={routes.event(event.slug)}
              className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
            >
              {event.title}
            </Link>
          </H>
          {lg && event.summary && <p className="line-clamp-2 type-small text-muted">{event.summary}</p>}
          <EventFacts event={event} now={now} />
        </div>
      </div>
      <div className={cx("flex flex-col gap-2 border-t border-line px-4 py-3", lg && "sm:px-5 sm:py-4")}>
        <RegistrationState event={event} now={now} meter={lg} />
        <PersonalMarks personal={personal} past={past} />
      </div>
    </article>
  );
}

