// Unit tests of the statistics helpers (Phase 13): the metric dictionary
// against the database and the docs, reporting periods (Paris days, academic
// years from the configuration, like-for-like comparisons, daylight saving),
// changes and rates (no +Infinity %, no rate over zero), and the CSV (counts
// only, hidden values written as hidden, formulas neutralised).
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAILY_METRICS, METRICS, UNAVAILABLE, hasMetric, metric } from "./metrics.ts";
import { addDays, bucketSeries, buckets, granularityFor, isDayKey, parsePeriod, periodQuery, spanDays, total } from "./period.ts";
import { change, describeChange, formatPctChange, formatRate, rate } from "./compare.ts";
import { analyticsFileName, organizationCsv, organizationRows, pickSections, platformRows, ORGANIZATION_SECTIONS } from "./csv.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261103180617_create_analytics.sql"), "utf8");

const YEARS = [
  { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-08-31", status: "current" },
  { label: "2025-2026", starts_on: "2025-09-01", ends_on: "2026-08-31", status: "closed" },
  { label: "2024-2025", starts_on: "2024-09-01", ends_on: "2025-08-31", status: "closed" },
];
const TODAY = "2026-11-03";

/* ---- Dictionary ------------------------------------------------------------------------------------------ */

test("every metric is defined once, with a quality, a time, a source and a formula", () => {
  const keys = METRICS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate metric key");
  for (const m of METRICS) {
    assert.ok(["operational", "derived", "unavailable"].includes(m.quality), m.key);
    assert.ok(["event_time", "now", "cohort"].includes(m.time), m.key);
    assert.ok(m.label && m.description && m.source && m.formula, m.key);
    assert.ok(m.version >= 1, m.key);
  }
});

test("the unavailable metrics are never counted: no source, never refreshed", () => {
  for (const key of UNAVAILABLE) {
    const m = metric(key);
    assert.equal(m.quality, "unavailable", key);
    assert.equal(m.refresh, "never", key);
    assert.equal(m.source, "aucune", key);
  }
  // Attendance, audience, engagement and e-mail opens are all declared unavailable.
  for (const key of ["unavailable.attendance", "unavailable.views", "unavailable.visitors", "unavailable.engagement", "unavailable.email_opens"]) {
    assert.ok(UNAVAILABLE.includes(key), key);
  }
  // No metric pretends to measure the audience.
  assert.ok(!METRICS.some((m) => m.quality === "audience"));
});

test("the daily metrics of the database are exactly the dictionary's list", () => {
  const body = migration.slice(migration.indexOf("create or replace function private.analytics_source_counts"));
  const fn = body.slice(0, body.indexOf("$$;", body.indexOf("$$") + 2));
  const inDb = [...new Set([...fn.matchAll(/'([a-z]+\.[a-z_]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(inDb, [...DAILY_METRICS].sort());
  // The metric check of the table accepts them all.
  for (const k of DAILY_METRICS) assert.match(k, /^[a-z]+(\.[a-z_]+)+$/);
});

test("the documentation's dictionary lists every metric key", () => {
  const docs = fs.readFileSync(path.join(root, "docs/backend/analytics.md"), "utf8");
  for (const m of METRICS) assert.ok(docs.includes(`\`${m.key}\``), `docs/backend/analytics.md misses ${m.key}`);
  for (const k of DAILY_METRICS) assert.ok(docs.includes(`\`${k}\``), `docs/backend/analytics.md misses the daily metric ${k}`);
});

test("no function updates or deletes without a WHERE clause (the hosted database refuses it: pg-safeupdate)", () => {
  const dir = path.join(root, "supabase/migrations");
  const all = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n"))
    .join("\n");
  const latest = new Map();
  for (const m of all.matchAll(/create or replace function ([a-z_.]+)\(([\s\S]*?)\$\$;/g)) latest.set(m[1], m[0]);
  assert.ok(latest.has("public.set_analytics_min_group_size"));
  const bare = [];
  for (const [name, body] of latest) {
    const code = body.replace(/--[^\n]*/g, "");
    for (const st of code.matchAll(/\b(update\s+[a-z_.]+(?:\s+as\s+[a-z_]+|\s+[a-z])?\s+set\b[\s\S]*?;|delete\s+from\s+[a-z_.]+[\s\S]*?;)/g)) {
      if (!/\bwhere\b/.test(st[0])) bare.push(`${name}: ${st[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(bare, []);
});

test("hasMetric answers for known keys only", () => {
  assert.equal(hasMetric("posts.published"), true);
  assert.equal(hasMetric("posts.views"), false);
});

/* ---- Periods --------------------------------------------------------------------------------------------- */

test("day keys: validated, added across daylight-saving changes without moving a day", () => {
  assert.equal(isDayKey("2026-10-25"), true);
  for (const bad of ["2026-02-30", "2026-13-01", "26-10-25", "2026-10-25T00:00", "", null, 20261025]) assert.equal(isDayKey(bad), false, String(bad));
  // Paris goes from UTC+2 to UTC+1 on 25 October 2026, and back on 29 March 2026.
  assert.equal(addDays("2026-10-24", 1), "2026-10-25");
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
  assert.equal(spanDays("2026-10-01", "2026-10-31"), 31);
  assert.equal(spanDays("2026-03-01", "2026-03-31"), 31);
});

test("the default is the 30 last days, compared with the 30 before", () => {
  const r = parsePeriod({}, TODAY, YEARS);
  assert.equal(r.ok, true);
  assert.equal(r.period.from, "2026-10-05");
  assert.equal(r.period.to, TODAY);
  assert.equal(r.period.days, 30);
  assert.deepEqual([r.period.compare.from, r.period.compare.to], ["2026-09-05", "2026-10-04"]);
  assert.equal(r.period.granularity, "day");
});

test("7 and 90 days, and the comparison can be turned off", () => {
  const seven = parsePeriod({ periode: "7j" }, TODAY, YEARS).period;
  assert.deepEqual([seven.from, seven.to, seven.compare.from, seven.compare.to], ["2026-10-28", TODAY, "2026-10-21", "2026-10-27"]);
  const ninety = parsePeriod({ periode: "90j", comparer: "non" }, TODAY, YEARS).period;
  assert.equal(ninety.days, 90);
  assert.equal(ninety.compare, null);
  assert.equal(ninety.compareOn, false);
  assert.equal(ninety.granularity, "week");
  assert.match(periodQuery(ninety), /comparer=non/);
});

test("this month is compared with the same days of the month before, clamped to its length", () => {
  const nov = parsePeriod({ periode: "mois" }, TODAY, YEARS).period;
  assert.deepEqual([nov.from, nov.to, nov.compare.from, nov.compare.to], ["2026-11-01", TODAY, "2026-10-01", "2026-10-03"]);
  const march = parsePeriod({ periode: "mois" }, "2026-03-31", YEARS).period;
  assert.deepEqual([march.compare.from, march.compare.to], ["2026-02-01", "2026-02-28"]);
  const jan = parsePeriod({ periode: "mois" }, "2027-01-15", YEARS).period;
  assert.deepEqual([jan.compare.from, jan.compare.to], ["2026-12-01", "2026-12-15"]);
});

test("the current academic year comes from the configuration and is compared with the same elapsed days", () => {
  const y = parsePeriod({ periode: "annee" }, TODAY, YEARS).period;
  assert.equal(y.from, "2026-09-01");
  assert.equal(y.to, TODAY);
  const elapsed = spanDays("2026-09-01", TODAY);
  assert.equal(y.compare.from, "2025-09-01");
  assert.equal(spanDays(y.compare.from, y.compare.to), elapsed);
  assert.equal(y.compare.to, "2025-11-03");
  assert.match(y.compare.explanation, /pas à l'année entière/);
  // Another calendar (a year starting in October) is followed as configured, never a hardcoded September.
  const other = [{ label: "X", starts_on: "2026-10-12", ends_on: "2027-07-31", status: "current" }];
  assert.equal(parsePeriod({ periode: "annee" }, TODAY, other).period.from, "2026-10-12");
});

test("without a configured year, the year presets fall back with a reason", () => {
  const r = parsePeriod({ periode: "annee" }, TODAY, []);
  assert.equal(r.ok, false);
  assert.match(r.message, /Aucune année universitaire en cours/);
  assert.equal(r.fallback.days, 30);
  const p = parsePeriod({ periode: "annee-precedente" }, TODAY, []);
  assert.equal(p.ok, false);
});

test("the previous academic year is shown whole and compared with the one before", () => {
  const p = parsePeriod({ periode: "annee-precedente" }, TODAY, YEARS).period;
  assert.deepEqual([p.from, p.to, p.compare.from, p.compare.to], ["2025-09-01", "2026-08-31", "2024-09-01", "2025-08-31"]);
  assert.equal(p.granularity, "month");
});

test("custom ranges are validated: order, first day, two years, future", () => {
  const ok = parsePeriod({ du: "2026-10-01", au: "2026-10-31" }, TODAY, YEARS);
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.period.compare.from, ok.period.compare.to], ["2026-08-31", "2026-09-30"]);
  for (const [du, au] of [
    ["2026-10-31", "2026-10-01"],
    ["2019-12-31", "2020-01-31"],
    ["2020-01-01", "2026-01-01"],
    ["2026-10-01", "2028-01-01"],
    ["2026-10-01", "nope"],
    ["2026-02-30", "2026-03-01"],
  ]) {
    const r = parsePeriod({ du, au }, TODAY, YEARS);
    assert.equal(r.ok, false, `${du} → ${au}`);
    assert.equal(r.fallback.days, 30);
  }
  // A comparison that would start before the first day is dropped, not invented.
  const early = parsePeriod({ du: "2020-01-01", au: "2020-03-01" }, TODAY, YEARS).period;
  assert.equal(early.compare, null);
  assert.equal(parsePeriod({ periode: "tout" }, TODAY, YEARS).ok, false);
});

test("buckets: days, Monday weeks cut at the edges, calendar months", () => {
  assert.equal(granularityFor(31), "day");
  assert.equal(granularityFor(32), "week");
  assert.equal(granularityFor(121), "month");
  const days = buckets({ from: "2026-10-24", to: "2026-10-26" }, "day");
  assert.deepEqual(days.map((b) => b.key), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  const weeks = buckets({ from: "2026-10-01", to: "2026-10-31" }, "week");
  assert.equal(weeks[0].key, "2026-09-28"); // the Monday before 1 October
  assert.equal(weeks[0].from, "2026-10-01");
  assert.equal(weeks[0].partial, true);
  assert.equal(weeks.at(-1).to, "2026-10-31");
  const months = buckets({ from: "2025-09-15", to: "2026-02-10" }, "month");
  assert.deepEqual(months.map((b) => b.key), ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(months[0].partial, true);
  assert.equal(months[1].partial, false);
});

test("daily rows are summed into buckets and totals by metric and dimension", () => {
  const rows = [
    ["2026-10-01", "posts.published", "article", 2],
    ["2026-10-02", "posts.published", "breve", 1],
    ["2026-10-09", "posts.published", "article", 3],
    ["2026-10-09", "events.held", "", 4],
  ];
  const weeks = buckets({ from: "2026-10-01", to: "2026-10-14" }, "week");
  assert.deepEqual(bucketSeries(rows, "posts.published", weeks), [3, 3, 0]);
  assert.deepEqual(bucketSeries(rows, "posts.published", weeks, ["article"]), [2, 3, 0]);
  const totals = { "posts.published:article": 5, "posts.published:breve": 1, "events.held:": 4 };
  assert.equal(total(totals, "posts.published"), 6);
  assert.equal(total(totals, "posts.published", ["breve"]), 1);
  assert.equal(total(totals, "events.held"), 4);
  assert.equal(total(totals, "applications.submitted"), 0);
  assert.equal(total(null, "posts.published"), null);
});

/* ---- Changes and rates ----------------------------------------------------------------------------------- */

test("changes: +20 %, new activity instead of infinity, nothing when a side is missing", () => {
  const up = change(120, 100);
  assert.equal(up.kind, "up");
  assert.equal(formatPctChange(up.pct), "+20 %");
  assert.equal(change(80, 100).kind, "down");
  assert.equal(formatPctChange(change(95, 100).pct), "−5 %");
  assert.deepEqual(change(5, 0), { kind: "new", delta: 5 });
  assert.equal(describeChange(change(5, 0), 0), "Nouvelle activité (0 avant)");
  assert.equal(change(0, 0).kind, "same_zero");
  assert.equal(change(7, 7).kind, "flat");
  assert.equal(change(null, 3).kind, "none");
  assert.equal(change(3, undefined).kind, "none");
  for (const c of [change(5, 0), change(0, 0), change(1, 3)]) {
    assert.doesNotMatch(describeChange(c, 3) ?? "", /Infinity|NaN/);
  }
});

test("rates: no rate over zero, never rounded to 0 % or 100 % when it is not", () => {
  assert.equal(rate(0, 0), null);
  assert.equal(rate(3, 0), null);
  assert.equal(rate(null, 4), null);
  assert.equal(formatRate(rate(0, 0)), "—");
  assert.equal(formatRate(rate(1, 4)), "25 %");
  assert.equal(formatRate(rate(1, 400)), "< 1 %");
  assert.equal(formatRate(rate(399, 400)), "> 99 %");
  assert.equal(formatRate(rate(4, 4)), "100 %");
  assert.equal(formatRate(rate(0, 4)), "0 %");
});

/* ---- CSV ------------------------------------------------------------------------------------------------- */

const ORG = {
  organization: { id: "00000000-0000-0000-0000-000000000001", slug: "exemple-finance", name: "Finance (exemple)", kind: "association" },
  period: { from: "2026-10-05", to: "2026-11-03" },
  compare_period: { from: "2026-09-05", to: "2026-10-04" },
  rights: { overview: true, content: false, events: true, recruitment: true, workflow: false, team: false, export: true },
  min_group_size: 5,
  freshness: { data_through: "2026-11-03T09:25:00Z", stale: false, last_failed_at: null, last_status: "succeeded", differences: 0, reconciled_from: null, reconciled_to: null },
  totals: { "posts.published:article": 2, "events.held:": 1, "registrations.created:": 65, "applications.submitted:": 3 },
  compare: { "registrations.created:": 50 },
  sections: {
    overview: { posts_online: 4, events_upcoming: 1, campaigns_open: 1, registrations_upcoming: 50, insights: { approvals_waiting: 0, approvals_waiting_since: null, schedules_failed: 0, events_near_capacity: 1, campaigns_closing_week: 0 } },
    events: {
      upcoming: 1,
      waiting_now: 7,
      series: [],
      by_category: [],
      list: [
        { id: "e1", slug: "gala", title: "=HYPERLINK(\"http://x.example.test\")", starts_at: "2026-11-20T19:00:00Z", ends_at: "2026-11-20T23:00:00Z", series_key: null, state: "upcoming", mode: "internal", capacity: 50, confirmed: 50, waitlisted: 7, cancelled: 8, created: 65, promoted: 8, utilization: 1 },
        { id: "e2", slug: "conf", title: "Conférence (exemple)", starts_at: "2026-11-21T19:00:00Z", ends_at: "2026-11-21T21:00:00Z", series_key: null, state: "upcoming", mode: "internal", capacity: null, confirmed: 12, waitlisted: 0, cancelled: 0, created: 12, promoted: 0, utilization: null },
      ],
    },
    recruitment: {
      candidates: 3,
      series: [],
      campaigns: [
        {
          id: "c1", slug: "bureau", title: "Bureau (exemple)", state: "open", opens_at: "2026-10-01T08:00:00Z", closes_at: "2026-11-30T22:00:00Z",
          required_reviews: 2, positions: 2, started: 4, submitted: 3, withdrawn: 0, candidates: 3,
          by_position: [{ title: "Trésorerie", submitted: 2 }, { title: "Communication", submitted: 1 }],
          small_group: true, reviewed: null, shortlisted: null, interviewed: null, outcomes: null, offers: null,
        },
      ],
    },
  },
};

test("the CSV holds only the chosen and readable sections, hidden values as hidden, formulas neutralised", () => {
  const csv = organizationCsv(ORG, ["overview", "events", "recruitment"], new Date("2026-11-03T10:00:00Z"));
  assert.ok(csv.startsWith("﻿"), "UTF-8 with BOM");
  // The event title typed as a formula stays text.
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x.example.test"")`), "formula neutralised");
  assert.ok(!/;"=/.test(csv), "no cell starts with =");
  // A campaign under the threshold: its later stages are written hidden, never 0.
  const rows = organizationRows(ORG, ["recruitment"]);
  const reviewed = rows.find((r) => r[1] === "Relues (au moins une évaluation)");
  assert.equal(reviewed[3], "masqué");
  assert.equal(reviewed[7], "moins de 5 candidatures envoyées");
  const outcomes = rows.find((r) => String(r[1]).startsWith("Décisions annoncées"));
  assert.equal(outcomes[3], "masqué");
  // Rates as percentages, "no capacity" as not applicable rather than hidden.
  const utilization = organizationRows(ORG, ["events"]).filter((r) => String(r[1]).startsWith("Remplissage"));
  assert.equal(utilization[0][3], 100);
  assert.equal(utilization[1][3], "");
  // Comparison values travel with their figure.
  const regs = organizationRows(ORG, ["events"]).find((r) => r[1] === "Inscriptions faites");
  assert.deepEqual([regs[3], regs[4]], [65, 50]);
  // Nothing about a person: no e-mail address, no reviewer, no candidate name.
  assert.doesNotMatch(csv, /@|évaluateur|candidate_id/);
});

test("sections the request does not know, or the person cannot read, are dropped", () => {
  assert.deepEqual(pickSections(["events", "admin", "events", "overview"], ORGANIZATION_SECTIONS), ["overview", "events"]);
  assert.deepEqual(pickSections("team", ORGANIZATION_SECTIONS), ["team"]);
  assert.deepEqual(pickSections(undefined, ORGANIZATION_SECTIONS), []);
  // A section absent from the database answer gives no row, whatever was asked.
  assert.equal(organizationRows(ORG, ["content", "team", "workflow"]).length, 0);
});

test("the platform CSV never writes a campus-wide recruitment total under the threshold", () => {
  const p = {
    period: ORG.period,
    compare_period: null,
    rights: { view: true, configure: false, governance: false, messages: false, export: true },
    min_group_size: 5,
    freshness: ORG.freshness,
    totals: {},
    suppressed_totals: ["applications.submitted:"],
    compare: null,
    sections: {
      recruitment: {
        campaigns_open: 1, campaigns_published: 1, positions_open: 2,
        submitted_by_month: [["2026-10", null]],
        by_association: { total: null, cells: { "Finance (exemple)": null }, suppressed: ["Finance (exemple)"], reason: "small_group" },
        outcomes: { total: 0, cells: { offer: 0, reject: 0, waitlist: 0 }, suppressed: [], reason: null },
        offers: { total: 0, cells: { accepted: 0, declined: 0 }, suppressed: [], reason: null },
      },
    },
  };
  const rows = platformRows(p, ["recruitment"]);
  const submitted = rows.find((r) => r[1] === "Candidatures envoyées");
  assert.equal(submitted[3], "masqué");
  const month = rows.find((r) => r[1] === "Candidatures envoyées par mois");
  assert.equal(month[3], "masqué");
  const byAsso = rows.find((r) => String(r[1]).startsWith("Candidatures envoyées par asso"));
  assert.equal(byAsso[3], "masqué");
});

test("file names are clean", () => {
  assert.equal(analyticsFileName("exemple-finance", ORG.period), "statistiques-exemple-finance-2026-10-05-2026-11-03.csv");
  assert.equal(analyticsFileName("../../etc", ORG.period), "statistiques-etc-2026-10-05-2026-11-03.csv");
});
