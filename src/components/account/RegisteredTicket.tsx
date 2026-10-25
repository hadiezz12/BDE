import Link from "next/link";
import type { EventItem, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { EventDate } from "@/components/events/EventDate";
import { EventFacts } from "@/components/events/EventFacts";
import { PersonalMarks } from "@/components/events/PersonalMarks";
import { eventAccent, eventSticker } from "@/components/events/event-facts";
import { Sticker } from "@/components/ui/Sticker";
import { accountName } from "./identity";

/**
 * A student's ticket for an event they registered to (or are waiting for).
 * Same language as the campus ticket: ink outline, a night stub where the
 * date is a neon sign (lit when it's tonight), a dashed tear line. Below the
 * stub: the private joining details for a confirmed seat, then the name on
 * the ticket and the registration reference to quote to the organizers.
 * Only the title is a link, so the details stay readable and selectable.
 */
export function RegisteredTicket({
  event,
  holder,
  registration,
  accessDetails,
  headingLevel = 3,
  now = new Date(),
  className,
}: {
  event: EventItem;
  holder: Pick<UserProfile, "firstName" | "lastName" | "demoLabel">;
  registration: { status: "confirmed" | "waitlisted"; position: number | null; reference: string };
  /** Private instructions (confirmed seats only, from my_events). */
  accessDetails?: string | null;
  headingLevel?: 2 | 3;
  now?: Date;
  className?: string;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const Sub = headingLevel === 2 ? "h3" : "h4";
  const accent = eventAccent(event);
  const sticker = eventSticker(event, now);
  const confirmed = registration.status === "confirmed";

  return (
    <article data-accent={accent} className={cx("relative border-2 border-fg bg-raised", className)}>
      <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        <div data-surface="night" data-theme="dark" className="flex justify-center px-2 py-5 sm:py-7">
          <EventDate event={event} size="md" align="center" now={now} />
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-l-2 border-dashed border-fg p-4 sm:gap-3.5 sm:p-6">
          {sticker && (
            <Sticker tone={sticker.tone} tilt={3} className="absolute -top-3 right-3">
              {sticker.label}
            </Sticker>
          )}
          <AssociationIdentity association={event.association} size="sm" />
          <H className="type-card break-words hyphens-auto text-[1.3rem] leading-[1.12] sm:text-[1.7rem]">
            <Link href={routes.event(event.slug)} className="link decoration-2 hover:text-assoc-text">
              {event.title}
            </Link>
          </H>
          {event.summary && <p className="line-clamp-2 type-small text-muted">{event.summary}</p>}
          <EventFacts event={event} show={["time", "venue"]} now={now} />
          <PersonalMarks
            personal={confirmed ? { registered: true } : { waitlisted: true, position: registration.position }}
          />
        </div>
      </div>

      {confirmed && accessDetails && (
        <div className="border-t-2 border-dashed border-fg px-4 py-4 sm:px-6 sm:py-5">
          <Sub className="type-label">Pour les inscrit·es</Sub>
          <p className="mt-2 max-w-3xl whitespace-pre-line break-words type-small">{accessDetails}</p>
        </div>
      )}

      <footer className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line bg-sunken px-4 py-2.5 type-meta text-muted sm:px-6">
        <span>
          Au nom de <span className="font-bold text-fg">{accountName(holder)}</span>
        </span>
        <span>
          Réf. <span className="tracking-wider text-fg">{registration.reference}</span>
        </span>
      </footer>
    </article>
  );
}
