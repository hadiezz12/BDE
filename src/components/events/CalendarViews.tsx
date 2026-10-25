import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatTime, plural } from "@/lib/format";
import { WEEKDAY_LONG, WEEKDAY_SHORT, dayLabel, dayRole, eventsOn } from "@/lib/events/calendar";
import { Icon } from "@/components/ui/Icon";
import type { PersonalState } from "./PersonalMarks";
import { eventAccent, isOver, venueLine } from "./event-facts";

/**
 * The campus calendar's three views, server-rendered and plain links only:
 *  - MonthGrid: a real table (weeks × Monday…Sunday), from md up;
 *  - WeekColumns: seven columns from md, stacked days below;
 *  - DayAgenda: the days that have something, one after the other — what
 *    phones get for the month too (agenda first, no tiny cells to tap).
 * Every event is a link that says its time, title and state in words; the
 * association's colour only repeats who organises it.
 */

type Personal = (e: EventItem) => PersonalState | undefined;

/** Up to this many lines per month cell; then "+ n autres" to the day's list. */
const CELL_LIMIT = 3;

function stateWords(e: EventItem, personal?: PersonalState): string[] {
  const words: string[] = [];
  if (e.status === "cancelled") words.push("annulé");
  if (personal?.registered) words.push("tu es inscrit·e");
  else if (personal?.waitlisted) words.push("tu es en liste d'attente");
  else if (personal?.saved) words.push("enregistré");
  return words;
}

