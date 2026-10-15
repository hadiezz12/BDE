import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CampusEvent, EventItem, EventSeries, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { EVENT_CATEGORY_LABEL, dateParts, formatDayFull, formatPrice, plural } from "@/lib/format";
import { parisDateKey } from "@/lib/time";
import { getSession } from "@/lib/session";
import { getEvent, getEvents, getRelatedEvents } from "@/lib/data/events";
import { getEventSeries, getEventSeriesById, getEventSeriesBySlug } from "@/lib/data/event-series";
import { getAssociationById } from "@/lib/data/associations";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { getPosts } from "@/lib/data/posts";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { PostBrief } from "@/components/campus/PostBrief";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { EventActionBar } from "@/components/events/EventActionBar";
import { EventActionsProvider } from "@/components/events/EventActions";
import { EventDate } from "@/components/events/EventDate";
import { EventPoster } from "@/components/events/EventPoster";
import { PracticalList } from "@/components/events/PracticalList";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import { VenueDetails } from "@/components/events/VenueDetails";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { agendaHref } from "@/components/events/agenda-filters";
import { eventAction } from "@/components/events/event-action";
import { eventAccent, eventPhase, eventSticker, isMultiDay, timeRange } from "@/components/events/event-facts";
import { seriesNumbers } from "@/components/events/series-facts";
import { SeriesView } from "./_components/SeriesView";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (event) return { title: event.title, description: event.summary };
  const series = await getEventSeriesBySlug(slug);
  if (series) return { title: `${series.name} · ${series.subtitle}`, description: series.description };
  return { title: "Événement introuvable" };
}

/**
 * /events/[slug] serves two things, a dated edition first:
 *  - a dated edition (CampusEvent) → EditionPage, the gig poster below
 *  - one of the BDE's 8 events of the year (EventSeries) → SeriesView
 * Any other slug is a 404.
 */
export default async function EventRoute({ params }: Props) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (event) return <EditionPage event={event} />;

  const series = await getEventSeriesBySlug(slug);
  if (!series) notFound();
  return <SeriesPage series={series} />;
}

/** One of the 8 events of the year, with its upcoming dated editions (none until the bureau publishes them). */
async function SeriesPage({ series }: { series: EventSeries }) {
  const now = new Date();
  const [session, all, organiser, offer, upcoming] = await Promise.all([
    getSession(),
    getEventSeries({ associationId: series.associationId }),
    getAssociationById(series.associationId),
    getMemberCardOffer(series.associationId),
    getEvents({ when: "upcoming", associationId: series.associationId }),
  ]);
  const user = session.user;
  const numbers = seriesNumbers(all);

  return (
    <SeriesView
      series={series}
      number={numbers.get(series.id) ?? "01"}
      total={all.length}
      organiser={organiser}
      editions={upcoming.filter((e) => e.seriesId === series.id)}
      others={all.filter((s) => s.id !== series.id)}
      numbers={numbers}
      offer={offer}
      manages={Boolean(user?.managedAssociationIds.includes(series.associationId))}
      personalFor={personalMarks(user)}
      now={now}
    />
  );
}

/** Registered / saved marks for a signed-in student; nothing for a visitor. */
function personalMarks(user: UserProfile | null) {
  return (e: EventItem): PersonalState | undefined =>
    user ? { registered: user.registeredEventIds.includes(e.id), saved: user.savedEventIds.includes(e.id) } : undefined;
}

/**
 * A dated edition, as a gig poster with its ticket: the lit emblem (BDE
 * signature events) or the cover photo, the title set big, then a ticket
 * strip with the date stub and when / where / how much. Below, the programme,
 * the practical lines and who organises; beside it (desktop) or under the
 * hero (phone) the registration panel. Phones get a sticky action bar above
 * the tab bar. PHASE 1: registering and saving only show a demo notice, and
 * no edition is published yet.
 */
