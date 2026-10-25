import type { ApplicationItem, EventItem, NotificationKind } from "@/lib/types";
import type { IconName } from "@/components/ui/Icon";
import { toEventItem, type MyEventsPayload, type MyRegistrationPayload } from "@/lib/events/model";
import { eventPhase } from "@/components/events/event-facts";
import { formatDayFull, formatDayShort, formatTime } from "@/lib/format";
import { CAMPUS_TZ, dayDiff, parisDateKey } from "@/lib/time";

/**
 * Small derivations for the student space. Pure functions of the data and
 * the clock (`now` is a parameter so one render agrees with itself); no data
 * access, wording built on lib/format.
 */

/* ---- Notifications ------------------------------------------------------ */

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  evenement: "Événement",
  candidature: "Candidature",
  association: "Association",
  bde: "BDE",
};

export const NOTIFICATION_KIND_ICON: Record<NotificationKind, IconName> = {
  evenement: "ticket",
  candidature: "file",
  association: "users",
  bde: "megaphone",
};

/** Heading of each kind in the preferences form. */
export const NOTIFICATION_KIND_TITLE: Record<NotificationKind, string> = {
  evenement: "Événements",
  candidature: "Candidatures",
  association: "Tes assos",
  bde: "Le BDE",
};

/** What each kind covers, for the preferences form. */
export const NOTIFICATION_KIND_DETAIL: Record<NotificationKind, string> = {
  evenement: "Rappels avant tes soirées, places qui se libèrent sur ce que tu as enregistré.",
  candidature: "Chaque changement de statut, les entretiens calés, les réponses des bureaux.",
  association: "Les nouvelles des assos dont tu es membre : recrutements, permanences, réunions.",
  bde: "Les annonces du Very Pink Club : dates des événements, campagne des listes, carte cotisante.",
};

export const NOTIFICATION_KINDS: NotificationKind[] = ["evenement", "candidature", "association", "bde"];

/** "Aujourd'hui" · "Hier" · "Vendredi 9 octobre" — the day heading of a notification group. */
export function dayHeading(iso: string, now = new Date()): string {
  const diff = dayDiff(now, iso);
  if (diff === 0) return "Aujourd'hui";
  if (diff === -1) return "Hier";
  return formatDayFull(iso);
}

/** Groups a newest-first list by Paris calendar day, keeping the order. */
export function groupByCalendarDay<T extends { createdAt: string }>(
  list: T[],
  now = new Date(),
): Array<{ key: string; label: string; items: T[] }> {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const item of list) {
    const key = parisDateKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayHeading(item.createdAt, now), items: [item] });
  }
  return groups;
}

/** "aujourd'hui à 10h20" · "hier à 17h45" · "le 9 oct." */
export function sinceWords(iso: string, now = new Date()): string {
  const diff = dayDiff(now, iso);
  if (diff === 0) return `aujourd'hui à ${formatTime(iso)}`;
  if (diff === -1) return `hier à ${formatTime(iso)}`;
  return `le ${formatDayShort(iso)}`;
}

/* ---- Events ----------------------------------------------------------------- */

export type MyEventEntry = { event: EventItem; registration: MyRegistrationPayload };

/** An event the student registered to that is no longer on the site (hidden, page taken offline). */
export interface UnavailableEntry {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  organization: string;
  cancelled: boolean;
  registration: MyRegistrationPayload;
}

/**
 * The student's events (my_events), split the way the space shows them:
 *  - tickets: a seat or a waiting place for something not over, soonest first;
 *  - cancelled: events the organizers cancelled while the student held a place;
 *  - withdrawn: registrations cancelled (by the student or the organizers) for something to come;
 *  - past: what they had a place for and is over, most recent first;
 *  - unavailable: registrations whose event is no longer on the site;
 *  - saved: bookmarks to come, without a place.
 */