/** One line of a cell or a list: time, title, and what it is to the student. */
function CalendarEntry({
  event,
  dayKey,
  personal,
  now,
  dense = false,
}: {
  event: EventItem;
  dayKey: string;
  personal?: PersonalState;
  now: Date;
  dense?: boolean;
}) {
  const role = dayRole(event, dayKey);
  const continued = role === "middle" || role === "end";
  const cancelled = event.status === "cancelled";
  const over = isOver(event, now);
  const words = stateWords(event, personal);
  const time = continued ? (role === "end" ? `jusqu'à ${formatTime(event.endsAt)}` : "toute la journée") : formatTime(event.startsAt);

  return (
    <Link
      href={routes.event(event.slug)}
      data-accent={eventAccent(event)}
      className={cx(
        "group/entry flex min-w-0 items-start gap-1.5 rounded-xs border-l-[3px] border-assoc bg-assoc/10 px-1.5 py-1 hover:bg-assoc/20",
        (over || cancelled) && "opacity-70",
        dense ? "text-[0.75rem] leading-tight" : "type-small",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cx("font-mono", dense ? "text-[0.7rem]" : "text-[0.8rem]", "text-muted")}>
          {continued && <span aria-hidden>↦ </span>}
          {time}
        </span>{" "}
        <span className={cx("font-bold group-hover/entry:underline", cancelled && "line-through")}>{event.title}</span>
        {words.length > 0 && <span className="sr-only"> ({words.join(", ")})</span>}
      </span>
      {personal?.registered && !cancelled && (
        <Icon name="check" size={dense ? 12 : 14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ok" aria-hidden />
      )}
      {personal?.waitlisted && !personal.registered && !cancelled && (
        <Icon name="clock" size={dense ? 12 : 14} className="mt-0.5 shrink-0 text-info" aria-hidden />
      )}
    </Link>
  );
}

export function MonthGrid({
  weeks,
  monthKey,
  todayKey,
  events,
  personalFor,
  dayHref,
  now,
  className,
}: {
  weeks: string[][];
  monthKey: string;
  todayKey: string;
  events: EventItem[];
  personalFor: Personal;
  /** The day in the day-by-day list (for "+ n autres"). */
  dayHref: (dayKey: string) => string;
  now: Date;
  className?: string;
}) {
  return (
    <table className={cx("w-full table-fixed border-collapse", className)}>
      <caption className="sr-only">Événements du mois, semaine par semaine</caption>
      <thead>
        <tr>
          {WEEKDAY_SHORT.map((d, i) => (
            <th key={d} scope="col" className="border-b-2 border-fg pb-2 text-left type-label text-muted">
              <abbr title={WEEKDAY_LONG[i]} className="no-underline">
                {d}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const inMonth = day.startsWith(monthKey);
              const list = eventsOn(events, day);
              const shown = list.slice(0, CELL_LIMIT);
              const today = day === todayKey;
              return (
                <td
                  key={day}
                  className={cx(
                    "h-32 border border-line p-1.5 align-top",
                    !inMonth && "bg-sunken/60",
                    today && "outline-2 -outline-offset-2 outline-accent",
                  )}
                >
                  <div className="flex h-full flex-col gap-1">
                    <p className={cx("flex items-baseline justify-between gap-1 type-meta", !inMonth && "text-subtle", today && "font-bold text-accent-text")}>
                      <span aria-hidden>{Number(day.slice(8))}</span>
                      <span className="sr-only">{dayLabel(day)}{today ? ", aujourd'hui" : ""}{list.length ? `, ${plural(list.length, "événement")}` : ""}</span>
                      {today && <span aria-hidden className="type-caption font-bold uppercase">Auj.</span>}
                    </p>
                    {shown.map((e) => (
                      <CalendarEntry key={e.id} event={e} dayKey={day} personal={personalFor(e)} now={now} dense />
                    ))}
                    {list.length > CELL_LIMIT && (
                      <Link href={dayHref(day)} className="type-caption font-bold hover:text-accent-text">
                        + {plural(list.length - CELL_LIMIT, "autre", "autres")}
                        <span className="sr-only"> le {dayLabel(day)}</span>
                      </Link>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WeekColumns({
  days,
  todayKey,
  events,
  personalFor,
  now,
  className,
}: {
  days: string[];
  todayKey: string;
  events: EventItem[];
  personalFor: Personal;
  now: Date;
  className?: string;
}) {
  return (
    <ol className={cx("grid gap-x-2 gap-y-6 md:grid-cols-7", className)}>
      {days.map((day, i) => {
        const list = eventsOn(events, day);
        const today = day === todayKey;
        return (
          <li key={day} id={`jour-${day}`} className="flex min-w-0 flex-col gap-2 scroll-mt-[calc(var(--header-h)+1rem)]">
            <h3
              className={cx(
                "flex items-baseline gap-2 border-b-2 pb-1.5 md:flex-col md:gap-0",
                today ? "border-accent text-accent-text" : "border-fg",
              )}
            >
              <span className="type-label">{WEEKDAY_LONG[i]}</span>
              <span className="type-meta">
                {dayLabel(day).replace(/^\S+\s/, "")}
                {today && <span className="ml-1.5 type-caption font-bold uppercase">· aujourd&apos;hui</span>}
              </span>
            </h3>
            {list.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {list.map((e) => (
                  <li key={e.id}>
                    <CalendarEntry event={e} dayKey={day} personal={personalFor(e)} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-caption text-subtle">Rien de prévu</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DayAgenda({
  days,
  todayKey,
  events,
  personalFor,
  now,
  empty,
  className,
}: {
  days: string[];
  todayKey: string;
  events: EventItem[];
  personalFor: Personal;
  now: Date;
  /** Said when no day has anything. */
  empty: string;
  className?: string;
}) {
  const filled = days.map((day) => ({ day, list: eventsOn(events, day) })).filter((d) => d.list.length > 0);
  if (filled.length === 0) return <p className={cx("border-y border-line py-6 text-muted", className)}>{empty}</p>;
  return (
    <ol className={cx("flex flex-col", className)}>
      {filled.map(({ day, list }) => {
        const today = day === todayKey;
        return (
          <li
            key={day}
            id={`jour-${day}`}
            className="grid scroll-mt-[calc(var(--header-h)+1rem)] gap-2 border-t border-line py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
          >
            <h3 className={cx("type-label", today ? "text-accent-text" : "text-muted")}>
              {dayLabel(day)}
              {today && <span className="block type-caption font-bold">aujourd&apos;hui</span>}
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5">
                  <CalendarEntry event={e} dayKey={day} personal={personalFor(e)} now={now} />
                  <span className="pl-3 type-caption text-muted">
                    {e.association.shortName ?? e.association.name} · {venueLine(e.venue)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
