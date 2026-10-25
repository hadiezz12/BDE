import type { CSSProperties } from "react";
import type { CampusEvent, UserProfile } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { EventDate } from "./EventDate";
import { timeRange, venueLine } from "./event-facts";

/**
 * The registered student's confirmation, printed like a cream ticket stuck
 * on the night page: who it's for, the registration reference, their card
 * number, where and when — and the date on a tear-off stub. Shown instead of
 * the CTA, from the registration the database returned.
 */
export function EventTicket({
  event,
  holder,
  reference,
  now = new Date(),
  className,
}: {
  event: Pick<CampusEvent, "title" | "startsAt" | "endsAt" | "venue">;
  holder: Pick<UserProfile, "firstName" | "lastName" | "demoLabel" | "memberCard">;
  /** The registration's reference, to quote to the organizers. */
  reference?: string | null;
  now?: Date;
  className?: string;
}) {
  const range = timeRange(event, now);
  return (
    <div
      data-surface="paper"
      className={cx("grain flex overflow-hidden rounded-sm border-2 border-fg shadow-sticker", className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <p className="inline-flex items-center gap-1.5 type-label text-ok">
          <Icon name="check" size={15} strokeWidth={2.25} />
          Tu es inscrit·e
        </p>
        <p className="type-card break-words text-[1.05rem] leading-snug hyphens-auto">{event.title}</p>
        <dl className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <dt className="type-label text-muted">Au nom de</dt>
            <dd className="font-bold leading-snug">
              {holder.demoLabel ?? `${holder.firstName} ${holder.lastName}`}
            </dd>
          </div>
          {reference && (
            <div className="flex flex-col gap-0.5">
              <dt className="type-label text-muted">Référence</dt>
              <dd className="type-meta tracking-wider">{reference}</dd>
            </div>
          )}
          {holder.memberCard && (
            <div className="flex flex-col gap-0.5">
              <dt className="type-label text-muted">Carte cotisante</dt>
              <dd className="type-meta">{holder.memberCard.number}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="type-label text-muted">Rendez-vous</dt>
            <dd className="type-small leading-snug">
              {venueLine(event.venue)}
              <span aria-hidden className="text-subtle">
                {" "}
                ·{" "}
              </span>
              <span className="font-mono text-[0.8125rem]">
                <span aria-hidden>{range.text}</span>
                <span className="sr-only">, {range.spoken}</span>
              </span>
            </dd>
          </div>
        </dl>
      </div>
      <span
        aria-hidden
        className="perforation w-2 shrink-0 self-stretch"
        style={{ "--perf-hole": "var(--line-strong)" } as CSSProperties}
      />
      <div className="flex w-[4.75rem] shrink-0 items-center justify-center bg-sunken px-2 py-4">
        <EventDate event={event} size="sm" align="center" relative={false} lit={false} now={now} />
      </div>
    </div>
  );
}
