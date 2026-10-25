import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { EventItem, EventSeries } from "@/lib/types";
import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";
import { formatDayFull, formatTime } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getAccessOrganization } from "@/lib/governance/access";
import { getEventPageBySlug, getRelatedEvents, getSeriesEvents } from "@/lib/data/events";
import { getEventSeries, getEventSeriesBySlug } from "@/lib/data/event-series";
import { getAssociationById } from "@/lib/data/associations";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { getMyEvents, getMyEventStatus } from "@/lib/events/me";
import { personalStates } from "@/lib/events/model";
import { eventJsonLd, jsonLdScript } from "@/lib/events/seo";
import { EventActionsProvider } from "@/components/events/EventActions";
import type { PersonalRegistration } from "@/components/events/event-action";
import { eventPhase, isMultiDay } from "@/components/events/event-facts";
import { seriesNumbers } from "@/components/events/series-facts";
import { EventView } from "./_components/EventView";
import { SeriesView } from "./_components/SeriesView";

type Props = { params: Promise<{ slug: string }> };

/** Absolute once the site knows its domain (SITE_URL); relative on a bare localhost. */
function absolute(path: string): string {
  const base = siteUrl();
  return base ? new URL(path, base).toString() : path;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getEventPageBySlug(slug);
  if (page.state === "moved") permanentRedirect(routes.event(page.slug));
  if (page.state === "ok") {
    const event = page.event;
    const url = absolute(routes.event(event.slug));
    const description =
      (event.status === "cancelled" ? "Annulé. " : "") +
      (event.summary || `${formatDayFull(event.startsAt)} à ${formatTime(event.startsAt)}, par ${event.association.name}.`);
    const image = event.cover ?? null;
    return {
      title: event.status === "cancelled" ? `Annulé · ${event.title}` : event.title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: "website",
        siteName: "Very Pink Club",
        locale: "fr_FR",
        url,
        title: event.title,
        description,
        images: image
          ? [{ url: absolute(image.src), alt: image.alt, width: image.width, height: image.height }]
          : event.emblem
            ? [{ url: absolute(event.emblem), alt: "" }]
            : undefined,
      },
      twitter: { card: image ? "summary_large_image" : "summary" },
    };
  }
  const series = await getEventSeriesBySlug(slug);
  if (series) return { title: `${series.name} · ${series.subtitle}`, description: series.description };
  return { title: "Événement introuvable" };
}

/**
 * /events/[slug] serves two things, a published event first:
 *  - an event (public_event, read as a visitor: never a draft, a hidden
 *    event or one of a page that is not public) → EventPage; a former
 *    address redirects for good to the current one;
 *  - one of the BDE's 8 events of the year → SeriesView, with its dates.
 * Anything else is a plain 404 that says nothing about why.
 */
export default async function EventRoute({ params }: Props) {
  const { slug } = await params;
  const page = await getEventPageBySlug(slug);
  if (page.state === "moved") permanentRedirect(routes.event(page.slug));
  if (page.state === "ok") return <EventPage event={page.event} />;

  const series = await getEventSeriesBySlug(slug);
  if (!series) notFound();
  return <SeriesPage series={series} />;
}

/** The organization keys the viewer holds there right now (none for a visitor; never an error). */
async function rightsIn(slug: string): Promise<string[]> {
  try {
    return (await getAccessOrganization(slug))?.permissions ?? [];
  } catch {
    return [];
  }
}

/** One of the 8 events of the year, with its upcoming dates (none until the bureau publishes them). */
async function SeriesPage({ series }: { series: EventSeries }) {
  const now = new Date();
  const [session, all, organiser, offer, editions, my] = await Promise.all([
    getSession(),
    getEventSeries({ associationId: series.associationId }),
    getAssociationById(series.associationId),
    getMemberCardOffer(series.associationId),
    getSeriesEvents(series.slug),
    getMyEvents(),
  ]);
  const rights = organiser ? await rightsIn(organiser.slug) : [];
  const personal = personalStates(my);
  const upcoming = editions
    .filter((e) => Date.parse(e.endsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return (
    <SeriesView
      series={series}
      number={seriesNumbers(all).get(series.id) ?? "01"}
      total={all.length}
      organiser={organiser}
      editions={upcoming}
      others={all.filter((s) => s.id !== series.id)}
      numbers={seriesNumbers(all)}
      offer={offer}
      manages={rights.includes("events.create")}
      personalFor={(e) => (session.user ? personal.get(e.id) : undefined)}
      now={now}
    />
  );
}

/**
 * One event (EventView), from the student's own registration
 * (my_event_status: seat or waiting place, its reference, the private
 * joining details of a confirmed seat) and their marks on related events.
 */
async function EventPage({ event }: { event: EventItem }) {
  const now = new Date();
  const [session, status, association, related, series, rights, my] = await Promise.all([
    getSession(),
    getMyEventStatus(event.id),
    getAssociationById(event.associationId).catch(() => null),
    getRelatedEvents(event, 3).catch(() => [] as EventItem[]),
    event.seriesKey ? getEventSeriesBySlug(event.seriesKey) : Promise.resolve(null),
    rightsIn(event.association.slug),
    getMyEvents(),
  ]);

  const user = session.user;
  const reg = status?.registration ?? null;
  const personal: PersonalRegistration | null = reg
    ? {
        status: reg.status,
        position: reg.position,
        canCancel: Boolean(reg.can_cancel),
        cancelSource: reg.cancel_source ?? null,
        cancelReason: reg.cancel_reason ?? null,
      }
    : null;
  const holds = personal !== null && personal.status !== "cancelled";
  const phase = eventPhase(event, now);
  const canSave =
    Boolean(user) && !holds && event.status !== "cancelled" && (phase === "upcoming" || (phase === "live" && isMultiDay(event)));
  const marks = personalStates(my);
  const url = absolute(routes.event(event.slug));
  const jsonLd = eventJsonLd(event, { url, absolute, organizerUrl: absolute(routes.association(event.association.slug)) });

  return (
    <EventActionsProvider eventId={event.id} initialSaved={Boolean(status?.bookmarked)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <EventView
        event={event}
        user={user}
        personal={personal}
        reference={holds ? (reg?.reference ?? null) : null}
        accessDetails={reg?.status === "confirmed" ? (reg.access_details ?? null) : null}
        canSave={canSave}
        manages={rights.some((k) => k === "events.edit" || k === "events.publish" || k === "events.attendees.view")}
        association={association}
        series={series}
        related={related}
        personalFor={(e) => (user ? marks.get(e.id) : undefined)}
        url={url}
        now={now}
      />
    </EventActionsProvider>
  );
}
