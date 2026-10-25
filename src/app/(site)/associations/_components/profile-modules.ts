import "server-only";
import type { ApplicationItem, Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { getMyAccess } from "@/lib/governance/access";
import { legacyId } from "@/lib/data/associations";
import { getEventSeries } from "@/lib/data/event-series";
import { getAssociationEvents } from "@/lib/data/events";
import { getMyEvents } from "@/lib/events/me";
import { personalStates } from "@/lib/events/model";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { getAssociationPosts } from "@/lib/data/posts";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplications } from "@/lib/data/users";
import type { ProfileViewer } from "./AssociationProfile";

/**
 * What an association page shows besides its own profile: the events of its
 * year, the carte cotisante, dated events, recruitment and posts. Posts
 * (Phase 6) and events (Phase 7: its published events, pinned first, and the
 * last ones over) are real, with the student's own marks. The other modules
 * still read the Phase 1 data layer (their own phases replace it), keyed by
 * the mock id of the BDE (legacyId); every other association has none yet,
 * so these sections stay out of its page.
 */
export async function loadProfileModules(association: Association, userId?: string) {
  const id = legacyId(association);
  const [events, pastEvents, my, series, campaigns, posts, offer, applications] = await Promise.all([
    getAssociationEvents(association.slug, "upcoming", 9),
    getAssociationEvents(association.slug, "past", 4),
    userId ? getMyEvents() : Promise.resolve({ registrations: [], bookmarks: [] }),
    getEventSeries({ associationId: id }),
    getCampaigns({ associationId: id }),
    getAssociationPosts(association.slug, 4),
    getMemberCardOffer(id),
    userId ? getApplications(userId) : Promise.resolve<ApplicationItem[]>([]),
  ]);
  return { events, pastEvents, personal: personalStates(my), series, campaigns, posts, offer, applications };
}

export type ProfileModules = Awaited<ReturnType<typeof loadProfileModules>>;

/** Keys that open the page editor (or its image library) in the workspace. */
const PAGE_KEYS = ["organization.settings.update", "organization.page.publish", "media.manage"];

/**
 * Who is looking: their role in this association, if any, and the way to
 * edit the page when their positions allow it (display only: the editor and
 * every action check the rights again).
 */
export async function getProfileViewer(association: Pick<Association, "id">): Promise<ProfileViewer> {
  const session = await getSession();
  if (!session.user) return { user: null };
  const org = (await getMyAccess())?.organizations.find((o) => o.id === association.id);
  if (!org) return { user: session.user };
  const titles = [...new Set(org.positions.map((p) => p.title))];
  return {
    user: session.user,
    membership: titles.length > 0 ? titles.join(" · ") : "membre",
    manageHref: PAGE_KEYS.some((k) => org.permissions.includes(k))
      ? org.permissions.includes("organization.settings.update") || org.permissions.includes("organization.page.publish")
        ? routes.manageSettings(org.slug)
        : routes.manageMedia(org.slug)
      : undefined,
  };
}
