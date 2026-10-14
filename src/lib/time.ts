/**
 * Campus time is Paris time. Everything that decides "tonight", "tomorrow" or
 * "closes in 2 days" goes through these helpers so the server render and the
 * student's phone agree, whatever the host timezone is.
 */
export const CAMPUS_TZ = "Europe/Paris";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPUS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-13" for the given instant, in Paris. */
export function parisDateKey(date: Date | string): string {
  return ymdFormatter.format(typeof date === "string" ? new Date(date) : date);
}

/** UTC offset of Paris on a given calendar day, as "+02:00" / "+01:00". */
function parisOffset(dateKey: string): string {
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

/** Adds whole days to a "YYYY-MM-DD" key. */
export function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO string for a Paris wall-clock time on a given day key. */
export function parisISO(dateKey: string, time = "00:00"): string {
  return `${dateKey}T${time}:00${parisOffset(dateKey)}`;
}

/** Number of calendar days (Paris) between two instants: 0 = same day. */
export function dayDiff(from: Date | string, to: Date | string): number {
  const a = Date.parse(`${parisDateKey(from)}T00:00:00Z`);
  const b = Date.parse(`${parisDateKey(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** ISO weekday in Paris: 1 = Monday … 7 = Sunday. */
export function parisWeekday(date: Date | string): number {
  const key = parisDateKey(date);
  const d = new Date(`${key}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
