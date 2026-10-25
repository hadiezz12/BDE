import type { Metadata } from "next";
import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { getEventFacets, getEventPage, getFeaturedEvents, getUpcomingEvents } from "@/lib/data/events";
import { getEventSeries } from "@/lib/data/event-series";
import { getMyEvents } from "@/lib/events/me";
import { encodeEventCursor, parseEventCursor, personalStates } from "@/lib/events/model";
import {
  AVAILABILITY_LABEL,
  PLACE_LABEL,
  WHEN_LABEL,
  agendaHref,
  agendaWindow,
  emptyAgendaTitle,
  hasRefinement,
  isFiltered,
  parseAgendaFilters,
  type AgendaFilters,
} from "@/lib/events/filters";
import { dayLabel } from "@/lib/events/calendar";
import { getSession } from "@/lib/session";
import { routes } from "@/lib/routes";
import { formatDayFull, formatWhen, plural } from "@/lib/format";
import { addDaysToKey, parisDateKey, parisISO } from "@/lib/time";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { EventRow } from "@/components/events/EventRow";
import { PastEventRow } from "@/components/events/PastEventRow";
import { SeriesRow } from "@/components/events/SeriesRow";
import { AgendaFilterBar } from "@/components/events/AgendaFilterBar";
import { AgendaViewSwitch } from "@/components/events/AgendaViewSwitch";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { groupByDay, isTonight, type DayBucket } from "@/components/events/event-facts";
import { groupByMonth, monthLabel } from "@/components/events/agenda-filters";
import { seriesNumbers } from "@/components/events/series-facts";
import { FeaturedEvent } from "@/components/home/FeaturedEvent";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 40;

const DESCRIPTION =
  "L'agenda des associations de GEM Alpine Business School à Paris et les 8 événements de l'année du Very Pink Club : dates, lieux et inscriptions.";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const f = parseAgendaFilters(sp);
  const paged = parseEventCursor(sp.suite) !== null;
  return {
    title: f.when !== "upcoming" ? `${WHEN_LABEL[f.when]} · Agenda` : "Agenda",
    description: DESCRIPTION,
    alternates: { canonical: routes.events },
    // Filtered and paged views are for sharing, not for search engines (the sitemap lists every event).
    robots: isFiltered(f) || paged ? { index: false, follow: true } : undefined,
  };
}

/**
 * /events — what is happening at school, and when. Published events of every
 * public association page and of the BDE (public_events, read as a visitor):
 *  - the event the BDE features (front page only);
 *  - the dates, filtered by the URL (period, category, association, place,
 *    registration, search, chosen days), grouped Aujourd'hui / Demain /
 *    Cette semaine / Plus tard (by month), with keyset pages (?suite=);
 *    ?quand=passes is the archive, newest first;
 *  - the BDE's 8 events of the year, each with its page.
 * A signed-in student sees their own marks (registered, waiting, saved) from
 * my_events; a visitor sees the same agenda without them.
 */
