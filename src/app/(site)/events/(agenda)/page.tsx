import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import type { EventCategory, EventItem, PostItem, UserProfile } from "@/lib/types";
import type { EventWindow } from "@/lib/data/events";
import { getEventCategoryCounts, getEvents } from "@/lib/data/events";
import { getEventSeries } from "@/lib/data/event-series";
import { getPosts } from "@/lib/data/posts";
import { getSession } from "@/lib/demo-session";
import { routes } from "@/lib/routes";
import { EVENT_CATEGORY_LABEL, formatDayFull, formatWhen, plural } from "@/lib/format";
import { addDaysToKey, parisDateKey, parisISO } from "@/lib/time";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { EventRow } from "@/components/events/EventRow";
import { PastEventRow } from "@/components/events/PastEventRow";
import { SeriesRow } from "@/components/events/SeriesRow";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { groupByDay, isTonight, type DayBucket } from "@/components/events/event-facts";
import { seriesNumbers } from "@/components/events/series-facts";
import {
  AGENDA_WINDOWS,
  EVENT_CATEGORIES,
  WINDOW_LABEL,
  WINDOW_TITLE,
  agendaHref,
  countByCategory,
  emptyTitle,
  groupByMonth,
  monthLabel,
  parseCategory,
  parseWindow,
} from "@/components/events/agenda-filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DESCRIPTION =
  "Les 8 événements de l'année du Very Pink Club, le BDE de GEM Alpine Business School à Paris, chacun avec sa page, et les dates de chaque édition dès que le bureau les annonce.";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const when = parseWindow(sp.when);
  const category = parseCategory(sp.category);
  const parts = [category ? EVENT_CATEGORY_LABEL[category] : null, when !== "upcoming" ? WINDOW_TITLE[when] : null].filter(
    (p): p is string => Boolean(p),
  );
  return {
    title: parts.length > 0 ? `${parts.join(" · ")} · Agenda` : "Agenda",
    description: DESCRIPTION,
  };
}

/**
 * /events — the agenda, in two parts:
 *  01 the BDE's 8 events of the year (recurring series, each with its page)
 *  02 the dated editions, grouped Aujourd'hui / Demain / Cette semaine /
 *     Plus tard (by month), with the archive at ?when=past.
 * No edition is published yet: part 02 says who announces the dates, and the
 * filters (?when=, ?category=, plain shareable links) only appear once there
 * is something dated to filter.
 */
export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const when = parseWindow(sp.when);
  const category = parseCategory(sp.category);
  const now = new Date();

  const [session, series, today, week, upcoming, past, upcomingCounts] = await Promise.all([
    getSession(),
    getEventSeries(),
    getEvents({ when: "today" }),
    getEvents({ when: "week" }),
    getEvents({ when: "upcoming" }),
    getEvents({ when: "past" }),
    getEventCategoryCounts(),
  ]);
  const hasDated = upcoming.length > 0 || past.length > 0;
  const recaps = hasDated && when === "past" ? await getPosts({ kind: "recap" }) : [];
  const numbers = seriesNumbers(series);
  const tonight = upcoming.filter((e) => isTonight(e, now)).length;

  return (
    <>
      <PageHeader
        kicker={hasDated ? `Agenda · ${formatDayFull(now.toISOString())}` : "Agenda"}
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
        intro="Les 8 événements de l'année du Very Pink Club, chacun avec sa page, et les dates de chaque édition dès que le bureau les annonce."
      />

      {series.length > 0 && (
        <section id="les-8" aria-labelledby="les-8-titre" className="wrap scroll-mt-[calc(var(--header-h)+1rem)]">
          <SectionHeader
            id="les-8-titre"
            index="01"
            kicker="Toute l'année"
            title={`Les ${series.length} événements de l'année`}
            description="Chaque événement a sa page dédiée."
          />
          <div className="mt-6 border-b border-line-strong">
            {series.map((s) => (
              <SeriesRow key={s.id} series={s} number={numbers.get(s.id) ?? ""} headingLevel={3} />
            ))}
          </div>
        </section>
      )}

      <section id="dates" aria-labelledby="dates-titre" className="wrap pt-section">
        <SectionHeader
          id="dates-titre"
          index={series.length > 0 ? "02" : "01"}
          kicker={hasDated ? plural(upcoming.length, "date à venir", "dates à venir") : "Les éditions"}
          title="Les dates"
        />
        {hasDated ? (
          <DatedAgenda
            when={when}
            category={category}
            user={session.user}
            lists={{ today, week, upcoming, past }}
            upcomingCounts={upcomingCounts}
            recaps={recaps}
            now={now}
          />
        ) : (
          <EmptyState className="mt-8" title="Pas encore de date annoncée">
            Les dates sont annoncées par le bureau au fil de l&apos;année. Chaque édition apparaîtra ici avec son
            horaire, son lieu et son tarif.
          </EmptyState>
        )}
      </section>

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}

