/**
 * Reporting periods of the statistics pages (Phase 13): what the URL asks
 * for (?periode=30j, ?periode=annee, ?du=…&au=…), validated into Paris
 * calendar days, the comparison period that goes with it, and the buckets
 * the charts draw (days, weeks or months).
 *
 * Academic years come from the Phase 11 calendar (public.analytics_years),
 * never from a hardcoded September. Comparisons compare like with like: the
 * same number of days before, and for a year still running, the same elapsed
 * part of the previous year (1 Sept → 3 Nov against 1 Sept → 3 Nov).
 *
 * Every date here is a "YYYY-MM-DD" key of a Paris day: arithmetic is done at
 * noon UTC, so daylight-saving changes never move a day.
 * Pure module (relative imports with extensions only): the unit tests load it with plain Node.
 */

export interface AcademicYearRef {
  label: string;
  starts_on: string;
  ends_on: string;
  status: "current" | "closed";
}

export type PeriodPreset = "7j" | "30j" | "90j" | "mois" | "annee" | "annee-precedente" | "perso";
export type Granularity = "day" | "week" | "month";

export interface Range {
  from: string;
  to: string;
}

export interface Period extends Range {
  preset: PeriodPreset;
  /** "30 derniers jours", "Année 2026-2027 (jusqu'à aujourd'hui)". */
  label: string;
  days: number;
  granularity: Granularity;
  /** False when the person turned the comparison off (?comparer=non). */
  compareOn: boolean;
  /** Null when there is nothing comparable (before the first measured day, no previous year) or it is off. */
  compare: (Range & { label: string; explanation: string }) | null;
}

export type PeriodResult = { ok: true; period: Period } | { ok: false; message: string; fallback: Period };

export const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "7j", label: "7 jours" },
  { key: "30j", label: "30 jours" },
  { key: "90j", label: "90 jours" },
  { key: "mois", label: "Ce mois-ci" },
  { key: "annee", label: "Cette année" },
  { key: "annee-precedente", label: "Année précédente" },
  { key: "perso", label: "Dates choisies" },
];

/** The first day the platform can report on; the database refuses anything earlier. */
export const FIRST_DAY = "2020-01-01";
/** Two years at most in one view (the database checks the same). */
export const MAX_DAYS = 731;

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: unknown): s is string {
  if (typeof s !== "string" || !KEY.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from a to b, both included: a == b is 1. */
export function spanDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
}

const minKey = (a: string, b: string) => (a < b ? a : b);
const maxKey = (a: string, b: string) => (a > b ? a : b);

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const fmtDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDayYear = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const fmtMonthLong = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtWeekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });

const at = (key: string) => new Date(`${key}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "3 nov. 2026" */
export function formatDayKey(key: string): string {
  return fmtDayYear.format(at(key));
}

/** "1 sept. → 3 nov. 2026", "3 nov. 2026" for a single day. */
export function formatRange(r: Range): string {
  if (r.from === r.to) return formatDayKey(r.from);
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${sameYear ? fmtDay.format(at(r.from)) : formatDayKey(r.from)} → ${formatDayKey(r.to)}`;
}

