import type { EventCategory } from "@/lib/types";
import type { EventWindow } from "@/lib/data/events";
import { routes } from "@/lib/routes";
import { EVENT_CATEGORY_LABEL, dateParts } from "@/lib/format";
import { parisDateKey } from "@/lib/time";

/**
 * The agenda's URL filters (?when=today|week|past, ?category=soiree…) and
 * the small pure helpers the /events page needs around them. Unknown values
 * are ignored rather than 404'd: a stale shared link still shows the agenda.
 */

/** Chip order. "upcoming" is the default and never written in the URL. */
export const AGENDA_WINDOWS: EventWindow[] = ["upcoming", "today", "week", "past"];

export const WINDOW_LABEL: Record<EventWindow, string> = {
  upcoming: "À venir",
  today: "Aujourd'hui",
  week: "Cette semaine",
  past: "Passés",
};

/** For the document title. */
export const WINDOW_TITLE: Record<EventWindow, string> = {
  upcoming: "À venir",
  today: "Aujourd'hui",
  week: "Cette semaine",
  past: "Événements passés",
};

export const EVENT_CATEGORIES = Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[];

type Param = string | string[] | undefined;

const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

export function parseWindow(value: Param): EventWindow {
  const v = first(value);
  return v && (AGENDA_WINDOWS as string[]).includes(v) ? (v as EventWindow) : "upcoming";
}

export function parseCategory(value: Param): EventCategory | null {
  const v = first(value);
  return v && (EVENT_CATEGORIES as string[]).includes(v) ? (v as EventCategory) : null;
}

/** /events with the given filters; the default window stays out of the URL. */
export function agendaHref({ when, category }: { when?: EventWindow; category?: EventCategory | null } = {}): string {
  const sp = new URLSearchParams();
  if (when && when !== "upcoming") sp.set("when", when);
  if (category) sp.set("category", category);
  const qs = sp.toString();
  return qs ? `${routes.events}?${qs}` : routes.events;
}

export function countByCategory(list: Array<{ category: EventCategory }>): Partial<Record<EventCategory, number>> {
  const counts: Partial<Record<EventCategory, number>> = {};
  for (const e of list) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return counts;
}

/** "Novembre" this year, "Février 2027" otherwise. */
export function monthLabel(iso: string, now = new Date()): string {
  const { monthLong } = dateParts(iso);
  const month = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
  const year = parisDateKey(iso).slice(0, 4);
  return year === parisDateKey(now).slice(0, 4) ? month : `${month} ${year}`;
}

/**
 * Consecutive month groups of an already sorted list (ascending for the
 * agenda, descending for the archive), in Paris time.
 */
export function groupByMonth<T extends { startsAt: string }>(
  list: T[],
  now = new Date(),
): Array<{ key: string; label: string; events: T[] }> {
  const groups: Array<{ key: string; label: string; events: T[] }> = [];
  for (const e of list) {
    const key = parisDateKey(e.startsAt).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: monthLabel(e.startsAt, now), events: [] };
      groups.push(group);
    }
    group.events.push(e);
  }
  return groups;
}

/* ---- Empty states ---------------------------------------------------------- */

const CATEGORY_NOUN: Record<EventCategory, string> = {
  soiree: "soirée",
  sport: "événement sport",
  carriere: "événement carrière",
  academique: "événement académique",
  culture: "événement culture",
  solidarite: "action solidaire",
  "week-end": "week-end",
};

const WINDOW_TAIL: Record<EventWindow, string> = {
  today: "aujourd'hui",
  week: "cette semaine",
  upcoming: "à l'agenda pour l'instant",
  past: "dans les archives",
};

const EMPTY_TITLE: Record<EventWindow, string> = {
  today: "Rien de prévu aujourd'hui",
  week: "Rien de prévu cette semaine",
  upcoming: "Rien à l'agenda pour l'instant",
  past: "Pas encore d'événement passé",
};

/** "Pas de soirée aujourd'hui", "Pas d'action solidaire dans les archives". */
export function emptyTitle(when: EventWindow, category: EventCategory | null): string {
  if (!category) return EMPTY_TITLE[when];
  const noun = CATEGORY_NOUN[category];
  return `${/^[aeéiou]/i.test(noun) ? "Pas d'" : "Pas de "}${noun} ${WINDOW_TAIL[when]}`;
}
