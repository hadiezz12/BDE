import type { AccentKey, CampaignItem, EventItem, Photo, PostItem, SavedItem, SavedKind, SearchEntry } from "@/lib/types";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL, deadlineLabel, formatDayShort, formatTime, plural } from "@/lib/format";
import { toEventItem, type EventCardPayload } from "@/lib/events/model";
import { toPostItem, type OrganizationCardPayload, type PostCardPayload } from "@/lib/posts/model";
import { toCampaignItem, type CampaignCardPayload, type CampaignState, type PositionPayload } from "@/lib/recruitment/model";
import { toPhoto, type MediaPayload } from "@/lib/associations/model";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { TYPE_KIND, type SearchType } from "./query";

/**
 * The database's public cards (private.public_card: the same cards as the
 * public pages) as one kind of row for search, the quick search and saved
 * items. Links are built here from slugs, never taken from the data, so a
 * result can only lead to a page of this site. Every line is public text of
 * the item itself; dates and states are the live ones.
 */

/** private.search_association_card */
export interface AssociationCardPayload {
  id: string;
  slug: string;
  kind: "bde" | "association";
  name: string;
  short_name: string | null;
  accent: AccentKey;
  kind_label: string | null;
  tagline: string | null;
  categories: { slug: string; label: string }[];
  logo: MediaPayload | null;
  cover: MediaPayload | null;
  prominence_until?: string | null;
}

/** private.position_card plus its campaign (public_card 'position'). */
export interface PositionCardPayload extends PositionPayload {
  campaign: {
    id: string;
    slug: string;
    title: string;
    state: CampaignState;
    cover: MediaPayload | null;
    organization: OrganizationCardPayload;
  };
}

export interface SearchHitPayload {
  type: SearchType;
  id: string;
  score: number;
  card: unknown;
}

const orgName = (o: { name: string; short_name: string | null }) => o.short_name ?? o.name;

export function associationEntry(a: AssociationCardPayload): SearchEntry {
  const categories = a.categories.map((c) => c.label).join(" · ");
  return {
    kind: "association",
    id: a.id,
    title: a.name,
    context: [a.kind_label ?? (a.kind === "bde" ? "Bureau des étudiants" : "Association étudiante"), categories]
      .filter(Boolean)
      .join(" · "),
    href: routes.association(a.slug),
    accent: a.accent,
    excerpt: a.tagline ?? undefined,
    image: toPhoto(a.logo, `Logo de ${a.name}`),
  };
}

export function postEntry(p: PostItem): SearchEntry {
  return {
    kind: "article",
    id: p.id,
    title: p.title,
    context: `${POST_KIND_LABEL[p.kind]} · ${p.association.shortName ?? p.association.name} · ${formatDayShort(p.publishedAt)}`,
    href: routes.post(p.slug),
    accent: p.association.accent,
    excerpt: p.excerpt || undefined,
    status: p.archived ? { label: "Archivé", tone: "over" } : undefined,
    image: p.cover,
  };
}

export function eventEntry(e: EventItem, now = new Date()): SearchEntry {
  const over = Date.parse(e.endsAt) <= now.getTime();
  const where = e.venue.type === "online" ? "En ligne" : (e.venue.name ?? e.venue.city);
  return {
    kind: "evenement",
    id: e.id,
    title: e.title,
    context: [`${formatDayShort(e.startsAt)} à ${formatTime(e.startsAt)}`, e.association.shortName ?? e.association.name, where]
      .filter(Boolean)
      .join(" · "),
    href: routes.event(e.slug),
    accent: e.association.accent,
    excerpt: e.summary || undefined,
    status:
      e.status === "cancelled"
        ? { label: "Annulé", tone: "warn" }
        : over
          ? { label: "Passé", tone: "over" }
          : undefined,
    image: e.cover,
  };
}

export function campaignEntry(c: CampaignItem, now = new Date()): SearchEntry {
  const roles = plural(c.positions.length, "poste");
  return {
    kind: "recrutement",
    id: c.id,
    title: c.title,
    context: [c.association.shortName ?? c.association.name, c.seats !== null ? `${roles} · ${plural(c.seats, "place")}` : roles]
      .join(" · "),
    href: routes.campaign(c.slug),
    accent: c.association.accent,
    excerpt: c.intro || undefined,
    status: campaignStatusLine(c, now),
    image: c.cover,
  };
}

function campaignStatusLine(c: CampaignItem, now: Date): SearchEntry["status"] {
  switch (c.status) {
    case "ouverte":
    case "derniere-chance":
      return { label: deadlineLabel(c.closesAt, now), tone: "live" };
    case "a-venir":
      return { label: `Ouvre le ${formatDayShort(c.opensAt)}`, tone: "soon" };
    default:
      return { label: CAMPAIGN_STATUS_LABEL[c.status], tone: "over" };
  }
}

export function positionEntry(p: PositionCardPayload, now = new Date()): SearchEntry {
  const org = p.campaign.organization;
  const closesAt = p.closes_at;
  return {
    kind: "poste",
    id: p.id,
    title: p.title,
    context: [orgName(org), p.campaign.title, p.team].filter(Boolean).join(" · "),
    href: routes.campaignPosition(p.campaign.slug, p.slug),
    accent: org.accent,
    excerpt: p.summary ?? undefined,
    status: p.accepting
      ? { label: closesAt ? deadlineLabel(closesAt, now) : "Candidatures ouvertes", tone: "live" }
      : p.campaign.state === "upcoming"
        ? { label: "Ouvre bientôt", tone: "soon" }
        : { label: "Candidatures closes", tone: "over" },
    image: toPhoto(p.campaign.cover, `Visuel du recrutement ${p.campaign.title}`) as Photo | undefined,
  };
}

/** One public card as a row; null for a card the site does not know (never guessed). */
export function entryFromCard(type: SearchType, card: unknown, now = new Date()): SearchEntry | null {
  if (!card || typeof card !== "object") return null;
  switch (type) {
    case "association":
      return associationEntry(card as AssociationCardPayload);
    case "post":
      return postEntry(toPostItem(card as PostCardPayload));
    case "event":
      return eventEntry(toEventItem(card as EventCardPayload), now);
    case "campaign":
      return campaignEntry(toCampaignItem(card as CampaignCardPayload, { now }), now);
    case "position":
      return positionEntry(card as PositionCardPayload, now);
    default:
      return null;
  }
}

export function entriesFromHits(hits: SearchHitPayload[], now = new Date()): SearchEntry[] {
  return hits.map((h) => entryFromCard(h.type, h.card, now)).filter((e): e is SearchEntry => e !== null);
}

/** public.my_saved_items rows. */
export interface SavedItemPayload {
  kind: SavedKind;
  id: string;
  saved_at: string;
  available: boolean;
  card: unknown;
}

export function toSavedItem(p: SavedItemPayload, now = new Date()): SavedItem {
  return {
    kind: p.kind,
    id: p.id,
    savedAt: p.saved_at,
    entry: p.available ? entryFromCard(p.kind, p.card, now) : null,
  };
}

/** The saved kind of a search kind (the save button of a row). */
export const KIND_SAVED: Record<SearchEntry["kind"], SavedKind> = Object.fromEntries(
  Object.entries(TYPE_KIND).map(([type, kind]) => [kind, type]),
) as Record<SearchEntry["kind"], SavedKind>;
