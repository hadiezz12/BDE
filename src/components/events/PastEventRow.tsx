import Link from "next/link";
import type { EventItem, PostItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { EventRow } from "./EventRow";
import { eventAccent } from "./event-facts";
import type { PersonalState } from "./PersonalMarks";

/**
 * An archive line: the agenda row of an event that's over, then — when the
 * fil du campus has one — a link to its récap, aligned with the row's title
 * column. The récap link sits outside the row so the row stays a single link.
 */
export function PastEventRow({
  event,
  recap,
  headingLevel = 3,
  personal,
  now = new Date(),
  className,
}: {
  event: EventItem;
  recap?: Pick<PostItem, "slug" | "title"> | null;
  headingLevel?: 2 | 3 | 4;
  personal?: PersonalState;
  now?: Date;
  className?: string;
}) {
  return (
    <div className={className}>
      <EventRow event={event} headingLevel={headingLevel} personal={personal} now={now} />
      {recap && (
        <p
          data-accent={eventAccent(event)}
          className={cx(
            "-mt-2 pb-5 pl-[calc(4.25rem+1rem)]",
            "sm:-mt-3 sm:pb-6 sm:pl-[calc(5.25rem+1.5rem)]",
            "lg:-mt-4 lg:pb-7 lg:pl-[calc(6.5rem+2rem)]",
          )}
        >
          <Link
            href={routes.post(recap.slug)}
            className="group/recap inline-flex max-w-2xl items-start gap-2 type-small font-bold hover:text-assoc-text"
          >
            <Icon name="file" size={16} className="mt-0.5 shrink-0 text-assoc-text" />
            <span>
              <span className="text-muted">Le récap&nbsp;:</span> {recap.title}
            </span>
            <Icon
              name="arrow-right"
              size={16}
              className="mt-0.5 shrink-0 transition-transform group-hover/recap:translate-x-0.5"
            />
          </Link>
        </p>
      )}
    </div>
  );
}
