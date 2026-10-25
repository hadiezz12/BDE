import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { Association, CampusEvent, EventItem, EventSeries, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { dateParts, formatDayFull } from "@/lib/format";
import { parisDateKey } from "@/lib/time";
import { agendaHref } from "@/lib/events/filters";
import { calendarInput } from "@/lib/events/seo";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { ShareArticle } from "@/components/campus/ShareArticle";
import { AddToCalendar } from "@/components/events/AddToCalendar";
import { EventActionBar } from "@/components/events/EventActionBar";
import { EventDate } from "@/components/events/EventDate";
import { EventPoster } from "@/components/events/EventPoster";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import { VenueDetails } from "@/components/events/VenueDetails";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { eventAction, type PersonalRegistration } from "@/components/events/event-action";
import { eventAccent, eventPhase, eventSticker, isMultiDay, registrationFacts, timeRange } from "@/components/events/event-facts";

/**
 * One event, as a gig poster with its ticket: the lit emblem (BDE signature
 * events) or the cover, the title set big, then a ticket strip with the date
 * stub and when / where / registration. Below, the description, the way to
 * add it to a calendar or share it, and who organises; beside it (desktop)
 * or under the hero (phone) the registration panel. Phones get a sticky
 * action bar above the tab bar. A cancelled event stays readable, with the
 * reason, and offers nothing to do.
 *
 * `preview`: the private preview of its team — same layout, nothing that
 * acts (no registration buttons, no calendar file, no share, no action bar).
 * Must sit inside EventActionsProvider unless `preview`.
 */
export function EventView({
  event,
  preview = false,
  user,
  personal,
  reference,
  accessDetails,
  canSave,
  manages,
  association,
  series,
  related,
  personalFor,
  url,
  now,
}: {
  event: EventItem;
  preview?: boolean;
  user: UserProfile | null;
  personal: PersonalRegistration | null;
  reference: string | null;
  accessDetails: string | null;
  canSave: boolean;
  /** On the event team: a way to its desk. */
  manages: boolean;
  association: Association | null;
  series: EventSeries | null;
  related: EventItem[];
  personalFor: (e: EventItem) => PersonalState | undefined;
  /** The page's absolute address (calendar entries). */
  url: string;
  now: Date;
}) {
  const action = eventAction(event, personal, now);
  const phase = eventPhase(event, now);
  const past = phase === "past";
  const cancelled = event.status === "cancelled";
  const showBar = !preview && !cancelled && (action.kind !== "none" || canSave);
  const accent = eventAccent(event);
  const sticker = eventSticker(event, now);
  const path = routes.event(event.slug);
  const loginHref = `${routes.login}?next=${encodeURIComponent(path)}`;
  const assoName = event.association.shortName ?? event.association.name;

  const panelProps = { event, action, user, personal, reference, accessDetails, canSave, loginHref, now };

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  return (
    <>
      <article data-accent={accent} aria-labelledby="evenement-titre">
        <div className="wrap pb-5 pt-6 sm:pt-8">
          <Breadcrumbs
            items={[
              { href: routes.events, label: "Agenda" },
              ...(series ? [{ href: routes.event(series.slug), label: series.name }] : []),
              { href: path, label: event.title },
            ]}
          />
        </div>

        {cancelled && (
          <div className="wrap pb-6">
            <div role="note" className="flex flex-col gap-1.5 rounded-sm border-2 border-danger bg-danger/5 p-4 sm:p-5">
              <p className="inline-flex flex-wrap items-center gap-2 type-label text-danger">
                <Icon name="alert" size={16} />
                Événement annulé
                {event.cancelledAt && (
                  <span className="font-normal normal-case tracking-normal text-muted">· le {formatDayFull(event.cancelledAt)}</span>
                )}
              </p>
              {event.cancellationReason && <p className="max-w-3xl">{event.cancellationReason}</p>}
              <p className="type-small text-muted">Les inscrit·es ont été prévenu·es. La page reste en ligne pour mémoire.</p>
            </div>
          </div>
        )}

        {/* ---- Hero: the poster and the ticket strip ---- */}
        <header className="wrap grid gap-x-12 gap-y-7 lg:grid-cols-12 lg:items-end">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <AssociationIdentity association={event.association} />
              {event.category && (
                <Link
                  href={agendaHref({ category: event.category.slug })}
                  className="type-label text-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {event.category.label}
                </Link>
              )}
              {manages && !preview && (
                <Link
                  href={routes.manageEvent(event.association.slug, event.id)}
                  className="inline-flex items-center gap-1.5 type-label text-assoc-text underline-offset-4 hover:underline"
                >
                  <Icon name="edit" size={14} />
                  Gérer l&apos;événement
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <h1
                id="evenement-titre"
                className={cx(
                  "type-poster break-words hyphens-auto",
                  (past || cancelled) && "text-muted",
                  cancelled && "line-through decoration-2",
                )}
              >
                {event.title}
              </h1>
              {event.summary && <p className="max-w-2xl type-lead text-muted">{event.summary}</p>}
              {event.coorganizers.length > 0 && (
                <p className="type-small text-muted">
                  Avec{" "}
                  {event.coorganizers.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && (i === event.coorganizers.length - 1 ? " et " : ", ")}
                      <Link href={routes.association(c.slug)} className="link font-bold text-fg">
                        {c.shortName ?? c.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
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
              className={cx(
                "sm:rounded-sm lg:aspect-[4/5] lg:max-h-[min(44rem,78vh)]",
                (past || cancelled) && "[filter:grayscale(0.6)]",
              )}
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
              <RegistrationPanel {...panelProps} headingId="inscription-mobile" actions={!preview && !showBar} />
            </div>

            <section aria-labelledby="programme">
              <SectionHeader id="programme" index={nextIndex()} kicker="L'événement" title="Le programme" />
              {event.description.length > 0 ? (
                <div className="mt-6 flex max-w-[44rem] flex-col gap-5">
                  {event.description.map((paragraph, i) => (
                    <p key={i} className={cx("whitespace-pre-line break-words", i === 0 && "type-lead")}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-6 max-w-[44rem] text-muted">
                  {assoName} n&apos;a pas encore détaillé le programme : l&apos;essentiel est ci-dessus.
                </p>
              )}
            </section>

            {!past && !preview && (
              <section aria-labelledby="garder" className="flex flex-col gap-6">
                <SectionHeader id="garder" index={nextIndex()} kicker="Ne pas l'oublier" title="Agenda et partage" />
                <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:gap-x-12">
                  {!cancelled && <AddToCalendar event={calendarInput(event, url)} icsHref={routes.eventIcs(event.slug)} />}
                  <div className="flex flex-col gap-2">
                    <p className="inline-flex items-center gap-2 type-label text-muted">
                      <Icon name="share" size={15} />
                      En parler
                    </p>
                    <ShareArticle title={event.title} path={path} />
                  </div>
                </div>
              </section>
            )}

            <section aria-labelledby="organisateur" data-accent={event.association.accent}>
              <SectionHeader id="organisateur" index={nextIndex()} kicker="Organisé par" title="Qui organise" />
              <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
                <AssociationIdentity association={event.association} size="lg" showKind link={false} className="shrink-0" />
                <div className="flex max-w-xl flex-col gap-4">
                  {association?.tagline && <p className="type-lead">« {association.tagline} »</p>}
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
              <RegistrationPanel {...panelProps} headingId="inscription" actions={!preview} />
            </div>
          </div>
        </div>

        {/* Phone: last child of the article, so it docks above the tab bar while reading. */}
        {showBar && (
          <EventActionBar
            event={event}
            action={action}
            personal={personal}
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
    </>
  );
}

/** "Mercredi 14 octobre", with the year only when it isn't this one. */
function fullDay(iso: string, now: Date): string {
  const year = parisDateKey(iso).slice(0, 4);
  return year === parisDateKey(now).slice(0, 4) ? formatDayFull(iso) : `${formatDayFull(iso)} ${year}`;
}

/** "Mercredi 14 octobre" · "Du vendredi 14 au dimanche 16 novembre". */
function whenText(event: Pick<CampusEvent, "startsAt" | "endsAt">, now: Date): string {
  if (!isMultiDay(event)) return fullDay(event.startsAt, now);
  const start = dateParts(event.startsAt);
  const sameMonth = parisDateKey(event.startsAt).slice(0, 7) === parisDateKey(event.endsAt).slice(0, 7);
  const from = sameMonth ? `${start.weekdayLong} ${start.day}` : fullDay(event.startsAt, now).toLowerCase();
  return `Du ${from} au ${fullDay(event.endsAt, now).toLowerCase()}`;
}

/**
 * The hero's ticket strip: the date stub (decorative — the same date is
 * written out beside it), a perforation, then when / where / registration.
 */
function TicketStrip({ event, now }: { event: EventItem; now: Date }) {
  const range = timeRange(event, now);
  const facts = registrationFacts(event, now);
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
        <Fact label="Entrée">
          <span className="type-small font-bold">{facts.label}</span>
          {facts.detail && <span className="type-small text-muted">{facts.detail}</span>}
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
