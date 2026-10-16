import Link from "next/link";
import type { EventItem, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatPrice, plural } from "@/lib/format";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { EventDate } from "@/components/events/EventDate";
import { EventFacts } from "@/components/events/EventFacts";
import { PersonalMarks } from "@/components/events/PersonalMarks";
import { eventAccent, eventSticker } from "@/components/events/event-facts";
import { Sticker } from "@/components/ui/Sticker";
import { accountName } from "./identity";

const nbsp = (s: string) => s.replace(/ €/g, " €");

/**
 * A student's ticket for an event they registered to. Same language as the
 * campus ticket: ink outline, a night stub where the date is a neon sign
 * (lit when it's tonight), a dashed tear line. Below the stub: what to know
 * before going (the event's practical lines), then the name on the ticket
 * and the price they pay. Only the title is a link, so the practical lines
 * stay readable and selectable.
 */
export function RegisteredTicket({
  event,
  holder,
  practicalLimit,
  headingLevel = 3,
  now = new Date(),
  className,
}: {
  event: EventItem;
  holder: Pick<UserProfile, "firstName" | "lastName" | "demoLabel" | "memberCard">;
  /** Show only the first N practical lines, then a link to the rest. */
  practicalLimit?: number;
  headingLevel?: 2 | 3;
  now?: Date;
  className?: string;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const Sub = headingLevel === 2 ? "h3" : "h4";
  const accent = eventAccent(event);
  const sticker = eventSticker(event, now);
  const practical = event.practical ?? [];
  const shown = practicalLimit !== undefined ? practical.slice(0, practicalLimit) : practical;
  const hidden = practical.length - shown.length;

  const memberPrice = event.price?.member !== undefined && event.price.member !== event.price.standard;
  const price = !event.price
    ? "Gratuit"
    : memberPrice && holder.memberCard
      ? `Tarif cotisant · ${nbsp(`${event.price.member!.toLocaleString("fr-FR")} €`)}`
      : nbsp(formatPrice(event.price));

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
          {event.subtitle && <p className="type-small text-muted">{event.subtitle}</p>}
          <EventFacts event={event} show={["time", "venue"]} now={now} />
          <PersonalMarks personal={{ registered: true }} />
        </div>
      </div>

      {shown.length > 0 && (
        <div className="border-t-2 border-dashed border-fg px-4 py-4 sm:px-6 sm:py-5">
          <Sub className="type-label">À savoir avant d&apos;y aller</Sub>
          <ul className="mt-3 flex max-w-3xl flex-col gap-2">
            {shown.map((line) => (
              <li key={line} className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-2.5 type-small">
                <span aria-hidden className="mt-[0.45em] size-2 rounded-xs bg-assoc" />
                {line}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-3 type-small">
              <Link href={routes.event(event.slug)} className="link font-bold hover:text-assoc-text">
                {plural(hidden, "autre info", "autres infos")} sur la page de l&apos;événement
              </Link>
            </p>
          )}
        </div>
      )}

      <footer className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line bg-sunken px-4 py-2.5 type-meta text-muted sm:px-6">
        <span>
          Au nom de <span className="font-bold text-fg">{accountName(holder)}</span>
        </span>
        <span>
          {price}
          {memberPrice && holder.memberCard && ` · carte ${holder.memberCard.number}`}
        </span>
      </footer>
    </article>
  );
}
