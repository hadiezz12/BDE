/**
 * The campus calendar's arithmetic, in Paris days: month and week grids
 * (weeks start on Monday), the exact instants that bound them (daylight
 * saving included: a day can last 23 or 25 hours), and which days an event
 * covers. Pure module (relative imports with extensions only).
 */

import { addDaysToKey, parisDateKey, parisWeekday } from "../time.ts";
import { parisLocalToInstant } from "../posts/schedule.ts";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The instant a Paris day starts (midnight exists every day, even on clock changes). */
export function dayStart(dayKey: string): string {
  const at = parisLocalToInstant(dayKey, "00:00");
  if (!at.ok) throw new Error(`invalid day ${dayKey}`);
  return at.iso;
}

/** A valid "YYYY-MM-DD" (a real day) or null. */
export function parseDayKey(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !DAY_KEY.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** A valid "YYYY-MM" or null. */
export function parseMonthKey(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && MONTH_KEY.test(v) ? v : null;
}

export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Monday of the week holding this day. */
export function weekStart(dayKey: string): string {
  return addDaysToKey(dayKey, 1 - parisWeekday(`${dayKey}T12:00:00Z`));
}

export function weekDays(dayKey: string): string[] {
  const monday = weekStart(dayKey);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}

/** The month as whole weeks (Monday → Sunday), days of the neighbouring months included. */
export function monthGrid(monthKey: string): string[][] {
  const first = `${monthKey}-01`;
  const last = addDaysToKey(`${addMonths(monthKey, 1)}-01`, -1);
  const weeks: string[][] = [];
  for (let monday = weekStart(first); monday <= last; monday = addDaysToKey(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i)));
  }
  return weeks;
}

/** [from, to) instants covering a list of day keys (inclusive of the last day). */
export function rangeOf(days: string[]): { from: string; to: string } {
  return { from: dayStart(days[0]), to: dayStart(addDaysToKey(days[days.length - 1], 1)) };
}

type Timed = { startsAt: string; endsAt: string };

/** Does the event happen on this Paris day (any overlap with its 24 or so hours)? */
export function onDay(e: Timed, dayKey: string): boolean {
  const start = Date.parse(dayStart(dayKey));
  const end = Date.parse(dayStart(addDaysToKey(dayKey, 1)));
  return Date.parse(e.startsAt) < end && Date.parse(e.endsAt) > start;
}

/**
 * How an event sits on a given day of a grid: where it starts, continues or
 * ends. A night out ending at 5 a.m. belongs to the evening it starts (it
 * does not continue on the next day of the grid); a trip spans its days.
 */
export function dayRole(e: Timed, dayKey: string): "single" | "start" | "middle" | "end" | null {
  if (!onDay(e, dayKey)) return null;
  const startKey = parisDateKey(e.startsAt);
  // Ends before noon the next day: one evening, not two days.
  const endInstant = new Date(Date.parse(e.endsAt) - 1);
  let endKey = parisDateKey(endInstant);
  if (endKey === addDaysToKey(startKey, 1) && Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23",
  }).format(endInstant)) < 12) {
    endKey = startKey;
  }
  if (dayKey < startKey || dayKey > endKey) return null;
  if (startKey === endKey) return "single";
  if (dayKey === startKey) return "start";
  if (dayKey === endKey) return "end";
  return "middle";
}

/** Events of one day, in start order (what the day cell or the agenda shows). */
export function eventsOn<T extends Timed>(events: T[], dayKey: string): T[] {
  return events
    .filter((e) => dayRole(e, dayKey) !== null)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function todayKey(now = new Date()): string {
  return parisDateKey(now);
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });

/** "octobre 2026". */
export function monthLabel(monthKey: string): string {
  return monthFormatter.format(new Date(`${monthKey}-15T12:00:00Z`));
}

/** "jeudi 22 octobre". */
export function dayLabel(dayKey: string): string {
  return dayFormatter.format(new Date(`${dayKey}T12:00:00Z`));
}

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
export const WEEKDAY_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;
