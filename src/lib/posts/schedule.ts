/**
 * Scheduling in campus time. An editor types a Paris date and time; the
 * database stores an exact instant (timestamptz). Pure module (no path-alias
 * imports): the unit tests load it with plain Node.
 *
 * Daylight saving makes two cases special:
 *   - the last Sunday of March, 02:00–02:59 does not exist in Paris (clocks
 *     jump to 03:00): refused, with a clear message;
 *   - the last Sunday of October, 02:00–02:59 happens twice: the first one
 *     (summer time, +02:00) is chosen, and the editor is told which.
 */

const TZ = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parisWallClock(date: Date): { date: string; time: string } {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export type ParisInstant =
  | { ok: true; iso: string; offset: "+01:00" | "+02:00"; ambiguous: boolean }
  | { ok: false; reason: "invalid" | "nonexistent" };

/** "2026-10-24" + "18:00" (Paris) → the exact instant. */
export function parisLocalToInstant(date: string, time: string): ParisInstant {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { ok: false, reason: "invalid" };
  }
  const matches = (["+02:00", "+01:00"] as const).filter((offset) => {
    const d = new Date(`${date}T${time}:00${offset}`);
    if (Number.isNaN(d.getTime())) return false;
    const back = parisWallClock(d);
    return back.date === date && back.time === time;
  });
  if (matches.length === 0) {
    // Either a nonexistent hour (spring forward) or an impossible date (31 February).
    const probe = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== date) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "nonexistent" };
  }
  const offset = matches[0];
  return { ok: true, iso: new Date(`${date}T${time}:00${offset}`).toISOString(), offset, ambiguous: matches.length > 1 };
}

/** The Paris date and time of an instant, for form fields ("2026-10-24", "18:00"). */
export function instantToParisLocal(iso: string): { date: string; time: string } {
  return parisWallClock(new Date(iso));
}

const longFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const offsetFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, timeZoneName: "short" });

/** "samedi 24 octobre à 18:00" (Paris), with "(heure d'hiver)" when the clock may confuse. */
export function formatScheduled(iso: string, withZone = false): string {
  const d = new Date(iso);
  const p = Object.fromEntries(longFormatter.formatToParts(d).map((x) => [x.type, x.value]));
  const base = `${p.weekday} ${p.day} ${p.month} à ${p.hour}:${p.minute}`;
  if (!withZone) return base;
  const zone = offsetFormatter.formatToParts(d).find((x) => x.type === "timeZoneName")?.value ?? "";
  return `${base} (${/\+2|UTC\+2|CEST/.test(zone) ? "heure d'été" : "heure d'hiver"})`;
}