export function splitMyEvents(my: MyEventsPayload, now = new Date()) {
  const byStart = (a: MyEventEntry, b: MyEventEntry) => Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt);
  const tickets: MyEventEntry[] = [];
  const cancelled: MyEventEntry[] = [];
  const withdrawn: MyEventEntry[] = [];
  const past: MyEventEntry[] = [];
  const unavailable: UnavailableEntry[] = [];
  const held = new Set<string>();

  for (const { registration, event } of my.registrations) {
    const active = registration.status !== "cancelled";
    if ("unavailable" in event) {
      if (active) {
        unavailable.push({
          id: event.id,
          title: event.title,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          organization: event.organization.short_name ?? event.organization.name,
          cancelled: event.status === "cancelled",
          registration,
        });
        held.add(event.id);
      }
      continue;
    }
    const entry = { event: toEventItem(event), registration };
    const over = eventPhase(entry.event, now) === "past";
    if (active) held.add(event.id);
    if (active && entry.event.status === "cancelled") cancelled.push(entry);
    else if (active && over) past.push(entry);
    else if (active) tickets.push(entry);
    else if (!over && entry.event.status !== "cancelled") withdrawn.push(entry);
  }

  return {
    tickets: tickets.sort(byStart),
    cancelled: cancelled.sort((a, b) => byStart(b, a)),
    withdrawn: withdrawn.sort(byStart),
    past: past.sort((a, b) => byStart(b, a)),
    unavailable,
    saved: my.bookmarks
      .filter((b) => !held.has(b.id))
      .map((b) => toEventItem(b))
      .filter((e) => e.status !== "cancelled" && eventPhase(e, now) !== "past")
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
  };
}

/** "Barathon #2 — Princesse × Mouffetard" → "Barathon #2": the name people say. */
export function shortEventName(title: string): string {
  return title.split(/\s+[—–]\s+/)[0] ?? title;
}

/* ---- Applications ------------------------------------------------------------ */

const ANSWERED_RECENTLY_DAYS = 7;

/**
 * Worth a look today: an interview to come, a draft not yet sent (while the
 * campaign can still take it), or an answer that arrived this week.
 */
export function needsAttention(a: ApplicationItem, now = new Date()): boolean {
  switch (a.status) {
    case "entretien":
      return !a.nextStep?.date || Date.parse(a.nextStep.date) > now.getTime();
    case "brouillon":
      return a.campaign.status !== "cloturee";
    case "acceptee":
    case "refusee":
      return dayDiff(a.updatedAt, now) <= ANSWERED_RECENTLY_DAYS;
    default:
      return false;
  }
}

/** One line under the status when there is no dated next step. */
export function applicationHint(a: ApplicationItem, now = new Date()): string {
  switch (a.status) {
    case "brouillon":
      if (a.campaign.status === "a-venir")
        return `Pas encore envoyée : l'envoi ouvre le ${formatDayShort(a.campaign.opensAt)} à ${formatTime(a.campaign.opensAt)}`;
      if (a.campaign.status === "cloturee") return "Pas envoyée : le recrutement est clos";
      return `Pas encore envoyée : à envoyer avant le ${formatDayShort(a.campaign.closesAt)} à ${formatTime(a.campaign.closesAt)}`;
    case "envoyee":
      return `Envoyée ${sinceWords(a.submittedAt ?? a.updatedAt, now)}`;
    case "en-revue":
      return `En lecture depuis ${sinceWords(a.updatedAt, now)}`;
    case "entretien":
      return `Entretien calé ${sinceWords(a.updatedAt, now)}`;
    case "acceptee":
    case "refusee":
      return `Réponse reçue ${sinceWords(a.updatedAt, now)}`;
    case "retiree":
      return `Retirée ${sinceWords(a.updatedAt, now)}`;
  }
}

/** Still going somewhere (draft, sent, being read, interview). */
export function isOngoing(a: Pick<ApplicationItem, "status">): boolean {
  return a.status === "brouillon" || a.status === "envoyee" || a.status === "en-revue" || a.status === "entretien";
}

/** "184 Ko" · "2,3 Mo" */
export function formatFileSize(kb: number): string {
  if (kb < 1000) return `${Math.max(1, Math.round(kb)).toLocaleString("fr-FR")} Ko`;
  return `${(kb / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

/* ---- People ----------------------------------------------------------------- */

const monthYear = new Intl.DateTimeFormat("fr-FR", { timeZone: CAMPUS_TZ, month: "long", year: "numeric" });

/** "octobre 2025" */
export function formatMonthYear(iso: string): string {
  return monthYear.format(new Date(iso));
}

/** School year of a date, Paris time: "2026–2027" from September on, "2025–2026" before. */
export function academicSeason(now = new Date()): string {
  const [year, month] = parisDateKey(now).split("-").map(Number);
  const start = month >= 9 ? year : year - 1;
  return `${start}–${start + 1}`;
}

/** Time-of-day hello, Paris time: Bonjour (5h–12h), Salut (12h–18h), Bonsoir. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: CAMPUS_TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Bonjour";
  if (hour >= 12 && hour < 18) return "Salut";
  return "Bonsoir";
}
