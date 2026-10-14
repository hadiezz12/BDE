import { Suspense } from "react";
import type { Metadata } from "next";
import type { ApplicationItem, Association, EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/demo-session";
import { getEvents, getEventsByIds } from "@/lib/data/events";
import { getAssociations, getAssociationsByIds } from "@/lib/data/associations";
import { getCampaigns } from "@/lib/data/recruitment";
import { getPosts } from "@/lib/data/posts";
import { getSafetyDirectory } from "@/lib/data/safety";
import { getApplications } from "@/lib/data/users";
import { eventPhase } from "@/components/events/event-facts";
import { isActiveApplication } from "@/components/recruitment/campaign-facts";
import { HomeOpening } from "@/components/home/HomeOpening";
import { WeekTicker } from "@/components/home/WeekTicker";
import { PersonalStrip } from "@/components/home/PersonalStrip";
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
} from "@/components/home/home-facts";

export const metadata: Metadata = {
  title: { absolute: "Very Pink Club — le BDE de GEM Paris" },
  description:
    "Ce soir, cette semaine et toute l'année au campus de Paris de GEM Alpine Business School : soirées du BDE, associations, recrutements ouverts et fil du campus.",
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
 * Night surface with paper spreads for rhythm:
 * opening (headline, tonight's board, the visual of the moment) → week
 * ticker → personal line → the rest of the week → featured BDE night (paper)
 * → open recruitment → associations (paper) → the campus fil → safety.
 * Every block reads the data layer; one `now` is shared by every component
 * so "ce soir", the lit rows and the stickers all agree.
 */
async function HomeContent() {
  const now = new Date();
  const session = await getSession();
  const user = session.user;

  const [today, week, upcoming, campaigns, associations, posts, safety, bde, applications, registered, managed] =
    await Promise.all([
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

  // What is already on screen, so no event is shown twice.
  const board = tonightBoard(today, upcoming, now);
  const hero = heroEvent(board.events, upcoming);
  const shown = new Set(board.events.map((e) => e.id));
  if (hero) shown.add(hero.id);
  const featured = featuredEvent(upcoming, shown, now);
  if (featured) shown.add(featured.id);
  const weekRest = week.filter((e) => !shown.has(e.id));
  const later = upcoming.filter((e) => !shown.has(e.id) && !week.some((w) => w.id === e.id));

  // Student bits.
  const memberActive = hasActiveMemberCard(user, now);
  const nextOuting =
    registered
      .filter((e) => eventPhase(e, now) !== "past")
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
  const savedUpcoming = user ? upcoming.filter((e) => user.savedEventIds.includes(e.id)).length : 0;
  const activeApplications = applications.filter((a) => isActiveApplication(a.status));
  const memberCardHref = `${routes.association(bde?.slug ?? "very-pink-club")}#carte`;

  // Recruiting associations wear a sticker on their tile.
  const recruitingSeats = new Map<string, number>();
  for (const c of campaigns) recruitingSeats.set(c.associationId, (recruitingSeats.get(c.associationId) ?? 0) + c.seats);

  // Section numbers follow what is actually rendered.
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <>
      <HomeOpening board={board} hero={hero} personal={personal} now={now} />

      <WeekTicker events={week} now={now} />

      <PersonalStrip
        user={user}
        nextOuting={nextOuting}
        savedUpcoming={savedUpcoming}
        memberActive={memberActive}
        applications={activeApplications}
        managed={managed}
        memberCardHref={memberCardHref}
        now={now}
      />

      <WeekRail
        events={weekRest}
        later={later}
        index={next()}
        personal={personal}
        now={now}
        className={featured ? "pb-section" : undefined}
      />

      {featured && (
        <FeaturedEvent
          event={featured}
          index={next()}
          personal={personal(featured)}
          memberActive={user ? memberActive : null}
          memberCardHref={memberCardHref}
          now={now}
        />
      )}

      <HomeRecruitment campaigns={campaigns} applications={applications} index={next()} />

      <AssociationsRail
        associations={associations}
        recruitingSeats={recruitingSeats}
        index={associations.length > 0 ? next() : undefined}
      />

      <HomeCampus posts={posts} index={posts.length > 0 ? next() : undefined} />

      <SafetyTeaser emergency={safety.emergency} />
    </>
  );
}
