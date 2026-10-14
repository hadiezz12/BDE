import type { CSSProperties } from "react";
import type { AccentKey, CampusEvent, EventItem, RegistrationStatus, Venue } from "@/lib/types";
import type { StatusTone } from "@/components/ui/StatusBadge";
import type { StickerTone } from "@/components/ui/Sticker";
import {
  DAY_BUCKET_LABEL,
  REGISTRATION_LABEL,
  dayBucket,
  formatDayShort,
  formatTime,
  plural,
  relativeDay,
} from "@/lib/format";
import { CAMPUS_TZ, dayDiff } from "@/lib/time";

/**
 * Small derivations shared by the events kit (rows, posters, date blocks,
 * registration state). Pure functions of the event and the clock: no data
 * access, no formatting beyond lib/format. `now` is a parameter everywhere so
 * one page render can pass a single instant to every component.
 */

type Timed = Pick<CampusEvent, "startsAt" | "endsAt">;

const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: CAMPUS_TZ, hour: "numeric", hourCycle: "h23" });

/** Wall-clock hour in Paris (0–23). */
function parisHour(iso: string): number {
  return Number(hourFormatter.format(new Date(iso)));
}

/** "Ce soir" starts at 18h, same threshold as lib/format relativeDay. */
const EVENING_HOUR = 18;

/** Over once it has ended (or started, when it has no end). Same rule as lib/data/events. */
export function isOver(e: Timed, now = new Date()): boolean {
  return Date.parse(e.endsAt ?? e.startsAt) < now.getTime();
}

/**
 * Spans several days (WEI, WELL, ski week, a campaign), as opposed to a
 * single night that ends after midnight (BOO Party 23h → 5h).
 */
export function isMultiDay(e: Timed): boolean {
  if (!e.endsAt) return false;
  const days = dayDiff(e.startsAt, e.endsAt);
  return days >= 2 || (days === 1 && parisHour(e.endsAt) >= 12);
}

export type EventPhase = "past" | "live" | "upcoming";

export function eventPhase(e: Timed, now = new Date()): EventPhase {
  if (isOver(e, now)) return "past";
  return Date.parse(e.startsAt) <= now.getTime() ? "live" : "upcoming";
}

/** Starts this evening (Paris) and is not over yet. */
export function isTonight(e: Timed, now = new Date()): boolean {
  return !isOver(e, now) && dayDiff(now, e.startsAt) === 0 && parisHour(e.startsAt) >= EVENING_HOUR;
}

/**
 * "Lit" = the neon is on: tonight's event, or a single-night event happening
 * right now (still lit at 1h for a barathon that started yesterday at 20h30).
 * A seven-week campaign is "en cours", not lit.
 */
export function isLit(e: Timed, now = new Date()): boolean {
  if (isTonight(e, now)) return true;
  return eventPhase(e, now) === "live" && !isMultiDay(e);
}

/**
 * Relative words under a date block, only when they add something the date
 * does not say: "Ce soir", "Demain soir", "Dans 3 jours", "En ce moment",
 * "En cours". Null for past events and for anything a week or more away.
 */
export function relativeWords(e: Timed, now = new Date()): string | null {
  const phase = eventPhase(e, now);
  if (phase === "past") return null;
  if (phase === "live") return isMultiDay(e) ? "En cours" : "En ce moment";
  const diff = dayDiff(now, e.startsAt);
  if (diff <= 1) return relativeDay(e.startsAt, now);
  if (diff < 7) return `Dans ${diff} jours`;
  return null;
}

/**
 * The colour an event is drawn in. The eight BDE signature events carry their
 * neon emblem's colour (the emblems are where the accent palette comes from);
 * every other event wears its association's accent.
 */
const EMBLEM_ACCENT: Record<string, AccentKey> = {
  "apero-attack": "or",
  barathons: "bleu",
  "boo-party": "violet",
  "campagne-des-listes": "orange",
  desintegration: "vert",
  "rose-rain": "rose",
  wei: "cyan",
  well: "rose",
};

export function eventAccent(e: Pick<EventItem, "emblem" | "association">): AccentKey {
  const file = e.emblem?.split("/").pop()?.replace(/\.\w+$/, "");
  return (file && EMBLEM_ACCENT[file]) || e.association.accent;
}

/* ---- Registration -------------------------------------------------------- */

