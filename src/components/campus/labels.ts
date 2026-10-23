import { dateParts, formatDayMonth, formatDayShort } from "@/lib/format";
import { addDaysToKey, dayDiff, parisDateKey, parisISO, parisWeekday } from "@/lib/time";
import type { PostKind } from "@/lib/types";

/** Rubrique names, singular — the kicker printed above a story. */
export const POST_KIND_LABEL: Record<PostKind, string> = {
  article: "Article",
  annonce: "Annonce",
  recap: "Récap",
  breve: "Brève",
};

/** Plural, for filters and section heads. */
export const POST_KIND_PLURAL: Record<PostKind, string> = {
  article: "Articles",
  annonce: "Annonces",
  recap: "Récaps",
  breve: "Brèves",
};

/** Empty-state wording, with the right gender: "Aucun récap", "Aucune brève". */
export const POST_KIND_NONE: Record<PostKind, string> = {
  article: "Aucun article",
  annonce: "Aucune annonce",
  recap: "Aucun récap",
  breve: "Aucune brève",
};

/** What each kind is for (the editor's type picker). */
export const POST_KIND_HINT: Record<PostKind, string> = {
  article: "Un vrai papier : une rencontre, un dossier, une interview.",
  annonce: "Une info à faire passer : réunion, changement d'horaire, nouveauté.",
  recap: "Le retour sur un événement passé, en mots et en photos.",
  breve: "Deux lignes, sans photo : le fil les range dans « En bref ».",
};

/** Order of the rubriques in the filter row. */
export const POST_KINDS: PostKind[] = ["article", "recap", "annonce", "breve"];

export function parsePostKind(value: string | string[] | undefined): PostKind | null {
  const v = Array.isArray(value) ? value[0] : value;
  return POST_KINDS.includes(v as PostKind) ? (v as PostKind) : null;
}

/** Short publication label for meta lines: "Aujourd'hui", "Hier", "Il y a 3 jours", "21 sept.". */
export function publishedLabel(iso: string, now = new Date()): string {
  const days = dayDiff(iso, now);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} jours`;
  return formatDayShort(iso);
}

/** Same, as a phrase for bylines: "Publié hier", "Publié le 21 septembre". */
export function publishedPhrase(iso: string, now = new Date()): string {
  const days = dayDiff(iso, now);
  if (days <= 0) return "Publié aujourd'hui";
  if (days === 1) return "Publié hier";
  if (days < 7) return `Publié il y a ${days} jours`;
  return `Publié le ${formatDayMonth(iso)}`;
}

/** ISO-8601 week number of a Paris calendar day — the fil's issue number. */
export function isoWeek(date: Date | string = new Date()): number {
  const d = new Date(`${parisDateKey(date)}T12:00:00Z`);
  const weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/* ---- Weeks: the fil comes out like a weekly, one issue per ISO week ---- */

export interface FilWeek {
  /** ISO week number, printed as the issue number ("N° 42"). */
  number: number;
  /** Monday and Sunday of that week, as Paris day keys ("2026-10-12"). */
  start: string;
  end: string;
}

/** The Paris Monday→Sunday week containing `date`. */
export function weekOf(date: Date | string = new Date()): FilWeek {
  const start = addDaysToKey(parisDateKey(date), 1 - parisWeekday(date));
  return { number: isoWeek(date), start, end: addDaysToKey(start, 6) };
}

/** "du 12 au 18 oct." · "du 28 sept. au 4 oct." */
export function weekRangeLabel(week: FilWeek): string {
  const from = parisISO(week.start, "12:00");
  const to = parisISO(week.end, "12:00");
  const sameMonth = week.start.slice(0, 7) === week.end.slice(0, 7);
  return `du ${sameMonth ? dateParts(from).day : formatDayShort(from)} au ${formatDayShort(to)}`;
}

/** "Cette semaine" · "La semaine dernière" · "Il y a 3 semaines". */
export function weekRelative(week: FilWeek, now = new Date()): string {
  const weeks = Math.round(dayDiff(week.start, weekOf(now).start) / 7);
  if (weeks <= 0) return "Cette semaine";
  if (weeks === 1) return "La semaine dernière";
  return `Il y a ${weeks} semaines`;
}

/** Splits a newest-first list into consecutive weeks — the fil's back issues. */
export function groupByWeek<T extends { publishedAt: string }>(items: T[]): (FilWeek & { items: T[] })[] {
  const groups: (FilWeek & { items: T[] })[] = [];
  for (const item of items) {
    const week = weekOf(item.publishedAt);
    const last = groups[groups.length - 1];
    if (last && last.start === week.start) last.items.push(item);
    else groups.push({ ...week, items: [item] });
  }
  return groups;
}
