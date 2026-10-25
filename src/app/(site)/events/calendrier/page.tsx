import type { Metadata } from "next";
import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getEventsBetween } from "@/lib/data/events";
import { getMyEvents } from "@/lib/events/me";
import { personalStates } from "@/lib/events/model";
import {
  addMonths,
  monthGrid,
  monthLabel,
  monthOf,
  parseDayKey,
  parseMonthKey,
  rangeOf,
  todayKey as todayKeyOf,
  weekDays,
} from "@/lib/events/calendar";
import { addDaysToKey } from "@/lib/time";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { AgendaViewSwitch, type AgendaView } from "@/components/events/AgendaViewSwitch";
import { DayAgenda, MonthGrid, WeekColumns } from "@/components/events/CalendarViews";
import type { PersonalState } from "@/components/events/PersonalMarks";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type CalendarView = Exclude<AgendaView, "list">;

const VIEW_PARAM: Record<CalendarView, string> = { month: "mois", week: "semaine", agenda: "jours" };
const VIEW_OF = new Map(Object.entries(VIEW_PARAM).map(([k, v]) => [v, k as CalendarView]));

function parseView(raw: string | string[] | undefined): CalendarView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VIEW_OF.get(v ?? "") ?? "month";
}

/** The calendar's own address for a view and a date. */
function calendarHref(view: CalendarView, key: string): string {
  const sp = new URLSearchParams({ vue: VIEW_PARAM[view] });
  sp.set(view === "week" ? "jour" : "mois", key);
  return `${routes.eventCalendar}?${sp.toString()}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const metadata: Metadata = {
  title: "Calendrier · Agenda",
  description: "Les événements des associations de GEM Alpine Business School à Paris, mois par mois et semaine par semaine.",
  // One page per month and per week: the agenda and the sitemap are what search engines get.
  robots: { index: false, follow: true },
};

/**
 * /events/calendrier — the same public events as the agenda (public_events,
 * read as a visitor), laid out by date: ?vue=mois (default; phones get the
 * day-by-day list of the month, the grid comes from md up), ?vue=semaine
 * (seven columns, stacked on phones) or ?vue=jours. ?mois=YYYY-MM and
 * ?jour=YYYY-MM-DD move in time; Paris days throughout, clock changes
 * included. Plain links only: the browser's back button walks back in time.
 */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = parseView(sp.vue);
  const now = new Date();
  const today = todayKeyOf(now);
  const day = parseDayKey(sp.jour) ?? today;
  const month = parseMonthKey(sp.mois) ?? monthOf(view === "week" ? day : today);

  const weeks = monthGrid(month);
  const week = weekDays(day);
  const span = view === "week" ? rangeOf(week) : rangeOf(weeks.flat());

  const [session, my, { items, truncated }] = await Promise.all([
    getSession(),
    getMyEvents(),
    getEventsBetween(span.from, span.to),
  ]);
  const personal = personalStates(my);
  const personalFor = (e: EventItem): PersonalState | undefined => (session.user ? personal.get(e.id) : undefined);
  const monthDays = weeks.flat().filter((d) => d.startsWith(month));

  const prev = view === "week" ? calendarHref("week", addDaysToKey(week[0], -7)) : calendarHref(view, addMonths(month, -1));
  const next = view === "week" ? calendarHref("week", addDaysToKey(week[0], 7)) : calendarHref(view, addMonths(month, 1));
  const current = view === "week" ? calendarHref("week", today) : calendarHref(view, monthOf(today));
  const isCurrent = view === "week" ? week.includes(today) : month === monthOf(today);
  const sameMonth = monthOf(week[0]) === monthOf(week[6]);
  const heading =
    view === "week"
      ? `Semaine du ${Number(week[0].slice(8))}${sameMonth ? "" : ` ${monthLabel(monthOf(week[0])).split(" ")[0]}`} au ${Number(week[6].slice(8))} ${monthLabel(monthOf(week[6]))}`
      : capitalize(monthLabel(month));
  const count = items.length;

  return (
    <>
      <PageHeader
        variant="document"
        crumbs={[
          { href: routes.events, label: "Agenda" },
          { href: routes.eventCalendar, label: "Calendrier" },
        ]}
        kicker="Calendrier"
        title={heading}
        intro="Les événements publiés par les associations et le Very Pink Club, au jour près. Pour chercher ou filtrer, passe par la liste."
      />

      <div className="wrap flex flex-col gap-6 pb-section">
        <AgendaViewSwitch
          current={view}
          hrefs={{
            month: calendarHref("month", view === "week" ? monthOf(day) : month),
            agenda: calendarHref("agenda", view === "week" ? monthOf(day) : month),
            week: calendarHref("week", view === "week" ? day : month === monthOf(today) ? today : `${month}-01`),
          }}
        />

        <nav aria-label="Changer de période" className="flex flex-wrap items-center justify-between gap-3 border-y-2 border-fg py-3">
          <Link href={prev} className="inline-flex min-h-10 items-center gap-1.5 type-label hover:text-accent-text" rel="prev">
            <Icon name="arrow-left" size={15} />
            {view === "week" ? "Semaine précédente" : "Mois précédent"}
          </Link>
          {!isCurrent && (
            <Link href={current} className="inline-flex min-h-10 items-center gap-1.5 type-label text-accent-text hover:underline">
              Aujourd&apos;hui
            </Link>
          )}
          <Link href={next} className="inline-flex min-h-10 items-center gap-1.5 type-label hover:text-accent-text" rel="next">
            {view === "week" ? "Semaine suivante" : "Mois suivant"}
            <Icon name="arrow-right" size={15} />
          </Link>
        </nav>

        <p className="type-meta text-muted" aria-live="polite">
          {count === 0 ? "Aucun événement publié sur cette période." : `${count} événement${count > 1 ? "s" : ""} sur cette période.`}
          {truncated && " La liste est longue : seuls les premiers sont affichés, la liste de l'agenda a tout."}
        </p>

        {view === "month" && (
          <>
            <MonthGrid
              weeks={weeks}
              monthKey={month}
              todayKey={today}
              events={items}
              personalFor={personalFor}
              dayHref={(d) => `${calendarHref("agenda", month)}#jour-${d}`}
              now={now}
              className="hidden md:table"
            />
            <DayAgenda
              days={monthDays}
              todayKey={today}
              events={items}
              personalFor={personalFor}
              now={now}
              empty="Rien de publié ce mois-ci pour l'instant."
              className="md:hidden"
            />
          </>
        )}
        {view === "week" && (
          <WeekColumns days={week} todayKey={today} events={items} personalFor={personalFor} now={now} />
        )}
        {view === "agenda" && (
          <DayAgenda
            days={monthDays}
            todayKey={today}
            events={items}
            personalFor={personalFor}
            now={now}
            empty="Rien de publié ce mois-ci pour l'instant."
          />
        )}

        <p className="flex flex-wrap items-center gap-x-6 gap-y-2 type-small text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="check" size={14} strokeWidth={2.5} className="text-ok" /> tu es inscrit·e
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={14} className="text-info" /> liste d&apos;attente
          </span>
          <span>
            <span className="line-through">Barré</span> : annulé
          </span>
        </p>
      </div>
    </>
  );
}