async function EditionPage({ event }: { event: EventItem }) {
  const now = new Date();
  const [session, association, related, posts, series] = await Promise.all([
    getSession(),
    getAssociationById(event.associationId),
    getRelatedEvents(event, 3),
    getPosts(),
    event.seriesId ? getEventSeriesById(event.seriesId) : Promise.resolve(null),
  ]);

  const user = session.user;
  const registered = Boolean(user?.registeredEventIds.includes(event.id));
  /** Officer of the organising association: a way to its management space. */
  const manages = Boolean(user?.managedAssociationIds.includes(event.associationId));
  const action = eventAction(event, { registered }, now);
  const phase = eventPhase(event, now);
  const past = phase === "past";
  const canSave = Boolean(user) && !registered && (phase === "upcoming" || (phase === "live" && isMultiDay(event)));
  const showBar = action.kind !== "none" || canSave;
  const about = posts.filter((p) => p.relatedEventId === event.id);
  const recap = about.find((p) => p.kind === "recap") ?? null;
  const accent = eventAccent(event);
  const sticker = eventSticker(event, now);
  const loginHref = `${routes.login}?next=${encodeURIComponent(routes.event(event.slug))}`;
  const assoName = event.association.shortName ?? event.association.name;
  const personalFor = personalMarks(user);

  const panelProps = {
    event,
    action,
    user,
    canSave,
    loginHref,
    recap,
    bdeEvent: event.association.category === "bde",
    now,
  };

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  return (
    <EventActionsProvider initialSaved={Boolean(user?.savedEventIds.includes(event.id))}>
      <article data-accent={accent} aria-labelledby="evenement-titre">
        <div className="wrap pb-5 pt-6 sm:pt-8">
          <Breadcrumbs
            items={[
              { href: routes.events, label: "Agenda" },
              ...(series ? [{ href: routes.event(series.slug), label: series.name }] : []),
              { href: routes.event(event.slug), label: event.title },
            ]}
          />
        </div>

        {/* ---- Hero: the poster and the ticket strip ---- */}
        <header className="wrap grid gap-x-12 gap-y-7 lg:grid-cols-12 lg:items-end">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <AssociationIdentity association={event.association} />
              <Link
                href={agendaHref({ category: event.category })}
                className="type-label text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {EVENT_CATEGORY_LABEL[event.category]}
              </Link>
              {manages && (
                <Link
                  href={routes.manageEvents(event.association.slug)}
                  className="inline-flex items-center gap-1.5 type-label text-assoc-text underline-offset-4 hover:underline"
                >
                  <Icon name="edit" size={14} />
                  Gérer l&apos;événement
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <h1 id="evenement-titre" className={cx("type-poster break-words hyphens-auto", past && "text-muted")}>
                {event.title}
              </h1>
              {event.subtitle && <p className="max-w-2xl type-lead text-muted">{event.subtitle}</p>}
            </div>
            <TicketStrip event={event} now={now} />
          </div>

          <div className="relative order-first -mx-[var(--gutter)] sm:mx-0 lg:order-none lg:col-span-5">
            <MediaFrame
              photo={event.emblem ? undefined : event.cover}
              ratio="16/9"
              slot="event-hero"
              sizes="(min-width: 1024px) 38vw, 100vw"
              priority
              fallback={{ title: event.title, accent, kicker: assoName, emblem: event.emblem }}
              className={cx("sm:rounded-sm lg:aspect-[4/5] lg:max-h-[min(44rem,78vh)]", past && "[filter:grayscale(0.6)]")}
            />
            {sticker && (
              <Sticker tone={sticker.tone} tilt={-4} className="absolute left-[calc(var(--gutter)+0.25rem)] top-4 sm:left-4">
                {sticker.label}
              </Sticker>
            )}
          </div>
        </header>

        {/* ---- Body + registration panel ---- */}
        <div className="wrap grid gap-x-12 gap-y-14 pb-16 pt-12 sm:pb-20 sm:pt-16 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
            <div className="lg:hidden">
              <RegistrationPanel {...panelProps} headingId="inscription-mobile" actions={!showBar} />
            </div>

            <section aria-labelledby="programme">
              <SectionHeader id="programme" index={nextIndex()} kicker="L'événement" title="Le programme" />
              <div className="mt-6 flex max-w-[44rem] flex-col gap-5">
                {event.description.map((paragraph, i) => (
                  <p key={i} className={i === 0 ? "type-lead" : undefined}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>

            {event.practical && event.practical.length > 0 && (
              <section aria-labelledby="pratique">
                <SectionHeader
                  id="pratique"
                  index={nextIndex()}
                  kicker={past ? "Pour mémoire" : "Avant de venir"}
                  title="Infos pratiques"
                />
                <PracticalList items={event.practical} className="mt-6 max-w-[44rem]" />
              </section>
            )}

            {about.length > 0 && (
              <section aria-labelledby="sur-le-fil">
                <SectionHeader
                  id="sur-le-fil"
                  index={nextIndex()}
                  kicker={plural(about.length, "article")}
                  title="Sur le fil"
                  action={{ href: routes.campus, label: "Le fil du campus" }}
                />
                <ul className="mt-2 max-w-[44rem] divide-y divide-line">
                  {about.map((post) => (
                    <li key={post.id}>
                      <PostBrief post={post} excerpt="always" />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="organisateur" data-accent={event.association.accent}>
              <SectionHeader id="organisateur" index={nextIndex()} kicker="Organisé par" title="Qui organise" />
              <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
                <AssociationIdentity association={event.association} size="lg" showKind link={false} className="shrink-0" />
                <div className="flex max-w-xl flex-col gap-4">
                  {association?.tagline && <p className="type-lead">« {association.tagline} »</p>}
                  {association?.meetingInfo && (
                    <p className="flex items-start gap-2 type-small text-muted">
                      <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
                      {association.meetingInfo}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Link
                      href={routes.association(event.association.slug)}
                      className="inline-flex items-center gap-1.5 type-small font-bold hover:text-assoc-text"
                    >
                      Voir la page de {assoName}
                      <Icon name="arrow-right" size={16} />
                    </Link>
                    {association?.contactEmail && (
                      <a
                        href={`mailto:${association.contactEmail}`}
                        className="inline-flex max-w-full items-center gap-2 type-meta hover:text-assoc-text"
                      >
                        <Icon name="mail" size={16} className="shrink-0" />
                        <span className="break-all">{association.contactEmail}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="hidden lg:col-span-4 lg:block">
            <div className="sticky top-[calc(var(--header-h)+1.5rem)]">
              <RegistrationPanel {...panelProps} headingId="inscription" actions />
            </div>
          </div>
        </div>

        {/* Phone: last child of the article, so it docks above the tab bar while reading. */}
        {showBar && (
          <EventActionBar
            event={event}
            action={action}
            signedIn={Boolean(user)}
            canSave={canSave}
            loginHref={loginHref}
            now={now}
          />
        )}
      </article>

      {related.length > 0 && (
        <section aria-labelledby="a-suivre" className="wrap pt-[var(--section)]">
          <SectionHeader
            id="a-suivre"
            kicker={past ? "La suite du programme" : "À suivre"}
            title={past ? "Les prochains" : "Aussi au programme"}
            action={{ href: routes.events, label: "Tout l'agenda" }}
          />
          <div className="rail mt-8">
            {related.map((e) => (
              <EventPoster key={e.id} event={e} personal={personalFor(e)} now={now} className="w-[17.5rem] sm:w-[19rem]" />
            ))}
          </div>
        </section>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </EventActionsProvider>
  );
}

/* ---- Pieces ----------------------------------------------------------------- */

/** "Mercredi 14 octobre", with the year only when it isn't this one. */
function fullDay(iso: string, now: Date): string {
  const year = parisDateKey(iso).slice(0, 4);
  return year === parisDateKey(now).slice(0, 4) ? formatDayFull(iso) : `${formatDayFull(iso)} ${year}`;
}

/** "Mercredi 14 octobre" · "Du vendredi 14 au dimanche 16 novembre". */
function whenText(event: Pick<CampusEvent, "startsAt" | "endsAt">, now: Date): string {
  if (!event.endsAt || !isMultiDay(event)) return fullDay(event.startsAt, now);
  const start = dateParts(event.startsAt);
  const sameMonth = parisDateKey(event.startsAt).slice(0, 7) === parisDateKey(event.endsAt).slice(0, 7);
  const from = sameMonth ? `${start.weekdayLong} ${start.day}` : fullDay(event.startsAt, now).toLowerCase();
  return `Du ${from} au ${fullDay(event.endsAt, now).toLowerCase()}`;
}

/**
 * The hero's ticket strip: the date stub (decorative — the same date is
 * written out beside it), a perforation, then when / where / how much.
 */
function TicketStrip({ event, now }: { event: EventItem; now: Date }) {
  const range = timeRange(event, now);
  return (
    <div className="flex border-y-2 border-fg">
      <div aria-hidden className="flex w-[6.25rem] shrink-0 justify-center py-5 sm:w-[8rem]">
        <EventDate event={event} size="lg" align="center" now={now} />
      </div>
      <span
        aria-hidden
        className="perforation w-2 shrink-0 self-stretch"
        style={{ "--perf-hole": "var(--line-strong)" } as CSSProperties}
      />
      <dl className="flex min-w-0 flex-1 flex-col divide-y divide-line pl-4 sm:pl-6">
        <Fact label="Quand">
          <span className="font-bold leading-snug">{whenText(event, now)}</span>
          <span className="type-meta text-muted">
            <span aria-hidden>{range.text}</span>
            <span className="sr-only">{range.spoken}</span>
          </span>
        </Fact>
        <Fact label="Où">
          <VenueDetails venue={event.venue} />
        </Fact>
        <Fact label="Prix">
          <span className="type-meta font-bold">{formatPrice(event.price).replace(/ €/g, " €")}</span>
        </Fact>
      </dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="type-label text-muted sm:pt-1">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">{children}</dd>
    </div>
  );
}
