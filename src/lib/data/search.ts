import "server-only";
import { routes } from "@/lib/routes";
import { formatDayShort } from "@/lib/format";
import type { SearchEntry } from "@/lib/types";
import { getAssociations } from "./associations";
import { getEvents } from "./events";
import { getPosts } from "./posts";
import { getCampaigns } from "./recruitment";

/**
 * Phase 1 search runs on a small local index shipped to the client.
 * Later this becomes a Postgres full-text query behind the same shape.
 */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  const [associations, events, campaigns, posts] = await Promise.all([
    getAssociations(),
    getEvents({ when: "upcoming" }),
    getCampaigns({ scope: "all" }),
    getPosts({ limit: 30 }),
  ]);

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
    ...events.map<SearchEntry>((e) => ({
      kind: "evenement",
      id: e.id,
      title: e.title,
      context: `${formatDayShort(e.startsAt)} · ${e.association.shortName ?? e.association.name}`,
      href: routes.event(e.slug),
      accent: e.association.accent,
      keywords: [e.subtitle, e.venue.name, e.category, e.association.name].filter(Boolean).join(" "),
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
