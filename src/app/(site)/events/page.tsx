import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import type { EventCategory, EventItem, PostItem, UserProfile } from "@/lib/types";
import type { EventWindow } from "@/lib/data/events";
import { getEventCategoryCounts, getEvents } from "@/lib/data/events";
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
import type { PersonalState } from "@/components/events/PersonalMarks";
import { groupByDay, isTonight, type DayBucket } from "@/components/events/event-facts";
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
  "Soirées du BDE, sport, masterclass, dîners et actions solidaires des associations du campus de Paris de GEM : dates, lieux, prix et places restantes.";

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
 * /events — the agenda. Upcoming events grouped Aujourd'hui / Demain / Cette
 * semaine / Plus tard (by month), as ruled rows with tonight's lit; the
 * archive (?when=past) lists what's over with a link to each récap. Filters
 * are plain links (?when=, ?category=), so a view can be shared.
 */
export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const when = parseWindow(sp.when);
  const category = parseCategory(sp.category);
  const now = new Date();

  const [session, today, week, upcoming, past, upcomingCounts] = await Promise.all([
    getSession(),
    getEvents({ when: "today" }),
    getEvents({ when: "week" }),
    getEvents({ when: "upcoming" }),
    getEvents({ when: "past" }),
    getEventCategoryCounts(),
  ]);
  const recaps = when === "past" ? await getPosts({ kind: "recap" }) : [];

  const byWindow: Record<EventWindow, EventItem[]> = { today, week, upcoming, past };
  const inCategory = (list: EventItem[]) => (category ? list.filter((e) => e.category === category) : list);
  const windowAll = byWindow[when];
  const list = inCategory(windowAll);
  const categoryCounts = when === "upcoming" ? upcomingCounts : countByCategory(windowAll);

  const user = session.user;
  const personalFor = (e: EventItem): PersonalState | undefined =>
    user ? { registered: user.registeredEventIds.includes(e.id), saved: user.savedEventIds.includes(e.id) } : undefined;

  const tonight = upcoming.filter((e) => isTonight(e, now)).length;
  const whenParam = when === "upcoming" ? undefined : when;

  const whenOptions: FilterOption[] = AGENDA_WINDOWS.map((w) => ({
    value: w === "upcoming" ? null : w,
    label: WINDOW_LABEL[w],
    count: inCategory(byWindow[w]).length,
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
        intro="Les soirées du VPC, le five d'Altitude, les masterclass et les dîners des assos : tout ce qui se passe autour du campus, trié par jour, avec les places qui restent et le prix adhérent."
      >
        <div className="flex flex-col gap-4">
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
      </PageHeader>

      <PersonalLine user={user} upcoming={upcoming} />

      {list.length === 0 ? (
        <EmptyAgenda
          when={when}
          category={category}
          next={inCategory(upcoming)[0] ?? null}
          pastCount={inCategory(past).length}
          now={now}
        />
      ) : when === "past" ? (
        <Archive list={list} recaps={recaps} personalFor={personalFor} now={now} />
      ) : (
        groupByDay(list, now).map((group, i) => (
          <section
            key={group.bucket}
            aria-labelledby={`jour-${group.bucket}`}
            className="wrap pt-12 sm:pt-16"
          >
            <SectionHeader
              id={`jour-${group.bucket}`}
              index={String(i + 1).padStart(2, "0")}
              kicker={bucketKicker(group.bucket, group.events, now)}
              title={group.label}
            />
            {group.bucket === "plus-tard" ? (
              <div className="mt-6 border-b border-line-strong">
                {groupByMonth(group.events, now).map((month) => (
                  <div key={month.key} className="pt-8 first:pt-2">
                    <h3 className="flex items-baseline justify-between gap-4 pb-3 type-label text-muted">
                      <span className="text-fg">{month.label}</span>
                      <span>{plural(month.events.length, "événement")}</span>
                    </h3>
                    {month.events.map((e) => (
                      <EventRow key={e.id} event={e} headingLevel={4} personal={personalFor(e)} now={now} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 border-b border-line-strong">
                {group.events.map((e) => (
                  <EventRow key={e.id} event={e} headingLevel={3} personal={personalFor(e)} now={now} />
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {list.length > 0 && (
        <p className="wrap pt-12">
          {when === "past" ? (
            <Link
              href={agendaHref({ category })}
              className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
            >
              <Icon name="arrow-left" size={14} />
              Retour à ce qui arrive
            </Link>
          ) : (
            inCategory(past).length > 0 && (
              <Link
                href={agendaHref({ when: "past", category })}
                className="inline-flex items-center gap-1.5 type-label hover:text-accent-text"
              >
                {plural(inCategory(past).length, "événement passé", "événements passés")} et leurs récaps
                <Icon name="arrow-right" size={14} />
              </Link>
            )
          )}
        </p>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}

/* ---- Pieces ----------------------------------------------------------------- */

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

/** What the student has going on, or how to get personal marks. */
function PersonalLine({ user, upcoming }: { user: UserProfile | null; upcoming: EventItem[] }) {
  if (!user) {
    return (
      <div className="wrap">
        <div className="flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="flex items-start gap-3">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
            <span>
              Tout se lit sans compte. Pour t&apos;inscrire ou mettre un événement de côté, connecte-toi avec ton
              adresse de l&apos;école.
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
      </div>
    );
  }

  const registered = upcoming.filter((e) => user.registeredEventIds.includes(e.id)).length;
  const saved = upcoming.filter((e) => user.savedEventIds.includes(e.id) && !user.registeredEventIds.includes(e.id)).length;
  const summary =
    registered > 0 && saved > 0
      ? `tu es inscrit·e à ${plural(registered, "événement")} et tu en as ${saved} autre${saved > 1 ? "s" : ""} de côté`
      : registered > 0
        ? `tu es inscrit·e à ${plural(registered, "événement")} à venir`
        : saved > 0
          ? `tu as ${plural(saved, "événement")} de côté`
          : null;

  return (
    <div className="wrap">
      <div className="flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <p className="flex items-start gap-3">
          <Icon name="ticket" size={20} className="mt-0.5 shrink-0 text-muted" />
          <span>
            {summary ? (
              <>
                {user.firstName}, <strong>{summary}</strong> : c&apos;est signalé dans la liste.
              </>
            ) : (
              <>Rien de réservé pour l&apos;instant, {user.firstName}. Ouvre un événement pour t&apos;inscrire ou le garder de côté.</>
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
    <section aria-labelledby="passes" className="wrap pt-12 sm:pt-16">
      <SectionHeader
        id="passes"
        index="01"
        kicker={`${plural(list.length, "événement")} · ${plural(withRecap, "récap")}`}
        title="Déjà passés"
        description="Pour celles et ceux qui y étaient, et pour les autres qui le regrettent : les récaps et les photos sont sur le fil du campus."
      />
      <div className="mt-6 border-b border-line-strong">
        {groupByMonth(list, now).map((month) => (
          <div key={month.key} className="pt-8 first:pt-2">
            <h3 className="flex items-baseline justify-between gap-4 pb-3 type-label text-muted">
              <span className="text-fg">{month.label}</span>
              <span>{plural(month.events.length, "événement")}</span>
            </h3>
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
    </section>
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
    body = "Les récaps arrivent après les premiers événements de l'année. Pour l'instant, tout est devant toi.";
  } else if (nearWindow && next) {
    body = `Le prochain : ${next.title}, ${formatWhen(next.startsAt, now).toLowerCase()}.`;
  } else if (category) {
    body = "Les assos n'ont rien programmé dans cette catégorie pour l'instant. Les dates tombent souvent en début de mois.";
  } else {
    body = "Le bureau prépare la suite. En attendant, le fil du campus raconte ce qui vient de se passer.";
  }

  return (
    <section aria-labelledby="vide" className="wrap pt-12 sm:pt-16">
      <SectionHeader
        id="vide"
        kicker={category ? EVENT_CATEGORY_LABEL[category] : "0 événement"}
        title={when === "past" ? "Déjà passés" : WINDOW_LABEL[when]}
      />
      <EmptyState
        className="mt-8"
        title={emptyTitle(when, category)}
        actions={
          <>
            {nearWindow && next && (
              <ButtonLink href={routes.event(next.slug)} icon="arrow-right">
                Voir l&apos;événement
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
            {when === "upcoming" && !category && (
              <ButtonLink href={routes.campus} variant="secondary" icon="arrow-right">
                Le fil du campus
              </ButtonLink>
            )}
          </>
        }
      >
        {body}
      </EmptyState>
    </section>
  );
}
