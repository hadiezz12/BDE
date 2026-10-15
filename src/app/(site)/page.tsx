import { Suspense } from "react";
import type { Metadata } from "next";
import type { ApplicationItem, Association, EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { getEvents, getEventsByIds } from "@/lib/data/events";
import { getEventSeries } from "@/lib/data/event-series";
import { getAssociations, getAssociationsByIds } from "@/lib/data/associations";
import { getCampaigns } from "@/lib/data/recruitment";
import { getPosts } from "@/lib/data/posts";
import { getSafetyDirectory } from "@/lib/data/safety";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { getApplications } from "@/lib/data/users";
import { eventPhase } from "@/components/events/event-facts";
import { memberCardHref, memberDiscount } from "@/components/events/series-facts";
import { isActiveApplication } from "@/components/recruitment/campaign-facts";
import { HomeOpening } from "@/components/home/HomeOpening";
import { YearTicker } from "@/components/home/YearTicker";
import { PersonalStrip } from "@/components/home/PersonalStrip";
import { HomeBureau } from "@/components/home/HomeBureau";
import { HomeSeries } from "@/components/home/HomeSeries";
import { HomeMemberCard } from "@/components/home/HomeMemberCard";
import { WeekRail } from "@/components/home/WeekRail";
import { FeaturedEvent } from "@/components/home/FeaturedEvent";
import { HomeRecruitment } from "@/components/home/HomeRecruitment";
import { AssociationsRail } from "@/components/home/AssociationsRail";
import { HomeCampus } from "@/components/home/HomeCampus";
import { SafetyTeaser } from "@/components/home/SafetyTeaser";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import {
  featuredEvent,
  hasActiveMemberCard,
  heroEvent,
  personalFor,
  tonightBoard,
  type MemberCardLink,
} from "@/components/home/home-facts";

export const metadata: Metadata = {
  title: { absolute: "Very Pink Club — le BDE de GEM Alpine Business School, Paris" },
  description:
    "8 événements, une carte à 30 €, et une promo qu'on ne lâche pas. Le Very Pink Club produit les week-ends, les soirées et les apéros de GEM Alpine Business School.",
};

/**
 * The front door. The data-heavy part streams behind a skeleton of the same
 * shape (see HomeSkeleton for why it is not a loading.tsx).
 */
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

/**
 * Built on what the BDE has actually said (its maquette), night surface with
 * paper spreads for rhythm:
 *   opening (line, pitch, the two ways in) → ticker of the 8 events →
 *   personal line → the bureau and its three pillars (paper) → the 8 events
 *   of the year → the carte cotisante (paper) → VSS / VDH.
 * Blocks fed by content that does not exist yet (dated editions, recruitment,
 * other associations, the campus fil) render only once it does: no empty
 * "ce soir", no invented line-up. One `now` is shared by every component.
 */
async function HomeContent() {
  const session = await getSession();
  // Read after the request's cookies: "now" is the visit's time, never a build-time one.
  const now = new Date();
  const user = session.user;

  const [series, today, week, upcoming, campaigns, associations, posts, safety, bde, applications, registered, managed] =
    await Promise.all([
      getEventSeries(),
      getEvents({ when: "today" }),
      getEvents({ when: "week" }),
      getEvents({ when: "upcoming" }),
      getCampaigns({ scope: "open" }),
      getAssociations(),
      getPosts({ limit: 6 }),
      getSafetyDirectory(),
      getAssociations({ category: "bde" }).then((list) => list[0] ?? null),
      user ? getApplications(user.id) : Promise.resolve<ApplicationItem[]>([]),
      user ? getEventsByIds(user.registeredEventIds) : Promise.resolve<EventItem[]>([]),
      user ? getAssociationsByIds(user.managedAssociationIds) : Promise.resolve<Association[]>([]),
    ]);

  const personal = personalFor(user);
  const cardOffer = bde ? await getMemberCardOffer(bde.id) : null;
  // The card is presented on the BDE's page; without one, the index still finds it.
  const memberCard: MemberCardLink = {
    href: bde && cardOffer ? memberCardHref(bde.slug) : routes.associations,
    price: cardOffer?.price ?? null,
    discount: cardOffer ? (memberDiscount(cardOffer)?.value ?? null) : null,
  };

  // Dated editions (none published yet): what is already on screen, so no event is shown twice.
  const board = tonightBoard(today, upcoming, now);
  const hero = heroEvent(board.events, upcoming);
  const shown = new Set(board.events.map((e) => e.id));
  if (hero) shown.add(hero.id);
  const featured = featuredEvent(upcoming, shown, now);
  if (featured) shown.add(featured.id);
  const weekRest = week.filter((e) => !shown.has(e.id));
  const later = upcoming.filter((e) => !shown.has(e.id) && !week.some((w) => w.id === e.id));
  // The dated blocks carry their own bottom space before the bureau; the personal line does not.
  const datedShown = weekRest.length > 0 || later.length > 0 || featured !== null;

  // Student bits.
  const memberActive = hasActiveMemberCard(user, now);
  const nextOuting =
    registered
      .filter((e) => eventPhase(e, now) !== "past")
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
  const savedUpcoming = user ? upcoming.filter((e) => user.savedEventIds.includes(e.id)).length : 0;
  const activeApplications = applications.filter((a) => isActiveApplication(a.status));

  // The BDE has its own sections; the rail is for the other associations, once they have a page.
  const otherAssociations = associations.filter((a) => a.id !== bde?.id);
  const recruitingSeats = new Map<string, number>();
  for (const c of campaigns) recruitingSeats.set(c.associationId, (recruitingSeats.get(c.associationId) ?? 0) + c.seats);

  // Section numbers follow what is actually rendered.
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <>
      <HomeOpening board={board} hero={hero} personal={personal} memberCard={memberCard} now={now} />

      <YearTicker series={series} />

      <PersonalStrip
        user={user}
        nextOuting={nextOuting}
        savedUpcoming={savedUpcoming}
        memberActive={memberActive}
        applications={activeApplications}
        managed={managed}
        memberCard={memberCard}
        now={now}
      />

      {(weekRest.length > 0 || later.length > 0) && (
        <WeekRail
          events={weekRest}
          later={later}
          index={next()}
          personal={personal}
          now={now}
          className="pb-section"
        />
      )}

      {featured && (
        <FeaturedEvent
          event={featured}
          index={next()}
          personal={personal(featured)}
          memberActive={user ? memberActive : null}
          memberCard={memberCard}
          now={now}
        />
      )}

      {bde && (
        <HomeBureau
          bde={bde}
          index={next()}
          className={datedShown ? undefined : "mt-[var(--section)]"}
        />
      )}

      <HomeSeries series={series} index={series.length > 0 ? next() : undefined} />

      {cardOffer && <HomeMemberCard offer={cardOffer} href={memberCard.href} index={next()} />}

      {campaigns.length > 0 && <HomeRecruitment campaigns={campaigns} applications={applications} index={next()} />}

      {otherAssociations.length > 0 && (
        <AssociationsRail associations={associations} recruitingSeats={recruitingSeats} index={next()} />
      )}

      {posts.length > 0 && <HomeCampus posts={posts} index={next()} />}

      <SafetyTeaser emergency={safety.emergency} />
    </>
  );
}