/* ---- Dated editions (none published yet) ------------------------------------ */

/** Filters, the student's line, then the day groups — or the archive, or what's empty for this filter. */
function DatedAgenda({
  when,
  category,
  user,
  lists,
  upcomingCounts,
  recaps,
  now,
}: {
  when: EventWindow;
  category: EventCategory | null;
  user: UserProfile | null;
  lists: Record<EventWindow, EventItem[]>;
  upcomingCounts: Partial<Record<EventCategory, number>>;
  recaps: PostItem[];
  now: Date;
}) {
  const inCategory = (list: EventItem[]) => (category ? list.filter((e) => e.category === category) : list);
  const windowAll = lists[when];
  const list = inCategory(windowAll);
  const categoryCounts = when === "upcoming" ? upcomingCounts : countByCategory(windowAll);
  const whenParam = when === "upcoming" ? undefined : when;
  const pastCount = inCategory(lists.past).length;

  const personalFor = (e: EventItem): PersonalState | undefined =>
    user ? { registered: user.registeredEventIds.includes(e.id), saved: user.savedEventIds.includes(e.id) } : undefined;

  const whenOptions: FilterOption[] = AGENDA_WINDOWS.map((w) => ({
    value: w === "upcoming" ? null : w,
    label: WINDOW_LABEL[w],
    count: inCategory(lists[w]).length,
  }));
  const categoryOptions: FilterOption[] = [
    { value: null, label: "Toutes", count: windowAll.length },
    ...EVENT_CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0 || c === category).map((c) => ({
      value: c,
      label: EVENT_CATEGORY_LABEL[c],
      count: categoryCounts[c] ?? 0,
    })),
  ];

  return (
    <>
      <div className="mt-8 flex flex-col gap-4">
        <FilterRow label="Quand">
          <FilterChips
            label="Filtrer par période"
            param="when"
            basePath={routes.events}
            options={whenOptions}
            current={whenParam ?? null}
            params={{ category: category ?? undefined }}
          />
        </FilterRow>
        <FilterRow label="Quoi">
          <FilterChips
            label="Filtrer par catégorie"
            param="category"
            basePath={routes.events}
            options={categoryOptions}
            current={category}
            params={{ when: whenParam }}
          />
        </FilterRow>
      </div>

      <PersonalLine user={user} upcoming={lists.upcoming} />

      {list.length === 0 ? (
        <EmptyAgenda when={when} category={category} next={inCategory(lists.upcoming)[0] ?? null} pastCount={pastCount} now={now} />
      ) : when === "past" ? (
        <Archive list={list} recaps={recaps} personalFor={personalFor} now={now} />
      ) : (
        groupByDay(list, now).map((group) => (
          <div key={group.bucket} className="pt-10 sm:pt-12">
            <SectionHeader
              as="h3"
              size="headline"
              rule={false}
              kicker={bucketKicker(group.bucket, group.events, now)}
              title={group.label}
            />
            {group.bucket === "plus-tard" ? (
              <div className="mt-4 border-b border-line-strong">
                {groupByMonth(group.events, now).map((month) => (
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

      {list.length > 0 && (
        <p className="pt-10">
          {when === "past" ? (
            <Link
              href={agendaHref({ category })}
              className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
            >
              <Icon name="arrow-left" size={14} />
              Retour à ce qui arrive
            </Link>
          ) : (
            pastCount > 0 && (
              <Link
                href={agendaHref({ when: "past", category })}
                className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
              >
                {plural(pastCount, "édition passée", "éditions passées")}
                <Icon name="arrow-right" size={14} />
              </Link>
            )
          )}
        </p>
      )}
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <p aria-hidden className="type-label text-muted sm:w-14 sm:shrink-0 sm:pt-3.5">
        {label}
      </p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
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

/** What the student has going on, or how to get personal marks. No greeting: demo accounts have no real name. */
function PersonalLine({ user, upcoming }: { user: UserProfile | null; upcoming: EventItem[] }) {
  if (!user) {
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

  const registered = upcoming.filter((e) => user.registeredEventIds.includes(e.id)).length;
  const saved = upcoming.filter((e) => user.savedEventIds.includes(e.id) && !user.registeredEventIds.includes(e.id)).length;
  const summary =
    registered > 0 && saved > 0
      ? `Tu es inscrit·e à ${plural(registered, "événement")} et tu en as ${saved} autre${saved > 1 ? "s" : ""} de côté`
      : registered > 0
        ? `Tu es inscrit·e à ${plural(registered, "événement")} à venir`
        : saved > 0
          ? `Tu as ${plural(saved, "événement")} de côté`
          : null;

  return (
    <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <p className="flex items-start gap-3">
        <Icon name="ticket" size={20} className="mt-0.5 shrink-0 text-muted" />
        <span>
          {summary ? (
            <>
              <strong>{summary}</strong>, c&apos;est signalé dans la liste.
            </>
          ) : (
            <>Rien de réservé pour l&apos;instant. Ouvre une date pour t&apos;inscrire ou la garder de côté.</>
          )}
        </span>
      </p>
      <Link
        href={routes.accountEvents}
        className="inline-flex shrink-0 items-center gap-1.5 type-label hover:text-accent-text"
      >
        Mes événements
        <Icon name="arrow-right" size={14} />
      </Link>
    </div>
  );
}

/** ?when=past — what's over, newest first, by month, each with its récap when there is one. */
function Archive({
  list,
  recaps,
  personalFor,
  now,
}: {
  list: EventItem[];
  recaps: PostItem[];
  personalFor: (e: EventItem) => PersonalState | undefined;
  now: Date;
}) {
  const recapFor = new Map<string, PostItem>();
  // Posts come newest first: keep the latest récap per event.
  for (const p of recaps) if (p.relatedEventId && !recapFor.has(p.relatedEventId)) recapFor.set(p.relatedEventId, p);
  const withRecap = list.filter((e) => recapFor.has(e.id)).length;

  return (
    <div className="pt-10 sm:pt-12">
      <SectionHeader
        as="h3"
        size="headline"
        rule={false}
        kicker={`${plural(list.length, "édition")} · ${plural(withRecap, "récap")}`}
        title="Déjà passés"
      />
      <div className="mt-4 border-b border-line-strong">
        {groupByMonth(list, now).map((month) => (
          <div key={month.key} className="pt-8 first:pt-2">
            <p className="flex items-baseline justify-between gap-4 pb-3 type-label text-muted">
              <span className="text-fg">{month.label}</span>
              <span>{plural(month.events.length, "édition")}</span>
            </p>
            {month.events.map((e) => (
              <PastEventRow
                key={e.id}
                event={e}
                recap={recapFor.get(e.id) ?? null}
                headingLevel={4}
                personal={personalFor(e)}
                now={now}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Says what's empty for this exact filter, and where to look instead. */
function EmptyAgenda({
  when,
  category,
  next,
  pastCount,
  now,
}: {
  when: EventWindow;
  category: EventCategory | null;
  /** First upcoming event in the same category, if any. */
  next: EventItem | null;
  pastCount: number;
  now: Date;
}) {
  const nearWindow = when === "today" || when === "week";
  let body: string;
  if (when === "past") {
    body = "Aucune édition n'est encore passée.";
  } else if (nearWindow && next) {
    body = `La prochaine : ${next.title}, ${formatWhen(next.startsAt, now).toLowerCase()}.`;
  } else if (category) {
    body = "Rien d'annoncé dans cette catégorie pour l'instant.";
  } else {
    body = "Les dates sont annoncées par le bureau au fil de l'année.";
  }

  return (
    <EmptyState
      className="mt-10"
      title={emptyTitle(when, category)}
      actions={
        <>
          {nearWindow && next && (
            <ButtonLink href={routes.event(next.slug)} icon="arrow-right">
              Voir la date
            </ButtonLink>
          )}
          {when !== "upcoming" && (
            <ButtonLink href={agendaHref({ category })} variant="secondary">
              Tout ce qui arrive
            </ButtonLink>
          )}
          {when === "upcoming" && category && (
            <ButtonLink href={agendaHref({})} variant="secondary">
              Toutes les catégories
            </ButtonLink>
          )}
          {when === "upcoming" && category && pastCount > 0 && (
            <ButtonLink href={agendaHref({ when: "past", category })} variant="ghost">
              Les passés
            </ButtonLink>
          )}
        </>
      }
    >
      {body}
    </EmptyState>
  );
}
