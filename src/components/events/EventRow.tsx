import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Icon } from "@/components/ui/Icon";
import { EventDate } from "./EventDate";
import { EventFacts } from "./EventFacts";
import { RegistrationState } from "./RegistrationState";
import { PersonalMarks, type PersonalState } from "./PersonalMarks";
import { eventAccent, eventPhase, isLit, LIT_TUBE, relativeWords, timeRange, venueLine } from "./event-facts";

/**
 * One line of the agenda: date block, who, what, when/where/how much, and
 * where registration stands. The whole row is one link (stretched from the
 * title) — no nested controls. Tonight's row is lit: its top rule becomes a
 * neon tube and its numeral glows (on paper: a solid accent rule, accent ink).
 *
 * default — the agenda (/events, association profile, student space)
 *   phone   : date | association · title · facts · registration
 *   tablet  : date | association · title · facts | registration
 *   desktop : date | association · title | facts | registration  (one line)
 * compact — side lists ("Aussi cette semaine", home aside): small date,
 *   title, one meta line, status badge.
 */
export function EventRow({
  event,
  variant = "default",
  headingLevel = 3,
  showAssociation = true,
  personal,
  now = new Date(),
  className,
}: {
  event: EventItem;
  variant?: "default" | "compact";
  headingLevel?: 2 | 3 | 4;
  /** Off on the association's own page, where it would repeat the page title. */
  showAssociation?: boolean;
  /** Student session only. */
  personal?: PersonalState;
  now?: Date;
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const lit = isLit(event, now);
  const past = eventPhase(event, now) === "past";
  const accent = eventAccent(event);

  const title = (size: string) => (
    <H className={cx("type-card break-words hyphens-auto", size, past && "text-muted")}>
      <Link
        href={routes.event(event.slug)}
        className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
      >
        {event.title}
      </Link>
    </H>
  );

  const rule = lit ? (
    <span aria-hidden className="absolute inset-x-0 -top-px h-0.5 bg-assoc" style={LIT_TUBE} />
  ) : (
    <span
      aria-hidden
      className={cx(
        "absolute -top-px left-0 h-[3px] w-full origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100",
        past ? "bg-line-strong" : "bg-assoc",
      )}
    />
  );

  if (variant === "compact") {
    const words = relativeWords(event, now);
    const range = timeRange(event, now);
    return (
      <article
        data-accent={accent}
        className={cx(
          "group focus-ring-within relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3.5 border-t py-3.5 transition-colors hover:bg-raised/60",
          lit ? "border-transparent" : "border-line",
          className,
        )}
      >
        {rule}
        <EventDate event={event} size="sm" relative={false} now={now} />
        <div className="flex min-w-0 flex-col gap-1">
          {showAssociation && (
            <span
              data-accent={event.association.accent}
              className="truncate text-[0.8125rem] font-bold text-assoc-text"
            >
              {event.association.name}
            </span>
          )}
          {title("text-[1.05rem] leading-snug")}
          <p className="flex flex-col type-small text-muted">
            <span>
              {words && <span className={cx("font-bold", lit ? "text-assoc-text" : "text-fg")}>{words} · </span>}
              <span className="font-mono text-[0.8125rem]">
                <span aria-hidden>{range.text}</span>
                <span className="sr-only">{range.spoken}</span>
              </span>
            </span>
            <span>{venueLine(event.venue)}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <RegistrationState event={event} variant="badge" now={now} />
            <PersonalMarks personal={personal} past={past} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-accent={accent}
      className={cx(
        "group focus-ring-within relative grid gap-x-4 gap-y-3 border-t py-5 transition-colors hover:bg-raised/60",
        lit ? "border-transparent" : "border-line-strong",
        "grid-cols-[4.25rem_minmax(0,1fr)] [grid-template-areas:'date_main'_'date_facts'_'date_state']",
        "sm:grid-cols-[5.25rem_minmax(0,1fr)_minmax(0,11.5rem)] sm:gap-x-6 sm:py-6 sm:[grid-template-areas:'date_main_state'_'date_facts_state']",
        "lg:grid-cols-[6.5rem_minmax(0,6fr)_minmax(0,3.5fr)_minmax(0,3fr)] lg:gap-x-8 lg:py-7 lg:[grid-template-areas:'date_main_facts_state']",
        className,
      )}
    >
      {rule}

      <EventDate event={event} size="md" now={now} className="self-start [grid-area:date]" />

      <div className="flex min-w-0 flex-col gap-2 [grid-area:main]">
        {showAssociation && <AssociationIdentity association={event.association} size="sm" link={false} />}
        {title("text-[1.25rem] leading-[1.15] sm:text-[1.4rem] lg:text-[1.6rem]")}
        {event.subtitle && <p className="hidden type-small text-muted sm:block">{event.subtitle}</p>}
      </div>

      <EventFacts event={event} now={now} className="[grid-area:facts] lg:pt-1" />

      <div className="flex min-w-0 flex-col gap-3 [grid-area:state] lg:pt-1">
        <RegistrationState event={event} now={now} />
        <PersonalMarks personal={personal} past={past} />
        <Icon
          name="arrow-right"
          size={20}
          className={cx(
            "mt-auto hidden self-end transition-transform group-hover:translate-x-0.5 sm:block",
            past ? "text-subtle" : "text-assoc-text",
          )}
        />
      </div>
    </article>
  );
}
