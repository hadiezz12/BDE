import "server-only";
import { events } from "@/data/mock";
import { dayDiff } from "@/lib/time";
import type { CampusEvent, EventCategory, EventItem } from "@/lib/types";
import { associationRef } from "./associations";

export type EventWindow = "today" | "week" | "upcoming" | "past";

export interface EventQuery {
  when?: EventWindow;
  category?: EventCategory;
  associationId?: string;
  limit?: number;
  /** Management views also need drafts and scheduled events. */
  includeUnpublished?: boolean;
}

function join(e: CampusEvent): EventItem {
  return { ...e, association: associationRef(e.associationId) };
}

/** An event is "over" once it has ended (or started, when it has no end). */
function isOver(e: CampusEvent, now: Date) {
  return Date.parse(e.endsAt ?? e.startsAt) < now.getTime();
}

function inWindow(e: CampusEvent, when: EventWindow, now: Date) {
  if (when === "past") return isOver(e, now);
  if (isOver(e, now)) return false;
  const startsIn = dayDiff(now, e.startsAt);
  if (when === "today") return startsIn <= 0;
  if (when === "week") return startsIn <= 7;
  return true;
}

export async function getEvents(query: EventQuery = {}): Promise<EventItem[]> {
  const now = new Date();
  const when = query.when ?? "upcoming";
  const list = events
    .filter((e) => query.includeUnpublished || e.publication === "publie")
    .filter((e) => inWindow(e, when, now))
    .filter((e) => !query.category || e.category === query.category)
    .filter((e) => !query.associationId || e.associationId === query.associationId)
    .sort((a, b) =>
      when === "past" ? Date.parse(b.startsAt) - Date.parse(a.startsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )
    .map(join);
  return query.limit ? list.slice(0, query.limit) : list;
}

export async function getEvent(slug: string): Promise<EventItem | null> {
  const e = events.find((x) => x.slug === slug && x.publication === "publie");
  return e ? join(e) : null;
}

export async function getEventsByIds(ids: string[]): Promise<EventItem[]> {
  return ids
    .map((id) => events.find((e) => e.id === id))
    .filter((e): e is CampusEvent => Boolean(e))
    .map(join);
}

/** Same association first, then same category, upcoming only. */
export async function getRelatedEvents(event: CampusEvent, limit = 3): Promise<EventItem[]> {
  const upcoming = await getEvents({ when: "upcoming" });
  const others = upcoming.filter((e) => e.id !== event.id);
  const score = (e: EventItem) =>
    (e.associationId === event.associationId ? 2 : 0) + (e.category === event.category ? 1 : 0);
  return others
    .map((e, i) => ({ e, s: score(e), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => e);
}

/** Counts per category for upcoming events (filter chips). */
export async function getEventCategoryCounts(): Promise<Partial<Record<EventCategory, number>>> {
  const counts: Partial<Record<EventCategory, number>> = {};
  for (const e of await getEvents({ when: "upcoming" })) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return counts;
}
