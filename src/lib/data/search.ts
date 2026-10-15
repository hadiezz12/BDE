import "server-only";
import { routes } from "@/lib/routes";
import type { SearchEntry } from "@/lib/types";
import { getAssociations } from "./associations";
import { getEventSeries } from "./event-series";
import { getPosts } from "./posts";
import { getCampaigns } from "./recruitment";

/**
 * Phase 1 search runs on a small local index shipped to the client.
 * Later this becomes a Postgres full-text query behind the same shape.
 *
 * Events are indexed as the BDE's eight recurring events (one page each), not
 * as dated editions: no edition date is known yet.
 */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  const [associations, series, campaigns, posts] = await Promise.all([
    getAssociations(),
    getEventSeries(),
    getCampaigns({ scope: "all" }),
    getPosts({ limit: 30 }),
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
      keywords: [a.shortName, a.tagline, a.category].filter(Boolean).join(" "),
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
    ...posts.map<SearchEntry>((p) => ({
      kind: "article",
      id: p.id,
      title: p.title,
      context: p.association.shortName ?? p.association.name,
      href: routes.post(p.slug),
      accent: p.association.accent,
      keywords: p.excerpt,
    })),
  ];
}