/** Green = open, amber text = last places, cyan = not yet / waiting list, grey = closed. */
export const REGISTRATION_TONE: Record<RegistrationStatus, StatusTone> = {
  libre: "ok",
  ouverte: "ok",
  "derniere-chance": "warn",
  bientot: "info",
  "liste-attente": "info",
  complet: "neutral",
  fermee: "neutral",
};

/** Seats left when the event counts them, else null. */
export function seatsLeft(r: CampusEvent["registration"]): number | null {
  if (r.capacity === undefined || r.taken === undefined) return null;
  return Math.max(0, r.capacity - r.taken);
}

/** "clôture à 17h" · "clôture demain à 17h" · "clôture le 31 oct." */
function closingWords(closesAt: string, now: Date): string | null {
  if (Date.parse(closesAt) <= now.getTime()) return null;
  const diff = dayDiff(now, closesAt);
  if (diff === 0) return `clôture à ${formatTime(closesAt)}`;
  if (diff === 1) return `clôture demain à ${formatTime(closesAt)}`;
  return `clôture le ${formatDayShort(closesAt)}`;
}

export interface RegistrationFacts {
  /** Plain-language status, always printed (never colour alone). */
  label: string;
  tone: StatusTone;
  /** Seats, opening or closing date, in words. */
  detail: string | null;
  /** Live things only. */
  pulse: boolean;
  /** For an optional fill meter. */
  fill: { taken: number; capacity: number } | null;
}

export function registrationFacts(
  e: Pick<CampusEvent, "registration" | "startsAt" | "endsAt">,
  now = new Date(),
): RegistrationFacts {
  const r = e.registration;
  const phase = eventPhase(e, now);
  const left = seatsLeft(r);
  const fill = r.capacity !== undefined && r.taken !== undefined ? { taken: r.taken, capacity: r.capacity } : null;

  if (phase === "past") {
    return {
      label: "Terminé",
      tone: "neutral",
      detail: r.taken ? plural(r.taken, "inscrit·e", "inscrit·es") : null,
      pulse: false,
      fill: null,
    };
  }

  if (phase === "live" && !isMultiDay(e)) {
    return {
      label: "En ce moment",
      tone: "ok",
      detail: r.status === "libre" ? "Entrée libre, tu peux encore passer" : REGISTRATION_LABEL[r.status],
      pulse: true,
      fill: null,
    };
  }

  const parts: string[] = [];
  switch (r.status) {
    case "ouverte":
    case "derniere-chance": {
      if (left !== null) {
        parts.push(
          left === 0
            ? "Toutes les places sont prises"
            : left <= 10
              ? `Plus que ${plural(left, "place")}`
              : plural(left, "place restante", "places restantes"),
        );
      }
      const closing = r.closesAt ? closingWords(r.closesAt, now) : null;
      if (closing) parts.push(closing);
      break;
    }
    case "bientot":
      parts.push(
        r.opensAt && Date.parse(r.opensAt) > now.getTime()
          ? `Ouverture le ${formatDayShort(r.opensAt)} à ${formatTime(r.opensAt)}`
          : "Date d'ouverture bientôt annoncée",
      );
      break;
    case "complet":
    case "liste-attente":
      if (r.capacity !== undefined) parts.push(`Les ${r.capacity.toLocaleString("fr-FR")} places sont prises`);
      break;
    case "libre":
    case "fermee":
      break;
  }

  const detail = parts.length ? parts.join(" · ") : null;
  return {
    label: REGISTRATION_LABEL[r.status],
    tone: REGISTRATION_TONE[r.status],
    detail: detail && detail.charAt(0).toUpperCase() + detail.slice(1),
    pulse: false,
    fill: r.status === "bientot" ? null : fill,
  };
}

/* ---- When, where, how much ------------------------------------------------ */

export interface TimeRange {
  /** Visible text, with "→" between the two ends. */
  text: string;
  /** Same thing for screen readers ("de 20h30 à 1h"). */
  spoken: string;
}

/**
 * "20h30 → 1h" for a night · "Du 14 nov. 8h → 16 nov. 18h" for a trip ·
 * "Jusqu'au 13 nov." for something already under way.
 */
