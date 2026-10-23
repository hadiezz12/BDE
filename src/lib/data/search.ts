import "server-only";
import { routes } from "@/lib/routes";
import type { PostItem, SearchEntry } from "@/lib/types";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { getAssociations } from "./associations";
import { getEventSeries } from "./event-series";
import { getLatestPosts } from "./posts";
import { getCampaigns } from "./recruitment";

/**
 * The small local index shipped to the client for the ⌘K dialog (and the
 * /search page's associations, events and recruitment). Articles are only
 * the 30 latest here: the /search page asks the database's full-text search
 * for them instead (public_posts), so older articles are found too.
 *
 * Events are indexed as the BDE's eight recurring events (one page each), not
 * as dated editions: no edition date is known yet.
 */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  const [associations, series, campaigns, posts] = await Promise.all([
    getAssociations(),
    getEventSeries(),
    getCampaigns({ scope: "all" }),
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
    ...campaigns
      .filter((c) => c.status !== "cloturee")
      .map<SearchEntry>((c) => ({
        kind: "recrutement",
        id: c.id,
        title: `${c.association.name} — ${c.title}`,
        context: `${c.positions.length} rôle${c.positions.length > 1 ? "s" : ""} · ${c.seats} place${c.seats > 1 ? "s" : ""}`,
        href: routes.campaign(c.slug),
        accent: c.association.accent,
        keywords: c.positions.map((p) => `${p.title} ${p.team ?? ""}`).join(" "),
      })),
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
