import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { EventDate } from "@/components/events/EventDate";
import { EventFacts } from "@/components/events/EventFacts";
import { RegistrationState } from "@/components/events/RegistrationState";
import { PublicationStatusBadge } from "@/components/manage/StatusBadges";
import { FillMeter } from "@/components/manage/events/FillMeter";

/**
 * Next events on the workspace home, drafts included: date stub, title and
 * time, where publication and registration stand, how full it is.
 *   phone   : date | title, facts, status, meter (stacked)
 *   sm      : date | title + status | meter
 *   lg      : date | title | registration | meter
 */
export function UpcomingEvents({ events, now = new Date() }: { events: EventItem[]; now?: Date }) {
  return (
    <ul className="border-b border-line">
      {events.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-t border-line py-4 sm:grid-cols-[3.75rem_minmax(0,1fr)_12rem] lg:grid-cols-[3.75rem_minmax(0,1fr)_13rem_12rem] lg:items-center"
        >
          <EventDate event={e} size="sm" now={now} />

          <div className="flex min-w-0 flex-col gap-1.5">
            {e.publication === "publie" ? (
              <Link href={routes.event(e.slug)} className="link w-fit font-bold leading-snug">
                {e.title}
              </Link>
            ) : (
              <span className="font-bold leading-snug">{e.title}</span>
            )}
            <EventFacts event={e} show={["time", "venue"]} layout="inline" now={now} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:hidden">
              {e.publication !== "publie" && <PublicationStatusBadge status={e.publication} />}
              <RegistrationState event={e} variant="badge" now={now} />
            </div>
          </div>

          <div className="hidden flex-col gap-1.5 lg:flex">
            {e.publication !== "publie" && <PublicationStatusBadge status={e.publication} />}
            <RegistrationState event={e} variant="badge" now={now} />
          </div>

          <FillMeter registration={e.registration} className="col-start-2 sm:col-start-auto" />
        </li>
      ))}
    </ul>
  );
}
