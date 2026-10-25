import "server-only";
import { cache } from "react";
import type { EventCategory, EventItem, EventLocationType } from "@/lib/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { toEventItem, type EventCardPayload, type EventFacets, type PublicEventState } from "@/lib/events/model";
import { logDataError, toDataError } from "./errors";

/**
 * Published events, read as a visitor (anon client, no cookies) through the
 * public read functions (public_events, public_event…), which only ever
 * return public fields of published, visible events of public association
 * pages: never a draft, never private joining details, never a person.
 * Memoised per request only: a publication, a change, a cancellation or a
 * hide shows on the next page load, with no cache to purge.
 */

type PublicRpc =
  | "public_events"
  | "public_event"
  | "public_event_facets"
  | "public_featured_events"
  | "public_association_events"
  | "public_series_events"
  | "public_event_sitemap";

async function rpc<T>(name: PublicRpc, args?: Record<string, unknown>): Promise<T | null> {
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) {
    logDataError(name, error);
    throw toDataError(error);
  }
  return data as T;
}

export interface EventQuery {
  /** Overlapping [from, to); default: everything not over yet. */
  from?: string | null;
  to?: string | null;
  category?: EventCategory | null;
  /** Association slug. */
  association?: string | null;
  locationType?: EventLocationType | null;
  availability?: "registration_open" | "no_registration" | null;
  q?: string | null;
  /** Keyset: the last item of the previous page. */
  after?: { at: string; id: string } | null;
  limit?: number;
  /** "desc": the archive, newest first, events that are over only. */
  order?: "asc" | "desc";
}

export interface EventPage {
  items: EventItem[];
  next: { at: string; id: string } | null;
}

export async function getEventPage(query: EventQuery = {}): Promise<EventPage> {
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 200);
  const payload = await rpc<EventCardPayload[]>("public_events", {
    p_from: query.from ?? (query.order === "desc" ? "-infinity" : undefined),
    p_to: query.to ?? undefined,
    p_category: query.category ?? undefined,
    p_organization_slug: query.association ?? undefined,
    p_location_type: query.locationType ?? undefined,
    p_availability: query.availability ?? undefined,
    p_q: query.q ?? undefined,
    p_after_at: query.after?.at,
    p_after_id: query.after?.id,
    p_limit: limit,
    p_order: query.order ?? "asc",
  });
  const items = (payload ?? []).map((p) => toEventItem(p));
  const last = items[items.length - 1];
  return { items, next: items.length === limit && last ? { at: last.startsAt, id: last.id } : null };
}

export async function getEvents(query: EventQuery = {}): Promise<EventItem[]> {
  return (await getEventPage(query)).items;
}

/**
 * Every event overlapping [from, to), soonest first, read page by page (for
 * the calendar). Bounded: past `max` events, `truncated` says the list is cut.
 */
export async function getEventsBetween(
  from: string,
  to: string,
  query: Pick<EventQuery, "category" | "association"> = {},
  max = 600,
): Promise<{ items: EventItem[]; truncated: boolean }> {
  const items: EventItem[] = [];
  let after: EventPage["next"] = null;
  do {
    const page = await getEventPage({ ...query, from, to, after, limit: 200 });
    items.push(...page.items);
    after = page.next;
  } while (after && items.length < max);
  return { items: items.slice(0, max), truncated: Boolean(after) || items.length > max };
}

/** Upcoming events (not over yet), soonest first — memoised for the request. */
export const getUpcomingEvents = cache(async (limit = 60): Promise<EventItem[]> => getEvents({ limit }));

export const getEventPageBySlug = cache(
  async (slug: string): Promise<{ state: "ok"; event: EventItem } | { state: "moved"; slug: string } | { state: "not_found" }> => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return { state: "not_found" };
    const page = await rpc<PublicEventState>("public_event", { p_slug: slug });
    if (!page) return { state: "not_found" };
    if (page.state === "ok") return { state: "ok", event: toEventItem(page.event) };
    return page;
  },
);

export const getEventFacets = cache(async (): Promise<EventFacets> => {
  return (
    (await rpc<EventFacets>("public_event_facets")) ?? {
      total: 0,
      categories: [],
      organizations: [],
      location_types: {},
      categories_all: [],
    }
  );
});

/** Featured on the site by the BDE (upcoming, visible), soonest first. */
export const getFeaturedEvents = cache(async (): Promise<EventItem[]> => {
  return ((await rpc<EventCardPayload[]>("public_featured_events")) ?? []).map((p) => toEventItem(p));
});

/** An association's events for its page: upcoming (pinned first) or past (newest first). */
export async function getAssociationEvents(slug: string, when: "upcoming" | "past" = "upcoming", limit = 6): Promise<EventItem[]> {
  return ((await rpc<EventCardPayload[]>("public_association_events", { p_slug: slug, p_when: when, p_limit: limit })) ?? []).map(
    (p) => toEventItem(p),
  );
}

/** Dated editions of one of the BDE's events of the year (newest first). */
export async function getSeriesEvents(seriesKey: string): Promise<EventItem[]> {
  return ((await rpc<EventCardPayload[]>("public_series_events", { p_series_key: seriesKey })) ?? []).map((p) => toEventItem(p));
}

export async function getEventSitemap(): Promise<{ slug: string; updated_at: string }[]> {
  return (await rpc<{ slug: string; updated_at: string }[]>("public_event_sitemap")) ?? [];
}

/** Same association first, then same category; upcoming only. */
export async function getRelatedEvents(event: EventItem, limit = 3): Promise<EventItem[]> {
  const upcoming = await getUpcomingEvents();
  const score = (e: EventItem) =>
    (e.associationId === event.associationId ? 2 : 0) + (e.category && e.category.slug === event.category?.slug ? 1 : 0);
  return upcoming
    .filter((e) => e.id !== event.id && e.status !== "cancelled")
    .map((e, i) => ({ e, s: score(e), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => e);
}
