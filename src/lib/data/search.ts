import "server-only";
import { routes } from "@/lib/routes";
import type { CampaignItem, EventItem, PostItem, SearchEntry } from "@/lib/types";
import { formatDayShort, formatTime } from "@/lib/format";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { getAssociations } from "./associations";
import { getEventSeries } from "./event-series";
import { getUpcomingEvents } from "./events";
import { getLatestPosts } from "./posts";
import { getCampaigns } from "./recruitment";

/**
 * The small local index shipped to the client for the ⌘K dialog (and the
 * /search page's associations, events and recruitment). Articles are only
 * the 30 latest here: the /search page asks the database's full-text search
 * for them instead (public_posts), so older articles are found too.
 *
 * Events: the BDE's eight events of the year (one page each) and the dated
 * events still to come (the 60 next, as on the agenda). The /search page
 * asks the database for dated events too (public_events), past ones included.
 */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  const [associations, series, upcoming, campaigns, posts] = await Promise.all([
    getAssociations(),
    getEventSeries(),
    getUpcomingEvents().catch(() => [] as EventItem[]),
    // Current campaigns (open, paused, opening later); the /search page asks the database for the rest.
    getCampaigns({ view: "current", limit: 100 }).catch(() => [] as CampaignItem[]),
    // Same memoised read as the article page's "Ailleurs sur le campus"; the site still works without it.
    getLatestPosts(30).catch(() => [] as PostItem[]),
  ]);
  const producers = new Map(associations.map((a) => [a.id, a.name]));

  return [
    ...associations.map<SearchEntry>((a) => ({
      kind: "association",
      id: a.id,
      title: a.name,
      context: a.kind,
      href: routes.association(a.slug),
      accent: a.accent,
      keywords: [a.shortName, a.tagline, ...a.categories.map((c) => c.label)].filter(Boolean).join(" "),
    })),
    ...series.map<SearchEntry>((s) => ({
      kind: "evenement",
      id: s.id,
      title: s.name,
      context: `${s.subtitle} · ${s.period}`,
      href: routes.event(s.slug),
      accent: s.accent,
      keywords: [s.description, producers.get(s.associationId)].filter(Boolean).join(" "),
    })),
    ...upcoming.map(eventSearchEntry),
    ...campaigns.map(campaignSearchEntry),
    ...posts.map(postSearchEntry),
  ];
}

/**
 * A published post as a search result: its kind and association on the
 * context line; its introduction, tags, rubrique and kind as words that
 * match without being shown.
 */
export function postSearchEntry(p: PostItem): SearchEntry {
  const kind = POST_KIND_LABEL[p.kind];
  return {
    kind: "article",
    id: p.id,
    title: p.title,
    context: `${kind} · ${p.association.shortName ?? p.association.name}`,
    href: routes.post(p.slug),
    accent: p.association.accent,
    keywords: [p.excerpt, ...p.tags, p.category?.label, kind, p.association.name].filter(Boolean).join(" "),
  };
}

/** A published event as a search result: date and association on the context line. */
export function eventSearchEntry(e: EventItem): SearchEntry {
  const when = `${formatDayShort(e.startsAt)} à ${formatTime(e.startsAt)}`;
  return {
    kind: "evenement",
    id: e.id,
    title: e.status === "cancelled" ? `${e.title} (annulé)` : e.title,
    context: `${when} · ${e.association.shortName ?? e.association.name}`,
    href: routes.event(e.slug),
    accent: e.association.accent,
    keywords: [e.summary, e.category?.label, e.venue.name, e.venue.city, e.association.name].filter(Boolean).join(" "),
  };
}

/** A published campaign as a search result: its positions and teams as words that match. */
export function campaignSearchEntry(c: CampaignItem): SearchEntry {
  const roles = `${c.positions.length} poste${c.positions.length > 1 ? "s" : ""}`;
  return {
    kind: "recrutement",
    id: c.id,
    title: `${c.association.name} — ${c.title}`,
    context: c.seats !== null ? `${roles} · ${c.seats} place${c.seats > 1 ? "s" : ""}` : roles,
    href: routes.campaign(c.slug),
    accent: c.association.accent,
    keywords: [c.intro, ...c.positions.map((p) => `${p.title} ${p.team ?? ""}`)].join(" "),
  };
}
