/**
 * The agenda's filters, all in the URL so a filtered agenda can be shared
 * and the back button undoes a filter: ?quand= (aujourdhui, semaine,
 * weekend, passes) or chosen days ?du=&au=, ?categorie=, ?asso=, ?lieu=
 * (campus, exterieur, en-ligne), ?dispo= (ouvertes, libre), ?q= and the
 * ?suite= page cursor. Unknown values are ignored rather than 404'd: a stale
 * link still shows the agenda. Pure module (relative imports with extensions
 * only), shared by the /events page and its tests.
 */

import type { EventLocationType } from "../types";
import { addDaysToKey, parisDateKey, parisWeekday } from "../time.ts";
import { parisLocalToInstant } from "../posts/schedule.ts";
import { dayStart, parseDayKey } from "./calendar.ts";

export type AgendaWhen = "upcoming" | "today" | "week" | "weekend" | "past" | "range";
export type AgendaAvailability = "registration_open" | "no_registration";

export interface AgendaFilters {
  when: AgendaWhen;
  /** Paris days, inclusive, for when = "range" only. */
  from: string | null;
  to: string | null;
  category: string | null;
  association: string | null;
  place: EventLocationType | null;
  availability: AgendaAvailability | null;
  q: string;
}

type Param = string | string[] | undefined;
type Params = Record<string, Param>;

const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

const WHEN_PARAM: Record<Exclude<AgendaWhen, "upcoming" | "range">, string> = {
  today: "aujourdhui",
  week: "semaine",
  weekend: "weekend",
  past: "passes",
};

const PLACE_PARAM: Record<EventLocationType, string> = {
  campus: "campus",
  external: "exterieur",
  online: "en-ligne",
};

const AVAILABILITY_PARAM: Record<AgendaAvailability, string> = {
  registration_open: "ouvertes",
  no_registration: "libre",
};

const reverse = <K extends string>(map: Record<K, string>) =>
  new Map(Object.entries(map).map(([k, v]) => [v as string, k as K]));

const WHEN_OF = reverse(WHEN_PARAM);
const PLACE_OF = reverse(PLACE_PARAM);
const AVAILABILITY_OF = reverse(AVAILABILITY_PARAM);

/** A range longer than a year is cut to a year (one page of dates, not the whole archive). */
export const MAX_RANGE_DAYS = 366;

/** A slug as the database writes them, or null. */
export function agendaSlug(raw: Param): string | null {
  const v = first(raw);
  return v && v.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? v : null;
}

/** The search box: spaces collapsed, at most 80 characters, at least 2 to count. */
export function agendaQuery(raw: Param): string {
  const q = (first(raw) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : "";
}

/**
 * Chosen days (?du= and/or ?au=, one day when only one is given, swapped
 * when reversed, a year at most) win over ?quand=: the date form needs no
 * script to switch the period.
 */
export function parseAgendaFilters(sp: Params): AgendaFilters {
  let when: AgendaWhen = WHEN_OF.get(first(sp.quand) ?? "") ?? "upcoming";
  let from = parseDayKey(sp.du);
  let to = parseDayKey(sp.au);
  if (from || to) {
    when = "range";
    if (!from) from = to;
    if (!to) to = from;
    if (from! > to!) [from, to] = [to, from];
    if (to! > addDaysToKey(from!, MAX_RANGE_DAYS - 1)) to = addDaysToKey(from!, MAX_RANGE_DAYS - 1);
  }
  return {
    when,
    from,
    to,
    category: agendaSlug(sp.categorie),
    association: agendaSlug(sp.asso),
    place: PLACE_OF.get(first(sp.lieu) ?? "") ?? null,
    availability: AVAILABILITY_OF.get(first(sp.dispo) ?? "") ?? null,
    q: agendaQuery(sp.q),
  };
}

/** Anything narrowing the default agenda (the period included). */
export function isFiltered(f: AgendaFilters): boolean {
  return f.when !== "upcoming" || hasRefinement(f);
}

/** A filter other than the period. */
export function hasRefinement(f: AgendaFilters): boolean {
  return Boolean(f.category || f.association || f.place || f.availability || f.q);
}

/** The URL params of a set of filters (defaults left out), page cursor last. */
export function agendaParams(f: Partial<AgendaFilters>, cursor?: string | null): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.when === "range") {
    if (f.from && f.to) {
      sp.set("du", f.from);
      sp.set("au", f.to);
    }
  } else if (f.when && f.when !== "upcoming") {
    sp.set("quand", WHEN_PARAM[f.when]);
  }
  if (f.category) sp.set("categorie", f.category);
  if (f.association) sp.set("asso", f.association);
  if (f.place) sp.set("lieu", PLACE_PARAM[f.place]);
  if (f.availability) sp.set("dispo", AVAILABILITY_PARAM[f.availability]);
  if (f.q) sp.set("q", f.q);
  if (cursor) sp.set("suite", cursor);
  return sp;
}