export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = parseAgendaFilters(sp);
  const cursor = parseEventCursor(sp.suite);
  const now = new Date();
  const span = agendaWindow(filters, now);
  const front = !isFiltered(filters) && !cursor;

  const [session, my, facets, page, upcoming, featured, series] = await Promise.all([
    getSession(),
    getMyEvents(),
    getEventFacets(),
    getEventPage({
      from: span.from,
      to: span.to,
      order: span.order,
      category: filters.category,
      association: filters.association,
      locationType: filters.place,
      availability: filters.availability,
      q: filters.q || null,
      after: cursor,
      limit: PAGE_SIZE,
    }),
    getUpcomingEvents(),
    front ? getFeaturedEvents() : Promise.resolve([] as EventItem[]),
    getEventSeries(),
  ]);

  const signedIn = Boolean(session.user);
  const personal = personalStates(my);
  const personalFor = (e: EventItem): PersonalState | undefined => (signedIn ? personal.get(e.id) : undefined);
  const tonight = upcoming.filter((e) => e.status !== "cancelled" && isTonight(e, now)).length;
  const lead = featured[0] ?? null;
  const nextHref = page.next ? agendaHref(filters, routes.events, encodeEventCursor(page.next)) : null;
  const numbers = seriesNumbers(series);

  return (
    <>
      <PageHeader
        kicker={`Agenda · ${formatDayFull(now.toISOString())}`}
        title={
          <>
            On sort<span className="text-accent-text">&nbsp;?</span>
          </>
        }
        aside={
          tonight > 0 ? (
            <Sticker tone="accent" tilt={-3}>
              {plural(tonight, "événement")} ce soir
            </Sticker>
          ) : undefined
        }
        intro="Ce qui se passe à l'école, et quand : les événements des associations et du Very Pink Club, avec leur lieu et leurs inscriptions."
      />

      <div className="wrap -mt-2 pb-8">
        <AgendaViewSwitch current="list" />
      </div>

      {lead && (
        <FeaturedEvent event={lead} index="01" personal={personalFor(lead)} now={now} />
      )}

      <section id="dates" aria-labelledby="dates-titre" className="wrap scroll-mt-[calc(var(--header-h)+1rem)] pt-section">
        <SectionHeader
          id="dates-titre"
          index={lead ? "02" : "01"}
          kicker={front ? plural(facets.total, "date à venir", "dates à venir") : filterSummary(filters)}
          title={filters.when === "past" ? "Déjà passés" : "Les dates"}
        />
        <AgendaFilterBar filters={filters} facets={facets} className="mt-8" />
        <PersonalLine signedIn={signedIn} my={my} now={now} />

        {page.items.length === 0 ? (
          <EmptyAgenda filters={filters} paged={Boolean(cursor)} next={upcoming.find((e) => e.status !== "cancelled") ?? null} now={now} />
        ) : filters.when === "past" ? (
          <Archive list={page.items} personalFor={personalFor} now={now} />
        ) : filters.when === "range" || cursor ? (
          <ByMonth list={page.items} personalFor={personalFor} now={now} />
        ) : (
          groupByDay(page.items, now).map((group) => (
            <div key={group.bucket} className="pt-10 sm:pt-12">
              <SectionHeader
                as="h3"
                size="headline"
                rule={false}
                kicker={bucketKicker(group.bucket, group.events, now)}
                title={group.label}
              />
              {group.bucket === "plus-tard" ? (
                <ByMonth list={group.events} personalFor={personalFor} now={now} bare />
              ) : (
                <div className="mt-4 border-b border-line-strong">
                  {group.events.map((e) => (
                    <EventRow key={e.id} event={e} headingLevel={4} personal={personalFor(e)} now={now} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        <nav aria-label="Pages de l'agenda" className="flex flex-wrap items-center justify-between gap-4 pt-10">
          {cursor ? (
            <Link href={agendaHref(filters)} className="inline-flex items-center gap-1.5 type-label hover:text-accent-text">
              <Icon name="arrow-left" size={14} />
              Revenir au début
            </Link>
          ) : filters.when === "past" ? (
            <Link
              href={agendaHref({ ...filters, when: "upcoming" })}
              className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
            >
              <Icon name="arrow-left" size={14} />
              Retour à ce qui arrive
            </Link>
          ) : (
            <Link
              href={agendaHref({ ...filters, when: "past", from: null, to: null })}
              className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
            >
              Les événements passés
              <Icon name="arrow-right" size={14} />
            </Link>
          )}
          {nextHref && (
            <ButtonLink href={nextHref} variant="secondary" icon="arrow-right">
              {filters.when === "past" ? "Plus anciens" : "Plus tard"}
            </ButtonLink>
          )}
        </nav>
      </section>

      {front && series.length > 0 && (
        <section id="les-8" aria-labelledby="les-8-titre" className="wrap scroll-mt-[calc(var(--header-h)+1rem)] pt-section">
          <SectionHeader
            id="les-8-titre"
            index={lead ? "03" : "02"}
            kicker="Toute l'année"
            title={`Les ${series.length} événements de l'année`}
            description="Les grands rendez-vous du Very Pink Club : chacun a sa page, avec ses dates dès que le bureau les annonce."
          />
          <div className="mt-6 border-b border-line-strong">
            {series.map((s) => (
              <SeriesRow key={s.id} series={s} number={numbers.get(s.id) ?? ""} headingLevel={3} />
            ))}
          </div>
        </section>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}

/** "Ce week-end · Sur le campus · « tournoi »": what the list is narrowed to, in words. */
function filterSummary(f: AgendaFilters): string {
  const parts: string[] = [];
  if (f.when === "range" && f.from && f.to) {
    parts.push(f.from === f.to ? dayLabel(f.from) : `Du ${dayLabel(f.from)} au ${dayLabel(f.to)}`);
  } else if (f.when !== "upcoming") {
    parts.push(WHEN_LABEL[f.when]);
  }
  if (f.place) parts.push(PLACE_LABEL[f.place]);
  if (f.availability) parts.push(AVAILABILITY_LABEL[f.availability]);
  if (f.q) parts.push(`« ${f.q} »`);
  return parts.length ? parts.join(" · ") : "Filtré";
}

/** "Mercredi 14 octobre · 3 événements" — the date for today and tomorrow, the span for later. */
function bucketKicker(bucket: DayBucket, events: EventItem[], now: Date): string {
  const count = plural(events.length, "événement");
  if (bucket === "aujourdhui") return `${formatDayFull(now.toISOString())} · ${count}`;
  if (bucket === "demain") {
    return `${formatDayFull(parisISO(addDaysToKey(parisDateKey(now), 1), "12:00"))} · ${count}`;
  }
  if (bucket === "plus-tard") {
    const last = events[events.length - 1];
    return last ? `${count} · jusqu'en ${monthLabel(last.startsAt, now).toLowerCase()}` : count;
  }
  return count;
}

/** Month groups of an ascending list (chosen days, later pages, "plus tard"). */
function ByMonth({
  list,
  personalFor,
  now,
  bare = false,
}: {
  list: EventItem[];
  personalFor: (e: EventItem) => PersonalState | undefined;
  now: Date;
  /** Inside a day group: no top padding of its own. */
  bare?: boolean;
}) {
  return (
    <div className={bare ? "mt-4 border-b border-line-strong" : "mt-10 border-b border-line-strong"}>
      {groupByMonth(list, now).map((month) => (
        <div key={month.key} className="pt-8 first:pt-2">
          <p className="flex items-baseline justify-between gap-4 pb-3 type-label text-muted">
            <span className="text-fg">{month.label}</span>
            <span>{plural(month.events.length, "événement")}</span>
          </p>
          {month.events.map((e) => (
            <EventRow key={e.id} event={e} headingLevel={4} personal={personalFor(e)} now={now} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** What the student has going on, or how to get personal marks. */
function PersonalLine({
  signedIn,
  my,
  now: at,
}: {
  signedIn: boolean;
  my: Awaited<ReturnType<typeof getMyEvents>>;
  now: Date;
}) {
  if (!signedIn) {
    return (
      <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <p className="flex items-start gap-3">
          <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
          <span>
            Tout se lit sans compte. Pour t&apos;inscrire ou mettre un événement de côté, connecte-toi avec ton adresse
            de l&apos;école.
          </span>
        </p>
        <ButtonLink
          href={`${routes.login}?next=${encodeURIComponent(routes.events)}`}
          variant="secondary"
          size="sm"
          icon="arrow-right"
          className="self-start sm:self-auto"
        >
          Se connecter
        </ButtonLink>
      </div>
    );
  }

  const now = at.getTime();
  const upcoming = my.registrations.filter(
    (r) => r.registration.status !== "cancelled" && Date.parse(r.event.ends_at) > now && r.event.status !== "cancelled",
  );
  const confirmed = upcoming.filter((r) => r.registration.status === "confirmed").length;
  const waiting = upcoming.length - confirmed;
  const saved = my.bookmarks.filter((b) => Date.parse(b.ends_at) > now).length;
  const parts = [
    confirmed > 0 ? `inscrit·e à ${plural(confirmed, "événement")}` : null,
    waiting > 0 ? `sur ${plural(waiting, "liste", "listes")} d'attente` : null,
  ].filter(Boolean);

  return (
    <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="flex items-start gap-3">
        <Icon name="ticket" size={20} className="mt-0.5 shrink-0 text-muted" />
        <span>
          {parts.length > 0 || saved > 0 ? (
            <>
              <strong>
                {parts.length > 0 ? `Tu es ${parts.join(" et ")}` : `Tu as ${plural(saved, "événement")} de côté`}
              </strong>
              {parts.length > 0 && saved > 0 ? `, ${plural(saved, "autre", "autres")} de côté` : ""} : c&apos;est signalé
              dans la liste.
            </>
          ) : (
            <>Rien de réservé pour l&apos;instant. Ouvre un événement pour t&apos;inscrire ou le garder de côté.</>
          )}
        </span>
      </p>
      <Link href={routes.accountEvents} className="inline-flex shrink-0 items-center gap-1.5 type-label hover:text-accent-text">
        Mes événements
        <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}

/** ?quand=passes — what's over, newest first, by month. */
function Archive({
  list,
  personalFor,
  now,
}: {
  list: EventItem[];
  personalFor: (e: EventItem) => PersonalState | undefined;
  now: Date;
}) {
  return (
    <div className="mt-10 border-b border-line-strong">
      {groupByMonth(list, now).map((month) => (
        <div key={month.key} className="pt-8 first:pt-2">
          <p className="flex items-baseline justify-between gap-4 pb-3 type-label text-muted">
            <span className="text-fg">{month.label}</span>
            <span>{plural(month.events.length, "événement")}</span>
          </p>
          {month.events.map((e) => (
            <PastEventRow key={e.id} event={e} recap={null} headingLevel={4} personal={personalFor(e)} now={now} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Says what's empty for this exact filter, and where to look instead. */
function EmptyAgenda({
  filters,
  paged,
  next,
  now,
}: {
  filters: AgendaFilters;
  paged: boolean;
  /** The next event on the whole agenda, if any. */
  next: EventItem | null;
  now: Date;
}) {
  if (paged) {
    return (
      <EmptyState className="mt-10" title="C'est tout pour l'instant">
        Il n&apos;y a rien de plus dans cette liste.
      </EmptyState>
    );
  }
  const nearWindow = filters.when === "today" || filters.when === "week" || filters.when === "weekend";
  let body: string;
  if (hasRefinement(filters)) body = "Essaie avec moins de filtres, ou une autre période.";
  else if (filters.when === "past") body = "Les événements terminés apparaîtront ici.";
  else if (nearWindow && next) body = `Le prochain : ${next.title}, ${formatWhen(next.startsAt, now).toLowerCase()}.`;
  else body = "Les associations et le bureau publient leurs événements au fil de l'année : ils apparaîtront ici.";

  return (
    <EmptyState
      className="mt-10"
      title={emptyAgendaTitle(filters)}
      actions={
        <>
          {nearWindow && next && !hasRefinement(filters) && (
            <ButtonLink href={routes.event(next.slug)} icon="arrow-right">
              Voir l&apos;événement
            </ButtonLink>
          )}
          {isFiltered(filters) && (
            <ButtonLink href={routes.events} variant="secondary">
              Tout ce qui arrive
            </ButtonLink>
          )}
        </>
      }
    >
      {body}
    </EmptyState>
  );
}