export function timeRange(e: Timed, now = new Date()): TimeRange {
  const start = formatTime(e.startsAt);
  if (!e.endsAt) return { text: start, spoken: `à ${start}` };
  const end = formatTime(e.endsAt);
  if (isMultiDay(e)) {
    if (eventPhase(e, now) === "live") {
      const t = `Jusqu'au ${formatDayShort(e.endsAt)}`;
      return { text: t, spoken: t };
    }
    const from = `${formatDayShort(e.startsAt)} ${start}`;
    const to = `${formatDayShort(e.endsAt)} ${end}`;
    return { text: `${from} → ${to}`, spoken: `du ${from} au ${to}` };
  }
  return { text: `${start} → ${end}`, spoken: `de ${start} à ${end}` };
}

/** "Amphi A · campus" · "La Machine du Moulin Rouge · Paris 18e". */
export function venueLine(v: Venue): string {
  if (v.onCampus) return /campus/i.test(v.name) ? v.name : `${v.name} · campus`;
  return v.city && !v.name.includes(v.city) ? `${v.name} · ${v.city}` : v.name;
}

/* ---- Stickers -------------------------------------------------------------- */

/**
 * The one sticker a poster may wear: a fact, loudest first. Null when nothing
 * is worth shouting — most posters should have none.
 */
export function eventSticker(
  e: Pick<CampusEvent, "registration" | "startsAt" | "endsAt">,
  now = new Date(),
): { label: string; tone: StickerTone } | null {
  const phase = eventPhase(e, now);
  if (phase === "past") return null;
  if (phase === "live" && !isMultiDay(e)) return { label: "En ce moment", tone: "ok" };
  if (isTonight(e, now)) return { label: "Ce soir", tone: "accent" };
  const r = e.registration;
  if (r.status === "complet" || r.status === "liste-attente") return { label: "Complet", tone: "cream" };
  if (r.status === "derniere-chance") {
    const left = seatsLeft(r);
    return { label: left !== null && left > 0 && left <= 10 ? `Plus que ${plural(left, "place")}` : "Dernières places", tone: "blush" };
  }
  if (phase === "upcoming" && dayDiff(now, e.startsAt) === 1) return { label: relativeDay(e.startsAt, now), tone: "cream" };
  return null;
}

/* ---- Grouping ------------------------------------------------------------- */

export type DayBucket = ReturnType<typeof dayBucket>;

/** Agenda groups in order (Aujourd'hui, Demain, Cette semaine, Plus tard), empty ones dropped. */
export function groupByDay<T extends Timed>(
  list: T[],
  now = new Date(),
): Array<{ bucket: DayBucket; label: string; events: T[] }> {
  const order: DayBucket[] = ["aujourdhui", "demain", "semaine", "plus-tard"];
  const groups = new Map<DayBucket, T[]>(order.map((b) => [b, []]));
  for (const e of list) {
    // Something already under way belongs to today, not to the day it started.
    const bucket = eventPhase(e, now) === "live" ? "aujourdhui" : dayBucket(e.startsAt, now);
    groups.get(bucket)!.push(e);
  }
  return order
    .map((bucket) => ({ bucket, label: DAY_BUCKET_LABEL[bucket], events: groups.get(bucket)! }))
    .filter((g) => g.events.length > 0);
}

/* ---- Lit styling -------------------------------------------------------------
   Neon only reads on the night surface. These styles scale the glow by
   --is-night (1 on night, 0 on paper/studio), so the same component is a lit
   tube at night and a clean ink accent on cream — no surface prop needed. */

/** Glow for lit text (tonight's numeral, "Ce soir"). Pair with text-assoc-text. */
export const LIT_TEXT: CSSProperties = {
  textShadow:
    "0 0 calc(var(--is-night) * 0.08em) var(--assoc), 0 0 calc(var(--is-night) * 0.3em) var(--assoc), 0 0 calc(var(--is-night) * 0.75em) color-mix(in srgb, var(--assoc) 55%, transparent)",
};

/** Glow for a lit rule / tube. Pair with bg-assoc. */
export const LIT_TUBE: CSSProperties = {
  boxShadow:
    "0 0 calc(var(--is-night) * 0.35rem) var(--assoc), 0 0 calc(var(--is-night) * 1.4rem) color-mix(in srgb, var(--assoc) 55%, transparent)",
};

/** Glow around a neon emblem disc. */
export const LIT_EMBLEM: CSSProperties = {
  filter: "drop-shadow(0 0 calc(var(--is-night) * 0.6rem) color-mix(in srgb, var(--assoc) 70%, transparent))",
};
