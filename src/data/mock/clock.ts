import { addDaysToKey, parisDateKey, parisISO } from "@/lib/time";

/**
 * Mock content is scheduled relative to "today" so the demo always has
 * something tonight, a deadline this week, etc. Real data will carry absolute
 * dates from Supabase; nothing outside /data/mock should use these helpers.
 */
function todayKey(): string {
  return parisDateKey(new Date());
}

/** Paris wall-clock time `dayOffset` days from today, e.g. at(0, "21:00"). */
export function at(dayOffset: number, time = "20:00"): string {
  return parisISO(addDaysToKey(todayKey(), dayOffset), time);
}

/** Convenience for past timestamps: ago(3, "14:20") = three days ago at 14:20. */
export function ago(days: number, time = "12:00"): string {
  return at(-days, time);
}