function equalLengthBefore(r: Range): Range {
  const n = spanDays(r.from, r.to);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

function withCompare(p: Omit<Period, "compare" | "compareOn" | "days" | "granularity">, compare: (Range & { explanation: string }) | null, on: boolean): Period {
  const days = spanDays(p.from, p.to);
  const valid = on && compare && compare.from >= FIRST_DAY && compare.from <= compare.to;
  return {
    ...p,
    days,
    granularity: granularityFor(days),
    compareOn: on,
    compare: valid ? { ...compare, label: formatRange(compare) } : null,
  };
}

/** Days for a month or less, weeks up to about four months, months beyond. */
export function granularityFor(days: number): Granularity {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function lastDays(n: number, today: string, on: boolean): Period {
  const r = { from: addDays(today, -(n - 1)), to: today };
  return withCompare(
    { ...r, preset: `${n}j` as PeriodPreset, label: `${n} derniers jours` },
    { ...equalLengthBefore(r), explanation: `Comparé aux ${n} jours d'avant.` },
    on,
  );
}

export function defaultPeriod(today: string): Period {
  return lastDays(30, today, true);
}

/**
 * Reads the period from the URL. Anything malformed falls back to the 30 last
 * days with a sentence saying why (the page shows it), never to an
 * unbounded query.
 */
export function parsePeriod(
  params: { periode?: string | string[]; du?: string | string[]; au?: string | string[]; comparer?: string | string[] },
  today: string,
  years: AcademicYearRef[],
): PeriodResult {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const preset = one(params.periode);
  const du = one(params.du);
  const au = one(params.au);
  const on = one(params.comparer) !== "non";
  const fallback = defaultPeriod(today);
  const fail = (message: string): PeriodResult => ({ ok: false, message, fallback });

  if ((preset === undefined || preset === "perso") && (du !== undefined || au !== undefined)) {
    if (!isDayKey(du) || !isDayKey(au)) return fail("Ces dates ne sont pas valides : les 30 derniers jours sont affichés.");
    if (du > au) return fail("La date de début est après la date de fin : les 30 derniers jours sont affichés.");
    if (du < FIRST_DAY) return fail("La plateforme ne remonte pas avant le 1er janvier 2020 : les 30 derniers jours sont affichés.");
    if (au > addDays(today, 365)) return fail("La fin est trop loin dans l'avenir : les 30 derniers jours sont affichés.");
    if (spanDays(du, au) > MAX_DAYS) return fail("Deux ans au plus à la fois : les 30 derniers jours sont affichés.");
    const r = { from: du, to: au };
    return {
      ok: true,
      period: withCompare(
        { ...r, preset: "perso", label: formatRange(r) },
        { ...equalLengthBefore(r), explanation: `Comparé aux ${spanDays(du, au)} jours d'avant.` },
        on,
      ),
    };
  }

  switch (preset ?? "30j") {
    case "7j":
      return { ok: true, period: lastDays(7, today, on) };
    case "30j":
      return { ok: true, period: lastDays(30, today, on) };
    case "90j":
      return { ok: true, period: lastDays(90, today, on) };
    case "mois": {
      const y = Number(today.slice(0, 4));
      const mo = Number(today.slice(5, 7));
      const day = Number(today.slice(8, 10));
      const from = `${today.slice(0, 7)}-01`;
      const py = mo === 1 ? y - 1 : y;
      const pm = mo === 1 ? 12 : mo - 1;
      const pFrom = `${py}-${String(pm).padStart(2, "0")}-01`;
      const pTo = `${pFrom.slice(0, 8)}${String(Math.min(day, daysInMonth(py, pm))).padStart(2, "0")}`;
      const monthName = fmtMonthLong.format(at(from));
      return {
        ok: true,
        period: withCompare(
          { from, to: today, preset: "mois", label: `${cap(monthName)} (jusqu'à aujourd'hui)` },
          { from: pFrom, to: pTo, explanation: `Comparé aux mêmes jours du mois précédent (1er → ${Math.min(day, daysInMonth(py, pm))}).` },
          on,
        ),
      };
    }
    case "annee": {
      const current = years.find((y) => y.status === "current" && y.starts_on <= today);
      if (!current) {
        return fail("Aucune année universitaire en cours n'est configurée (le BDE la règle dans Continuité) : les 30 derniers jours sont affichés.");
      }
      const to = minKey(today, current.ends_on);
      const elapsed = spanDays(current.starts_on, to);
      const previous = years.find((y) => y.status === "closed" && y.ends_on < current.starts_on);
      const running = to < current.ends_on;
      return {
        ok: true,
        period: withCompare(
          { from: current.starts_on, to, preset: "annee", label: `Année ${current.label}${running ? " (jusqu'à aujourd'hui)" : ""}` },
          previous
            ? running
              ? {
                  from: previous.starts_on,
                  to: minKey(addDays(previous.starts_on, elapsed - 1), previous.ends_on),
                  explanation: `L'année n'est pas finie : comparée aux ${elapsed} premiers jours de ${previous.label}, pas à l'année entière.`,
                }
              : { from: previous.starts_on, to: previous.ends_on, explanation: `Comparée à l'année ${previous.label}.` }
            : null,
          on,
        ),
      };
    }
    case "annee-precedente": {
      const current = years.find((y) => y.status === "current");
      const closed = years.filter((y) => y.status === "closed" && (!current || y.ends_on < current.starts_on));
      const year = closed[0];
      if (!year) return fail("Aucune année universitaire terminée n'est enregistrée : les 30 derniers jours sont affichés.");
      const before = closed[1];
      const to = minKey(year.ends_on, today);
      if (spanDays(year.starts_on, to) > MAX_DAYS) return fail("Cette année est trop longue pour une seule vue : les 30 derniers jours sont affichés.");
      return {
        ok: true,
        period: withCompare(
          { from: maxKey(year.starts_on, FIRST_DAY), to, preset: "annee-precedente", label: `Année ${year.label}` },
          before ? { from: before.starts_on, to: before.ends_on, explanation: `Comparée à l'année ${before.label}.` } : null,
          on,
        ),
      };
    }
    default:
      return fail("Cette période n'existe pas : les 30 derniers jours sont affichés.");
  }
}

/** The URL of a period (for the period links, the report and the CSV). */
export function periodQuery(p: Period, extra: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  if (p.preset === "perso") {
    q.set("du", p.from);
    q.set("au", p.to);
  } else if (p.preset !== "30j") {
    q.set("periode", p.preset);
  }
  if (!p.compareOn) q.set("comparer", "non");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* ---- Buckets for the charts -------------------------------------------------------------------------- */

export interface Bucket {
  key: string;
  from: string;
  to: string;
  /** Under the column: "8", "3 nov.", "sept.". */
  axisLabel: string;
  /** In the table: "Mar. 3 nov.", "Semaine du 3 nov.", "Septembre 2026". */
  label: string;
  /** The bucket is cut by the period's start or end (a partial week or month). */
  partial: boolean;
}

/** ISO week start (Monday) of a day key. */
function mondayOf(key: string): string {
  const wd = at(key).getUTCDay();
  return addDays(key, -((wd + 6) % 7));
}

export function buckets(r: Range, g: Granularity): Bucket[] {
  const out: Bucket[] = [];
  if (g === "day") {
    for (let k = r.from; k <= r.to; k = addDays(k, 1)) {
      out.push({
        key: k,
        from: k,
        to: k,
        axisLabel: String(Number(k.slice(8, 10))),
        label: `${cap(fmtWeekday.format(at(k)))} ${fmtDay.format(at(k))}`,
        partial: false,
      });
    }
    return out;
  }
  if (g === "week") {
    for (let start = mondayOf(r.from); start <= r.to; start = addDays(start, 7)) {
      const from = maxKey(start, r.from);
      const to = minKey(addDays(start, 6), r.to);
      out.push({
        key: start,
        from,
        to,
        axisLabel: fmtDay.format(at(start)),
        label: `Semaine du ${fmtDay.format(at(start))}${from !== start || to !== addDays(start, 6) ? ` (${formatRange({ from, to })})` : ""}`,
        partial: from !== start || to !== addDays(start, 6),
      });
    }
    return out;
  }
  for (let m = `${r.from.slice(0, 7)}-01`; m <= r.to; ) {
    const y = Number(m.slice(0, 4));
    const mo = Number(m.slice(5, 7));
    const end = `${m.slice(0, 8)}${String(daysInMonth(y, mo)).padStart(2, "0")}`;
    const from = maxKey(m, r.from);
    const to = minKey(end, r.to);
    out.push({
      key: m.slice(0, 7),
      from,
      to,
      axisLabel: fmtMonth.format(at(m)).replace(".", ""),
      label: cap(fmtMonthLong.format(at(m))) + (from !== m || to !== end ? ` (${formatRange({ from, to })})` : ""),
      partial: from !== m || to !== end,
    });
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  }
  return out;
}

/** One series row from the database: [day, metric, dimension, count]. */
export type SeriesRow = [string, string, string, number];

/**
 * Sums the daily rows of one metric (every dimension, or the given ones)
 * into the buckets. Days without a row count zero: the daily table only
 * stores days that had something, and a day with nothing is a real zero.
 */
export function bucketSeries(rows: SeriesRow[], metric: string, bs: Bucket[], dimensions?: string[]): number[] {
  const sums = bs.map(() => 0);
  for (const [day, m, dim, n] of rows) {
    if (m !== metric || (dimensions && !dimensions.includes(dim))) continue;
    const i = bs.findIndex((b) => day >= b.from && day <= b.to);
    if (i >= 0) sums[i] += n;
  }
  return sums;
}

/** Sum of a metric in the {"metric:dimension": n} totals, over every dimension (or the given ones). */
export function total(totals: Record<string, number> | null | undefined, metric: string, dimensions?: string[]): number | null {
  if (!totals) return null;
  let sum = 0;
  for (const [k, n] of Object.entries(totals)) {
    const cut = k.lastIndexOf(":");
    const m = k.slice(0, cut);
    const dim = k.slice(cut + 1);
    if (m === metric && (!dimensions || dimensions.includes(dim))) sum += n;
  }
  return sum;
}