/** `base` (the agenda by default) with the given filters. */
export function agendaHref(f: Partial<AgendaFilters> = {}, base = "/events", cursor?: string | null): string {
  const qs = agendaParams(f, cursor).toString();
  return qs ? `${base}?${qs}` : base;
}

/** The URL value of a filter, as FilterChips writes it. */
export const whenParam = (w: AgendaWhen): string | null => (w === "upcoming" || w === "range" ? null : WHEN_PARAM[w]);
export const placeParam = (p: EventLocationType): string => PLACE_PARAM[p];
export const availabilityParam = (a: AgendaAvailability): string => AVAILABILITY_PARAM[a];

/**
 * The instants a period covers, for public_events ([from, to), overlapping):
 *  - upcoming: everything not over yet (the default);
 *  - today: the whole Paris day, what is already over included;
 *  - week: from today to Sunday night;
 *  - weekend: Friday 18h to Sunday night (from now on once it has begun);
 *    on a Saturday or a Sunday, the weekend under way;
 *  - past: the archive, newest first;
 *  - range: the chosen days, both ends included.
 */
export function agendaWindow(
  f: Pick<AgendaFilters, "when" | "from" | "to">,
  now = new Date(),
): { from: string | null; to: string | null; order: "asc" | "desc" } {
  const today = parisDateKey(now);
  const weekday = parisWeekday(now); // 1 = Monday … 7 = Sunday
  const nextMonday = addDaysToKey(today, 8 - weekday);
  switch (f.when) {
    case "today":
      return { from: dayStart(today), to: dayStart(addDaysToKey(today, 1)), order: "asc" };
    case "week":
      return { from: dayStart(today), to: dayStart(nextMonday), order: "asc" };
    case "weekend": {
      const friday = addDaysToKey(today, 5 - weekday);
      const evening = parisLocalToInstant(friday, "18:00");
      const start = evening.ok ? evening.iso : dayStart(friday);
      return { from: Date.parse(start) > now.getTime() ? start : now.toISOString(), to: dayStart(nextMonday), order: "asc" };
    }
    case "past":
      return { from: null, to: null, order: "desc" };
    case "range":
      if (f.from && f.to) return { from: dayStart(f.from), to: dayStart(addDaysToKey(f.to, 1)), order: "asc" };
      return { from: null, to: null, order: "asc" };
    default:
      return { from: null, to: null, order: "asc" };
  }
}

export const WHEN_LABEL: Record<AgendaWhen, string> = {
  upcoming: "À venir",
  today: "Aujourd'hui",
  week: "Cette semaine",
  weekend: "Ce week-end",
  past: "Passés",
  range: "Dates choisies",
};

/** Chip order; "range" comes from the date form, not a chip. */
export const WHEN_CHIPS: AgendaWhen[] = ["upcoming", "today", "week", "weekend", "past"];

export const PLACE_LABEL: Record<EventLocationType, string> = {
  campus: "Sur le campus",
  external: "Hors campus",
  online: "En ligne",
};

export const AVAILABILITY_LABEL: Record<AgendaAvailability, string> = {
  registration_open: "Inscriptions ouvertes",
  no_registration: "Sans inscription",
};

/** "Rien de prévu ce week-end", "Rien ne correspond à ces filtres". */
export function emptyAgendaTitle(f: AgendaFilters): string {
  if (hasRefinement(f)) return f.q ? "Aucun événement ne correspond à ta recherche" : "Rien ne correspond à ces filtres";
  switch (f.when) {
    case "today":
      return "Rien de prévu aujourd'hui";
    case "week":
      return "Rien de prévu cette semaine";
    case "weekend":
      return "Rien de prévu ce week-end";
    case "past":
      return "Pas encore d'événement passé";
    case "range":
      return "Rien de prévu à ces dates";
    default:
      return "Rien à l'agenda pour l'instant";
  }
}
