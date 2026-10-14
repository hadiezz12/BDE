import { CAMPUS_TZ, dayDiff, parisWeekday } from "./time";
import type { CampaignStatus, EventCategory, RegistrationStatus, AssociationCategory, ApplicationStatus } from "./types";

/**
 * French, Paris-time formatting. Every visible date goes through here so the
 * wording stays consistent ("ce soir", "21h30", "clôture dans 3 jours").
 */

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: CAMPUS_TZ, ...o });

const weekdayLong = fmt({ weekday: "long" });
const weekdayShort = fmt({ weekday: "short" });
const dayNum = fmt({ day: "numeric" });
const monthShort = fmt({ month: "short" });
const monthLong = fmt({ month: "long" });
const dayMonth = fmt({ day: "numeric", month: "long" });
const dayMonthShort = fmt({ day: "numeric", month: "short" });
const full = fmt({ weekday: "long", day: "numeric", month: "long" });
const fullYear = fmt({ day: "numeric", month: "long", year: "numeric" });
const hm = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const trimDot = (s: string) => s.replace(/\.$/, "");

/** Parts for the big calendar block: { weekday: "mar", day: "14", month: "oct" }. */
export function dateParts(iso: string) {
  const d = new Date(iso);
  return {
    weekday: trimDot(weekdayShort.format(d)),
    weekdayLong: weekdayLong.format(d),
    day: dayNum.format(d),
    month: trimDot(monthShort.format(d)),
    monthLong: monthLong.format(d),
  };
}

/** "21h30", "21h" (no ":00"). */
export function formatTime(iso: string): string {
  const [h, m] = hm.format(new Date(iso)).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "14 oct." */
export function formatDayShort(iso: string): string {
  return dayMonthShort.format(new Date(iso));
}

/** "14 octobre" */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

/** "Mardi 14 octobre" */
export function formatDayFull(iso: string): string {
  return cap(full.format(new Date(iso)));
}

/** "14 octobre 2026" */
export function formatDateLong(iso: string): string {
  return fullYear.format(new Date(iso));
}

/**
 * How a student says when something happens:
 * "Ce soir" / "Aujourd'hui" · "Demain" · "Jeudi" (this week) · "Sam. 31 oct."
 */
export function relativeDay(iso: string, now = new Date()): string {
  const diff = dayDiff(now, iso);
  const hour = Number(hm.format(new Date(iso)).split(":")[0]);
  if (diff === 0) return hour >= 18 ? "Ce soir" : "Aujourd'hui";
  if (diff === 1) return hour >= 18 ? "Demain soir" : "Demain";
  if (diff === -1) return "Hier";
  if (diff > 1 && diff < 7 && parisWeekday(iso) > parisWeekday(now)) return cap(weekdayLong.format(new Date(iso)));
  return cap(`${trimDot(weekdayShort.format(new Date(iso)))} ${dayMonthShort.format(new Date(iso))}`);
}

/** "Mar. 14 oct. · 21h30" */
export function formatWhen(iso: string, now = new Date()): string {
  return `${relativeDay(iso, now)} · ${formatTime(iso)}`;
}

/** Bucket used to group agendas: today / tomorrow / this week / later. */
export function dayBucket(iso: string, now = new Date()): "aujourdhui" | "demain" | "semaine" | "plus-tard" {
  const diff = dayDiff(now, iso);
  if (diff <= 0) return "aujourdhui";
  if (diff === 1) return "demain";
  if (diff < 7) return "semaine";
  return "plus-tard";
}

export const DAY_BUCKET_LABEL = {
  aujourdhui: "Aujourd'hui",
  demain: "Demain",
  semaine: "Cette semaine",
  "plus-tard": "Plus tard",
} as const;

/**
 * Deadline wording, precise as it gets closer:
 * "Clôture ce soir 23h59" · "Clôture demain" · "Plus que 3 jours" · "Jusqu'au 18 oct." · "Clos depuis le 10 oct."
 */
export function deadlineLabel(iso: string, now = new Date()): string {
  const ms = Date.parse(iso) - now.getTime();
  if (ms <= 0) return `Clos depuis le ${formatDayShort(iso)}`;
  const diff = dayDiff(now, iso);
  if (ms < 3 * 3_600_000) return `Clôture dans ${Math.max(1, Math.round(ms / 60_000 / 15) * 15)} min`;
  if (diff === 0) return `Clôture aujourd'hui à ${formatTime(iso)}`;
  if (diff === 1) return `Clôture demain à ${formatTime(iso)}`;
  if (diff <= 7) return `Plus que ${diff} jours`;
  return `Jusqu'au ${formatDayShort(iso)}`;
}

/** Whole days left (0 = closes today), or null when closed. */
export function daysLeft(iso: string, now = new Date()): number | null {
  if (Date.parse(iso) <= now.getTime()) return null;
  return Math.max(0, dayDiff(now, iso));
}

export function formatPrice(price: { member?: number; standard: number } | null): string {
  if (!price) return "Gratuit";
  const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;
  return price.member !== undefined && price.member !== price.standard
    ? `${eur(price.member)} adhérent · ${eur(price.standard)}`
    : eur(price.standard);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

/* ---- Labels -------------------------------------------------------------- */

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  soiree: "Soirées",
  sport: "Sport",
  carriere: "Carrière",
  academique: "Académique",
  culture: "Culture",
  solidarite: "Solidarité",
  "week-end": "Week-ends",
};

export const ASSOCIATION_CATEGORY_LABEL: Record<AssociationCategory, string> = {
  bde: "BDE",
  sport: "Sport",
  culture: "Culture",
  pro: "Pro",
  entrepreneuriat: "Entrepreneuriat",
  solidarite: "Solidarité",
  international: "International",
  arts: "Arts",
  media: "Médias",
  autre: "Autres",
};

export const REGISTRATION_LABEL: Record<RegistrationStatus, string> = {
  libre: "Entrée libre",
  bientot: "Billetterie bientôt",
  ouverte: "Inscriptions ouvertes",
  "derniere-chance": "Dernières places",
  "liste-attente": "Liste d'attente",
  complet: "Complet",
  fermee: "Inscriptions closes",
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  "a-venir": "Bientôt",
  ouverte: "Candidatures ouvertes",
  "derniere-chance": "Dernière ligne droite",
  cloturee: "Clôturé",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  "en-revue": "En cours de lecture",
  entretien: "Entretien prévu",
  acceptee: "Acceptée",
  refusee: "Non retenue",
  retiree: "Retirée",
};
